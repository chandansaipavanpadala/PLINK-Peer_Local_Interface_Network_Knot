/**
 * ═══════════════════════════════════════════════════════
 *  AURA — UI Components
 *  Engineering Futurist Interface
 *  Circuit-board background, Glassmorphic Node Cards,
 *  Radial progress rings, Data-stream transfer effects.
 * ═══════════════════════════════════════════════════════
 */

const $ = query => document.getElementById(query);
const $$ = query => document.body.querySelector(query);
const isURL = text => /^((https?:\/\/|www)[^\s]+)/g.test(text.toLowerCase());
window.isDownloadSupported = (typeof document.createElement('a').download !== 'undefined');
window.isProductionEnvironment = !window.location.host.startsWith('localhost');
window.iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

// Display name handler
Events.on('display-name', e => {
    const me = e.detail.message;
    const $displayName = $('displayName');
    $displayName.textContent = 'You are known as ' + me.displayName;
    $displayName.title = me.deviceName;
});

// ─────────────────────────────────────
//  Peers UI
// ─────────────────────────────────────

class PeersUI {

    constructor() {
        Events.on('peer-joined', e => this._onPeerJoined(e.detail));
        Events.on('peer-left', e => this._onPeerLeft(e.detail));
        Events.on('peers', e => this._onPeers(e.detail));
        Events.on('file-progress', e => this._onFileProgress(e.detail));
        Events.on('paste', e => this._onPaste(e));
    }

    _onPeerJoined(peer) {
        if ($(peer.id)) return;
        const peerUI = new PeerUI(peer);
        $$('x-peers').appendChild(peerUI.$el);
        setTimeout(e => window.animateBackground(false), 1750);
    }

    _onPeers(peers) {
        this._clearPeers();
        peers.forEach(peer => this._onPeerJoined(peer));
    }

    _onPeerLeft(peerId) {
        const $peer = $(peerId);
        if (!$peer) return;
        $peer.remove();
    }

    _onFileProgress(progress) {
        const peerId = progress.sender || progress.recipient;
        const $peer = $(peerId);
        if (!$peer) return;
        $peer.ui.setProgress(progress.progress);
    }

    _clearPeers() {
        $$('x-peers').innerHTML = '';
    }

    _onPaste(e) {
        const files = e.clipboardData.files || e.clipboardData.items
            .filter(i => i.type.indexOf('image') > -1)
            .map(i => i.getAsFile());
        const peers = document.querySelectorAll('x-peer');
        if (files.length > 0 && peers.length === 1) {
            Events.fire('files-selected', {
                files: files,
                to: $$('x-peer').id
            });
        }
    }
}

// ─────────────────────────────────────
//  Individual Peer UI — Glassmorphic Node Card
// ─────────────────────────────────────

class PeerUI {

    html() {
        // SVG progress ring:  radius=32, circumference = 2 * π * 32 ≈ 201
        return `
            <label class="column center" title="Click to send files or right click to send a message">
                <input type="file" multiple accept="*/*">
                <div class="icon-container">
                    <x-icon>
                        <svg class="icon"><use xlink:href="#"/></svg>
                    </x-icon>
                    <svg class="progress-ring" viewBox="0 0 72 72">
                        <circle class="ring-bg" cx="36" cy="36" r="32"/>
                        <circle class="ring-fill" cx="36" cy="36" r="32"/>
                    </svg>
                </div>
                <div class="card-info column center">
                    <div class="hostname"></div>
                    <div class="device-name font-body2"></div>
                    <div class="conn-badge wifi">
                        <span class="badge-dot"></span>
                        <span class="badge-label">Wi-Fi</span>
                    </div>
                    <div class="transfer-status"></div>
                </div>
            </label>`;
    }

    constructor(peer) {
        this._peer = peer;
        this._initDom();
        this._bindListeners(this.$el);
        this._connectionMethod = 'lan'; // default
        this._circumference = 2 * Math.PI * 32; // ≈ 201
    }

