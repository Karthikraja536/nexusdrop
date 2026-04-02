const CHUNK_SIZE = 64 * 1024; // 64KB chunk buffer strictly

// In-memory buffer tracking purely for chunk reassembly via indices
const incomingTransfers = {};

export const TransferManager = {
  
  /**
   * Reads a native File object and physically dials chunk buffers across the WebRTC Socket
   */
  sendFile: async (conn, file, onProgress) => {
    const fileId = `${file.name}-${Date.now()}`;
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    
    // 1. Announce payload configuration
    conn.send({
      type: 'file-metadata',
      fileId,
      metadata: {
        name: file.name,
        size: file.size,
        type: file.type || 'application/octet-stream',
        totalChunks
      }
    });

    console.log(`Starting chunk stream: ${file.name} to ${conn.peer}`);

    let offset = 0;
    let chunkIndex = 0;

    // 2. Recursive synchronous unspooling mathematically limited to buffer cap
    const readSlice = (start) => {
      const slice = file.slice(start, start + CHUNK_SIZE);
      const reader = new FileReader();

      reader.onload = (e) => {
        conn.send({
          type: 'file-chunk',
          fileId,
          index: chunkIndex,
          data: e.target.result // ArrayBuffer
        });

        const percent = Math.round(((chunkIndex + 1) / totalChunks) * 100);
        if (onProgress) onProgress(fileId, percent);

        offset += CHUNK_SIZE;
        chunkIndex++;

        // Tail-call recursion
        if (offset < file.size) {
          readSlice(offset);
        } else {
          conn.send({ type: 'file-end', fileId });
        }
      };

      reader.readAsArrayBuffer(slice);
    };

    readSlice(0);
    return fileId;
  },

  /**
   * Processes sequentially firing incoming Buffer arrays intercepting metadata dynamically
   */
  receiveData: (data, onProgress, onComplete) => {
    // Only parse recognized file sockets
    if (!data.type || !data.type.startsWith('file-')) return;
    
    const { fileId } = data;

    if (data.type === 'file-metadata') {
      incomingTransfers[fileId] = {
        metadata: data.metadata,
        chunks: [],
        receivedCount: 0
      };
      if (onProgress) onProgress(fileId, data.metadata, 0);
    } 
    
    else if (data.type === 'file-chunk') {
      const transfer = incomingTransfers[fileId];
      if (!transfer) return;

      transfer.chunks[data.index] = data.data;
      transfer.receivedCount++;

      const percent = Math.round((transfer.receivedCount / transfer.metadata.totalChunks) * 100);
      if (onProgress) onProgress(fileId, transfer.metadata, percent);
    } 
    
    else if (data.type === 'file-end') {
      const transfer = incomingTransfers[fileId];
      if (!transfer) return;
      
      // Standardize Blob natively without leaks securely mapped internally to Memory 
      const finalBlob = new Blob(transfer.chunks, { type: transfer.metadata.type });
      const blobUrl = URL.createObjectURL(finalBlob);
      
      if (onComplete) onComplete(fileId, transfer.metadata, blobUrl);
      
      // Garbage collect buffer
      delete incomingTransfers[fileId];
    }
  }
};
