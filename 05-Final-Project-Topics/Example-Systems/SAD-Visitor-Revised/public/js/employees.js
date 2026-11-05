// UI-07 employee list (FR-ADM-01)

const form = document.getElementById('employee-form');
let rows = [];
let editingId = null; // null means the form adds a new employee

function resetForm() {
  editingId = null;
  form.reset();
  document.getElementById('form-title').textContent = '新增員工';
  document.getElementById('submit').textContent = '新增';
  document.getElementById('cancel').hidden = true;
}

async function load() {
  ({ rows } = await api('GET', '/api/admin/employees'));
  document.getElementById('rows').innerHTML = rows.map((e) => `
    <tr>
      <td>${esc(e.emp_no)}</td>
      <td>${esc(e.name)}</td>
      <td>${esc(e.department)}</td>
      <td>${esc(e.extension)}</td>
      <td>${e.is_active ? '在職' : '<span class="muted">離職</span>'}</td>
      <td>
        <button class="small" data-action="edit" data-id="${e.id}">修改</button>
        <button class="small secondary" data-action="toggle" data-id="${e.id}">${e.is_active ? '設為離職' : '設為在職'}</button>
      </td>
    </tr>`).join('');
}

document.getElementById('rows').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-id]');
  if (!btn) return;
  const emp = rows.find((r) => r.id === Number(btn.dataset.id));
  clearMessage();
  if (btn.dataset.action === 'edit') {
    editingId = emp.id;
    form.emp_no.value = emp.emp_no;
    form.name.value = emp.name;
    form.department.value = emp.department;
    form.extension.value = emp.extension || '';
    document.getElementById('form-title').textContent = `修改員工（${emp.emp_no}）`;
    document.getElementById('submit').textContent = '儲存';
    document.getElementById('cancel').hidden = false;
    return;
  }
  try {
    const { message } = await api('PUT', `/api/admin/employees/${emp.id}/active`, { is_active: emp.is_active ? 0 : 1 });
    showMessage(message, 'ok');
    load();
  } catch (err) {
    showMessage(err.message, 'error');
  }
});

document.getElementById('cancel').addEventListener('click', resetForm);

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = {
    emp_no: form.emp_no.value,
    name: form.name.value,
    department: form.department.value,
    extension: form.extension.value,
  };
  try {
    const { message } = editingId
      ? await api('PUT', `/api/admin/employees/${editingId}`, body)
      : await api('POST', '/api/admin/employees', body);
    showMessage(message, 'ok');
    resetForm();
    load();
  } catch (err) {
    showMessage(err.message, 'error');
  }
});

initPage({ roles: [ROLE_ADMIN] }).then(load).catch((err) => showMessage(err.message, 'error'));
