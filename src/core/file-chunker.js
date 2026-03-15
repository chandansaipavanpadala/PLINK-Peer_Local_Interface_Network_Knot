/**
 * Aura — File Chunker (Max Speed & Mega-File Optimized)
 * 
 * Aggressive chunking at 256KB for maximum bandwidth saturation.
 * Prepends an 8-byte Float64 offset to each chunk because the
 * data channel is now unordered for maximum speed.
 */
class FileChunker {

    constructor(file, onChunk, onPartitionEnd) {
        this._file = file;
        this._onChunk = onChunk;
        this._onPartitionEnd = onPartitionEnd;
        this._offset = 0;
        this._partitionSize = 0;

        // ─── Aggressive Chunking ───
        // Used to scale, now locked to 256KB (safest max limit for modern mobile browsers)
        this._chunkSize = 256 * 1024;

        // Partition size — how many bytes before we pause for ACK
        if (file.size > 100e6) {
            this._maxPartitionSize = 32e6;     // 32 MB
        } else {
            this._maxPartitionSize = Math.max(1e6, this._chunkSize * 16);
        }

        // Choose the best reading strategy
        this._useStream = typeof file.stream === 'function';
        this._streamReader = null;
        this._streamBuffer = null;
        this._streamOffset = 0;

        if (!this._useStream) {
            this._reader = new FileReader();
            this._reader.addEventListener('load', e => this._onChunkRead(e.target.result));
        }
    }

    nextPartition() {
        this._partitionSize = 0;
        if (this._useStream) {
            this._streamReadChunk();
        } else {
            this._readChunk();
        }
    }

    _initStream() {
        if (this._streamReader) return;
        const stream = this._file.stream();
        this._streamReader = stream.getReader();
        this._streamBuffer = new Uint8Array(0);
        this._streamOffset = 0;
    }

    async _streamReadChunk() {
        this._initStream();

        while (this._streamBuffer.length - this._streamOffset < this._chunkSize) {
            const { done, value } = await this._streamReader.read();
            if (done) break;
            const newBuf = new Uint8Array(this._streamBuffer.length - this._streamOffset + value.length);
            newBuf.set(this._streamBuffer.subarray(this._streamOffset));
            newBuf.set(value, this._streamBuffer.length - this._streamOffset);
            this._streamBuffer = newBuf;
            this._streamOffset = 0;
        }

        const available = this._streamBuffer.length - this._streamOffset;
        if (available <= 0) return; // EOF

        const size = Math.min(this._chunkSize, available);
        const chunk = this._streamBuffer.slice(this._streamOffset, this._streamOffset + size);
        this._streamOffset += size;

        if (this._streamOffset > 1e6) {
            this._streamBuffer = this._streamBuffer.subarray(this._streamOffset);
            this._streamOffset = 0;
        }

        this._processChunk(chunk);

        if (this.isFileEnd()) return;
        if (this._isPartitionEnd()) {
            this._onPartitionEnd(this._offset);
            return;
        }
        
        // Avoid deep recursion
        Promise.resolve().then(() => this._streamReadChunk());
    }

    _readChunk() {
        const end = Math.min(this._offset + this._chunkSize, this._file.size);
        const chunk = this._file.slice(this._offset, end);
        this._reader.readAsArrayBuffer(chunk);
    }

    _onChunkRead(chunk) {
        this._processChunk(chunk);
        if (this.isFileEnd()) return;
        if (this._isPartitionEnd()) {
            this._onPartitionEnd(this._offset);
            return;
        }
        this._readChunk();
    }

    _processChunk(chunk) {
        const byteLength = chunk.byteLength;
        const startOffset = this._offset;
        
        this._offset += byteLength;
        this._partitionSize += byteLength;

        // Modify payload: Prepend 8-byte Float64 offset for manual ordering
        const payload = new ArrayBuffer(8 + byteLength);
        const view = new DataView(payload);
        view.setFloat64(0, startOffset, true); // Little-endian
        new Uint8Array(payload, 8).set(new Uint8Array(chunk instanceof ArrayBuffer ? chunk : chunk.buffer || chunk));

        this._onChunk(payload);
    }

    repeatPartition() {
        this._offset -= this._partitionSize;
        if (this._useStream) {
            this._streamReader = null;
            this._streamBuffer = null;
            this._streamOffset = 0;
            this._initStream();
            this._skipStreamTo(this._offset).then(() => this.nextPartition());
            return;
        }
        this.nextPartition();
    }

    async _skipStreamTo(targetOffset) {
        let skipped = 0;
        while (skipped < targetOffset) {
            const { done, value } = await this._streamReader.read();
            if (done) break;
            skipped += value.length;
        }
    }

    _isPartitionEnd() {
        return this._partitionSize >= this._maxPartitionSize;
    }

    isFileEnd() {
        return this._offset >= this._file.size;
    }

    get progress() {
        return this._offset / this._file.size;
    }
}

window.FileChunker = FileChunker;
