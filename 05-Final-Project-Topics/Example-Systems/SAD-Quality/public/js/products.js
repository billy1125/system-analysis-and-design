// UI-06 products (FR-ADM-01). No delete button on purpose.

const form = document.getElementById('product-form');
let rows = [];
let editingId = null;

function resetForm() {
  editingId = null;
  form.reset();
  document.getElementById('form-title').textContent = '新增產品';
}

async function load() {
  ({ rows } = await api('GET', '/api/products'));
  document.getElementById('rows').innerHTML = rows.map((p) => `
    <tr>
      <td>${esc(p.part_no)}</td>
      <td>${esc(p.name)}</td>
      <td>${esc(p.customer)}</td>
      <td>${p.issue_count}</td>
      <td>${p.is_active ? '啟用' : '<span class="muted">停用</span>'}</td>
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
    form.part_no.value = p.part_no;
    form.name.value = p.name;
    form.customer.value = p.customer || '';
    document.getElementById('form-title').textContent = `修改產品 ${p.part_no}`;
    clearMessage();
  } else if (activeBtn) {
    const p = rows.find((r) => r.id === Number(activeBtn.dataset.active));
    try {
      const { message } = await api('PUT', `/api/products/${p.id}/active`, { is_active: p.is_active ? 0 : 1 });
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
  const body = { part_no: form.part_no.value, name: form.name.value, customer: form.customer.value };
  try {
    const { message } = editingId
      ? await api('PUT', `/api/products/${editingId}`, body)
      : await api('POST', '/api/products', body);
    showMessage(message, 'ok');
    resetForm();
    load();
  } catch (err) {
    showMessage(err.message, 'error');
  }
});

initPage({ managerOnly: true }).then(load).catch((err) => showMessage(err.message, 'error'));
