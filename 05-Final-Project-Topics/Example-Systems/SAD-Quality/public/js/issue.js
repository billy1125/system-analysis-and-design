// UI-05 issue detail and actions (FR-QRY-02, FR-ISS-03..07)

const issueId = new URLSearchParams(location.search).get('id');
const form = document.getElementById('action-form');
let data = null;
let mode = null; // which form is open: edit, assign, close, reject

// Buttons shown for each status (spec 6.4). Finished issues have none.
const ACTIONS = {
  待處理: [['edit', '修改'], ['assign', '指派'], ['reject', '判定不成立']],
  處理中: [['edit', '修改'], ['assign', '改派'], ['close', '結案'], ['reject', '判定不成立']],
};

function field(label, value, wide = false) {
  return `<dt>${label}</dt><dd${wide ? ' class="wide"' : ''}>${value}</dd>`;
}

function render() {
  const i = data.issue;
  document.getElementById('title').textContent = `異常單明細 ${i.issue_no}`;
  document.getElementById('report').innerHTML = [
    field('異常單號', esc(i.issue_no)),
    field('發現時間', esc(shortTime(i.found_at))),
    field('回報人', esc(i.reporter)),
    field('產線', esc(i.line)),
    field('工站或機台', esc(i.station)),
    field('產品', esc(`${i.part_no} ${i.product_name}`) + (i.customer ? `<span class="muted">（${esc(i.customer)}）</span>` : '')),
    field('批號', esc(i.lot_no)),
    field('異常類別', esc(i.defect_name)),
    field('影響數量', i.qty),
    field('', ''),
    field('異常描述', esc(i.description), true),
    field('登記人', esc(i.created_by_name)),
    field('登記時間', esc(shortTime(i.created_at))),
    field('最後修改時間', esc(shortTime(i.updated_at)) || '<span class="muted">未修改</span>'),
  ].join('');

  const resultLabel = i.status === '不成立' ? '不成立理由' : '處理對策';
  document.getElementById('handling').innerHTML = [
    field('狀態', badge(i.status)),
    field('經過天數', `${i.days} 天`),
    field('責任單位', i.dept_name ? esc(`${i.dept_name}（${i.dept_contact} ${i.dept_ext}）`) : '—'),
    field('指派人', esc(i.assigned_by_name)),
    field('指派時間', esc(shortTime(i.assigned_at))),
    field('', ''),
    field(resultLabel, esc(i.resolution), true),
    field('結案人', esc(i.closed_by_name)),
    field('結案時間', esc(shortTime(i.closed_at))),
  ].join('');

  document.getElementById('actions').innerHTML = (ACTIONS[i.status] || [])
    .map(([key, label]) => `<button type="button" data-mode="${key}">${label}</button>`).join('');
}

function openForm(newMode) {
  const i = data.issue;
  mode = newMode;
  const fields = document.getElementById('form-fields');
  if (mode === 'edit') {
    document.getElementById('form-title').textContent = '修改登記資料';
    fields.innerHTML = issueFieldsHtml(i, data.products, data.defect_types, data.now);
  } else if (mode === 'assign') {
    const reassign = i.status === '處理中';
    document.getElementById('form-title').textContent = reassign ? '改派責任單位' : '指派責任單位';
    fields.innerHTML = `<div class="row"><label>責任單位<select name="dept_id">${optionTags(
      data.departments.map((d) => ({ value: d.id, label: `${d.name}（${d.contact} ${d.ext}）` })),
      reassign ? i.dept_id : '', '請選擇')}</select></label></div>`;
  } else {
    const label = mode === 'close' ? '處理對策' : '不成立理由';
    document.getElementById('form-title').textContent = mode === 'close' ? '結案' : '判定不成立';
    fields.innerHTML = `<div class="row"><label>${label}<textarea name="resolution" maxlength="200"></textarea></label></div>`;
  }
  form.hidden = false;
  clearMessage();
}

function closeForm() {
  mode = null;
  form.hidden = true;
}

async function load() {
  data = await api('GET', '/api/issues/' + encodeURIComponent(issueId));
  render();
}

document.getElementById('actions').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-mode]');
  if (btn) openForm(btn.dataset.mode);
});

document.getElementById('cancel').addEventListener('click', () => { closeForm(); clearMessage(); });

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const url = '/api/issues/' + encodeURIComponent(issueId);
  try {
    let result;
    if (mode === 'edit') result = await api('PUT', url, readIssueFields(form));
    else if (mode === 'assign') result = await api('PUT', url + '/assign', { dept_id: form.dept_id.value });
    else result = await api('PUT', `${url}/${mode}`, { resolution: form.resolution.value });
    closeForm();
    await load();
    showMessage(result.message, 'ok');
  } catch (err) {
    showMessage(err.message, 'error');
  }
});

initPage().then(load).catch((err) => showMessage(err.message, 'error'));
