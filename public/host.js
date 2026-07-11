const App = {
  mode: 'same-screen',
  roomCode: null,
  socket: null,
  connections: {}, // { red: true, blue: true }
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

// ── No-repeat across sessions ──────────────────────────────────
// Each game stores the indices of questions it has used in localStorage.
// When building a deck, we filter out recently-used questions first,
// then fall back to the full pool if we've exhausted fresh ones.
function getUnusedItems(bank, gameKey, count) {
  const seenKey = 'bar-games-seen-' + gameKey;
  let seen = [];
  try { seen = JSON.parse(localStorage.getItem(seenKey)) || []; } catch (e) {}

  // Partition into unseen and seen
  const unseen = bank.filter((_, i) => !seen.includes(i));
  const seenItems = bank.filter((_, i) => seen.includes(i));

  // Shuffle both pools
  const sh = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const unseenShuffled = sh(unseen);
  const seenShuffled = sh(seenItems);

  // Take from unseen first, fill from seen if needed
  const picked = unseenShuffled.slice(0, count);
  if (picked.length < count) {
    const need = count - picked.length;
    picked.push(...seenShuffled.slice(0, need));
  }

  // Record which indices we used (by matching object identity)
  const usedIndices = picked.map(item => bank.indexOf(item));
  const newSeen = [...new Set([...seen, ...usedIndices])];
  // Keep the list from growing forever — only track the last N items
  const MAX_SEEN = Math.max(bank.length - count, count * 2);
  const trimmedSeen = newSeen.slice(-MAX_SEEN);
  try { localStorage.setItem(seenKey, JSON.stringify(trimmedSeen)); } catch (e) {}

  return picked;
}

// Shuffle a deck so no more than maxStreak of the same answer appear consecutively.
// answerFn(item) returns true/false to classify items into two groups.
function shuffleNoStreak(deck, answerFn, maxStreak = 2) {
  const sh = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  let result = sh(deck);
  // Check and fix streaks by swapping
  for (let i = maxStreak; i < result.length; i++) {
    let streak = 0;
    for (let j = i - 1; j >= 0 && answerFn(result[j]) === answerFn(result[i - 1]); j--) streak++;
    if (streak >= maxStreak && answerFn(result[i]) === answerFn(result[i - 1])) {
      // Find a swap target further ahead with the opposite answer
      for (let k = i + 1; k < result.length; k++) {
        if (answerFn(result[k]) !== answerFn(result[i])) {
          [result[i], result[k]] = [result[k], result[i]];
          break;
        }
      }
    }
  }
  return result;
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

// Stop the active game — clear timers, remove overlays, null out the game
function stopGame() {
  if (App.activeGame) {
    if (App.activeGame.cleanup) App.activeGame.cleanup();
    App.activeGame = null;
  }
  // Stop all sounds
  if (window.SFX) SFX.stopAll();
  // Remove any instructions overlay
  const overlay = document.querySelector('.instr-overlay');
  if (overlay) overlay.remove();
  // Clear the game stage
  const stage = document.getElementById('game-stage');
  if (stage) stage.innerHTML = '';
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
  if (window.SFX) SFX.tick();

  const tick = setInterval(() => {
    n--;
    if (n > 0) {
      div.textContent = n;
      if (window.SFX) SFX.tick();
    } else {
      clearInterval(tick);
      if (window.SFX) SFX.go();
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

  // Play verdict sound
  if (window.SFX) { SFX.verdict(); setTimeout(() => SFX.win(), 600); }

  // Build mini game grid for quick switching
  const gameButtons = Object.entries(GAME_META).map(([key, meta]) =>
    `<button class="verdict-game-btn" data-game="${key}">${meta.icon} ${meta.title}</button>`
  ).join('');

  // Get the game name that was just played
  const justPlayed = App.selectedGame ? GAME_META[App.selectedGame] : null;
  const justPlayedLabel = justPlayed ? `${justPlayed.icon} ${justPlayed.title}` : '';

  stage.innerHTML = `
    <div class="winner-screen">
      <h2>Verdict!</h2>
      ${justPlayedLabel ? `<div class="round-label" style="margin-bottom:0.5rem;">${justPlayedLabel}</div>` : ''}
      <div class="winner-name ${winner}" style="margin-bottom:0.5rem;">${winner === 'draw' ? 'The Court is Tied' : (winner === 'red' ? 'Prosecution Wins' : 'Defence Wins')}</div>
      <div class="verdict-scores">
        <span style="color:var(--neon-red);font-weight:800;">Prosecution ${App.scores.red}</span>
        <span class="vs">·</span>
        <span style="color:var(--neon-blue);font-weight:800;">Defence ${App.scores.blue}</span>
      </div>
      <div class="verdict-actions">
        <button class="mode-btn" id="rematch-btn">Rematch</button>
        <button class="mode-btn" id="home-btn">Homepage</button>
      </div>
      <div class="verdict-quickpick">
        <div class="verdict-quickpick-label">⚡ QUICK PICK NEXT GAME</div>
        <div class="verdict-game-grid">${gameButtons}</div>
      </div>
    </div>
  `;

  document.getElementById('rematch-btn').onclick = () => { if (window.SFX) SFX.click(); callback('rematch'); };
  document.getElementById('home-btn').onclick = () => { if (window.SFX) SFX.click(); showScreen('home'); };

  // Wire up quick-pick game buttons
  stage.querySelectorAll('.verdict-game-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (window.SFX) SFX.click();
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

// ── Socket.IO host setup ────────────────────────────────────────

// The server URL — use the deployed server, fallback to local dev
const SERVER_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? `http://${window.location.hostname}:3000`
  : 'https://bargames-server.onrender.com';

function initSocket() {
  if (App.socket) return;

  App.socket = io(SERVER_URL, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
  });

  App.socket.on('connect_error', (err) => {
    console.error('Socket connect error:', err);
    const rc = document.getElementById('room-code');
    if (rc) rc.innerHTML = '<span style="color:var(--neon-red)">Connection error — retrying…</span>';
  });

  App.socket.on('connect', () => {
    console.log('Socket connected to server');
    // Create a room and get a code
    App.socket.emit('create-room', (code) => {
      App.roomCode = code;
      showPhoneLobby(code);
    });
  });

  // Phone joined
  App.socket.on('player-joined', ({ side }) => {
    App.connections[side] = true;
    onPlayerJoined(side);
  });

  // Phone left
  App.socket.on('player-left', ({ side }) => {
    delete App.connections[side];
    onPlayerLeft(side);
  });

  // Phone action (button press)
  App.socket.on('player-action', ({ action, side }) => {
    if (App.activeGame && App.activeGame.onPhoneAction) {
      App.activeGame.onPhoneAction(action, side);
    }
  });

  // Phone asks for controls (polling fallback)
  App.socket.on('get-controls', () => {
    if (App.currentControls) {
      broadcastToPhones({ type: 'controls', scheme: App.currentControls.scheme, title: App.currentControls.title });
    }
  });
}

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
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
  if (App.socket && App.socket.connected) {
    App.socket.emit('host-broadcast', { ...payload, _target: side });
  }
}

function broadcastToPhones(payload) {
  if (App.socket && App.socket.connected) {
    App.socket.emit('host-broadcast', payload);
  }
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
      // Phone mode — connect to Socket.IO server and get a room code
      initSocket();
    }
  });
});

function showPhoneLobby(code) {
  document.getElementById('room-code').textContent = code;
  document.getElementById('players-joined').innerHTML = `
    <div id="player-red" class="player-dot red"></div>
    <div id="player-blue" class="player-dot blue"></div>
  `;
  // QR code links to controller.html with the room code
  const controllerUrl = `${window.location.origin}/controller.html?room=${encodeURIComponent(code)}`;
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
  closing: typeof createXrefGame === 'function' ? createXrefGame : null,
  voir: typeof createVoirGame === 'function' ? createVoirGame : null,
  overruled: typeof createOverruledGame === 'function' ? createOverruledGame : null,
  guilty: typeof createGuiltyGame === 'function' ? createGuiltyGame : null,
  objection: typeof createObjectionGame === 'function' ? createObjectionGame : null,
  sustained: typeof createSustainedGame === 'function' ? createSustainedGame : null,
  order: typeof createBurdenGame === 'function' ? createBurdenGame : null,
  gavel: typeof createGavelGame === 'function' ? createGavelGame : null,
  plea: typeof createPleaGame === 'function' ? createPleaGame : null,
  discovery: typeof createDiscoveryGame === 'function' ? createDiscoveryGame : null,
  summons: typeof createSummonsGame === 'function' ? createSummonsGame : null,
  parole: typeof createParoleGame === 'function' ? createParoleGame : null,
  contempt: typeof createContemptGame === 'function' ? createContemptGame : null,
};

const GAME_META = {
  cross:    { title: 'Cross Examination', icon: '🔦', controls: 'yesno' },
  habeas:   { title: 'Habeas Corpus',   icon: '🔓', controls: 'freedetain' },
  closing:  { title: 'Cross-Reference',  icon: '📜', controls: 'xref' },
  voir:     { title: 'Voir Dire',       icon: '🧑‍⚖️', controls: 'cycle' },
  overruled:{ title: 'Overruled!',      icon: '🧑‍⚖️', controls: 'sustainoverrule' },
  guilty:   { title: 'Guilty or Not Guilty', icon: '⚖', controls: 'realfake' },
  objection:{ title: 'Objection!',      icon: '🗣', controls: 'buzz' },
  sustained:{ title: 'Sustained',       icon: '❓', controls: 'abcd' },
  order:    { title: 'Burden of Proof', icon: '⚖', controls: 'burden' },
  gavel:    { title: 'Beat the Gavel',  icon: '🔨', controls: 'buzz' },
  plea:     { title: 'Plea Bargain',    icon: '🤝', controls: 'realfake' },
  discovery:{ title: 'Discovery Dispute', icon: '📋', controls: 'complyobject' },
  summons:  { title: 'Summons Race',    icon: '📞', controls: 'abcd' },
  parole:   { title: 'Parole Hearing',  icon: '🚪', controls: 'freedetain' },
  contempt: { title: 'Contempt of Court', icon: '😤', controls: 'sustainoverrule' },
};
const TOURNEY_ORDER = ['guilty', 'objection', 'sustained', 'order', 'gavel', 'cross', 'habeas', 'closing', 'voir', 'overruled', 'plea', 'discovery', 'summons', 'parole', 'contempt'];

App.currentControls = null;   // { scheme, title }
App.tournament = null;

function setControls(scheme, title) {
  App.currentControls = { scheme, title };
  broadcastToPhones({ type: 'controls', scheme, title });
}

function launchGame(key) {
  const factory = GAME_FACTORIES[key];
  if (!factory) return;
  App.selectedGame = key;
  if (GAME_META[key]) setControls(GAME_META[key].controls, GAME_META[key].title);
  // Show the game screen first so the overlay is visible
  showScreen('game');
  // Show instructions overlay before starting the game
  showInstructions(key, () => {
    App.activeGame = factory(App);
    App.activeGame.start();
  });
}

// ── Game Instructions Overlay ──────────────────────────────
// Shows a detailed how-to-play card before the game begins.
const GAME_INSTRUCTIONS = {
  cross: {
    title: 'Cross Examination',
    icon: '🔦',
    summary: 'A witness makes a statement. You get a yes/no question about what they said. Answer correctly to score.',
    sections: [
      { h: 'How It Works', p: 'A witness statement appears at the top, like <b>"I was in the shop from 6 a.m. to noon."</b> Below it is a question like <b>"Was she at the shop in the afternoon?"</b> — you must answer YES or NO based on what the witness actually said.' },
      { h: 'Example', ex: [
        { label: 'Witness says', content: '"I was in the shop from 6 a.m. to noon."' },
        { label: 'Question', content: 'Was she at the shop in the afternoon?' },
        { label: 'Answer', content: '<span class="wrong">NO</span> — she said she was there from 6 a.m. to noon. The afternoon is after 12 p.m., and she said she left at noon.' }
      ]},
      { h: 'Scoring', p: 'Each correct answer = <b>1 point</b>. Wrong answer = <b>0 points</b>. Timer counts down — answer before it runs out or you score 0 for that round.' },
    ],
    controls: { red: { label: 'YES', key: 'A' }, red2: { label: 'NO', key: 'D' }, blue: { label: 'YES', key: 'J' }, blue2: { label: 'NO', key: 'L' } },
    controlType: 'yesno',
  },
  habeas: {
    title: 'Habeas Corpus',
    icon: '🔓',
    summary: 'Someone is being detained. Read the case and decide: should they be FREED or DETAINED?',
    sections: [
      { h: 'How It Works', p: 'You see a detention scenario like <b>"Held overnight for a broken tail-light."</b> You must decide if the person should be freed or kept in custody, based on the severity of the situation.' },
      { h: 'Example', ex: [
        { label: 'Case', content: 'Held overnight for a broken tail-light.' },
        { label: 'Correct Answer', content: '<span class="correct">FREE</span> — minor traffic issue, no danger to anyone.' },
        { label: 'Another Case', content: 'Accused of armed robbery, caught fleeing scene.' },
        { label: 'Correct Answer', content: '<span class="wrong">DETAIn</span> — serious felony with flight risk.' }
      ]},
      { h: 'Scoring', p: 'Correct = <b>1 point</b>. Timer counts down — answer fast!' },
    ],
    controls: { red: { label: 'FREE', key: 'A' }, red2: { label: 'DETAIn', key: 'D' }, blue: { label: 'FREE', key: 'J' }, blue2: { label: 'DETAIn', key: 'L' } },
    controlType: 'freedetain',
  },
  closing: {
    title: 'Closing Argument',
    icon: '🎤',
    summary: 'Complete the closing argument with the best (or funniest) line. Both sides pick, then the room votes.',
    sections: [
      { h: 'How It Works', p: 'A prompt appears like <b>"My client is not guilty because ___."</b> Each player gets 4 options to fill in the blank. Pick the most persuasive or the funniest one.' },
      { h: 'Example', ex: [
        { label: 'Prompt', content: '"Ladies and gentlemen of the jury, my client is not guilty because ___."' },
        { label: 'Your options', content: 'A: the evidence is purely circumstantial · B: a squirrel ate the contract · C: the timeline does not fit · D: everyone was watching the football match' },
        { label: 'Pick one', content: 'Press <b>Q</b>, <b>W</b>, <b>A</b>, or <b>S</b> (left) / <b>U</b>, <b>I</b>, <b>J</b>, <b>K</b> (right) to choose. Then the room votes on the best line!' }
      ]},
      { h: 'Scoring', p: 'First to <b>3 wins</b> takes the match. Best of 5 rounds.' },
    ],
    controls: { red: { label: 'Pick', keys: 'Q W A S' }, blue: { label: 'Pick', keys: 'U I J K' } },
    controlType: 'abcd',
  },
  voir: {
    title: 'Voir Dire',
    icon: '🧑‍⚖️',
    summary: 'Browse the juror pool and pick the juror most likely to side with your side. Lock in your choice!',
    sections: [
      { h: 'How It Works', p: 'A pool of 5 jurors appears. Each juror has a background and a clue about their bias. Your target (pro-prosecution or pro-defence) is shown at the top. Cycle through jurors and lock the best one.' },
      { h: 'Example', ex: [
        { label: 'Target', content: 'Pick the juror most likely to side with <b>PRO-DEFENCE</b>' },
        { label: 'Juror', content: 'Retired teacher, reads newspapers daily — Clue: "Skeptical of prosecutors."' },
        { label: 'Another', content: 'Former police officer — Clue: "Trusts the system."' },
        { label: 'Best pick', content: '<span class="correct">Retired teacher</span> — skeptical of prosecutors = pro-defence. Lock it in!' }
      ]},
      { h: 'Scoring', p: 'Best juror pick = <b>1 point</b>. First to <b>3 wins</b> takes the match.' },
    ],
    controls: { red: { label: 'Cycle', keys: 'A/D · Lock: S' }, blue: { label: 'Cycle', keys: 'J/L · Lock: K' } },
    controlType: 'cycle',
  },
  overruled: {
    title: 'Overruled!',
    icon: '⚖️',
    summary: 'A motion is made in court. Should the judge SUSTAIN or OVERRULE it? Test your courtroom knowledge.',
    sections: [
      { h: 'How It Works', p: 'A legal motion appears like <b>"Defence asks to show the defendant\'s good character."</b> You decide: should the judge sustain (agree with) or overrule (reject) the motion?' },
      { h: 'Example', ex: [
        { label: 'Motion', content: 'Prosecution wants to introduce hearsay from a stranger.' },
        { label: 'Correct Answer', content: '<span class="wrong">OVERRULE</span> — hearsay is generally inadmissible. The objection fails.' },
        { label: 'Another', content: 'Defence objects: witness was never disclosed before trial.' },
        { label: 'Correct Answer', content: '<span class="correct">SUSTAIn</span> — surprise witnesses are unfair.' }
      ]},
      { h: 'Scoring', p: 'Correct = <b>1 point</b>. Timer counts down!' },
    ],
    controls: { red: { label: 'SUSTAIn', key: 'A' }, red2: { label: 'OVERRULE', key: 'D' }, blue: { label: 'SUSTAIn', key: 'J' }, blue2: { label: 'OVERRULE', key: 'L' } },
    controlType: 'sustainoverrule',
  },
  guilty: {
    title: 'Guilty or Not Guilty',
    icon: '⚖',
    summary: 'Is this a real lawsuit or a totally fake one? Spot the real cases to win!',
    sections: [
      { h: 'How It Works', p: 'A lawsuit description appears like <b>"A woman sued a fast-food chain after spilling hot coffee on herself."</b> You must decide: is this REAL or FAKE?' },
      { h: 'Example', ex: [
        { label: 'Case', content: 'A man sued a dry cleaner for $67 million over a missing pair of trousers.' },
        { label: 'Answer', content: '<span class="correct">REAL</span> — he actually did this. He lost, and the case became legendary.' },
        { label: 'Another', content: 'A cat was called as a witness in a murder trial and had to swear on a Bible.' },
        { label: 'Answer', content: '<span class="wrong">FAKE</span> — cats make unreliable witnesses.' }
      ]},
      { h: 'Scoring', p: 'Correct = <b>1 point</b>. 7 rounds per match.' },
    ],
    controls: { red: { label: 'REAL', key: 'A' }, red2: { label: 'FAKE', key: 'D' }, blue: { label: 'REAL', key: 'J' }, blue2: { label: 'FAKE', key: 'L' } },
    controlType: 'realfake',
  },
  objection: {
    title: 'Objection!',
    icon: '🗣',
    summary: 'Wait for the signal, then buzz in first! But buzz too early and you\'re penalised.',
    sections: [
      { h: 'How It Works', p: 'The screen shows a tense courtroom scene. Wait for the <b>OBJECTION!</b> signal — then slam your buzzer as fast as you can. But if you buzz <b>before</b> the signal, you lose the round!' },
      { h: 'Example', ex: [
        { label: 'Phase 1', content: 'The witness shifts nervously… (waiting for signal)' },
        { label: 'Phase 2', content: '<b>OBJECTION!</b> appears — BUZZ NOW!' },
        { label: 'Too early', content: '<span class="wrong">You buzzed before the signal — penalty!</span>' },
        { label: 'Just right', content: '<span class="correct">First to buzz after the signal wins the round!</span>' }
      ]},
      { h: 'Scoring', p: 'First to <b>3 wins</b> takes the match. False starts = opponent gets a point.' },
    ],
    controls: { red: { label: 'BUZZ', key: 'A' }, blue: { label: 'BUZZ', key: 'L' } },
    controlType: 'buzz',
  },
  sustained: {
    title: 'Sustained',
    icon: '❓',
    summary: 'Legal trivia sprint. Four options, one right answer. Fast and accurate wins!',
    sections: [
      { h: 'How It Works', p: 'A legal trivia question appears with 4 options. Pick the correct answer as fast as you can. First correct answer wins the round.' },
      { h: 'Example', ex: [
        { label: 'Question', content: 'What does "pro bono" work mean?' },
        { label: 'Options', content: 'A: Free legal work · B: Extra professional · C: A pro wrestling clause · D: A type of wig' },
        { label: 'Answer', content: '<span class="correct">A — Free legal work</span>' }
      ]},
      { h: 'Scoring', p: 'Correct = <b>1 point</b>. Timer counts down — answer fast!' },
    ],
    controls: { red: { label: 'Pick', keys: 'Q W A S' }, blue: { label: 'Pick', keys: 'U I J K' } },
    controlType: 'abcd',
  },
  order: {
    title: 'Order in the Court',
    icon: '🤣',
    summary: 'Complete the sentence with the funniest option. The room votes on the best line.',
    sections: [
      { h: 'How It Works', p: 'A prompt appears like <b>"The defendant\'s alibi was ___."</b> Each player gets 4 funny options. Pick the funniest one — the room votes on whose line was best.' },
      { h: 'Example', ex: [
        { label: 'Prompt', content: '"The defendant\'s alibi was ___."' },
        { label: 'Your options', content: 'A: asleep in a bouncy castle · B: at a very important nap · C: too handsome to commit crimes · D: being chased by a goose' },
        { label: 'Pick one', content: 'Press <b>Q</b>, <b>W</b>, <b>A</b>, or <b>S</b> (left) / <b>U</b>, <b>I</b>, <b>J</b>, <b>K</b> (right). Then vote!' }
      ]},
      { h: 'Scoring', p: 'First to <b>3 wins</b> takes the match.' },
    ],
    controls: { red: { label: 'Pick', keys: 'Q W A S' }, blue: { label: 'Pick', keys: 'U I J K' } },
    controlType: 'abcd',
  },
  gavel: {
    title: 'Beat the Gavel',
    icon: '🔨',
    summary: 'A needle bounces across a meter. Stop it in the green NOT GUILTY zone to score!',
    sections: [
      { h: 'How It Works', p: 'A needle bounces back and forth across a meter. There\'s a green zone in the middle labelled <b>NOT GUILTY</b>. Press STOP to freeze the needle. If it lands in the green, you score!' },
      { h: 'Example', ex: [
        { label: 'Round 1', content: 'Green zone is wide (30%). Needle bounces slowly. Stop it in the middle!' },
        { label: 'Later rounds', content: 'Green zone shrinks and needle speeds up. Gets harder each round.' },
        { label: 'Hit', content: '<span class="correct">NOT GUILTY — clean stop! +1 point</span>' },
        { label: 'Miss', content: '<span class="wrong">Too early/late — GUILTY! 0 points</span>' }
      ]},
      { h: 'Scoring', p: 'Land in green = <b>1 point</b>. 5 rounds, then sudden death if tied.' },
    ],
    controls: { red: { label: 'STOP', key: 'A' }, blue: { label: 'STOP', key: 'L' } },
    controlType: 'buzz',
  },
  plea: {
    title: 'Plea Bargain',
    icon: '🤝',
    summary: 'A defendant faces a choice: accept a plea deal or risk it at trial. What\'s the smart move?',
    sections: [
      { h: 'How It Works', p: 'You see a crime scenario with the strength of evidence. You must decide: should the defendant <b>accept the plea deal</b> (guaranteed lesser sentence) or <b>risk it at trial</b> (could walk free, or get a harsher sentence)?' },
      { h: 'Example', ex: [
        { label: 'Scenario', content: 'Strong DNA evidence, confession on tape, 3 eyewitnesses.' },
        { label: 'Best choice', content: '<span class="correct">ACCEPT PLEA</span> — the evidence is overwhelming. Going to trial would likely mean a harsher sentence.' },
        { label: 'Another', content: 'Weak circumstantial case, unreliable witness, no physical evidence.' },
        { label: 'Best choice', content: '<span class="correct">RISK TRIAL</span> — the case is weak, a jury might acquit.' }
      ]},
      { h: 'Scoring', p: 'Correct strategy = <b>1 point</b>. 10 rounds, timer-based.' },
    ],
    controls: { red: { label: 'PLEA', key: 'A' }, red2: { label: 'TRIAL', key: 'D' }, blue: { label: 'PLEA', key: 'J' }, blue2: { label: 'TRIAL', key: 'L' } },
    controlType: 'realfake',
  },
  discovery: {
    title: 'Discovery Dispute',
    icon: '📋',
    summary: 'One side requests evidence. Should the other side COMPLY or OBJECT? Test your litigation instincts.',
    sections: [
      { h: 'How It Works', p: 'A discovery request appears like <b>"Prosecution requests all defendant\'s emails from the past 5 years."</b> You must decide: should they comply (provide the evidence) or object (refuse)?' },
      { h: 'Example', ex: [
        { label: 'Request', content: 'Defence requests the prosecution\'s witness list and statements.' },
        { label: 'Correct', content: '<span class="correct">COMPLY</span> — witness lists must be disclosed. It\'s a standard request.' },
        { label: 'Another', content: 'Prosecution requests defendant\'s private diary from 10 years ago.' },
        { label: 'Correct', content: '<span class="wrong">OBJECT</span> — overly broad, not relevant, and invades privacy.' }
      ]},
      { h: 'Scoring', p: 'Correct = <b>1 point</b>. 10 rounds, timer-based.' },
    ],
    controls: { red: { label: 'COMPLY', key: 'A' }, red2: { label: 'OBJECT', key: 'D' }, blue: { label: 'COMPLY', key: 'J' }, blue2: { label: 'OBJECT', key: 'L' } },
    controlType: 'sustainoverrule',
  },
  summons: {
    title: 'Summons Race',
    icon: '📞',
    summary: 'A legal term appears. Buzz in and pick the correct definition from 4 options. Fastest correct answer wins big!',
    sections: [
      { h: 'How It Works', p: 'A legal term like <b>"Tort"</b> appears with 4 definitions. Pick the correct one as fast as you can. First correct = <b>2 points</b>, second correct = <b>1 point</b>. Wrong answer locks you out.' },
      { h: 'Example', ex: [
        { label: 'Term', content: '"Tort"' },
        { label: 'Options', content: 'A: A civil wrong · B: A type of bread · C: A criminal charge · D: A court order' },
        { label: 'Answer', content: '<span class="correct">A — A civil wrong</span>. Buzz in first for 2 points!' }
      ]},
      { h: 'Scoring', p: 'First correct = <b>2 pts</b>. Second = <b>1 pt</b>. Wrong = locked out. 10 rounds.' },
    ],
    controls: { red: { label: 'Pick', keys: 'Q W A S' }, blue: { label: 'Pick', keys: 'U I J K' } },
    controlType: 'abcd',
  },
  parole: {
    title: 'Parole Hearing',
    icon: '🚪',
    summary: 'An inmate is up for parole. Read their case and decide: GRANT parole or DENY?',
    sections: [
      { h: 'How It Works', p: 'You see an inmate\'s case like <b>"Served 8 years of 10 for fraud. Completed rehabilitation programmes. Has a job offer."</b> You must decide: grant parole (release early) or deny (keep in prison)?' },
      { h: 'Example', ex: [
        { label: 'Case', content: 'Served 8 of 10 years for fraud. Completed rehab. Job offer waiting.' },
        { label: 'Correct', content: '<span class="correct">GRANT</span> — rehabilitated, non-violent, has a plan. Low risk.' },
        { label: 'Another', content: 'Served 2 of 15 years for violent assault. Disciplinary infractions in prison.' },
        { label: 'Correct', content: '<span class="wrong">DENY</span> — hasn\'t reformed, still a risk.' }
      ]},
      { h: 'Scoring', p: 'Correct = <b>1 point</b>. 10 rounds, timer-based.' },
    ],
    controls: { red: { label: 'GRANT', key: 'A' }, red2: { label: 'DENY', key: 'D' }, blue: { label: 'GRANT', key: 'J' }, blue2: { label: 'DENY', key: 'L' } },
    controlType: 'freedetain',
  },
  contempt: {
    title: 'Contempt of Court',
    icon: '😤',
    summary: 'Someone does something outrageous in court. HOLD them in contempt or LET IT GO?',
    sections: [
      { h: 'How It Works', p: 'A courtroom behavior appears like <b>"A witness refuses to answer questions and laughs at the judge."</b> You decide: hold them in contempt (punish them) or let it go?' },
      { h: 'Example', ex: [
        { label: 'Behavior', content: 'A lawyer repeatedly talks over the judge after 3 warnings.' },
        { label: 'Correct', content: '<span class="correct">HOLD IN CONTEMPT</span> — repeated disrespect after warnings.' },
        { label: 'Another', content: 'A spectator sneezes loudly during testimony.' },
        { label: 'Correct', content: '<span class="wrong">LET IT GO</span> — it\'s just a sneeze. Not contempt.' }
      ]},
      { h: 'Scoring', p: 'Correct = <b>1 point</b>. 10 rounds, timer-based.' },
    ],
    controls: { red: { label: 'CONTEMPT', key: 'A' }, red2: { label: 'LET IT GO', key: 'D' }, blue: { label: 'CONTEMPT', key: 'J' }, blue2: { label: 'LET IT GO', key: 'L' } },
    controlType: 'sustainoverrule',
  },
};

function showInstructions(gameKey, onStart) {
  const info = GAME_INSTRUCTIONS[gameKey];
  if (!info) { onStart(); return; }

  // Build controls HTML based on type
  let controlsHtml = '';
  if (info.controlType === 'yesno' || info.controlType === 'realfake' || info.controlType === 'freedetain' || info.controlType === 'sustainoverrule') {
    controlsHtml = `
      <div class="instr-controls-row">
        <div class="instr-ctrl">
          <div class="ctrl-side red">🔴 PROSECUTION</div>
          <div class="ctrl-keys"><kbd>${info.controls.red.key}</kbd> = ${info.controls.red.label}<br><kbd>${info.controls.red2.key}</kbd> = ${info.controls.red2.label}</div>
        </div>
        <div class="instr-ctrl">
          <div class="ctrl-side blue">🔵 DEFENCE</div>
          <div class="ctrl-keys"><kbd>${info.controls.blue.key}</kbd> = ${info.controls.blue.label}<br><kbd>${info.controls.blue2.key}</kbd> = ${info.controls.blue2.label}</div>
        </div>
      </div>`;
  } else if (info.controlType === 'buzz') {
    controlsHtml = `
      <div class="instr-controls-row">
        <div class="instr-ctrl">
          <div class="ctrl-side red">🔴 PROSECUTION</div>
          <div class="ctrl-keys"><kbd>${info.controls.red.key}</kbd> = ${info.controls.red.label}</div>
        </div>
        <div class="instr-ctrl">
          <div class="ctrl-side blue">🔵 DEFENCE</div>
          <div class="ctrl-keys"><kbd>${info.controls.blue.key}</kbd> = ${info.controls.blue.label}</div>
        </div>
      </div>`;
  } else if (info.controlType === 'abcd') {
    controlsHtml = `
      <div class="instr-controls-row">
        <div class="instr-ctrl">
          <div class="ctrl-side red">🔴 PROSECUTION</div>
          <div class="ctrl-keys"><kbd>${info.controls.red.keys}</kbd></div>
        </div>
        <div class="instr-ctrl">
          <div class="ctrl-side blue">🔵 DEFENCE</div>
          <div class="ctrl-keys"><kbd>${info.controls.blue.keys}</kbd></div>
        </div>
      </div>`;
  } else if (info.controlType === 'cycle') {
    controlsHtml = `
      <div class="instr-controls-row">
        <div class="instr-ctrl">
          <div class="ctrl-side red">🔴 PROSECUTION</div>
          <div class="ctrl-keys">${info.controls.red.label}<br><kbd>${info.controls.red.keys}</kbd></div>
        </div>
        <div class="instr-ctrl">
          <div class="ctrl-side blue">🔵 DEFENCE</div>
          <div class="ctrl-keys">${info.controls.blue.label}<br><kbd>${info.controls.blue.keys}</kbd></div>
        </div>
      </div>`;
  }

  // Build sections HTML
  const sectionsHtml = info.sections.map(s => {
    let html = `<div class="instr-section"><h3>${s.h}</h3>`;
    if (s.p) html += `<p>${s.p}</p>`;
    if (s.ex) {
      s.ex.forEach(e => {
        html += `<div class="instr-example"><div class="ex-label">${e.label}</div><div class="ex-content">${e.content}</div></div>`;
      });
    }
    html += `</div>`;
    return html;
  }).join('');

  const overlay = document.createElement('div');
  overlay.className = 'instr-overlay';
  overlay.innerHTML = `
    <div class="instr-card">
      <div class="instr-header">
        <div class="instr-icon">${info.icon}</div>
        <div class="instr-title">${info.title}</div>
      </div>
      <p style="color:var(--muted);font-size:1rem;margin-bottom:1.25rem;line-height:1.5;">${info.summary}</p>
      ${sectionsHtml}
      <div class="instr-section">
        <h3>Controls</h3>
        ${controlsHtml}
        <p style="font-size:0.85rem;color:var(--muted);">📱 In phone mode, your phone screen becomes your buzzer with the same buttons.</p>
      </div>
      <button class="instr-start-btn" id="instr-start">START GAME ⚖️</button>
    </div>
  `;

  document.getElementById('game').appendChild(overlay);
  if (window.SFX) SFX.whoosh();

  document.getElementById('instr-start').addEventListener('click', () => {
    if (window.SFX) SFX.click();
    overlay.remove();
    onStart();
  });
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


// ---- Tournament Night (prosecution/defence, auto-pairing) ─────
// In PeerJS mode, tournament state lives entirely in the host browser.
let tournamentCode = null;
let tournamentState = { players: [], history: [], currentMatch: null };
let myPlayerId = null;
let tournamentGameMode = 'auto'; // 'auto' or 'manual'

function makeId() {
  return Math.random().toString(36).slice(2, 12);
}

function getTournament() {
  return tournamentState;
}

function broadcastTournament() {
  updateTournamentUI();
  showMatch();
}

function addPlayer(name) {
  const t = getTournament();
  // Auto-assign side: alternate prosecution/defence to keep them even
  const redCount = t.players.filter(p => p.side === 'red').length;
  const blueCount = t.players.filter(p => p.side === 'blue').length;
  const side = redCount <= blueCount ? 'red' : 'blue';

  const player = {
    id: makeId(),
    name: name.trim(),
    side: side,
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

function getTournamentGame() {
  if (tournamentGameMode === 'manual') {
    const select = document.getElementById('tournament-game-select');
    if (select && select.value) return select.value;
  }
  // Auto: pick a random game that hasn't been played recently
  const t = getTournament();
  const recentGames = t.history.slice(-5).map(h => h.game);
  const available = Object.keys(GAME_FACTORIES).filter(g => !recentGames.includes(g));
  const pool = available.length > 0 ? available : Object.keys(GAME_FACTORIES);
  return pool[Math.floor(Math.random() * pool.length)];
}

function autoPair() {
  const t = getTournament();
  if (t.players.length < 2) return null;

  // Pair one prosecution vs one defence, prioritising players with fewest matches
  const redPlayers = t.players.filter(p => p.side === 'red').sort((a, b) => a.matches - b.matches);
  const bluePlayers = t.players.filter(p => p.side === 'blue').sort((a, b) => a.matches - b.matches);

  if (redPlayers.length === 0 || bluePlayers.length === 0) return null;

  // Find a pairing that hasn't played each other yet
  let bestPair = null;
  for (const red of redPlayers) {
    for (const blue of bluePlayers) {
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
    // All combos played — just pick the two with fewest matches
    bestPair = { red: redPlayers[0], blue: bluePlayers[0] };
  }

  const game = getTournamentGame();

  t.currentMatch = {
    redId: bestPair.red.id,
    blueId: bestPair.blue.id,
    redName: bestPair.red.name,
    blueName: bestPair.blue.name,
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
  }

  t.currentMatch = null;
  broadcastTournament();
}

function renderTournamentRoster() {
  const t = getTournament();
  const redEl = document.getElementById('tournament-prosecution');
  const blueEl = document.getElementById('tournament-defence');
  if (!redEl || !blueEl) return;

  const reds = t.players.filter(p => p.side === 'red');
  const blues = t.players.filter(p => p.side === 'blue');

  redEl.innerHTML = reds.map(p => `
    <div class="player-row">
      <span class="player-name" style="color:var(--neon-red);">${p.name}</span>
      <span class="player-stats">${p.wins || 0}W · ${p.matches || 0}M</span>
    </div>
  `).join('') || '<p style="color:var(--muted);font-size:0.85rem;">No players yet.</p>';

  blueEl.innerHTML = blues.map(p => `
    <div class="player-row">
      <span class="player-name" style="color:var(--neon-blue);">${p.name}</span>
      <span class="player-stats">${p.wins || 0}W · ${p.matches || 0}M</span>
    </div>
  `).join('') || '<p style="color:var(--muted);font-size:0.85rem;">No players yet.</p>';

  const pairBtn = document.getElementById('pair-next-btn');
  if (pairBtn) pairBtn.disabled = reds.length < 1 || blues.length < 1;
}

function updateTournamentUI() {
  renderTournamentRoster();
}

function renderFullLeaderboard() {
  const playersEl = document.getElementById('leaderboard-players');
  if (!playersEl) return;

  const sortedPlayers = [...tournamentState.players].sort((a, b) => (b.wins || 0) - (a.wins || 0));
  playersEl.innerHTML = sortedPlayers.map((p, i) => {
    const sideColor = p.side === 'red' ? 'var(--neon-red)' : 'var(--neon-blue)';
    const sideLabel = p.side === 'red' ? 'Prosecution' : 'Defence';
    return `
      <div class="leaderboard-row">
        <span>${i + 1}. ${p.name} <span style="color:${sideColor};font-size:0.8rem;">· ${sideLabel}</span></span>
        <span style="font-weight:800;">${p.wins || 0}W · ${p.matches || 0}M</span>
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

  const gameMeta = GAME_META[match.game];
  const gameLabel = document.getElementById('match-game-label');
  if (gameLabel && gameMeta) gameLabel.textContent = `${gameMeta.icon} ${gameMeta.title}`;

  document.getElementById('match-red-name').textContent = match.redName;
  document.getElementById('match-red-chamber').textContent = 'PROSECUTION';
  document.getElementById('match-red-chamber').style.color = 'var(--neon-red)';

  document.getElementById('match-blue-name').textContent = match.blueName;
  document.getElementById('match-blue-chamber').textContent = 'DEFENCE';
  document.getElementById('match-blue-chamber').style.color = 'var(--neon-blue)';
}

// Populate game select dropdown
function populateGameSelect() {
  const select = document.getElementById('tournament-game-select');
  if (!select) return;
  select.innerHTML = Object.entries(GAME_META).map(([key, meta]) =>
    `<option value="${key}">${meta.icon} ${meta.title}</option>`
  ).join('');
}

const tournamentBtn = document.getElementById('tournament-btn');
if (tournamentBtn) {
  tournamentBtn.addEventListener('click', () => {
    tournamentCode = 'local';
    populateGameSelect();
    showScreen('tournament');
  });
}

const registerBtn = document.getElementById('register-btn');
if (registerBtn) {
  registerBtn.addEventListener('click', () => {
    const name = document.getElementById('player-name').value.trim();
    if (!name) return alert('Enter a player name.');
    const player = addPlayer(name);
    myPlayerId = player.id;
    document.getElementById('player-name').value = '';
  });
}

const autoGameBtn = document.getElementById('auto-game-btn');
if (autoGameBtn) {
  autoGameBtn.addEventListener('click', () => {
    tournamentGameMode = 'auto';
    autoGameBtn.classList.add('primary');
    manualGameBtn.classList.remove('primary');
    document.getElementById('manual-game-select').style.display = 'none';
  });
}

const manualGameBtn = document.getElementById('manual-game-btn');
if (manualGameBtn) {
  manualGameBtn.addEventListener('click', () => {
    tournamentGameMode = 'manual';
    manualGameBtn.classList.add('primary');
    autoGameBtn.classList.remove('primary');
    document.getElementById('manual-game-select').style.display = 'block';
  });
}

// Set default mode
if (autoGameBtn) autoGameBtn.classList.add('primary');

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