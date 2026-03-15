/**
 * Aura — P2P Transfer Engine (Mega-File Optimized)
 * 
 * Handles peer-to-peer file and message transfer via WebRTC Data Channels.
 * 
 * Mega-file optimizations:
 * - 16MB backpressure threshold on bufferedAmount
 * - bufferedAmountLow event-driven flow control (no polling)
 * - SCTP maxMessageSize negotiation via SDP
 * - Screen Wake Lock for mobile reliability
 * - Google STUN servers for NAT traversal
 * - StreamURL support for Service Worker downloads
 */

class Peer {

    constructor(serverConnection, peerId) {
        this._server = serverConnection;
        this._peerId = peerId;
        this._filesQueue = [];
        this._busy = false;
    }

    sendJSON(message) {
        this._send(JSON.stringify(message));
    }

    sendFiles(files) {
        for (let i = 0; i < files.length; i++) {
            this._filesQueue.push(files[i]);
        }
        if (this._busy) return;
        this._dequeueFile();
    }

    _dequeueFile() {
        if (!this._filesQueue.length) {
            this._releaseWakeLock();
            return;
        }
        this._busy = true;
        this._acquireWakeLock();
        
        // 1-second "Ping" Heartbeat to prevent iOS WebSocket Sleep
        clearInterval(this._transferPing);
        this._transferPing = setInterval(() => {
            if (this._server) this._server.send({ type: 'ping' });
        }, 1000);

        const file = this._filesQueue.shift();
        this._sendFile(file);
    }

    _sendFile(file) {
        this.sendJSON({
            type: 'header',
            name: file.name,
            mime: file.type || 'application/octet-stream',
            size: file.size
        });
        this._chunker = new FileChunker(file,
            chunk => this._send(chunk),
            offset => this._onPartitionEnd(offset));
        this._chunker.nextPartition();
    }

    _onPartitionEnd(offset) {
        this.sendJSON({ type: 'partition', offset: offset });
    }

    _onReceivedPartitionEnd(offset) {
        this.sendJSON({ type: 'partition-received', offset: offset });
    }

    _sendNextPartition() {
        if (!this._chunker || this._chunker.isFileEnd()) return;
        this._chunker.nextPartition();
    }

    _sendProgress(progress) {
        this.sendJSON({ type: 'progress', progress: progress });
    }

    _onMessage(message) {
        if (typeof message !== 'string') {
            this._onChunkReceived(message);
            return;
        }
        message = JSON.parse(message);
        switch (message.type) {
            case 'header':
                this._onFileHeader(message);
                break;
            case 'partition':
                this._onReceivedPartitionEnd(message);
                break;
            case 'partition-received':
                this._sendNextPartition();
                break;
            case 'progress':
                this._onDownloadProgress(message.progress);
                break;
            case 'transfer-complete':
                this._onTransferCompleted();
                break;
            case 'text':
                this._onTextReceived(message);
                break;
        }
    }

    _onFileHeader(header) {
        this._lastProgress = 0;
        this._acquireWakeLock();

        clearInterval(this._transferPing);
        this._transferPing = setInterval(() => {
            if (this._server) this._server.send({ type: 'ping' });
        }, 1000);

        this._digester = new FileDigester({
            name: header.name,
            mime: header.mime,
            size: header.size
        }, file => this._onFileReceived(file));
    }

    _onChunkReceived(chunk) {
        if (!chunk.byteLength) return;
        this._digester.unchunk(chunk);
        const progress = this._digester.progress;

        // Force UI updates / UI renders ONLY 10 times during the entire transfer (10% increments)
        // This removes unnecessary logging/UI updates that block the main thread and kill SCTP speed.
        if (progress - this._lastProgress < 0.1 && progress < 1) return;
        this._lastProgress = progress;
        this._onDownloadProgress(progress);
        this._sendProgress(progress);
    }

    _onDownloadProgress(progress) {
        Events.fire('file-progress', { sender: this._peerId, progress: progress });
    }

    _onFileReceived(proxyFile) {
        // File fully assembled (blob or stream URL ready)
        Events.fire('file-received', proxyFile);
        this.sendJSON({ type: 'transfer-complete' });
        this._releaseWakeLock();
    }

    _onTransferCompleted() {
        this._onDownloadProgress(1);
        this._reader = null;
        this._busy = false;
        clearInterval(this._transferPing);
        this._dequeueFile();
        Events.fire('notify-user', 'File transfer completed.');
    }

    sendText(text) {
        const unescaped = btoa(unescape(encodeURIComponent(text)));
        this.sendJSON({ type: 'text', text: unescaped });
    }

    _onTextReceived(message) {
        const escaped = decodeURIComponent(escape(atob(message.text)));
        Events.fire('text-received', { text: escaped, sender: this._peerId });
    }

