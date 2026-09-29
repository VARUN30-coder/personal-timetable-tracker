// ---------- helpers ----------
const $ = s => document.querySelector(s);
const dlg = $('#dlg');
const api = (url, method = 'GET', body) =>
  fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) }).then(r => r.json());
const iso = d => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const addDays = (s, n) => { const d = new Date(s + 'T00:00'); d.setDate(d.getDate() + n); return iso(d); };
const weekStart = s => addDays(s, -((new Date(s + 'T00:00').getDay() + 6) % 7));
const t12 = t => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
const mins = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const hours = t => Math.max(0, mins(t.end) - mins(t.start)) / 60;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ICON = { done: '✓ Done', missed: '✗ Not Done', pending: '○ Pending' };
const DEFAULT_CATS = ['College', 'DSA', 'LeetCode', 'Java', 'DBMS', 'AI/ML', 'Project', 'Exercise', 'Personal', 'Other'];
const STUDY = ['College', 'DSA', 'LeetCode', 'Java', 'DBMS', 'AI/ML'], CODING = ['DSA', 'LeetCode', 'Java'];
const DAYNAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const TODAY = iso(new Date());
let S = { date: TODAY, view: 'day', week: {}, goals: [] };

// ---------- load & render ----------
async function load() {
  const ws = weekStart(S.date);
  S.week = await api(`/api/range?start=${ws}&end=${addDays(ws, 6)}`);
  S.goals = await api('/api/goals?date=' + S.date);
  render();
}
async function loadNotes() { $('#notes').value = (await api('/api/review/' + S.date)).notes; }

const count = list => {
  const done = list.filter(t => t.status === 'done').length, missed = list.filter(t => t.status === 'missed').length;
  return { done, missed, total: list.length, pct: list.length ? Math.round(done / list.length * 100) : 0 };
};
const t42 = t => `${t12(t.start)} - ${t12(t.end)}`;

function render() {
  const day = S.week[S.date] || [], c = count(day);
  $('#dateTitle').textContent = new Date(S.date + 'T00:00').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  $('#datePick').value = S.date;
  $('#tToday').classList.toggle('on', S.view === 'day' && S.date === TODAY);
  $('#tTomorrow').classList.toggle('on', S.view === 'day' && S.date === addDays(TODAY, 1));
  $('#tWeek').classList.toggle('on', S.view === 'week');
  $('#dayView').classList.toggle('hidden', S.view === 'week');
  $('#weekView').classList.toggle('hidden', S.view !== 'week');

  // progress
  $('#pct').textContent = c.pct + '%';
  $('#barFill').style.width = c.pct + '%';
  $('#summary').textContent = `${c.done} / ${c.total} completed · ${c.missed} missed · ${c.total - c.done - c.missed} pending`;

  // day table
  $('#rows').innerHTML = day.length ? day.map(t => `
    <tr><td>${t42(t)}</td>
    <td><b>${esc(t.name)}</b>${t.repeat !== 'none' ? ' 🔁' : ''}<div class="muted">${esc(t.notes)}</div></td>
    <td>${esc(t.category)}</td><td><span class="badge">${t.priority}</span></td>
    <td class="st ${t.status}">${ICON[t.status]}</td>
    <td><button class="mini g ${t.status === 'done' ? 'on' : ''}" onclick="setStatus(${t.id},'done','${t.status}')">✓</button>
        <button class="mini r ${t.status === 'missed' ? 'on' : ''}" onclick="setStatus(${t.id},'missed','${t.status}')">✗</button>
        <button class="mini" onclick="openForm(${t.id})">Edit</button></td></tr>`).join('')
    : '<tr><td colspan="6" class="muted">No tasks for this day. Click "+ Quick Add Task".</td></tr>';

  // week view
  const ws = weekStart(S.date);
  $('#weekView').innerHTML = DAYNAMES.map((n, i) => {
    const d = addDays(ws, i), l = S.week[d] || [];
    return `<div class="day ${d === S.date ? 'sel' : ''}" onclick="goDay('${d}')"><h3>${n} ${d.slice(8)} · ${count(l).pct}%</h3>
      ${l.map(t => `<div>${ICON[t.status][0]} ${t12(t.start)} ${esc(t.name)}</div>`).join('') || '<div class="muted">Free</div>'}</div>`;
  }).join('');

  renderStats(ws); renderGoals(); renderReview(day, c);
  const custom = new Set(DEFAULT_CATS);
  Object.values(S.week).flat().forEach(t => custom.add(t.category));
  $('#cats').innerHTML = [...custom].map(x => `<option value="${esc(x)}">`).join('');
}

