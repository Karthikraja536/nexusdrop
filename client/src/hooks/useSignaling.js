import { useEffect } from 'react';
import { io } from 'socket.io-client';
import useStore from '../store/useStore';

// Use same origin so Vite's proxy forwards to :3001 — works on any device on the network
const SERVER_URL = window.location.origin;

export function useSignaling() {
  const { 
    roomCode, isHost, myPeerId, 
    setSocket, addPendingJoiner, removePendingJoiner, 
    setHostPeerId
  } = useStore();

  useEffect(() => {
    // Only connect the signaling socket AFTER PeerJS gives us an ID
    if (!roomCode || !myPeerId) return;

    const socket = io(SERVER_URL);
    setSocket(socket);

    socket.on('connect', () => {
      console.log('🔗 WebSocket Connected:', socket.id);
      if (isHost) {
        // I am the Host. I announce my ownership of the room.
        console.log(`🔗 Announcing Host presence for room: ${roomCode}`);
        socket.emit('create-room', { roomCode, hostPeerId: myPeerId });
      } else {
        // I am a Joiner requesting access.
        const deviceInfo = {
          name: navigator.userAgent.includes('Mobile') ? 'Mobile Device' : 'Desktop Device',
          type: navigator.userAgent.includes('Mobile') ? 'phone' : 'desktop',
          peerId: myPeerId
        };
        socket.emit('request-join', { roomCode, deviceInfo });
      }
    });

    // === FOR HOSTS ONLY ===
    socket.on('participant-requested', ({ socketId, deviceInfo }) => {
      console.log('👋 Lobby request from:', socketId, deviceInfo);
      addPendingJoiner({ socketId, ...deviceInfo });
      setTimeout(() => {
         socket.emit('accept-request', { requesterSocketId: socketId });
         removePendingJoiner(socketId);
      }, 3000);
    });

    socket.on('peer-disconnected', ({ peerId }) => {
      console.log('⚠️ Network socket drop detected by internal Signaling Server for peer:', peerId);
      if (peerId) useStore.getState().removePeer(peerId);
    });

    // === FOR CLIENTS ONLY ===
    socket.on('join-status', ({ status, reason, hostPeerId }) => {
      console.log(`Lobby Status Updated: ${status}. Host PeerID: ${hostPeerId || 'none'}`);
      if (status === 'admitted' && hostPeerId) {
        // Update store so usePeer automatically fires its dialing hook
        setHostPeerId(hostPeerId); 
      } else if (status === 'denied') {
        alert(`Access Denied: ${reason}`);
        window.location.href = '/';
      }
    });

    socket.on('room-ended', () => {
      alert('Host ended the session');
      window.location.href = '/';
    });

    return () => {
      socket.disconnect();
      setSocket(null);
    };
  }, [roomCode, isHost, myPeerId, setSocket, addPendingJoiner, removePendingJoiner, setHostPeerId]);
}
