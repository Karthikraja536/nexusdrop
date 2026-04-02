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
    });

    socket.on('peer-admitted', ({ socketId, deviceInfo }) => {
       console.log('✅ Client officially bound to server. Auto-mapping to Relay Mode.');
       useStore.getState().addPeer({
         id: deviceInfo.peerId,
         name: deviceInfo.name || 'Unknown Device',
         type: deviceInfo.type || 'desktop',
         socketId: socketId,
         relayMode: true,
         conn: null
       });
    });

    socket.on('peer-disconnected', ({ peerId }) => {
      console.log('⚠️ Network socket drop detected by internal Signaling Server for peer:', peerId);
      if (peerId) useStore.getState().removePeer(peerId);
    });

    // === FOR CLIENTS ONLY ===
    socket.on('join-status', ({ status, reason, hostPeerId, hostSocketId }) => {
      console.log(`Lobby Status Updated: ${status}. Host PeerID: ${hostPeerId || 'none'}`);
      if (status === 'admitted' && hostPeerId) {
        
        console.log('✅ Server authenticated binding. Auto-mapping Host to Relay Mode.');
        useStore.getState().addPeer({
           id: hostPeerId,
           name: 'Host Device',
           type: 'desktop',
           socketId: hostSocketId, // Passed perfectly from the server
           relayMode: true,
           conn: null
        });

        // Update store so usePeer automatically fires its dialing hook to attempt WebRTC puncture
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

    // Start Application Layer Ping/Pong
    const heartbeatTimer = setInterval(() => {
       if (socket.connected) {
          socket.emit('app-heartbeat', { roomCode, peerId: myPeerId, isHost });
          useStore.getState().sweepDeadPeers();
       }
    }, 2000);

    socket.on('peer-heartbeat', ({ peerId }) => {
       useStore.getState().updatePeerHeartbeat(peerId);
    });

    // === RELAY FALLBACK TRANSFER HOOKS ===
    const handleRecv = (data) => {
       import('../utils/transferManager').then(({ TransferManager }) => {
          TransferManager.receiveData(
             data,
             (fId, meta, prog, speed, trans) => useStore.getState().updateTransferProgress(fId, meta, prog, speed, trans),
             (fId, meta, url) => {
                useStore.getState().completeTransfer(fId, meta, url);
                try {
                   const a = document.createElement('a');
                   a.href = url;
                   a.download = meta.name || 'nexusdrop-file';
                   document.body.appendChild(a);
                   a.click();
                   document.body.removeChild(a);
                } catch(e) {}
             },
             (fId, meta) => console.log('Relay transfer fatally timed out.', fId),
             'relay'
          );
       });
    };

    socket.on('relay-file-metadata', handleRecv);
    socket.on('relay-file-chunk', handleRecv);
    socket.on('relay-file-end', handleRecv);

    return () => {
      clearInterval(heartbeatTimer);
      socket.disconnect();
      setSocket(null);
    };
  }, [roomCode, isHost, myPeerId, setSocket, addPendingJoiner, removePendingJoiner, setHostPeerId]);
}
