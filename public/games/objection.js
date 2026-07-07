function createObjectionGame(app) {
  const WIN_AT = 3;
  const FLAVOURS = [
    'The witness shifts nervously…', 'Counsel rises slowly…', 'A hush falls over the gallery…',
    'The stenographer pauses…', 'The judge narrows their eyes…', 'The clerk clears their throat…',
    'Papers rustle at the bench…', 'Someone’s phone almost rings…'
  ];
  const stage = document.getElementById('game-stage');

  let point = 0;
  let state = 'idle';          // idle | wait | sustain | go | resolved
  let t1 = null, t2 = null, goAt = 0;

  function clearTimers() { clearTimeout(t1); clearTimeout(t2); }
  function setArena(cls) { const a = document.getElementById('obj-arena'); if (a) a.className = 'obj-arena ' + cls; }
  function setHint() {
    const h = document.querySelector('.controls-hint');
    if (h) h.innerHTML = '<span><b>LEFT:</b> A = BUZZ</span><span><b>RIGHT:</b> L = BUZZ</span>';
  }

  function render() {
    stage.innerHTML = `
      <div class="obj-arena wait" id="obj-arena">
        <div class="obj-half left" id="obj-L">🔴 tap to buzz</div>
        <div class="obj-half right" id="obj-R">tap to buzz 🔵</div>
        <div class="obj-signal">
          <div class="obj-big" id="obj-big">GET READY…</div>
          <div class="obj-sub" id="obj-sub">Watch for the red flash.</div>
        </div>
      </div>`;
    document.getElementById('obj-L').addEventListener('pointerdown', (e) => { e.preventDefault(); buzz('red'); });
    document.getElementById('obj-R').addEventListener('pointerdown', (e) => { e.preventDefault(); buzz('blue'); });
  }

  function nextPoint() {
    point++;
    render();
    state = 'wait'; setArena('wait');
    document.getElementById('obj-big').textContent = 'GET READY…';
    document.getElementById('obj-sub').textContent = FLAVOURS[Math.floor(Math.random() * FLAVOURS.length)];
    const doFake = Math.random() < 0.28;
    t1 = setTimeout(() => (doFake ? showSustain() : showGo()), 1000 + Math.random() * 3000);
  }

  function showSustain() {
    state = 'sustain'; setArena('sustain');
    setBig('SUSTAINED'); setSub('Do NOT press!');
    t2 = setTimeout(() => {
      if (state !== 'sustain') return;
      state = 'wait'; setArena('wait'); setBig('steady…'); setSub('');
      t1 = setTimeout(showGo, 700 + Math.random() * 2200);
    }, 850);
  }

  function showGo() {
    state = 'go'; setArena('go'); goAt = performance.now();
    setBig('OBJECTION!'); setSub('BUZZ NOW');
    if (window.SFX) SFX.buzz();
  }

  function setBig(t, cls) { const el = document.getElementById('obj-big'); if (el) { el.className = 'obj-big' + (cls ? ' ' + cls : ''); el.textContent = t; } }
  function setSub(t) { const el = document.getElementById('obj-sub'); if (el) el.textContent = t; }

  function buzz(side) {
    if (state === 'idle' || state === 'resolved') return;
    const other = side === 'red' ? 'blue' : 'red';
    if (window.SFX) SFX.buzz();
    if (state === 'wait') return award(other, sideName(side) + ' jumped the gun — false start!');
    if (state === 'sustain') return award(other, sideName(side) + ' pressed on SUSTAINED!');
    if (state === 'go') {
      const half = document.getElementById(side === 'red' ? 'obj-L' : 'obj-R');
      if (half) half.classList.add('buzzed', side);
      const ms = Math.round(performance.now() - goAt);
      return award(side, sideName(side) + ' buzzed in ' + ms + ' ms!');
    }
  }

  function sideName(side) { return side === 'red' ? '🔴 Prosecution' : '🔵 Defence'; }

  function award(side, msg) {
    clearTimers(); state = 'resolved';
    const half = document.getElementById(side === 'red' ? 'obj-L' : 'obj-R');
    if (half) half.classList.add('buzzed', side);
    if (side === 'red') app.scores.red++; else app.scores.blue++;
    if (typeof saveScores === 'function') saveScores();
    updateScoreBar();
    setArena('wait');
    setBig(side === 'red' ? 'POINT · PROSECUTION' : 'POINT · DEFENCE', side);
    setSub(msg);
    if (app.scores.red >= WIN_AT || app.scores.blue >= WIN_AT) setTimeout(endMatch, 1700);
    else setTimeout(nextPoint, 1900);
  }

  function endMatch() {
    const winner = app.scores.red > app.scores.blue ? 'red' : (app.scores.blue > app.scores.red ? 'blue' : 'draw');
    showVerdict(winner, (choice) => { if (choice === 'rematch') start(); else showScreen('lobby'); });
  }

  function start() {
    app.scores = { red: 0, blue: 0 };
    updateScoreBar();
    setHint();
    showScreen('game');
    point = 0;
    nextPoint();
  }

  function onKey(key) {
    if (key === 'a' || key === 'arrowleft') buzz('red');
    else if (key === 'l' || key === 'arrowright' || key === '6') buzz('blue');
  }
  function onPhoneAction(action, side) { if (action === 'buzz') buzz(side); }

  return { start, onKey, onPhoneAction };
}
