import useStore from '../store/useStore';

// ─── TUNING CONSTANTS (AGGRESSIVE HIGH-THROUGHPUT) ──────────────────────────
const CHUNK_SIZE_WEBRTC = 256 * 1024;  // 256 KB — max SCTP user message without EOR fragmentation
const CHUNK_SIZE_RELAY  = 512 * 1024;  // 512 KB — larger for Socket.IO relay

const MAX_BUFFER_WEBRTC = 16 * 1024 * 1024;  // 16 MB — deep pipeline for sustained throughput
const RELAY_WINDOW      = 8;                   // 8 concurrent in-flight relay chunks

const STALL_TIMEOUT_WEBRTC = 8000;    // 8s  — WebRTC watchdog (generous for large chunks)
const STALL_TIMEOUT_RELAY  = 15000;   // 15s — Relay watchdog
const RECV_WATCHDOG        = 15000;   // 15s — Receiver watchdog

const UI_TICK_MS = 300;               // UI polling interval
const BATCH_READ_SIZE = 16 * 1024 * 1024;  // 16 MB — single file.slice() per batch
const ACK_INTERVAL = 32;             // Receiver ACKs every 32 chunks (sparse ACK)
const YIELD_INTERVAL = 128;          // Yield to event loop every N chunks in tight loop

