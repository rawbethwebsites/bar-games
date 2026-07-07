const App = {
  mode: 'same-screen',
  roomCode: null,
  peer: null,
  connections: {}, // { red: conn, blue: conn }
  activeGame: null,
  scores: { red: 0, blue: 0 },
  selectedGame: null,
};

function loadScores() {
  try {
    const saved = localStorage.getItem('bar-games-scores');
    if (saved) App.scores = JSON.parse(saved);
  } catch (e) { /* ignore */ }
}

function saveScores() {
  try {
    localStorage.setItem('bar-games-scores', JSON.stringify(App.scores));
  } catch (e) { /* ignore */ }
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function updateScoreBar() {
  document.querySelectorAll('.red.score').forEach(el => el.textContent = App.scores.red);
  document.querySelectorAll('.blue.score').forEach(el => el.textContent = App.scores.blue);
}

function resetScores() {
  App.scores = { red: 0, blue: 0 };
  saveScores();
  updateScoreBar();
}

function addPoints(red, blue) {
  App.scores.red += red;
  App.scores.blue += blue;
  saveScores();
  updateScoreBar();
}

function showCountdown(container, callback) {
  container.innerHTML = '';
  let n = 3;
  const div = document.createElement('div');
  div.className = 'countdown';
  div.textContent = n;
  container.appendChild(div);

  const tick = setInterval(() => {
    n--;
    if (n > 0) {
      div.textContent = n;
    } else {
      clearInterval(tick);
      callback();
    }
  }, 800);
}

function showVerdict(winner, callback) {
  // In tournament mode, intercept each game's end and advance the bracket instead.
  if (App.tournament && App.tournament.active) {
    return tourneyRoundEnd(winner);
  }
  const stage = document.getElementById('game-stage');

  // Build mini game grid for quick switching
  const gameButtons = Object.entries(GAME_META).map(([key, meta]) =>
    `<button class="verdict-game-btn" data-game="${key}">${meta.icon} ${meta.title}</button>`
  ).join('');

  stage.innerHTML = `
    <div class="winner-screen">
      <h2>Verdict!</h2>
      <div class="winner-name" style="margin-bottom:0.5rem;">${winner === 'draw' ? 'The Court is Tied' : (winner === 'red' ? 'Prosecution Wins' : 'Defence Wins')}</div>
      <div style="color:var(--muted);font-size:1rem;margin-bottom:2rem;">
        Running total — Prosecution: <span style="color:var(--neon-red);font-weight:800;">${App.scores.red}</span> · Defence: <span style="color:var(--neon-blue);font-weight:800;">${App.scores.blue}</span>
      </div>
      <div class="mode-select" style="margin-top:1rem;justify-content:center;">
        <button class="mode-btn" id="rematch-btn">Rematch</button>
        <button class="mode-btn" id="home-btn">Homepage</button>
      </div>
      <div style="margin-top:2rem;">
        <div style="font-family:Orbitron,sans-serif;color:var(--neon-gold);font-size:0.85rem;letter-spacing:0.1em;margin-bottom:0.75rem;">⚡ QUICK PICK NEXT GAME</div>
        <div class="verdict-game-grid">${gameButtons}</div>
      </div>
    </div>
  `;

  document.getElementById('rematch-btn').onclick = () => callback('rematch');
  document.getElementById('home-btn').onclick = () => showScreen('home');

  // Wire up quick-pick game buttons
  stage.querySelectorAll('.verdict-game-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const gameKey = btn.dataset.game;
      if (GAME_FACTORIES[gameKey]) {
        launchGame(gameKey);
      }
    });
  });
}

