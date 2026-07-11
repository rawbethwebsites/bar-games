function createPleaGame(app) {
  const MAX = 10, QTIME = 12;
  const stage = document.getElementById('game-stage');
  let bank = [], deck = [], round = 0, cur = null;
  let ans = { red: null, blue: null }, timer = null, resolving = false;

  async function load() { const res = await fetch('games/plea.json'); bank = await res.json(); }
  function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function setHint() {
    const h = document.querySelector('.controls-hint');
    if (h) h.innerHTML = '<span><b>LEFT:</b> A = ACCEPT PLEA · D = RISK TRIAL</span><span><b>RIGHT:</b> J = ACCEPT PLEA · L = RISK TRIAL</span>';
  }

  function render() {
    stage.innerHTML = `
      <div class="stage-wrap">
        <div class="stage-q">
          <div class="lab">Case ${round} / ${MAX} — plea bargain</div>
          <div class="qtext"><b style="color:var(--neon-gold)">CRIME:</b> ${cur.scenario}</div>
          <div class="qtext" style="margin-top:1rem;"><b style="color:var(--neon-green)">PLEA DEAL:</b> ${cur.plea}</div>
          <div class="qtext" style="margin-top:0.5rem;color:var(--muted);"><b style="color:var(--neon-red)">RISK AT TRIAL:</b> ${cur.risk}</div>
          <div class="timer-bar" style="margin-top:1rem;"><div class="fill" id="timer-fill"></div></div>
        </div>
        <div class="split-cols">
          <div class="split-col red"><div class="tag">🔴 Prosecution</div>
            <div class="choices">
              <button class="choice-btn choice-real" data-side="red" data-ans="true">ACCEPT PLEA</button>
              <button class="choice-btn choice-fake" data-side="red" data-ans="false">RISK TRIAL</button>
            </div>
            <div class="col-status" id="stat-red"></div></div>
          <div class="split-col blue"><div class="tag">🔵 Defence</div>
            <div class="choices">
              <button class="choice-btn choice-real" data-side="blue" data-ans="true">ACCEPT PLEA</button>
              <button class="choice-btn choice-fake" data-side="blue" data-ans="false">RISK TRIAL</button>
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
    document.querySelector(`.split-col.${side}`).classList.add('locked');
    const correct = answer === (cur.bestChoice === 'plea');
    const stat = document.getElementById('stat-' + side);
    stat.textContent = correct ? 'Correct!' : 'Wrong!';
    stat.style.color = correct ? 'var(--neon-green)' : 'var(--neon-red)';
    if (window.SFX) { if (correct) SFX.correct(); else SFX.wrong(); }
    if (ans.red !== null && ans.blue !== null) resolve();
  }

  function resolve() {
    if (resolving) return; resolving = true; clearInterval(timer);
    const target = cur.bestChoice === 'plea';
    let rp = 0, bp = 0;
    if (ans.red === target) rp = 1;
    if (ans.blue === target) bp = 1;
    app.scores.red += rp; app.scores.blue += bp;
    if (typeof saveScores === 'function') saveScores();
    updateScoreBar();
    // Show reason
    if (cur.reason) {
      const lab = document.querySelector('.stage-q .lab');
      if (lab) lab.innerHTML += `<div style="margin-top:0.5rem;color:var(--muted);font-size:0.9rem;">${cur.reason}</div>`;
    }
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
    ans = { red: null, blue: null }; resolving = false; round++;
    cur = deck[round - 1];
    stage.innerHTML = '<div class="countdown"></div>';
    showCountdown(stage.firstElementChild, render);
  }

  async function start() {
    if (!bank.length) await load();
    deck = shuffleNoStreak(getUnusedItems(bank, 'plea', MAX), item => item.bestChoice === 'plea');
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
  // realfake scheme: 'real' = left/accept button, 'fake' = right/trial button
  function onPhoneAction(action, side) {
    if (action === 'real') pick(side, true);
    if (action === 'fake') pick(side, false);
  }

  function cleanup() { if (timer) clearInterval(timer); }
  return { start, onKey, onPhoneAction, cleanup };
}