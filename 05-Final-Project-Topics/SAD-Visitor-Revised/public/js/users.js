// UI-09 account management (FR-ADM-03, FR-ADM-04, FR-18 revised)

const form = document.getElementById('user-form');
const STAFF_ROLES = [{ value: 0, label: '管理員' }, { value: 1, label: '接待員' }];
let rows = [];

function roleCell(u) {
  // Host employee accounts do not switch with other roles
  if (u.role === ROLE_EMPLOYEE) return ROLE_LABELS[u.role];
  return `<select data-id="${u.id}" class="role">${optionTags(STAFF_ROLES, u.role)}</select>`;
}

function bindingCell(u) {
  if (!u.employee_id) return '<span class="muted">—</span>';
  const left = u.employee_active ? '' : ' <span class="warn">（已離職）</span>';
  return `${esc(u.emp_no)} ${esc(u.employee_name)}${left}`;
}

async function load() {
  const data = await api('GET', '/api/admin/users');
  rows = data.rows;
  form.employee_id.innerHTML = optionTags(
    data.bindable.map((e) => ({ value: e.id, label: `${e.emp_no} ${e.name}（${e.department}）` })), '', '請選擇');
  document.getElementById('rows').innerHTML = rows.map((u) => `
    <tr>
      <td>${esc(u.username)}</td>
      <td>${esc(u.name)}</td>
      <td>${roleCell(u)}</td>
      <td>${bindingCell(u)}</td>
      <td>${u.is_active ? '啟用' : '<span class="muted">停用</span>'}</td>
      <td>${esc(u.created_at)}</td>
      <td><button class="small secondary" data-id="${u.id}">${u.is_active ? '停用' : '啟用'}</button></td>
    </tr>`).join('');
}

async function update(id, body) {
  try {
    const { message } = await api('PUT', `/api/admin/users/${id}`, body);
    showMessage(message, 'ok');
  } catch (err) {
    showMessage(err.message, 'error');
  }
  load();
}

document.getElementById('rows').addEventListener('change', (e) => {
  if (e.target.matches('select.role')) update(e.target.dataset.id, { role: Number(e.target.value) });
});

document.getElementById('rows').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-id]');
  if (!btn) return;
  const u = rows.find((r) => r.id === Number(btn.dataset.id));
  update(u.id, { is_active: u.is_active ? 0 : 1 });
});

// Show the employee binding only for host employee accounts
form.role.addEventListener('change', () => {
  document.getElementById('bind-label').hidden = Number(form.role.value) !== ROLE_EMPLOYEE;
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const { message } = await api('POST', '/api/admin/users', {
      username: form.username.value,
      password: form.password.value,
      name: form.name.value,
      role: Number(form.role.value),
      employee_id: form.employee_id.value,
    });
    showMessage(message, 'ok');
    form.reset();
    document.getElementById('bind-label').hidden = true;
    load();
  } catch (err) {
    showMessage(err.message, 'error');
  }
});

initPage({ roles: [ROLE_ADMIN] }).then(load).catch((err) => showMessage(err.message, 'error'));
