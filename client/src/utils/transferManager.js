import useStore from '../store/useStore';

const CHUNK_SIZE_WEBRTC = 256 * 1024; // 256KB to maximize payload transmission, halving js-pack serialization
const CHUNK_SIZE_RELAY = 128 * 1024;  // 128KB optimized for throughput, node server handles easily

// In-memory buffer tracking purely for chunk reassembly via indices
const incomingTransfers = {};

export const TransferManager = {
  
  /**
   * Reads a native File object and physically dials chunk buffers across WebRTC DataChannel OR Socket.IO Relay
   */
  sendFile: async (targetPeer, file, onProgress) => {
    const fileId = `${file.name}-${Date.now()}`;
    const isRelay = targetPeer.relayMode;
    const CHUNK_SIZE = isRelay ? CHUNK_SIZE_RELAY : CHUNK_SIZE_WEBRTC;
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    
    const socket = useStore.getState().socket;

    // 1. Announce payload configuration
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
    
    // Telemetry tracking
    let lastReportedPercent = -1;
    let bytesSentSinceLastTick = 0;
    let lastTickTime = Date.now();
    let currentSpeed = 0;

    // Relay Ack throttle mapping
    let waitingForAck = false;
    let relayAckListener = null;

    if (isRelay) {
       relayAckListener = ({ fileId: ackFileId, index }) => {
          if (ackFileId === fileId && index === chunkIndex - 1) {
             waitingForAck = false;
          } // We received confirmation the Node server routed the payload 
       };
       socket.on('relay-ack', relayAckListener);
    }

    // Optimize: Read entire file securely into browser RAM once to eliminate FileReader disk-stalls
    const arrayBuffer = await file.arrayBuffer();

    const sendLoop = () => {
       // Synchronous Event Loop completely filling the buffer boundary instantly
       while (offset < file.size) {
           if (isRelay) {
              if (!socket.connected) {
                 if (onProgress) onProgress(fileId, 'failed', 0, 'relay');
                 socket.off('relay-ack', relayAckListener);
                 return;
              }
              if (waitingForAck) break; // Yield loop until server confirms receipt
           } else {
              if (!targetPeer.conn || !targetPeer.conn.open) {
                 if (onProgress) onProgress(fileId, 'failed', 0, 'webrtc');
                 return;
              }
              // 256KB Buffer Limit locks Sender UI progress to exactly match receiver's physical network
              if (targetPeer.conn.dataChannel && targetPeer.conn.dataChannel.bufferedAmount > 256 * 1024) {
                 break; // Yield loop until network card drains the buffer
              }
           }

           const payloadData = arrayBuffer.slice(offset, offset + CHUNK_SIZE);
           
           try {
             if (isRelay) {
               socket.emit('relay-file-chunk', { targetSocketId: targetPeer.socketId, fileId, index: chunkIndex, data: payloadData });
               waitingForAck = true;
             } else {
               targetPeer.conn.send({ type: 'file-chunk', fileId, index: chunkIndex, data: payloadData });
             }
           } catch (err) {
             console.error("Critical Buffer Crash physically halted transmission:", err);
             if (onProgress) onProgress(fileId, 'failed', 0, isRelay ? 'relay' : 'webrtc');
             if (isRelay && relayAckListener) socket.off('relay-ack', relayAckListener);
             return; // Dead stream.
           }

           bytesSentSinceLastTick += payloadData.byteLength || payloadData.length;
           const now = Date.now();
           if (now - lastTickTime >= 1000) {
              currentSpeed = bytesSentSinceLastTick / ((now - lastTickTime) / 1000); // Bytes per second
              bytesSentSinceLastTick = 0;
              lastTickTime = now;
           }

           const percent = Math.round(((chunkIndex + 1) / totalChunks) * 100);
           
           // UI Render Throttle: Only violently hit React state when integer ticks OR exactly 1000ms passes
           if (percent !== lastReportedPercent || bytesSentSinceLastTick === 0) {
              lastReportedPercent = percent;
              if (onProgress) onProgress(fileId, percent, currentSpeed, isRelay ? 'relay' : 'webrtc');
           }

           offset += CHUNK_SIZE;
           chunkIndex++;
       }

       // Tail-call recursion with Backpressure Watchdog
       if (offset < file.size) {
          const MAX_BUFFER = 16 * 1024 * 1024; // 16MB buffer saturation keeps the network card completely full
          const STALL_TIMEOUT = isRelay ? 15000 : 5000;
          if (isRelay) {
              let stallTime = 0;
              const checkBuffer = () => {
                 if (!socket.connected) {
                    if (onProgress) onProgress(fileId, 'failed', 0, 'relay');
                    socket.off('relay-ack', relayAckListener);
                    return;
                 }
                 if (waitingForAck) {
                     stallTime += 10;
                     if (stallTime > STALL_TIMEOUT) {
                        console.error('Relay Watchdog desperately timed out waiting for Node to acknowledge payload dump.');
                        if (onProgress) onProgress(fileId, 'failed', 0, 'relay');
                        socket.off('relay-ack', relayAckListener);
                        return;
                     }
                     setTimeout(checkBuffer, 10);
                 } else {
                     sendLoop();
                 }
              };
              checkBuffer();
          } else {
              if (!targetPeer.conn || !targetPeer.conn.open) {
                 if (onProgress) onProgress(fileId, 'failed', 0, 'webrtc');
                 return;
              }
              const dataChannel = targetPeer.conn.dataChannel;
              if (dataChannel && dataChannel.bufferedAmount > MAX_BUFFER) {
                 
                 let stallTimer = setTimeout(() => {
                     console.error('WebRTC Watchdog aggressively timed out: Receiver physically disconnected without warning.');
                     if (onProgress) onProgress(fileId, 'failed', 0, 'webrtc');
                     dataChannel.onbufferedamountlow = null;
                 }, STALL_TIMEOUT);

                 // Utilize native hardware interrupt event to pull data precisely when pipe clears (Maximum speed)
                 dataChannel.bufferedAmountLowThreshold = 1536 * 1024; // Wake up JS when only 1.5MB remains
                 dataChannel.onbufferedamountlow = () => {
                     dataChannel.onbufferedamountlow = null; // Clean up one-time trigger
                     clearTimeout(stallTimer);
                     sendLoop();
                 };
              } else {
                 sendLoop(); 
              }
          }
       } else {
         try { 
            if (isRelay) {
               socket.emit('relay-file-end', { targetSocketId: targetPeer.socketId, fileId });
               socket.off('relay-ack', relayAckListener);
            } else {
               targetPeer.conn.send({ type: 'file-end', fileId }); 
            }
         } catch(err) {} 
       }
    };

    // Kickoff the optimized transmission loop natively
    sendLoop();
    return fileId;
  },

  /**
   * Processes sequentially firing incoming Buffer arrays intercepting metadata dynamically
   */
  receiveData: (data, onProgress, onComplete, onTimeout, transportType = 'webrtc') => {
    if (!data.type && !data.fileId) return; // Drop unrecognizable
    
    // Accommodate generic Relay JSON structure vs WebRTC payload
    const type = data.type || (data.metadata ? 'file-metadata' : data.index !== undefined ? 'file-chunk' : 'file-end');
    const fileId = data.fileId;

    if (type === 'file-metadata') {
      incomingTransfers[fileId] = {
        metadata: data.metadata,
        chunks: [],
        receivedCount: 0,
        lastPercent: -1,
        watchdog: null,
        // Telemetry
        bytesReceivedSinceLastTick: 0,
        lastTickTime: Date.now(),
        currentSpeed: 0,
        transport: data.metadata.transport || transportType
      };
      if (onProgress) onProgress(fileId, data.metadata, 0, 0, incomingTransfers[fileId].transport);

      // Start Stream Watchdog mapping
      if (onTimeout) {
         incomingTransfers[fileId].watchdog = setTimeout(() => {
             onTimeout(fileId, incomingTransfers[fileId]?.metadata);
             delete incomingTransfers[fileId];
         }, 15000); // Elevated to 15s for relay tolerance
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
      }

      const payloadSize = data.data.byteLength || data.data.length || 0;
      transfer.bytesReceivedSinceLastTick += payloadSize;

      const now = Date.now();
      if (now - transfer.lastTickTime >= 1000) {
         transfer.currentSpeed = transfer.bytesReceivedSinceLastTick / ((now - transfer.lastTickTime) / 1000);
         transfer.bytesReceivedSinceLastTick = 0;
         transfer.lastTickTime = now;
      }

      // Heartbeat Reset
      if (transfer.watchdog) clearTimeout(transfer.watchdog);
      if (onTimeout) {
         transfer.watchdog = setTimeout(() => {
             onTimeout(fileId, transfer.metadata);
             delete incomingTransfers[fileId];
         }, 15000);
      }

      const percent = Math.round((transfer.receivedCount / transfer.metadata.totalChunks) * 100);
      // UI Render Throttle
      if (percent !== transfer.lastPercent || transfer.bytesReceivedSinceLastTick === 0) {
         transfer.lastPercent = percent;
         if (onProgress) onProgress(fileId, transfer.metadata, percent, transfer.currentSpeed, transfer.transport);
      }
    } 
    
    else if (type === 'file-end') {
      const transfer = incomingTransfers[fileId];
      if (!transfer) return;
      
      // Stop Watchdog cleanly
      if (transfer.watchdog) clearTimeout(transfer.watchdog);
      
      const finalBlob = new Blob(transfer.chunks, { type: transfer.metadata.type });
      const blobUrl = URL.createObjectURL(finalBlob);
      
      if (onComplete) onComplete(fileId, transfer.metadata, blobUrl);
      
      // Garbage collect buffer safely
      delete incomingTransfers[fileId];
    }
  }
};
