const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(express.static(path.join(__dirname, 'public')));

function makeRoomCode() {
  return Math.random().toString(36).slice(2, 7).toUpperCase();
}

const rooms = new Map();

io.on('connection', (socket) => {
  console.log('client connected:', socket.id);

  socket.on('create-room', (cb) => {
    const code = makeRoomCode();
    rooms.set(code, { host: socket.id, players: {} });
    socket.join(code);
    socket.roomCode = code;
    cb(code);
  });

  socket.on('join-room', ({ code, side }, cb) => {
    const room = rooms.get(code);
    if (!room) return cb({ ok: false, error: 'Room not found' });
    if (room.players[side]) return cb({ ok: false, error: 'Side taken' });
    room.players[side] = socket.id;
    socket.join(code);
    socket.roomCode = code;
    socket.playerSide = side;
    socket.to(code).emit('player-joined', { side });
    cb({ ok: true });
  });

  socket.on('player-action', ({ action, side }) => {
    const code = socket.roomCode;
    if (code) socket.to(code).emit('player-action', { action, side });
  });

  socket.on('disconnect', () => {
    const code = socket.roomCode;
    if (code && rooms.has(code)) {
      const room = rooms.get(code);
      if (room.host === socket.id) {
        rooms.delete(code);
      } else {
        const side = socket.playerSide;
        if (side) {
          delete room.players[side];
          socket.to(code).emit('player-left', { side });
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Bar Games server running on http://localhost:${PORT}`);
});
