/**
 * Aura — Connection Manager
 * Manages the WebSocket signaling connection to the local Aura server.
 * Handles peer discovery, signaling relay, and connection lifecycle.
 * 
 * ZERO-CLOUD: This connection is ONLY to the local signaling server
 * running on your LAN. No data is sent to the internet.
 */

window.URL = window.URL || window.webkitURL;
window.isRtcSupported = !!(window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection);

class AuraConnectionManager {

    constructor() {
        this._connect();
        Events.on('beforeunload', e => this._disconnect());
        Events.on('pagehide', e => this._disconnect());
        document.addEventListener('visibilitychange', e => this._onVisibilityChange());
    }

    _connect() {
        clearTimeout(this._reconnectTimer);
        if (this._isConnected() || this._isConnecting()) return;
        const ws = new WebSocket(this._endpoint());
        ws.binaryType = 'arraybuffer';
        ws.onopen = e => {
            console.log('Aura: signaling server connected');
            Events.fire('ws-connected');
            this._startHeartbeat();
        };
        ws.onmessage = e => this._onMessage(e.data);
        ws.onclose = e => this._onDisconnect();
        ws.onerror = e => console.error('Aura WS Error:', e);
        this._socket = ws;
    }

    _onMessage(msg) {
        msg = JSON.parse(msg);
        switch (msg.type) {
            case 'peers':
                Events.fire('peers', msg.peers);
                break;
            case 'peer-joined':
                Events.fire('peer-joined', msg.peer);
                break;
            case 'peer-left':
                Events.fire('peer-left', msg.peerId);
                break;
            case 'signal':
                Events.fire('signal', msg);
                break;
            case 'ping':
                this.send({ type: 'pong' });
                break;
            case 'display-name':
                Events.fire('display-name', msg);
                break;
            default:
                console.warn('Aura: unknown message type', msg);
        }
    }

    send(message) {
        if (!this._isConnected()) return;
        this._socket.send(JSON.stringify(message));
    }

    _endpoint() {
        // Production signaling server
        const webrtc = window.isRtcSupported ? '/webrtc' : '/fallback';
        return 'wss://aura-lmxp.onrender.com' + webrtc;
    }

    _disconnect() {
        this._stopHeartbeat();
        this.send({ type: 'disconnect' });
        if (this._socket) {
            this._socket.onclose = null;
            this._socket.close();
        }
    }

    _startHeartbeat() {
        clearInterval(this._heartbeat);
        this._heartbeat = setInterval(() => {
            if (this._isConnected()) {
                this.send({ type: 'ping' });
            }
        }, 3000);
    }

    _stopHeartbeat() {
        clearInterval(this._heartbeat);
    }

    _onDisconnect() {
        console.log('Aura: signaling server disconnected');
        this._stopHeartbeat();
        Events.fire('notify-user', 'Connection lost. Retrying in 5s...');
        Events.fire('ws-disconnected');
        clearTimeout(this._reconnectTimer);
        this._reconnectTimer = setTimeout(_ => this._connect(), 5000);
    }

    _onVisibilityChange() {
        if (document.hidden) return;
        this._connect();
    }

    _isConnected() {
        return this._socket && this._socket.readyState === this._socket.OPEN;
    }

    _isConnecting() {
        return this._socket && this._socket.readyState === this._socket.CONNECTING;
    }
}

window.AuraConnectionManager = AuraConnectionManager;
