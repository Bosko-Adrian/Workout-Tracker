// ── Storage helpers ──────────────────────────────────────────────────────────

const STORAGE_KEY = 'wt_workouts';
const SESSION_KEY = 'wt_session';
const CUSTOM_EX_KEY = 'wt_custom_exercises';
const TEMPLATES_KEY = 'wt_templates';

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

function loadTemplates() {
  try { return JSON.parse(localStorage.getItem(TEMPLATES_KEY)) || []; }
  catch { return []; }
}

function saveTemplates(data) {
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(data));
}

// ── State ────────────────────────────────────────────────────────────────────

let workouts = loadWorkouts();
let session = loadSession(); // { startedAt: ISO, manual?: bool, manualDate?: 'YYYY-MM-DD', exercises: [{name, sets:[{reps,weight,rest,done}]}] }
let templates = loadTemplates();
let timerInterval = null;

// Active rest timers: "exIdx-setIdx" -> { intervalId, startedAt, displayEl, inputEl }
const activeRestTimers = {};

// ── Tab switching ─────────────────────────────────────────────────────────────

document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(s => s.classList.add('hidden'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.remove('hidden');
    if (btn.dataset.tab === 'history') renderHistory();
    if (btn.dataset.tab === 'stats') renderStats();
    if (btn.dataset.tab === 'plans') renderPlansTab();
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
let pendingTemplateExercises = null; // exercises pre-loaded from a template

function showStep(stepId) {
  ['start-options','template-picker-step','type-picker'].forEach(id => {
    document.getElementById(id).classList.add('hidden');
  });
  document.getElementById(stepId).classList.remove('hidden');
}

function showTypePicker(manual) {
  pendingManual = manual;
  showStep('type-picker');
}

function showTemplatePicker() {
  const list = document.getElementById('template-picker-list');
  list.innerHTML = '';
  if (templates.length === 0) {
    list.innerHTML = '<p class="hint" style="padding:12px 0">No templates yet — create one in the Plans tab.</p>';
  } else {
    templates.forEach(t => {
      const btn = document.createElement('button');
      btn.className = 'template-picker-item';
      btn.innerHTML = `<span class="tpi-name">${t.name}</span><span class="tpi-meta">${t.exercises.length} exercise${t.exercises.length !== 1 ? 's' : ''}</span>`;
      btn.addEventListener('click', () => {
        pendingTemplateExercises = t.exercises.map(ex => ({
          name: ex.name,
          sets: ex.sets.map(s => ({ weight: s.weight || '', reps: s.reps || '', done: false }))
        }));
        showTypePicker(false);
      });
      list.appendChild(btn);
    });
  }
  showStep('template-picker-step');
}

function beginSession(type) {
  const exercises = pendingTemplateExercises || [];
  if (pendingManual) {
    const today = toLocalDateStr(new Date());
    session = { startedAt: new Date().toISOString(), manual: true, manualDate: today, workoutType: type, exercises };
  } else {
    session = { startedAt: new Date().toISOString(), workoutType: type, exercises };
  }
  pendingTemplateExercises = null;
  saveSession(session);
  showStep('start-options'); // reset for next time
  renderLogTab();
  if (!session.manual) startTimer();
}

document.getElementById('start-workout-btn').addEventListener('click', () => showTypePicker(false));
document.getElementById('log-past-btn').addEventListener('click', () => showTypePicker(true));
document.getElementById('use-template-btn').addEventListener('click', showTemplatePicker);
document.getElementById('template-picker-back-btn').addEventListener('click', () => showStep('start-options'));
document.getElementById('skip-type-btn').addEventListener('click', () => beginSession(null));

// Only wire type-chips in the log tab's type-picker (not edit modal chips)
document.querySelectorAll('#type-picker .type-chip').forEach(btn => {
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
  Object.keys(activeRestTimers).forEach(k => { clearInterval(activeRestTimers[k].intervalId); delete activeRestTimers[k]; });
  stopTimer();
  renderLogTab();
});

document.getElementById('discard-workout-btn').addEventListener('click', () => {
  if (!confirm('Discard this workout?')) return;
  session = null;
  saveSession(null);
  Object.keys(activeRestTimers).forEach(k => { clearInterval(activeRestTimers[k].intervalId); delete activeRestTimers[k]; });
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
    // Stop any running rest timer on the previous set when a new set is added
    ex.sets.push({ reps: prev?.reps || '', weight: prev?.weight || '', done: false });
    saveSession(session);
    tbody.appendChild(buildSetRow(ex.sets.at(-1), exIdx, ex.sets.length - 1));
  });
  footer.appendChild(addSetBtn);
  card.appendChild(footer);

  return card;
}

function buildSetRow(set, exIdx, setIdx) {
  const fragment = document.createDocumentFragment();

  // ── Set row ──
  const tr = document.createElement('tr');
  tr.className = 'sets-row' + (set.done ? ' checked' : '');

  const numTd = document.createElement('td');
  numTd.className = 'set-num';
  numTd.textContent = setIdx + 1;
  tr.appendChild(numTd);

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

  const doneTd = document.createElement('td');
  doneTd.className = 'done-cell';
  const checkBtn = document.createElement('button');
  checkBtn.className = 'check-btn' + (set.done ? ' checked' : '');
  checkBtn.setAttribute('aria-label', 'Mark set done');
  checkBtn.addEventListener('click', () => {
    const nowDone = !session.exercises[exIdx].sets[setIdx].done;
    session.exercises[exIdx].sets[setIdx].done = nowDone;
    saveSession(session);
    checkBtn.classList.toggle('checked', nowDone);
    tr.classList.toggle('checked', nowDone);
    restRow.classList.toggle('hidden', !nowDone);
    // Stop timer if unchecking
    if (!nowDone) stopRestTimer(exIdx, setIdx);
  });
  doneTd.appendChild(checkBtn);
  tr.appendChild(doneTd);
  fragment.appendChild(tr);

  // ── Rest row (shown after set is checked off) ──
  const restRow = document.createElement('tr');
  restRow.className = 'rest-row' + (set.done ? '' : ' hidden');

  const restTd = document.createElement('td');
  restTd.colSpan = 4;
  const restInner = document.createElement('div');
  restInner.className = 'rest-row-inner';

  const restLabel = document.createElement('span');
  restLabel.className = 'rest-label';
  restLabel.textContent = 'Rest';

  const timerBtn = document.createElement('button');
  timerBtn.className = 'rest-timer-btn';
  timerBtn.textContent = '▶ Start';

  const restDisplay = document.createElement('span');
  restDisplay.className = 'rest-timer-display';
  restDisplay.textContent = set.rest ? formatRestTime(set.rest) : '';

  const restInput = document.createElement('input');
  restInput.className = 'rest-input';
  restInput.type = 'number';
  restInput.min = '0';
  restInput.placeholder = 'secs';
  restInput.value = set.rest || '';

  const restUnit = document.createElement('span');
  restUnit.className = 'rest-unit';
  restUnit.textContent = 's';

  restInput.addEventListener('change', function () {
    session.exercises[exIdx].sets[setIdx].rest = parseInt(this.value) || null;
    restDisplay.textContent = this.value ? formatRestTime(parseInt(this.value)) : '';
    saveSession(session);
    stopRestTimer(exIdx, setIdx);
  });

  timerBtn.addEventListener('click', () => {
    const key = `${exIdx}-${setIdx}`;
    if (activeRestTimers[key]) {
      // Stop and save
      const elapsed = Math.floor((Date.now() - activeRestTimers[key].startedAt) / 1000);
      stopRestTimer(exIdx, setIdx);
      restInput.value = elapsed;
      session.exercises[exIdx].sets[setIdx].rest = elapsed;
      restDisplay.textContent = formatRestTime(elapsed);
      saveSession(session);
      timerBtn.textContent = '▶ Start';
      timerBtn.classList.remove('running');
    } else {
      // Start
      startRestTimer(exIdx, setIdx, timerBtn, restDisplay);
    }
  });

  restInner.appendChild(restLabel);
  restInner.appendChild(timerBtn);
  restInner.appendChild(restDisplay);
  restInner.appendChild(restInput);
  restInner.appendChild(restUnit);
  restTd.appendChild(restInner);
  restRow.appendChild(restTd);
  fragment.appendChild(restRow);

  return fragment;
}

// ── Rest timer helpers ────────────────────────────────────────────────────────

function startRestTimer(exIdx, setIdx, timerBtn, displayEl) {
  const key = `${exIdx}-${setIdx}`;
  if (activeRestTimers[key]) return;
  const startedAt = Date.now();
  timerBtn.textContent = '⏹ 0s';
  timerBtn.classList.add('running');
  const intervalId = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startedAt) / 1000);
    const label = formatRestTime(elapsed);
    timerBtn.textContent = `⏹ ${label}`;
    if (displayEl) displayEl.textContent = '';
  }, 1000);
  activeRestTimers[key] = { intervalId, startedAt };
}

