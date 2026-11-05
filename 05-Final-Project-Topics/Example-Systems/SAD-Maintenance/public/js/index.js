// UI-02 due list (FR-DUE-01..03)

const ownerFilter = document.getElementById('f-owner');
const lineFilter = document.getElementById('f-line');
const statusFilter = document.getElementById('f-status');
let filtersLoaded = false;

async function load() {
  const params = new URLSearchParams({ owner_id: ownerFilter.value, line: lineFilter.value, status: statusFilter.value });
  const { rows, summary, owners, lines } = await api('GET', '/api/due?' + params);

  if (!filtersLoaded) {
    ownerFilter.innerHTML = optionTags(owners.map((u) => ({ value: u.id, label: u.name })), '', '全部');
    lineFilter.innerHTML = optionTags(lines.map((l) => ({ value: l, label: l })), '', '全部');
    filtersLoaded = true;
  }
  document.getElementById('summary').innerHTML =
    `逾期 <strong>${summary.overdue}</strong> 項、7 天內到期 <strong>${summary.soon}</strong> 項`;

  const tbody = document.getElementById('rows');
  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="11" class="empty">沒有符合條件的保養計畫</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map((p) => `
    <tr>
      <td>${esc(p.equip_no)}</td>
      <td>${esc(p.equip_name)}</td>
      <td>${esc(p.line)}</td>
      <td>${esc(p.plan_type)}</td>
      <td>${p.cycle_days} 天</td>
      <td>${esc(p.last_done)}</td>
      <td>${esc(p.next_due)}</td>
      <td>${daysText(p.days_left)}</td>
      <td>${badge(p.due_status)}</td>
      <td>${esc(p.owner_name)}</td>
      <td><button class="small" data-plan="${p.id}">登錄保養</button></td>
    </tr>`).join('');
}

document.getElementById('rows').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-plan]');
  if (btn) location.href = 'record-new.html?plan_id=' + btn.dataset.plan;
});

for (const f of [ownerFilter, lineFilter, statusFilter]) {
  f.addEventListener('change', () => load().catch((err) => showMessage(err.message, 'error')));
}

initPage().then(load).catch((err) => showMessage(err.message, 'error'));