    _initDom() {
        const el = document.createElement('x-peer');
        el.id = this._peer.id;
        el.innerHTML = this.html();
        el.ui = this;
        el.querySelector('svg use').setAttribute('xlink:href', this._icon());
        el.querySelector('.hostname').textContent = this._displayName();
        el.querySelector('.device-name').textContent = this._deviceName();
        this.$el = el;
        this.$ringFill = el.querySelector('.ring-fill');
        this.$transferStatus = el.querySelector('.transfer-status');
        this.$connBadge = el.querySelector('.conn-badge');

        // Listen for connection type
        Events.on('p2p-connected', e => {
            if (e.detail.peerId === this._peer.id) {
                this._connectionMethod = e.detail.method;
                this._updateConnectionBadge();
            }
        });
    }

    _updateConnectionBadge() {
        const isBT = this._connectionMethod === 'bluetooth';
        this.$connBadge.className = `conn-badge ${isBT ? 'bluetooth' : 'wifi'}`;
        this.$connBadge.querySelector('.badge-label').textContent = isBT ? 'Bluetooth' : 'Wi-Fi';
    }

    _bindListeners(el) {
        el.querySelector('input').addEventListener('change', e => this._onFilesSelected(e));
        el.addEventListener('drop', e => this._onDrop(e));
        el.addEventListener('dragend', e => this._onDragEnd(e));
        el.addEventListener('dragleave', e => this._onDragEnd(e));
        el.addEventListener('dragover', e => this._onDragOver(e));
        el.addEventListener('contextmenu', e => this._onRightClick(e));
        el.addEventListener('touchstart', e => this._onTouchStart(e));
        el.addEventListener('touchend', e => this._onTouchEnd(e));
        Events.on('dragover', e => e.preventDefault());
        Events.on('drop', e => e.preventDefault());
    }

    _displayName() {
        return this._peer.name.displayName;
    }

    _deviceName() {
        return this._peer.name.deviceName;
    }

    _icon() {
        const device = this._peer.name.device || this._peer.name;
        if (device.type === 'mobile') return '#phone-iphone';
        if (device.type === 'tablet') return '#tablet-mac';
        return '#desktop-mac';
    }

    _onFilesSelected(e) {
        const $input = e.target;
        const files = $input.files;
        Events.fire('files-selected', {
            files: files,
            to: this._peer.id
        });
        $input.value = null;
    }

    setProgress(progress) {
        if (progress > 0) {
            this.$el.setAttribute('transfer', '1');
        }

        // Update radial progress ring
        const offset = this._circumference - (progress * this._circumference);
        this.$ringFill.style.strokeDashoffset = Math.max(0, offset);

        // Update transfer status text
        if (progress > 0 && progress < 1) {
            const pct = Math.round(progress * 100);
            this.$transferStatus.textContent = `${pct}%`;
        }

        if (progress >= 1) {
            // Transfer complete — reset
            this.$transferStatus.textContent = 'Complete';
            setTimeout(() => {
                this.$ringFill.style.strokeDashoffset = this._circumference;
                this.$transferStatus.textContent = '';
                this.$el.removeAttribute('transfer');
            }, 1200);
        }
    }

    _onDrop(e) {
        e.preventDefault();
        const files = e.dataTransfer.files;
        Events.fire('files-selected', {
            files: files,
            to: this._peer.id
        });
        this._onDragEnd();
    }

    _onDragOver() {
        this.$el.setAttribute('drop', 1);
    }

    _onDragEnd() {
        this.$el.removeAttribute('drop');
    }

    _onRightClick(e) {
        e.preventDefault();
        Events.fire('text-recipient', this._peer.id);
    }

    _onTouchStart(e) {
        this._touchStart = Date.now();
        this._touchTimer = setTimeout(_ => this._onTouchEnd(), 610);
    }

    _onTouchEnd(e) {
        if (Date.now() - this._touchStart < 500) {
            clearTimeout(this._touchTimer);
        } else {
            if (e) e.preventDefault();
            Events.fire('text-recipient', this._peer.id);
        }
    }
}

// ─────────────────────────────────────
//  Dialogs
// ─────────────────────────────────────

class Dialog {
    constructor(id) {
        this.$el = $(id);
        this.$el.querySelectorAll('[close]').forEach(el => el.addEventListener('click', e => this.hide()));
        this.$autoFocus = this.$el.querySelector('[autofocus]');
    }

    show() {
        this.$el.setAttribute('show', 1);
        if (this.$autoFocus) this.$autoFocus.focus();
    }

    hide() {
        this.$el.removeAttribute('show');
        if (document.activeElement) document.activeElement.blur();
        window.blur();
    }
}

