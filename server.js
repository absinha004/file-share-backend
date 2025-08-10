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
  cors: { origin: true } // dev only — lock in prod
});

const PORT = process.env.PORT || 5000;

// rooms: map roomId -> Set(socketId)
const rooms = {};

function makeRoomId(len = 6) {
  return crypto.randomBytes(Math.ceil(len * 3 / 4)).toString('base64url').slice(0, len);
}

app.get('/create-room', (req, res) => {
  let id;
  do { id = makeRoomId(6); } while (rooms[id]);
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

    // enforce 2-person rooms
    if (room.size >= 2) {
      socket.emit('room-full', { roomId });
      return;
    }

    room.add(socket.id);
    socket.join(roomId);

    // who is already here (peer ids)
    const otherPeers = Array.from(room).filter(id => id !== socket.id);
    socket.emit('joined', { roomId, peers: otherPeers });

    // tell existing peer someone joined
    socket.to(roomId).emit('peer-joined', { socketId: socket.id });

    console.log(`socket ${socket.id} joined room ${roomId} (size=${room.size})`);
  });

  // forward signals: { to, data }
  socket.on('signal', ({ to, data }) => {
    if (!to || !data) return;
    // simple log for visibility
    console.log(`Signal from ${socket.id} to ${to} type=${data.type || 'candidate'}`);
    io.to(to).emit('signal', { from: socket.id, data });
  });

  socket.on('disconnect', () => {
    // remove socket from rooms
    for (const [roomId, set] of Object.entries(rooms)) {
      if (set.has(socket.id)) {
        set.delete(socket.id);
        socket.to(roomId).emit('peer-left', { socketId: socket.id });
        console.log(`socket disconnected: ${socket.id} from room ${roomId}`);
        if (set.size === 0) {
          delete rooms[roomId];
          console.log(`room ${roomId} deleted`);
        }
      }
    }
  });
});

server.listen(PORT, () => console.log(`Signaling server listening on port ${PORT}`));
