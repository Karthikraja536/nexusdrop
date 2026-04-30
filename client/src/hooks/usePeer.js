import { useEffect, useRef } from 'react';
import Peer from 'peerjs';
import useStore from '../store/useStore';
import { TransferManager } from '../utils/transferManager';

const isDev = import.meta.env.DEV;
const PEER_HOST = window.location.hostname;
const PEER_PORT = isDev ? 3001 : (Number(window.location.port) || 443);

// STUN only — exact match to reference
const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

// ─── File channel data handler ───────────────────────────────────────────────
// Handles raw DC messages: ArrayBuffer = chunk, string = JSON control message
function createFileChannelHandler(peerId) {
  const onProgress = (fId, meta, prog, speed, transport) =>
    useStore.getState().updateTransferProgress(fId, { ...meta, peerId }, prog, speed, transport);

  const onComplete = (fId, meta, url) => {
    useStore.getState().completeTransfer(fId, { ...meta, peerId }, url);
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = meta.name || 'nexusdrop-file';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {}
  };

  return (event) => {
    const data = event.data;

    // Raw ArrayBuffer = file chunk
    if (data instanceof ArrayBuffer) {
      TransferManager.receiveRawChunk(data, peerId, onProgress, onComplete);
      return;
    }

    // String = JSON control message (metadata / end)
    if (typeof data === 'string') {
      let msg;
      try { msg = JSON.parse(data); } catch { return; }
      if (!msg || typeof msg !== 'object') return;

      if (msg.type === 'file-metadata' || msg.type === 'file-end') {
        TransferManager.receiveData(msg, peerId, onProgress, onComplete, null, 'webrtc', null);
      }
    }
  };
}