function renderLeaderboard(container) {
  const total = App.scores.red + App.scores.blue;
  let html = '';
  if (total > 0) {
    html = `
      <div class="leaderboard" style="margin-top:1.5rem;padding:1rem;border:1px solid rgba(255,255,255,0.1);border-radius:14px;background:rgba(255,255,255,0.03);">
        <div style="font-family:Orbitron,sans-serif;color:var(--neon-gold);font-size:0.9rem;letter-spacing:0.1em;margin-bottom:0.75rem;">🏆 RUNNING LEADERBOARD</div>
        <div style="display:flex;justify-content:space-between;gap:1rem;font-size:1.3rem;font-weight:800;">
          <span style="color:var(--neon-red);">Prosecution ${App.scores.red}</span>
          <span style="color:var(--neon-blue);">Defence ${App.scores.blue}</span>
        </div>
      </div>
    `;
  }
  if (container) container.insertAdjacentHTML('beforeend', html);
}

// ── PeerJS host setup ──────────────────────────────────────────
function initPeer() {
  if (App.peer) return;

  // Generate a short, human-readable room code (5 chars, alphanumeric)
  const roomCode = generateRoomCode();
  App.roomCode = roomCode;

  // Use the room code as the peer ID — easy for phones to type
  App.peer = new Peer('bar-games-' + roomCode);

  App.peer.on('open', (id) => {
    showPhoneLobby(id, roomCode);
  });

  App.peer.on('connection', (conn) => {
    // Attach data listener immediately — don't wait for 'open',
    // otherwise messages that arrive early get dropped.
    conn.on('data', (msg) => {
      if (msg.type === 'join') {
        const side = msg.side;
        if (App.connections[side]) {
          if (conn.open) conn.send({ type: 'error', error: 'Side taken' });
          return;
        }
        App.connections[side] = conn;
        // Send confirmation back to the phone
        if (conn.open) conn.send({ type: 'joined', side });
        onPlayerJoined(side);
      } else if (msg.type === 'player-action') {
        if (App.activeGame && App.activeGame.onPhoneAction) {
          App.activeGame.onPhoneAction(msg.action, msg.side);
        }
      } else if (msg.type === 'get-controls') {
        // Phone is polling for current controls — reply with current scheme
        if (App.currentControls && conn.open) {
          conn.send({ type: 'controls', scheme: App.currentControls.scheme, title: App.currentControls.title });
        }
      }
    });

    conn.on('open', () => {
      // Connection ready — nothing to do, data listener already attached
    });

    conn.on('close', () => {
      for (const s of ['red', 'blue']) {
        if (App.connections[s] === conn) {
          delete App.connections[s];
          onPlayerLeft(s);
        }
      }
    });

    conn.on('error', () => {
      for (const s of ['red', 'blue']) {
        if (App.connections[s] === conn) {
          delete App.connections[s];
          onPlayerLeft(s);
        }
      }
    });
  });

  App.peer.on('error', (err) => {
    console.error('Peer error:', err);
    // If the ID is taken, try a new code
    if (err.type === 'unavailable-id') {
      App.peer.destroy();
      App.peer = null;
      initPeer();
    }
  });
}

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusing chars (0/O, 1/I)
  let code = '';
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function onPlayerJoined(side) {
  const dot = document.getElementById(`player-${side}`);
  if (dot) dot.classList.add('joined');
  checkStartReady();
  // Re-send current control scheme so a late-joining phone gets the right layout.
  if (App.currentControls) sendToPhone(side, { type: 'controls', scheme: App.currentControls.scheme, title: App.currentControls.title });
}

function onPlayerLeft(side) {
  const dot = document.getElementById(`player-${side}`);
  if (dot) dot.classList.remove('joined');
  checkStartReady();
}

function sendToPhone(side, payload) {
  const conn = App.connections[side];
  if (conn && conn.open) conn.send(payload);
}

function broadcastToPhones(payload) {
  sendToPhone('red', payload);
  sendToPhone('blue', payload);
}