class ReceiveDialog extends Dialog {

    constructor() {
        super('receiveDialog');
        Events.on('file-received', e => {
            this._nextFile(e.detail);
            window.blop.play();
        });
        this._filesQueue = [];
    }

    _nextFile(nextFile) {
        if (nextFile) this._filesQueue.push(nextFile);
        if (this._busy) return;
        this._busy = true;
        const file = this._filesQueue.shift();
        this._displayFile(file);
    }

    _dequeueFile() {
        if (!this._filesQueue.length) {
            this._busy = false;
            return;
        }
        setTimeout(_ => {
            this._busy = false;
            this._nextFile();
        }, 300);
    }

    _displayFile(file) {
        const $a = this.$el.querySelector('#download');

        // ─── Mega-file: use Service Worker stream URL ───
        // For 5GB+ files, the Digester provides a streamUrl instead of a blob.
        // This lets the browser download directly from the SW stream
        // without ever holding the full file in RAM.
        let url;
        if (file.streamUrl) {
            url = file.streamUrl;
        } else if (file.blob) {
            url = URL.createObjectURL(file.blob);
        } else {
            console.error('Aura: received file with no blob or streamUrl');
            return;
        }

        $a.href = url;
        $a.download = file.name;

        if (this._autoDownload()) {
            $a.click();
            return;
        }
        if (file.blob && file.mime.split('/')[0] === 'image') {
            this.$el.querySelector('.preview').style.visibility = 'inherit';
            this.$el.querySelector('#img-preview').src = url;
        }

        this.$el.querySelector('#fileName').textContent = file.name;
        this.$el.querySelector('#fileSize').textContent = this._formatFileSize(file.size);
        this.show();

        if (window.isDownloadSupported) return;
        // Fallback for browsers without download attribute
        $a.target = '_blank';
        if (file.blob) {
            const reader = new FileReader();
            reader.onload = e => $a.href = reader.result;
            reader.readAsDataURL(file.blob);
        }
    }

    _formatFileSize(bytes) {
        if (bytes >= 1e9) return (Math.round(bytes / 1e8) / 10) + ' GB';
        if (bytes >= 1e6) return (Math.round(bytes / 1e5) / 10) + ' MB';
        if (bytes > 1000) return Math.round(bytes / 1000) + ' KB';
        return bytes + ' Bytes';
    }

    hide() {
        this.$el.querySelector('.preview').style.visibility = 'hidden';
        this.$el.querySelector('#img-preview').src = '';
        super.hide();
        this._dequeueFile();
    }

    _autoDownload() {
        return !this.$el.querySelector('#autoDownload').checked;
    }
}

class SendTextDialog extends Dialog {
    constructor() {
        super('sendTextDialog');
        Events.on('text-recipient', e => this._onRecipient(e.detail));
        this.$text = this.$el.querySelector('#textInput');
        const button = this.$el.querySelector('form');
        button.addEventListener('submit', e => this._send(e));
    }

    _onRecipient(recipient) {
        this._recipient = recipient;
        this._handleShareTargetText();
        this.show();

        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(this.$text);
        sel.removeAllRanges();
        sel.addRange(range);
    }

    _handleShareTargetText() {
        if (!window.shareTargetText) return;
        this.$text.textContent = window.shareTargetText;
        window.shareTargetText = '';
    }

    _send(e) {
        e.preventDefault();
        Events.fire('send-text', {
            to: this._recipient,
            text: this.$text.innerText
        });
    }
}

class ReceiveTextDialog extends Dialog {
    constructor() {
        super('receiveTextDialog');
        Events.on('text-received', e => this._onText(e.detail));
        this.$text = this.$el.querySelector('#text');
        const $copy = this.$el.querySelector('#copy');
        $copy.addEventListener('click', _ => this._onCopy());
    }

    _onText(e) {
        this.$text.innerHTML = '';
        const text = e.text;
        if (isURL(text)) {
            const $a = document.createElement('a');
            $a.href = text;
            $a.target = '_blank';
            $a.textContent = text;
            this.$text.appendChild($a);
        } else {
            this.$text.textContent = text;
        }
        this.show();
        window.blop.play();
    }

    async _onCopy() {
        await navigator.clipboard.writeText(this.$text.textContent);
        Events.fire('notify-user', 'Copied to clipboard');
    }
}

