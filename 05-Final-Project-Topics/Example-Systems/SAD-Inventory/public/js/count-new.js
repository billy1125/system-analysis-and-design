// UI-03 create a count (FR-CNT-02, 03)

const form = document.getElementById('count-form');

async function load() {
  const { users, items } = await api('GET', '/api/counts/new-form');
  form.counter_id.innerHTML = optionTags(
    users.map((u) => ({ value: u.id, label: `${u.emp_no} ${u.name}（${u.title}）` })), '', '請選擇');
  // Items already in an open count cannot be picked
  document.getElementById('items').innerHTML = items.map((i) => `
    <tr>
      <td><input type="checkbox" name="item_ids" value="${i.id}"${i.open_count_no ? ' disabled' : ''} style="min-width:0"></td>
      <td>${esc(i.item_no)}</td>
      <td>${esc(i.name)}</td>
      <td>${esc(i.spec)}</td>
      <td>${esc(i.location)}</td>
      <td>${i.book_qty} ${esc(i.unit)}</td>
      <td>${i.open_count_no ? `<span class="muted">盤點中（${esc(i.open_count_no)}）</span>` : ''}</td>
    </tr>`).join('');
}

// The item list shows only for a partial count
form.addEventListener('change', (e) => {
  if (e.target.name === 'count_type') document.getElementById('item-box').hidden = e.target.value !== '抽盤';
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = {
    name: form.name.value,
    count_type: form.count_type.value,
    counter_id: form.counter_id.value,
    item_ids: [...form.querySelectorAll('input[name="item_ids"]:checked')].map((c) => c.value),
  };
  try {
    const { id, message } = await api('POST', '/api/counts', body);
    setFlash(message);
    location.href = 'count.html?id=' + id;
  } catch (err) {
    showMessage(err.message, 'error');
  }
});

initPage({ managerOnly: true }).then(load).catch((err) => showMessage(err.message, 'error'));
