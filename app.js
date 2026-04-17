// ── Storage helpers ──────────────────────────────────────────────────────────

const STORAGE_KEY = 'wt_workouts';
const SESSION_KEY = 'wt_session';
const CUSTOM_EX_KEY = 'wt_custom_exercises';

function loadWorkouts() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}

function saveWorkouts(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function loadSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)) || null; }
  catch { return null; }
}

function saveSession(data) {
  if (data) localStorage.setItem(SESSION_KEY, JSON.stringify(data));
  else localStorage.removeItem(SESSION_KEY);
}

function loadCustomExercises() {
  try { return JSON.parse(localStorage.getItem(CUSTOM_EX_KEY)) || []; }
  catch { return []; }
}

function saveCustomExercise(name) {
  const custom = loadCustomExercises();
  if (!custom.includes(name) && !COMMON_EXERCISES.includes(name)) {
    custom.push(name);
    localStorage.setItem(CUSTOM_EX_KEY, JSON.stringify(custom));
  }
}

// ── State ────────────────────────────────────────────────────────────────────

let workouts = loadWorkouts();
let session = loadSession(); // { startedAt: ISO, manual?: bool, manualDate?: 'YYYY-MM-DD', exercises: [{name, sets:[{reps,weight,done}]}] }
let timerInterval = null;

// ── Tab switching ─────────────────────────────────────────────────────────────

document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(s => s.classList.add('hidden'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.remove('hidden');
    if (btn.dataset.tab === 'history') renderHistory();
    if (btn.dataset.tab === 'stats') renderStats();
  });
});

// ── Timer ─────────────────────────────────────────────────────────────────────

function startTimer() {
  const el = document.getElementById('session-timer');
  el.classList.remove('hidden');
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (!session) { clearInterval(timerInterval); el.classList.add('hidden'); return; }
    const elapsed = Math.floor((Date.now() - new Date(session.startedAt)) / 1000);
    const h = Math.floor(elapsed / 3600);
    const m = Math.floor((elapsed % 3600) / 60);
    const s = elapsed % 60;
    el.textContent = h > 0
      ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
      : `${m}:${String(s).padStart(2,'0')}`;
  }, 1000);
}

function stopTimer() {
  clearInterval(timerInterval);
  document.getElementById('session-timer').classList.add('hidden');
}

// ── Start / finish / discard session ─────────────────────────────────────────

// ── Workout type picker ───────────────────────────────────────────────────────

let pendingManual = false;

function showTypePicker(manual) {
  pendingManual = manual;
  document.getElementById('start-options').classList.add('hidden');
  document.getElementById('type-picker').classList.remove('hidden');
}

function hideTypePicker() {
  document.getElementById('type-picker').classList.add('hidden');
  document.getElementById('start-options').classList.remove('hidden');
  pendingManual = false;
}

function beginSession(type) {
  if (pendingManual) {
    const today = new Date().toISOString().slice(0, 10);
    session = { startedAt: new Date().toISOString(), manual: true, manualDate: today, workoutType: type, exercises: [] };
  } else {
    session = { startedAt: new Date().toISOString(), workoutType: type, exercises: [] };
  }
  saveSession(session);
  hideTypePicker();
  renderLogTab();
  if (!session.manual) startTimer();
}

document.getElementById('start-workout-btn').addEventListener('click', () => showTypePicker(false));
document.getElementById('log-past-btn').addEventListener('click', () => showTypePicker(true));
document.getElementById('skip-type-btn').addEventListener('click', () => beginSession(null));

document.querySelectorAll('.type-chip').forEach(btn => {
  btn.addEventListener('click', () => beginSession(btn.dataset.type));
});

document.getElementById('finish-workout-btn').addEventListener('click', () => {
  if (!session) return;
  if (session.exercises.length === 0) {
    alert('Add at least one exercise before finishing.');
    return;
  }
  // Strip sets that have no reps data
  const cleaned = session.exercises.map(ex => ({
    name: ex.name,
    sets: ex.sets.filter(s => s.reps || s.weight)
  })).filter(ex => ex.sets.length > 0);

  if (cleaned.length === 0) {
    alert('Please fill in at least one set before finishing.');
    return;
  }

  let workoutDate, duration;
  if (session.manual) {
    const d = document.getElementById('manual-date-input').value;
    workoutDate = d ? new Date(d + 'T12:00:00').toISOString() : new Date().toISOString();
    const h = parseInt(document.getElementById('manual-hours-input').value) || 0;
    const m = parseInt(document.getElementById('manual-mins-input').value) || 0;
    duration = (h * 3600 + m * 60) || null;
  } else {
    workoutDate = new Date().toISOString();
    duration = Math.floor((Date.now() - new Date(session.startedAt)) / 1000);
  }

  const workout = {
    id: Date.now(),
    date: workoutDate,
    duration,
    workoutType: session.workoutType || null,
    exercises: cleaned
  };
  workouts.unshift(workout);
  saveWorkouts(workouts);
  session = null;
  saveSession(null);
  stopTimer();
  renderLogTab();
});

