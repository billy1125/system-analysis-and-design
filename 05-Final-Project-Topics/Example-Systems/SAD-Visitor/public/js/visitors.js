// UI-06 visitor records (FR-VIS-01, FR-VIS-02)

const searchForm = document.getElementById('search-form');
const editForm = document.getElementById('edit-form');
let rows = [];
let editingId = null;

async function search() {
  const { rows: result } = await api('GET', '/api/visitors?q=' + encodeURIComponent(searchForm.q.value));
  rows = result;
  const tbody = document.getElementById('rows');
  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty">查無訪客資料</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map((v) => `
    <tr>
      <td>${v.id}</td>
      <td>${esc(v.name)}</td>
      <td>${esc(v.company)}</td>
      <td>${esc(v.phone)}</td>
      <td>${esc(v.id_number)}</td>
      <td>${esc(v.updated_at) || '<span class="muted">從未修改</span>'}</td>
      <td><button class="small" data-id="${v.id}">修改</button></td>
    </tr>`).join('');
}

document.getElementById('rows').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-id]');
  if (!btn) return;
  const v = rows.find((r) => r.id === Number(btn.dataset.id));
  editingId = v.id;
  document.getElementById('edit-title').textContent = `修改訪客資料（訪客編號 ${v.id}）`;
  editForm.name.value = v.name;
  editForm.company.value = v.company;
  editForm.phone.value = v.phone;
  editForm.id_number.value = v.id_number;
  editForm.hidden = false;
  clearMessage();
});

document.getElementById('cancel').addEventListener('click', () => {
  editForm.hidden = true;
  editingId = null;
});

editForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const { message } = await api('PUT', `/api/visitors/${editingId}`, {
      name: editForm.name.value,
      company: editForm.company.value,
      phone: editForm.phone.value,
      id_number: editForm.id_number.value,
    });
    editForm.hidden = true;
    editingId = null;
    showMessage(message, 'ok');
    search();
  } catch (err) {
    showMessage(err.message, 'error');
  }
});

searchForm.addEventListener('submit', (e) => {
  e.preventDefault();
  clearMessage();
  search().catch((err) => showMessage(err.message, 'error'));
});

initPage().then(search).catch((err) => showMessage(err.message, 'error'));
