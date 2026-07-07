function createCrossGame(app) {
  const MAX = 10, QTIME = 8;
  const stage = document.getElementById('game-stage');
  let bank = [], deck = [], round = 0, cur = null;
  let ans = { red: null, blue: null }, timer = null, resolving = false;

  async function load() { const res = await fetch('games/cross.json'); bank = await res.json(); }
  function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function setHint() {
    const h = document.querySelector('.controls-hint');
    if (h) h.innerHTML = '<span><b>LEFT:</b> A = YES · D = NO</span><span><b>RIGHT:</b> J = YES · L = NO</span>';
  }

  function render() {
    stage.innerHTML = `
      <div class="stage-wrap">
        <div class="stage-q">
          <div class="lab">Question ${round} / ${MAX} — cross-examination</div>
          <div class="qtext"><b style="color:var(--neon-gold)">${cur.witness}</b> said:<br>“${cur.text}”</div>
          <div class="qtext" style="margin-top:1rem;color:var(--muted);">${cur.q}</div>
          <div class="timer-bar" style="margin-top:1rem;"><div class="fill" id="timer-fill"></div></div>
        </div>
        <div class="split-cols">
          <div class="split-col red"><div class="tag">🔴 Prosecution</div>
            <div class="choices">
              <button class="choice-btn choice-real" data-side="red" data-ans="true">YES</button>
              <button class="choice-btn choice-fake" data-side="red" data-ans="false">NO</button>
            </div>
            <div class="col-status" id="stat-red"></div></div>
          <div class="split-col blue"><div class="tag">🔵 Defence</div>
            <div class="choices">
              <button class="choice-btn choice-real" data-side="blue" data-ans="true">YES</button>
              <button class="choice-btn choice-fake" data-side="blue" data-ans="false">NO</button>
            </div>
            <div class="col-status" id="stat-blue"></div></div>
        </div>
      </div>`;
    stage.querySelectorAll('.choice-btn').forEach(b =>
      b.addEventListener('click', () => pick(b.dataset.side, b.dataset.ans === 'true')));
    startTimer();
  }

  function startTimer() {
    let left = QTIME; const fill = document.getElementById('timer-fill');
    timer = setInterval(() => {
      left -= 0.1;
      if (fill) fill.style.width = Math.max(0, left / QTIME) * 100 + '%';
      if (left <= 0) { clearInterval(timer); resolve(); }
    }, 100);
  }

  function pick(side, answer) {
    if (resolving || ans[side] !== null) return;
    ans[side] = answer;
    const col = document.querySelector(`.split-col.${side}`);
    col.classList.add('locked');
    const correct = answer === cur.yes;
    const stat = document.getElementById('stat-' + side);
    stat.textContent = correct ? 'Correct!' : 'Wrong!';
    stat.style.color = correct ? 'var(--neon-green)' : 'var(--neon-red)';
    if (ans.red !== null && ans.blue !== null) resolve();
  }

  function resolve() {
    if (resolving) return; resolving = true; clearInterval(timer);
    let rp = 0, bp = 0;
    if (ans.red === cur.yes) rp = 1;
    if (ans.blue === cur.yes) bp = 1;
    app.scores.red += rp; app.scores.blue += bp;
    if (typeof saveScores === 'function') saveScores();
    updateScoreBar();
    setTimeout(nextOrEnd, 1600);
  }

  function nextOrEnd() {
    if (round >= MAX || round >= deck.length) {
      const winner = app.scores.red > app.scores.blue ? 'red' : (app.scores.blue > app.scores.red ? 'blue' : 'draw');
      return showVerdict(winner, (choice) => { if (choice === 'rematch') start(); else showScreen('lobby'); });
    }
    startRound();
  }

  function startRound() {
    ans = { red: null, blue: null }; resolving = false; round++;
    cur = deck[round - 1];
    stage.innerHTML = '<div class="countdown"></div>';
    showCountdown(stage.firstElementChild, render);
  }

  async function start() {
    if (!bank.length) await load();
    deck = shuffle(bank).slice(0, MAX);
    round = 0; app.scores = { red: 0, blue: 0 };
    updateScoreBar(); setHint(); showScreen('game');
    startRound();
  }

  function onKey(key) {
    if (resolving) return;
    if (key === 'a' || key === 'arrowleft') pick('red', true);
    if (key === 'd' || key === 'arrowright') pick('red', false);
    if (key === 'j' || key === '4') pick('blue', true);
    if (key === 'l' || key === '6') pick('blue', false);
  }
  function onPhoneAction(action, side) { if (action === 'a') pick(side, true); if (action === 'b') pick(side, false); }

  return { start, onKey, onPhoneAction };
}
