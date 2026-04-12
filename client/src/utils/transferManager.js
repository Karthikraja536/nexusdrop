import useStore from '../store/useStore';

// ─── TUNING CONSTANTS ───────────────────────────────────────────────────────
const CHUNK_SIZE_WEBRTC = 64 * 1024;   // 64 KB — optimal SCTP non-fragmented payload
const CHUNK_SIZE_RELAY  = 512 * 1024;  // 512 KB — larger for Socket.IO relay

const MAX_BUFFER_WEBRTC = 4 * 1024 * 1024;   // 4 MB — fluid buffer cap on raw DataChannel
const RELAY_WINDOW      = 8;                   // 8 concurrent in-flight relay chunks

const STALL_TIMEOUT_WEBRTC = 5000;   // 5s  — WebRTC watchdog
const STALL_TIMEOUT_RELAY  = 15000;  // 15s — Relay watchdog (higher latency expected)
const RECV_WATCHDOG        = 15000;  // 15s — Receiver watchdog for stale transfers

const UI_TICK_MS = 250;   // UI polling interval for speed/progress display
const BATCH_READ_SIZE = 4 * 1024 * 1024;  // 4 MB — single file.slice() await per batch (WebRTC)

// ─── MODULE STATE ───────────────────────────────────────────────────────────
const incomingTransfers = {};
const activeSends = {};
let nextTransferId = 1;
const transferIdToFileId = {};

