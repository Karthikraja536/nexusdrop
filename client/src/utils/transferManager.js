import useStore from '../store/useStore';

// ─── High-Performance Constants ──────────────────────────────────────────────
const CHUNK_SIZE   = 256 * 1024;          // 256 KB — reduces per-send() overhead
const MAX_BUFFER   = 16 * 1024 * 1024;    // 16 MB — lets SCTP congestion window grow large
const LOW_BUFFER   = 4 * 1024 * 1024;     // 4 MB — resume threshold
const RELAY_CHUNK  = 512 * 1024;          // 512 KB for relay
const RELAY_WINDOW = 8;
const STALL_TIMEOUT = 60000;
const UI_INTERVAL  = 250;                 // ms between UI updates

// ─── Module state ────────────────────────────────────────────────────────────
const incomingTransfers = {};
const activeSends       = {};
let activeIncomingFileId = null;

export const TransferManager = {

  receiveAck: (fileId, index) => {
    if (activeSends[fileId]) activeSends[fileId].ackReceived(index);
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  SEND FILE — High-performance WebRTC + Relay paths
  // ═══════════════════════════════════════════════════════════════════════════
  sendFile: (targetPeer, file, onProgress) => {
    const fileId  = `${file.name}-${Date.now()}`;
    const isRelay = targetPeer.relayMode;
    const socket  = useStore.getState().socket;

    // ══════════════════════════════════════════════════════════════════════
    //  WEBRTC — Pre-read file + tight synchronous DC.send() loop
    // ══════════════════════════════════════════════════════════════════════
    if (!isRelay) {
      if (!targetPeer.conn || !targetPeer.conn.open) {
        console.error('[TX] conn not open');
        onProgress?.(fileId, 'failed', 0, 'webrtc');
        return fileId;
      }

      const dc = targetPeer.conn._dc;
      if (!dc) {
        console.error('[TX] no raw DataChannel');
        onProgress?.(fileId, 'failed', 0, 'webrtc');
        return fileId;
      }

      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

      // 1. Send metadata as JSON string
      targetPeer.conn.send(JSON.stringify({
        type: 'file-metadata',
        fileId,
        metadata: {
          name: file.name,
          size: file.size,
          type: file.type || 'application/octet-stream',
          totalChunks
        }
      }));

      console.log(`[TX] Start: ${file.name} | ${(file.size / 1048576).toFixed(1)} MB | ${totalChunks} chunks (256KB)`);

      // 2. Pre-read entire file into memory, then blast through DC
      (async () => {
        try {
          const fullBuffer = await file.arrayBuffer();

          const startTime = performance.now();
          let offset = 0;
          let lastUI = 0;

          // Set low threshold for backpressure callback
          dc.bufferedAmountLowThreshold = LOW_BUFFER;

          // ── Tight synchronous send loop ──
          // Sends as many chunks as the DC buffer can hold in a single
          // event-loop turn. Only yields when buffer is full.
          const pump = () => {
            try {
              while (offset < fullBuffer.byteLength) {
                // Backpressure: pause until buffer drains
                if (dc.bufferedAmount > MAX_BUFFER) {
                  dc.onbufferedamountlow = () => {
                    dc.onbufferedamountlow = null;
                    pump();
                  };
                  return; // yield — will resume when buffer drains
                }

                const end = Math.min(offset + CHUNK_SIZE, fullBuffer.byteLength);
                dc.send(fullBuffer.slice(offset, end));
                offset = end;

                // Throttled UI update
                const now = performance.now();
                if (now - lastUI > UI_INTERVAL) {
                  lastUI = now;
                  const elapsed = (now - startTime) / 1000;
                  const speed = elapsed > 0 ? offset / elapsed : 0;
                  const pct = Math.round((offset / fullBuffer.byteLength) * 100);
                  onProgress?.(fileId, Math.min(pct, 99), speed, 'webrtc');
                }
              }

              // 3. All chunks sent into buffer — send end marker
              targetPeer.conn.send(JSON.stringify({ type: 'file-end', fileId }));
              const totalTime = (performance.now() - startTime) / 1000;
              const avgSpeed = totalTime > 0 ? file.size / totalTime : 0;
              console.log(`[TX] ✅ Complete: ${file.name} | ${(file.size / 1048576).toFixed(1)} MB in ${totalTime.toFixed(1)}s | ${(avgSpeed / 1048576).toFixed(1)} MB/s`);
              onProgress?.(fileId, 100, avgSpeed, 'webrtc');
            } catch (err) {
              console.error('[TX] Send error:', err);
              onProgress?.(fileId, 'failed', 0, 'webrtc');
            }
          };

          pump();
        } catch (err) {
          console.error('[TX] File read error:', err);
          onProgress?.(fileId, 'failed', 0, 'webrtc');
        }
      })();
    }

    // ══════════════════════════════════════════════════════════════════════
    //  RELAY PATH
    // ══════════════════════════════════════════════════════════════════════
    else {
      if (!socket || !targetPeer.socketId) {
        onProgress?.(fileId, 'failed', 0, 'relay');
        return fileId;
      }

      const totalChunks = Math.ceil(file.size / RELAY_CHUNK);
      const metadata = {
        name: file.name, size: file.size,
        type: file.type || 'application/octet-stream',
        totalChunks, transport: 'relay'
      };
      socket.emit('relay-file-metadata', {
        targetSocketId: targetPeer.socketId, fileId, metadata,
        type: 'file-metadata'
      });

      let relayAcks = 0, chunkIndex = 0, bytesSent = 0, isFailed = false;
      let stallTimer = null;

      activeSends[fileId] = {
        ackReceived: (idx) => {
          if (stallTimer) clearTimeout(stallTimer);
          if (idx >= relayAcks) relayAcks = idx + 1;
        }
      };

      (async () => {
        try {
          let fOff = 0;
          const sTime = performance.now();
          let lastUI = 0;
          while (fOff < file.size && !isFailed) {
            if (!socket.connected) { onProgress?.(fileId, 'failed', 0, 'relay'); return; }
            if (chunkIndex - relayAcks >= RELAY_WINDOW) {
              if (stallTimer) clearTimeout(stallTimer);
              stallTimer = setTimeout(() => { isFailed = true; }, STALL_TIMEOUT);
              await new Promise(r => {
                const iv = setInterval(() => {
                  if (chunkIndex - relayAcks < RELAY_WINDOW || isFailed) { clearInterval(iv); r(); }
                }, 50);
              });
              if (isFailed) { onProgress?.(fileId, 'failed', 0, 'relay'); return; }
              if (stallTimer) clearTimeout(stallTimer);
            }
            const end = Math.min(fOff + RELAY_CHUNK, file.size);
            const buf = await file.slice(fOff, end).arrayBuffer();
            socket.emit('relay-file-chunk', {
              targetSocketId: targetPeer.socketId, fileId,
              index: chunkIndex, data: buf,
              type: 'file-chunk'
            });
            bytesSent += buf.byteLength;
            chunkIndex++;
            fOff = end;

            const now = performance.now();
            if (now - lastUI > UI_INTERVAL) {
              lastUI = now;
              const elapsed = (now - sTime) / 1000;
              const speed = elapsed > 0 ? bytesSent / elapsed : 0;
              const pct = Math.round((bytesSent / file.size) * 100);
              onProgress?.(fileId, pct, speed, 'relay');
            }
          }
          if (!isFailed) {
            socket.emit('relay-file-end', {
              targetSocketId: targetPeer.socketId, fileId,
              type: 'file-end'
            });
            onProgress?.(fileId, 100, 0, 'relay');
          }
          delete activeSends[fileId];
        } catch (err) {
          onProgress?.(fileId, 'failed', 0, 'relay');
          delete activeSends[fileId];
        }
      })();
    }

    return fileId;
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  RECEIVE RAW CHUNK — ArrayBuffer data from WebRTC DataChannel
  // ═══════════════════════════════════════════════════════════════════════════
  receiveRawChunk: (buffer, peerId, onProgress, onComplete) => {
    if (!activeIncomingFileId) return;
    const t = incomingTransfers[activeIncomingFileId];
    if (!t) return;

    // Defer start time to first actual chunk — excludes SCTP ramp-up from speed calc
    if (t.chunkCount === 0) {
      t.startTime = performance.now();
    }

    t.chunks.push(buffer);
    t.chunkCount++;
    t.receivedSize += buffer.byteLength;

    const now = performance.now();
    if (now - t.lastUITime > UI_INTERVAL) {
      t.lastUITime = now;
      const elapsed = (now - t.startTime) / 1000;
      const speed = elapsed > 0.1 ? t.receivedSize / elapsed : 0;
      const pct = t.metadata.size > 0 ? Math.round((t.receivedSize / t.metadata.size) * 100) : 0;
      onProgress?.(activeIncomingFileId, t.metadata, pct, speed, 'webrtc');
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  RECEIVE DATA — JSON control messages (metadata, end, relay chunks)
  // ═══════════════════════════════════════════════════════════════════════════
  receiveData: (data, peerId, onProgress, onComplete, onTimeout, transportType = 'webrtc', sendAck = null) => {

    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch { return; }
    }

    if (!data || typeof data !== 'object') return;

    // ── METADATA ──
    if (data.type === 'file-metadata') {
      incomingTransfers[data.fileId] = {
        metadata: data.metadata,
        chunks: [],
        chunkCount: 0,
        receivedSize: 0,
        startTime: performance.now(),   // will be reset on first chunk for WebRTC
        lastUITime: 0
      };
      activeIncomingFileId = data.fileId;
      onProgress?.(data.fileId, data.metadata, 0, 0, transportType);
      return;
    }

    // ── CHUNK (relay path only — WebRTC uses receiveRawChunk) ──
    if (data.type === 'file-chunk') {
      const t = incomingTransfers[data.fileId];
      if (!t) return;

      t.chunks[data.index] = data.data;
      t.chunkCount = Math.max(t.chunkCount, data.index + 1);
      const chunkSize = data.data?.byteLength || data.data?.length || 0;
      t.receivedSize += chunkSize;

      if (data.senderSocketId) {
        const sock = useStore.getState().socket;
        if (sock) sock.emit('relay-ack', { targetSocketId: data.senderSocketId, fileId: data.fileId, index: data.index });
      } else if (sendAck) {
        sendAck(data.fileId, data.index);
      }

      const now = performance.now();
      if (now - t.lastUITime > UI_INTERVAL) {
        t.lastUITime = now;
        const elapsed = (now - t.startTime) / 1000;
        const speed = elapsed > 0.1 ? t.receivedSize / elapsed : 0;
        const pct = t.metadata.size > 0 ? Math.round((t.receivedSize / t.metadata.size) * 100) : 0;
        onProgress?.(data.fileId, t.metadata, pct, speed, transportType);
      }
      return;
    }

    // ── END ──
    if (data.type === 'file-end') {
      const fId = data.fileId;
      const t = incomingTransfers[fId];
      if (!t) return;

      // Ordered reassembly
      const validChunks = t.chunks.filter(c => c !== undefined);
      const blob = new Blob(validChunks, { type: t.metadata.type });
      const url  = URL.createObjectURL(blob);

      const totalTime = (performance.now() - t.startTime) / 1000;
      const avgSpeed = totalTime > 0 ? t.receivedSize / totalTime : 0;
      console.log(`[RX] ✅ Complete: ${t.metadata.name} | ${(t.receivedSize / 1048576).toFixed(1)} MB in ${totalTime.toFixed(1)}s | ${(avgSpeed / 1048576).toFixed(1)} MB/s`);

      onProgress?.(fId, t.metadata, 100, avgSpeed, transportType);
      onComplete?.(fId, t.metadata, url);
      delete incomingTransfers[fId];
      if (activeIncomingFileId === fId) activeIncomingFileId = null;
      return;
    }
  }
};
