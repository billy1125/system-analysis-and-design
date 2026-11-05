// UI-02 open issues (FR-OPEN-01..03)

const statusFilter = document.getElementById('f-status');
const deptFilter = document.getElementById('f-dept');
const typeFilter = document.getElementById('f-type');
let filtersLoaded = false;

async function load() {
  const params = new URLSearchParams({ status: statusFilter.value, dept_id: deptFilter.value, defect_type_id: typeFilter.value });
  const { rows, summary, departments, defect_types } = await api('GET', '/api/issues/open?' + params);

  if (!filtersLoaded) {
    deptFilter.innerHTML = optionTags(departments.map((d) => ({ value: d.id, label: withOff(d.name, d.is_active) })), '', '全部');
    typeFilter.innerHTML = optionTags(defect_types.map((t) => ({ value: t.id, label: withOff(t.name, t.is_active) })), '', '全部');
    filtersLoaded = true;
  }
  document.getElementById('summary').innerHTML =
    `待處理 <strong>${summary.pending}</strong> 件、處理中 <strong>${summary.working}</strong> 件`;

  const tbody = document.getElementById('rows');
  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" class="empty">沒有符合條件的異常單</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map((i) => `
    <tr class="clickable" data-id="${i.id}">
      <td>${esc(i.issue_no)}</td>
      <td>${esc(shortTime(i.found_at))}</td>
      <td>${esc(i.line)}</td>
      <td>${esc(`${i.part_no} ${i.product_name}`)}</td>
      <td>${esc(i.defect_name)}</td>
      <td>${esc(i.description)}</td>
      <td>${i.qty}</td>
      <td>${badge(i.status)}</td>
      <td>${esc(i.dept_name) || '—'}</td>
      <td>${i.days} 天</td>
    </tr>`).join('');
}

document.getElementById('rows').addEventListener('click', (e) => {
  const tr = e.target.closest('tr[data-id]');
  if (tr) location.href = 'issue.html?id=' + tr.dataset.id;
});

document.getElementById('new-issue').addEventListener('click', () => { location.href = 'issue-new.html'; });

for (const f of [statusFilter, deptFilter, typeFilter]) {
  f.addEventListener('change', () => load().catch((err) => showMessage(err.message, 'error')));
}

initPage().then(load).catch((err) => showMessage(err.message, 'error'));
