// UI-05 items (FR-STK-01, FR-ADM-01). No delete button on purpose.
// The book quantity is not in the form: only stock moves change it.

const form = document.getElementById('item-form');
const searchForm = document.getElementById('search-form');
let rows = [];
let editingId = null;
let isManager = false;

function resetForm() {
  editingId = null;
  form.reset();
  document.getElementById('form-title').textContent = '新增料號';
}

async function load() {
  ({ rows } = await api('GET', '/api/items?' + new URLSearchParams({ keyword: searchForm.keyword.value })));
  const tbody = document.getElementById('rows');
  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty">沒有符合條件的料號</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map((i) => `
    <tr>
      <td>${esc(i.item_no)}</td>
      <td>${esc(i.name)}</td>
      <td>${esc(i.spec)}</td>
      <td>${esc(i.unit)}</td>
      <td>${esc(i.location)}</td>
      <td>${i.book_qty}</td>
      <td>${i.is_active ? '啟用' : '<span class="muted">停用</span>'}</td>
      <td>
        <a href="moves.html?item_id=${i.id}">異動紀錄</a>
        ${isManager ? `
        <button class="small secondary" data-edit="${i.id}">修改</button>
        <button class="small secondary" data-active="${i.id}">${i.is_active ? '停用' : '啟用'}</button>` : ''}
      </td>
    </tr>`).join('');
}

document.getElementById('rows').addEventListener('click', async (e) => {
  const editBtn = e.target.closest('button[data-edit]');
  const activeBtn = e.target.closest('button[data-active]');
  if (editBtn) {
    const i = rows.find((r) => r.id === Number(editBtn.dataset.edit));
    editingId = i.id;
    for (const name of ['item_no', 'name', 'spec', 'unit', 'location']) form[name].value = i[name] || '';
    document.getElementById('form-title').textContent = `修改料號 ${i.item_no}`;
    clearMessage();
  } else if (activeBtn) {
    const i = rows.find((r) => r.id === Number(activeBtn.dataset.active));
    try {
      const { message } = await api('PUT', `/api/items/${i.id}/active`, { is_active: i.is_active ? 0 : 1 });
      showMessage(message, 'ok');
    } catch (err) {
      showMessage(err.message, 'error');
    }
    load();
  }
});

document.getElementById('reset').addEventListener('click', () => { resetForm(); clearMessage(); });

searchForm.addEventListener('submit', (e) => {
  e.preventDefault();
  clearMessage();
  load().catch((err) => showMessage(err.message, 'error'));
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = {};
  for (const name of ['item_no', 'name', 'spec', 'unit', 'location']) body[name] = form[name].value;
  try {
    const { message } = editingId
      ? await api('PUT', `/api/items/${editingId}`, body)
      : await api('POST', '/api/items', body);
    showMessage(message, 'ok');
    resetForm();
    load();
  } catch (err) {
    showMessage(err.message, 'error');
  }
});

initPage().then((user) => {
  // Only managers add, edit or disable items
  isManager = user.role === 0;
  form.hidden = !isManager;
  return load();
}).catch((err) => showMessage(err.message, 'error'));
