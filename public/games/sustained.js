function createSustainedGame(app) {
  const MAX = 10, QTIME = 11;
  const LETTERS = ['A', 'B', 'C', 'D'];
  const LKEYS = { q: 0, w: 1, a: 2, s: 3 };
  const RKEYS = { u: 0, i: 1, j: 2, k: 3 };
  const LLAB = ['Q', 'W', 'A', 'S'], RLAB = ['U', 'I', 'J', 'K'];
  const stage = document.getElementById('game-stage');

  let bank = [], deck = [], round = 0, cur = null;
  let ans = { red: null, blue: null }, firstCorrect = null, timer = null, tLeft = 0, resolving = false;

  function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  async function load() { const res = await fetch('games/sustained.json'); bank = await res.json(); }

  function setHint() {
    const h = document.querySelector('.controls-hint');
    if (h) h.innerHTML = '<span><b>LEFT:</b> Q W A S</span><span><b>RIGHT:</b> U I J K</span>';
  }

  function buildGrid(sel, labels, side) {
    return cur.options.map((opt, idx) =>
      `<button class="opt-tile" data-side="${side}" data-idx="${idx}">
         <span class="k">${labels[idx]}</span><span class="t"><b style="color:var(--neon-gold)">${LETTERS[idx]}.</b> ${opt}</span>
       </button>`).join('');
  }

  function renderQuestion() {
    stage.innerHTML = `
      <div class="stage-wrap">
        <div class="stage-q">
          <div class="lab">Question ${round} / ${MAX} — before the court</div>
          <div class="qtext">${cur.q}</div>
          <div class="timer-bar" style="margin-top:1rem;"><div class="fill" id="timer-fill"></div></div>
        </div>
        <div class="split-cols">
          <div class="split-col red" id="col-red"><div class="tag">🔴 Prosecution — Q W A S</div>
            <div class="tile-grid" id="grid-red">${buildGrid('red', LLAB, 'red')}</div>
            <div class="col-status" id="stat-red"></div></div>
          <div class="split-col blue" id="col-blue"><div class="tag">🔵 Defence — U I J K</div>
            <div class="tile-grid" id="grid-blue">${buildGrid('blue', RLAB, 'blue')}</div>
            <div class="col-status" id="stat-blue"></div></div>
        </div>
      </div>`;
    stage.querySelectorAll('.opt-tile').forEach(b =>
      b.addEventListener('click', () => pick(b.dataset.side, parseInt(b.dataset.idx, 10))));
    startTimer();
  }

  function startTimer() {
    tLeft = QTIME; const fill = document.getElementById('timer-fill');
    timer = setInterval(() => {
      tLeft -= 0.1;
      if (fill) fill.style.width = Math.max(0, tLeft / QTIME) * 100 + '%';
      if (tLeft <= 0) { clearInterval(timer); resolve(); }
    }, 100);
  }

  function pick(side, idx) {
    if (resolving || ans[side] !== null) return;
    const correct = idx === cur.a;
    ans[side] = { idx, correct };
    if (correct && firstCorrect === null) firstCorrect = side;
    const tile = document.querySelector(`#grid-${side} [data-idx="${idx}"]`);
    if (tile) tile.classList.add('picked');
    document.getElementById('col-' + side).classList.add('locked');
    const stat = document.getElementById('stat-' + side);
    if (correct) stat.textContent = firstCorrect === side ? 'Correct — first in!' : 'Correct!';
    else { if (tile) tile.classList.add('wrong'); stat.textContent = 'Wrong — locked out'; }
    if (ans.red !== null && ans.blue !== null) resolve();
  }

  function resolve() {
    if (resolving) return; resolving = true; clearInterval(timer);
    let rp = 0, bp = 0;
    ['red', 'blue'].forEach(s => { const v = ans[s]; if (v && v.correct) { const pts = firstCorrect === s ? 2 : 1; if (s === 'red') rp = pts; else bp = pts; } });
    app.scores.red += rp; app.scores.blue += bp;
    if (typeof saveScores === 'function') saveScores();
    updateScoreBar();
    ['red', 'blue'].forEach(s => {
      const correctTile = document.querySelector(`#grid-${s} [data-idx="${cur.a}"]`);
      if (correctTile) correctTile.classList.add('correct');
      document.getElementById('col-' + s).classList.add('locked');
      if (ans[s] === null) document.getElementById('stat-' + s).textContent = 'No answer';
    });
    setTimeout(nextOrEnd, 2200);
  }

  function nextOrEnd() {
    if (round >= MAX || round >= deck.length) {
      const winner = app.scores.red > app.scores.blue ? 'red' : (app.scores.blue > app.scores.red ? 'blue' : 'draw');
      return showVerdict(winner, (choice) => { if (choice === 'rematch') start(); else showScreen('lobby'); });
    }
    startRound();
  }

  function startRound() {
    ans = { red: null, blue: null }; firstCorrect = null; resolving = false;
    const raw = deck[round]; round++;
    const order = shuffle([0, 1, 2, 3]);
    cur = { q: raw.q, options: order.map(i => raw.options[i]), a: order.indexOf(raw.a) };
    stage.innerHTML = `<div class="countdown"></div>`;
    showCountdown(stage.firstElementChild, renderQuestion);
  }

  async function start() {
    if (!bank.length) await load();
    deck = getUnusedItems(bank, 'sustained', MAX);
    round = 0;
    app.scores = { red: 0, blue: 0 };
    updateScoreBar(); setHint();
    showScreen('game');
    startRound();
  }

  function onKey(key) {
    if (resolving) return;
    if (key in LKEYS) pick('red', LKEYS[key]);
    else if (key in RKEYS) pick('blue', RKEYS[key]);
  }
  function onPhoneAction(action, side) {
    const map = { a: 0, b: 1, c: 2, d: 3 };
    if (action in map) pick(side, map[action]);
  }

  return { start, onKey, onPhoneAction };
}
