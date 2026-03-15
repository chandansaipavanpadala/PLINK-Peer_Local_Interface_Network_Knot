/**
 * Aura — File Digester (Max Speed Mobile Optimized)
 * 
 * iOS / Android Download Failure Fix:
 * Completely KILLS the old "Blob" accumulation method.
 * Uses the File System Access API (OPFS hidden storage) to write chunks
 * DIRECTLY to the disk as they arrive.
 * 
 * At 100%, generates a file pointer to move it out of hidden storage.
 * 
 * Base64 Fallback: If OPFS fails natively (e.g. old iOS), switches to a 
 * chunked Base64 stream pipeline.
 */

class FileDigester {

    constructor(meta, callback) {
        this._size = meta.size;
        this._mime = meta.mime || 'application/octet-stream';
        this._name = meta.name;
        this._callback = callback;
        
        this._bytesReceived = 0;
        this.progress = 0;
        
        this._useOpfs = false;
        this._b64Buffer = ""; // Base64 fallback string stream
        this._b64Chunks = []; // Ordered storage if OPFS fails

        // Asynchronously initialize the OPFS hidden storage
        this._isReady = this._initStorage();
    }

    async _initStorage() {
        try {
            // Trick for mobile: start "writing" to browser's hidden storage immediately
            const root = await navigator.storage.getDirectory();
            this._opfsName = 'aura-cache-' + Date.now();
            this._fileHandle = await root.getFileHandle(this._opfsName, { create: true });
            
            // createWritable is part of the Streams API
            this._writer = await this._fileHandle.createWritable();
            this._useOpfs = true;
            console.log("Aura: OPFS FileSystemStreams engaged.");
        } catch (e) {
            // iOS Fallback: Base64 Encoded Stream for saving
            console.warn("Aura OPFS not available. Engaging Base64 Stream Fallback for iOS.");
            this._useOpfs = false;
        }
    }

    async unchunk(payload) {
        await this._isReady;

        // Unpack 8-byte Float64 offset from unordered data channel
        const view = new DataView(payload);
        const offset = view.getFloat64(0, true);
        const chunkBuf = payload.slice(8);
        const byteLength = chunkBuf.byteLength;

        if (this._useOpfs) {
            // Write chunk to specific offset directly to hidden disk
            await this._writer.write({ type: 'write', position: offset, data: chunkBuf });
        } else {
            // Fallback: manually store chunks to serialize as base64 later
            this._b64Chunks.push({ offset, chunkBuf });
        }

        this._bytesReceived += byteLength;
        this.progress = this._bytesReceived / this._size;
        if (isNaN(this.progress)) this.progress = 1;

        if (this._bytesReceived >= this._size) {
            this._finalize();
        }
    }

    async _finalize() {
        if (this._useOpfs) {
            // Close the stream to flush hidden storage to disk
            await this._writer.close();
            
            // Gain read pointer to move to downloads folder
            const rawFile = await this._fileHandle.getFile();
            const fileUrl = URL.createObjectURL(rawFile);
            
            this._callback({
                name: this._name,
                mime: this._mime,
                size: this._size,
                blob: rawFile,
                streamUrl: fileUrl
            });

            // Cleanup hidden OPFS after download completes
            setTimeout(async () => {
                try {
                    const root = await navigator.storage.getDirectory();
                    await root.removeEntry(this._opfsName);
                } catch(e) {}
            }, 60000);

        } else {
            // BASE64 FALLBACK FOR iOS 
            // Completely avoiding `new Blob()` to prevent 100% lockup/crash on Safari.
            
            // Sort unordered packets via offset
            this._b64Chunks.sort((a, b) => a.offset - b.offset);

            // Piece together the Base64 stream manually
            let base64String = `data:${this._mime};base64,`;
            for(let i=0; i<this._b64Chunks.length; i++) {
                base64String += this._arrayBufferToBase64(this._b64Chunks[i].chunkBuf);
            }
            this._b64Chunks = []; // free memory instantly

            this._callback({
                name: this._name,
                mime: this._mime,
                size: this._size,
                blob: null,
                streamUrl: base64String 
            });
        }
    }

    _arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }
}

window.FileDigester = FileDigester;
