// UI-08 user accounts (FR-ADM-03, FR-ADM-04)

const form = document.getElementById('user-form');
let rows = [];
let workCenters = [];
let editingId = null;

// Active work centers only; keepId keeps the account's current one even if disabled
function fillWorkCenters(selected, keepId) {
  const list = workCenters.filter((w) => w.is_active || w.id === keepId);
  form.work_center_id.innerHTML = optionTags(
    list.map((w) => ({ value: w.id, label: withOff(w.name, w.is_active) })), selected, '請選擇');
}

// Production control has no work center
function syncWorkCenter() {
  form.work_center_id.disabled = form.role.value === '0';
}

function resetForm() {
  editingId = null;
  form.reset();
  fillWorkCenters('', null);
  syncWorkCenter();
  document.getElementById('form-title').textContent = '新增帳號';
  document.getElementById('pw-label').textContent = '密碼';
}

async function load() {
  ({ rows, work_centers: workCenters } = await api('GET', '/api/admin/users'));
  if (!editingId) fillWorkCenters('', null);
  document.getElementById('rows').innerHTML = rows.map((u) => `
    <tr>
      <td>${esc(u.emp_no)}</td>
      <td>${esc(u.name)}</td>
      <td>${esc(u.title)}</td>
      <td>${u.role === ROLE_PLANNER ? '生管人員' : '組長'}</td>
      <td>${esc(u.wc_name)}</td>
      <td>${u.is_active ? '啟用' : '<span class="muted">停用</span>'}</td>
      <td>
        <button class="small secondary" data-edit="${u.id}">修改</button>
        <button class="small secondary" data-active="${u.id}">${u.is_active ? '停用' : '啟用'}</button>
      </td>
    </tr>`).join('');
}

document.getElementById('rows').addEventListener('click', async (e) => {
  const editBtn = e.target.closest('button[data-edit]');
  const activeBtn = e.target.closest('button[data-active]');
  if (editBtn) {
    const u = rows.find((r) => r.id === Number(editBtn.dataset.edit));
    editingId = u.id;
    form.emp_no.value = u.emp_no;
    form.name.value = u.name;
    form.title.value = u.title;
    form.role.value = String(u.role);
    fillWorkCenters(u.work_center_id || '', u.work_center_id);
    syncWorkCenter();
    form.password.value = '';
    document.getElementById('form-title').textContent = `修改帳號 ${u.emp_no}`;
    document.getElementById('pw-label').textContent = '新密碼（留空表示不變更）';
    clearMessage();
  } else if (activeBtn) {
    const u = rows.find((r) => r.id === Number(activeBtn.dataset.active));
    try {
      const { message } = await api('PUT', `/api/admin/users/${u.id}/active`, { is_active: u.is_active ? 0 : 1 });
      showMessage(message, 'ok');
    } catch (err) {
      showMessage(err.message, 'error');
    }
    load();
  }
});

form.role.addEventListener('change', syncWorkCenter);

document.getElementById('reset').addEventListener('click', () => { resetForm(); clearMessage(); });

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = {
    emp_no: form.emp_no.value,
    name: form.name.value,
    title: form.title.value,
    role: form.role.value,
    work_center_id: form.work_center_id.value,
    password: form.password.value,
  };
  try {
    const { message } = editingId
      ? await api('PUT', `/api/admin/users/${editingId}`, body)
      : await api('POST', '/api/admin/users', body);
    showMessage(message, 'ok');
    resetForm();
    load();
  } catch (err) {
    showMessage(err.message, 'error');
  }
});

initPage({ plannerOnly: true }).then(load).catch((err) => showMessage(err.message, 'error'));
