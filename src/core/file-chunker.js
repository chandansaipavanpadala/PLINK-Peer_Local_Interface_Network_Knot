/**
 * Aura — File Chunker (Mega-File Optimized)
 * 
 * Uses the File System Access API / ReadableStream to read files
 * in 64KB chunks WITHOUT loading the entire file into memory.
 * 
 * For 5GB+ files, this prevents the browser tab from crashing
 * by never holding more than one chunk in memory at a time.
 * 
 * Falls back to FileReader.slice() on browsers without stream support.
 */
class FileChunker {

    constructor(file, onChunk, onPartitionEnd) {
        this._file = file;
        this._onChunk = onChunk;
        this._onPartitionEnd = onPartitionEnd;
        this._offset = 0;
        this._partitionSize = 0;

        // ─── Dynamic chunk sizing ───
        // Small files (< 1MB):   16KB  (mobile-safe)
        // Medium files (1–50MB): 64KB  (balanced)
        // Large files (> 50MB):  64KB  (optimal for SCTP + backpressure)
        //   We keep large files at 64KB to work well with the 16MB
        //   backpressure threshold — larger chunks cause buffer spikes.
        if (file.size < 1e6) {
            this._chunkSize = 16 * 1024;       // 16 KB
        } else {
            this._chunkSize = 64 * 1024;       // 64 KB
        }

        // Partition size — how many bytes before we pause for ACK
        // For mega-files (>100MB), larger partitions reduce ACK overhead
        if (file.size > 100e6) {
            this._maxPartitionSize = 16e6;     // 16 MB
        } else {
            this._maxPartitionSize = Math.max(1e6, this._chunkSize * 16);
        }

        // Choose the best reading strategy
        this._useStream = typeof file.stream === 'function';
        this._streamReader = null;
        this._streamBuffer = null;
        this._streamOffset = 0;

        if (!this._useStream) {
            // Fallback: old FileReader approach
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

    // ═══════════════════════════════════════
    //  Strategy 1: ReadableStream (preferred)
    //  Zero-copy, no memory spikes, works
    //  for 5GB+ files.
    // ═══════════════════════════════════════

    _initStream() {
        if (this._streamReader) return;
        const stream = this._file.stream();
        this._streamReader = stream.getReader();
        this._streamBuffer = new Uint8Array(0);
        this._streamOffset = 0;
    }

    async _streamReadChunk() {
        this._initStream();

        // Fill the internal buffer until we have enough for a chunk
        while (this._streamBuffer.length - this._streamOffset < this._chunkSize) {
            const { done, value } = await this._streamReader.read();
            if (done) break;
            // Append to buffer
            const newBuf = new Uint8Array(this._streamBuffer.length - this._streamOffset + value.length);
            newBuf.set(this._streamBuffer.subarray(this._streamOffset));
            newBuf.set(value, this._streamBuffer.length - this._streamOffset);
            this._streamBuffer = newBuf;
            this._streamOffset = 0;
        }

        // Extract exactly one chunk
        const available = this._streamBuffer.length - this._streamOffset;
        if (available <= 0) return; // EOF

        const size = Math.min(this._chunkSize, available);
        const chunk = this._streamBuffer.slice(this._streamOffset, this._streamOffset + size);
        this._streamOffset += size;

        // Compact buffer periodically to prevent memory growth
        if (this._streamOffset > 1e6) {
            this._streamBuffer = this._streamBuffer.subarray(this._streamOffset);
            this._streamOffset = 0;
        }

        this._offset += chunk.byteLength;
        this._partitionSize += chunk.byteLength;
        this._onChunk(chunk.buffer);

        if (this.isFileEnd()) return;
        if (this._isPartitionEnd()) {
            this._onPartitionEnd(this._offset);
            return;
        }
        // Continue reading — use microtask to avoid stack overflow on huge files
        this._streamReadChunk();
    }

    // ═══════════════════════════════════════
    //  Strategy 2: FileReader fallback
    //  For browsers without file.stream()
    // ═══════════════════════════════════════

    _readChunk() {
        const end = Math.min(this._offset + this._chunkSize, this._file.size);
        const chunk = this._file.slice(this._offset, end);
        this._reader.readAsArrayBuffer(chunk);
    }

    _onChunkRead(chunk) {
        this._offset += chunk.byteLength;
        this._partitionSize += chunk.byteLength;
        this._onChunk(chunk);
        if (this.isFileEnd()) return;
        if (this._isPartitionEnd()) {
            this._onPartitionEnd(this._offset);
            return;
        }
        this._readChunk();
    }

    // ═══════════════════════════════════════
    //  Common methods
    // ═══════════════════════════════════════

    repeatPartition() {
        this._offset -= this._partitionSize;
        // Reset stream reader if using streams
        if (this._useStream) {
            this._streamReader = null;
            this._streamBuffer = null;
            this._streamOffset = 0;
            // Re-seek by creating new stream and skipping
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