// ─────────────────────────────────────
//  Toast Notifications
// ─────────────────────────────────────

class Toast extends Dialog {
    constructor() {
        super('toast');
        Events.on('notify-user', e => this._onNotify(e.detail));
    }

    _onNotify(message) {
        this.$el.textContent = message;
        this.show();
        setTimeout(_ => this.hide(), 3000);
    }
}

// ─────────────────────────────────────
//  System Notifications
// ─────────────────────────────────────

class Notifications {

    constructor() {
        if (!('Notification' in window)) return;

        if (Notification.permission !== 'granted') {
            this.$button = $('notification');
            this.$button.removeAttribute('hidden');
            this.$button.addEventListener('click', e => this._requestPermission());
        }
        Events.on('text-received', e => this._messageNotification(e.detail.text));
        Events.on('file-received', e => this._downloadNotification(e.detail.name));
    }

    _requestPermission() {
        Notification.requestPermission(permission => {
            if (permission !== 'granted') {
                Events.fire('notify-user', Notifications.PERMISSION_ERROR || 'Error');
                return;
            }
            this._notify('Aura is ready for sharing!');
            this.$button.setAttribute('hidden', 1);
        });
    }

    _notify(message, body) {
        const config = {
            body: body,
            icon: 'images/icon-192x192.png',
        };
        let notification;
        try {
            notification = new Notification(message, config);
        } catch (e) {
            if (!serviceWorker || !serviceWorker.showNotification) return;
            notification = serviceWorker.showNotification(message, config);
        }

        const visibilitychangeHandler = () => {
            if (document.visibilityState === 'visible') {
                notification.close();
                Events.off('visibilitychange', visibilitychangeHandler);
            }
        };
        Events.on('visibilitychange', visibilitychangeHandler);

        return notification;
    }

    _messageNotification(message) {
        if (document.visibilityState !== 'visible') {
            if (isURL(message)) {
                const notification = this._notify(message, 'Click to open link');
                this._bind(notification, e => window.open(message, '_blank', null, true));
            } else {
                const notification = this._notify(message, 'Click to copy text');
                this._bind(notification, e => this._copyText(message, notification));
            }
        }
    }

    _downloadNotification(message) {
        if (document.visibilityState !== 'visible') {
            const notification = this._notify(message, 'Click to download');
            if (!window.isDownloadSupported) return;
            this._bind(notification, e => this._download(notification));
        }
    }

    _download(notification) {
        document.querySelector('x-dialog [download]').click();
        notification.close();
    }

    _copyText(message, notification) {
        notification.close();
        if (!navigator.clipboard.writeText(message)) return;
        this._notify('Copied text to clipboard');
    }

    _bind(notification, handler) {
        if (notification.then) {
            notification.then(e => serviceWorker.getNotifications().then(notifications => {
                serviceWorker.addEventListener('notificationclick', handler);
            }));
        } else {
            notification.onclick = handler;
        }
    }
}

Notifications.PERMISSION_ERROR = `
Notifications permission has been blocked
as the user has dismissed the permission prompt several times.
This can be reset in Page Info
which can be accessed by clicking the lock icon next to the URL.`;

// ─────────────────────────────────────
//  Network Status — LOCAL MODE ACTIVE
// ─────────────────────────────────────

class NetworkStatusUI {

    constructor() {
        this.$badge = $('modeBadge');
        this.$label = $('modeLabel');

        window.addEventListener('offline', e => this._offline(), false);
        window.addEventListener('online', e => this._online(), false);
        if (!navigator.onLine) this._offline();
    }

    _offline() {
        if (this.$badge) {
            this.$badge.classList.add('offline');
            this.$label.textContent = 'OFFLINE — LOCAL ACTIVE';
        }
        Events.fire('notify-user', 'Offline — Local transfers still work!');
    }

    _online() {
        if (this.$badge) {
            this.$badge.classList.remove('offline');
            this.$label.textContent = 'LOCAL MODE ACTIVE';
        }
        Events.fire('notify-user', 'Back online');
    }
}

// ─────────────────────────────────────
//  Web Share Target
// ─────────────────────────────────────