document.getElementById('discard-workout-btn').addEventListener('click', () => {
  if (!confirm('Discard this workout?')) return;
  session = null;
  saveSession(null);
  stopTimer();
  renderLogTab();
});

// ── Log tab renderer ──────────────────────────────────────────────────────────

function renderLogTab() {
  const noSession = document.getElementById('no-session');
  const activeSession = document.getElementById('active-session');

  if (!session) {
    noSession.classList.remove('hidden');
    activeSession.classList.add('hidden');
    return;
  }

  noSession.classList.add('hidden');
  activeSession.classList.remove('hidden');

  // Session info bar (type badge)
  const infoBar = document.getElementById('session-info-bar');
  infoBar.innerHTML = session.workoutType
    ? `<span class="session-type-badge type-${session.workoutType.toLowerCase()}">${session.workoutType}</span>`
    : '';

  const dateRow = document.getElementById('manual-date-row');
  const dateInput = document.getElementById('manual-date-input');
  const finishBtn = document.getElementById('finish-workout-btn');

  if (session.manual) {
    dateRow.classList.remove('hidden');
    dateInput.value = session.manualDate || new Date().toISOString().slice(0, 10);
    dateInput.max = new Date().toISOString().slice(0, 10);
    dateInput.addEventListener('change', () => {
      session.manualDate = dateInput.value;
      saveSession(session);
    });
    finishBtn.textContent = 'Save Workout';
  } else {
    dateRow.classList.add('hidden');
    finishBtn.textContent = 'Finish Workout';
  }

  renderExerciseList();
}

function renderExerciseList() {
  const container = document.getElementById('exercise-list');
  container.innerHTML = '';
  session.exercises.forEach((ex, exIdx) => {
    container.appendChild(buildExerciseCard(ex, exIdx));
  });
}

function buildExerciseCard(ex, exIdx) {
  const card = document.createElement('div');
  card.className = 'exercise-card';

  // Header
  const header = document.createElement('div');
  header.className = 'exercise-card-header';
  const title = document.createElement('h3');
  title.textContent = ex.name;
  const removeBtn = document.createElement('button');
  removeBtn.className = 'btn-ghost';
  removeBtn.textContent = 'Remove';
  removeBtn.addEventListener('click', () => {
    session.exercises.splice(exIdx, 1);
    saveSession(session);
    renderExerciseList();
  });
  header.appendChild(title);
  header.appendChild(removeBtn);
  card.appendChild(header);

  // Sets table
  const table = document.createElement('table');
  table.className = 'sets-table';
  table.innerHTML = `<thead><tr>
    <th>Set</th><th>Weight (kg)</th><th>Reps</th><th>Done</th>
  </tr></thead>`;
  const tbody = document.createElement('tbody');

  ex.sets.forEach((set, setIdx) => {
    tbody.appendChild(buildSetRow(set, exIdx, setIdx));
  });

  table.appendChild(tbody);
  card.appendChild(table);

  // Footer
  const footer = document.createElement('div');
  footer.className = 'exercise-card-footer';
  const addSetBtn = document.createElement('button');
  addSetBtn.className = 'btn-secondary';
  addSetBtn.textContent = '+ Add Set';
  addSetBtn.addEventListener('click', () => {
    const prev = ex.sets.at(-1);
    ex.sets.push({ reps: prev?.reps || '', weight: prev?.weight || '', done: false });
    saveSession(session);
    // Append new row instead of full re-render for smoother UX
    tbody.appendChild(buildSetRow(ex.sets.at(-1), exIdx, ex.sets.length - 1));
  });
  footer.appendChild(addSetBtn);
  card.appendChild(footer);

  return card;
}

