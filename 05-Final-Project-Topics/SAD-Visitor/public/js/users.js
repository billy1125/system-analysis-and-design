// UI-09 account management (FR-ADM-03, FR-ADM-04)

const form = document.getElementById('user-form');
const ROLES = [{ value: 0, label: '管理員' }, { value: 1, label: '接待員' }];
let rows = [];

async function load() {
  ({ rows } = await api('GET', '/api/admin/users'));
  document.getElementById('rows').innerHTML = rows.map((u) => `
    <tr>
      <td>${esc(u.username)}</td>
      <td>${esc(u.name)}</td>
      <td><select data-id="${u.id}" class="role">${optionTags(ROLES, u.role)}</select></td>
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

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const { message } = await api('POST', '/api/admin/users', {
      username: form.username.value,
      password: form.password.value,
      name: form.name.value,
      role: Number(form.role.value),
    });
    showMessage(message, 'ok');
    form.reset();
    load();
  } catch (err) {
    showMessage(err.message, 'error');
  }
});

initPage({ adminOnly: true }).then(load).catch((err) => showMessage(err.message, 'error'));