class WebShareTargetUI {
    constructor() {
        const parsedUrl = new URL(window.location);
        const title = parsedUrl.searchParams.get('title');
        const text = parsedUrl.searchParams.get('text');
        const url = parsedUrl.searchParams.get('url');

        let shareTargetText = title ? title : '';
        shareTargetText += text ? shareTargetText ? ' ' + text : text : '';
        if (url) shareTargetText = url;

        if (!shareTargetText) return;
        window.shareTargetText = shareTargetText;
        history.pushState({}, 'URL Rewrite', '/');
        console.log('Aura Share Target:', '"' + shareTargetText + '"');
    }
}

// ─────────────────────────────────────
//  Main Application Bootstrap
// ─────────────────────────────────────

class Aura {
    constructor() {
        const server = new AuraConnectionManager();
        const peers = new PeersManager(server);
        const peersUI = new PeersUI();
        const bluetooth = new BluetoothDiscovery();

        Events.on('load', e => {
            const receiveDialog = new ReceiveDialog();
            const sendTextDialog = new SendTextDialog();
            const receiveTextDialog = new ReceiveTextDialog();
            const toast = new Toast();
            const notifications = new Notifications();
            const networkStatusUI = new NetworkStatusUI();
            const webShareTargetUI = new WebShareTargetUI();

            // Bluetooth scan button handler
            const btScanBtn = $('btScan');
            if (btScanBtn) {
                btScanBtn.addEventListener('click', async () => {
                    if (bluetooth.isSupported) {
                        btScanBtn.classList.add('scanning');
                        await bluetooth.scan();
                        btScanBtn.classList.remove('scanning');
                    } else {
                        Events.fire('notify-user', 'Bluetooth not available');
                    }
                });
            }

            // Connection status indicator
            Events.on('ws-connected', () => {
                const indicator = $('connectionStatus');
                const fallback = $('offline-fallback');
                if (indicator) {
                    indicator.classList.add('connected');
                    indicator.title = 'Connected to local network';
                }
                if (fallback) fallback.style.display = 'none';
            });

            Events.on('ws-disconnected', () => {
                const indicator = $('connectionStatus');
                const fallback = $('offline-fallback');
                if (indicator) {
                    indicator.classList.remove('connected');
                    indicator.title = 'Disconnected';
                }
                setTimeout(() => {
                    if (fallback && !indicator.classList.contains('connected')) {
                        fallback.style.display = 'flex';
                    }
                }, 2000);
            });
        });
    }
}

const aura = new Aura();

// ─────────────────────────────────────
//  Service Worker Registration
// ─────────────────────────────────────

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js')
        .then(serviceWorker => {
            console.log('Aura: Service Worker registered');
            window.serviceWorker = serviceWorker;
        });
}

// ─────────────────────────────────────
//  PWA Install Prompt
// ─────────────────────────────────────

window.addEventListener('beforeinstallprompt', e => {
    if (window.matchMedia('(display-mode: standalone)').matches) {
        return e.preventDefault();
    } else {
        const btn = document.querySelector('#install');
        btn.hidden = false;
        btn.onclick = _ => e.prompt();
        return e.preventDefault();
    }
});

// ═══════════════════════════════════════════════════════
//  Circuit Board Canvas Animation
//  Faint geometric trace lines + glowing intersection
//  nodes that slowly pulse — mimics data flowing
//  through the air without distracting the user.
// ═══════════════════════════════════════════════════════

