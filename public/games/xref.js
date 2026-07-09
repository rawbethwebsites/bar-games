function createXrefGame(app) {
  const MAX_Q = 5;
  const stage = document.getElementById('game-stage');
  let bank = [], cases = [], caseIdx = 0, qIdx = 0;
  let buzzedFirst = null, buzzCorrect = null, timer = null, waiting = false;

  async function load() {
    const res = await fetch('games/xref.json');
    bank = await res.json();
  }
  function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  function setHint() {
    const h = document.querySelector('.controls-hint');
    if (h) h.innerHTML = '<span><b>LEFT:</b> A=Supported D=Contradicted S=Not Mentioned</span><span><b>RIGHT:</b> J=Supported L=Contradicted K=Not Mentioned</span>';
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
          <div class="case-file-read-time" id="read-time">Read the document...</div>
        </div>
      </div>
    `;
    let readTime = 45;
    const fill = document.getElementById('story-timer-fill');
    const readTimeEl = document.getElementById('read-time');
    timer = setInterval(() => {
      readTime -= 1;
      if (fill) fill.style.width = Math.max(0, readTime / 45 * 100) + '%';
      if (readTimeEl) readTimeEl.textContent = readTime > 0 ? `${readTime}s to read...` : 'Questions starting...';
      if (readTime <= 0) {
        clearInterval(timer);
        startQuestions();
      }
    }, 1000);
  }

  function startQuestions() {
    qIdx = 0;
    showQuestion();
  }

  function showQuestion() {
    const c = cases[caseIdx];
    if (qIdx >= c.questions.length || qIdx >= MAX_Q) {
      caseIdx++;
      if (caseIdx >= cases.length) {
        const winner = app.scores.red > app.scores.blue ? 'red' : (app.scores.blue > app.scores.red ? 'blue' : 'draw');
        return showVerdict(winner, (choice) => { if (choice === 'rematch') start(); else showScreen('lobby'); });
      }
      qIdx = 0;
      return showStory();
    }

    const q = c.questions[qIdx];
    buzzedFirst = null; buzzCorrect = null; waiting = false;

    stage.innerHTML = `
      <div class="case-card">
        <div class="round-label">DOCUMENT ${caseIdx + 1} · QUESTION ${qIdx + 1}</div>
        <div class="timer-bar"><div class="fill" id="timer-fill"></div></div>
        <p style="font-size:1.4rem;line-height:1.5;margin-bottom:1.5rem;">${q.q}</p>
      </div>
      <div class="split-cols">
        <div class="split-col red" id="col-red">
          <div class="tag">🔴 Prosecution</div>
          <div class="choices">
            <button class="choice-btn choice-real" data-side="red" data-ans="supported">A. SUPPORTED</button>
            <button class="choice-btn choice-fake" data-side="red" data-ans="contradicted">D. CONTRADICTED</button>
            <button class="choice-btn" data-side="red" data-ans="notmentioned" style="background:var(--neon-gold);color:#000;">S. NOT MENTIONED</button>
          </div>
          <div class="col-status" id="stat-red"></div>
        </div>
        <div class="split-col blue" id="col-blue">
          <div class="tag">🔵 Defence</div>
          <div class="choices">
            <button class="choice-btn choice-real" data-side="blue" data-ans="supported">J. SUPPORTED</button>
            <button class="choice-btn choice-fake" data-side="blue" data-ans="contradicted">L. CONTRADICTED</button>
            <button class="choice-btn" data-side="blue" data-ans="notmentioned" style="background:var(--neon-gold);color:#000;">K. NOT MENTIONED</button>
          </div>
          <div class="col-status" id="stat-blue"></div>
        </div>
      </div>
    `;

    stage.querySelectorAll('.choice-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const side = btn.dataset.side;
        const ans = btn.dataset.ans;
        buzzIn(side, ans);
      });
    });

    startTimer(10);
  }

  function startTimer(seconds) {
    let timeLeft = seconds;
    const fill = document.getElementById('timer-fill');
    timer = setInterval(() => {
      timeLeft -= 0.1;
      if (fill) fill.style.width = Math.max(0, timeLeft / seconds * 100) + '%';
      if (timeLeft <= 0) {
        clearInterval(timer);
        reveal(null, null);
      }
    }, 100);
  }

  // Buzz-in mode: first to buzz answers, if wrong the other gets a chance
  function buzzIn(side, ans) {
    if (waiting) return;
    if (buzzedFirst && buzzedFirst !== side) return; // only one side can buzz

    const c = cases[caseIdx];
    const q = c.questions[qIdx];
    const correct = q.answer;

    if (!buzzedFirst) {
      buzzedFirst = side;
      if (ans === correct) {
        // Correct — score and move on
        app.scores[side] += 2;
        if (typeof saveScores === 'function') saveScores();
        updateScoreBar();
        reveal(side, ans);
      } else {
        // Wrong — lock out this side, give other side a chance
        const stat = document.getElementById('stat-' + side);
        if (stat) stat.innerHTML = `<span style="color:var(--neon-red);">✗ Wrong! Other side gets a chance...</span>`;
        // Disable this side's buttons
        const col = document.querySelector(`.split-col.${side}`);
        col.querySelectorAll('.choice-btn').forEach(b => b.classList.add('locked'));
        // Other side can now buzz
        const otherSide = side === 'red' ? 'blue' : 'red';
        const otherStat = document.getElementById('stat-' + otherSide);
        if (otherStat) otherStat.innerHTML = `<span style="color:var(--neon-gold);">Your turn!</span>`;
        // If timer runs out, reveal
      }
    } else if (buzzedFirst === side) {
      // This is the second side's chance (they are now the active side)
      if (ans === correct) {
        app.scores[side] += 1;
        if (typeof saveScores === 'function') saveScores();
        updateScoreBar();
        reveal(side, ans);
      } else {
        // Both wrong — reveal
        reveal(side, ans);
      }
    }
  }

  function reveal(buzzSide, buzzAns) {
    if (waiting) return;
    waiting = true;
    clearInterval(timer);

    const c = cases[caseIdx];
    const q = c.questions[qIdx];
    const correct = q.answer;

    // Highlight correct answer
    stage.querySelectorAll('.choice-btn').forEach(btn => {
      if (btn.dataset.ans === correct) btn.classList.add('correct');
      else if (btn.dataset.side === buzzSide && btn.dataset.ans === buzzAns) btn.classList.add('locked');
    });

    const statR = document.getElementById('stat-red');
    const statB = document.getElementById('stat-blue');
    if (statR) statR.innerHTML = buzzedFirst === 'red' ? (buzzAns === correct ? '<span style="color:var(--neon-green);">✓ Correct (+2)</span>' : '<span style="color:var(--neon-red);">✗ Wrong</span>') : '';
    if (statB) statB.innerHTML = buzzedFirst === 'blue' ? (buzzAns === correct ? '<span style="color:var(--neon-green);">✓ Correct (+2)</span>' : '<span style="color:var(--neon-red);">✗ Wrong</span>') : '';

    setTimeout(() => {
      stage.innerHTML += `<div class="explanation-box"><b>Answer:</b> ${correct.toUpperCase()} — ${q.explain}</div>`;
    }, 500);

    setTimeout(() => {
      qIdx++;
      showQuestion();
    }, 4500);
  }

  async function start() {
    if (!bank.length) await load();
    cases = shuffle(bank).slice(0, 2); // 2 documents per game
    caseIdx = 0; qIdx = 0;
    app.scores = { red: 0, blue: 0 };
    updateScoreBar(); setHint(); showScreen('game');
    showStory();
  }

  const KEY_MAP_RED = { a: 'supported', d: 'contradicted', s: 'notmentioned' };
  const KEY_MAP_BLUE = { j: 'supported', l: 'contradicted', k: 'notmentioned' };

  function onKey(key) {
    if (waiting) return;
    if (key in KEY_MAP_RED) buzzIn('red', KEY_MAP_RED[key]);
    else if (key in KEY_MAP_BLUE) buzzIn('blue', KEY_MAP_BLUE[key]);
  }

  function onPhoneAction(action, side) {
    if (waiting) return;
    const map = { a: 'supported', b: 'contradicted', c: 'notmentioned' };
    if (action in map) buzzIn(side, map[action]);
  }

  function cleanup() { if (timer) clearInterval(timer); }

  return { start, onKey, onPhoneAction, cleanup };
}