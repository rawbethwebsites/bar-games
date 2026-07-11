const { PeerServer } = require('peer');

const PORT = process.env.PORT || 3001;

// Allowed origins (CORS)
const ALLOWED_ORIGINS = [
  'https://bar-games.theboostnation.com',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

// Generate a room-code-style peer ID
function generateId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = 'bar-games-';
  for (let i = 0; i < 5; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

const peerServer = PeerServer({
  port: PORT,
  path: '/',
  allow_discovery: true,
  generateId,
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
  },
  // Keep-alive timeout (ms) — default 30s, we use 60s
  alive_timeout: 60000,
  // Heartbeat interval (ms) — default 20s
  heartbeat_interval: 20000,
});

peerServer.on('connection', (client) => {
  console.log(`[connected] ${client.getId()}`);
});

peerServer.on('disconnect', (client) => {
  console.log(`[disconnected] ${client.getId()}`);
});

peerServer.on('error', (err) => {
  console.error('[server error]', err);
});

console.log(`Bar Games PeerJS server running on port ${PORT}`);