    // ─── Screen Wake Lock (prevents mobile CPU throttling) ───

    async _acquireWakeLock() {
        if (this._wakeLock) return;
        try {
            if ('wakeLock' in navigator) {
                this._wakeLock = await navigator.wakeLock.request('screen');
                this._wakeLock.addEventListener('release', () => {
                    this._wakeLock = null;
                });
                console.log('Aura: Wake Lock acquired');
            }
        } catch (e) {
            console.warn('Aura: Wake Lock not available:', e.message);
        }
    }

    _releaseWakeLock() {
        if (this._wakeLock) {
            this._wakeLock.release();
            this._wakeLock = null;
            console.log('Aura: Wake Lock released');
        }
    }
}

// ═══════════════════════════════════════
//  RTCPeer — WebRTC Data Channel Engine
//  Mega-file optimized with 16MB
//  backpressure and SCTP tuning.
// ═══════════════════════════════════════

class RTCPeer extends Peer {

    constructor(serverConnection, peerId) {
        super(serverConnection, peerId);
        if (!peerId) return;
        this._connect(peerId, true);
    }

    _connect(peerId, isCaller) {
        if (!this._conn) this._openConnection(peerId, isCaller);
        if (isCaller) {
            this._openChannel();
        } else {
            this._conn.ondatachannel = e => this._onChannelOpened(e);
        }
    }

    _openConnection(peerId, isCaller) {
        this._isCaller = isCaller;
        this._peerId = peerId;
        this._conn = new RTCPeerConnection(RTCPeer.config);
        this._conn.onicecandidate = e => this._onIceCandidate(e);
        this._conn.onconnectionstatechange = e => this._onConnectionStateChange(e);
        this._conn.oniceconnectionstatechange = e => this._onIceConnectionStateChange(e);
    }

    _openChannel() {
        // Disable Ordered Delivery: stops browser from pausing transfer to re-order packets.
        // We handle the ordering manually using 8-byte offset headers and OPFS.
        const channel = this._conn.createDataChannel('aura-data-channel', {
            ordered: false
        });
        channel.binaryType = 'arraybuffer';

        // 16MB backpressure threshold — when buffer drops below this,
        // the bufferedamountlow event fires and we resume sending.
        channel.bufferedAmountLowThreshold = 1 * 1024 * 1024; // 1 MB
        channel.onopen = e => this._onChannelOpened(e);
        this._conn.createOffer().then(d => this._onDescription(d)).catch(e => this._onError(e));
    }

    _onDescription(description) {
        // ─── SCTP Throughput: Increase maxMessageSize ───
        // Modify the SDP to request the maximum SCTP message size
        // supported by the browser. This reduces overhead for large transfers.
        if (description.sdp) {
            description = new RTCSessionDescription({
                type: description.type,
                sdp: this._patchSctpMaxMessageSize(description.sdp)
            });
        }

        this._conn.setLocalDescription(description)
            .then(_ => this._sendSignal({ sdp: description }))
            .catch(e => this._onError(e));
    }

    /**
     * Patches the SDP to set max-message-size to 256KB.
     * The default is often 64KB or even 16KB depending on the browser.
     * Setting this higher reduces the SCTP framing overhead per message.
     */
    _patchSctpMaxMessageSize(sdp) {
        // Look for the SCTP max-message-size line and increase it
        const maxSize = 262144; // 256 KB
        if (sdp.includes('max-message-size')) {
            return sdp.replace(
                /max-message-size:\s*\d+/g,
                `max-message-size:${maxSize}`
            );
        }
        // If no max-message-size line exists, add one after sctpmap
        if (sdp.includes('a=sctpmap') || sdp.includes('a=sctp-port')) {
            return sdp.replace(
                /(a=sctp-port:\d+)/,
                `$1\r\na=max-message-size:${maxSize}`
            );
        }
        return sdp;
    }

    _onIceCandidate(event) {
        if (!event.candidate) return;
        this._sendSignal({ ice: event.candidate });
    }

    onServerMessage(message) {
        if (!this._conn) this._connect(message.sender, false);

        if (message.sdp) {
            this._conn.setRemoteDescription(new RTCSessionDescription(message.sdp))
                .then(_ => {
                    if (message.sdp.type === 'offer') {
                        return this._conn.createAnswer()
                            .then(d => this._onDescription(d));
                    }
                })
                .catch(e => this._onError(e));
        } else if (message.ice) {
            this._conn.addIceCandidate(new RTCIceCandidate(message.ice));
        }
    }

