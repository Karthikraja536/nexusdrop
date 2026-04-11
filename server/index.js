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
  maxHttpBufferSize: 50 * 1024 * 1024,  // 50 MB - needed for 512 KB chunks with metadata
  cors: {
    origin: '*', // For local dev, allow all
    methods: ['GET', 'POST']
  },
  pingTimeout: 60000,
  pingInterval: 25000,
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
    const existing = rooms.get(roomCode);
    if (existing && existing.destroyTimeout) {
      clearTimeout(existing.destroyTimeout);
      existing.hostId = socket.id;
      existing.destroyTimeout = null;
      socket.join(roomCode);
      console.log(`Host safely reconnected bridging room: ${roomCode}`);
      return;
    }

    rooms.set(roomCode, {
      hostId: socket.id,
      hostPeerId,
      participants: new Map(), // tracks requesting socket.ids -> { name, type }
      destroyTimeout: null
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
    socket.join(roomCode);
    
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
      const deviceInfo = roomData.participants.get(requesterSocketId);

      // Tell the requester they are admitted, map Host's routing IDs
      io.to(requesterSocketId).emit('join-status', {
        status: 'admitted',
        hostPeerId: roomData.hostPeerId,
        hostSocketId: socket.id
      });
      
      // Tell the host to officially bind the client in their lobby state
      io.to(socket.id).emit('peer-admitted', {
         socketId: requesterSocketId,
         deviceInfo
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
      
      data.destroyTimeout = setTimeout(() => {
        io.to(roomCode).emit('room-ended');
        rooms.delete(roomCode);
        console.log(`Room closed fatally: ${roomCode}`);
      }, 15000); // 15s idle grace period for background drops/reconnects
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

  // 5. Application Layer Heartbeat routing
  socket.on('app-heartbeat', ({ roomCode, peerId, isHost }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    
    if (isHost) {
      // Host pings all clients. Broadcast to the room.
      socket.to(roomCode).emit('peer-heartbeat', { peerId: room.hostPeerId });
    } else {
      // Client pings the host.
      io.to(room.hostId).emit('peer-heartbeat', { peerId });
    }
  });

  // 6. Dual-Transport Relay Hub Wrapper 
  socket.on('relay-file-metadata', ({ targetSocketId, fileId, metadata }) => {
    io.to(targetSocketId).emit('relay-file-metadata', { senderSocketId: socket.id, fileId, metadata });
  });

  socket.on('relay-file-chunk', ({ targetSocketId, fileId, index, data }) => {
    io.to(targetSocketId).emit('relay-file-chunk', { senderSocketId: socket.id, fileId, index, data });
  });

  socket.on('relay-file-end', ({ targetSocketId, fileId }) => {
    io.to(targetSocketId).emit('relay-file-end', { senderSocketId: socket.id, fileId });
  });

  socket.on('relay-ack', ({ targetSocketId, fileId, index }) => {
    io.to(targetSocketId).emit('relay-ack', { fileId, index }); // Backpressure throttle ping
  });

});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`NexusDrop Server listening on port ${PORT}`);
});
