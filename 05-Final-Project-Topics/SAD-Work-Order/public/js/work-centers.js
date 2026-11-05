// UI-07 work centers (FR-ADM-02). No delete button on purpose.

const form = document.getElementById('wc-form');
let rows = [];
let editingId = null;

function resetForm() {
  editingId = null;
  form.reset();
  document.getElementById('form-title').textContent = '新增工作中心';
}

async function load() {
  ({ rows } = await api('GET', '/api/work-centers'));
  document.getElementById('rows').innerHTML = rows.map((w) => `
    <tr>
      <td>${esc(w.name)}</td>
      <td>${esc(w.leaders) || '<span class="muted">無</span>'}</td>
      <td>${w.open_count}</td>
      <td>${w.is_active ? '啟用' : '<span class="muted">停用</span>'}</td>
      <td>
        <button class="small secondary" data-edit="${w.id}">修改</button>
        <button class="small secondary" data-active="${w.id}">${w.is_active ? '停用' : '啟用'}</button>
      </td>
    </tr>`).join('');
}

document.getElementById('rows').addEventListener('click', async (e) => {
  const editBtn = e.target.closest('button[data-edit]');
  const activeBtn = e.target.closest('button[data-active]');
  if (editBtn) {
    const w = rows.find((r) => r.id === Number(editBtn.dataset.edit));
    editingId = w.id;
    form.name.value = w.name;
    document.getElementById('form-title').textContent = `修改工作中心 ${w.name}`;
    clearMessage();
  } else if (activeBtn) {
    const w = rows.find((r) => r.id === Number(activeBtn.dataset.active));
    try {
      const { message } = await api('PUT', `/api/work-centers/${w.id}/active`, { is_active: w.is_active ? 0 : 1 });
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
      ? await api('PUT', `/api/work-centers/${editingId}`, body)
      : await api('POST', '/api/work-centers', body);
    showMessage(message, 'ok');
    resetForm();
    load();
  } catch (err) {
    showMessage(err.message, 'error');
  }
});

initPage({ plannerOnly: true }).then(load).catch((err) => showMessage(err.message, 'error'));
