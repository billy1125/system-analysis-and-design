// UI-04 issue search (FR-QRY-01)

const form = document.getElementById('filter-form');
let filtersLoaded = false;

async function load() {
  const params = new URLSearchParams();
  for (const name of ['from', 'to', 'product_id', 'defect_type_id', 'dept_id', 'status', 'keyword']) {
    params.set(name, form[name].value);
  }
  const { rows, products, defect_types, departments } = await api('GET', '/api/issues?' + params);

  if (!filtersLoaded) {
    form.product_id.innerHTML = optionTags(
      products.map((p) => ({ value: p.id, label: withOff(`${p.part_no} ${p.name}`, p.is_active) })), '', '全部');
    form.defect_type_id.innerHTML = optionTags(
      defect_types.map((t) => ({ value: t.id, label: withOff(t.name, t.is_active) })), '', '全部');
    form.dept_id.innerHTML = optionTags(
      departments.map((d) => ({ value: d.id, label: withOff(d.name, d.is_active) })), '', '全部');
    filtersLoaded = true;
  }

  document.getElementById('summary').innerHTML = `共 <strong>${rows.length}</strong> 筆`;
  const tbody = document.getElementById('rows');
  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty">沒有符合條件的異常單</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map((i) => `
    <tr class="clickable" data-id="${i.id}">
      <td>${esc(i.issue_no)}</td>
      <td>${esc(shortTime(i.found_at))}</td>
      <td>${esc(`${i.part_no} ${i.product_name}`)}</td>
      <td>${esc(i.defect_name)}</td>
      <td>${esc(i.description)}</td>
      <td>${badge(i.status)}</td>
      <td>${esc(i.dept_name) || '—'}</td>
      <td>${i.days} 天</td>
      <td>${esc(shortTime(i.closed_at))}</td>
    </tr>`).join('');
}

document.getElementById('rows').addEventListener('click', (e) => {
  const tr = e.target.closest('tr[data-id]');
  if (tr) location.href = 'issue.html?id=' + tr.dataset.id;
});

function reload() {
  clearMessage();
  load().catch((err) => showMessage(err.message, 'error'));
}

// Dropdowns and dates search right away; the keyword waits for the button or Enter
form.addEventListener('change', (e) => { if (e.target.name !== 'keyword') reload(); });
form.addEventListener('submit', (e) => { e.preventDefault(); reload(); });

initPage().then(load).catch((err) => showMessage(err.message, 'error'));
