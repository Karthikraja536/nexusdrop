import { useEffect, useRef } from 'react';
import Peer from 'peerjs';
import useStore from '../store/useStore';
import { TransferManager } from '../utils/transferManager';
import { setFileChannel, removeFileChannel } from '../utils/fileChannelStore';

const isDev = import.meta.env.DEV;
const PEER_HOST = window.location.hostname;
const PEER_PORT = isDev ? 3001 : (Number(window.location.port) || 443);

const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

// ── Shared file-channel message handler ──────────────────────────────────────
function makeFileHandler(peerId) {
  const getCallbacks = () => {
    const onProgress = (fId, meta, prog, speed, transport) =>
      useStore.getState().updateTransferProgress(fId, { ...meta, peerId }, prog, speed, transport);
    const onComplete = (fId, meta, url) => {
      useStore.getState().completeTransfer(fId, { ...meta, peerId }, url);
      try {
        const a = document.createElement('a');
        a.href = url; a.download = meta.name || 'nexusdrop-file';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
      } catch (e) {}
    };
    return { onProgress, onComplete };
  };

  return (event) => {
    const data = event.data;
    const { onProgress, onComplete } = getCallbacks();

    if (data instanceof ArrayBuffer) {
      TransferManager.receiveRawChunk(data, peerId, onProgress, onComplete);
      return;
    }
    if (typeof data === 'string') {
      let msg;
      try { msg = JSON.parse(data); } catch { return; }
      if (msg && (msg.type === 'file-metadata' || msg.type === 'file-end')) {
        TransferManager.receiveData(msg, peerId, onProgress, onComplete, null, 'webrtc', null);
      }
    }
  };
}

// ── Setup dedicated file transfer DataChannel ────────────────────────────────
// Uses addEventListener('datachannel') to NOT override PeerJS's ondatachannel
function setupFileChannel(conn, peerId, isInitiator) {
  const pc = conn.peerConnection;
  if (!pc) { console.warn('[FC] No peerConnection'); return; }

  if (isInitiator) {
    // Create unordered DC — exact match to reference (ordered:false, maxRetransmits:3)
    const fc = pc.createDataChannel('fileTransfer', {
      ordered: false,
      maxRetransmits: 3
    });
    fc.binaryType = 'arraybuffer';
    fc.bufferedAmountLowThreshold = 4 * 1024 * 1024;

    fc.onopen = () => {
      console.log(`[FC] ✅ File channel OPEN (initiator→${peerId}) ordered:${fc.ordered}`);
      setFileChannel(peerId, fc);
    };
    fc.onmessage = makeFileHandler(peerId);
    fc.onerror = (e) => console.error('[FC] Error:', e);
    fc.onclose = () => { console.log('[FC] Closed'); removeFileChannel(peerId); };
  } else {
    // Use addEventListener so we don't override PeerJS's ondatachannel
    pc.addEventListener('datachannel', (event) => {
      if (event.channel.label !== 'fileTransfer') return;
      const fc = event.channel;
      fc.binaryType = 'arraybuffer';
      fc.bufferedAmountLowThreshold = 4 * 1024 * 1024;

      fc.onopen = () => {
        console.log(`[FC] ✅ File channel OPEN (receiver←${peerId}) ordered:${fc.ordered}`);
        setFileChannel(peerId, fc);
      };
      // If already open (can happen), store immediately
      if (fc.readyState === 'open') {
        console.log(`[FC] ✅ File channel already OPEN for ${peerId}`);
        setFileChannel(peerId, fc);
      }
      fc.onmessage = makeFileHandler(peerId);
      fc.onerror = (e) => console.error('[FC] Error:', e);
      fc.onclose = () => { console.log('[FC] Closed'); removeFileChannel(peerId); };
    });
  }
}

