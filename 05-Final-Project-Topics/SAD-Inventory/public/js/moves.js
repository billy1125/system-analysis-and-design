// UI-06 stock moves (FR-STK-02..05). Moves cannot be edited or deleted;
// a wrong move is fixed by registering one in the opposite direction.

const moveForm = document.getElementById('move-form');
const filterForm = document.getElementById('filter-form');
// UI-05 links here with ?item_id= to show one item's moves
const linkedItem = new URLSearchParams(location.search).get('item_id') || '';
let firstLoad = true;

async function load() {
  const params = new URLSearchParams();
  for (const name of ['from', 'to', 'move_type']) params.set(name, filterForm[name].value);
  params.set('item_id', firstLoad ? linkedItem : filterForm.item_id.value);
  const { rows, items } = await api('GET', '/api/moves?' + params);

  // The register list shows active items with their book quantity, so refresh it every time
  const picked = moveForm.item_id.value;
  moveForm.item_id.innerHTML = optionTags(items.filter((i) => i.is_active)
    .map((i) => ({ value: i.id, label: `${i.item_no} ${i.name}（帳面 ${i.book_qty} ${i.unit}）` })), picked, '請選擇');
  if (firstLoad) {
    filterForm.item_id.innerHTML = optionTags(
      items.map((i) => ({ value: i.id, label: withOff(`${i.item_no} ${i.name}`, i.is_active) })), linkedItem, '全部');
    firstLoad = false;
  }

  const tbody = document.getElementById('rows');
  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty">沒有符合條件的異動紀錄</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map((m) => `
    <tr>
      <td>${esc(shortTime(m.created_at))}</td>
      <td>${esc(m.item_no)}</td>
      <td>${esc(m.item_name)}</td>
      <td>${esc(m.move_type)}</td>
      <td>${signed(m.qty_change)}</td>
      <td>${esc(m.note)}</td>
      <td>${esc(m.created_by_name)}</td>
    </tr>`).join('');
}

function reload() {
  clearMessage();
  load().catch((err) => showMessage(err.message, 'error'));
}

filterForm.addEventListener('change', reload);
filterForm.addEventListener('submit', (e) => { e.preventDefault(); reload(); });

moveForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = {};
  for (const name of ['item_id', 'move_type', 'qty', 'note']) body[name] = moveForm[name].value;
  try {
    const { message } = await api('POST', '/api/moves', body);
    moveForm.reset();
    await load();
    showMessage(message, 'ok');
  } catch (err) {
    showMessage(err.message, 'error');
  }
});

initPage().then(load).catch((err) => showMessage(err.message, 'error'));