function buildSetRow(set, exIdx, setIdx) {
  const tr = document.createElement('tr');
  tr.className = 'sets-row' + (set.done ? ' checked' : '');

  // Set number
  const numTd = document.createElement('td');
  numTd.className = 'set-num';
  numTd.textContent = setIdx + 1;
  tr.appendChild(numTd);

  // Weight input
  const weightTd = document.createElement('td');
  const weightInput = document.createElement('input');
  weightInput.type = 'number';
  weightInput.min = '0';
  weightInput.placeholder = '—';
  weightInput.value = set.weight || '';
  weightInput.addEventListener('change', () => {
    session.exercises[exIdx].sets[setIdx].weight = weightInput.value;
    saveSession(session);
  });
  weightTd.appendChild(weightInput);
  tr.appendChild(weightTd);

  // Reps input
  const repsTd = document.createElement('td');
  const repsInput = document.createElement('input');
  repsInput.type = 'number';
  repsInput.min = '0';
  repsInput.placeholder = '—';
  repsInput.value = set.reps || '';
  repsInput.addEventListener('change', () => {
    session.exercises[exIdx].sets[setIdx].reps = repsInput.value;
    saveSession(session);
  });
  repsTd.appendChild(repsInput);
  tr.appendChild(repsTd);

  // Done checkbox
  const doneTd = document.createElement('td');
  doneTd.className = 'done-cell';
  const checkBtn = document.createElement('button');
  checkBtn.className = 'check-btn' + (set.done ? ' checked' : '');
  checkBtn.setAttribute('aria-label', 'Mark set done');
  checkBtn.addEventListener('click', () => {
    session.exercises[exIdx].sets[setIdx].done = !session.exercises[exIdx].sets[setIdx].done;
    saveSession(session);
    checkBtn.classList.toggle('checked');
    tr.classList.toggle('checked');
  });
  doneTd.appendChild(checkBtn);
  tr.appendChild(doneTd);

  return tr;
}

// ── Add exercise modal ────────────────────────────────────────────────────────

const COMMON_EXERCISES = [
  'Bench Press','Incline Bench Press','Decline Bench Press',
  'Squat','Front Squat','Leg Press','Leg Extension','Leg Curl',
  'Deadlift','Romanian Deadlift','Sumo Deadlift',
  'Overhead Press','Lateral Raise','Front Raise','Arnold Press',
  'Pull-Up','Chin-Up','Lat Pulldown','Seated Row','Barbell Row',
  'Bicep Curl','Hammer Curl','Preacher Curl',
  'Tricep Pushdown','Skull Crusher','Dips',
  'Calf Raise','Hip Thrust','Cable Fly','Chest Fly',
  'Face Pull','Shrugs','Plank','Crunch','Leg Raise'
];

function populateSuggestions() {
  const dl = document.getElementById('exercise-suggestions');
  dl.innerHTML = '';
  const all = [...new Set([...COMMON_EXERCISES, ...loadCustomExercises()])].sort();
  all.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    dl.appendChild(opt);
  });
}
populateSuggestions();

document.getElementById('add-exercise-btn').addEventListener('click', openModal);
document.getElementById('modal-cancel-btn').addEventListener('click', closeModal);
document.getElementById('modal-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
});

document.getElementById('modal-add-btn').addEventListener('click', () => {
  const name = document.getElementById('exercise-name-input').value.trim();
  if (!name) { document.getElementById('exercise-name-input').focus(); return; }
  saveCustomExercise(name);
  populateSuggestions();
  session.exercises.push({ name, sets: [{ reps: '', weight: '', done: false }] });
  saveSession(session);
  closeModal();
  renderExerciseList();
});

document.getElementById('exercise-name-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('modal-add-btn').click();
});

