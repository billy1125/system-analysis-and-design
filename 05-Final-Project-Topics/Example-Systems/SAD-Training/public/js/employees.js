// UI-08 employee accounts (FR-ADM-02, FR-ADM-03)

const form = document.getElementById('emp-form');
let rows = [];
let editingId = null;

function resetForm() {
  editingId = null;
  form.reset();
  document.getElementById('form-title').textContent = '新增員工';
  document.getElementById('pw-label').textContent = '密碼';
}

async function load() {
  ({ rows } = await api('GET', '/api/admin/employees'));
  document.getElementById('rows').innerHTML = rows.map((p) => `
    <tr>
      <td>${esc(p.emp_no)}</td>
      <td>${esc(p.name)}</td>
      <td>${esc(p.department)}</td>
      <td>${esc(p.job_title)}</td>
      <td>${esc(p.hire_date)}</td>
      <td>${p.role === 0 ? '人資' : '員工'}</td>
      <td>${p.is_active ? '在職' : '<span class="muted">離職</span>'}</td>
      <td>
        <button class="small secondary" data-edit="${p.id}">修改</button>
        <button class="small secondary" data-active="${p.id}">${p.is_active ? '停用' : '啟用'}</button>
      </td>
    </tr>`).join('');
}

document.getElementById('rows').addEventListener('click', async (e) => {
  const editBtn = e.target.closest('button[data-edit]');
  const activeBtn = e.target.closest('button[data-active]');
  if (editBtn) {
    const p = rows.find((r) => r.id === Number(editBtn.dataset.edit));
    editingId = p.id;
    form.emp_no.value = p.emp_no;
    form.name.value = p.name;
    form.department.value = p.department;
    form.job_title.value = p.job_title;
    form.hire_date.value = p.hire_date;
    form.role.value = String(p.role);
    form.password.value = '';
    document.getElementById('form-title').textContent = `修改員工 ${p.emp_no}`;
    document.getElementById('pw-label').textContent = '新密碼（留空表示不變更）';
    clearMessage();
  } else if (activeBtn) {
    const p = rows.find((r) => r.id === Number(activeBtn.dataset.active));
    try {
      const { message } = await api('PUT', `/api/admin/employees/${p.id}/active`, { is_active: p.is_active ? 0 : 1 });
      showMessage(message, 'ok');
    } catch (err) {
      showMessage(err.message, 'error');
    }
    load();
  }
});

document.getElementById('reset').addEventListener('click', () => { resetForm(); clearMessage(); });

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = {
    emp_no: form.emp_no.value,
    name: form.name.value,
    department: form.department.value,
    job_title: form.job_title.value,
    hire_date: form.hire_date.value,
    role: Number(form.role.value),
    password: form.password.value,
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

initPage({ hrOnly: true }).then(load).catch((err) => showMessage(err.message, 'error'));