function stopRestTimer(exIdx, setIdx) {
  const key = `${exIdx}-${setIdx}`;
  if (activeRestTimers[key]) {
    clearInterval(activeRestTimers[key].intervalId);
    delete activeRestTimers[key];
  }
}

function formatRestTime(secs) {
  if (!secs && secs !== 0) return '';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
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
  if (templateAddingExercise) {
    templateEditExercises.push({ name, sets: [{ reps: '', weight: '' }] });
    closeModal();
    renderTemplateExerciseList();
    templateAddingExercise = false;
  } else if (editAddingExercise) {
    editExercises.push({ name, sets: [{ reps: '', weight: '' }] });
    closeModal();
    renderEditExerciseList();
    editAddingExercise = false;
  } else {
    session.exercises.push({ name, sets: [{ reps: '', weight: '', done: false }] });
    saveSession(session);
    closeModal();
    renderExerciseList();
  }
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

// ── Plans tab ────────────────────────────────────────────────────────────────

let templateAddingExercise = false;
let templateEditExercises = [];
let editingTemplateIdx = null;

function renderPlansTab() {
  const list = document.getElementById('templates-list');
  list.innerHTML = '';
  if (templates.length === 0) {
    list.innerHTML = '<p class="hint">No templates yet. Create one to pre-plan your workouts.</p>';
    return;
  }
  templates.forEach((t, idx) => {
    const card = document.createElement('div');
    card.className = 'template-card';
    const exNames = t.exercises.map(e => e.name).join(', ');
    const totalSets = t.exercises.reduce((acc, e) => acc + e.sets.length, 0);
    card.innerHTML = `
      <div class="template-card-info">
        <div class="template-card-name">${t.name}</div>
        <div class="template-card-meta">${t.exercises.length} exercise${t.exercises.length !== 1 ? 's' : ''} · ${totalSets} sets · ${exNames}</div>
      </div>
      <div class="template-card-actions"></div>
    `;
    const actions = card.querySelector('.template-card-actions');
    const editBtn = document.createElement('button');
    editBtn.className = 'btn-secondary';
    editBtn.style.fontSize = '13px';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => openTemplateEditor(idx));
    const delBtn = document.createElement('button');
    delBtn.className = 'delete-history-btn';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', () => {
      if (!confirm(`Delete "${t.name}"?`)) return;
      templates.splice(idx, 1);
      saveTemplates(templates);
      renderPlansTab();
    });
    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    list.appendChild(card);
  });
}

