import { useEffect, useRef } from 'react';
import Peer from 'peerjs';
import useStore from '../store/useStore';
import { TransferManager } from '../utils/transferManager';

const isDev = import.meta.env.DEV;
const PEER_HOST = window.location.hostname;
const PEER_PORT = isDev ? 3001 : (Number(window.location.port) || 443);

// STUN only — NO TURN. Exact match to reference.
const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

export function usePeer() {
  const peerRef = useRef(null);

  const {
    roomCode, isHost, hostPeerId,
    setPeer, setMyPeerId, addPeer, removePeer
  } = useStore();

  // ── Data handler: handles raw ArrayBuffer + JSON strings ──
  const createDataHandler = (conn, peerId) => {

    // Shared callbacks for TransferManager
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
      // Raw ArrayBuffer = file chunk (no wrapper, no MsgPack)
      if (data instanceof ArrayBuffer) {
        TransferManager.receiveRawChunk(data, peerId, onProgress, onComplete);
        return;
      }

      // String = JSON control message
      if (typeof data === 'string') {
        let msg;
        try { msg = JSON.parse(data); } catch { return; }
        if (!msg || typeof msg !== 'object') return;

        // File transfer control (metadata / end)
        if (msg.type === 'file-metadata' || msg.type === 'file-end') {
          TransferManager.receiveData(
            msg, peerId, onProgress, onComplete, null, 'webrtc', null
          );
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

          const dc = conn._dc;
          if (dc) {
            dc.bufferedAmountLowThreshold = 16 * 1024 * 1024;
            console.log(`[DC] Host raw DC | ordered:${dc.ordered} | protocol:${dc.protocol}`);
          }

          addPeer({
            id: conn.peer,
            name: conn.metadata?.name || 'Unknown',
            type: conn.metadata?.type || 'desktop',
            conn,
            relayMode: false
          });
          wireIce(conn, conn.peer);
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

        const dc = conn._dc;
        if (dc) {
          dc.bufferedAmountLowThreshold = 16 * 1024 * 1024;
          console.log(`[DC] Client raw DC | ordered:${dc.ordered} | protocol:${dc.protocol}`);
        }

        addPeer({ id: hostPeerId, name: 'Host Device', type: 'desktop', conn, relayMode: false });
        wireIce(conn, hostPeerId);
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
