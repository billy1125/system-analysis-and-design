// UI-02 open work orders (FR-LIST-01..04)

const statusFilter = document.getElementById('f-status');
const dueFilter = document.getElementById('f-due');
const wcFilter = document.getElementById('f-wc');
let user = null;
let filtersLoaded = false;

async function load() {
  const params = new URLSearchParams({ status: statusFilter.value, due: dueFilter.value, work_center_id: wcFilter.value });
  const { rows, summary, work_centers } = await api('GET', '/api/orders/open?' + params);

  if (!filtersLoaded && user.role === ROLE_PLANNER) {
    wcFilter.innerHTML = optionTags(work_centers.map((w) => ({ value: w.id, label: withOff(w.name, w.is_active) })), '', '全部');
    filtersLoaded = true;
  }
  document.getElementById('summary').innerHTML =
    `待派工 <strong>${summary.pending}</strong> 件、已派工 <strong>${summary.dispatched}</strong> 件、` +
    `生產中 <strong>${summary.producing}</strong> 件，已逾期 <strong>${summary.overdue}</strong> 件`;

  const tbody = document.getElementById('rows');
  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" class="empty">沒有符合條件的工單</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map((o) => `
    <tr class="clickable" data-id="${o.id}">
      <td>${esc(o.wo_no)}</td>
      <td>${esc(o.so_no)}</td>
      <td>${esc(`${o.part_no} ${o.product_name}`)}</td>
      <td>${o.qty}</td>
      <td>${esc(o.due_date)}</td>
      <td>${dueText(o)}</td>
      <td>${badge(o.status)}</td>
      <td>${esc(o.wc_name) || '—'}</td>
      <td>${esc(o.plan_date) || '—'}</td>
      <td>${esc(shortTime(o.started_at))}</td>
    </tr>`).join('');
}

document.getElementById('rows').addEventListener('click', (e) => {
  const tr = e.target.closest('tr[data-id]');
  if (tr) location.href = 'order.html?id=' + tr.dataset.id;
});

document.getElementById('new-order').addEventListener('click', () => { location.href = 'order-new.html'; });

for (const f of [statusFilter, dueFilter, wcFilter]) {
  f.addEventListener('change', () => load().catch((err) => showMessage(err.message, 'error')));
}

initPage().then((u) => {
  user = u;
  // Team leaders never see orders that are still waiting for dispatch
  const statuses = user.role === ROLE_PLANNER ? ['待派工', '已派工', '生產中'] : ['已派工', '生產中'];
  statusFilter.innerHTML = optionTags(statuses.map((s) => ({ value: s, label: s })), '', '全部');
  if (user.role === ROLE_PLANNER) {
    document.getElementById('f-wc-label').hidden = false;
    document.getElementById('new-order').hidden = false;
  }
  return load();
}).catch((err) => showMessage(err.message, 'error'));
