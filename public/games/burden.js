function createBurdenGame(app) {
  const MAX_Q = 4, QTIME = 15;
  const stage = document.getElementById('game-stage');
  let bank = [], cases = [], caseIdx = 0, qIdx = 0;
  let locked = { red: false, blue: false };
  let answers = { red: null, blue: null };
  let timer = null, timeLeft = 0, curQ = null, waitingReveal = false;

  async function load() {
    const res = await fetch('games/burden.json');
    bank = await res.json();
  }
  function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  function setHint() {
    const h = document.querySelector('.controls-hint');
    if (h) h.innerHTML = '<span><b>LEFT:</b> Q=1 W=2 A=3 S=4</span><span><b>RIGHT:</b> U=1 I=2 J=3 K=4</span>';
  }

  // Phase 1: Show the story for reading
  function showStory() {
    const c = cases[caseIdx];
    stage.innerHTML = `
      <div class="case-file">
        <div class="case-file-header">
          <span class="case-file-emoji">${c.emoji}</span>
          <h2 class="case-file-title">${c.title}</h2>
        </div>
        <div class="case-file-body">${c.story}</div>
        <div class="case-file-timer">
          <div class="timer-bar"><div class="fill" id="story-timer-fill" style="width:100%"></div></div>
          <div class="case-file-read-time" id="read-time">Read the case file...</div>
        </div>
      </div>
    `;
    // Reading timer: 60 seconds
    let readTime = 60;
    const fill = document.getElementById('story-timer-fill');
    const readTimeEl = document.getElementById('read-time');
    timer = setInterval(() => {
      readTime -= 1;
      if (fill) fill.style.width = Math.max(0, readTime / 60 * 100) + '%';
      if (readTimeEl) readTimeEl.textContent = readTime > 0 ? `${readTime}s to read...` : 'Questions starting...';
      if (readTime <= 0) {
        clearInterval(timer);
        startQuestions();
      }
    }, 1000);
  }

  // Phase 2: Questions about the story
  function startQuestions() {
    qIdx = 0;
    showQuestion();
  }

  function showQuestion() {
    const c = cases[caseIdx];
    if (qIdx >= c.questions.length) {
      // Case complete — move to next case or end
      caseIdx++;
      if (caseIdx >= cases.length) {
        const winner = app.scores.red > app.scores.blue ? 'red' : (app.scores.blue > app.scores.red ? 'blue' : 'draw');
        return showVerdict(winner, (choice) => { if (choice === 'rematch') start(); else showScreen('lobby'); });
      }
      qIdx = 0;
      return showStory();
    }

    curQ = c.questions[qIdx];
    locked = { red: false, blue: false };
    answers = { red: null, blue: null };
    waitingReveal = false;

    stage.innerHTML = `
      <div class="case-card">
        <div class="round-label">CASE ${caseIdx + 1} · QUESTION ${qIdx + 1} / ${c.questions.length}</div>
        <div class="timer-bar"><div class="fill" id="timer-fill"></div></div>
        <p style="font-size:1.3rem;line-height:1.5;margin-bottom:1.5rem;">${curQ.q}</p>
      </div>
      <div class="split-cols">
        <div class="split-col red" id="col-red">
          <div class="tag">🔴 Prosecution — Q W A S</div>
          <div class="choices">
            ${curQ.options.map((opt, i) => `<button class="choice-btn ${i === curQ.answer ? 'choice-real' : 'choice-fake'}" data-side="red" data-idx="${i}">${String.fromCharCode(65 + i)}. ${opt}</button>`).join('')}
          </div>
          <div class="col-status" id="stat-red"></div>
        </div>
        <div class="split-col blue" id="col-blue">
          <div class="tag">🔵 Defence — U I J K</div>
          <div class="choices">
            ${curQ.options.map((opt, i) => `<button class="choice-btn ${i === curQ.answer ? 'choice-real' : 'choice-fake'}" data-side="blue" data-idx="${i}">${String.fromCharCode(65 + i)}. ${opt}</button>`).join('')}
          </div>
          <div class="col-status" id="stat-blue"></div>
        </div>
      </div>
    `;

    stage.querySelectorAll('.choice-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const side = btn.dataset.side;
        const idx = parseInt(btn.dataset.idx);
        lockIn(side, idx);
      });
    });

    startTimer(QTIME);
  }

  function startTimer(seconds) {
    timeLeft = seconds;
    const fill = document.getElementById('timer-fill');
    timer = setInterval(() => {
      timeLeft -= 0.1;
      if (fill) fill.style.width = Math.max(0, timeLeft / seconds * 100) + '%';
      if (timeLeft <= 0) {
        clearInterval(timer);
        if (!locked.red) lockIn('red', null);
        if (!locked.blue) lockIn('blue', null);
        reveal();
      }
    }, 100);
  }

  function lockIn(side, idx) {
    if (locked[side]) return;
    locked[side] = true;
    answers[side] = idx;

    const col = document.querySelector(`.split-col.${side}`);
    col.querySelectorAll('.choice-btn').forEach((btn, i) => {
      if (i === idx) btn.classList.add('selected');
      else btn.classList.add('locked');
    });

    if (locked.red && locked.blue) {
      clearInterval(timer);
      reveal();
    }
  }

  function reveal() {
    if (waitingReveal) return;
    waitingReveal = true;
    clearInterval(timer);

    const correct = curQ.answer;
    let rp = 0, bp = 0;
    if (answers.red === correct) rp = 1;
    if (answers.blue === correct) bp = 1;
    app.scores.red += rp; app.scores.blue += bp;
    if (typeof saveScores === 'function') saveScores();
    updateScoreBar();

    // Show correct answer highlighted, wrong ones dimmed
    stage.querySelectorAll('.choice-btn').forEach(btn => {
      const idx = parseInt(btn.dataset.idx);
      if (idx === correct) { btn.classList.add('correct'); }
      else { btn.classList.add('locked'); }
    });

    // Show explanation
    const statR = document.getElementById('stat-red');
    const statB = document.getElementById('stat-blue');
    if (statR) statR.innerHTML = `<span style="color:${rp ? 'var(--neon-green)' : 'var(--neon-red)'};">${rp ? '✓ Correct' : '✗ Wrong'}</span>`;
    if (statB) statB.innerHTML = `<span style="color:${bp ? 'var(--neon-green)' : 'var(--neon-red)'};">${bp ? '✓ Correct' : '✗ Wrong'}</span>`;

    // Show explanation text
    setTimeout(() => {
      const c = cases[caseIdx];
      stage.innerHTML += `<div class="explanation-box"><b>Why:</b> ${curQ.explain}</div>`;
    }, 500);

    setTimeout(() => {
      qIdx++;
      showQuestion();
    }, 4000);
  }

  async function start() {
    if (!bank.length) await load();
    cases = shuffle(bank).slice(0, 3); // 3 cases per game
    caseIdx = 0; qIdx = 0;
    app.scores = { red: 0, blue: 0 };
    updateScoreBar(); setHint(); showScreen('game');
    showStory();
  }

  function onKey(key) {
    if (waitingReveal || !curQ) return;
    const LKEYS = { q: 0, w: 1, a: 2, s: 3 };
    const RKEYS = { u: 0, i: 1, j: 2, k: 3 };
    if (key in LKEYS) lockIn('red', LKEYS[key]);
    else if (key in RKEYS) lockIn('blue', RKEYS[key]);
  }

  function onPhoneAction(action, side) {
    if (waitingReveal || !curQ) return;
    const map = { a: 0, b: 1, c: 2, d: 3 };
    if (action in map) lockIn(side, map[action]);
  }

  function cleanup() { if (timer) clearInterval(timer); }

  return { start, onKey, onPhoneAction, cleanup };
}