// UI-04 count detail and entry (FR-CNT-04..06)

const countId = new URLSearchParams(location.search).get('id');
let data = null;

function field(label, value) {
  return `<dt>${label}</dt><dd>${value}</dd>`;
}

function render() {
  const c = data.count;
  document.getElementById('title').textContent = `盤點單明細 ${c.count_no}`;
  document.getElementById('info').innerHTML = [
    field('盤點單號', esc(c.count_no)),
    field('名稱', esc(c.name)),
    field('類別', esc(c.count_type)),
    field('盤點人員', esc(c.counter_name)),
    field('狀態', badge(c.status)),
    field('進度', `已盤 ${c.counted_count}／共 ${c.line_count} 項`),
    field('建立人', esc(c.created_by_name)),
    field('建立時間', esc(shortTime(c.created_at))),
    field('結案人', esc(c.closed_by_name)),
    field('結案時間', esc(shortTime(c.closed_at))),
    field('盤盈項數', c.gain_count),
    field('盤虧項數', c.loss_count),
  ].join('');

  document.getElementById('actions').innerHTML = data.can_close
    ? '<button type="button" id="close-count">結案</button>' : '';

  // Inputs only while counting, and only for the assigned counter or a manager
  const edit = data.can_enter;
  document.getElementById('op-head').hidden = !edit;
  document.getElementById('rows').innerHTML = data.lines.map((l) => `
    <tr data-id="${l.id}">
      <td>${esc(l.location)}</td>
      <td>${esc(l.item_no)}</td>
      <td>${esc(l.name)}</td>
      <td>${esc(l.spec)}</td>
      <td>${esc(l.unit)}</td>
      <td>${l.book}</td>
      <td>${edit ? `<input name="counted_qty" type="number" min="0" max="99999" value="${l.counted_qty ?? ''}">` : (l.counted_qty ?? '')}</td>
      <td>${signed(l.diff)}</td>
      <td>${edit ? `<input name="remark" maxlength="100" value="${esc(l.remark)}">` : esc(l.remark)}</td>
      <td>${esc(l.counted_by_name)}</td>
      <td>${esc(shortTime(l.counted_at))}</td>
      ${edit ? '<td><button type="button" class="small" data-save>儲存</button></td>' : ''}
    </tr>`).join('');
}

async function load() {
  data = await api('GET', '/api/counts/' + encodeURIComponent(countId));
  render();
}

// Save one line at a time
document.getElementById('rows').addEventListener('click', async (e) => {
  if (!e.target.closest('button[data-save]')) return;
  const tr = e.target.closest('tr[data-id]');
  try {
    const { message } = await api('PUT', '/api/count-lines/' + tr.dataset.id, {
      counted_qty: tr.querySelector('[name="counted_qty"]').value,
      remark: tr.querySelector('[name="remark"]').value,
    });
    await load();
    showMessage(message, 'ok');
  } catch (err) {
    showMessage(err.message, 'error');
  }
});

document.getElementById('actions').addEventListener('click', async (e) => {
  if (!e.target.closest('#close-count')) return;
  if (!confirm('確定結案？有盤差的料號會把帳面數量改成實盤數量')) return;
  try {
    const { message } = await api('PUT', `/api/counts/${encodeURIComponent(countId)}/close`);
    await load();
    showMessage(message, 'ok');
  } catch (err) {
    showMessage(err.message, 'error');
  }
});

initPage().then(load).catch((err) => showMessage(err.message, 'error'));
