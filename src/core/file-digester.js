/**
 * Aura — File Digester (Mega-File Optimized)
 * 
 * Reassembles incoming chunks into complete files.
 * 
 * For LARGE files (>50MB):
 *   Uses Service Worker streaming — chunks are piped directly to disk
 *   via a ReadableStream, so the full 5GB file is NEVER held in RAM.
 * 
 * For SMALL files (<50MB):
 *   Uses the classic Blob approach (fast, simple).
 * 
 * Falls back to Blob if Service Worker streaming is unavailable.
 */

// Threshold above which we use streaming download
const STREAM_THRESHOLD = 50 * 1024 * 1024; // 50 MB

class FileDigester {

    constructor(meta, callback) {
        this._bytesReceived = 0;
        this._size = meta.size;
        this._mime = meta.mime || 'application/octet-stream';
        this._name = meta.name;
        this._callback = callback;
        this.progress = 0;

        // Decide strategy based on file size and SW availability
        this._useStream = (
            this._size > STREAM_THRESHOLD &&
            'serviceWorker' in navigator &&
            navigator.serviceWorker.controller &&
            typeof ReadableStream !== 'undefined'
        );

        if (this._useStream) {
            this._initStreamDigester();
        } else {
            this._buffer = [];
        }
    }

    // ═══════════════════════════════════════
    //  Stream Strategy (>50MB)
    //  Pipes chunks to SW → direct download
    // ═══════════════════════════════════════

    _initStreamDigester() {
        // Generate a unique download token for this transfer
        this._streamId = 'aura-dl-' + Date.now() + '-' + Math.random().toString(36).substr(2, 8);

        // Create a ReadableStream whose controller we retain
        // so we can push chunks into it from the data channel
        this._streamController = null;
        const self = this;

        this._readableStream = new ReadableStream({
            start(controller) {
                self._streamController = controller;
            }
        });

        // Tell the Service Worker to prepare for this download
        const messageChannel = new MessageChannel();
        messageChannel.port1.onmessage = (event) => {
            if (event.data && event.data.type === 'stream-ready') {
                console.log('Aura: SW stream ready for', this._name);
            }
        };

        navigator.serviceWorker.controller.postMessage({
            type: 'stream-download',
            streamId: this._streamId,
            filename: this._name,
            mime: this._mime,
            size: this._size
        }, [messageChannel.port2]);

        // Store the port for sending chunks
        this._swPort = messageChannel.port1;
    }

    unchunk(chunk) {
        this._bytesReceived += chunk.byteLength || chunk.size;
        this.progress = this._bytesReceived / this._size;
        if (isNaN(this.progress)) this.progress = 1;

        if (this._useStream) {
            // Stream mode: push chunk to Service Worker
            this._pushToStream(chunk);
        } else {
            // Blob mode: accumulate in memory
            this._buffer.push(chunk);
        }

        if (this._bytesReceived < this._size) return;

        // ─── File complete ───
        if (this._useStream) {
            this._finalizeStream();
        } else {
            this._finalizeBlob();
        }
    }

    _pushToStream(chunk) {
        // Send the chunk to the Service Worker via postMessage
        // We transfer the ArrayBuffer for zero-copy
        if (this._swPort) {
            const buffer = chunk instanceof ArrayBuffer ? chunk : chunk.buffer;
            this._swPort.postMessage({
                type: 'stream-chunk',
                streamId: this._streamId,
                chunk: buffer
            }, [buffer]);
        }
    }

    _finalizeStream() {
        // Tell the SW that the stream is complete
        if (this._swPort) {
            this._swPort.postMessage({
                type: 'stream-end',
                streamId: this._streamId
            });
        }

        // Trigger download via the SW's virtual URL
        const downloadUrl = `/aura-stream-download/${this._streamId}`;
        this._callback({
            name: this._name,
            mime: this._mime,
            size: this._size,
            blob: null,
            streamUrl: downloadUrl
        });
    }

    _finalizeBlob() {
        const blob = new Blob(this._buffer, { type: this._mime });
        this._buffer = []; // Free memory immediately
        this._callback({
            name: this._name,
            mime: this._mime,
            size: this._size,
            blob: blob
        });
    }
}

window.FileDigester = FileDigester;
