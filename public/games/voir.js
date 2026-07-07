function createVoirGame(app) {
  const WIN_AT = 3, MAXR = 5;
  const stage = document.getElementById('game-stage');
  let bank = [], deck = [], round = 0, cur = null;
  let pos = { red: 0, blue: 0 }, locked = { red: false, blue: false }, targetBias = null;

  async function load() { const res = await fetch('games/voir.json'); bank = await res.json(); }
  function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function setHint() {
    const h = document.querySelector('.controls-hint');
    if (h) h.innerHTML = '<span><b>LEFT:</b> A/D cycle · S lock</span><span><b>RIGHT:</b> J/L cycle · K lock</span>';
  }

  function render() {
    const juror = cur.pool[pos.red];
    const jurorB = cur.pool[pos.blue];
    stage.innerHTML = `
      <div class="stage-wrap">
        <div class="stage-q">
          <div class="lab">Round ${round} / ${MAXR} — voir dire</div>
          <div class="qtext">Pick the juror most likely to side with <b style="color:var(--neon-gold)">${targetBias === 'pro-prosecution' ? 'Prosecution 🔴' : 'Defence 🔵'}</b>.</div>
        </div>
        <div class="split-cols">
          <div class="split-col red" id="col-red">
            <div class="tag">🔴 Prosecution</div>
            <div class="juror-card" id="juror-red">
              <div class="juror-name">${juror.juror}</div>
              <div class="juror-bias" style="color:${biasColor(juror.bias)}">${juror.bias}</div>
              <div class="juror-clue">${juror.clue}</div>
            </div>
            <div class="col-status" id="stat-red">${locked.red ? 'LOCKED' : 'A/D to cycle, S to lock'}</div>
          </div>
          <div class="split-col blue" id="col-blue">
            <div class="tag">🔵 Defence</div>
            <div class="juror-card" id="juror-blue">
              <div class="juror-name">${jurorB.juror}</div>
              <div class="juror-bias" style="color:${biasColor(jurorB.bias)}">${jurorB.bias}</div>
              <div class="juror-clue">${jurorB.clue}</div>
            </div>
            <div class="col-status" id="stat-blue">${locked.blue ? 'LOCKED' : 'J/L to cycle, K to lock'}</div>
          </div>
        </div>
      </div>`;
  }

  function biasColor(bias) {
    if (bias === 'pro-prosecution') return 'var(--neon-red)';
    if (bias === 'pro-defence') return 'var(--neon-blue)';
    return 'var(--neon-gold)';
  }

  function scoreJuror(juror) {
    if (targetBias === 'pro-prosecution') return juror.bias === 'pro-prosecution' ? 2 : (juror.bias === 'swing' ? 1 : 0);
    return juror.bias === 'pro-defence' ? 2 : (juror.bias === 'swing' ? 1 : 0);
  }

  function cycle(side, dir) {
    if (locked[side]) return;
    pos[side] = (pos[side] + dir + cur.pool.length) % cur.pool.length;
    render();
  }

  function lockIn(side) {
    if (locked[side]) return;
    locked[side] = true;
    const stat = document.getElementById('stat-' + side);
    if (stat) stat.textContent = 'LOCKED';
    if (locked.red && locked.blue) resolve();
  }

  function resolve() {
    const rp = scoreJuror(cur.pool[pos.red]);
    const bp = scoreJuror(cur.pool[pos.blue]);
    app.scores.red += rp; app.scores.blue += bp;
    if (typeof saveScores === 'function') saveScores();
    updateScoreBar();
    const statR = document.getElementById('stat-red');
    const statB = document.getElementById('stat-blue');
    if (statR) statR.textContent = rp + ' pts';
    if (statB) statB.textContent = bp + ' pts';
    setTimeout(nextOrEnd, 2000);
  }

  function nextOrEnd() {
    if (round >= MAXR || round >= deck.length) {
      const winner = app.scores.red > app.scores.blue ? 'red' : (app.scores.blue > app.scores.red ? 'blue' : 'draw');
      return showVerdict(winner, (choice) => { if (choice === 'rematch') start(); else showScreen('lobby'); });
    }
    startRound();
  }

  function startRound() {
    pos = { red: 0, blue: 0 }; locked = { red: false, blue: false }; round++;
    cur = deck[round - 1];
    targetBias = Math.random() < 0.5 ? 'pro-prosecution' : 'pro-defence';
    render();
  }

  async function start() {
    if (!bank.length) await load();
    deck = shuffle(bank).map(j => ({ pool: shuffle(bank).slice(0, 5) })).slice(0, MAXR);
    round = 0; app.scores = { red: 0, blue: 0 };
    updateScoreBar(); setHint(); showScreen('game');
    startRound();
  }

  function onKey(key) {
    if (key === 'a') cycle('red', -1);
    if (key === 'd') cycle('red', 1);
    if (key === 's') lockIn('red');
    if (key === 'j') cycle('blue', -1);
    if (key === 'l') cycle('blue', 1);
    if (key === 'k') lockIn('blue');
  }
  function onPhoneAction(action, side) {
    if (action === 'up') cycle(side, -1);
    if (action === 'down') cycle(side, 1);
    if (action === 'buzz') lockIn(side);
  }

  return { start, onKey, onPhoneAction };
}