function checkStartReady() {
  const btn = document.getElementById('start-game-btn');
  const red = document.getElementById('player-red')?.classList.contains('joined');
  const blue = document.getElementById('player-blue')?.classList.contains('joined');
  if (red && blue) {
    btn.disabled = false;
    btn.textContent = 'Start Game';
  } else {
    btn.disabled = true;
    btn.textContent = 'Waiting for both players…';
  }
}

// Home screen buttons
document.querySelectorAll('[data-mode]').forEach(btn => {
  btn.addEventListener('click', () => {
    App.mode = btn.dataset.mode;
    if (App.mode === 'same-screen') {
      resetScores();
      showScreen('lobby');
    } else {
      // Phone mode — start PeerJS host with a short room code
      initPeer();
    }
  });
});

function showPhoneLobby(fullPeerId, code) {
  document.getElementById('room-code').textContent = code;
  document.getElementById('players-joined').innerHTML = `
    <div id="player-red" class="player-dot red"></div>
    <div id="player-blue" class="player-dot blue"></div>
  `;
  // QR code links to controller.html with the full peer ID as room param
  const controllerUrl = `${window.location.origin}/controller.html?room=${encodeURIComponent(fullPeerId)}`;
  const qrEl = document.getElementById('qr-container');
  qrEl.innerHTML = '';
  new QRCode(qrEl, {
    text: controllerUrl,
    width: 200,
    height: 200,
    colorDark: '#0b0c15',
    colorLight: '#ffffff',
  });
  document.getElementById('start-game-btn').onclick = () => {
    resetScores();
    showScreen('lobby');
  };
  // Set room code on game screen
  const roomDisplay = document.getElementById('room-display');
  if (roomDisplay) roomDisplay.textContent = `Courtroom: ${code}`;
  showScreen('phone-lobby');
}

// Game factory registry
const GAME_FACTORIES = {
  cross: typeof createCrossGame === 'function' ? createCrossGame : null,
  habeas: typeof createHabeasGame === 'function' ? createHabeasGame : null,
  closing: typeof createClosingGame === 'function' ? createClosingGame : null,
  voir: typeof createVoirGame === 'function' ? createVoirGame : null,
  overruled: typeof createOverruledGame === 'function' ? createOverruledGame : null,
  guilty: typeof createGuiltyGame === 'function' ? createGuiltyGame : null,
  objection: typeof createObjectionGame === 'function' ? createObjectionGame : null,
  sustained: typeof createSustainedGame === 'function' ? createSustainedGame : null,
  order: typeof createOrderGame === 'function' ? createOrderGame : null,
  gavel: typeof createGavelGame === 'function' ? createGavelGame : null,
};

const GAME_META = {
  cross:    { title: 'Cross Examination', icon: '🔦', controls: 'yesno' },
  habeas:   { title: 'Habeas Corpus',   icon: '🔓', controls: 'freedetain' },
  closing:  { title: 'Closing Argument',icon: '🎤', controls: 'abcd' },
  voir:     { title: 'Voir Dire',       icon: '🧑‍⚖️', controls: 'cycle' },
  overruled:{ title: 'Overruled!',      icon: '🧑‍⚖️', controls: 'sustainoverrule' },
  guilty:   { title: 'Guilty or Not Guilty', icon: '⚖', controls: 'realfake' },
  objection:{ title: 'Objection!',      icon: '🗣', controls: 'buzz' },
  sustained:{ title: 'Sustained',       icon: '❓', controls: 'abcd' },
  order:    { title: 'Order in the Court', icon: '🤣', controls: 'abcd' },
  gavel:    { title: 'Beat the Gavel',  icon: '🔨', controls: 'buzz' },
};
const TOURNEY_ORDER = ['guilty', 'objection', 'sustained', 'order', 'gavel', 'cross', 'habeas', 'closing', 'voir', 'overruled'];

App.currentControls = null;   // { scheme, title }
App.tournament = null;

function setControls(scheme, title) {
  App.currentControls = { scheme, title };
  broadcastToPhones({ type: 'controls', scheme, title });
}

