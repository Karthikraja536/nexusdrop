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

  addPeer: (peer) => set((state) => {
    if (state.peers.some(p => p.id === peer.id)) return state;
    return { peers: [...state.peers, peer] };
  }),
  removePeer: (peerId) => set((state) => ({
    peers: state.peers.filter(p => p.id !== peerId)
  })),

  // === FILE TRANSFER LOGIC === //
  // Tracks { fileId: { metadata, progress, status: 'transferring' | 'completed', blobUrl? } }
  activeTransfers: {},
  
  updateTransferProgress: (fileId, metadata, progress) => set((state) => ({
    activeTransfers: {
      ...state.activeTransfers,
      [fileId]: { 
        ...state.activeTransfers[fileId], 
        metadata: metadata || state.activeTransfers[fileId]?.metadata, 
        progress, 
        status: progress === 100 ? 'completed' : 'transferring' 
      }
    }
  })),
  
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
