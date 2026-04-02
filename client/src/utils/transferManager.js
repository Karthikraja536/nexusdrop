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
        try {
          conn.send({
            type: 'file-chunk',
            fileId,
            index: chunkIndex,
            data: e.target.result // ArrayBuffer
          });
        } catch (err) {
          console.error("Critical Buffer Crash physically halted transmission:", err);
          if (onProgress) onProgress(fileId, 'failed');
          return; // Dead stream.
        }

        const percent = Math.round(((chunkIndex + 1) / totalChunks) * 100);
        if (onProgress) onProgress(fileId, percent);

        offset += CHUNK_SIZE;
        chunkIndex++;

        // Tail-call recursion with Backpressure Watchdog
        if (offset < file.size) {
           let stallTime = 0;
           const MAX_BUFFER = 8 * 1024 * 1024; // 8MB limit
           const STALL_TIMEOUT = 5000; // 5 Sec absolute death timeout
           
           const checkBuffer = () => {
              if (!conn.open) {
                 if (onProgress) onProgress(fileId, 'failed');
                 return;
              }
              if (conn.dataChannel && conn.dataChannel.bufferedAmount > MAX_BUFFER) {
                 stallTime += 50;
                 if (stallTime > STALL_TIMEOUT) {
                    console.error('Buffer Watchdog aggressively timed out: Receiver physically disconnected without warning.');
                    if (onProgress) onProgress(fileId, 'failed');
                    return; // Kills recursive loop forever
                 }
                 setTimeout(checkBuffer, 50); // Pause pushing arrays and let network bleed the buffer gracefully
              } else {
                 readSlice(offset); // Buffer is clear!
              }
           };
           checkBuffer();
        } else {
          try { conn.send({ type: 'file-end', fileId }); } catch(err) {} 
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
  receiveData: (data, onProgress, onComplete, onTimeout) => {
    // Only parse recognized file sockets
    if (!data.type || !data.type.startsWith('file-')) return;
    
    const { fileId } = data;

    if (data.type === 'file-metadata') {
      incomingTransfers[fileId] = {
        metadata: data.metadata,
        chunks: [],
        receivedCount: 0,
        watchdog: null
      };
      if (onProgress) onProgress(fileId, data.metadata, 0);

      // Start Stream Watchdog mapping
      if (onTimeout) {
         incomingTransfers[fileId].watchdog = setTimeout(() => {
             onTimeout(fileId, incomingTransfers[fileId]?.metadata);
             delete incomingTransfers[fileId];
         }, 5000); // 5 seconds of total silence on a localized WebRTC bounds guarantees the peer is frozen or fully killed
      }
    } 
    
    else if (data.type === 'file-chunk') {
      const transfer = incomingTransfers[fileId];
      if (!transfer) return;

      transfer.chunks[data.index] = data.data;
      transfer.receivedCount++;

      // Heartbeat Reset
      if (transfer.watchdog) clearTimeout(transfer.watchdog);
      if (onTimeout) {
         transfer.watchdog = setTimeout(() => {
             onTimeout(fileId, transfer.metadata);
             delete incomingTransfers[fileId];
         }, 5000);
      }

      const percent = Math.round((transfer.receivedCount / transfer.metadata.totalChunks) * 100);
      if (onProgress) onProgress(fileId, transfer.metadata, percent);
    } 
    
    else if (data.type === 'file-end') {
      const transfer = incomingTransfers[fileId];
      if (!transfer) return;
      
      // Stop Watchdog cleanly
      if (transfer.watchdog) clearTimeout(transfer.watchdog);
      
      // Standardize Blob natively without leaks securely mapped internally to Memory 
      const finalBlob = new Blob(transfer.chunks, { type: transfer.metadata.type });
      const blobUrl = URL.createObjectURL(finalBlob);
      
      if (onComplete) onComplete(fileId, transfer.metadata, blobUrl);
      
      // Garbage collect buffer safely
      delete incomingTransfers[fileId];
    }
  }
};