export function usePeer() {
  const peerRef = useRef(null);

  const {
    roomCode, isHost, hostPeerId,
    setPeer, setMyPeerId, addPeer, removePeer
  } = useStore();

  // ── PeerJS data handler (chat + relay + fallback file transfer) ──
  const createDataHandler = (conn, peerId) => {
    const onProgress = (fId, meta, prog, speed, transport) =>
      useStore.getState().updateTransferProgress(fId, { ...meta, peerId }, prog, speed, transport);
    const onComplete = (fId, meta, url) => {
      useStore.getState().completeTransfer(fId, { ...meta, peerId }, url);
      try {
        const a = document.createElement('a');
        a.href = url; a.download = meta.name || 'nexusdrop-file';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
      } catch (e) {}
    };

    return (data) => {
      // Fallback: if file channel isn't set up, handle file data here
      if (data instanceof ArrayBuffer) {
        TransferManager.receiveRawChunk(data, peerId, onProgress, onComplete);
        return;
      }
      if (typeof data === 'string') {
        let msg;
        try { msg = JSON.parse(data); } catch { return; }
        if (!msg || typeof msg !== 'object') return;

        if (msg.type === 'file-metadata' || msg.type === 'file-end') {
          TransferManager.receiveData(msg, peerId, onProgress, onComplete, null, 'webrtc', null);
          return;
        }
        if (msg.type === 'chat') {
          useStore.getState().addMessage({ ...msg, isMe: false });
          if (useStore.getState().isHost) {
            useStore.getState().peers.forEach(p => {
              if (p.id !== peerId && p.conn && p.conn.open) p.conn.send(JSON.stringify(msg));
            });
          }
          return;
        }
        if (msg.type === 'file-ack') {
          TransferManager.receiveAck(msg.fileId, msg.index);
          return;
        }
      }
    };
  };

  const wireIce = (conn, peerId) => {
    if (conn.peerConnection) {
      conn.peerConnection.oniceconnectionstatechange = () => {
        const s = conn.peerConnection?.iceConnectionState;
        if (s === 'disconnected' || s === 'failed' || s === 'closed') {
          console.warn(`ICE failure for ${peerId} — switching to relay`);
          addPeer({ id: peerId, conn: null, relayMode: true });
        }
      };
    }
  };

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 1. Initialize PeerJS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  useEffect(() => {
    if (!roomCode) return;

    const peer = new Peer(undefined, {
      host: PEER_HOST, port: PEER_PORT,
      path: '/peerjs', debug: 2, config: ICE_CONFIG
    });

    peer.on('open', (id) => setMyPeerId(id));
    peer.on('error', (err) => console.error('❌ PeerJS Error:', err));

    if (isHost) {
      peer.on('connection', (conn) => {
        conn.on('open', () => {
          console.log('✅ PeerJS connected to Client:', conn.peer);
          addPeer({
            id: conn.peer,
            name: conn.metadata?.name || 'Unknown',
            type: conn.metadata?.type || 'desktop',
            conn, relayMode: false
          });
          wireIce(conn, conn.peer);
          // HOST creates the dedicated file transfer DC
          setupFileChannel(conn, conn.peer, true);
        });
        conn.on('data', createDataHandler(conn, conn.peer));
        conn.on('error', () => removePeer(conn.peer));
        conn.on('close', () => { removePeer(conn.peer); removeFileChannel(conn.peer); });
      });
    }

    peerRef.current = peer;
    setPeer(peer);
    return () => { peer.destroy(); setPeer(null); };
  }, [roomCode, isHost, setPeer, setMyPeerId, addPeer, removePeer]);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 2. CLIENT: Dial the Host
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  useEffect(() => {
    if (!isHost && hostPeerId && peerRef.current) {
      console.log('📡 Dialing host:', hostPeerId);

      const conn = peerRef.current.connect(hostPeerId, {
        reliable: true,
        serialization: 'raw',
        metadata: {
          name: navigator.userAgent.includes('Mobile') ? 'Mobile Device' : 'Desktop Device',
          type: navigator.userAgent.includes('Mobile') ? 'phone' : 'desktop'
        }
      });

      conn.on('open', () => {
        console.log('✅ PeerJS open to Host!');
        addPeer({ id: hostPeerId, name: 'Host Device', type: 'desktop', conn, relayMode: false });
        wireIce(conn, hostPeerId);
        // CLIENT listens for the dedicated file transfer DC from host
        setupFileChannel(conn, hostPeerId, false);
      });

      conn.on('error', (err) => console.error('❌ Connection error:', err));
      conn.on('data', createDataHandler(conn, hostPeerId));
      conn.on('close', () => {
        useStore.getState().removePeer(hostPeerId);
        removeFileChannel(hostPeerId);
        useStore.setState({ hostPeerId: null, isDisconnected: true });
      });
    }
  }, [isHost, hostPeerId, addPeer]);

  return peerRef.current;
}