document.getElementById('new-template-btn').addEventListener('click', () => openTemplateEditor(null));

function openTemplateEditor(idx) {
  editingTemplateIdx = idx;
  const t = idx !== null ? templates[idx] : null;
  templateEditExercises = t ? JSON.parse(JSON.stringify(t.exercises)) : [];
  document.getElementById('template-modal-title').textContent = t ? 'Edit Template' : 'New Template';
  document.getElementById('template-name-input').value = t ? t.name : '';
  renderTemplateExerciseList();
  document.getElementById('template-modal-overlay').classList.remove('hidden');
}

function closeTemplateEditor() {
  document.getElementById('template-modal-overlay').classList.add('hidden');
  editingTemplateIdx = null;
  templateEditExercises = [];
}

function renderTemplateExerciseList() {
  const container = document.getElementById('template-exercise-list');
  container.innerHTML = '';
  templateEditExercises.forEach((ex, exIdx) => {
    container.appendChild(buildTemplateExerciseCard(ex, exIdx));
  });
}

function buildTemplateExerciseCard(ex, exIdx) {
  const card = document.createElement('div');
  card.className = 'exercise-card';

  const header = document.createElement('div');
  header.className = 'exercise-card-header';
  const title = document.createElement('h3');
  title.textContent = ex.name;
  const removeBtn = document.createElement('button');
  removeBtn.className = 'btn-ghost';
  removeBtn.textContent = 'Remove';
  removeBtn.addEventListener('click', () => {
    templateEditExercises.splice(exIdx, 1);
    renderTemplateExerciseList();
  });
  header.appendChild(title);
  header.appendChild(removeBtn);
  card.appendChild(header);

  const table = document.createElement('table');
  table.className = 'sets-table';
  table.innerHTML = `<thead><tr><th>Set</th><th>Weight (kg)</th><th>Reps</th><th></th></tr></thead>`;
  const tbody = document.createElement('tbody');

  ex.sets.forEach((set, setIdx) => {
    tbody.appendChild(buildTemplateSetRow(ex, exIdx, set, setIdx, tbody));
  });
  table.appendChild(tbody);
  card.appendChild(table);

  const footer = document.createElement('div');
  footer.className = 'exercise-card-footer';
  const addSetBtn = document.createElement('button');
  addSetBtn.className = 'btn-secondary';
  addSetBtn.textContent = '+ Add Set';
  addSetBtn.addEventListener('click', () => {
    const prev = ex.sets.at(-1);
    ex.sets.push({ weight: prev?.weight || '', reps: prev?.reps || '' });
    tbody.appendChild(buildTemplateSetRow(ex, exIdx, ex.sets.at(-1), ex.sets.length - 1, tbody));
  });
  footer.appendChild(addSetBtn);
  card.appendChild(footer);
  return card;
}

