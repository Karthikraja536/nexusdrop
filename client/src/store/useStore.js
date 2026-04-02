import { create } from 'zustand';

const useStore = create((set) => ({
  // Room identity
  roomCode: null,
  isHost: false,
  
  // Signaling & WebRTC references
  socket: null,
  peer: null,
  myPeerId: null,

  // Connections
  hostPeerId: null, 
  peers: [], 
  pendingJoiners: [],
  isDisconnected: false,

  // Setters
  setRoomCode: (code) => set({ roomCode: code }),
  setIsHost: (isHost) => set({ isHost }),
  setSocket: (socket) => set({ socket }),
  setPeer: (peer) => set({ peer }),
  setMyPeerId: (id) => set({ myPeerId: id }),
  setHostPeerId: (id) => set({ hostPeerId: id }),

  // Lobby Management
  addPendingJoiner: (joiner) => set((state) => ({
    pendingJoiners: [...state.pendingJoiners, joiner]
  })),
  removePendingJoiner: (socketId) => set((state) => ({
    pendingJoiners: state.pendingJoiners.filter(j => j.socketId !== socketId)
  })),
  acceptPendingJoiner: (socketId) => {
    const { socket } = useStore.getState();
    if (socket) socket.emit('accept-request', { requesterSocketId: socketId });
    useStore.getState().removePendingJoiner(socketId);
  },
  denyPendingJoiner: (socketId) => {
    const { socket } = useStore.getState();
    if (socket) socket.emit('deny-request', { requesterSocketId: socketId });
    useStore.getState().removePendingJoiner(socketId);
  },

  addPeer: (peer) => set((state) => {
    const existsIndex = state.peers.findIndex(p => p.id === peer.id);
    if (existsIndex !== -1) {
       const newPeers = [...state.peers];
       newPeers[existsIndex] = { ...newPeers[existsIndex], ...peer };
       return { peers: newPeers };
    }
    return { peers: [...state.peers, peer] };
  }),
  removePeer: (peerId) => set((state) => {
    const newTransfers = { ...state.activeTransfers };
    Object.keys(newTransfers).forEach(fileId => {
      const tx = newTransfers[fileId];
      if (tx.metadata?.peerId === peerId && tx.status !== 'completed') {
        tx.status = 'failed';
        tx.progress = 0; // zero out progress visually
      }
    });
    
    // Mathematically wipe dead variable from Watchdog loop
    const newHeartbeats = { ...state.peerHeartbeats };
    delete newHeartbeats[peerId];

    return {
      peers: state.peers.filter(p => p.id !== peerId),
      activeTransfers: newTransfers,
      peerHeartbeats: newHeartbeats
    };
  }),

  // Global Watchdog
  peerHeartbeats: {},
  updatePeerHeartbeat: (peerId) => set((state) => ({
    peerHeartbeats: { ...state.peerHeartbeats, [peerId]: Date.now() }
  })),
  sweepDeadPeers: () => set((state) => {
     const now = Date.now();
     const TIMEOUT = 8000; // 8 seconds of total silence

     if (state.isHost) {
        state.peers.forEach(p => {
           const lastSeen = state.peerHeartbeats[p.id];
           if (lastSeen && now - lastSeen > TIMEOUT) {
              console.warn(`[Watchdog] Peer ${p.id} flatlined globally. Severing.`);
              setTimeout(() => useStore.getState().removePeer(p.id), 0);
           }
        });
        return {};
     } else {
        if (state.hostPeerId) {
           const lastSeen = state.peerHeartbeats[state.hostPeerId];
           if (lastSeen && now - lastSeen > TIMEOUT) {
              console.warn(`[Watchdog] Host ${state.hostPeerId} flatlined globally. Severing.`);
              setTimeout(() => useStore.getState().removePeer(state.hostPeerId), 0);
              return { hostPeerId: null, isDisconnected: true };
           }
        }
        return {};
     }
  }),

  // === FILE TRANSFER LOGIC === //
  // Tracks { fileId: { metadata, progress, status: 'transferring' | 'completed', blobUrl? } }
  activeTransfers: {},
  
  updateTransferProgress: (fileId, metadata, progress, speed = null, transportType = 'webrtc') => set((state) => {
    const existing = state.activeTransfers[fileId] || {};
    return {
      activeTransfers: {
        ...state.activeTransfers,
        [fileId]: { 
          ...existing, 
          metadata: metadata || existing.metadata, 
          progress: progress === 'failed' ? 0 : progress, 
          status: progress === 100 ? 'completed' : progress === 'failed' ? 'failed' : 'transferring',
          speed: speed !== null ? speed : existing.speed,
          transportType: transportType || existing.transportType || 'webrtc'
        }
      }
    };
  }),
  
  completeTransfer: (fileId, metadata, blobUrl) => set((state) => ({
    activeTransfers: {
      ...state.activeTransfers,
      [fileId]: { 
        ...state.activeTransfers[fileId], 
        metadata, 
        progress: 100, 
        status: 'completed', 
        blobUrl 
      }
    }
  })),

  dismissTransfer: (fileId) => set((state) => {
    const newTransfers = { ...state.activeTransfers };
    const tx = newTransfers[fileId];
    if (tx?.blobUrl) {
      URL.revokeObjectURL(tx.blobUrl);
    }
    delete newTransfers[fileId];
    return { activeTransfers: newTransfers };
  }),

  messages: [],
  isChatOpen: false,
  
  toggleChat: () => set((state) => ({ isChatOpen: !state.isChatOpen })),
  
  addMessage: (msg) => set((state) => ({
    // Add visually to store guaranteeing unique ID
    messages: [...state.messages, { ...msg, id: Date.now() + Math.random() }]
  })),
  
  sendMessage: (text) => {
    const { peers, isHost, myPeerId } = useStore.getState();
    const payload = {
      type: 'chat',
      sender: isHost ? 'Host' : 'Peer',
      senderId: myPeerId,
      text,
      timestamp: Date.now()
    };
    
    // Broadcast payload sequentially to all localized WebRTC arrays natively
    peers.forEach(p => {
      if (p.conn && p.conn.open) {
        p.conn.send(payload);
      }
    });

    // Reflect to local UI
    useStore.getState().addMessage({ ...payload, isMe: true });
  },
  
  reset: () => set({ 
    roomCode: null, isHost: false, socket: null, peer: null, myPeerId: null, 
    hostPeerId: null, peers: [], pendingJoiners: [], activeTransfers: {}, messages: [], isChatOpen: false, isDisconnected: false
  })
}));

export default useStore;