// Pre-allocated frame header overhead
const FRAME_HEADER_SIZE = 6; // 2-byte transferId + 4-byte chunkIndex

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
      transferId,
      chunkSize: CHUNK_SIZE
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

    console.log(`🚀 Starting ${isRelay ? 'Socket.IO Relay' : 'WebRTC'} HIGH-SPEED stream: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB) to ${targetPeer.name} | chunk=${CHUNK_SIZE/1024}KB`);

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

    // ── UI polling timer (dirty-flag gated) ──
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
        const speedChanged = Math.abs(currentSpeed - lastReportedSpeed) > 1024;
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

    // ── Main send loop (optimized for minimum overhead) ──
    const sendLoop = async () => {
       if (sending) return;
       sending = true;

       while (offset < file.size) {
           if (isRelay) {
              // ── RELAY PATH ──
              if (!socket.connected) {
                 if (onProgress) onProgress(fileId, 'failed', 0, 'relay');
                 clearInterval(uiTimer);
                 sending = false; return;
              }
              if (chunkIndex - relayAckedChunks >= RELAY_WINDOW) {
                  break; // Window full — yield and wait for ACKs
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
              // ── WEBRTC PATH: batch-read + zero-copy raw binary DataChannel ──
              if (!targetPeer.conn || !targetPeer.conn.open) {
                 if (onProgress) onProgress(fileId, 'failed', 0, 'webrtc');
                 clearInterval(uiTimer);
                 sending = false; return;
              }

              // Prefer raw file channel; fall back to PeerJS _dc
              const fc = targetPeer.conn._fileChannel;
              const dc = fc || targetPeer.conn._dc;
              if (!dc || (fc && fc.readyState !== 'open')) {
                 await new Promise(r => setTimeout(r, 50));
                 sending = false;
                 sendLoop();
                 return;
              }

              // ── Backpressure gate ──
              if (dc.bufferedAmount > MAX_BUFFER_WEBRTC) {
                 dc.onbufferedamountlow = () => {
                     dc.onbufferedamountlow = null;
                     sendLoop();
                 };
                 break;
              }

              // ── BATCH READ: 16 MB at a time ──
              const batchEnd = Math.min(offset + BATCH_READ_SIZE, file.size);
              const batchBlob = file.slice(offset, batchEnd);
              const batchBuffer = await batchBlob.arrayBuffer();
              const batchView = new Uint8Array(batchBuffer);

              let localOffset = 0;
              let chunksInBurst = 0;

              while (localOffset < batchBuffer.byteLength) {
                  // Mid-batch backpressure check
                  if (dc.bufferedAmount > MAX_BUFFER_WEBRTC) {
                     // Update file-level offset before yielding
                     offset += localOffset;
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
                    // ── RAW BINARY SEND: zero-copy framing ──
                    // Frame: [2-byte transferId][4-byte chunkIndex][raw payload]
                    const frame = new ArrayBuffer(FRAME_HEADER_SIZE + chunkLen);
                    const headerView = new DataView(frame);
                    headerView.setUint16(0, transferId);
                    headerView.setUint32(2, chunkIndex);
                    // Copy payload into frame (unavoidable — SCTP needs contiguous buffer)
                    new Uint8Array(frame, FRAME_HEADER_SIZE).set(
                      batchView.subarray(localOffset, end)
                    );
                    fc.send(frame);
                  } else {
                    // ── FALLBACK: PeerJS send ──
                    const payloadData = batchBuffer.slice(localOffset, end);
                    targetPeer.conn.send({ type: 'file-chunk', fileId, index: chunkIndex, data: payloadData });
                  }

                  localOffset = end;
                  chunkIndex++;
                  chunksInBurst++;

                  // Yield to event loop periodically to keep UI responsive
                  if (chunksInBurst >= YIELD_INTERVAL) {
                    chunksInBurst = 0;
                    await new Promise(r => setTimeout(r, 0));
                    // Re-check connection & backpressure after yielding
                    if (!targetPeer.conn || !targetPeer.conn.open) {
                      if (onProgress) onProgress(fileId, 'failed', 0, 'webrtc');
                      clearInterval(uiTimer);
                      sending = false; return;
                    }
                  }
              }
              // Update file-level offset after full batch
              offset += batchBuffer.byteLength;
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
    if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < FRAME_HEADER_SIZE) return;

    const view = new DataView(buffer);
    const transferId = view.getUint16(0);
    const chunkIndex = view.getUint32(2);
    // ZERO-COPY: avoid buffer.slice() — store the entire frame and remember the offset
    // We'll reconstruct from offset at assembly time

    // Map transferId → fileId
    const fileId = transferIdToFileId[transferId];
    if (!fileId) return;

    const transfer = incomingTransfers[fileId];
    if (!transfer) return;

    // Store the raw buffer + offset to avoid copying on every chunk
    transfer.chunks[chunkIndex] = buffer;
    transfer.chunkOffsets[chunkIndex] = FRAME_HEADER_SIZE;
    transfer.receivedCount++;
    transfer.totalBytesReceived += (buffer.byteLength - FRAME_HEADER_SIZE);

    // ── SPARSE ACK: only ACK every Nth chunk or on the last chunk ──
    if (sendAck && (chunkIndex % ACK_INTERVAL === 0 || transfer.receivedCount >= transfer.metadata.totalChunks)) {
       sendAck(fileId, chunkIndex);
    }

    // Speed calculation with dirty-flag
    const payloadSize = buffer.byteLength - FRAME_HEADER_SIZE;
    transfer.bytesReceivedSinceLastTick += payloadSize;

    const now = Date.now();
    const timeDiff = (now - transfer.lastTickTime) / 1000;
    if (timeDiff >= 0.25) {
       transfer.currentSpeed = transfer.bytesReceivedSinceLastTick / timeDiff;
       transfer.bytesReceivedSinceLastTick = 0;
       transfer.lastTickTime = now;
    }

    // Reset receiver watchdog
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
        chunkOffsets: [],        // Track offsets for zero-copy assembly
        receivedCount: 0,
        totalBytesReceived: 0,
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
      transfer.chunkOffsets[data.index] = 0;  // No header offset for relay chunks
      transfer.receivedCount++;

      // Send ACK back to sender (relay uses socket)
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

      // Reset receiver watchdog
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

      // ── HIGH-PERFORMANCE BLOB ASSEMBLY ──
      // Build array of properly extracted payloads
      const parts = [];
      for (let i = 0; i < transfer.chunks.length; i++) {
        const chunk = transfer.chunks[i];
        if (!chunk) continue;
        const off = transfer.chunkOffsets[i] || 0;
        if (off > 0) {
          // Raw binary frame — extract payload without header
          parts.push(new Uint8Array(chunk, off));
        } else {
          // Relay chunk or direct data — use as-is
          parts.push(chunk);
        }
      }
      
      const finalBlob = new Blob(parts, { type: transfer.metadata.type });
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
