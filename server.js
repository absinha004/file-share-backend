// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: true, // during dev allow all; lock this down in prod to your frontend domain
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 5000;

// In-memory rooms map: { roomId: Set(socketId) }
// For production, consider persistence / rate-limits / cleanup jobs.
const rooms = {};

function makeRoomId(len = 6) {
  // url-safe short id
  return crypto.randomBytes(Math.ceil(len * 3 / 4)).toString('base64url').slice(0, len);
}

/**
 * Create a room and return id
 * Useful for "create room" button on frontend
 */
app.get('/create-room', (req, res) => {
  let id;
  do {
    id = makeRoomId(6);
  } while (rooms[id]);
  rooms[id] = new Set();
  res.json({ roomId: id });
});

io.on('connection', socket => {
  console.log('socket connected:', socket.id);

  socket.on('join', ({ roomId }) => {
    if (!roomId) {
      socket.emit('error-msg', { message: 'no roomId provided' });
      return;
    }

    if (!rooms[roomId]) rooms[roomId] = new Set();

    const room = rooms[roomId];

    // limit room size to 2 (1:1)
    if (room.size >= 2) {
      socket.emit('room-full', { roomId });
      return;
    }

    room.add(socket.id);
    socket.join(roomId);

    // Tell the joining client who is already in the room (peer ids)
    const otherPeers = Array.from(room).filter(id => id !== socket.id);
    socket.emit('joined', { roomId, peers: otherPeers });

    // Inform existing peer(s) that someone joined
    socket.to(roomId).emit('peer-joined', { socketId: socket.id });

    console.log(`socket ${socket.id} joined room ${roomId} (size=${room.size})`);
  });

  /**
   * Signal message forwarding:
   * payload: { to: <socketId>, data: { type: 'offer'|'answer'|'ice', ... } }
   */
  socket.on('signal', ({ to, data }) => {
    if (!to || !data) return;
    // forward to specific peer
    io.to(to).emit('signal', { from: socket.id, data });
  });

  socket.on('disconnect', () => {
    // Remove from all rooms
    for (const [roomId, set] of Object.entries(rooms)) {
      if (set.has(socket.id)) {
        set.delete(socket.id);
        socket.to(roomId).emit('peer-left', { socketId: socket.id });
        console.log(`socket ${socket.id} left room ${roomId}`);
        if (set.size === 0) {
          delete rooms[roomId]; // cleanup empty room
          console.log(`room ${roomId} deleted`);
        }
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Signaling server listening on port ${PORT}`);
});
