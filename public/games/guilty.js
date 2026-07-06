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
        <div class="timer-ring" style="clip-path:none"></div>
        <p>${currentCase.text}</p>
      </div>
      <div class="choices">
        <button class="choice-btn choice-real" data-side="red" disabled>Real Lawsuit</button>
        <button class="choice-btn choice-fake" data-side="red" disabled>Fake Lawsuit</button>
      </div>
      <div class="choices">
        <button class="choice-btn choice-real" data-side="blue" disabled>Real Lawsuit</button>
        <button class="choice-btn choice-fake" data-side="blue" disabled>Fake Lawsuit</button>
      </div>
    `;
    startTimer(8);
  }

  function startTimer(seconds) {
    timeLeft = seconds;
    const ring = stage.querySelector('.timer-ring');
    timer = setInterval(() => {
      timeLeft -= 0.1;
      const pct = Math.max(0, timeLeft / seconds);
      if (ring) ring.style.opacity = 0.3 + pct * 0.7;
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
      btn.disabled = true;
      if (btn.classList.contains(answer ? 'choice-real' : 'choice-fake')) {
        btn.style.opacity = '1';
      } else {
        btn.style.opacity = '0.3';
      }
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
    const stampText = isReal ? 'Real Lawsuit' : 'Fake Lawsuit';

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

    setTimeout(nextOrEnd, 3000);
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
      <div style="margin-top:1rem;color:var(--muted)">Round ${round + 1} of ${maxRounds}</div>
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

    // Left player: A = real, D = fake
    if (key === 'a') lockIn('red', true);
    if (key === 'd') lockIn('red', false);

    // Right player: J = real, L = fake
    if (key === 'j') lockIn('blue', true);
    if (key === 'l') lockIn('blue', false);
  }

  function onPhoneAction(action, side) {
    if (!currentCase || waitingReveal) return;
    if (action === 'real') lockIn(side, true);
    if (action === 'fake') lockIn(side, false);
  }

  return { start, onKey, onPhoneAction };
}
