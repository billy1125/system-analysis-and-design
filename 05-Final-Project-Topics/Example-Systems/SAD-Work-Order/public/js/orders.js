// UI-04 work order search (FR-QRY-01). Team leaders see every work center here.

const form = document.getElementById('filter-form');
let filtersLoaded = false;

async function load() {
  const params = new URLSearchParams();
  for (const name of ['from', 'to', 'product_id', 'work_center_id', 'status', 'keyword']) {
    params.set(name, form[name].value);
  }
  const { rows, products, work_centers } = await api('GET', '/api/orders?' + params);

  if (!filtersLoaded) {
    form.product_id.innerHTML = optionTags(
      products.map((p) => ({ value: p.id, label: withOff(`${p.part_no} ${p.name}`, p.is_active) })), '', '全部');
    form.work_center_id.innerHTML = optionTags(
      work_centers.map((w) => ({ value: w.id, label: withOff(w.name, w.is_active) })), '', '全部');
    filtersLoaded = true;
  }

  document.getElementById('summary').innerHTML = `共 <strong>${rows.length}</strong> 筆`;
  const tbody = document.getElementById('rows');
  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="11" class="empty">沒有符合條件的工單</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map((o) => `
    <tr class="clickable" data-id="${o.id}">
      <td>${esc(o.wo_no)}</td>
      <td>${esc(o.so_no)}</td>
      <td>${esc(`${o.part_no} ${o.product_name}`)}</td>
      <td>${o.qty}</td>
      <td>${esc(o.due_date)}</td>
      <td>${badge(o.status)}</td>
      <td>${esc(o.wc_name) || '—'}</td>
      <td>${o.good_qty ?? ''}</td>
      <td>${o.ng_qty ?? ''}</td>
      <td>${o.status === '已完工' ? esc(shortTime(o.closed_at)) : ''}</td>
      <td>${dueText(o)}</td>
    </tr>`).join('');
}

document.getElementById('rows').addEventListener('click', (e) => {
  const tr = e.target.closest('tr[data-id]');
  if (tr) location.href = 'order.html?id=' + tr.dataset.id;
});

function reload() {
  clearMessage();
  load().catch((err) => showMessage(err.message, 'error'));
}

// Dropdowns and dates search right away; the number field waits for the button or Enter
form.addEventListener('change', (e) => { if (e.target.name !== 'keyword') reload(); });
form.addEventListener('submit', (e) => { e.preventDefault(); reload(); });

initPage().then(load).catch((err) => showMessage(err.message, 'error'));
