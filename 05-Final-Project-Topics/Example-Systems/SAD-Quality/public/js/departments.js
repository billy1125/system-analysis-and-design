// UI-07 departments (FR-ADM-02). No delete button on purpose.

const form = document.getElementById('dept-form');
let rows = [];
let editingId = null;

function resetForm() {
  editingId = null;
  form.reset();
  document.getElementById('form-title').textContent = '新增責任單位';
}

async function load() {
  ({ rows } = await api('GET', '/api/departments'));
  document.getElementById('rows').innerHTML = rows.map((d) => `
    <tr>
      <td>${esc(d.name)}</td>
      <td>${esc(d.contact)}</td>
      <td>${esc(d.ext)}</td>
      <td>${d.working_count}</td>
      <td>${d.is_active ? '啟用' : '<span class="muted">停用</span>'}</td>
      <td>
        <button class="small secondary" data-edit="${d.id}">修改</button>
        <button class="small secondary" data-active="${d.id}">${d.is_active ? '停用' : '啟用'}</button>
      </td>
    </tr>`).join('');
}

document.getElementById('rows').addEventListener('click', async (e) => {
  const editBtn = e.target.closest('button[data-edit]');
  const activeBtn = e.target.closest('button[data-active]');
  if (editBtn) {
    const d = rows.find((r) => r.id === Number(editBtn.dataset.edit));
    editingId = d.id;
    form.name.value = d.name;
    form.contact.value = d.contact;
    form.ext.value = d.ext;
    document.getElementById('form-title').textContent = `修改責任單位 ${d.name}`;
    clearMessage();
  } else if (activeBtn) {
    const d = rows.find((r) => r.id === Number(activeBtn.dataset.active));
    try {
      const { message } = await api('PUT', `/api/departments/${d.id}/active`, { is_active: d.is_active ? 0 : 1 });
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
  const body = { name: form.name.value, contact: form.contact.value, ext: form.ext.value };
  try {
    const { message } = editingId
      ? await api('PUT', `/api/departments/${editingId}`, body)
      : await api('POST', '/api/departments', body);
    showMessage(message, 'ok');
    resetForm();
    load();
  } catch (err) {
    showMessage(err.message, 'error');
  }
});

initPage({ managerOnly: true }).then(load).catch((err) => showMessage(err.message, 'error'));