function buildTemplateSetRow(ex, exIdx, set, setIdx, tbody) {
  const tr = document.createElement('tr');
  tr.className = 'sets-row';

  const numTd = document.createElement('td');
  numTd.className = 'set-num';
  numTd.textContent = setIdx + 1;
  tr.appendChild(numTd);

  const weightTd = document.createElement('td');
  const weightInput = document.createElement('input');
  weightInput.type = 'number'; weightInput.min = '0'; weightInput.placeholder = '—';
  weightInput.value = set.weight || '';
  weightInput.addEventListener('change', () => { set.weight = weightInput.value; });
  weightTd.appendChild(weightInput);
  tr.appendChild(weightTd);

  const repsTd = document.createElement('td');
  const repsInput = document.createElement('input');
  repsInput.type = 'number'; repsInput.min = '0'; repsInput.placeholder = '—';
  repsInput.value = set.reps || '';
  repsInput.addEventListener('change', () => { set.reps = repsInput.value; });
  repsTd.appendChild(repsInput);
  tr.appendChild(repsTd);

  const delTd = document.createElement('td');
  delTd.className = 'done-cell';
  const delBtn = document.createElement('button');
  delBtn.className = 'btn-ghost';
  delBtn.style.fontSize = '16px';
  delBtn.textContent = '✕';
  delBtn.addEventListener('click', () => {
    ex.sets.splice(setIdx, 1);
    renderTemplateExerciseList();
  });
  delTd.appendChild(delBtn);
  tr.appendChild(delTd);

  return tr;
}

