// UI-04 record search (FR-QRY-01)

const form = document.getElementById('filter-form');
let filtersLoaded = false;

async function load() {
  const params = new URLSearchParams({
    from: form.from.value,
    to: form.to.value,
    equipment_id: form.equipment_id.value,
    done_by: form.done_by.value,
    result: form.result.value,
  });
  const { rows, equipment, users } = await api('GET', '/api/records?' + params);

  if (!filtersLoaded) {
    form.equipment_id.innerHTML = optionTags(equipment.map((e) => ({ value: e.id, label: `${e.equip_no} ${e.name}` })), '', '全部');
    form.done_by.innerHTML = optionTags(users.map((u) => ({ value: u.id, label: u.name })), '', '全部');
    filtersLoaded = true;
  }

  const tbody = document.getElementById('rows');
  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty">沒有符合條件的保養紀錄</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map((r) => `
    <tr class="clickable" data-id="${r.id}">
      <td>${esc(r.done_date)}</td>
      <td>${esc(r.equip_no)}</td>
      <td>${esc(r.equip_name)}</td>
      <td>${esc(r.plan_type)}</td>
      <td>${esc(r.done_by_name)}</td>
      <td>${badge(r.result)}</td>
      <td>${esc(r.note)}</td>
      <td>${esc(shortTime(r.created_at))}</td>
    </tr>`).join('');
}

document.getElementById('rows').addEventListener('click', (e) => {
  const tr = e.target.closest('tr[data-id]');
  if (tr) location.href = 'record.html?id=' + tr.dataset.id;
});

form.addEventListener('change', () => load().catch((err) => showMessage(err.message, 'error')));
form.addEventListener('submit', (e) => e.preventDefault());

initPage().then(load).catch((err) => showMessage(err.message, 'error'));