function openModal() {
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.getElementById('exercise-name-input').value = '';
  setTimeout(() => document.getElementById('exercise-name-input').focus(), 50);
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

// ── History tab ───────────────────────────────────────────────────────────────

function renderHistory() {
  const container = document.getElementById('history-list');
  container.innerHTML = '';

  if (workouts.length === 0) {
    container.innerHTML = '<p class="hint">No workouts logged yet.</p>';
    return;
  }

  workouts.forEach((workout, idx) => {
    container.appendChild(buildHistoryItem(workout, idx));
  });
}

function buildHistoryItem(workout, idx) {
  const item = document.createElement('div');
  item.className = 'history-item';

  const date = new Date(workout.date);
  const dateStr = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const dur = formatDuration(workout.duration);
  const exNames = workout.exercises.map(e => e.name).join(', ');
  const totalSets = workout.exercises.reduce((acc, e) => acc + e.sets.length, 0);

  const typeBadge = workout.workoutType
    ? `<span class="type-badge type-${workout.workoutType.toLowerCase()}">${workout.workoutType}</span>`
    : '';

  const header = document.createElement('div');
  header.className = 'history-item-header';
  header.innerHTML = `
    <div class="history-meta">
      <div class="history-date-row">${typeBadge}<span class="history-date">${dateStr}</span></div>
      <span class="history-summary">${totalSets} sets · ${dur} · ${exNames}</span>
    </div>
    <span class="history-chevron">&#8964;</span>
  `;
  header.addEventListener('click', () => item.classList.toggle('open'));
  item.appendChild(header);

  const body = document.createElement('div');
  body.className = 'history-body';

  workout.exercises.forEach(ex => {
    const exDiv = document.createElement('div');
    exDiv.className = 'history-exercise';
    exDiv.innerHTML = `<h4>${ex.name}</h4>`;
    const setsDiv = document.createElement('div');
    setsDiv.className = 'history-sets';
    ex.sets.forEach((s, i) => {
      const row = document.createElement('div');
      row.className = 'history-set-row';
      row.innerHTML = `<span class="num">Set ${i+1}</span>${s.weight ? s.weight + ' kg' : '—'} &times; ${s.reps || '—'} reps`;
      setsDiv.appendChild(row);
    });
    exDiv.appendChild(setsDiv);
    body.appendChild(exDiv);
  });

  const delBtn = document.createElement('button');
  delBtn.className = 'delete-history-btn';
  delBtn.textContent = 'Delete this workout';
  delBtn.addEventListener('click', () => {
    if (!confirm('Delete this workout?')) return;
    workouts.splice(idx, 1);
    saveWorkouts(workouts);
    renderHistory();
  });
  body.appendChild(delBtn);
  item.appendChild(body);

  return item;
}

function formatDuration(secs) {
  if (!secs) return '—';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// ── Stats tab ─────────────────────────────────────────────────────────────────

function getAllExerciseNames() {
  const names = new Set();
  workouts.forEach(w => w.exercises.forEach(e => names.add(e.name)));
  return [...names].sort();
}

function renderStats() {
  const select = document.getElementById('stats-exercise-select');
  const names = getAllExerciseNames();

  // Rebuild options
  select.innerHTML = '<option value="">-- pick an exercise --</option>';
  names.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  });

  if (select.dataset.selected && names.includes(select.dataset.selected)) {
    select.value = select.dataset.selected;
    renderStatsFor(select.dataset.selected);
  } else {
    document.getElementById('stats-content').innerHTML = '<p class="hint">Select an exercise to see your progress.</p>';
  }
}

document.getElementById('stats-exercise-select').addEventListener('change', function() {
  this.dataset.selected = this.value;
  if (this.value) renderStatsFor(this.value);
  else document.getElementById('stats-content').innerHTML = '<p class="hint">Select an exercise to see your progress.</p>';
});

function renderStatsFor(name) {
  // Collect data points: for each workout, find max weight and total volume
  const points = [];
  workouts.slice().reverse().forEach(w => {
    const ex = w.exercises.find(e => e.name === name);
    if (!ex) return;
    const sets = ex.sets.filter(s => s.reps);
    if (sets.length === 0) return;
    const maxWeight = Math.max(...sets.map(s => parseFloat(s.weight) || 0));
    const volume = sets.reduce((acc, s) => acc + (parseFloat(s.weight) || 0) * (parseInt(s.reps) || 0), 0);
    const maxReps = Math.max(...sets.map(s => parseInt(s.reps) || 0));
    points.push({ date: new Date(w.date), maxWeight, volume, maxReps, sets: sets.length });
  });

  const container = document.getElementById('stats-content');

  if (points.length === 0) {
    container.innerHTML = '<p class="hint">No data for this exercise yet.</p>';
    return;
  }

  const allWeights = points.map(p => p.maxWeight).filter(w => w > 0);
  const bestWeight = allWeights.length ? Math.max(...allWeights) : 0;
  const totalSessions = points.length;
  const bestVolume = Math.max(...points.map(p => p.volume));

  container.innerHTML = '';

  // Stat cards
  const cards = document.createElement('div');
  cards.className = 'stat-cards';
  cards.innerHTML = `
    <div class="stat-card"><div class="stat-value">${bestWeight > 0 ? bestWeight + '<small style="font-size:13px">kg</small>' : '—'}</div><div class="stat-label">Best Weight</div></div>
    <div class="stat-card"><div class="stat-value">${totalSessions}</div><div class="stat-label">Sessions</div></div>
    <div class="stat-card"><div class="stat-value">${bestVolume > 0 ? Math.round(bestVolume).toLocaleString() + '<small style="font-size:11px">kg</small>' : '—'}</div><div class="stat-label">Best Volume</div></div>
  `;
  container.appendChild(cards);

  if (points.length >= 2) {
    // Weight over time chart
    container.appendChild(buildLineChart('Max Weight Over Time', points.map(p => ({ x: p.date, y: p.maxWeight })), 'var(--accent)', 'kg'));
    // Volume over time chart
    container.appendChild(buildLineChart('Volume Over Time', points.map(p => ({ x: p.date, y: p.volume })), 'var(--green)', 'kg'));
  }

  // Recent sessions table
  const recentWrap = document.createElement('div');
  recentWrap.className = 'chart-wrap';
  recentWrap.innerHTML = '<h4>Recent Sessions</h4>';
  const last5 = points.slice(-5).reverse();
  last5.forEach(p => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:space-between;font-size:13px;padding:5px 0;border-bottom:1px solid var(--border)';
    row.innerHTML = `<span>${p.date.toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span><span>${p.sets} sets &middot; ${p.maxWeight > 0 ? p.maxWeight + ' kg' : '—'} max</span>`;
    recentWrap.appendChild(row);
  });
  container.appendChild(recentWrap);
}

