// ═══════════════════════════════════════════════════════════════
//  BAR GAMES — Sound Engine (Web Audio API, no files needed)
//  Dopamine hits for every game event
// ═══════════════════════════════════════════════════════════════
(function () {
  let ctx = null;
  let muted = false;

  function ac() {
    if (!ctx) {
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) { return null; }
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // ── Core tone player ──────────────────────────────────────
  function tone(freq, dur, type, vol, when) {
    const a = ac(); if (!a || muted) return;
    const t = when || a.currentTime;
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol || 0.15, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain); gain.connect(a.destination);
    osc.start(t); osc.stop(t + dur + 0.05);
  }

  // ── Sweep (frequency glide) ───────────────────────────────
  function sweep(f1, f2, dur, type, vol, when) {
    const a = ac(); if (!a || muted) return;
    const t = when || a.currentTime;
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.type = type || 'sawtooth';
    osc.frequency.setValueAtTime(f1, t);
    osc.frequency.exponentialRampToValueAtTime(f2, t + dur);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol || 0.12, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain); gain.connect(a.destination);
    osc.start(t); osc.stop(t + dur + 0.05);
  }

  // ── Noise burst (for percussive hits) ─────────────────────
  function noise(dur, vol, when) {
    const a = ac(); if (!a || muted) return;
    const t = when || a.currentTime;
    const buf = a.createBuffer(1, a.sampleRate * dur, a.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2);
    const src = a.createBufferSource();
    src.buffer = buf;
    const gain = a.createGain();
    gain.gain.setValueAtTime(vol || 0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(gain); gain.connect(a.destination);
    src.start(t);
  }

  // ═══════════════════════════════════════════════════════════
  //  SOUND PRESETS — each is a dopamine hit
  // ═══════════════════════════════════════════════════════════

  const SFX = {
    // Correct answer — bright ascending arpeggio
    correct() {
      const a = ac(); if (!a) return;
      const t = a.currentTime;
      tone(523, 0.12, 'sine', 0.12, t);       // C5
      tone(659, 0.12, 'sine', 0.12, t + 0.08); // E5
      tone(784, 0.18, 'sine', 0.14, t + 0.16); // G5
      tone(1047, 0.25, 'sine', 0.10, t + 0.24); // C6 sparkle
    },

    // Wrong answer — descending buzz
    wrong() {
      const a = ac(); if (!a) return;
      const t = a.currentTime;
      tone(220, 0.15, 'sawtooth', 0.10, t);
      tone(180, 0.20, 'sawtooth', 0.10, t + 0.12);
      tone(140, 0.30, 'sawtooth', 0.08, t + 0.24);
    },

    // Buzz in — sharp stinger
    buzz() {
      const a = ac(); if (!a) return;
      const t = a.currentTime;
      sweep(800, 1200, 0.08, 'square', 0.10, t);
      noise(0.05, 0.06, t);
    },

    // Countdown tick — short blip
    tick() {
      tone(880, 0.06, 'square', 0.08);
    },

    // Countdown GO — rising sweep
    go() {
      const a = ac(); if (!a) return;
      const t = a.currentTime;
      sweep(400, 1600, 0.25, 'sawtooth', 0.12, t);
      tone(1600, 0.15, 'square', 0.08, t + 0.25);
    },

    // Score point — coin ping
    point() {
      const a = ac(); if (!a) return;
      const t = a.currentTime;
      tone(988, 0.08, 'square', 0.10, t);  // B5
      tone(1319, 0.15, 'square', 0.08, t + 0.06); // E6
    },

    // Gavel hit — thud + clack
    gavel() {
      const a = ac(); if (!a) return;
      const t = a.currentTime;
      noise(0.08, 0.15, t);
      tone(120, 0.15, 'sine', 0.12, t);
      tone(80, 0.20, 'sine', 0.10, t + 0.05);
    },

    // Verdict — dramatic fanfare
    verdict() {
      const a = ac(); if (!a) return;
      const t = a.currentTime;
      // Dramatic pause then fanfare
      tone(196, 0.30, 'sawtooth', 0.08, t);      // G3 drone
      tone(196, 0.30, 'sawtooth', 0.08, t + 0.15);
      tone(196, 0.40, 'sawtooth', 0.10, t + 0.30);
      // Fanfare
      tone(523, 0.15, 'square', 0.10, t + 0.50); // C5
      tone(659, 0.15, 'square', 0.10, t + 0.62); // E5
      tone(784, 0.15, 'square', 0.10, t + 0.74); // G5
      tone(1047, 0.40, 'square', 0.12, t + 0.86); // C6 — triumph!
      // Sparkle
      tone(1568, 0.30, 'sine', 0.06, t + 0.90);  // G6
    },

    // Win — big celebration
    win() {
      const a = ac(); if (!a) return;
      const t = a.currentTime;
      tone(523, 0.12, 'square', 0.10, t);
      tone(659, 0.12, 'square', 0.10, t + 0.10);
      tone(784, 0.12, 'square', 0.10, t + 0.20);
      tone(1047, 0.12, 'square', 0.10, t + 0.30);
      tone(1319, 0.30, 'square', 0.12, t + 0.40);
      tone(1568, 0.40, 'sine', 0.08, t + 0.50);
    },

    // Click — UI tap
    click() {
      tone(1200, 0.03, 'square', 0.05);
    },

    // Whoosh — screen transition
    whoosh() {
      sweep(200, 600, 0.15, 'sine', 0.06);
    },

    // Lock in — confirmation chime
    lock() {
      const a = ac(); if (!a) return;
      const t = a.currentTime;
      tone(659, 0.08, 'sine', 0.10, t);
      tone(988, 0.12, 'sine', 0.08, t + 0.06);
    },

    // Timer warning — urgent beep in last 3 seconds
    warn() {
      tone(440, 0.08, 'square', 0.06);
    },

    // Toggle mute
    toggleMute() { muted = !muted; return muted; },
    isMuted() { return muted; },
  };

  window.SFX = SFX;
})();