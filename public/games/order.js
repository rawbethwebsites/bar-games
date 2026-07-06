function createOrderGame(app) {
  const WIN_AT = 3, MAXR = 5;
  const LKEYS = { q: 0, w: 1, a: 2, s: 3 };
  const RKEYS = { u: 0, i: 1, j: 2, k: 3 };
  const LLAB = ['Q', 'W', 'A', 'S'], RLAB = ['U', 'I', 'J', 'K'];
  const stage = document.getElementById('game-stage');

  let bank = [], deck = [], round = 0, cur = null;
  let dealt = { red: [], blue: [] }, chosen = { red: null, blue: null }, phase = 'pick';

  function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  async function load() { const res = await fetch('games/order.json'); bank = await res.json(); }

  function setHint() {
    const h = document.querySelector('.controls-hint');
    if (h) h.innerHTML = '<span><b>PICK:</b> L=Q W A S · R=U I J K</span><span><b>VOTE:</b> ← / → or click</span>';
  }

  function promptHTML() { return cur.prompt.includes('___') ? cur.prompt.replace('___', '<b style="color:var(--neon-gold)">?</b>') : cur.prompt; }
  function sentence(pick) { return cur.prompt.includes('___') ? cur.prompt.replace('___', '<b>' + pick + '</b>') : cur.prompt + ' <b>' + pick + '</b>'; }

  function buildCards(side, labels) {
    return dealt[side].map((opt, idx) =>
      `<button class="opt-tile" data-side="${side}" data-idx="${idx}"><span class="k">${labels[idx]}</span><span class="t">${opt}</span></button>`).join('');
  }

  function renderPick() {
    stage.innerHTML = `
      <div class="stage-wrap">
        <div class="stage-q"><div class="lab">Round ${round} / ${MAXR} — finish the sentence</div>
          <div class="qtext">${promptHTML()}</div></div>
        <div class="split-cols">
          <div class="split-col red" id="col-red"><div class="tag">🔴 Prosecution — pick your line</div>
            <div class="order-grid" id="grid-red">${buildCards('red', LLAB)}</div>
            <div class="col-status" id="stat-red"></div></div>
          <div class="split-col blue" id="col-blue"><div class="tag">🔵 Defence — pick your line</div>
            <div class="order-grid" id="grid-blue">${buildCards('blue', RLAB)}</div>
            <div class="col-status" id="stat-blue"></div></div>
        </div>
      </div>`;
    stage.querySelectorAll('.opt-tile').forEach(b =>
      b.addEventListener('click', () => pick(b.dataset.side, parseInt(b.dataset.idx, 10))));
  }

  function pick(side, idx) {
    if (phase !== 'pick' || chosen[side] !== null) return;
    chosen[side] = dealt[side][idx];
    const tile = document.querySelector(`#grid-${side} [data-idx="${idx}"]`);
    if (tile) tile.classList.add('picked');
    document.getElementById('col-' + side).classList.add('locked');
    document.getElementById('stat-' + side).textContent = 'Locked in — no peeking!';
    if (chosen.red !== null && chosen.blue !== null) setTimeout(openVote, 450);
  }

  function openVote() {
    phase = 'vote';
    const overlay = document.createElement('div');
    overlay.className = 'vote-overlay';
    overlay.innerHTML = `
      <h3>Order in the court — which is funnier?</h3>
      <div class="vote-picks">
        <div class="vote-pick red" id="vote-red"><div class="who">🔴 Prosecution</div><div class="sentence">${sentence(chosen.red)}</div></div>
        <div class="vote-pick blue" id="vote-blue"><div class="who">🔵 Defence</div><div class="sentence">${sentence(chosen.blue)}</div></div>
      </div>
      <div class="vote-cue">The room decides. Tap the winner — or press ← / →</div>`;
    stage.appendChild(overlay);
    document.getElementById('vote-red').addEventListener('click', () => castVote('red'));
    document.getElementById('vote-blue').addEventListener('click', () => castVote('blue'));
  }

  function castVote(side) {
    if (phase !== 'vote') return; phase = 'done';
    if (side === 'red') app.scores.red++; else app.scores.blue++;
    if (typeof saveScores === 'function') saveScores();
    updateScoreBar();
    const win = document.getElementById('vote-' + side);
    if (win) win.style.boxShadow = '0 0 0 3px var(--neon-gold), 0 18px 40px rgba(0,0,0,0.5)';
    setTimeout(() => {
      if (app.scores.red >= WIN_AT || app.scores.blue >= WIN_AT) endMatch();
      else nextRound();
    }, 1200);
  }

  function endMatch() {
    const winner = app.scores.red > app.scores.blue ? 'red' : (app.scores.blue > app.scores.red ? 'blue' : 'draw');
    showVerdict(winner, (choice) => { if (choice === 'rematch') start(); else showScreen('lobby'); });
  }

  function nextRound() {
    if (round >= MAXR || round >= deck.length) return endMatch();
    cur = deck[round]; round++; phase = 'pick'; chosen = { red: null, blue: null };
    const pool = shuffle(cur.options);
    dealt = { red: pool.slice(0, 4), blue: pool.slice(4, 8) };
    renderPick();
  }

  async function start() {
    if (!bank.length) await load();
    deck = shuffle(bank).slice(0, MAXR);
    round = 0;
    app.scores = { red: 0, blue: 0 };
    updateScoreBar(); setHint();
    showScreen('game');
    nextRound();
  }

  function onKey(key) {
    if (phase === 'pick') {
      if (key in LKEYS) pick('red', LKEYS[key]);
      else if (key in RKEYS) pick('blue', RKEYS[key]);
    } else if (phase === 'vote') {
      if (key === 'arrowleft') castVote('red');
      else if (key === 'arrowright') castVote('blue');
    }
  }
  function onPhoneAction(action, side) {
    const map = { a: 0, b: 1, c: 2, d: 3 };
    if (phase === 'pick' && action in map) pick(side, map[action]);
  }

  return { start, onKey, onPhoneAction };
}
