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

function makeId() {
  return Math.random().toString(36).slice(2, 12);
}

const rooms = new Map();

// Tournament state keyed by room code
const tournaments = new Map();

function getTournament(code) {
  if (!tournaments.has(code)) {
    tournaments.set(code, {
      players: [],       // { id, name, chamberId, wins, matches }
      chambers: [],      // { id, name, color, points }
      history: [],       // completed matches
      currentMatch: null // { redPlayerId, bluePlayerId, game, status }
    });
  }
  return tournaments.get(code);
}

function broadcastTournament(code) {
  const t = getTournament(code);
  io.to(code).emit('tournament-update', {
    players: t.players,
    chambers: t.chambers,
    history: t.history,
    currentMatch: t.currentMatch
  });
}

function addPlayer(code, name, chamberName) {
  const t = getTournament(code);
  let chamber = t.chambers.find(c => c.name.toLowerCase() === chamberName.toLowerCase().trim());
  if (!chamber) {
    const colors = ['#ff2a6d', '#05d9e8', '#ffd300', '#a855f7', '#22c55e', '#f97316'];
    chamber = {
      id: makeId(),
      name: chamberName.trim(),
      color: colors[t.chambers.length % colors.length],
      points: 0
    };
    t.chambers.push(chamber);
  }
  const player = {
    id: makeId(),
    name: name.trim(),
    chamberId: chamber.id,
    wins: 0,
    matches: 0
  };
  t.players.push(player);
  broadcastTournament(code);
  return player;
}

function removePlayer(code, playerId) {
  const t = getTournament(code);
  t.players = t.players.filter(p => p.id !== playerId);
  broadcastTournament(code);
}

function autoPair(code, game = 'guilty') {
  const t = getTournament(code);
  if (t.players.length < 2) return null;

  // Prefer players from different chambers who have played the least
  const sorted = [...t.players].sort((a, b) => a.matches - b.matches);
  let bestPair = null;
  for (const red of sorted) {
    for (const blue of sorted) {
      if (red.id === blue.id) continue;
      if (red.chamberId === blue.chamberId) continue;
      const alreadyPlayed = t.history.some(h =>
        (h.redId === red.id && h.blueId === blue.id) ||
        (h.redId === blue.id && h.blueId === red.id)
      );
      if (!alreadyPlayed) {
        bestPair = { red, blue };
        break;
      }
    }
    if (bestPair) break;
  }

  if (!bestPair) {
    // Fallback: any two different players
    bestPair = { red: sorted[0], blue: sorted[1] };
  }

  t.currentMatch = {
    redId: bestPair.red.id,
    blueId: bestPair.blue.id,
    redName: bestPair.red.name,
    blueName: bestPair.blue.name,
    redChamber: bestPair.red.chamberId,
    blueChamber: bestPair.blue.chamberId,
    game,
    status: 'ready'
  };
  broadcastTournament(code);
  return t.currentMatch;
}

function recordResult(code, winnerId) {
  const t = getTournament(code);
  const match = t.currentMatch;
  if (!match) return;

  const redPlayer = t.players.find(p => p.id === match.redId);
  const bluePlayer = t.players.find(p => p.id === match.blueId);

  match.status = 'done';
  match.winnerId = winnerId;
  t.history.push(match);

  if (redPlayer) redPlayer.matches += 1;
  if (bluePlayer) bluePlayer.matches += 1;

  const winningPlayer = winnerId === 'draw' ? null : t.players.find(p => p.id === winnerId);
  if (winningPlayer) {
    winningPlayer.wins += 1;
    const chamber = t.chambers.find(c => c.id === winningPlayer.chamberId);
    if (chamber) chamber.points += 3;
  } else {
    // draw: each chamber gets 1 point
    const redChamber = t.chambers.find(c => c.id === match.redChamber);
    const blueChamber = t.chambers.find(c => c.id === match.blueChamber);
    if (redChamber) redChamber.points += 1;
    if (blueChamber) blueChamber.points += 1;
  }

  t.currentMatch = null;
  broadcastTournament(code);
}

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

  socket.on('host-broadcast', (payload) => {
    const code = socket.roomCode;
    if (code) socket.to(code).emit('host-broadcast', payload);
  });

  // Tournament endpoints
  socket.on('tournament-get', (code, cb) => {
    cb(getTournament(code));
  });

  socket.on('tournament-join', ({ code, name, chamber }, cb) => {
    const player = addPlayer(code, name, chamber);
    socket.join(code);
    socket.tournamentCode = code;
    socket.tournamentPlayerId = player.id;
    cb(player);
  });

  socket.on('tournament-leave', ({ code, playerId }) => {
    removePlayer(code, playerId);
  });

  socket.on('tournament-pair', (code, cb) => {
    cb(autoPair(code));
  });

  socket.on('tournament-result', ({ code, winnerId }) => {
    recordResult(code, winnerId);
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