function launchGame(key) {
  const factory = GAME_FACTORIES[key];
  if (!factory) return;
  if (GAME_META[key]) setControls(GAME_META[key].controls, GAME_META[key].title);
  App.activeGame = factory(App);
  App.activeGame.start();
}

// ---- Tournament orchestrator ----
function startTournament() {
  App.tournament = { active: true, i: 0, wins: { red: 0, blue: 0 } };
  runTourneyGame();
}
function runTourneyGame() {
  launchGame(TOURNEY_ORDER[App.tournament.i]);
}
function tourneyRoundEnd(winner) {
  const T = App.tournament;
  const justPlayed = TOURNEY_ORDER[T.i];
  if (winner === 'red') T.wins.red++; else if (winner === 'blue') T.wins.blue++;
  T.i++;
  const stage = document.getElementById('game-stage');
  const standings = `Prosecution <span style="color:var(--neon-red);font-weight:800;">${T.wins.red}</span> · Defence <span style="color:var(--neon-blue);font-weight:800;">${T.wins.blue}</span>`;
  const resultLine = winner === 'draw'
    ? `${GAME_META[justPlayed].title} — a tie, no game point`
    : `${GAME_META[justPlayed].title} — ${winner === 'red' ? 'Prosecution' : 'Defence'} takes it`;

  if (T.i < TOURNEY_ORDER.length) {
    const next = TOURNEY_ORDER[T.i];
    stage.innerHTML = `
      <div class="winner-screen">
        <div class="round-label">GAME ${T.i} OF ${TOURNEY_ORDER.length} COMPLETE</div>
        <h2>${GAME_META[justPlayed].icon} Round Won</h2>
        <div class="winner-name" style="font-size:1.4rem;margin-bottom:0.5rem;">${resultLine}</div>
        <div style="color:var(--muted);margin-bottom:2rem;">Tournament standings — ${standings}</div>
        <div class="mode-select" style="justify-content:center;">
          <button class="mode-btn primary" id="tourney-next">Next: ${GAME_META[next].icon} ${GAME_META[next].title}</button>
          <button class="mode-btn" id="tourney-quit">End Tournament</button>
        </div>
      </div>`;
    document.getElementById('tourney-next').onclick = runTourneyGame;
    document.getElementById('tourney-quit').onclick = () => { App.tournament = null; showScreen('lobby'); };
  } else {
    const champ = T.wins.red > T.wins.blue ? 'red' : (T.wins.blue > T.wins.red ? 'blue' : 'draw');
    const title = champ === 'draw' ? 'The Bench Is Split!' : (champ === 'red' ? '🔴 Prosecution — Silk of the Night' : '🔵 Defence — Silk of the Night');
    stage.innerHTML = `
      <div class="winner-screen">
        <div class="round-label">THE FULL DOCKET · FINAL VERDICT</div>
        <h2>🏆 ${title}</h2>
        <div class="winner-name ${champ === 'draw' ? '' : champ}" style="margin-bottom:0.5rem;">Games won — ${standings}</div>
        <div style="color:var(--muted);margin-bottom:2rem;">Five cases tried. One champion crowned.</div>
        <div class="mode-select" style="justify-content:center;">
          <button class="mode-btn primary" id="tourney-again">Play Tournament Again</button>
          <button class="mode-btn" id="tourney-menu">Back to Menu</button>
        </div>
      </div>`;
    App.tournament = null;
    document.getElementById('tourney-again').onclick = startTournament;
    document.getElementById('tourney-menu').onclick = () => showScreen('lobby');
  }
}

// Lobby game selection
document.querySelectorAll('.game-card').forEach(card => {
  card.addEventListener('click', () => {
    const game = card.dataset.game;
    App.selectedGame = game;
    if (GAME_FACTORIES[game]) {
      launchGame(game);
    } else if (game === 'tournament') {
      startTournament();
    } else {
      alert(`${game} is coming in the next build phase.`);
    }
  });
});