document.getElementById('template-add-exercise-btn').addEventListener('click', () => {
  templateAddingExercise = true;
  openModal();
});

document.getElementById('template-save-btn').addEventListener('click', () => {
  const name = document.getElementById('template-name-input').value.trim();
  if (!name) { document.getElementById('template-name-input').focus(); return; }
  const cleaned = templateEditExercises
    .map(ex => ({ name: ex.name, sets: ex.sets.filter(s => s.reps || s.weight) }))
    .filter(ex => ex.sets.length > 0);
  const t = { id: editingTemplateIdx !== null ? templates[editingTemplateIdx].id : Date.now(), name, exercises: cleaned };
  if (editingTemplateIdx !== null) templates[editingTemplateIdx] = t;
  else templates.push(t);
  saveTemplates(templates);
  closeTemplateEditor();
  renderPlansTab();
});

document.getElementById('template-cancel-btn').addEventListener('click', closeTemplateEditor);
document.getElementById('template-modal-close-btn').addEventListener('click', closeTemplateEditor);
document.getElementById('template-modal-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('template-modal-overlay')) closeTemplateEditor();
});

// Reset templateAddingExercise when modal cancelled
document.getElementById('modal-cancel-btn').addEventListener('click', () => { templateAddingExercise = false; });

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
      if (s.rest && i < ex.sets.length - 1) {
        const restRow = document.createElement('div');
        restRow.className = 'history-rest-row';
        restRow.innerHTML = `<span class="rest-icon">&#8635;</span> ${formatRestTime(s.rest)} rest`;
        setsDiv.appendChild(restRow);
      }
    });
    exDiv.appendChild(setsDiv);
    body.appendChild(exDiv);
  });

  const bodyActions = document.createElement('div');
  bodyActions.className = 'history-body-actions';

  const editBtn = document.createElement('button');
  editBtn.className = 'btn-secondary';
  editBtn.style.fontSize = '13px';
  editBtn.textContent = 'Edit';
  editBtn.addEventListener('click', () => openEditModal(idx));

  const delBtn = document.createElement('button');
  delBtn.className = 'delete-history-btn';
  delBtn.textContent = 'Delete';
  delBtn.addEventListener('click', () => {
    if (!confirm('Delete this workout?')) return;
    workouts.splice(idx, 1);
    saveWorkouts(workouts);
    renderHistory();
  });

  bodyActions.appendChild(editBtn);
  bodyActions.appendChild(delBtn);
  body.appendChild(bodyActions);
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

