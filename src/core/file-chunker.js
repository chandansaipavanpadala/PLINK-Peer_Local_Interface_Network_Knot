/**
 * Aura — File Chunker
 * Splits files into manageable chunks for streaming over WebRTC Data Channels.
 * Uses partition-based flow control for reliable transfer.
 *
 * Dynamic Chunking: Starts at 64KB and scales up to 256KB for large files.
 * Uses ArrayBuffer slicing to avoid memory spikes on mobile (Android).
 */
class FileChunker {

    constructor(file, onChunk, onPartitionEnd) {
        this._file = file;
        this._onChunk = onChunk;
        this._onPartitionEnd = onPartitionEnd;
        this._offset = 0;
        this._partitionSize = 0;

        // ─── Dynamic chunk sizing ───
        // Small files (< 1MB): 16KB chunks (safe for mobile)
        // Medium files (1–10MB): 64KB chunks
        // Large files (> 10MB): 256KB chunks (max throughput)
        if (file.size < 1e6) {
            this._chunkSize = 16 * 1024;       // 16 KB
        } else if (file.size < 10e6) {
            this._chunkSize = 64 * 1024;       // 64 KB
        } else {
            this._chunkSize = 256 * 1024;      // 256 KB
        }

        // Partition size scales proportionally
        this._maxPartitionSize = Math.max(1e6, this._chunkSize * 16);

        this._reader = new FileReader();
        this._reader.addEventListener('load', e => this._onChunkRead(e.target.result));
    }

    nextPartition() {
        this._partitionSize = 0;
        this._readChunk();
    }

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

    repeatPartition() {
        this._offset -= this._partitionSize;
        this.nextPartition();
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