Events.on('load', () => {
    const canvas = $('aura-circuit-bg');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let w, h, traces = [], nodes = [], time = 0;
    let animActive = true;

    // Trace line class
    class Trace {
        constructor() {
            this.reset();
        }

        reset() {
            // Start from random edge position
            const edge = Math.floor(Math.random() * 4);
            switch(edge) {
                case 0: this.x = Math.random() * w; this.y = 0; break;
                case 1: this.x = w; this.y = Math.random() * h; break;
                case 2: this.x = Math.random() * w; this.y = h; break;
                case 3: this.x = 0; this.y = Math.random() * h; break;
            }
            this.segments = [];
            this.segments.push({ x: this.x, y: this.y });
            this.direction = Math.floor(Math.random() * 4); // 0=up 1=right 2=down 3=left
            this.length = 30 + Math.random() * 100;
            this.speed = 0.3 + Math.random() * 0.5;
            this.alpha = 0;
            this.maxAlpha = 0.08 + Math.random() * 0.12;
            this.fadeIn = true;
            this.traveled = 0;
            this.turnCount = 0;
            this.maxTurns = 2 + Math.floor(Math.random() * 4);
            this.lineWidth = 0.5 + Math.random() * 0.8;
        }

        update() {
            const dx = [0, this.speed, 0, -this.speed][this.direction];
            const dy = [-this.speed, 0, this.speed, 0][this.direction];
            this.x += dx;
            this.y += dy;
            this.traveled += this.speed;

            if (this.fadeIn) {
                this.alpha = Math.min(this.alpha + 0.002, this.maxAlpha);
                if (this.alpha >= this.maxAlpha) this.fadeIn = false;
            }

            if (this.traveled >= this.length) {
                this.segments.push({ x: this.x, y: this.y });
                this.traveled = 0;
                this.length = 30 + Math.random() * 80;
                this.turnCount++;;
                // Turn 90 degrees
                if (Math.random() > 0.3) {
                    this.direction = (this.direction + (Math.random() > 0.5 ? 1 : 3)) % 4;
                }
            }

            // Off screen or max turns → fade and reset
            if (this.x < -20 || this.x > w + 20 || this.y < -20 || this.y > h + 20 ||
                this.turnCount >= this.maxTurns) {
                this.alpha -= 0.003;
                if (this.alpha <= 0) this.reset();
            }
        }

        draw(ctx) {
            if (this.alpha <= 0) return;
            ctx.beginPath();
            ctx.strokeStyle = `rgba(0, 255, 255, ${this.alpha})`;
            ctx.lineWidth = this.lineWidth;
            if (this.segments.length > 0) {
                ctx.moveTo(this.segments[0].x, this.segments[0].y);
                for (let i = 1; i < this.segments.length; i++) {
                    ctx.lineTo(this.segments[i].x, this.segments[i].y);
                }
                ctx.lineTo(this.x, this.y);
            }
            ctx.stroke();
        }
    }

    // Intersection node class
    class Node {
        constructor() {
            this.x = Math.random() * w;
            this.y = Math.random() * h;
            this.radius = 1 + Math.random() * 1.5;
            this.phase = Math.random() * Math.PI * 2;
            this.speed = 0.02 + Math.random() * 0.02;
        }

        draw(ctx, time) {
            const pulse = Math.sin(time * this.speed + this.phase) * 0.5 + 0.5;
            const alpha = 0.05 + pulse * 0.15;
            const r = this.radius + pulse * 1;

            // Glow
            ctx.beginPath();
            ctx.arc(this.x, this.y, r + 3, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(0, 255, 255, ${alpha * 0.3})`;
            ctx.fill();

            // Core
            ctx.beginPath();
            ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(0, 255, 255, ${alpha})`;
            ctx.fill();
        }
    }

    function init() {
        w = window.innerWidth;
        h = window.innerHeight;
        canvas.width = w;
        canvas.height = h;

        // Create traces
        const traceCount = Math.max(6, Math.min(15, Math.floor(w * h / 100000)));
        traces = [];
        for (let i = 0; i < traceCount; i++) {
            traces.push(new Trace());
        }

        // Create intersection nodes
        const nodeCount = Math.max(8, Math.min(25, Math.floor(w * h / 60000)));
        nodes = [];
        for (let i = 0; i < nodeCount; i++) {
            nodes.push(new Node());
        }
    }

    function animate() {
        if (!animActive) return;
        ctx.clearRect(0, 0, w, h);
        time++;

        // Draw grid overlay (very subtle)
        const gridSize = 80;
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.012)';
        ctx.lineWidth = 0.5;
        for (let x = 0; x < w; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.stroke();
        }
        for (let y = 0; y < h; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        }

        // Update and draw traces
        traces.forEach(t => {
            t.update();
            t.draw(ctx);
        });

        // Draw nodes
        nodes.forEach(n => n.draw(ctx, time));

        requestAnimationFrame(animate);
    }

    window.animateBackground = function(active) {
        animActive = active !== false;
        if (animActive) animate();
    };

    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            init();
        }, 200);
    });

    init();
    animate();
});

// ─────────────────────────────────────
//  Safari Audio Fix
// ─────────────────────────────────────

document.body.onclick = e => {
    document.body.onclick = null;
    if (!(/.*Version.*Safari.*/.test(navigator.userAgent))) return;
    blop.play();
};
