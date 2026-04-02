const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const { Server } = require('socket.io');
const { ExpressPeerServer } = require('peer');

const app = express();
app.use(cors());

const server = http.createServer(app);

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: '*', // For local dev, allow all
    methods: ['GET', 'POST']
  }
});

// Initialize PeerJS Server mounted at /peerjs
const peerServer = ExpressPeerServer(server, {
  path: '/'
});
app.use('/peerjs', peerServer);

// Serve statically built React PWA
const staticPath = path.join(__dirname, '../client/dist');
app.use(express.static(staticPath));

// Fallback all nested routes to React Router seamlessly
app.get('*', (req, res) => {
  res.sendFile(path.join(staticPath, 'index.html'));
});

// State management
// rooms: Map<roomCode, { hostId, hostPeerId, participants }>
const rooms = new Map();

io.on('connection', (socket) => {
  console.log(`Connected: ${socket.id}`);

  // 1. Host creates a room
  socket.on('create-room', ({ roomCode, hostPeerId }) => {
    rooms.set(roomCode, {
      hostId: socket.id,
      hostPeerId,
      participants: new Map() // tracks requesting socket.ids -> { name, type }
    });
    socket.join(roomCode);
    console.log(`Room created: ${roomCode} by ${socket.id} (PeerID: ${hostPeerId})`);
  });

  // 2. Client requests to join
  socket.on('request-join', ({ roomCode, deviceInfo }) => {
    const room = rooms.get(roomCode);
    if (!room) {
      socket.emit('join-status', { status: 'denied', reason: 'Room not found' });
      return;
    }
    
    room.participants.set(socket.id, deviceInfo);
    
    // Notify host via Socket.IO
    io.to(room.hostId).emit('participant-requested', {
      socketId: socket.id,
      deviceInfo
    });
  });

  // 3. Host accepts participant
  socket.on('accept-request', ({ requesterSocketId }) => {
    const roomEntry = [...rooms.entries()].find(([_, data]) => data.hostId === socket.id);
    if (roomEntry) {
      const [roomCode, roomData] = roomEntry;
      // Tell the requester they are admitted, and pass the exact hostPeerId
      // so their PeerJS instance knows exactly where to "Dial"
      io.to(requesterSocketId).emit('join-status', {
        status: 'admitted',
        hostPeerId: roomData.hostPeerId
      });
    }
  });

  // 4. Host denies participant
  socket.on('deny-request', ({ requesterSocketId }) => {
    const roomEntry = [...rooms.entries()].find(([_, data]) => data.hostId === socket.id);
    if (roomEntry) {
      io.to(requesterSocketId).emit('join-status', {
        status: 'denied',
        reason: 'Host rejected the connection'
      });
    }
  });

  // Handle disconnects elegantly
  socket.on('disconnect', () => {
    console.log(`Disconnected: ${socket.id}`);
    
    // If it was a host, delete room and notify everyone listening
    const hostedRoom = [...rooms.entries()].find(([_, data]) => data.hostId === socket.id);
    if (hostedRoom) {
      const [roomCode, data] = hostedRoom;
      io.to(roomCode).emit('room-ended');
      rooms.delete(roomCode);
      console.log(`Room closed: ${roomCode}`);
    } else {
      // If it was a client, tell the Host they disconnected physically across the TCP Layer
      for (const [code, data] of rooms.entries()) {
        if (data.participants.has(socket.id)) {
          const deviceInfo = data.participants.get(socket.id);
          io.to(data.hostId).emit('peer-disconnected', { peerId: deviceInfo.peerId });
          data.participants.delete(socket.id);
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`NexusDrop Server listening on port ${PORT}`);
});