// Local date string 'YYYY-MM-DD' — avoids UTC-offset mismatches
function toLocalDateStr(d) {
  const date = d instanceof Date ? d : new Date(d);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Returns a Set of local date strings 'YYYY-MM-DD' that have a workout
function getWorkoutDaySet() {
  const days = new Set();
  workouts.forEach(w => days.add(toLocalDateStr(w.date)));
  return days;
}

function computeStreaks(workoutDays) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Current streak: walk back from today
  let current = 0;
  const d = new Date(today);
  // Allow today or yesterday to still count as "active"
  while (true) {
    const key = toLocalDateStr(d);
    if (workoutDays.has(key)) {
      current++;
      d.setDate(d.getDate() - 1);
    } else {
      // If today has no workout yet, try from yesterday
      if (current === 0 && d.getTime() === today.getTime()) {
        d.setDate(d.getDate() - 1);
        continue;
      }
      break;
    }
  }

  // Best streak: scan all days from first workout to today
  let best = 0, run = 0;
  if (workoutDays.size > 0) {
    const allDates = [...workoutDays].sort();
    const first = new Date(allDates[0]);
    const cursor = new Date(first);
    while (cursor <= today) {
      const key = toLocalDateStr(cursor);
      if (workoutDays.has(key)) { run++; best = Math.max(best, run); }
      else run = 0;
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  return { current, best };
}

function renderStreak() {
  const container = document.getElementById('streak-container');
  if (!container) return;
  container.innerHTML = '';

  const workoutDays = getWorkoutDaySet();

  if (workoutDays.size === 0) {
    container.innerHTML = '<p class="hint" style="padding:16px 0">Log your first workout to start a streak.</p>';
    return;
  }

  const { current, best } = computeStreaks(workoutDays);

  // Streak counters
  const counters = document.createElement('div');
  counters.className = 'streak-counters';
  counters.innerHTML = `
    <div class="streak-card">
      <div class="streak-value">${current}<span class="streak-flame">🔥</span></div>
      <div class="streak-label">Current Streak</div>
    </div>
    <div class="streak-card">
      <div class="streak-value">${best}<span class="streak-flame">🏆</span></div>
      <div class="streak-label">Best Streak</div>
    </div>
  `;
  container.appendChild(counters);

  // 30-day calendar grid
  const gridWrap = document.createElement('div');
  gridWrap.className = 'chart-wrap';
  gridWrap.innerHTML = '<h4>Last 30 Days</h4>';

  const grid = document.createElement('div');
  grid.className = 'streak-grid';

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Day-of-week headers
  ['Su','Mo','Tu','We','Th','Fr','Sa'].forEach(d => {
    const label = document.createElement('div');
    label.className = 'streak-day-header';
    label.textContent = d;
    grid.appendChild(label);
  });

  // Pad empty cells before the first day
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - 29);
  const firstDow = startDate.getDay(); // 0=Sun
  for (let i = 0; i < firstDow; i++) {
    const empty = document.createElement('div');
    empty.className = 'streak-cell empty';
    grid.appendChild(empty);
  }

  // 30 day cells
  for (let i = 0; i < 30; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    const key = toLocalDateStr(d);
    const isToday = d.getTime() === today.getTime();
    const isFuture = d > today;
    const hasWorkout = workoutDays.has(key);

    const cell = document.createElement('div');
    cell.className = 'streak-cell' + (isToday ? ' today' : '');
    cell.title = key;

    if (isFuture) {
      cell.classList.add('future');
      cell.textContent = '';
    } else if (hasWorkout) {
      cell.classList.add('hit');
      cell.textContent = '⭐';
    } else {
      cell.classList.add('miss');
      cell.textContent = '💀';
    }

    grid.appendChild(cell);
  }

  gridWrap.appendChild(grid);
  container.appendChild(gridWrap);
}

function renderStats() {
  renderStreak();

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
  grad.addColorStop(0, color.replace(')', ', 0.25)').replace('var(--accent)', 'rgba(56,189,248').replace('var(--green)', 'rgba(62,207,142'));
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
  ctx.strokeStyle = color.replace('var(--accent)', '#38bdf8').replace('var(--green)', '#3ecf8e');
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  data.forEach((d, i) => i === 0 ? ctx.moveTo(toX(i), toY(d.y)) : ctx.lineTo(toX(i), toY(d.y)));
  ctx.stroke();

  // Dots
  data.forEach((d, i) => {
    ctx.beginPath();
    ctx.arc(toX(i), toY(d.y), 4, 0, Math.PI * 2);
    ctx.fillStyle = color.replace('var(--accent)', '#38bdf8').replace('var(--green)', '#3ecf8e');
    ctx.fill();
    ctx.strokeStyle = '#07090f';
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  return wrap;
}

// ── Edit workout modal ────────────────────────────────────────────────────────

let editingIdx = null;
let editExercises = [];
let editSelectedType = null;

function openEditModal(idx) {
  const workout = workouts[idx];
  editingIdx = idx;
  editExercises = JSON.parse(JSON.stringify(workout.exercises)); // deep copy
  editSelectedType = workout.workoutType || null;

  // Date
  const dateInput = document.getElementById('edit-date-input');
  dateInput.value = new Date(workout.date).toISOString().slice(0, 10);
  dateInput.max = new Date().toISOString().slice(0, 10);

  // Duration
  const secs = workout.duration || 0;
  document.getElementById('edit-hours-input').value = secs ? Math.floor(secs / 3600) || '' : '';
  document.getElementById('edit-mins-input').value = secs ? Math.floor((secs % 3600) / 60) || '' : '';

  // Type chips
  refreshEditTypeChips();

  // Exercises
  renderEditExerciseList();

  document.getElementById('edit-modal-overlay').classList.remove('hidden');
}

function closeEditModal() {
  document.getElementById('edit-modal-overlay').classList.add('hidden');
  editingIdx = null;
  editExercises = [];
  editSelectedType = null;
}

function refreshEditTypeChips() {
  document.querySelectorAll('.edit-type-chip').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.type === editSelectedType);
  });
}

