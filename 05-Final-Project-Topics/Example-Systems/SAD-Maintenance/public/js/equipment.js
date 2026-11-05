// UI-06 equipment list (FR-QRY-03, FR-ADM-01). No delete button on purpose.

const form = document.getElementById('equip-form');
let rows = [];
let editingId = null;
let isManager = false;

function resetForm() {
  editingId = null;
  form.reset();
  document.getElementById('form-title').textContent = '新增設備';
}

async function load() {
  ({ rows } = await api('GET', '/api/equipment'));
  document.getElementById('rows').innerHTML = rows.map((e) => `
    <tr class="clickable" data-id="${e.id}">
      <td>${esc(e.equip_no)}</td>
      <td>${esc(e.name)}</td>
      <td>${esc(e.model)}</td>
      <td>${esc(e.maker)}</td>
      <td>${esc(e.line)}</td>
      <td>${esc(e.location)}</td>
      <td>${e.plan_count}</td>
      <td>${e.is_active ? '使用中' : '<span class="muted">停用</span>'}</td>
      ${isManager ? `<td>
        <button class="small secondary" data-edit="${e.id}">修改</button>
        <button class="small secondary" data-active="${e.id}">${e.is_active ? '停用' : '啟用'}</button>
      </td>` : ''}
    </tr>`).join('');
}

document.getElementById('rows').addEventListener('click', async (ev) => {
  const editBtn = ev.target.closest('button[data-edit]');
  const activeBtn = ev.target.closest('button[data-active]');
  if (editBtn) {
    const e = rows.find((r) => r.id === Number(editBtn.dataset.edit));
    editingId = e.id;
    form.equip_no.value = e.equip_no;
    form.name.value = e.name;
    form.model.value = e.model || '';
    form.maker.value = e.maker || '';
    form.line.value = e.line;
    form.location.value = e.location;
    document.getElementById('form-title').textContent = `修改設備 ${e.equip_no}`;
    clearMessage();
  } else if (activeBtn) {
    const e = rows.find((r) => r.id === Number(activeBtn.dataset.active));
    try {
      const { message } = await api('PUT', `/api/equipment/${e.id}/active`, { is_active: e.is_active ? 0 : 1 });
      showMessage(message, 'ok');
    } catch (err) {
      showMessage(err.message, 'error');
    }
    load();
  } else {
    const tr = ev.target.closest('tr[data-id]');
    if (tr) location.href = 'equipment-detail.html?id=' + tr.dataset.id;
  }
});

document.getElementById('reset').addEventListener('click', () => { resetForm(); clearMessage(); });

form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const body = {
    equip_no: form.equip_no.value,
    name: form.name.value,
    model: form.model.value,
    maker: form.maker.value,
    line: form.line.value,
    location: form.location.value,
  };
  try {
    const { message } = editingId
      ? await api('PUT', `/api/equipment/${editingId}`, body)
      : await api('POST', '/api/equipment', body);
    showMessage(message, 'ok');
    resetForm();
    load();
  } catch (err) {
    showMessage(err.message, 'error');
  }
});

initPage().then((user) => {
  // Technicians can view; the form and buttons are for managers only
  isManager = user.role === 0;
  form.hidden = !isManager;
  document.querySelector('th.manager-col').hidden = !isManager;
  return load();
}).catch((err) => showMessage(err.message, 'error'));
