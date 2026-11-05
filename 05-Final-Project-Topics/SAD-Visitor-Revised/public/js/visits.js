// UI-04 visit record search (FR-QRY-01, FR-QRY-02)

const form = document.getElementById('search-form');

async function search() {
  clearMessage();
  const params = new URLSearchParams({ from: form.from.value, to: form.to.value, q: form.q.value });
  const tbody = document.getElementById('rows');
  try {
    const { rows } = await api('GET', '/api/visits?' + params);
    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty">查無來訪紀錄</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map((r) => `
      <tr class="clickable" data-id="${r.id}">
        <td>${esc(shortTime(r.check_in_at))}</td>
        <td>${r.check_out_at ? esc(shortTime(r.check_out_at)) + (r.checkout_reason ? ' <span class="warn">（補登）</span>' : '') : '<span class="muted">在廠</span>'}</td>
        <td>${esc(r.visitor_name)}</td>
        <td>${esc(r.company)}</td>
        <td>${esc(r.id_number)}</td>
        <td>${esc(r.employee_name)}</td>
        <td>${esc(r.purpose)}</td>
        <td>${esc(r.pass_no)}</td>
      </tr>`).join('');
  } catch (err) {
    tbody.innerHTML = '';
    showMessage(err.message, 'error');
  }
}

document.getElementById('rows').addEventListener('click', (e) => {
  const tr = e.target.closest('tr[data-id]');
  if (tr) location.href = 'visit.html?id=' + tr.dataset.id;
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  search();
});

initPage().then(() => {
  // Default range is today
  form.from.value = localDate();
  form.to.value = localDate();
  search();
}).catch((err) => showMessage(err.message, 'error'));