document.querySelectorAll('.edit-type-chip').forEach(btn => {
  btn.addEventListener('click', () => {
    editSelectedType = editSelectedType === btn.dataset.type ? null : btn.dataset.type;
    refreshEditTypeChips();
  });
});

function renderEditExerciseList() {
  const container = document.getElementById('edit-exercise-list');
  container.innerHTML = '';
  editExercises.forEach((ex, exIdx) => {
    container.appendChild(buildEditExerciseCard(ex, exIdx));
  });
}

function buildEditExerciseCard(ex, exIdx) {
  const card = document.createElement('div');
  card.className = 'exercise-card';

  const header = document.createElement('div');
  header.className = 'exercise-card-header';
  const title = document.createElement('h3');
  title.textContent = ex.name;
  const removeBtn = document.createElement('button');
  removeBtn.className = 'btn-ghost';
  removeBtn.textContent = 'Remove';
  removeBtn.addEventListener('click', () => {
    editExercises.splice(exIdx, 1);
    renderEditExerciseList();
  });
  header.appendChild(title);
  header.appendChild(removeBtn);
  card.appendChild(header);

  const table = document.createElement('table');
  table.className = 'sets-table';
  table.innerHTML = `<thead><tr><th>Set</th><th>Weight (kg)</th><th>Reps</th><th></th></tr></thead>`;
  const tbody = document.createElement('tbody');

  ex.sets.forEach((set, setIdx) => {
    tbody.appendChild(buildEditSetRow(ex, exIdx, set, setIdx, tbody));
  });
  table.appendChild(tbody);
  card.appendChild(table);

  const footer = document.createElement('div');
  footer.className = 'exercise-card-footer';
  const addSetBtn = document.createElement('button');
  addSetBtn.className = 'btn-secondary';
  addSetBtn.textContent = '+ Add Set';
  addSetBtn.addEventListener('click', () => {
    const prev = ex.sets.at(-1);
    ex.sets.push({ reps: prev?.reps || '', weight: prev?.weight || '' });
    tbody.appendChild(buildEditSetRow(ex, exIdx, ex.sets.at(-1), ex.sets.length - 1, tbody));
  });
  footer.appendChild(addSetBtn);
  card.appendChild(footer);

  return card;
}

