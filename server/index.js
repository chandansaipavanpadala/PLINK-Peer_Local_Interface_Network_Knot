var process = require('process');

// Handle SIGINT
process.on('SIGINT', () => {
    console.info("SIGINT Received, exiting...");
    process.exit(0);
});

// Handle SIGTERM
process.on('SIGTERM', () => {
    console.info("SIGTERM Received, exiting...");
    process.exit(0);
});

const parser = require('ua-parser-js');
const { uniqueNamesGenerator, animals, colors } = require('unique-names-generator');

/**
 * Aura — Local Signaling Server
 * 
 * This server handles ONLY WebRTC signaling on the local network.
 * NO file data passes through this server — all transfers are direct P2P.
 * NO data is sent to the internet.
 */
class AuraServer {

    constructor(port) {
        const WebSocket = require('ws');
        this._wss = new WebSocket.Server({ port: port });
        this._wss.on('connection', (socket, request) => this._onConnection(new Peer(socket, request)));
        this._wss.on('headers', (headers, response) => this._onHeaders(headers, response));

        this._rooms = {};

        console.log(`
╔══════════════════════════════════════╗
║           AURA SERVER                ║
║   Local P2P Signaling Active         ║
║   Port: ${String(port).padEnd(28)}║
║   Zero Cloud • Pure Privacy          ║
╚══════════════════════════════════════╝
        `);
    }

    _onConnection(peer) {
        this._joinRoom(peer);
        peer.socket.on('message', message => this._onMessage(peer, message));
        peer.socket.on('error', console.error);
        this._keepAlive(peer);

        // send displayName
        this._send(peer, {
            type: 'display-name',
            message: {
                displayName: peer.name.displayName,
                deviceName: peer.name.deviceName
            }
        });
    }

    _onHeaders(headers, response) {
        if (response.headers.cookie && response.headers.cookie.indexOf('peerid=') > -1) return;
        response.peerId = Peer.uuid();
        headers.push('Set-Cookie: peerid=' + response.peerId + "; SameSite=Strict; Secure");
    }

    _onMessage(sender, message) {
        try {
            message = JSON.parse(message);
        } catch (e) {
            return;
        }

        switch (message.type) {
            case 'disconnect':
                this._leaveRoom(sender);
                break;
            case 'pong':
                sender.lastBeat = Date.now();
                break;
        }

        // relay message to recipient
        if (message.to && this._rooms[sender.ip]) {
            const recipientId = message.to;
            const recipient = this._rooms[sender.ip][recipientId];
            delete message.to;
            message.sender = sender.id;
            this._send(recipient, message);
            return;
        }
    }

    _joinRoom(peer) {
        if (!this._rooms[peer.ip]) {
            this._rooms[peer.ip] = {};
        }

        // notify all other peers
        for (const otherPeerId in this._rooms[peer.ip]) {
            const otherPeer = this._rooms[peer.ip][otherPeerId];
            this._send(otherPeer, {
                type: 'peer-joined',
                peer: peer.getInfo()
            });
        }

        // notify peer about the other peers
        const otherPeers = [];
        for (const otherPeerId in this._rooms[peer.ip]) {
            otherPeers.push(this._rooms[peer.ip][otherPeerId].getInfo());
        }

        this._send(peer, {
            type: 'peers',
            peers: otherPeers
        });

        // add peer to room
        this._rooms[peer.ip][peer.id] = peer;
    }

    _leaveRoom(peer) {
        if (!this._rooms[peer.ip] || !this._rooms[peer.ip][peer.id]) return;
        this._cancelKeepAlive(this._rooms[peer.ip][peer.id]);

        delete this._rooms[peer.ip][peer.id];

        peer.socket.terminate();
        if (!Object.keys(this._rooms[peer.ip]).length) {
            delete this._rooms[peer.ip];
        } else {
            for (const otherPeerId in this._rooms[peer.ip]) {
                const otherPeer = this._rooms[peer.ip][otherPeerId];
                this._send(otherPeer, { type: 'peer-left', peerId: peer.id });
            }
        }
    }

    _send(peer, message) {
        if (!peer) return;
        if (this._wss.readyState !== this._wss.OPEN) return;
        message = JSON.stringify(message);
        peer.socket.send(message, error => '');
    }

    _keepAlive(peer) {
        this._cancelKeepAlive(peer);
        var timeout = 30000;
        if (!peer.lastBeat) {
            peer.lastBeat = Date.now();
        }
        if (Date.now() - peer.lastBeat > 2 * timeout) {
            this._leaveRoom(peer);
            return;
        }

        this._send(peer, { type: 'ping' });
        peer.timerId = setTimeout(() => this._keepAlive(peer), timeout);
    }

    _cancelKeepAlive(peer) {
        if (peer && peer.timerId) {
            clearTimeout(peer.timerId);
        }
    }
}

class Peer {

    constructor(socket, request) {
        this.socket = socket;
        this._setIP(request);
        this._setPeerId(request);
        this.rtcSupported = request.url.indexOf('webrtc') > -1;
        this._setName(request);
        this.timerId = 0;
        this.lastBeat = Date.now();
    }

    _setIP(request) {
        if (request.headers['x-forwarded-for']) {
            this.ip = request.headers['x-forwarded-for'].split(/\s*,\s*/)[0];
        } else {
            this.ip = request.connection.remoteAddress;
        }
        if (this.ip == '::1' || this.ip == '::ffff:127.0.0.1') {
            this.ip = '127.0.0.1';
        }
    }

    _setPeerId(request) {
        if (request.peerId) {
            this.id = request.peerId;
        } else {
            this.id = request.headers.cookie.replace('peerid=', '');
        }
    }

    toString() {
        return `<Peer id=${this.id} ip=${this.ip} rtcSupported=${this.rtcSupported}>`;
    }

    _setName(req) {
        let ua = parser(req.headers['user-agent']);

        let deviceName = '';

        if (ua.os && ua.os.name) {
            deviceName = ua.os.name.replace('Mac OS', 'Mac') + ' ';
        }

        if (ua.device.model) {
            deviceName += ua.device.model;
        } else {
            deviceName += ua.browser.name;
        }

        if (!deviceName) deviceName = 'Unknown Device';

        const displayName = uniqueNamesGenerator({
            length: 2,
            separator: ' ',
            dictionaries: [colors, animals],
            style: 'capital',
            seed: this.id.hashCode()
        });

        this.name = {
            model: ua.device.model,
            os: ua.os.name,
            browser: ua.browser.name,
            type: ua.device.type,
            deviceName,
            displayName
        };
    }

    getInfo() {
        return {
            id: this.id,
            name: this.name,
            rtcSupported: this.rtcSupported
        };
    }

    static uuid() {
        let uuid = '', ii;
        for (ii = 0; ii < 32; ii += 1) {
            switch (ii) {
                case 8:
                case 20:
                    uuid += '-';
                    uuid += (Math.random() * 16 | 0).toString(16);
                    break;
                case 12:
                    uuid += '-';
                    uuid += '4';
                    break;
                case 16:
                    uuid += '-';
                    uuid += (Math.random() * 4 | 8).toString(16);
                    break;
                default:
                    uuid += (Math.random() * 16 | 0).toString(16);
            }
        }
        return uuid;
    }
}

Object.defineProperty(String.prototype, 'hashCode', {
    value: function () {
        var hash = 0, i, chr;
        for (i = 0; i < this.length; i++) {
            chr = this.charCodeAt(i);
            hash = ((hash << 5) - hash) + chr;
            hash |= 0;
        }
        return hash;
    }
});

const server = new AuraServer(process.env.PORT || 3000);
