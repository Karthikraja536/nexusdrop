import useStore from '../store/useStore';

// ─── TUNING CONSTANTS ───────────────────────────────────────────────────────
const CHUNK_SIZE_WEBRTC = 256 * 1024;  // 256 KB — larger chunks reduce per-chunk overhead
const CHUNK_SIZE_RELAY  = 512 * 1024;  // 512 KB — larger for Socket.IO relay

const MAX_BUFFER_WEBRTC = 16 * 1024 * 1024;  // 16 MB — keep DataChannel saturated
const RELAY_WINDOW      = 8;                   // 8 concurrent in-flight relay chunks

const STALL_TIMEOUT_WEBRTC = 5000;   // 5s  — WebRTC watchdog
const STALL_TIMEOUT_RELAY  = 15000;  // 15s — Relay watchdog (higher latency expected)
const RECV_WATCHDOG        = 15000;  // 15s — Receiver watchdog for stale transfers

const UI_TICK_MS = 250;   // UI polling interval for speed/progress display
const ACK_EVERY_N = 8;   // Receiver ACKs every Nth chunk (reduces control channel noise)

// ─── MODULE STATE ───────────────────────────────────────────────────────────
const incomingTransfers = {};
const activeSends = {};

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

    const metadata = {
      name: file.name,
      size: file.size,
      type: file.type || 'application/octet-stream',
      totalChunks,
      transport: isRelay ? 'relay' : 'webrtc'
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
    let bytesSent = 0;
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
        
        // Use bytesSent for smoother sender-side progress (no ACK delay)
        let currentConfirmed = Math.min(file.size, bytesSent);

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
              // ── RELAY PATH: single-chunk reads ──
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
              // ── WEBRTC PATH: single-chunk via PeerJS conn.send() ──
              if (!targetPeer.conn || !targetPeer.conn.open) {
                 if (onProgress) onProgress(fileId, 'failed', 0, 'webrtc');
                 clearInterval(uiTimer);
                 sending = false; return;
              }

              // Check backpressure on the underlying DataChannel
              const dc = targetPeer.conn._dc || targetPeer.conn.dataChannel;
              if (dc && dc.bufferedAmount > MAX_BUFFER_WEBRTC) {
                 dc.onbufferedamountlow = () => {
                     dc.onbufferedamountlow = null;
                     sending = false;
                     sendLoop();
                 };
                 break;
              }

              // Single-chunk read and send via PeerJS binary serialization
              const chunkBlob = file.slice(offset, offset + CHUNK_SIZE);
              const payloadData = await chunkBlob.arrayBuffer();

              targetPeer.conn.send({ type: 'file-chunk', fileId, index: chunkIndex, data: payloadData });

              offset += CHUNK_SIZE;
              bytesSent += payloadData.byteLength;
              chunkIndex++;
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

  // ─── RECEIVE SIDE (PeerJS control channel + relay chunks) ─────────────────
  receiveData: (data, onProgress, onComplete, onTimeout, transportType = 'webrtc', sendAck = null) => {
    if (!data.type && !data.fileId) return;
    
    const type = data.type || (data.metadata ? 'file-metadata' : data.index !== undefined ? 'file-chunk' : 'file-end');
    const fileId = data.fileId;

    if (type === 'file-metadata') {
      incomingTransfers[fileId] = {
        metadata: data.metadata,
        chunks: new Map(),
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
         }, RECV_WATCHDOG);
      }
    } 
    
    else if (type === 'file-chunk') {
      const transfer = incomingTransfers[fileId];
      if (!transfer) return;

      transfer.chunks.set(data.index, data.data);
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
      
      const orderedChunks = Array.from(
        { length: transfer.metadata.totalChunks },
        (_, i) => transfer.chunks.get(i) || new ArrayBuffer(0)
      );
      const finalBlob = new Blob(orderedChunks, { type: transfer.metadata.type });
      const blobUrl = URL.createObjectURL(finalBlob);
      
      if (onComplete) onComplete(fileId, transfer.metadata, blobUrl);

      delete incomingTransfers[fileId];
    }
  }
};
