// UI-06 training record search by employee and by course (FR-QRY-01, 02)

const empForm = document.getElementById('emp-form');
const courseSelect = document.getElementById('course-select');

// Same row format as UI-03
function recordRows(rows) {
  if (rows.length === 0) return '<tr><td colspan="7" class="empty">還沒有訓練紀錄</td></tr>';
  return rows.map((r) => `
    <tr>
      <td>${esc(r.session_date)}</td>
      <td>${esc(r.course_name)}</td>
      <td>${esc(r.category)}</td>
      <td>${hoursText(r.hours)}</td>
      <td>${badge(r.display_status)}</td>
      <td>${badge(r.result)}</td>
      <td>${esc(r.note)}</td>
    </tr>`).join('');
}

document.querySelector('.tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-tab]');
  if (!btn) return;
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b === btn));
  document.getElementById('by-employee').hidden = btn.dataset.tab !== 'by-employee';
  document.getElementById('by-course').hidden = btn.dataset.tab !== 'by-course';
  clearMessage();
});

empForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  document.getElementById('emp-result').hidden = true;
  try {
    const { rows, message } = await api('GET', '/api/records/employees?q=' + encodeURIComponent(empForm.q.value));
    if (message) showMessage(message, 'error');
    else clearMessage();
    document.getElementById('emp-matches').innerHTML = rows.length === 0 ? '' : `
      <table>
        <thead><tr><th>員工編號</th><th>姓名</th><th>部門</th><th>職稱</th><th>在職狀態</th></tr></thead>
        <tbody>${rows.map((r) => `
          <tr class="clickable" data-id="${r.id}">
            <td>${esc(r.emp_no)}</td><td>${esc(r.name)}</td><td>${esc(r.department)}</td>
            <td>${esc(r.job_title)}</td><td>${r.is_active ? '在職' : '<span class="muted">離職</span>'}</td>
          </tr>`).join('')}</tbody>
      </table>`;
  } catch (err) {
    showMessage(err.message, 'error');
  }
});

document.getElementById('emp-matches').addEventListener('click', async (e) => {
  const tr = e.target.closest('tr[data-id]');
  if (!tr) return;
  try {
    const { employee: p, rows, total_hours: total } = await api('GET', '/api/records/employees/' + tr.dataset.id);
    document.getElementById('emp-summary').innerHTML =
      `${esc(p.name)}（${esc(p.emp_no)}，${esc(p.department)} ${esc(p.job_title)}）累計完成時數 <strong>${hoursText(total)}</strong> 小時`;
    document.getElementById('emp-rows').innerHTML = recordRows(rows);
    document.getElementById('emp-result').hidden = false;
  } catch (err) {
    showMessage(err.message, 'error');
  }
});

courseSelect.addEventListener('change', async () => {
  const tbody = document.getElementById('course-rows');
  if (!courseSelect.value) {
    tbody.innerHTML = '';
    return;
  }
  try {
    const { rows } = await api('GET', '/api/records/courses/' + courseSelect.value);
    tbody.innerHTML = rows.length === 0
      ? '<tr><td colspan="6" class="empty">還沒有人完成這門課</td></tr>'
      : rows.map((r) => `
        <tr>
          <td>${esc(r.emp_no)}</td><td>${esc(r.name)}</td><td>${esc(r.department)}</td><td>${esc(r.job_title)}</td>
          <td>${r.is_active ? '在職' : '<span class="muted">離職</span>'}</td><td>${esc(r.completed_on)}</td>
        </tr>`).join('');
  } catch (err) {
    showMessage(err.message, 'error');
  }
});

async function load() {
  const { rows } = await api('GET', '/api/records/courses');
  courseSelect.innerHTML = optionTags(
    rows.map((c) => ({ value: c.id, label: `${c.course_no} ${c.name}${c.is_active ? '' : '（停用）'}` })), '', '請選擇課程');
}

initPage({ hrOnly: true }).then(load).catch((err) => showMessage(err.message, 'error'));
