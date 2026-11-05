// UI-02 count list (FR-CNT-01)

const statusFilter = document.getElementById('f-status');

async function load() {
  const { rows } = await api('GET', '/api/counts?' + new URLSearchParams({ status: statusFilter.value }));
  const tbody = document.getElementById('rows');
  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty">沒有符合條件的盤點單</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map((c) => `
    <tr class="clickable" data-id="${c.id}">
      <td>${esc(c.count_no)}</td>
      <td>${esc(c.name)}</td>
      <td>${esc(c.count_type)}</td>
      <td>${esc(c.counter_name)}</td>
      <td>${esc(shortTime(c.created_at))}</td>
      <td>已盤 ${c.counted_count}／共 ${c.line_count} 項</td>
      <td>${badge(c.status)}</td>
      <td>${esc(shortTime(c.closed_at))}</td>
    </tr>`).join('');
}

document.getElementById('rows').addEventListener('click', (e) => {
  const tr = e.target.closest('tr[data-id]');
  if (tr) location.href = 'count.html?id=' + tr.dataset.id;
});

document.getElementById('new-count').addEventListener('click', () => { location.href = 'count-new.html'; });

statusFilter.addEventListener('change', () => load().catch((err) => showMessage(err.message, 'error')));

initPage().then((user) => {
  // Only managers create counts
  document.getElementById('new-count').hidden = user.role !== 0;
  return load();
}).catch((err) => showMessage(err.message, 'error'));
