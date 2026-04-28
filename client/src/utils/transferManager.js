import useStore from '../store/useStore';

// ─── Constants: exact match to reference ─────────────────────────────────────
const CHUNK_SIZE_WEBRTC   = 128 * 1024;              // 128 KB
const CHUNK_SIZE_RELAY    = 512 * 1024;              // 512 KB
const MAX_BUFFER_WEBRTC   = 4 * 1024 * 1024;         // 4 MB (reduced from 16MB to prevent SCTP bufferbloat)
const RELAY_WINDOW        = 8;
const STALL_TIMEOUT       = 60000;
const UI_THROTTLE_MS      = 200;

// ─── Module state ────────────────────────────────────────────────────────────
const incomingTransfers    = {};
const activeSends          = {};
let   activeIncomingFileId = null;   // tracks current raw-chunk stream

export const TransferManager = {

  receiveAck: (fileId, index) => {
    if (activeSends[fileId]) activeSends[fileId].ackReceived(index);
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  SEND — FileReader + setTimeout(10ms) + RAW ArrayBuffer
  //  Metadata/end as JSON string. Chunks as raw ArrayBuffer. No wrappers.
  // ═══════════════════════════════════════════════════════════════════════════
  sendFile: (targetPeer, file, onProgress) => {
    const fileId  = `${file.name}-${Date.now()}`;
    const isRelay = targetPeer.relayMode;
    const socket  = useStore.getState().socket;

    // ══════════════════════════════════════════════════════════════════════
    //  WEBRTC PATH
    // ══════════════════════════════════════════════════════════════════════
    if (!isRelay) {
      if (!targetPeer.conn || !targetPeer.conn.open) {
        console.error('[TX] conn not open');
        onProgress?.(fileId, 'failed', 0, 'webrtc');
        return fileId;
      }

      const totalChunks = Math.ceil(file.size / CHUNK_SIZE_WEBRTC);

      // 1. Send metadata as JSON string (tiny, no PeerJS re-chunking)
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

      console.log(`[TX] Start: ${file.name} | ${(file.size / 1048576).toFixed(1)} MB | ${totalChunks} chunks`);

      const reader     = new FileReader();
      let offset       = 0;
      let bytesSent    = 0;
      let chunkIndex   = 0;
      let isFinished   = false;
      const startTime  = performance.now();
      let lastUI       = 0;

      const sendNextChunk = () => {
        if (isFinished) return;

        if (offset >= file.size) {
          // 3. Send end marker as JSON string
          targetPeer.conn.send(JSON.stringify({ type: 'file-end', fileId }));
          isFinished = true;
          const totalTime = (performance.now() - startTime) / 1000;
          const avgSpeed = totalTime > 0 ? file.size / totalTime : 0;
          console.log(`[TX] ✅ Complete: ${file.name} | ${(file.size / 1048576).toFixed(1)} MB in ${totalTime.toFixed(1)}s | ${(avgSpeed / 1048576).toFixed(1)} MB/s`);
          onProgress?.(fileId, 100, avgSpeed, 'webrtc');
          return;
        }

        // Backpressure check on raw DC
        const dc = targetPeer.conn._dc;
        if (dc && dc.bufferedAmount > MAX_BUFFER_WEBRTC) {
          dc.bufferedAmountLowThreshold = MAX_BUFFER_WEBRTC / 2;
          dc.onbufferedamountlow = () => {
            dc.onbufferedamountlow = null;
            sendNextChunk();
          };
          return;
        }

        const slice = file.slice(offset, offset + CHUNK_SIZE_WEBRTC);
        reader.readAsArrayBuffer(slice);
      };

      reader.onload = (event) => {
        try {
          // 2. Send RAW ArrayBuffer — no wrapper, no object, no MsgPack
          targetPeer.conn.send(event.target.result);

          const len = event.target.result.byteLength;
          offset    += len;
          bytesSent += len;
          chunkIndex++;

          // Throttled UI update
          const now = performance.now();
          if (now - lastUI > UI_THROTTLE_MS) {
            lastUI = now;
            const dc = targetPeer.conn._dc;
            const buffered = dc ? dc.bufferedAmount : 0;
            // Subtract buffered amount so sender speed matches true network transfer speed
            const actualSent = Math.max(0, bytesSent - buffered); 
            const elapsed = (now - startTime) / 1000;
            const speed   = elapsed > 0 ? actualSent / elapsed : 0;
            const pct     = Math.round((actualSent / file.size) * 100);
            onProgress?.(fileId, pct, speed, 'webrtc');
          }

          // Direct call to keep pipeline full without artificial latency
          sendNextChunk();
        } catch (err) {
          console.error('[TX] Send error:', err);
          onProgress?.(fileId, 'failed', 0, 'webrtc');
        }
      };

      reader.onerror = () => {
        console.error('[TX] FileReader error');
        onProgress?.(fileId, 'failed', 0, 'webrtc');
      };

      sendNextChunk();
    }

    // ══════════════════════════════════════════════════════════════════════
    //  RELAY PATH (unchanged)
    // ══════════════════════════════════════════════════════════════════════
    else {
      if (!socket || !targetPeer.socketId) {
        onProgress?.(fileId, 'failed', 0, 'relay');
        return fileId;
      }

      const totalChunks = Math.ceil(file.size / CHUNK_SIZE_RELAY);
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
            const end = Math.min(fOff + CHUNK_SIZE_RELAY, file.size);
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
            if (now - lastUI > UI_THROTTLE_MS) {
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
  //  RECEIVE RAW CHUNK — called for raw ArrayBuffer data (no wrapper)
  // ═══════════════════════════════════════════════════════════════════════════
  receiveRawChunk: (buffer, peerId, onProgress, onComplete) => {
    if (!activeIncomingFileId) return;
    const t = incomingTransfers[activeIncomingFileId];
    if (!t) return;

    t.chunks.set(t.chunkCount, buffer);
    t.chunkCount++;
    t.receivedSize += buffer.byteLength;

    const now = performance.now();
    if (now - t.lastUITime > UI_THROTTLE_MS) {
      t.lastUITime = now;
      const elapsed = (now - t.startTime) / 1000;
      const speed = elapsed > 0 ? t.receivedSize / elapsed : 0;
      const pct = t.metadata.size > 0 ? Math.round((t.receivedSize / t.metadata.size) * 100) : 0;
      onProgress?.(activeIncomingFileId, t.metadata, pct, speed, 'webrtc');
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  RECEIVE DATA — JSON control messages (metadata, end, relay)
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
        chunks: new Map(),
        chunkCount: 0,
        receivedSize: 0,
        startTime: performance.now(),
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

      t.chunks.set(data.index, data.data);
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
      if (now - t.lastUITime > UI_THROTTLE_MS) {
        t.lastUITime = now;
        const elapsed = (now - t.startTime) / 1000;
        const speed = elapsed > 0 ? t.receivedSize / elapsed : 0;
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

      // Ordered reassembly using chunkCount (not totalChunks)
      const orderedChunks = Array.from(
        { length: t.chunkCount },
        (_, i) => t.chunks.get(i) || new ArrayBuffer(0)
      );
      const blob = new Blob(orderedChunks, { type: t.metadata.type });
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