export function usePeer() {
  const peerRef = useRef(null);

  const {
    roomCode, isHost, hostPeerId,
    setPeer, setMyPeerId, addPeer, removePeer
  } = useStore();

  // ── PeerJS data handler for chat + relay ACKs (NOT file transfer) ──
  const createDataHandler = (conn, peerId) => {
    const onProgress = (fId, meta, prog, speed, transport) =>
      useStore.getState().updateTransferProgress(fId, { ...meta, peerId }, prog, speed, transport);

    const onComplete = (fId, meta, url) => {
      useStore.getState().completeTransfer(fId, { ...meta, peerId }, url);
      try {
        const a = document.createElement('a');
        a.href = url;
        a.download = meta.name || 'nexusdrop-file';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } catch (e) {}
    };

    return (data) => {
      // If file channel isn't set up yet, handle file data via PeerJS fallback
      if (data instanceof ArrayBuffer) {
        TransferManager.receiveRawChunk(data, peerId, onProgress, onComplete);
        return;
      }

      if (typeof data === 'string') {
        let msg;
        try { msg = JSON.parse(data); } catch { return; }
        if (!msg || typeof msg !== 'object') return;

        // File transfer control (fallback if fileChannel not available)
        if (msg.type === 'file-metadata' || msg.type === 'file-end') {
          TransferManager.receiveData(msg, peerId, onProgress, onComplete, null, 'webrtc', null);
          return;
        }

        // Chat
        if (msg.type === 'chat') {
          useStore.getState().addMessage({ ...msg, isMe: false });
          if (useStore.getState().isHost) {
            const peers = useStore.getState().peers;
            peers.forEach(p => {
              if (p.id !== peerId && p.conn && p.conn.open) p.conn.send(JSON.stringify(msg));
            });
          }
          return;
        }

        // File ACK (relay)
        if (msg.type === 'file-ack') {
          TransferManager.receiveAck(msg.fileId, msg.index);
          return;
        }
      }
    };
  };

  // Wire ICE failure detection
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

  // ═══════════════════════════════════════════════════════════════════════════
  //  Create a DEDICATED file transfer DataChannel on the underlying
  //  RTCPeerConnection. This channel uses:
  //    ordered: false     — eliminates SCTP head-of-line blocking
  //    maxRetransmits: 3  — semi-reliable (exact match to reference)
  //  This is THE key difference that makes the reference get 9 MB/s.
  // ═══════════════════════════════════════════════════════════════════════════
  const setupFileChannel = (conn, peerId, isInitiator) => {
    const pc = conn.peerConnection;
    if (!pc) {
      console.warn('[FC] No peerConnection available');
      return;
    }

    if (isInitiator) {
      // HOST creates the file transfer channel
      const fc = pc.createDataChannel('fileTransfer', {
        ordered: false,
        maxRetransmits: 3
      });

      fc.binaryType = 'arraybuffer';
      fc.bufferedAmountLowThreshold = 4 * 1024 * 1024;

      fc.onopen = () => {
        console.log(`[FC] ✅ File channel OPEN (initiator) for ${peerId} | ordered:${fc.ordered}`);
        // Attach to the peer so TransferManager can use it
        const peers = useStore.getState().peers;
        const peer = peers.find(p => p.id === peerId);
        if (peer) {
          peer.fileChannel = fc;
        }
      };

      fc.onmessage = createFileChannelHandler(peerId);

      fc.onerror = (e) => console.error('[FC] Error:', e);
      fc.onclose = () => console.log('[FC] File channel closed');

    } else {
      // CLIENT listens for the file transfer channel
      pc.ondatachannel = (event) => {
        if (event.channel.label === 'fileTransfer') {
          const fc = event.channel;
          fc.binaryType = 'arraybuffer';
          fc.bufferedAmountLowThreshold = 4 * 1024 * 1024;

          fc.onopen = () => {
            console.log(`[FC] ✅ File channel OPEN (receiver) for ${peerId} | ordered:${fc.ordered}`);
            const peers = useStore.getState().peers;
            const peer = peers.find(p => p.id === peerId);
            if (peer) {
              peer.fileChannel = fc;
            }
          };

          fc.onmessage = createFileChannelHandler(peerId);

          fc.onerror = (e) => console.error('[FC] Error:', e);
          fc.onclose = () => console.log('[FC] File channel closed');
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
      host: PEER_HOST,
      port: PEER_PORT,
      path: '/peerjs',
      debug: 2,
      config: ICE_CONFIG
    });

    peer.on('open', (id) => setMyPeerId(id));
    peer.on('error', (err) => console.error('❌ PeerJS Error:', err));

    // ── HOST ──
    if (isHost) {
      peer.on('connection', (conn) => {
        conn.on('open', () => {
          console.log('✅ PeerJS connected to Client:', conn.peer);

          addPeer({
            id: conn.peer,
            name: conn.metadata?.name || 'Unknown',
            type: conn.metadata?.type || 'desktop',
            conn,
            relayMode: false,
            fileChannel: null  // will be set when fileTransfer DC opens
          });

          wireIce(conn, conn.peer);

          // HOST is the initiator — creates the fileTransfer DataChannel
          setupFileChannel(conn, conn.peer, true);
        });

        conn.on('data', createDataHandler(conn, conn.peer));
        conn.on('error', () => removePeer(conn.peer));
        conn.on('close', () => removePeer(conn.peer));
      });
    }

    peerRef.current = peer;
    setPeer(peer);
    return () => {
      peer.destroy();
      setPeer(null);
    };
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

        addPeer({
          id: hostPeerId,
          name: 'Host Device',
          type: 'desktop',
          conn,
          relayMode: false,
          fileChannel: null  // will be set when host's fileTransfer DC arrives
        });

        wireIce(conn, hostPeerId);

        // CLIENT is NOT the initiator — listens for the fileTransfer DataChannel
        setupFileChannel(conn, hostPeerId, false);
      });

      conn.on('error', (err) => console.error('❌ Connection error:', err));
      conn.on('data', createDataHandler(conn, hostPeerId));
      conn.on('close', () => {
        useStore.getState().removePeer(hostPeerId);
        useStore.setState({ hostPeerId: null, isDisconnected: true });
      });
    }
  }, [isHost, hostPeerId, addPeer]);

  return peerRef.current;
}