    _onChannelOpened(event) {
        console.log('Aura P2P: channel opened with', this._peerId);
        const channel = event.channel || event.target;
        channel.binaryType = 'arraybuffer';
        channel.bufferedAmountLowThreshold = 1 * 1024 * 1024; // 1 MB

        // Log the negotiated SCTP maxMessageSize
        if (this._conn.sctp) {
            console.log('Aura SCTP maxMessageSize:',
                this._conn.sctp.maxMessageSize, 'bytes');
        }

        channel.onmessage = e => this._onMessage(e.data);
        channel.onclose = e => this._onChannelClosed();
        this._channel = channel;
        Events.fire('p2p-connected', { peerId: this._peerId, method: 'lan' });
    }

    _onChannelClosed() {
        console.log('Aura P2P: channel closed', this._peerId);
        if (!this._isCaller) return;
        this._connect(this._peerId, true);
    }

    _onConnectionStateChange(e) {
        console.log('Aura P2P: state changed:', this._conn.connectionState);
        switch (this._conn.connectionState) {
            case 'disconnected':
                this._onChannelClosed();
                break;
            case 'failed':
                this._conn = null;
                this._onChannelClosed();
                break;
        }
    }

    _onIceConnectionStateChange() {
        switch (this._conn.iceConnectionState) {
            case 'failed':
                console.error('Aura: ICE Gathering failed — restarting');
                this._conn.restartIce();
                break;
            default:
                console.log('Aura ICE:', this._conn.iceConnectionState);
        }
    }

    _onError(error) {
        console.error('Aura P2P Error:', error);
    }

    /**
     * ─── Controlled Backpressure (16MB threshold) ───
     * 
     * This is THE critical path for mega-file transfers.
     * 
     * If the data channel's send buffer exceeds 16MB, we PAUSE
     * the stream and wait for the browser's internal buffer to
     * drain. When it drops below the bufferedAmountLowThreshold (1MB),
     * the bufferedamountlow event fires and we resume.
     * 
     * This prevents:
     * - Memory overflow on 5GB+ transfers
     * - Browser tab crashes
     * - Congestion collapse (data sent faster than network can handle)
     */
    _send(message) {
        if (!this._channel) return this.refresh();

        const BACKPRESSURE_THRESHOLD = 32 * 1024 * 1024; // 32 MB

        if (this._channel.bufferedAmount > BACKPRESSURE_THRESHOLD) {
            // PAUSE: buffer is full, wait for drain
            this._channel.onbufferedamountlow = () => {
                this._channel.onbufferedamountlow = null;
                this._channel.send(message);
            };
            return;
        }
        this._channel.send(message);
    }

    _sendSignal(signal) {
        signal.type = 'signal';
        signal.to = this._peerId;
        this._server.send(signal);
    }

    refresh() {
        if (this._isConnected() || this._isConnecting()) return;
        this._connect(this._peerId, this._isCaller);
    }

    _isConnected() {
        return this._channel && this._channel.readyState === 'open';
    }

    _isConnecting() {
        return this._channel && this._channel.readyState === 'connecting';
    }
}

class PeersManager {

    constructor(serverConnection) {
        this.peers = {};
        this._server = serverConnection;
        Events.on('signal', e => this._onMessage(e.detail));
        Events.on('peers', e => this._onPeers(e.detail));
        Events.on('files-selected', e => this._onFilesSelected(e.detail));
        Events.on('send-text', e => this._onSendText(e.detail));
        Events.on('peer-left', e => this._onPeerLeft(e.detail));
    }

    _onMessage(message) {
        if (!this.peers[message.sender]) {
            this.peers[message.sender] = new RTCPeer(this._server);
        }
        this.peers[message.sender].onServerMessage(message);
    }

    _onPeers(peers) {
        peers.forEach(peer => {
            if (this.peers[peer.id]) {
                this.peers[peer.id].refresh();
                return;
            }
            if (window.isRtcSupported && peer.rtcSupported) {
                this.peers[peer.id] = new RTCPeer(this._server, peer.id);
            } else {
                this.peers[peer.id] = new WSPeer(this._server, peer.id);
            }
        });
    }

    sendTo(peerId, message) {
        this.peers[peerId].send(message);
    }

    _onFilesSelected(message) {
        this.peers[message.to].sendFiles(message.files);
    }

    _onSendText(message) {
        this.peers[message.to].sendText(message.text);
    }

    _onPeerLeft(peerId) {
        const peer = this.peers[peerId];
        delete this.peers[peerId];
        if (!peer || !peer._conn) return;
        peer._conn.close();
    }
}

class WSPeer extends Peer {
    _send(message) {
        message.to = this._peerId;
        this._server.send(message);
    }
}

/**
 * ICE Configuration — Production
 * Uses Google STUN servers for NAT traversal.
 */
RTCPeer.config = {
    'sdpSemantics': 'unified-plan',
    'iceServers': [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' }
    ]
};

window.Peer = Peer;
window.RTCPeer = RTCPeer;
window.PeersManager = PeersManager;
window.WSPeer = WSPeer;
