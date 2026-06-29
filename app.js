(function () {
  const { Renderer, Stave, StaveNote, Voice, Formatter } = Vex.Flow;
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const TIMER_SECONDS = 5;
  const SESSION_LENGTH = 10;
  const ROUND_DELAY = 1500;

  const APP_VERSION = '1.0.0';
  const APP_VERSION_DATE = '2026-06-29';

  const TREBLE_LINE_MAP_BASIC = {
    'f/5': 0, 'e/5': 0.5, 'd/5': 1, 'c/5': 1.5, 'b/4': 2,
    'a/4': 2.5, 'g/4': 3, 'f/4': 3.5, 'e/4': 4,
  };
  const TREBLE_LINE_MAP_GRADE1 = {
    ...TREBLE_LINE_MAP_BASIC,
    'g/5': -0.5, 'a/5': -1, 'b/5': -1.5, 'c/6': -2, 'd/6': -2.5, 'e/6': -3, 'f/6': -3.5,
    'd/4': 4.5, 'c/4': 5,
  };
  const BASS_LINE_MAP_BASIC = {
    'a/3': 0, 'g/3': 0.5, 'f/3': 1, 'e/3': 1.5, 'd/3': 2,
    'c/3': 2.5, 'b/2': 3, 'a/2': 3.5, 'g/2': 4,
  };
  const BASS_LINE_MAP_GRADE1 = {
    ...BASS_LINE_MAP_BASIC,
    'b/3': -0.5, 'c/4': -1,
  };

  const GRADES = ['basic', 'grade1'];

  function lineMapFor(clefName, grade) {
    if (clefName === 'treble') return grade === 'grade1' ? TREBLE_LINE_MAP_GRADE1 : TREBLE_LINE_MAP_BASIC;
    return grade === 'grade1' ? BASS_LINE_MAP_GRADE1 : BASS_LINE_MAP_BASIC;
  }

  const WHITE_KEYS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const BLACK_KEY_AFTER = [0, 1, 3, 4, 5];

  const staffEl = document.getElementById('staff');
  const timerFillEl = document.getElementById('timerFill');
  const timerNumEl = document.getElementById('timerNum');
  const feedbackEl = document.getElementById('feedback');
  const answersEl = document.getElementById('answers');
  const startBtn = document.getElementById('startBtn');
  const pauseBtn = document.getElementById('pauseBtn');
  const settingsBtn = document.getElementById('settingsBtn');
  const versionInfoEl = document.getElementById('versionInfo');
  const settingsOverlayEl = document.getElementById('settingsOverlay');
  const closeSettingsBtn = document.getElementById('closeSettingsBtn');
  const soundToggleBtn = document.getElementById('soundToggleBtn');
  const resetStatsBtn = document.getElementById('resetStatsBtn');
  const sessionsStatEl = document.getElementById('sessionsStat');
  const accStatEl = document.getElementById('accStat');
  const pausedOverlayEl = document.getElementById('pausedOverlay');
  const modeBtns = document.querySelectorAll('#modeRow .modeBtn');
  const gradeBtns = document.querySelectorAll('#gradeRow .modeBtn');
  const questionCounterEl = document.getElementById('questionCounter');
  const summaryOverlayEl = document.getElementById('summaryOverlay');
  const summaryScoreEl = document.getElementById('summaryScore');
  const summaryAccuracyEl = document.getElementById('summaryAccuracy');
  const summarySpeedEl = document.getElementById('summarySpeed');
  const summaryImprovementEl = document.getElementById('summaryImprovement');
  const playAgainBtn = document.getElementById('playAgainBtn');
  const homeBtn = document.getElementById('homeBtn');

  const STORAGE_KEY = 'noteTrainerStats';
  const PREV_SESSION_KEY = 'noteTrainerPrevSession';
  const SOUND_KEY = 'noteTrainerSoundOn';

  const MODES = ['treble', 'bass', 'mix'];

  let stats = loadStats();
  let clefMode = 'treble';
  let clef = 'treble';
  let gradeMode = 'basic';
  let currentKey = null;
  let currentLetter = null;
  let running = false;
  let paused = false;
  let timerStart = null;
  let pauseStartedAt = null;
  let timerDuration = TIMER_SECONDS;
  let rafId = null;
  let awaitingAnswer = false;
  let sessionIndex = 0;
  let sessionCorrect = 0;
  let sessionTimes = [];
  let sessionId = 0;
  let nextRoundTimeoutId = null;
  let soundOn = localStorage.getItem(SOUND_KEY) !== 'off';
  let audioCtx = null;

  function emptyModeStats() {
    return { correct: 0, total: 0, sessions: 0 };
  }

  function formatCount(n) {
    return new Intl.NumberFormat('en', { notation: 'compact' }).format(n);
  }

  function loadStats() {
    let parsed = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) parsed = JSON.parse(raw);
    } catch (e) {}
    const result = {};
    MODES.forEach((mode) => {
      result[mode] = Object.assign(emptyModeStats(), parsed && parsed[mode]);
    });
    return result;
  }

  function saveStats() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
  }

  function renderStats() {
    const modeStats = stats[clefMode];
    sessionsStatEl.textContent = `Sessions: ${formatCount(modeStats.sessions)}`;
    const acc = modeStats.total === 0 ? 0 : Math.round((modeStats.correct / modeStats.total) * 100);
    accStatEl.textContent = `Accuracy: ${acc}%`;
  }

  const SEMITONES_FROM_C = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

  function frequencyForKey(key) {
    const [letter, octaveStr] = key.split('/');
    const octave = parseInt(octaveStr, 10);
    const semitonesFromA4 = (octave - 4) * 12 + SEMITONES_FROM_C[letter] - 9;
    return 440 * Math.pow(2, semitonesFromA4 / 12);
  }

  function playNoteSound(key) {
    if (!soundOn || !key) return;
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const freq = frequencyForKey(key);
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.3, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.5);
  }

  function buildKeyboard() {
    answersEl.innerHTML = '';
    const whiteWidthPct = 100 / WHITE_KEYS.length;

    WHITE_KEYS.forEach((letter) => {
      const key = document.createElement('button');
      key.className = 'whiteKey';
      key.textContent = letter;
      key.addEventListener('click', () => {
        playNoteSound(currentKey);
        handleAnswer(letter, key);
      });
      answersEl.appendChild(key);
    });

    BLACK_KEY_AFTER.forEach((i) => {
      const blackWidthPct = whiteWidthPct * 0.62;
      const leftPct = (i + 1) * whiteWidthPct - blackWidthPct / 2;
      const key = document.createElement('div');
      key.className = 'blackKey';
      key.style.left = leftPct + '%';
      key.style.width = blackWidthPct + '%';
      answersEl.appendChild(key);
    });
  }

  function pickClefMode(btn) {
    const newMode = btn.dataset.mode;
    if (newMode === clefMode) return;
    clefMode = newMode;
    modeBtns.forEach((b) => b.classList.toggle('active', b === btn));
    renderStats();
    if (running) {
      stopTimerLoop();
      start();
    } else {
      drawIdleStaff();
    }
  }

  modeBtns.forEach((btn) => {
    btn.addEventListener('click', () => pickClefMode(btn));
    if (btn.dataset.mode === clefMode) btn.classList.add('active');
  });

  function pickGradeMode(btn) {
    const newGrade = btn.dataset.grade;
    if (newGrade === gradeMode) return;
    gradeMode = newGrade;
    gradeBtns.forEach((b) => b.classList.toggle('active', b === btn));
    if (running) {
      stopTimerLoop();
      start();
    } else {
      drawIdleStaff();
    }
  }

  gradeBtns.forEach((btn) => {
    btn.addEventListener('click', () => pickGradeMode(btn));
    if (btn.dataset.grade === gradeMode) btn.classList.add('active');
  });

  function drawNote(key, clefName) {
    staffEl.innerHTML = '';
    const width = Math.min(staffEl.parentElement.clientWidth - 8, 420);
    const renderer = new Renderer(staffEl, Renderer.Backends.SVG);
    renderer.resize(width, 170);
    const context = renderer.getContext();
    const staveWidth = width - 20;
    const stave = new Stave(10, 25, staveWidth);
    stave.addClef(clefName);
    stave.setContext(context).draw();

    if (key) {
      const note = new StaveNote({
        keys: [key],
        duration: 'q',
        clef: clefName,
      });

      const voice = new Voice({ num_beats: 1, beat_value: 4 });
      voice.setStrict(false);
      voice.addTickables([note]);

      new Formatter().joinVoices([voice]).format([voice], staveWidth - 60);
      voice.draw(context, stave);
    }

    drawNoteLadder(context.svg, stave, clefName, staveWidth);
  }

  function drawNoteLadder(svg, stave, clefName, staveWidth) {
    const lineMap = lineMapFor(clefName, gradeMode);
    const lineEntries = Object.entries(lineMap)
      .filter(([, line]) => Number.isInteger(line))
      .sort((a, b) => b[1] - a[1]);
    const spaceEntries = Object.entries(lineMap)
      .filter(([, line]) => !Number.isInteger(line))
      .sort((a, b) => b[1] - a[1]);

    const regionStartX = stave.getX() + staveWidth * 0.46;
    const stepX = 20;

    drawLadderGroup(svg, lineEntries, stave, regionStartX, stepX, 0);
    drawLadderGroup(svg, spaceEntries, stave, regionStartX, stepX, stepX / 2);
  }

  function drawLadderGroup(svg, entries, stave, startX, stepX, xOffset) {
    entries.forEach(([key, line], i) => {
      const y = stave.getYForLine(line);
      const x = startX + xOffset + i * stepX;
      const letter = key[0].toUpperCase();
      const text = document.createElementNS(SVG_NS, 'text');
      text.setAttribute('x', x);
      text.setAttribute('y', y + 4);
      text.setAttribute('transform', `rotate(-22 ${x} ${y})`);
      text.setAttribute('font-size', '13');
      text.setAttribute('font-weight', '700');
      text.setAttribute('fill', '#7d8696');
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('data-key', key);
      text.textContent = letter;
      svg.appendChild(text);
    });
  }

  function highlightLadder(color) {
    const label = staffEl.querySelector(`text[data-key="${currentKey.replace('/', '\\/')}"]`);
    if (!label) return;
    const x = label.getAttribute('x');
    const y = label.getAttribute('y');

    const halo = document.createElementNS(SVG_NS, 'circle');
    halo.setAttribute('cx', x);
    halo.setAttribute('cy', parseFloat(y) - 4);
    halo.setAttribute('r', '17');
    halo.setAttribute('fill', color);
    halo.setAttribute('opacity', '0.22');
    label.parentNode.insertBefore(halo, label);

    label.removeAttribute('transform');
    label.setAttribute('fill', color);
    label.setAttribute('font-size', '34');
    label.setAttribute('stroke', '#14181f');
    label.setAttribute('stroke-width', '1.2');
    label.setAttribute('paint-order', 'stroke');
    label.parentNode.appendChild(label);
  }

  function letterFromKey(key) {
    return key[0].toUpperCase();
  }

  function shuffle(items) {
    const arr = items.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function nextFromBag(state, allItems) {
    if (state.bag.length === 0) {
      state.bag = shuffle(allItems);
      if (state.bag.length > 1 && state.bag[0] === state.last) {
        [state.bag[0], state.bag[1]] = [state.bag[1], state.bag[0]];
      }
    }
    const value = state.bag.shift();
    state.last = value;
    return value;
  }

  const clefBagState = { bag: [], last: null };
  const noteBagState = {
    treble: { bag: [], last: null },
    bass: { bag: [], last: null },
  };

  function rollClef() {
    if (clefMode === 'treble') return 'treble';
    if (clefMode === 'bass') return 'bass';
    return nextFromBag(clefBagState, ['treble', 'bass']);
  }

  function drawIdleStaff() {
    const idleClef = clefMode === 'bass' ? 'bass' : 'treble';
    drawNote(null, idleClef);
  }

  function pickQuestion() {
    clef = rollClef();
    const pool = Object.keys(lineMapFor(clef, gradeMode));
    currentKey = nextFromBag(noteBagState[clef], pool);
    currentLetter = letterFromKey(currentKey);
    drawNote(currentKey, clef);
  }

  function startTimer() {
    timerDuration = TIMER_SECONDS;
    timerNumEl.textContent = timerDuration;
    timerFillEl.style.width = '100%';
    timerFillEl.style.background = '#4cd17a';
    timerStart = performance.now();
    awaitingAnswer = true;
    tick();
  }

  function tick() {
    if (paused) return;
    const elapsed = (performance.now() - timerStart) / 1000;
    const remaining = Math.max(0, timerDuration - elapsed);
    const pct = (remaining / timerDuration) * 100;
    timerFillEl.style.width = pct + '%';
    timerNumEl.textContent = remaining.toFixed(1);
    if (remaining <= timerDuration * 0.34) {
      timerFillEl.style.background = '#ff5c5c';
    } else if (remaining <= timerDuration * 0.6) {
      timerFillEl.style.background = '#ffb84c';
    }
    if (remaining <= 0) {
      if (awaitingAnswer) handleTimeout();
      return;
    }
    rafId = requestAnimationFrame(tick);
  }

  function stopTimerLoop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    awaitingAnswer = false;
  }

  function handleTimeout() {
    stopTimerLoop();
    stats[clefMode].total += 1;
    sessionTimes.push(timerDuration);
    saveStats();
    feedbackEl.textContent = "Time's up!";
    feedbackEl.className = 'timeout';
    highlightLadder('#ffb84c');
    renderStats();
    nextRound(ROUND_DELAY);
  }

  function handleAnswer(letter, btn) {
    if (!awaitingAnswer || !running || paused) return;
    stopTimerLoop();
    stats[clefMode].total += 1;
    const elapsed = Math.min(timerDuration, (performance.now() - timerStart) / 1000);
    sessionTimes.push(elapsed);
    const isCorrect = letter === currentLetter;

    if (isCorrect) {
      btn.classList.add('correctFlash');
      stats[clefMode].correct += 1;
      sessionCorrect += 1;
      feedbackEl.textContent = 'Correct!';
      feedbackEl.className = 'correct';
      highlightLadder('#4cd17a');
    } else {
      btn.classList.add('wrongFlash');
      feedbackEl.textContent = 'Not quite';
      feedbackEl.className = 'wrong';
      highlightLadder('#ff5c5c');
    }

    saveStats();
    renderStats();
    nextRound(ROUND_DELAY);
  }

  function nextRound(delay) {
    const roundSessionId = sessionId;
    nextRoundTimeoutId = setTimeout(() => {
      document.querySelectorAll('.whiteKey').forEach((b) => {
        b.classList.remove('correctFlash', 'wrongFlash');
      });
      feedbackEl.textContent = '';
      feedbackEl.className = '';
      if (!running || paused || roundSessionId !== sessionId) return;
      if (sessionIndex >= SESSION_LENGTH) {
        finishSession();
        return;
      }
      beginQuestion();
    }, delay);
  }

  function beginQuestion() {
    sessionIndex += 1;
    questionCounterEl.textContent = `Question ${sessionIndex}/${SESSION_LENGTH}`;
    pickQuestion();
    startTimer();
  }

  function loadPrevSessions() {
    try {
      const raw = localStorage.getItem(PREV_SESSION_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return {};
  }

  function saveSessionAsPrev(mode, session) {
    const all = loadPrevSessions();
    all[mode] = session;
    localStorage.setItem(PREV_SESSION_KEY, JSON.stringify(all));
  }

  function finishSession() {
    running = false;
    awaitingAnswer = false;
    pauseBtn.disabled = true;
    pausedOverlayEl.classList.remove('show');

    stats[clefMode].sessions += 1;
    saveStats();
    renderStats();

    const accuracy = Math.round((sessionCorrect / SESSION_LENGTH) * 100);
    const avgTime = sessionTimes.length
      ? sessionTimes.reduce((a, b) => a + b, 0) / sessionTimes.length
      : 0;

    const prev = loadPrevSessions()[clefMode];
    summaryScoreEl.textContent = `${sessionCorrect}/${SESSION_LENGTH}`;
    summaryAccuracyEl.textContent = `${accuracy}%`;
    summarySpeedEl.textContent = `${avgTime.toFixed(1)}s`;

    const modeLabel = clefMode.charAt(0).toUpperCase() + clefMode.slice(1);

    if (prev) {
      const accDelta = accuracy - prev.accuracy;
      const speedDelta = prev.avgTime - avgTime;
      if (accDelta > 0 || speedDelta > 0.05) {
        const parts = [];
        if (accDelta > 0) parts.push(`accuracy up ${accDelta}%`);
        if (speedDelta > 0.05) parts.push(`answered ${speedDelta.toFixed(1)}s faster`);
        summaryImprovementEl.textContent = `Improved! ${parts.join(' and ')} vs your last ${modeLabel} session.`;
        summaryImprovementEl.style.color = '#4cd17a';
      } else if (accDelta < 0 || speedDelta < -0.05) {
        const parts = [];
        if (accDelta < 0) parts.push(`accuracy down ${Math.abs(accDelta)}%`);
        if (speedDelta < -0.05) parts.push(`answered ${Math.abs(speedDelta).toFixed(1)}s slower`);
        summaryImprovementEl.textContent = `${parts.join(' and ')} vs your last ${modeLabel} session — keep practicing!`;
        summaryImprovementEl.style.color = '#ffb84c';
      } else {
        summaryImprovementEl.textContent = `Same as your last ${modeLabel} session.`;
        summaryImprovementEl.style.color = '#9aa4b2';
      }
    } else {
      summaryImprovementEl.textContent = `Play again in ${modeLabel} mode to track your improvement!`;
      summaryImprovementEl.style.color = '#9aa4b2';
    }

    saveSessionAsPrev(clefMode, { accuracy, avgTime });
    summaryOverlayEl.classList.add('show');
  }

  function start() {
    sessionId += 1;
    if (nextRoundTimeoutId) {
      clearTimeout(nextRoundTimeoutId);
      nextRoundTimeoutId = null;
    }
    running = true;
    paused = false;
    sessionIndex = 0;
    sessionCorrect = 0;
    sessionTimes = [];
    startBtn.textContent = 'Restart';
    pauseBtn.disabled = false;
    pauseBtn.textContent = 'Pause';
    pausedOverlayEl.classList.remove('show');
    summaryOverlayEl.classList.remove('show');
    beginQuestion();
    renderStats();
  }

  function togglePause() {
    if (!running) return;
    paused = !paused;
    if (paused) {
      pauseStartedAt = performance.now();
      pauseBtn.textContent = 'Resume';
      pausedOverlayEl.classList.add('show');
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
    } else {
      const pausedFor = performance.now() - pauseStartedAt;
      timerStart += pausedFor;
      pauseBtn.textContent = 'Pause';
      pausedOverlayEl.classList.remove('show');
      tick();
    }
  }

  function goHome() {
    sessionId += 1;
    if (nextRoundTimeoutId) {
      clearTimeout(nextRoundTimeoutId);
      nextRoundTimeoutId = null;
    }
    running = false;
    paused = false;
    awaitingAnswer = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    summaryOverlayEl.classList.remove('show');
    pausedOverlayEl.classList.remove('show');
    startBtn.textContent = 'Start';
    pauseBtn.disabled = true;
    pauseBtn.textContent = 'Pause';
    sessionIndex = 0;
    questionCounterEl.textContent = `Question 0/${SESSION_LENGTH}`;
    currentKey = null;
    drawIdleStaff();
    timerNumEl.textContent = TIMER_SECONDS;
    timerFillEl.style.width = '100%';
    timerFillEl.style.background = '#4cd17a';
    feedbackEl.textContent = '';
    feedbackEl.className = '';
    document.querySelectorAll('.whiteKey').forEach((b) => {
      b.classList.remove('correctFlash', 'wrongFlash');
    });
    renderStats();
  }

  startBtn.addEventListener('click', start);
  pauseBtn.addEventListener('click', togglePause);
  playAgainBtn.addEventListener('click', start);
  homeBtn.addEventListener('click', goHome);

  resetStatsBtn.addEventListener('click', () => {
    MODES.forEach((mode) => {
      stats[mode] = emptyModeStats();
    });
    saveStats();
    renderStats();
  });

  function renderSoundToggle() {
    soundToggleBtn.textContent = soundOn ? 'On' : 'Off';
    soundToggleBtn.classList.toggle('off', !soundOn);
    soundToggleBtn.setAttribute('aria-pressed', String(soundOn));
  }

  soundToggleBtn.addEventListener('click', () => {
    soundOn = !soundOn;
    localStorage.setItem(SOUND_KEY, soundOn ? 'on' : 'off');
    renderSoundToggle();
  });

  settingsBtn.addEventListener('click', () => {
    settingsOverlayEl.classList.add('show');
  });

  closeSettingsBtn.addEventListener('click', () => {
    settingsOverlayEl.classList.remove('show');
  });

  renderSoundToggle();
  versionInfoEl.textContent = `v${APP_VERSION} — ${APP_VERSION_DATE}`;

  window.addEventListener('resize', () => {
    if (running) {
      drawNote(currentKey, clef);
    } else {
      drawIdleStaff();
    }
  });

  buildKeyboard();
  drawIdleStaff();
  renderStats();
})();
