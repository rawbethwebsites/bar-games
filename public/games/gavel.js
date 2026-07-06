function createGavelGame(app) {
  const MAXR = 5;
  const stage = document.getElementById('game-stage');

  let round = 0, zone = 0.28, raf = null, last = 0, sudden = false;
  let N = { red: null, blue: null };

  function setHint() {
    const h = document.querySelector('.controls-hint');
    if (h) h.innerHTML = '<span><b>LEFT:</b> A = STOP</span><span><b>RIGHT:</b> L = STOP</span>';
  }

  function render() {
    stage.innerHTML = `
      <div class="stage-wrap">
        <div class="stage-banner" id="banner">Green zone: wide open. Stop the needle!</div>
        <div class="gavel-cols">
          <div class="gavel-col red">
            <div class="tag">🔴 Prosecution</div>
            <div class="meter" id="meter-red"><div class="mlabels"><span>GUILTY</span><span class="mid">NOT GUILTY</span><span>GUILTY</span></div><div class="zone" id="zone-red"></div><div class="needle" id="needle-red"></div></div>
            <button class="gavel-btn" id="btn-red">Press <b>A</b> to stop</button>
            <div class="gavel-result" id="res-red"></div>
            <div class="gavel-greens" id="greens-red">Greens: 0</div>
          </div>
          <div class="gavel-col blue">
            <div class="tag">🔵 Defence</div>
            <div class="meter" id="meter-blue"><div class="mlabels"><span>GUILTY</span><span class="mid">NOT GUILTY</span><span>GUILTY</span></div><div class="zone" id="zone-blue"></div><div class="needle" id="needle-blue"></div></div>
            <button class="gavel-btn" id="btn-blue">Press <b>L</b> to stop</button>
            <div class="gavel-result" id="res-blue"></div>
            <div class="gavel-greens" id="greens-blue">Greens: 0</div>
          </div>
        </div>
      </div>`;
    ['red', 'blue'].forEach(s => {
      document.getElementById('meter-' + s).addEventListener('pointerdown', () => stop(s));
      document.getElementById('btn-' + s).addEventListener('pointerdown', () => stop(s));
    });
  }

  function paintZone() {
    ['red', 'blue'].forEach(s => { const z = document.getElementById('zone-' + s); if (z) { z.style.width = zone * 100 + '%'; z.style.left = '50%'; } });
  }

  function nextRound() {
    if (round >= MAXR) return endMatch();
    round++;
    zone = Math.max(0.10, 0.30 - (round - 1) * 0.045);
    const spd = 0.85 + (round - 1) * 0.16;
    render(); paintZone();
    N.red = { pos: Math.random() * 0.4 + 0.05, dir: 1, speed: spd, stopped: false, hit: false };
    N.blue = { pos: Math.random() * 0.4 + 0.55, dir: -1, speed: spd, stopped: false, hit: false };
    const pct = Math.round(zone * 100);
    document.getElementById('banner').textContent = round === 1 ? 'Green zone: wide open. Stop the needle!' : `Green zone narrows to ${pct}% — steady…`;
    last = performance.now();
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  }

  function loop(ts) {
    const dt = Math.min(0.05, (ts - last) / 1000); last = ts;
    ['red', 'blue'].forEach(s => {
      const n = N[s];
      if (n && !n.stopped) {
        n.pos += n.dir * n.speed * dt;
        if (n.pos >= 1) { n.pos = 1; n.dir = -1; }
        if (n.pos <= 0) { n.pos = 0; n.dir = 1; }
        const el = document.getElementById('needle-' + s);
        if (el) el.style.left = n.pos * 100 + '%';
      }
    });
    raf = requestAnimationFrame(loop);
  }

  function stop(side) {
    const n = N[side];
    if (!n || n.stopped) return;
    n.stopped = true;
    const inZone = Math.abs(n.pos - 0.5) <= zone / 2;
    n.hit = inZone;
    document.getElementById('meter-' + side).classList.add(inZone ? 'hit' : 'miss');
    const res = document.getElementById('res-' + side);
    if (inZone) { res.textContent = 'NOT GUILTY — clean stop!'; res.className = 'gavel-result good'; }
    else { res.textContent = n.pos < 0.5 ? 'Too early — GUILTY' : 'Too late — GUILTY'; res.className = 'gavel-result bad'; }

    if (!sudden) {
      if (inZone) { if (side === 'red') app.scores.red++; else app.scores.blue++; }
      if (typeof saveScores === 'function') saveScores();
      updateScoreBar();
      document.getElementById('greens-' + side).textContent = 'Greens: ' + app.scores[side];
      if (N.red.stopped && N.blue.stopped) { if (raf) cancelAnimationFrame(raf); setTimeout(nextRound, 1400); }
    } else {
      if (N.red.stopped && N.blue.stopped) resolveSudden();
    }
  }

  function resolveSudden() {
    if (raf) cancelAnimationFrame(raf);
    if (N.red.hit && !N.blue.hit) app.scores.red++;
    else if (N.blue.hit && !N.red.hit) app.scores.blue++;
    updateScoreBar();
    if (app.scores.red !== app.scores.blue) { sudden = false; setTimeout(finish, 1300); }
    else setTimeout(suddenDeath, 1300);
  }

  function suddenDeath() {
    sudden = true;
    zone = 0.08;
    render(); paintZone();
    const spd = 1.7;
    N.red = { pos: Math.random() * 0.4 + 0.05, dir: 1, speed: spd, stopped: false, hit: false };
    N.blue = { pos: Math.random() * 0.4 + 0.55, dir: -1, speed: spd, stopped: false, hit: false };
    document.getElementById('greens-red').textContent = 'Greens: ' + app.scores.red;
    document.getElementById('greens-blue').textContent = 'Greens: ' + app.scores.blue;
    document.getElementById('banner').textContent = 'SUDDEN DEATH — tiny zone, land it to win!';
    last = performance.now(); if (raf) cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
  }

  function endMatch() {
    if (raf) cancelAnimationFrame(raf);
    if (app.scores.red === app.scores.blue) return suddenDeath();
    finish();
  }

  function finish() {
    const winner = app.scores.red > app.scores.blue ? 'red' : 'blue';
    showVerdict(winner, (choice) => { if (choice === 'rematch') start(); else showScreen('lobby'); });
  }

  function start() {
    app.scores = { red: 0, blue: 0 };
    updateScoreBar(); setHint();
    showScreen('game');
    round = 0; sudden = false;
    nextRound();
  }

  function onKey(key) {
    if (key === 'a') stop('red');
    else if (key === 'l') stop('blue');
  }
  function onPhoneAction(action, side) { if (action === 'buzz' || action === 'stop') stop(side); }

  return { start, onKey, onPhoneAction };
}