// Back buttons
document.querySelectorAll('.back').forEach(btn => {
  btn.addEventListener('click', () => showScreen('home'));
});

// Keyboard routing
document.addEventListener('keydown', (e) => {
  if (App.activeGame && App.activeGame.onKey) {
    App.activeGame.onKey(e.key.toLowerCase());
  }
});

loadScores();
updateScoreBar();

// Show leaderboard on home screen
const homeScreen = document.getElementById('home');
if (homeScreen) renderLeaderboard(homeScreen.querySelector('.arcade-card'));


// ---- Tournament Night (chambers + leaderboard + auto-pair) ─────
// In PeerJS mode, tournament state lives entirely in the host browser.
let tournamentCode = null;
let tournamentState = { players: [], chambers: [], history: [], currentMatch: null };
let myPlayerId = null;

function makeId() {
  return Math.random().toString(36).slice(2, 12);
}

function getTournament() {
  return tournamentState;
}

function broadcastTournament() {
  // No socket broadcast — update local UI directly
  updateTournamentUI();
  showMatch();
}

function addPlayer(name, chamberName) {
  const t = getTournament();
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
  broadcastTournament();
  return player;
}

function removePlayer(playerId) {
  const t = getTournament();
  t.players = t.players.filter(p => p.id !== playerId);
  broadcastTournament();
}

function autoPair(game = 'guilty') {
  const t = getTournament();
  if (t.players.length < 2) return null;

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
  broadcastTournament();
  return t.currentMatch;
}

function recordResult(winnerId) {
  const t = getTournament();
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
    const redChamber = t.chambers.find(c => c.id === match.redChamber);
    const blueChamber = t.chambers.find(c => c.id === match.blueChamber);
    if (redChamber) redChamber.points += 1;
    if (blueChamber) blueChamber.points += 1;
  }

  t.currentMatch = null;
  broadcastTournament();
}

function renderChambers() {
  const el = document.getElementById('tournament-chambers');
  if (!el) return;
  el.innerHTML = tournamentState.chambers.map(c => `
    <div class="chamber-pill" style="border-left:4px solid ${c.color};">
      <span class="chamber-name" style="color:${c.color};">${c.name}</span>
      <span class="chamber-score">${c.points || 0} pts</span>
    </div>
  `).join('') || '<p style="color:var(--muted);font-size:0.85rem;">No chambers yet.</p>';
}

function renderTournamentPlayers() {
  const el = document.getElementById('tournament-players');
  if (!el) return;
  el.innerHTML = tournamentState.players.map(p => {
    const chamber = tournamentState.chambers.find(c => c.id === p.chamberId);
    const color = chamber ? chamber.color : 'var(--muted)';
    return `
      <div class="player-row">
        <span class="player-name" style="color:${color};">${p.name}</span>
        <span class="player-stats">${p.wins || 0}W · ${p.matches || 0}M</span>
      </div>
    `;
  }).join('') || '<p style="color:var(--muted);font-size:0.85rem;">No players yet.</p>';
  const pairBtn = document.getElementById('pair-next-btn');
  if (pairBtn) pairBtn.disabled = tournamentState.players.length < 2;
}

function updateTournamentUI() {
  renderChambers();
  renderTournamentPlayers();
}