function renderStats(ws) {
  const all = Object.values(S.week).flat(), c = count(all), c1 = count(S.week[S.date] || []);
  const done = all.filter(t => t.status === 'done');
  const h = f => done.filter(t => f.includes(t.category)).reduce((a, t) => a + hours(t), 0);
  const rows = [['Study', h(STUDY)], ['Coding', h(CODING)], ['Project', h(['Project'])]];
  const max = Math.max(1, ...rows.map(r => r[1]));
  $('#stats').innerHTML = `
    <p>Day: <b>${c1.pct}%</b> · Week: <b>${c.pct}%</b></p>
    <p>✓ ${c.done} completed · ✗ ${c.missed} missed</p>
    ${rows.map(([n, v]) => `<div class="hbar"><span style="width:60px">${n}</span><i style="width:${v / max * 60}%"></i>${v.toFixed(1)}h</div>`).join('')}
    <div class="chart">${DAYNAMES.map((n, i) => { const p = count(S.week[addDays(ws, i)] || []).pct;
      return `<span style="height:${Math.max(p, 4)}%" title="${n} ${p}%">${n}</span>`; }).join('')}</div>`;
}

function renderGoals() {
  const done = S.goals.filter(g => g.done).length;
  $('#goals').innerHTML = `<p class="muted">Today's goals: ${done}/${S.goals.length} complete</p>` +
    S.goals.map(g => `<div class="goal"><input type="checkbox" ${g.done ? 'checked' : ''} onchange="toggleGoal(${g.id})">
      <span>${esc(g.text)}</span><button class="mini" onclick="delGoal(${g.id})">🗑</button></div>`).join('');
}

function renderReview(day, c) {
  const list = arr => arr.length ? arr.map(t => esc(t.name)).join(', ') : '—';
  const prod = day.filter(t => t.status === 'done').reduce((a, t) => a + hours(t), 0);
  $('#review').innerHTML = `<p>✓ <b>Completed:</b> ${list(day.filter(t => t.status === 'done'))}</p>
    <p>✗ <b>Missed:</b> ${list(day.filter(t => t.status === 'missed'))}</p>
    <p><b>Productive hours:</b> ${prod.toFixed(1)}h · <b>Completion:</b> ${c.pct}%</p>`;
}

// ---------- actions ----------
async function setStatus(id, status, current) {
  await api('/api/status', 'POST', { task_id: id, date: S.date, status: current === status ? 'pending' : status });
  load();
}
function goDay(d) { S.date = d; S.view = 'day'; load(); loadNotes(); }
$('#tToday').onclick = () => goDay(TODAY);
$('#tTomorrow').onclick = () => goDay(addDays(TODAY, 1));
$('#tWeek').onclick = () => { S.view = 'week'; render(); };
$('#datePick').onchange = e => e.target.value && goDay(e.target.value);
$('#notes').onchange = e => api('/api/review/' + S.date, 'POST', { notes: e.target.value });

async function addGoal() {
  const v = $('#goalIn').value.trim(); if (!v) return;
  await api('/api/goals', 'POST', { text: v }); $('#goalIn').value = ''; load();
}
const toggleGoal = async id => { await api('/api/goals/toggle', 'POST', { id, date: S.date }); load(); };
const delGoal = async id => { await api('/api/goals/' + id, 'DELETE'); load(); };

// ---------- task form ----------
let editing = null;
$('#fDays').innerHTML = DAYNAMES.map((n, i) => `<label><input type="checkbox" value="${i}" style="width:auto"> ${n}</label>`).join('');
$('#fRep').onchange = () => $('#fDays').classList.toggle('hidden', $('#fRep').value !== 'custom');

function openForm(id) {
  const t = id ? Object.values(S.week).flat().find(x => x.id === id) : null;
  editing = t ? t.id : null;
  $('#dlgTitle').textContent = t ? 'Edit task' : 'Add task';
  $('#delBtn').classList.toggle('hidden', !t);
  $('#fName').value = t?.name || ''; $('#fNotes').value = t?.notes || '';
  $('#fStart').value = t?.start || '09:00'; $('#fEnd').value = t?.end || '10:00';
  $('#fCat').value = t?.category || 'Other'; $('#fPri').value = t?.priority || 'Medium';
  $('#fDate').value = t?.date || S.date; $('#fRep').value = t?.repeat || 'none';
  const days = (t?.days || '').split(',');
  document.querySelectorAll('#fDays input').forEach(i => i.checked = days.includes(i.value));
  $('#fRep').onchange();
  dlg.showModal();
}
$('#form').onsubmit = async () => {
  const body = { name: $('#fName').value, notes: $('#fNotes').value, start: $('#fStart').value, end: $('#fEnd').value,
    category: $('#fCat').value || 'Other', priority: $('#fPri').value, date: $('#fDate').value, repeat: $('#fRep').value,
    days: [...document.querySelectorAll('#fDays input:checked')].map(i => i.value).join(',') };
  await (editing ? api('/api/tasks/' + editing, 'PUT', body) : api('/api/tasks', 'POST', body));
  load();
};
$('#delBtn').onclick = async () => {
  if (confirm('Delete this task (and all its repeats)?')) { await api('/api/tasks/' + editing, 'DELETE'); dlg.close(); load(); }
};

// ---------- theme, clock ----------
const setTheme = t => { document.documentElement.dataset.theme = t; localStorage.setItem('theme', t); };
setTheme(localStorage.getItem('theme') || 'light');
$('#themeBtn').onclick = () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
setInterval(() => $('#clock').textContent = new Date().toLocaleTimeString(), 1000);
$('#clock').textContent = new Date().toLocaleTimeString();

load(); loadNotes();