// ── Minimal canvas line chart ─────────────────────────────────────────────────

function buildLineChart(title, data, color, unit) {
  const wrap = document.createElement('div');
  wrap.className = 'chart-wrap';

  const heading = document.createElement('h4');
  heading.textContent = title;
  wrap.appendChild(heading);

  const canvas = document.createElement('canvas');
  const DPR = window.devicePixelRatio || 1;
  const W = Math.min(560, window.innerWidth - 72);
  const H = 140;
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';

  wrap.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  ctx.scale(DPR, DPR);

  const PAD = { top: 12, right: 16, bottom: 32, left: 48 };
  const cw = W - PAD.left - PAD.right;
  const ch = H - PAD.top - PAD.bottom;

  const ys = data.map(d => d.y);
  const minY = Math.min(...ys) * 0.9;
  const maxY = Math.max(...ys) * 1.1 || 1;

  function toX(i) { return PAD.left + (i / (data.length - 1)) * cw; }
  function toY(v) { return PAD.top + ch - ((v - minY) / (maxY - minY)) * ch; }

  // Grid lines
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  [0, .25, .5, .75, 1].forEach(t => {
    const y = PAD.top + ch * (1 - t);
    ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left + cw, y); ctx.stroke();
  });

  // Y axis labels
  ctx.fillStyle = '#7a7a8e';
  ctx.font = '11px -apple-system, sans-serif';
  ctx.textAlign = 'right';
  [0, .5, 1].forEach(t => {
    const val = minY + (maxY - minY) * t;
    const y = PAD.top + ch * (1 - t);
    ctx.fillText(Math.round(val).toLocaleString(), PAD.left - 6, y + 4);
  });

  // X axis date labels
  ctx.textAlign = 'center';
  const step = Math.ceil(data.length / 5);
  data.forEach((d, i) => {
    if (i % step !== 0 && i !== data.length - 1) return;
    const label = d.x.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    ctx.fillText(label, toX(i), H - 6);
  });

  // Filled area
  const grad = ctx.createLinearGradient(0, PAD.top, 0, PAD.top + ch);
  grad.addColorStop(0, color.replace(')', ', 0.25)').replace('var(--accent)', 'rgba(108,99,255').replace('var(--green)', 'rgba(62,207,142'));
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.beginPath();
  ctx.moveTo(toX(0), toY(data[0].y));
  data.forEach((d, i) => ctx.lineTo(toX(i), toY(d.y)));
  ctx.lineTo(toX(data.length - 1), PAD.top + ch);
  ctx.lineTo(toX(0), PAD.top + ch);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
  ctx.beginPath();
  ctx.strokeStyle = color.replace('var(--accent)', '#6c63ff').replace('var(--green)', '#3ecf8e');
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  data.forEach((d, i) => i === 0 ? ctx.moveTo(toX(i), toY(d.y)) : ctx.lineTo(toX(i), toY(d.y)));
  ctx.stroke();

  // Dots
  data.forEach((d, i) => {
    ctx.beginPath();
    ctx.arc(toX(i), toY(d.y), 4, 0, Math.PI * 2);
    ctx.fillStyle = color.replace('var(--accent)', '#6c63ff').replace('var(--green)', '#3ecf8e');
    ctx.fill();
    ctx.strokeStyle = '#1a1a1f';
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  return wrap;
}

// ── Init ──────────────────────────────────────────────────────────────────────

renderLogTab();
if (session) startTimer();
