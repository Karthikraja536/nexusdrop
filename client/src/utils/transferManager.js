import useStore from '../store/useStore';

const CHUNK_SIZE_WEBRTC = 256 * 1024; // 256 KB
const CHUNK_SIZE_RELAY = 512 * 1024;  // 512 KB

const incomingTransfers = {};
const activeSends = {};

export const TransferManager = {
  receiveAck: (fileId, index) => {
     if (activeSends[fileId]) activeSends[fileId].ackReceived(index);
  },
  
  sendFile: async (targetPeer, file, onProgress) => {
    const fileId = `${file.name}-${Date.now()}`;
    const isRelay = targetPeer.relayMode;
    const CHUNK_SIZE = isRelay ? CHUNK_SIZE_RELAY : CHUNK_SIZE_WEBRTC;
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    
    const socket = useStore.getState().socket;

    const metadata = {
      name: file.name,
      size: file.size,
      type: file.type || 'application/octet-stream',
      totalChunks,
      transport: isRelay ? 'relay' : 'webrtc'
    };

    if (isRelay) {
      if (!socket || !targetPeer.socketId) {
         if (onProgress) onProgress(fileId, 'failed', 0, 'relay');
         return;
      }
      socket.emit('relay-file-metadata', { targetSocketId: targetPeer.socketId, fileId, metadata });
    } else {
      if (!targetPeer.conn || !targetPeer.conn.open) {
         if (onProgress) onProgress(fileId, 'failed', 0, 'webrtc');
         return;
      }
      targetPeer.conn.send({ type: 'file-metadata', fileId, metadata });
    }

    console.log(`Starting ${isRelay ? 'Socket.IO Relay' : 'WebRTC'} chunk stream: ${file.name} to ${targetPeer.name}`);

    let offset = 0;
    let chunkIndex = 0;
    let ackedBytes = 0;
    let relayAckedChunks = 0;
    let stallTimer = null;
    let sending = false;
    
    const MAX_BUFFER = 64 * 1024 * 1024; // 64 MB
    const RELAY_WINDOW = 8; // Sliding window of 8 concurrent chunks

    activeSends[fileId] = {
        ackReceived: (index) => {
            if (stallTimer) {
                clearTimeout(stallTimer);
                stallTimer = null;
            }
            if (isRelay) {
                if (index >= relayAckedChunks) relayAckedChunks = index + 1;
                let newAcked = relayAckedChunks * CHUNK_SIZE;
                if (newAcked > ackedBytes) ackedBytes = newAcked;
                // Resume loop if we have window space
                if (chunkIndex - relayAckedChunks < RELAY_WINDOW && offset < file.size) {
                    sendLoop();
                }
            } else {
                let newAcked = (index + 1) * CHUNK_SIZE;
                if (newAcked > ackedBytes) ackedBytes = newAcked;
            }
        }
    };
    
    let lastPhysicallySent = 0;
    let lastReportedPercent = -1;
    let lastTickTime = Date.now();
    let currentSpeed = 0;
    let isFinished = false;
    let uiTimer = null;

    uiTimer = setInterval(() => {
        const now = Date.now();
        const timeDiff = (now - lastTickTime) / 1000;
        
        let currentConfirmed = Math.min(file.size, ackedBytes);

        if (timeDiff >= 0.25) {
            const drained = currentConfirmed - lastPhysicallySent;
            if (drained > 0) {
                currentSpeed = drained / timeDiff;
            } else if (isFinished && currentConfirmed >= file.size) {
                currentSpeed = 0;
            }
            lastTickTime = now;
            lastPhysicallySent = currentConfirmed;
        }

        let percent = 0;
        if (file.size > 0) {
            percent = Math.min(100, Math.max(0, Math.round((currentConfirmed / file.size) * 100)));
        }

        if (isFinished && currentConfirmed >= file.size) {
            percent = 100;
        }

        if (percent !== lastReportedPercent || currentSpeed > 0) {
            lastReportedPercent = percent;
            if (onProgress) onProgress(fileId, percent, currentSpeed, isRelay ? 'relay' : 'webrtc');
        }

        if (isFinished && currentConfirmed >= file.size) {
            clearInterval(uiTimer);
            delete activeSends[fileId];
        }
    }, 250);

    const arrayBuffer = await file.arrayBuffer();

    const sendLoop = () => {
       if (sending) return;
       sending = true;

       while (offset < file.size) {
           if (isRelay) {
              if (!socket.connected) {
                 if (onProgress) onProgress(fileId, 'failed', 0, 'relay');
                 clearInterval(uiTimer);
                 sending = false; return;
              }
              if (chunkIndex - relayAckedChunks >= RELAY_WINDOW) {
                  break; // Window is full, yield loop completely
              }
           } else {
              if (!targetPeer.conn || !targetPeer.conn.open) {
                 if (onProgress) onProgress(fileId, 'failed', 0, 'webrtc');
                 clearInterval(uiTimer);
                 sending = false; return;
              }
              
              const dc = targetPeer.conn.dataChannel;
              if (dc && dc.bufferedAmount > MAX_BUFFER) {
                 dc.onbufferedamountlow = () => {
                     dc.onbufferedamountlow = null;
                     sendLoop();
                 };
                 break; 
              }
           }

           const payloadData = arrayBuffer.slice(offset, offset + CHUNK_SIZE);
           
           try {
             if (isRelay) {
               socket.emit('relay-file-chunk', { targetSocketId: targetPeer.socketId, fileId, index: chunkIndex, data: payloadData });
             } else {
               targetPeer.conn.send({ type: 'file-chunk', fileId, index: chunkIndex, data: payloadData });
             }
           } catch (err) {
             console.error("Critical Buffer Crash physically halted transmission:", err);
             if (onProgress) onProgress(fileId, 'failed', 0, isRelay ? 'relay' : 'webrtc');
             clearInterval(uiTimer);
             sending = false; return;
           }

           offset += CHUNK_SIZE;
           chunkIndex++;
       }

       sending = false;

       if (offset < file.size) {
          const STALL_TIMEOUT = isRelay ? 15000 : 5000;
          if (stallTimer) clearTimeout(stallTimer);
          stallTimer = setTimeout(() => {
              console.error('Watchdog aggressively timed out: Receiver physically disconnected.');
              if (onProgress) onProgress(fileId, 'failed', 0, isRelay ? 'relay' : 'webrtc');
          }, STALL_TIMEOUT);
       } else {
         isFinished = true;
         if (stallTimer) clearTimeout(stallTimer);
         try { 
            if (isRelay) {
               socket.emit('relay-file-end', { targetSocketId: targetPeer.socketId, fileId });
            } else {
               targetPeer.conn.send({ type: 'file-end', fileId }); 
            }
         } catch(err) {} 
       }
    };

    sendLoop();
    return fileId;
  },

  receiveData: (data, onProgress, onComplete, onTimeout, transportType = 'webrtc', sendAck = null) => {
    if (!data.type && !data.fileId) return;
    
    const type = data.type || (data.metadata ? 'file-metadata' : data.index !== undefined ? 'file-chunk' : 'file-end');
    const fileId = data.fileId;

    if (type === 'file-metadata') {
      incomingTransfers[fileId] = {
        metadata: data.metadata,
        chunks: [],
        receivedCount: 0,
        lastPercent: -1,
        watchdog: null,
        bytesReceivedSinceLastTick: 0,
        lastTickTime: Date.now(),
        currentSpeed: 0,
        transport: data.metadata.transport || transportType
      };
      if (onProgress) onProgress(fileId, data.metadata, 0, 0, incomingTransfers[fileId].transport);

      if (onTimeout) {
         incomingTransfers[fileId].watchdog = setTimeout(() => {
             onTimeout(fileId, incomingTransfers[fileId]?.metadata);
             delete incomingTransfers[fileId];
         }, 15000);
      }
    } 
    
    else if (type === 'file-chunk') {
      const transfer = incomingTransfers[fileId];
      if (!transfer) return;

      transfer.chunks[data.index] = data.data;
      transfer.receivedCount++;

      if (data.senderSocketId) {
         const socket = useStore.getState().socket;
         if (socket) {
            socket.emit('relay-ack', { targetSocketId: data.senderSocketId, fileId, index: data.index });
         }
      } else if (sendAck) {
         sendAck(fileId, data.index);
      }

      const payloadSize = data.data.byteLength || data.data.length || 0;
      transfer.bytesReceivedSinceLastTick += payloadSize;

      const now = Date.now();
      const timeDiff = (now - transfer.lastTickTime) / 1000;
      if (timeDiff >= 0.25) { 
         transfer.currentSpeed = transfer.bytesReceivedSinceLastTick / timeDiff;
         transfer.bytesReceivedSinceLastTick = 0;
         transfer.lastTickTime = now;
      }

      if (transfer.watchdog) clearTimeout(transfer.watchdog);
      if (onTimeout) {
         transfer.watchdog = setTimeout(() => {
             onTimeout(fileId, transfer.metadata);
             delete incomingTransfers[fileId];
         }, 15000);
      }

      const percent = Math.round((transfer.receivedCount / transfer.metadata.totalChunks) * 100);
      if (percent !== transfer.lastPercent || transfer.currentSpeed > 0) {
         transfer.lastPercent = percent;
         if (onProgress) onProgress(fileId, transfer.metadata, percent, transfer.currentSpeed, transfer.transport);
      }
    } 
    
    else if (type === 'file-end') {
      const transfer = incomingTransfers[fileId];
      if (!transfer) return;
      
      if (transfer.watchdog) clearTimeout(transfer.watchdog);
      
      const finalBlob = new Blob(transfer.chunks, { type: transfer.metadata.type });
      const blobUrl = URL.createObjectURL(finalBlob);
      
      if (onComplete) onComplete(fileId, transfer.metadata, blobUrl);
      delete incomingTransfers[fileId];
    }
  }
};
