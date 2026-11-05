// UI-08 defect types (FR-ADM-03). No delete button on purpose.

const form = document.getElementById('type-form');
let rows = [];
let editingId = null;

function resetForm() {
  editingId = null;
  form.reset();
  document.getElementById('form-title').textContent = '新增異常類別';
}

async function load() {
  ({ rows } = await api('GET', '/api/defect-types'));
  document.getElementById('rows').innerHTML = rows.map((t) => `
    <tr>
      <td>${esc(t.name)}</td>
      <td>${t.issue_count}</td>
      <td>${t.is_active ? '啟用' : '<span class="muted">停用</span>'}</td>
      <td>
        <button class="small secondary" data-edit="${t.id}">修改</button>
        <button class="small secondary" data-active="${t.id}">${t.is_active ? '停用' : '啟用'}</button>
      </td>
    </tr>`).join('');
}

document.getElementById('rows').addEventListener('click', async (e) => {
  const editBtn = e.target.closest('button[data-edit]');
  const activeBtn = e.target.closest('button[data-active]');
  if (editBtn) {
    const t = rows.find((r) => r.id === Number(editBtn.dataset.edit));
    editingId = t.id;
    form.name.value = t.name;
    document.getElementById('form-title').textContent = `修改異常類別「${t.name}」`;
    clearMessage();
  } else if (activeBtn) {
    const t = rows.find((r) => r.id === Number(activeBtn.dataset.active));
    try {
      const { message } = await api('PUT', `/api/defect-types/${t.id}/active`, { is_active: t.is_active ? 0 : 1 });
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
  const body = { name: form.name.value };
  try {
    const { message } = editingId
      ? await api('PUT', `/api/defect-types/${editingId}`, body)
      : await api('POST', '/api/defect-types', body);
    showMessage(message, 'ok');
    resetForm();
    load();
  } catch (err) {
    showMessage(err.message, 'error');
  }
});

initPage({ managerOnly: true }).then(load).catch((err) => showMessage(err.message, 'error'));
