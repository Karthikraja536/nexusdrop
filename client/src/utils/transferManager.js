import useStore from '../store/useStore';

// ─── Constants — exact match to reference (9 MB/s proven) ────────────────────
const CHUNK_SIZE       = 128 * 1024;          // 128 KB
const MAX_BUFFER       = 16 * 1024 * 1024;    // 16 MB
const RELAY_CHUNK      = 512 * 1024;
const RELAY_WINDOW     = 8;
const STALL_TIMEOUT    = 60000;
const UI_INTERVAL      = 250;

// ─── Module state ────────────────────────────────────────────────────────────
const incomingTransfers = {};
const activeSends       = {};
let activeIncomingFileId = null;

export const TransferManager = {

  receiveAck: (fileId, index) => {
    if (activeSends[fileId]) activeSends[fileId].ackReceived(index);
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  SEND FILE — exact reference pattern
  //  FileReader + setTimeout(10ms) + bufferedAmount backpressure
  // ═══════════════════════════════════════════════════════════════════════════
  sendFile: (targetPeer, file, onProgress) => {
    const fileId  = `${file.name}-${Date.now()}`;
    const isRelay = targetPeer.relayMode;
    const socket  = useStore.getState().socket;

    if (!isRelay) {
      // Use the raw DataChannel directly (no PeerJS wrapper)
      const dc = targetPeer.dataChannel;
      if (!dc || dc.readyState !== 'open') {
        console.error('[TX] DataChannel not open', dc?.readyState);
        onProgress?.(fileId, 'failed', 0, 'webrtc');
        return fileId;
      }

      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

      // 1. Send metadata as JSON string
      dc.send(JSON.stringify({
        type: 'file-metadata',
        fileId,
        metadata: {
          name: file.name,
          size: file.size,
          type: file.type || 'application/octet-stream',
          totalChunks
        }
      }));

      console.log(`[TX] Start: ${file.name} | ${(file.size / 1048576).toFixed(1)} MB | ${totalChunks} chunks | ordered:${dc.ordered}`);

      // 2. FileReader + setTimeout(10ms) — EXACT reference pattern
      const reader     = new FileReader();
      let offset       = 0;
      let sentSize     = 0;
      let isFinished   = false;
      const startTime  = performance.now();
      let lastUI       = 0;

      const sendNextChunk = () => {
        if (isFinished) return;

        if (offset >= file.size) {
          dc.send(JSON.stringify({ type: 'file-end', fileId }));
          isFinished = true;
          const totalTime = (performance.now() - startTime) / 1000;
          const avgSpeed = totalTime > 0 ? file.size / totalTime : 0;
          console.log(`[TX] ✅ Complete: ${file.name} | ${(file.size / 1048576).toFixed(1)} MB in ${totalTime.toFixed(1)}s | ${(avgSpeed / 1048576).toFixed(1)} MB/s`);
          onProgress?.(fileId, 100, avgSpeed, 'webrtc');
          return;
        }

        // Backpressure — exact match to reference
        if (dc.bufferedAmount > MAX_BUFFER) {
          dc.onbufferedamountlow = () => {
            dc.onbufferedamountlow = null;
            sendNextChunk();
          };
          return;
        }

        if (dc.readyState === 'open') {
          const slice = file.slice(offset, offset + CHUNK_SIZE);
          reader.readAsArrayBuffer(slice);
        } else {
          console.error('[TX] DC closed mid-transfer');
          onProgress?.(fileId, 'failed', 0, 'webrtc');
        }
      };

      reader.onload = (event) => {
        try {
          if (dc.readyState !== 'open') {
            console.warn('[TX] DC closed during read, stopping');
            return; // Don't mark as failed — data may still be in flight
          }
          dc.send(event.target.result);
          const chunkLen = event.target.result.byteLength;
          offset   += chunkLen;
          sentSize += chunkLen;

          const now = performance.now();
          if (now - lastUI > UI_INTERVAL) {
            lastUI = now;
            const elapsed = (now - startTime) / 1000;
            const speed   = elapsed > 0 ? sentSize / elapsed : 0;
            const pct     = Math.round((sentSize / file.size) * 100);
            onProgress?.(fileId, Math.min(pct, 99), speed, 'webrtc');
          }

          // 10ms yield — exact match to reference
          setTimeout(sendNextChunk, 10);
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
    //  RELAY PATH
    // ══════════════════════════════════════════════════════════════════════
    else {
      if (!socket || !targetPeer.socketId) {
        onProgress?.(fileId, 'failed', 0, 'relay');
        return fileId;
      }

      const totalChunks = Math.ceil(file.size / RELAY_CHUNK);
      socket.emit('relay-file-metadata', {
        targetSocketId: targetPeer.socketId, fileId,
        metadata: { name: file.name, size: file.size, type: file.type || 'application/octet-stream', totalChunks, transport: 'relay' },
        type: 'file-metadata'
      });

      let relayAcks = 0, chunkIndex = 0, bytesSent = 0, isFailed = false, stallTimer = null;

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
            socket.emit('relay-file-chunk', { targetSocketId: targetPeer.socketId, fileId, index: chunkIndex, data: buf, type: 'file-chunk' });
            bytesSent += buf.byteLength;
            chunkIndex++;
            fOff = end;
            const now = performance.now();
            if (now - lastUI > UI_INTERVAL) {
              lastUI = now;
              const elapsed = (now - sTime) / 1000;
              onProgress?.(fileId, Math.round((bytesSent / file.size) * 100), elapsed > 0 ? bytesSent / elapsed : 0, 'relay');
            }
          }
          if (!isFailed) {
            socket.emit('relay-file-end', { targetSocketId: targetPeer.socketId, fileId, type: 'file-end' });
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
  //  RECEIVE RAW CHUNK
  // ═══════════════════════════════════════════════════════════════════════════
  receiveRawChunk: (buffer, peerId, onProgress, onComplete) => {
    if (!activeIncomingFileId) return;
    const t = incomingTransfers[activeIncomingFileId];
    if (!t) return;

    if (t.chunkCount === 0) t.startTime = performance.now();

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
  //  RECEIVE DATA — JSON control + relay chunks
  // ═══════════════════════════════════════════════════════════════════════════
  receiveData: (data, peerId, onProgress, onComplete, onTimeout, transportType = 'webrtc', sendAck = null) => {
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch { return; }
    }
    if (!data || typeof data !== 'object') return;

    if (data.type === 'file-metadata') {
      incomingTransfers[data.fileId] = {
        metadata: data.metadata, chunks: [], chunkCount: 0,
        receivedSize: 0, startTime: performance.now(), lastUITime: 0
      };
      activeIncomingFileId = data.fileId;
      onProgress?.(data.fileId, data.metadata, 0, 0, transportType);
      return;
    }

    if (data.type === 'file-chunk') {
      const t = incomingTransfers[data.fileId];
      if (!t) return;
      t.chunks[data.index] = data.data;
      t.chunkCount = Math.max(t.chunkCount, data.index + 1);
      t.receivedSize += (data.data?.byteLength || data.data?.length || 0);
      if (data.senderSocketId) {
        const sock = useStore.getState().socket;
        if (sock) sock.emit('relay-ack', { targetSocketId: data.senderSocketId, fileId: data.fileId, index: data.index });
      } else if (sendAck) { sendAck(data.fileId, data.index); }
      const now = performance.now();
      if (now - t.lastUITime > UI_INTERVAL) {
        t.lastUITime = now;
        const elapsed = (now - t.startTime) / 1000;
        onProgress?.(data.fileId, t.metadata, Math.round((t.receivedSize / t.metadata.size) * 100), elapsed > 0.1 ? t.receivedSize / elapsed : 0, transportType);
      }
      return;
    }

    if (data.type === 'file-end') {
      const fId = data.fileId;
      const t = incomingTransfers[fId];
      if (!t) return;
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
    }
  }
};