export const TransferManager = {

  // Called by the receiver to ACK a chunk back to the sender
  receiveAck: (fileId, index) => {
     if (activeSends[fileId]) activeSends[fileId].ackReceived(index);
  },
  
  // ─── SEND SIDE ──────────────────────────────────────────────────────────
  sendFile: async (targetPeer, file, onProgress) => {
    const fileId = `${file.name}-${Date.now()}`;
    const isRelay = targetPeer.relayMode;
    const CHUNK_SIZE = isRelay ? CHUNK_SIZE_RELAY : CHUNK_SIZE_WEBRTC;
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    
    const socket = useStore.getState().socket;

    // Assign a numeric transferId for raw binary framing (WebRTC only)
    const transferId = nextTransferId++;

    const metadata = {
      name: file.name,
      size: file.size,
      type: file.type || 'application/octet-stream',
      totalChunks,
      transport: isRelay ? 'relay' : 'webrtc',
      transferId
    };

    // ── Send metadata header (always through PeerJS / Socket.IO control channel) ──
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

    // ── Sender state ──
    let offset = 0;
    let chunkIndex = 0;
    let ackedBytes = 0;
    let relayAckedChunks = 0;
    let stallTimer = null;
    let sending = false;
    let isFinished = false;

    // ── Telemetry state ──
    let lastPhysicallySent = 0;
    let lastReportedPercent = -1;
    let lastReportedSpeed = -1;
    let lastTickTime = Date.now();
    let currentSpeed = 0;
    let uiTimer = null;

    // ── ACK handler ──
    activeSends[fileId] = {
        ackReceived: (index) => {
            // Reset stall watchdog on any ACK
            if (stallTimer) {
                clearTimeout(stallTimer);
                stallTimer = null;
            }

            if (isRelay) {
                // Window-based: advance the ACK watermark
                if (index >= relayAckedChunks) relayAckedChunks = index + 1;
                let newAcked = relayAckedChunks * CHUNK_SIZE;
                if (newAcked > ackedBytes) ackedBytes = newAcked;
                // Resume sending if window has space
                if (chunkIndex - relayAckedChunks < RELAY_WINDOW && offset < file.size) {
                    sendLoop();
                }
            } else {
                // WebRTC: ACKs are telemetry-only, NOT flow control
                let newAcked = (index + 1) * CHUNK_SIZE;
                if (newAcked > ackedBytes) ackedBytes = newAcked;
            }
        }
    };

    // ── UI polling timer (dirty-flag gated to prevent unnecessary React re-renders) ──
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

        // Dirty-flag: only fire setState when values actually changed
        const speedChanged = Math.abs(currentSpeed - lastReportedSpeed) > 1024; // >1KB/s delta
        if (percent !== lastReportedPercent || speedChanged) {
            lastReportedPercent = percent;
            lastReportedSpeed = currentSpeed;
            if (onProgress) onProgress(fileId, percent, currentSpeed, isRelay ? 'relay' : 'webrtc');
        }

        // Cleanup when transfer is fully confirmed
        if (isFinished && currentConfirmed >= file.size) {
            clearInterval(uiTimer);
            delete activeSends[fileId];
        }
    }, UI_TICK_MS);

    // ── Main send loop ──
    const sendLoop = async () => {
       if (sending) return;
       sending = true;

       while (offset < file.size) {
           if (isRelay) {
              // ── RELAY PATH: single-chunk reads, unchanged ──
              if (!socket.connected) {
                 if (onProgress) onProgress(fileId, 'failed', 0, 'relay');
                 clearInterval(uiTimer);
                 sending = false; return;
              }
              if (chunkIndex - relayAckedChunks >= RELAY_WINDOW) {
                  break; // Window is full — yield and wait for ACKs
              }

              const fileBlob = file.slice(offset, offset + CHUNK_SIZE);
              const payloadData = await fileBlob.arrayBuffer();

              try {
                socket.emit('relay-file-chunk', { targetSocketId: targetPeer.socketId, fileId, index: chunkIndex, data: payloadData });
              } catch (err) {
                console.error("Relay send error:", err);
                if (onProgress) onProgress(fileId, 'failed', 0, 'relay');
                clearInterval(uiTimer);
                sending = false; return;
              }

              offset += CHUNK_SIZE;
              chunkIndex++;

           } else {
              // ── WEBRTC PATH: batch-read + raw binary DataChannel ──
              if (!targetPeer.conn || !targetPeer.conn.open) {
                 if (onProgress) onProgress(fileId, 'failed', 0, 'webrtc');
                 clearInterval(uiTimer);
                 sending = false; return;
              }

              // Prefer the dedicated raw file channel; fall back to PeerJS _dc
              const fc = targetPeer.conn._fileChannel;
              const dc = fc || targetPeer.conn._dc;
              if (!dc || (fc && fc.readyState !== 'open')) {
                 // Channel not ready yet — wait briefly and retry
                 await new Promise(r => setTimeout(r, 50));
                 sending = false;
                 sendLoop();
                 return;
              }

              // Check backpressure on the raw channel
              if (dc.bufferedAmount > MAX_BUFFER_WEBRTC) {
                 dc.onbufferedamountlow = () => {
                     dc.onbufferedamountlow = null;
                     sendLoop();
                 };
                 break;
              }

              // BATCH READ: read up to 4 MB with a single await
              const batchEnd = Math.min(offset + BATCH_READ_SIZE, file.size);
              const batchBlob = file.slice(offset, batchEnd);
              const batchBuffer = await batchBlob.arrayBuffer();

              let localOffset = 0;
              while (localOffset < batchBuffer.byteLength) {
                  // Mid-batch backpressure check
                  if (dc.bufferedAmount > MAX_BUFFER_WEBRTC) {
                     dc.onbufferedamountlow = () => {
                         dc.onbufferedamountlow = null;
                         sendLoop();
                     };
                     sending = false;
                     return;
                  }

                  const end = Math.min(localOffset + CHUNK_SIZE, batchBuffer.byteLength);
                  const chunkLen = end - localOffset;

                  if (fc && fc.readyState === 'open') {
                    // ── RAW BINARY SEND: bypass PeerJS serialization entirely ──
                    // Frame layout: [2-byte transferId][4-byte chunkIndex][raw payload]
                    const frame = new Uint8Array(6 + chunkLen);
                    const hv = new DataView(frame.buffer);
                    hv.setUint16(0, transferId);
                    hv.setUint32(2, chunkIndex);
                    frame.set(new Uint8Array(batchBuffer, localOffset, chunkLen), 6);
                    fc.send(frame.buffer);
                  } else {
                    // ── FALLBACK: PeerJS send (slower but always works) ──
                    const payloadData = batchBuffer.slice(localOffset, end);
                    targetPeer.conn.send({ type: 'file-chunk', fileId, index: chunkIndex, data: payloadData });
                  }

                  localOffset = end;
                  offset += chunkLen;
                  chunkIndex++;
              }
           }
       }

       sending = false;

       if (offset < file.size) {
          // Still sending — arm stall watchdog
          const STALL_TIMEOUT = isRelay ? STALL_TIMEOUT_RELAY : STALL_TIMEOUT_WEBRTC;
          if (stallTimer) clearTimeout(stallTimer);
          stallTimer = setTimeout(() => {
              console.error('Watchdog aggressively timed out: Receiver physically disconnected.');
              if (onProgress) onProgress(fileId, 'failed', 0, isRelay ? 'relay' : 'webrtc');
          }, STALL_TIMEOUT);
       } else {
         // All chunks dispatched — signal end-of-file
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

  // ─── RAW BINARY RECEIVE (dedicated file channel — zero serialization) ────
  receiveRawChunk: (buffer, onProgress, onComplete, onTimeout, sendAck = null) => {
    if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 6) return;

    const view = new DataView(buffer);
    const transferId = view.getUint16(0);
    const chunkIndex = view.getUint32(2);
    const payload = buffer.slice(6);

    // Map transferId → fileId (established during file-metadata)
    const fileId = transferIdToFileId[transferId];
    if (!fileId) return;

    const transfer = incomingTransfers[fileId];
    if (!transfer) return;

    transfer.chunks[chunkIndex] = payload;
    transfer.receivedCount++;

    // Send ACK back through PeerJS control channel
    if (sendAck) {
       sendAck(fileId, chunkIndex);
    }

    // Speed calculation with dirty-flag check
    const payloadSize = payload.byteLength;
    transfer.bytesReceivedSinceLastTick += payloadSize;

    const now = Date.now();
    const timeDiff = (now - transfer.lastTickTime) / 1000;
    if (timeDiff >= 0.25) {
       transfer.currentSpeed = transfer.bytesReceivedSinceLastTick / timeDiff;
       transfer.bytesReceivedSinceLastTick = 0;
       transfer.lastTickTime = now;
    }

    // Reset receiver watchdog on each chunk
    if (transfer.watchdog) clearTimeout(transfer.watchdog);
    if (onTimeout) {
       transfer.watchdog = setTimeout(() => {
           onTimeout(fileId, transfer.metadata);
           delete incomingTransfers[fileId];
       }, RECV_WATCHDOG);
    }

    // Progress update with dirty-flag
    const percent = Math.round((transfer.receivedCount / transfer.metadata.totalChunks) * 100);
    if (percent !== transfer.lastPercent || transfer.currentSpeed > 0) {
       transfer.lastPercent = percent;
       if (onProgress) onProgress(fileId, transfer.metadata, percent, transfer.currentSpeed, transfer.transport);
    }
  },

  // ─── RECEIVE SIDE (PeerJS control channel + relay chunks) ─────────────────
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

      // Register transferId → fileId mapping for raw binary routing
      if (data.metadata.transferId) {
        transferIdToFileId[data.metadata.transferId] = fileId;
      }

      if (onProgress) onProgress(fileId, data.metadata, 0, 0, incomingTransfers[fileId].transport);

      if (onTimeout) {
         incomingTransfers[fileId].watchdog = setTimeout(() => {
             onTimeout(fileId, incomingTransfers[fileId]?.metadata);
             delete incomingTransfers[fileId];
         }, RECV_WATCHDOG);
      }
    } 
    
    else if (type === 'file-chunk') {
      // This path is now only used by Socket.IO relay transfers
      const transfer = incomingTransfers[fileId];
      if (!transfer) return;

      transfer.chunks[data.index] = data.data;
      transfer.receivedCount++;

      // Send ACK back to sender (relay uses socket, WebRTC uses DataChannel)
      if (data.senderSocketId) {
         const socket = useStore.getState().socket;
         if (socket) {
            socket.emit('relay-ack', { targetSocketId: data.senderSocketId, fileId, index: data.index });
         }
      } else if (sendAck) {
         sendAck(fileId, data.index);
      }

      // Speed calculation with dirty-flag check
      const payloadSize = data.data.byteLength || data.data.length || 0;
      transfer.bytesReceivedSinceLastTick += payloadSize;

      const now = Date.now();
      const timeDiff = (now - transfer.lastTickTime) / 1000;
      if (timeDiff >= 0.25) { 
         transfer.currentSpeed = transfer.bytesReceivedSinceLastTick / timeDiff;
         transfer.bytesReceivedSinceLastTick = 0;
         transfer.lastTickTime = now;
      }

      // Reset receiver watchdog on each chunk
      if (transfer.watchdog) clearTimeout(transfer.watchdog);
      if (onTimeout) {
         transfer.watchdog = setTimeout(() => {
             onTimeout(fileId, transfer.metadata);
             delete incomingTransfers[fileId];
         }, RECV_WATCHDOG);
      }

      // Progress update with dirty-flag
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

      // Cleanup transferId mapping
      if (transfer.metadata.transferId) {
        delete transferIdToFileId[transfer.metadata.transferId];
      }
      delete incomingTransfers[fileId];
    }
  }
};
