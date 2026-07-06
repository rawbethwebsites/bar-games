const App = {
  mode: 'same-screen',
  roomCode: null,
  socket: null,
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
  const stage = document.getElementById('game-stage');
  stage.innerHTML = `
    <div class="winner-screen">
      <h2>Verdict!</h2>
      <div class="winner-name" style="margin-bottom:0.5rem;">${winner === 'draw' ? 'The Court is Tied' : (winner === 'red' ? 'Prosecution Wins' : 'Defence Wins')}</div>
      <div style="color:var(--muted);font-size:1rem;margin-bottom:2rem;">
        Running total — Prosecution: <span style="color:var(--neon-red);font-weight:800;">${App.scores.red}</span> · Defence: <span style="color:var(--neon-blue);font-weight:800;">${App.scores.blue}</span>
      </div>
      <div class="mode-select" style="margin-top:1rem;justify-content:center;">
        <button class="mode-btn" id="rematch-btn">Rematch</button>
        <button class="mode-btn back-to-lobby">Back to Menu</button>
        <button class="mode-btn" id="home-btn">Homepage</button>
      </div>
    </div>
  `;

  document.getElementById('rematch-btn').onclick = () => callback('rematch');
  document.querySelector('.back-to-lobby').onclick = () => callback('menu');
  document.getElementById('home-btn').onclick = () => showScreen('home');
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

function initSocket() {
  App.socket = io();

  App.socket.on('player-joined', ({ side }) => {
    const dot = document.getElementById(`player-${side}`);
    if (dot) dot.classList.add('joined');
    checkStartReady();
  });

  App.socket.on('player-left', ({ side }) => {
    const dot = document.getElementById(`player-${side}`);
    if (dot) dot.classList.remove('joined');
    checkStartReady();
  });

  App.socket.on('player-action', ({ action, side }) => {
    if (App.activeGame && App.activeGame.onPhoneAction) {
      App.activeGame.onPhoneAction(action, side);
    }
  });
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
      if (!App.socket) initSocket();
      App.socket.emit('create-room', (code) => {
        App.roomCode = code;
        document.getElementById('room-code').textContent = code;
        document.getElementById('players-joined').innerHTML = `
          <div id="player-red" class="player-dot red"></div>
          <div id="player-blue" class="player-dot blue"></div>
        `;
        new QRCode(document.getElementById('qr-container'), {
          text: `${window.location.origin}/controller.html?room=${code}`,
          width: 200,
          height: 200,
          colorDark: '#0b0c15',
          colorLight: '#ffffff',
        });
        document.getElementById('start-game-btn').onclick = () => {
          resetScores();
          showScreen('lobby');
        };
        showScreen('phone-lobby');
      });
    }
  });
});

// Lobby game selection
document.querySelectorAll('.game-card').forEach(card => {
  card.addEventListener('click', () => {
    const game = card.dataset.game;
    App.selectedGame = game;
    if (game === 'guilty') {
      showScreen('game');
      App.activeGame = createGuiltyGame(App);
      App.activeGame.start();
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

// Auto-init socket if coming from a controller join link
if (window.location.pathname.includes('controller')) {
  initSocket();
}

loadScores();
updateScoreBar();

// Show leaderboard on home screen
const homeScreen = document.getElementById('home');
if (homeScreen) renderLeaderboard(homeScreen.querySelector('.arcade-card'));
