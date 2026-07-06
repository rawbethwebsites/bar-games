function createGuiltyGame(app) {
  let cases = [];
  let round = 0;
  const maxRounds = 7;
  let locked = { red: false, blue: false };
  let answers = { red: null, blue: null };
  let timer = null;
  let timeLeft = 0;
  let currentCase = null;
  let waitingReveal = false;

  const stage = document.getElementById('game-stage');

  async function loadCases() {
    const res = await fetch('games/guilty.json');
    const data = await res.json();
    cases = shuffle([...data]);
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function renderChoices() {
    stage.innerHTML = `
      <div class="case-card">
        <div class="round-label">ROUND ${round + 1} / ${maxRounds}</div>
        <div class="timer-bar"><div class="fill" id="timer-fill"></div></div>
        <p style="font-size:1.6rem;line-height:1.5;">${currentCase.text}</p>
      </div>
      <div class="choices">
        <button class="choice-btn choice-fake" data-side="red">FAKE</button>
        <button class="choice-btn choice-real" data-side="red">REAL</button>
      </div>
      <div class="choices">
        <button class="choice-btn choice-fake" data-side="blue">FAKE</button>
        <button class="choice-btn choice-real" data-side="blue">REAL</button>
      </div>
    `;

    stage.querySelectorAll('.choice-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const side = btn.dataset.side;
        const isReal = btn.classList.contains('choice-real');
        lockIn(side, isReal);
      });
    });

    startTimer(8);
  }

  function startTimer(seconds) {
    timeLeft = seconds;
    const fill = document.getElementById('timer-fill');
    timer = setInterval(() => {
      timeLeft -= 0.1;
      const pct = Math.max(0, timeLeft / seconds) * 100;
      if (fill) fill.style.width = `${pct}%`;
      if (timeLeft <= 0) {
        clearInterval(timer);
        if (!locked.red) lockIn('red', null);
        if (!locked.blue) lockIn('blue', null);
        reveal();
      }
    }, 100);
  }

  function lockIn(side, answer) {
    if (locked[side]) return;
    locked[side] = true;
    answers[side] = answer;

    const sideIndex = side === 'red' ? 0 : 1;
    const row = stage.querySelectorAll('.choices')[sideIndex];
    row.querySelectorAll('button').forEach(btn => {
      const isReal = btn.classList.contains('choice-real');
      const isSelected = (answer === true && isReal) || (answer === false && !isReal);
      if (!isSelected) btn.classList.add('locked');
    });

    if (locked.red && locked.blue) {
      clearInterval(timer);
      setTimeout(reveal, 400);
    }
  }

  function reveal() {
    if (waitingReveal) return;
    waitingReveal = true;

    const isReal = currentCase.isReal;
    const stampClass = isReal ? 'real' : 'fake';
    const stampText = isReal ? 'REAL' : 'FAKE';

    const card = stage.querySelector('.case-card');
    if (card) {
      const stamp = document.createElement('div');
      stamp.className = `reveal-stamp ${stampClass}`;
      stamp.textContent = stampText;
      card.appendChild(stamp);

      const verdict = document.createElement('div');
      verdict.className = 'verdict';
      verdict.textContent = currentCase.verdict;
      card.appendChild(verdict);
    }

    let redPoints = 0;
    let bluePoints = 0;

    if (answers.red !== null && answers.red === isReal) redPoints += 2;
    if (answers.blue !== null && answers.blue === isReal) bluePoints += 2;

    if (redPoints && !bluePoints) redPoints += 1;
    if (bluePoints && !redPoints) bluePoints += 1;

    app.scores.red += redPoints;
    app.scores.blue += bluePoints;
    updateScoreBar();

    setTimeout(nextOrEnd, 3500);
  }

  function nextOrEnd() {
    round++;
    if (round >= maxRounds) {
      const winner = app.scores.red > app.scores.blue ? 'red' : app.scores.blue > app.scores.red ? 'blue' : 'draw';
      showVerdict(winner, (choice) => {
        if (choice === 'rematch') {
          start();
        } else {
          showScreen('lobby');
        }
      });
    } else {
      startRound();
    }
  }

  async function startRound() {
    locked = { red: false, blue: false };
    answers = { red: null, blue: null };
    waitingReveal = false;
    currentCase = cases[round];

    stage.innerHTML = `
      <div class="countdown"></div>
      <div style="margin-top:1.5rem;font-family:Orbitron,sans-serif;color:var(--muted);letter-spacing:0.1em;">ROUND ${round + 1} / ${maxRounds}</div>
    `;

    showCountdown(stage.firstElementChild, () => {
      renderChoices();
    });
  }

  async function start() {
    await loadCases();
    round = 0;
    app.scores = { red: 0, blue: 0 };
    updateScoreBar();
    showScreen('game');
    startRound();
  }

  function onKey(key) {
    if (!currentCase || waitingReveal) return;

    if (key === 'a') lockIn('red', false);
    if (key === 'd') lockIn('red', true);
    if (key === 'j') lockIn('blue', false);
    if (key === 'l') lockIn('blue', true);
  }

  function onPhoneAction(action, side) {
    if (!currentCase || waitingReveal) return;
    if (action === 'real') lockIn(side, true);
    if (action === 'fake') lockIn(side, false);
  }

  return { start, onKey, onPhoneAction };
}
