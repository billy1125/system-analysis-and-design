// UI-05 session detail, roster and results (FR-SES-03..05, FR-RES-01..03)

const sessionId = new URLSearchParams(location.search).get('id');
const form = document.getElementById('session-form');
let data = null;
let editing = false;

function field(label, value) {
  return `<dt>${label}</dt><dd>${value}</dd>`;
}

function input(name, value, attrs = '') {
  return `<input name="${name}" value="${esc(value)}" ${attrs}>`;
}

function renderDetail() {
  const s = data.session;
  const v = (name, attrs, shown) => (editing ? input(name, s[name], attrs) : esc(shown ?? s[name]));
  document.getElementById('detail').innerHTML = [
    field('課程', esc(`${s.course_no} ${s.course_name}（${hoursText(s.hours)} 小時）`)),
    field('梯次狀態', badge(s.display_status)),
    field('上課日期', v('session_date', 'type="date"')),
    field('時間', editing
      ? `${input('start_time', s.start_time, 'type="time"')} – ${input('end_time', s.end_time, 'type="time"')}`
      : esc(`${s.start_time}–${s.end_time}`)),
    field('地點', v('location', 'maxlength="30"')),
    field('講師', v('instructor', 'maxlength="30"')),
    field('人數上限', v('capacity', 'type="number" min="1" max="100"', `${s.capacity}（已報名 ${s.enrolled}）`)),
    field('建立人', esc(s.created_by_name)),
  ].join('');

  const actions = document.getElementById('actions');
  if (!data.can.edit) {
    actions.innerHTML = '';
  } else if (editing) {
    actions.innerHTML = '<button type="submit">儲存</button><button type="button" class="secondary" id="cancel-edit">取消</button>';
    document.getElementById('cancel-edit').addEventListener('click', () => { editing = false; renderDetail(); });
  } else {
    const toggle = s.status === '開放報名'
      ? '<button type="button" class="secondary" data-status="截止報名">截止報名</button>'
      : '<button type="button" class="secondary" data-status="開放報名">重新開放報名</button>';
    actions.innerHTML = `<button type="button" id="edit">修改</button>${toggle}
      <button type="button" class="secondary" data-status="已取消">取消梯次</button>`;
    document.getElementById('edit').addEventListener('click', () => { editing = true; renderDetail(); });
  }
}

function resultCell(r) {
  if (!data.can.record) return badge(r.result);
  const options = r.result === '已報名' ? ['', '已完成', '未完成'] : ['已完成', '未完成'];
  const selected = r.result === '已報名' ? '' : r.result;
  return `<select data-result="${r.id}">${options
    .map((o) => `<option value="${o}"${o === selected ? ' selected' : ''}>${o || '請選擇'}</option>`).join('')}</select>`;
}

function renderRoster() {
  const { roster, can } = data;
  document.getElementById('enroll-box').hidden = !can.enroll;
  document.getElementById('result-box').hidden = !can.record || roster.length === 0;
  document.getElementById('op-head').hidden = !can.remove;
  document.getElementById('enroll-employee').innerHTML = optionTags(
    data.employees.map((e) => ({ value: e.id, label: `${e.emp_no} ${e.name}（${e.department}）` })), '', '請選擇員工');

  const tbody = document.getElementById('rows');
  if (roster.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${can.remove ? 10 : 9}" class="empty">目前沒有人報名</td></tr>`;
    return;
  }
  tbody.innerHTML = roster.map((r) => `
    <tr>
      <td>${esc(r.emp_no)}</td>
      <td>${esc(r.name)}</td>
      <td>${esc(r.department)}</td>
      <td>${esc(shortTime(r.enrolled_at))}</td>
      <td>${r.by_self ? '自行報名' : '人資代報'}</td>
      <td>${resultCell(r)}</td>
      <td>${can.record ? `<input data-note="${r.id}" maxlength="100" value="${esc(r.note)}">` : esc(r.note)}</td>
      <td>${esc(r.result_by_name)}</td>
      <td>${esc(shortTime(r.result_at))}</td>
      ${can.remove ? `<td><button class="small secondary" data-remove="${r.id}" data-name="${esc(r.name)}">移除</button></td>` : ''}
    </tr>`).join('');
}

async function load() {
  data = await api('GET', '/api/sessions/' + encodeURIComponent(sessionId));
  renderDetail();
  renderRoster();
}

// Run an API call, show its message, then reload the page data
async function act(method, url, body) {
  try {
    const { message } = await api(method, url, body);
    editing = false;
    await load();
    showMessage(message, 'ok');
  } catch (err) {
    showMessage(err.message, 'error');
  }
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  act('PUT', '/api/sessions/' + sessionId, {
    session_date: form.session_date.value,
    start_time: form.start_time.value,
    end_time: form.end_time.value,
    location: form.location.value,
    instructor: form.instructor.value,
    capacity: form.capacity.value,
  });
});

document.getElementById('actions').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-status]');
  if (!btn) return;
  if (btn.dataset.status === '已取消' && !confirm('取消後無法復原，確定取消這個梯次？')) return;
  act('PUT', `/api/sessions/${sessionId}/status`, { status: btn.dataset.status });
});

document.getElementById('enroll-btn').addEventListener('click', () => {
  act('POST', `/api/sessions/${sessionId}/enrollments`, { employee_id: document.getElementById('enroll-employee').value });
});

document.getElementById('rows').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-remove]');
  if (!btn) return;
  if (!confirm(`確定移除 ${btn.dataset.name} 的報名？`)) return;
  act('DELETE', `/api/sessions/${sessionId}/enrollments/${btn.dataset.remove}`);
});

document.getElementById('save-results').addEventListener('click', () => {
  const rows = data.roster.map((r) => ({
    id: r.id,
    result: document.querySelector(`[data-result="${r.id}"]`).value,
    note: document.querySelector(`[data-note="${r.id}"]`).value,
  }));
  act('PUT', `/api/sessions/${sessionId}/results`, { rows });
});

initPage({ hrOnly: true }).then(load).catch((err) => showMessage(err.message, 'error'));
