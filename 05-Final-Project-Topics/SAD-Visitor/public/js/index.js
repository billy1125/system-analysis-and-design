// UI-02 on-site visitor list and check-out (FR-OUT)

async function loadOnsite() {
  const { rows, summary } = await api('GET', '/api/onsite');
  document.getElementById('summary').innerHTML =
    `目前在廠訪客 <strong>${summary.visitor_count}</strong> 位，另有隨行 <strong>${summary.companion_count}</strong> 人`;

  const tbody = document.getElementById('rows');
  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty">目前沒有在廠訪客</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map((r) => `
    <tr>
      <td>${esc(shortTime(r.check_in_at))}</td>
      <td>${esc(r.visitor_name)}</td>
      <td>${esc(r.company)}</td>
      <td>${esc(r.employee_name)}</td>
      <td>${esc(r.extension)}</td>
      <td>${esc(r.pass_no)}</td>
      <td>${r.companions}</td>
      <td><button class="small" data-id="${r.id}" data-name="${esc(r.visitor_name)}">離廠</button></td>
    </tr>`).join('');
}

document.getElementById('rows').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-id]');
  if (!btn) return;
  if (!confirm(`確定登記 ${btn.dataset.name} 離廠？`)) return;
  try {
    const { message } = await api('POST', `/api/visits/${btn.dataset.id}/checkout`);
    showMessage(message, 'ok');
  } catch (err) {
    showMessage(err.message, 'error');
  }
  loadOnsite();
});

initPage().then(loadOnsite).catch((err) => showMessage(err.message, 'error'));
