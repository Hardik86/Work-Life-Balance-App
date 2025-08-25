// script.js — ALL apps (planner, timer, habits)
// Run after DOM loaded
document.addEventListener('DOMContentLoaded', () => {

  /* ============================
     BALANCE METER + WEEKLY PLANNER
     ============================ */
  (function plannerModule(){
    const qs = s => document.querySelector(s);

    // Sliders and gauge
    const sliderIds = ['#work','#study','#health','#fun'];
    const sliders = sliderIds.map(id => qs(id));
    const gauge = qs('#gauge');
    const scoreEl = qs('#score');

    function calcScore(){
      const vals = sliders.reduce((acc, el) => (acc[el.id] = +el.value, acc), {});
      const workSide = vals.work + vals.study;
      const lifeSide = vals.health + vals.fun;
      const delta = Math.abs(workSide - lifeSide);
      const raw = Math.max(0, 100 - delta);
      const score = Math.round(raw);
      gauge.style.setProperty('--gval', score);
      scoreEl.textContent = score;
      // persist
      localStorage.setItem('wlb-sliders', JSON.stringify(vals));
    }
    sliders.forEach(s => s.addEventListener('input', calcScore));
    // Restore
    (function restoreSliders(){
      const d = JSON.parse(localStorage.getItem('wlb-sliders') || 'null');
      if (d) {
        sliders.forEach(s => { if (d[s.id] !== undefined) s.value = d[s.id]; });
      }
      calcScore();
    })();

    // Planner Grid
    const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const slots = ['Morning','Afternoon','Evening'];
    const grid = document.getElementById('planner-grid');

    function createCellKey(slotIndex, dayIndex){ return `wlb-cell-${slotIndex}-${dayIndex}`; }

    function cellElem(text = '', key){
      const el = document.createElement('div');
      el.className = 'cell';
      el.contentEditable = 'true';
      el.setAttribute('data-key', key);
      el.textContent = text || '';
      el.addEventListener('input', () => {
        localStorage.setItem(key, el.textContent);
      });
      return el;
    }

    // Build header row
    grid.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'head';
    head.textContent = '';
    grid.appendChild(head);
    days.forEach(d => {
      const h = document.createElement('div');
      h.className = 'head';
      h.textContent = d;
      grid.appendChild(h);
    });

    // Build rows
    slots.forEach((slot, sIdx) => {
      const tcell = document.createElement('div');
      tcell.className = 'timecell';
      tcell.textContent = slot;
      grid.appendChild(tcell);
      days.forEach((day, dIdx) => {
        const key = createCellKey(sIdx, dIdx);
        const stored = localStorage.getItem(key) || '';
        const c = cellElem(stored, key);
        grid.appendChild(c);
      });
    });

    // Clear + Export
    document.getElementById('clear-planner').onclick = () => {
      if (!confirm('Clear all planner data for this device?')) return;
      grid.querySelectorAll('.cell').forEach(c => {
        const k = c.dataset.key;
        c.textContent = '';
        localStorage.removeItem(k);
      });
    };
    document.getElementById('export-planner').onclick = () => {
      const data = {};
      grid.querySelectorAll('.cell').forEach(c => { data[c.dataset.key] = c.textContent; });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'planner.json';
      a.click();
      URL.revokeObjectURL(url);
    };

  })();


  /* ============================
     FOCUS TIMER (Pomodoro-like)
     ============================ */
  (function timerModule(){
    const el = id => document.getElementById(id);
    const ring = el('ring');
    const timeDisplay = el('time-display');
    const startBtn = el('start-timer');
    const pauseBtn = el('pause-timer');
    const resetBtn = el('reset-timer');
    const workMinInput = el('work-min');
    const breakMinInput = el('break-min');
    const cyclesInput = el('cycles');

    // State
    let workMin = +workMinInput.value;
    let breakMin = +breakMinInput.value;
    let cycles = +cyclesInput.value;

    let remain = workMin * 60; // seconds remaining in current mode
    let total = remain;
    let mode = 'work'; // 'work' or 'break'
    let running = false;
    let timerId = null;
    let completedWorkSessions = 0;

    // Save / restore settings
    function saveSettings(){
      localStorage.setItem('wlb-timer-settings', JSON.stringify({ workMin, breakMin, cycles }));
    }
    function restoreSettings(){
      const s = JSON.parse(localStorage.getItem('wlb-timer-settings') || 'null');
      if (s) {
        workMin = s.workMin || workMin;
        breakMin = s.breakMin || breakMin;
        cycles = s.cycles || cycles;
        workMinInput.value = workMin;
        breakMinInput.value = breakMin;
        cyclesInput.value = cycles;
      }
      resetAll();
    }
    function beep(){
      try{
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = 880;
        o.connect(g); g.connect(ctx.destination);
        g.gain.setValueAtTime(0.0001, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01);
        o.start();
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
        o.stop(ctx.currentTime + 0.65);
      }catch(e){ /* ignore audio errors */ }
    }

    function draw(){
      const mm = Math.floor(remain / 60);
      const ss = String(remain % 60).padStart(2, '0');
      timeDisplay.textContent = `${mm}:${ss}`;
      // progress percent
      const donePct = Math.round((1 - (remain / total)) * 100);
      ring.style.setProperty('--p', donePct);
      ring.style.background = `conic-gradient(var(--accent) ${donePct}%, var(--ring) 0)`;
    }

    function tick(){
      if (remain > 0) {
        remain--;
        draw();
      } else {
        // transition
        beep();
        if (mode === 'work') {
          completedWorkSessions++;
          if (completedWorkSessions >= cycles) {
            // finished all cycles
            stopTimer();
            alert('All cycles completed. Good work!');
            return;
          } else {
            mode = 'break';
            remain = breakMin * 60;
            total = remain;
            draw();
          }
        } else {
          // finished break -> switch to work
          mode = 'work';
          remain = workMin * 60;
          total = remain;
          draw();
        }
      }
    }

    function startTimer(){
      if (running) return;
      running = true;
      timerId = setInterval(tick, 1000);
    }
    function pauseTimer(){
      running = false;
      if (timerId) clearInterval(timerId);
      timerId = null;
    }
    function stopTimer(){
      pauseTimer();
      completedWorkSessions = 0;
      mode = 'work';
      remain = workMin * 60;
      total = remain;
      draw();
    }
    function resetAll(){
      workMin = Math.max(1, +workMinInput.value);
      breakMin = Math.max(1, +breakMinInput.value);
      cycles = Math.max(1, +cyclesInput.value);
      saveSettings();
      stopTimer();
    }

    // Controls
    startBtn.addEventListener('click', startTimer);
    pauseBtn.addEventListener('click', pauseTimer);
    resetBtn.addEventListener('click', resetAll);
    [workMinInput, breakMinInput, cyclesInput].forEach(inp => {
      inp.addEventListener('change', () => {
        resetAll();
      });
    });

    // Restore
    restoreSettings();
    draw();

  })();


  /* ============================
     HABITS + MOOD + ZEN KOAN
     ============================ */
  (function habitsModule(){
    const habitListEl = document.getElementById('habit-list');
    const habitProgress = document.getElementById('habit-progress');
    const resetHabitsBtn = document.getElementById('reset-habits');
    const moodRange = document.getElementById('mood-range');
    const moodEmoji = document.getElementById('mood-emoji');
    const koanEl = document.getElementById('koan');
    const newKoanBtn = document.getElementById('new-koan');
    const shareKoanBtn = document.getElementById('share-koan');

    const COANS = [
      "Two hands clap and there is a sound; what is the sound of one hand?",
      "A monk asked: What is Buddha? — This very mind.",
      "Before enlightenment, chop wood, carry water. After enlightenment, chop wood, carry water.",
      "Joshu asked: Does a dog have Buddha-nature? — Mu.",
      "Not knowing is most intimate."
    ];

    // Habit templates
    const HABITS = [
      "Stretch 2 minutes",
      "10-minute walk",
      "3-line journal",
      "2 cups of water",
      "15-min digital detox",
      "3 gratitudes"
    ];

    // Key per day
    function todayKey(){
      const d = new Date();
      const y = d.getFullYear();
      const m = String(d.getMonth()+1).padStart(2,'0');
      const day = String(d.getDate()).padStart(2,'0');
      return `wlb-habits-${y}-${m}-${day}`;
    }

    // Build list
    function buildList(){
      const key = todayKey();
      const stored = JSON.parse(localStorage.getItem(key) || 'null') || { checks: [], mood: 0 };
      habitListEl.innerHTML = '';
      HABITS.forEach((h, i) => {
        const li = document.createElement('li');
        const label = document.createElement('label');
        label.style.display = 'flex'; label.style.alignItems = 'center'; label.style.justifyContent = 'space-between';
        const left = document.createElement('span'); left.textContent = h;
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = !!stored.checks[i];
        cb.addEventListener('change', () => saveList());
        label.appendChild(left); label.appendChild(cb);
        li.appendChild(label);
        habitListEl.appendChild(li);
      });
      // mood
      moodRange.value = stored.mood ?? 0;
      moodEmoji.textContent = moodFace(Number(moodRange.value));
      progress();
    }

    function saveList(){
      const checks = [...habitListEl.querySelectorAll('input[type=checkbox]')].map(cb => cb.checked);
      const mood = Number(moodRange.value);
      const key = todayKey();
      localStorage.setItem(key, JSON.stringify({ checks, mood }));
      progress();
    }

    function progress(){
      const total = habitListEl.querySelectorAll('input[type=checkbox]').length || 1;
      const done = [...habitListEl.querySelectorAll('input[type=checkbox]')].filter(cb => cb.checked).length;
      const pct = Math.round((done/total)*100);
      habitProgress.style.width = pct + '%';
    }

    function moodFace(v){
      return ['😞','🙁','😐','🙂','😄'][v+2];
    }

    moodRange.addEventListener('input', () => {
      moodEmoji.textContent = moodFace(Number(moodRange.value));
      saveList();
    });

    resetHabitsBtn.addEventListener('click', () => {
      if (!confirm('Reset today\'s habit checks?')) return;
      const key = todayKey();
      localStorage.removeItem(key);
      buildList();
    });

    function newKoan(){
      koanEl.textContent = COANS[Math.floor(Math.random() * COANS.length)];
    }
    newKoanBtn.addEventListener('click', newKoan);

    shareKoanBtn.addEventListener('click', async () => {
      const t = koanEl.textContent || '';
      try {
        await navigator.clipboard.writeText(t);
        shareKoanBtn.textContent = 'Copied!';
        setTimeout(()=> shareKoanBtn.textContent = 'Copy Koan', 1400);
      } catch (e) {
        alert('Copy failed — select & copy manually.');
      }
    });

    // Initialize
    buildList();
    newKoan();
  })();

}); // DOMContentLoaded