function renderFullLeaderboard() {
  const chambersEl = document.getElementById('leaderboard-chambers');
  const playersEl = document.getElementById('leaderboard-players');
  if (!chambersEl || !playersEl) return;

  const sortedChambers = [...tournamentState.chambers].sort((a, b) => (b.points || 0) - (a.points || 0));
  chambersEl.innerHTML = sortedChambers.map((c, i) => `
    <div class="leaderboard-row" style="border-left:4px solid ${c.color};">
      <span>${i + 1}. ${c.name}</span>
      <span style="color:${c.color};font-weight:800;">${c.points || 0} pts</span>
    </div>
  `).join('') || '<p style="color:var(--muted);">No chamber scores yet.</p>';

  const sortedPlayers = [...tournamentState.players].sort((a, b) => (b.wins || 0) - (a.wins || 0));
  playersEl.innerHTML = sortedPlayers.map((p, i) => {
    const chamber = tournamentState.chambers.find(c => c.id === p.chamberId);
    return `
      <div class="leaderboard-row">
        <span>${i + 1}. ${p.name}${chamber ? ` · ${chamber.name}` : ''}</span>
        <span style="font-weight:800;">${p.wins || 0}W</span>
      </div>
    `;
  }).join('') || '<p style="color:var(--muted);">No player scores yet.</p>';
}

function showMatch() {
  const match = tournamentState.currentMatch;
  const lobby = document.getElementById('tournament-lobby');
  const matchEl = document.getElementById('tournament-match');
  if (!match) {
    if (lobby) lobby.style.display = 'block';
    if (matchEl) matchEl.style.display = 'none';
    return;
  }
  if (lobby) lobby.style.display = 'none';
  if (matchEl) matchEl.style.display = 'block';

  const redChamber = tournamentState.chambers.find(c => c.id === match.redChamber);
  const blueChamber = tournamentState.chambers.find(c => c.id === match.blueChamber);

  document.getElementById('match-red-name').textContent = match.redName;
  document.getElementById('match-red-chamber').textContent = redChamber ? redChamber.name : '';
  document.getElementById('match-red-chamber').style.color = redChamber ? redChamber.color : 'var(--muted)';

  document.getElementById('match-blue-name').textContent = match.blueName;
  document.getElementById('match-blue-chamber').textContent = blueChamber ? blueChamber.name : '';
  document.getElementById('match-blue-chamber').style.color = blueChamber ? blueChamber.color : 'var(--muted)';
}

const tournamentBtn = document.getElementById('tournament-btn');
if (tournamentBtn) {
  tournamentBtn.addEventListener('click', () => {
    tournamentCode = 'local';
    showScreen('tournament');
  });
}

const registerBtn = document.getElementById('register-btn');
if (registerBtn) {
  registerBtn.addEventListener('click', () => {
    const name = document.getElementById('player-name').value.trim();
    const chamber = document.getElementById('chamber-name').value.trim();
    if (!name || !chamber) return alert('Enter your name and chamber.');
    const player = addPlayer(name, chamber);
    myPlayerId = player.id;
    document.getElementById('player-name').value = '';
    document.getElementById('chamber-name').value = '';
  });
}

const pairNextBtn = document.getElementById('pair-next-btn');
if (pairNextBtn) {
  pairNextBtn.addEventListener('click', () => {
    autoPair();
  });
}

function declareWinner(winnerId) {
  recordResult(winnerId);
}

const winnerRedBtn = document.getElementById('winner-red-btn');
const winnerBlueBtn = document.getElementById('winner-blue-btn');
const winnerDrawBtn = document.getElementById('winner-draw-btn');
const cancelMatchBtn = document.getElementById('cancel-match-btn');
const viewLeaderboardBtn = document.getElementById('view-leaderboard-btn');

if (winnerRedBtn) winnerRedBtn.addEventListener('click', () => declareWinner(tournamentState.currentMatch?.redId));
if (winnerBlueBtn) winnerBlueBtn.addEventListener('click', () => declareWinner(tournamentState.currentMatch?.blueId));
if (winnerDrawBtn) winnerDrawBtn.addEventListener('click', () => declareWinner('draw'));
if (cancelMatchBtn) cancelMatchBtn.addEventListener('click', () => showMatch());
if (viewLeaderboardBtn) viewLeaderboardBtn.addEventListener('click', () => { renderFullLeaderboard(); showScreen('leaderboard'); });