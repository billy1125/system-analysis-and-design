// UI-11 my appointments (FR-19, FR-20, FR-23)

const form = document.getElementById('appt-form');
let rows = [];
let editingId = null; // null means the form adds a new appointment
let todayDate = localDate();

function resetForm() {
  editingId = null;
  form.reset();
  form.visit_date.value = todayDate;
  document.getElementById('form-title').textContent = '新增預約';
  document.getElementById('submit').textContent = '新增';
  document.getElementById('cancel-edit').hidden = true;
}

async function load() {
  const data = await api('GET', '/api/my/appointments');
  rows = data.rows;
  todayDate = data.today;
  if (!form.purpose.options.length) {
    form.purpose.innerHTML = optionTags(data.purposes.map((p) => ({ value: p, label: p })), '', '請選擇');
    resetForm();
  }
  const tbody = document.getElementById('rows');
  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty">還沒有預約</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map((a) => `
    <tr>
      <td>${esc(a.visit_date)}</td>
      <td>${esc(a.expected_time)}</td>
      <td>${esc(a.visitor_name)}</td>
      <td>${esc(a.visitor_company)}</td>
      <td>${esc(a.visitor_phone)}</td>
      <td>${esc(a.purpose)}</td>
      <td>${esc(a.note)}</td>
      <td>${a.status_label === '未到' ? `<span class="warn">${a.status_label}</span>` : esc(a.status_label)}</td>
      <td>${a.editable ? `
        <button class="small" data-action="edit" data-id="${a.id}">修改</button>
        <button class="small secondary" data-action="cancel" data-id="${a.id}">取消</button>` : ''}
      </td>
    </tr>`).join('');
}

document.getElementById('rows').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const a = rows.find((r) => r.id === Number(btn.dataset.id));
  clearMessage();
  if (btn.dataset.action === 'edit') {
    editingId = a.id;
    for (const name of ['visitor_name', 'visitor_company', 'visitor_phone', 'visit_date', 'expected_time', 'purpose']) {
      form[name].value = a[name];
    }
    form.note.value = a.note || '';
    document.getElementById('form-title').textContent = `修改預約 #${a.id}`;
    document.getElementById('submit').textContent = '儲存';
    document.getElementById('cancel-edit').hidden = false;
    return;
  }
  if (!confirm(`確定取消 ${a.visit_date} ${a.visitor_name} 的預約？`)) return;
  try {
    const { message } = await api('POST', `/api/my/appointments/${a.id}/cancel`);
    showMessage(message, 'ok');
    if (editingId === a.id) resetForm();
    load();
  } catch (err) {
    showMessage(err.message, 'error');
  }
});

document.getElementById('cancel-edit').addEventListener('click', resetForm);

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = {};
  for (const name of ['visitor_name', 'visitor_company', 'visitor_phone', 'visit_date', 'expected_time', 'purpose', 'note']) {
    body[name] = form[name].value;
  }
  try {
    const { message } = editingId
      ? await api('PUT', `/api/my/appointments/${editingId}`, body)
      : await api('POST', '/api/my/appointments', body);
    showMessage(message, 'ok');
    resetForm();
    load();
  } catch (err) {
    showMessage(err.message, 'error');
  }
});

initPage({ roles: [ROLE_EMPLOYEE] }).then(load).catch((err) => showMessage(err.message, 'error'));