function buildEditSetRow(ex, exIdx, set, setIdx, tbody) {
  const tr = document.createElement('tr');
  tr.className = 'sets-row';

  const numTd = document.createElement('td');
  numTd.className = 'set-num';
  numTd.textContent = setIdx + 1;
  tr.appendChild(numTd);

  const weightTd = document.createElement('td');
  const weightInput = document.createElement('input');
  weightInput.type = 'number';
  weightInput.min = '0';
  weightInput.placeholder = '—';
  weightInput.value = set.weight || '';
  weightInput.addEventListener('change', () => { set.weight = weightInput.value; });
  weightTd.appendChild(weightInput);
  tr.appendChild(weightTd);

  const repsTd = document.createElement('td');
  const repsInput = document.createElement('input');
  repsInput.type = 'number';
  repsInput.min = '0';
  repsInput.placeholder = '—';
  repsInput.value = set.reps || '';
  repsInput.addEventListener('change', () => { set.reps = repsInput.value; });
  repsTd.appendChild(repsInput);
  tr.appendChild(repsTd);

  const delTd = document.createElement('td');
  delTd.className = 'done-cell';
  const delBtn = document.createElement('button');
  delBtn.className = 'btn-ghost';
  delBtn.style.fontSize = '16px';
  delBtn.textContent = '✕';
  delBtn.addEventListener('click', () => {
    ex.sets.splice(setIdx, 1);
    // Re-render the whole exercise card to fix set numbers
    renderEditExerciseList();
  });
  delTd.appendChild(delBtn);
  tr.appendChild(delTd);

  return tr;
}

// Add exercise to edit modal (reuses the existing exercise name modal)
let editAddingExercise = false;

document.getElementById('edit-add-exercise-btn').addEventListener('click', () => {
  editAddingExercise = true;
  openModal();
});

// Reset flag when modal is cancelled
document.getElementById('modal-cancel-btn').addEventListener('click', () => { editAddingExercise = false; });

// Save edit
document.getElementById('edit-save-btn').addEventListener('click', () => {
  if (editingIdx === null) return;

  const d = document.getElementById('edit-date-input').value;
  const date = d ? new Date(d + 'T12:00:00').toISOString() : workouts[editingIdx].date;

  const h = parseInt(document.getElementById('edit-hours-input').value) || 0;
  const m = parseInt(document.getElementById('edit-mins-input').value) || 0;
  const duration = (h * 3600 + m * 60) || null;

  const cleaned = editExercises
    .map(ex => ({ name: ex.name, sets: ex.sets.filter(s => s.reps || s.weight) }))
    .filter(ex => ex.sets.length > 0);

  workouts[editingIdx] = {
    ...workouts[editingIdx],
    date,
    duration,
    workoutType: editSelectedType,
    exercises: cleaned.length > 0 ? cleaned : workouts[editingIdx].exercises
  };

  saveWorkouts(workouts);
  closeEditModal();
  renderHistory();
});

document.getElementById('edit-cancel-btn').addEventListener('click', closeEditModal);
document.getElementById('edit-modal-close-btn').addEventListener('click', closeEditModal);
document.getElementById('edit-modal-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('edit-modal-overlay')) closeEditModal();
});

// ── Export / Import ───────────────────────────────────────────────────────────

document.getElementById('export-btn').addEventListener('click', () => {
  const data = {
    exportedAt: new Date().toISOString(),
    version: 1,
    workouts
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const date = toLocalDateStr(new Date());
  a.href = url;
  a.download = `workouts-backup-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('import-input').addEventListener('change', function () {
  const file = this.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const parsed = JSON.parse(e.target.result);
      const imported = parsed.workouts || parsed; // support both wrapped and raw array
      if (!Array.isArray(imported)) throw new Error('Invalid format');

      const choice = confirm(
        `Found ${imported.length} workout(s) in this backup.\n\nOK = Replace all current data\nCancel = Merge with existing data`
      );

      if (choice) {
        workouts = imported;
      } else {
        // Merge: add workouts not already present (matched by id)
        const existingIds = new Set(workouts.map(w => w.id));
        const newOnes = imported.filter(w => !existingIds.has(w.id));
        workouts = [...workouts, ...newOnes].sort(
          (a, b) => new Date(b.date) - new Date(a.date)
        );
      }

      saveWorkouts(workouts);
      renderHistory();
      alert(`Import complete. You now have ${workouts.length} workout(s).`);
    } catch {
      alert('Could not read that file. Make sure it\'s a valid workout backup.');
    }
    this.value = ''; // reset so same file can be imported again
  };
  reader.readAsText(file);
});

// ── Init ──────────────────────────────────────────────────────────────────────

renderLogTab();
if (session) startTimer();
