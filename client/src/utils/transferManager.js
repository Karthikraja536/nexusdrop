import useStore from '../store/useStore';

// ─── Constants — exact match to reference (9 MB/s proven) ────────────────────
const MAX_BUFFER       = 16 * 1024 * 1024;    // 16 MB
const RELAY_CHUNK      = 512 * 1024;
const RELAY_WINDOW     = 8;
const STALL_TIMEOUT    = 60000;
const UI_INTERVAL      = 250;

const getOptimalChunkSize = (dc) => {
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  
  let targetSize = 256 * 1024;
  if (isIOS) targetSize = 64 * 1024;

  if (dc?.maxMessageSize && dc.maxMessageSize > 0 && dc.maxMessageSize < targetSize) {
    targetSize = dc.maxMessageSize;
  }
  // Reserve 5 bytes for the transferId (1) + chunk index (4)
  return targetSize - 5;
};

// ─── Module state ────────────────────────────────────────────────────────────
const incomingTransfers = {};
const activeSends       = {};
const peerActiveFiles   = {}; // "peerId-transferId" -> fileId

export const TransferManager = {

  receiveMetadataAck: (fileId) => {
    if (activeSends[fileId] && activeSends[fileId].start) {
      activeSends[fileId].start();
      delete activeSends[fileId].start;
    }
  },

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

      const totalChunks = Math.ceil(file.size / getOptimalChunkSize(dc));

      const transferId = Math.floor(Math.random() * 256);

      // 1. Send metadata as JSON string
      dc.send(JSON.stringify({
        type: 'file-metadata',
        fileId,
        transferId,
        metadata: {
          name: file.name,
          size: file.size,
          type: file.type || 'application/octet-stream',
          totalChunks,
          chunkSize: getOptimalChunkSize(dc)
        }
      }));

      console.log(`[TX] Start: ${file.name} | ${(file.size / 1048576).toFixed(1)} MB | ${totalChunks} chunks | ordered:${dc.ordered}`);

      const HIGH_WATERMARK = 16 * 1024 * 1024;
      const LOW_WATERMARK  = 8 * 1024 * 1024;
      dc.bufferedAmountLowThreshold = LOW_WATERMARK;
      
      const chunkSize = getOptimalChunkSize(dc);
      const totalSize = file.size;

      let canSend = true;
      dc.onbufferedamountlow = () => { canSend = true; };

      const sendLoop = async () => {
        let offset = 0;
        let sentSize = 0;
        let chunkIndex = 0;
        const startTime = performance.now();
        let lastProgressUI = 0;

        const throughputInterval = setInterval(() => {
          if (dc.readyState !== 'open') return clearInterval(throughputInterval);
        }, 500);

        try {
          await new Promise(r => setTimeout(r, 100));

          while (offset < totalSize) {
            while (!canSend || dc.bufferedAmount > HIGH_WATERMARK) {
              if (dc.readyState !== 'open') throw new Error('DC closed');
              if (dc.bufferedAmount <= LOW_WATERMARK) canSend = true;
              await new Promise(r => setTimeout(r, 5));
            }

            const currentChunkSize = Math.min(chunkSize, totalSize - offset);
            const slice = file.slice(offset, offset + currentChunkSize);
            const rawChunk = await slice.arrayBuffer();

            const buffer = new ArrayBuffer(5 + rawChunk.byteLength);
            const view = new DataView(buffer);
            view.setUint8(0, transferId);
            view.setUint32(1, chunkIndex, true);
            new Uint8Array(buffer, 5).set(new Uint8Array(rawChunk));

            let sent = false;
            while (!sent) {
              try {
                dc.send(buffer);
                sent = true;
              } catch (err) {
                if (err.name === 'OperationError' || err.message?.toLowerCase().includes('buffer') || err.message?.toLowerCase().includes('large')) {
                  await new Promise(r => setTimeout(r, 20));
                } else {
                  throw err;
                }
              }
            }

            if (dc.bufferedAmount >= HIGH_WATERMARK) canSend = false;

            offset += rawChunk.byteLength;
            sentSize += rawChunk.byteLength;
            chunkIndex++;

            const now = performance.now();
            if (now - lastProgressUI >= UI_INTERVAL || offset >= totalSize) {
              lastProgressUI = now;
              const elapsed = (now - startTime) / 1000;
              onProgress?.(fileId, totalSize > 0 ? Math.min(100, Math.round((offset / totalSize) * 100)) : 0, elapsed > 0 ? offset / elapsed : 0, 'webrtc');
            }
          }

          dc.send(JSON.stringify({ type: 'file-end', fileId }));
          
          const totalTime = (performance.now() - startTime) / 1000;
          const avgSpeed = totalTime > 0 ? totalSize / totalTime : 0;
          console.log(`[TX] ✅ Complete: ${file.name} | ${(totalSize / 1048576).toFixed(1)} MB in ${totalTime.toFixed(1)}s | ${(avgSpeed / 1048576).toFixed(1)} MB/s`);
          onProgress?.(fileId, 100, avgSpeed, 'webrtc');

        } catch (err) {
          console.error('[TX] Send loop error:', err);
          onProgress?.(fileId, 'failed', 0, 'webrtc');
        } finally {
          clearInterval(throughputInterval);
        }
      };

      activeSends[fileId] = {
         start: () => { sendLoop(); }
      };

      setTimeout(() => {
          if (activeSends[fileId] && activeSends[fileId].start) {
              console.warn(`[TX] No metadata ACK received for ${fileId}, starting anyway.`);
              activeSends[fileId].start();
              delete activeSends[fileId].start;
          }
      }, 3000);
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
    const view = new DataView(buffer);
    const transferId = view.getUint8(0);
    const index = view.getUint32(1, true);
    const chunkData = new Uint8Array(buffer, 5);

    const peerTransferKey = `${peerId}-${transferId}`;
    const fId = peerActiveFiles[peerTransferKey];
    if (!fId) return;
    const t = incomingTransfers[fId];
    if (!t) return;

    if (t.chunkCount === 0) t.startTime = performance.now();

    if (!t.receivedIndices) t.receivedIndices = new Set();
    if (t.receivedIndices.has(index)) return; // Prevent dupes
    t.receivedIndices.add(index);

    t.chunkCount++;
    t.receivedSize += chunkData.byteLength;

    if (t.useFileSystem) {
        t.writeQueue.push({ index, data: chunkData });
        TransferManager._processWriteQueue(t, onProgress, onComplete);
    } else {
        t.chunks[index] = chunkData;
    }

    if (!t.useFileSystem && t.isEndReceived && t.chunkCount >= t.metadata.totalChunks) {
      TransferManager._finalizeTransfer(fId, onProgress, onComplete);
      return;
    }

    const now = performance.now();
    if (now - t.lastUITime > UI_INTERVAL) {
      t.lastUITime = now;
      const elapsed = (now - t.startTime) / 1000;
      const speed = elapsed > 0.1 ? t.receivedSize / elapsed : 0;
      const pct = t.metadata.size > 0 ? Math.round((t.receivedSize / t.metadata.size) * 100) : 0;
      onProgress?.(fId, t.metadata, Math.min(pct, 99), speed, 'webrtc');
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
      const isDesktopChrome = 'showSaveFilePicker' in window && !(/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent));
      
      const t = {
        metadata: data.metadata, chunks: [], chunkCount: 0,
        receivedSize: 0, startTime: performance.now(), lastUITime: 0,
        useFileSystem: isDesktopChrome, streamWriter: null, streamReady: false,
        writeQueue: [], isWriting: false, writtenSize: 0, isEndReceived: false, fileId: data.fileId,
        chunkSize: data.metadata.chunkSize, receivedIndices: new Set(),
        transferId: data.transferId
      };
      incomingTransfers[data.fileId] = t;

      if (transportType === 'webrtc' && peerId && data.transferId !== undefined) {
         peerActiveFiles[`${peerId}-${data.transferId}`] = data.fileId;
      }
      
      if (sendAck) sendAck(data.fileId);

      if (isDesktopChrome) {
        const overlay = document.createElement('div');
        overlay.innerHTML = `
          <div style="position:fixed;bottom:20px;right:20px;background:#222;color:#fff;padding:15px;border-radius:8px;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.5);font-family:sans-serif;display:flex;align-items:center;gap:15px;">
            <div>
              <h4 style="margin:0 0 5px 0;font-size:14px;">Incoming: ${data.metadata.name}</h4>
              <p style="margin:0;font-size:12px;color:#aaa;">Click to enable high-speed disk save.</p>
            </div>
            <button id="nd-accept-btn" style="background:#007bff;color:#fff;border:none;padding:8px 12px;border-radius:4px;cursor:pointer;">Save</button>
            <button id="nd-cancel-btn" style="background:transparent;color:#aaa;border:1px solid #555;padding:8px 12px;border-radius:4px;cursor:pointer;">Memory</button>
          </div>
        `;
        document.body.appendChild(overlay);

        let fallbackToMemory = () => {
           t.useFileSystem = false;
           t.streamReady = true;
           if (document.body.contains(overlay)) document.body.removeChild(overlay);
           TransferManager._processWriteQueue(t, onProgress, onComplete);
        };

        const toastTimeout = setTimeout(fallbackToMemory, 10000);

        document.getElementById('nd-cancel-btn').onclick = () => {
           clearTimeout(toastTimeout);
           fallbackToMemory();
        };

        document.getElementById('nd-accept-btn').onclick = async () => {
            clearTimeout(toastTimeout);
            try {
                const handle = await window.showSaveFilePicker({ suggestedName: data.metadata.name });
                t.streamWriter = await handle.createWritable();
                t.streamReady = true;
                if (document.body.contains(overlay)) document.body.removeChild(overlay);
                TransferManager._processWriteQueue(t, onProgress, onComplete);
            } catch (err) {
                console.error('File picker cancelled', err);
                fallbackToMemory();
            }
        };
      } else {
         t.streamReady = true;
      }
      onProgress?.(data.fileId, data.metadata, 0, 0, transportType);
      return;
    }

    if (data.type === 'file-chunk') {
      const t = incomingTransfers[data.fileId];
      if (!t) return;
      if (!t.receivedIndices) t.receivedIndices = new Set();
      if (t.receivedIndices.has(data.index)) return; // prevent dupes
      t.receivedIndices.add(data.index);
      t.chunkCount++;
      t.receivedSize += (data.data?.byteLength || data.data?.length || 0);

      if (t.useFileSystem) {
         t.writeQueue.push({ index: data.index, data: data.data });
         TransferManager._processWriteQueue(t, onProgress, onComplete);
      } else {
         t.chunks[data.index] = data.data;
      }

      if (!t.useFileSystem && t.isEndReceived && t.chunkCount >= t.metadata.totalChunks) {
        TransferManager._finalizeTransfer(data.fileId, onProgress, onComplete);
        return;
      }

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
      
      t.isEndReceived = true;
      if (!t.useFileSystem && t.chunkCount >= t.metadata.totalChunks) {
        TransferManager._finalizeTransfer(fId, onProgress, onComplete);
      } else if (t.useFileSystem) {
        TransferManager._processWriteQueue(t, onProgress, onComplete);
      }
    }
  },

  _finalizeTransfer: (fId, onProgress, onComplete) => {
    const t = incomingTransfers[fId];
    if (!t) return;
    
    if (t.useFileSystem) {
        onProgress?.(fId, t.metadata, 100, 0, 'webrtc');
        onComplete?.(fId, t.metadata, null); // URL is null for direct save
    } else {
        const validChunks = t.chunks.filter(c => c !== undefined);
        const blob = new Blob(validChunks, { type: t.metadata.type });
        const url = URL.createObjectURL(blob);
        onProgress?.(fId, t.metadata, 100, 0, 'webrtc');
        onComplete?.(fId, t.metadata, url);
    }

    const peerTransferKey = Object.keys(peerActiveFiles).find(k => peerActiveFiles[k] === fId);
    if (peerTransferKey) delete peerActiveFiles[peerTransferKey];
    delete incomingTransfers[fId];
  },

  _processWriteQueue: async (t, onProgress, onComplete) => {
    if (t.isWriting) return;
    
    if (t.writeQueue.length === 0) {
        if (t.useFileSystem && t.streamReady && t.streamWriter && t.isEndReceived && t.chunkCount >= t.metadata.totalChunks) {
            t.isWriting = true;
            try { await t.streamWriter.close(); } catch(e) {}
            t.streamWriter = null;
            t.isWriting = false;
            TransferManager._finalizeTransfer(t.fileId, onProgress, onComplete);
        }
        return;
    }

    if (!t.streamReady || !t.streamWriter) {
        if (!t.useFileSystem) {
            while (t.writeQueue.length > 0) {
                const item = t.writeQueue.shift();
                t.chunks[item.index] = item.data;
            }
            if (t.isEndReceived && t.chunkCount >= t.metadata.totalChunks) {
                TransferManager._finalizeTransfer(t.fileId, onProgress, onComplete);
            }
        }
        return;
    }

    t.isWriting = true;
    try {
      while (t.writeQueue.length > 0) {
         const item = t.writeQueue.shift();
         const offset = item.index * t.chunkSize;
         await t.streamWriter.write({ type: 'write', position: offset, data: item.data });
         t.writtenSize += item.data.byteLength;
      }
      if (t.isEndReceived && t.chunkCount >= t.metadata.totalChunks) {
          await t.streamWriter.close();
          t.streamWriter = null;
          TransferManager._finalizeTransfer(t.fileId, onProgress, onComplete);
      }
    } catch (err) {
      console.error('Stream write error', err);
      t.useFileSystem = false;
      while (t.writeQueue.length > 0) {
          const item = t.writeQueue.shift();
          t.chunks[item.index] = item.data;
      }
      if (t.isEndReceived && t.chunkCount >= t.metadata.totalChunks) {
          TransferManager._finalizeTransfer(t.fileId, onProgress, onComplete);
      }
    }
    t.isWriting = false;

    if (t.writeQueue.length > 0) {
        TransferManager._processWriteQueue(t, onProgress, onComplete);
    }
  },
};
