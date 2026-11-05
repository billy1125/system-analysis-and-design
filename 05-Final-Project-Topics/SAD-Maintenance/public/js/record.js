// UI-05 record detail and edit (FR-QRY-02, FR-REC-05)

const recordId = new URLSearchParams(location.search).get('id');
const form = document.getElementById('record-form');
let data = null;
let editing = false;

function field(label, value, wide = false) {
  return `<dt>${label}</dt><dd${wide ? ' class="wide"' : ''}>${value}</dd>`;
}

function render() {
  const r = data.record;
  document.getElementById('detail').innerHTML = [
    field('設備', esc(`${r.equip_no} ${r.equip_name}`)),
    field('保養類別', esc(`${r.plan_type}（每 ${r.cycle_days} 天）`)),
    field('保養日期', editing
      ? `<input name="done_date" type="date" max="${esc(data.today)}" value="${esc(r.done_date)}">`
      : esc(r.done_date)),
    field('執行人', esc(r.done_by_name)),
    field('紀錄結果', badge(r.result)),
    field('登錄時間', esc(shortTime(r.created_at))),
    field('最後修改時間', esc(shortTime(r.updated_at)) || '<span class="muted">未修改</span>'),
    field('', ''),
    field('備註', editing ? `<textarea name="note" maxlength="200">${esc(r.note)}</textarea>` : esc(r.note), true),
  ].join('');

  document.getElementById('items').innerHTML = editing
    ? itemEditorRows(data.items)
    : data.items.map((i) => `
      <tr>
        <td>${i.seq}</td>
        <td>${esc(i.item)}</td>
        <td>${badge(i.result)}</td>
        <td>${esc(i.remark)}</td>
      </tr>`).join('');

  const actions = document.getElementById('actions');
  if (!data.can_edit) {
    actions.innerHTML = '';
  } else if (editing) {
    actions.innerHTML = '<button type="submit">儲存</button><button type="button" class="secondary" id="cancel-edit">取消</button>';
    document.getElementById('cancel-edit').addEventListener('click', () => { editing = false; clearMessage(); render(); });
  } else {
    actions.innerHTML = '<button type="button" id="edit">修改</button>';
    document.getElementById('edit').addEventListener('click', () => { editing = true; render(); });
  }
}

async function load() {
  data = await api('GET', '/api/records/' + encodeURIComponent(recordId));
  render();
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const { message } = await api('PUT', '/api/records/' + encodeURIComponent(recordId), {
      done_date: form.done_date.value,
      note: form.note.value,
      items: readItemResults(form, data.items.length),
    });
    editing = false;
    await load();
    showMessage(message, 'ok');
  } catch (err) {
    showMessage(err.message, 'error');
  }
});

initPage().then(load).catch((err) => showMessage(err.message, 'error'));
