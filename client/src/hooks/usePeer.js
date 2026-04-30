import { useEffect, useRef } from 'react';
import useStore from '../store/useStore';
import { TransferManager } from '../utils/transferManager';

// STUN only — exact match to reference
const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

export function usePeer() {
  const pcRef = useRef(null);   // RTCPeerConnection
  const dcRef = useRef(null);   // DataChannel for file transfer

  const {
    roomCode, isHost, hostPeerId, socket,
    setMyPeerId, addPeer, removePeer
  } = useStore();

  // ── Create callbacks for TransferManager ──────────────────────────────
  const makeCallbacks = (peerId) => {
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

    return { onProgress, onComplete };
  };

  // ── Wire up DataChannel event handlers ────────────────────────────────
  const setupDataChannel = (dc, peerId) => {
    dc.binaryType = 'arraybuffer';
    dc.bufferedAmountLowThreshold = 4 * 1024 * 1024;

    dc.onopen = () => {
      console.log(`[DC] ✅ DataChannel OPEN | ordered:${dc.ordered} | label:${dc.label}`);
      dcRef.current = dc;

      // Update the peer with the DC reference so TransferManager can use it
      const peers = useStore.getState().peers;
      const peer = peers.find(p => p.id === peerId);
      if (peer) {
        peer.dataChannel = dc;
      }
    };

    dc.onclose = () => {
      console.log('[DC] DataChannel closed');
      dcRef.current = null;
    };

    dc.onerror = (e) => console.error('[DC] Error:', e);

    const { onProgress, onComplete } = makeCallbacks(peerId);

    dc.onmessage = (event) => {
      const data = event.data;

      // Raw ArrayBuffer = file chunk
      if (data instanceof ArrayBuffer) {
        TransferManager.receiveRawChunk(data, peerId, onProgress, onComplete);
        return;
      }

      // String = JSON control message
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
          // Host broadcasts chat to other peers
          if (useStore.getState().isHost) {
            const peers = useStore.getState().peers;
            peers.forEach(p => {
              if (p.id !== peerId && p.dataChannel && p.dataChannel.readyState === 'open') {
                p.dataChannel.send(JSON.stringify(msg));
              }
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

  // ── Create RTCPeerConnection ──────────────────────────────────────────
  const createPeerConnection = (peerId, peerSocketId, isInitiator) => {
    const socket = useStore.getState().socket;
    if (!socket) return null;

    const pc = new RTCPeerConnection(ICE_CONFIG);
    pcRef.current = pc;

    // ICE candidate → send to remote peer via Socket.IO
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('webrtc-ice-candidate', {
          targetSocketId: peerSocketId,
          candidate: event.candidate
        });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('[WebRTC] Connection state:', pc.connectionState);
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        console.warn(`[WebRTC] Connection ${pc.connectionState} for ${peerId}`);
      }
    };

    pc.oniceconnectionstatechange = () => {
      const s = pc.iceConnectionState;
      console.log('[WebRTC] ICE state:', s);
      if (s === 'disconnected' || s === 'failed' || s === 'closed') {
        console.warn(`[WebRTC] ICE failure for ${peerId} — switching to relay`);
        addPeer({ id: peerId, relayMode: true, dataChannel: null });
      }
    };

    if (isInitiator) {
      // HOST creates the DataChannel — exact match to reference
      const dc = pc.createDataChannel('fileTransfer', {
        ordered: false,
        maxRetransmits: 3
      });
      setupDataChannel(dc, peerId);

      // Create and send offer
      pc.createOffer()
        .then(offer => pc.setLocalDescription(offer))
        .then(() => {
          socket.emit('webrtc-offer', {
            targetSocketId: peerSocketId,
            offer: pc.localDescription
          });
          console.log('[WebRTC] Offer sent to', peerId);
        })
        .catch(err => console.error('[WebRTC] Offer error:', err));

    } else {
      // CLIENT receives the DataChannel
      pc.ondatachannel = (event) => {
        console.log('[WebRTC] Received DataChannel:', event.channel.label);
        setupDataChannel(event.channel, peerId);
      };
    }

    return pc;
  };

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  WebRTC Signaling via Socket.IO
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  useEffect(() => {
    if (!roomCode || !socket) return;

    // Generate a simple unique ID (replaces PeerJS's peer ID)
    const myId = `peer-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    setMyPeerId(myId);

    // ── HOST: receives offers from clients ──
    const handleOffer = async ({ senderSocketId, offer }) => {
      console.log('[WebRTC] Received offer from', senderSocketId);

      // Find the peer info (was added by useSignaling when admitted)
      const peers = useStore.getState().peers;
      const peer = peers.find(p => p.socketId === senderSocketId);
      const peerId = peer?.id || senderSocketId;

      const pc = createPeerConnection(peerId, senderSocketId, false);
      if (!pc) return;

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit('webrtc-answer', {
          targetSocketId: senderSocketId,
          answer: pc.localDescription
        });
        console.log('[WebRTC] Answer sent');
      } catch (err) {
        console.error('[WebRTC] Answer error:', err);
      }
    };

    // ── CLIENT: receives answers from host ──
    const handleAnswer = async ({ senderSocketId, answer }) => {
      console.log('[WebRTC] Received answer');
      if (pcRef.current) {
        try {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (err) {
          console.error('[WebRTC] Set remote description error:', err);
        }
      }
    };

    // ── Both: receive ICE candidates ──
    const handleIceCandidate = async ({ senderSocketId, candidate }) => {
      if (pcRef.current) {
        try {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error('[WebRTC] Add ICE candidate error:', err);
        }
      }
    };

    socket.on('webrtc-offer', handleOffer);
    socket.on('webrtc-answer', handleAnswer);
    socket.on('webrtc-ice-candidate', handleIceCandidate);

    return () => {
      socket.off('webrtc-offer', handleOffer);
      socket.off('webrtc-answer', handleAnswer);
      socket.off('webrtc-ice-candidate', handleIceCandidate);
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
    };
  }, [roomCode, socket, setMyPeerId, addPeer]);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  CLIENT: Initiate WebRTC connection to host when hostPeerId is set
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  useEffect(() => {
    if (isHost || !hostPeerId || !socket) return;

    // Find the host's socketId from the peers list
    const peers = useStore.getState().peers;
    const hostPeer = peers.find(p => p.id === hostPeerId);
    const hostSocketId = hostPeer?.socketId;

    if (!hostSocketId) {
      console.error('[WebRTC] No host socketId found');
      return;
    }

    console.log('📡 Initiating WebRTC to host:', hostPeerId, 'socket:', hostSocketId);

    // CLIENT is the initiator — creates offer + DataChannel
    createPeerConnection(hostPeerId, hostSocketId, true);

  }, [isHost, hostPeerId, socket, addPeer]);

  return dcRef.current;
}
