// UI-05 work order detail and actions (FR-QRY-02, FR-WO-03..06, FR-RPT-01..04)

const orderId = new URLSearchParams(location.search).get('id');
const form = document.getElementById('action-form');
let user = null;
let data = null;
let mode = null; // which form is open: edit, dispatch, finish, cancel

// Buttons for each role and status (spec 6.4). Finished and cancelled orders have none.
const PLANNER_ACTIONS = {
  待派工: [['edit', '修改'], ['dispatch', '派工'], ['cancel', '取消工單']],
  已派工: [['edit', '修改'], ['dispatch', '改派'], ['cancel', '取消工單']],
};
const LEADER_ACTIONS = {
  已派工: [['start', '開工']],
  生產中: [['finish', '完工回報']],
};

function field(label, value, wide = false) {
  return `<dt>${label}</dt><dd${wide ? ' class="wide"' : ''}>${value}</dd>`;
}

function actionsFor(o) {
  if (user.role === ROLE_PLANNER) return PLANNER_ACTIONS[o.status] || [];
  // Team leaders act only on orders of their own work center
  if (o.work_center_id && o.work_center_id === user.work_center_id) return LEADER_ACTIONS[o.status] || [];
  return [];
}

function render() {
  const o = data.order;
  document.getElementById('title').textContent = `工單明細 ${o.wo_no}`;
  document.getElementById('order').innerHTML = [
    field('工單號', esc(o.wo_no)),
    field('訂單號', esc(o.so_no)),
    field('產品', esc(`${o.part_no} ${o.product_name}`)),
    field('數量', o.qty),
    field('交期', esc(o.due_date)),
    field('交期狀態', dueText(o)),
    field('備註', esc(o.note), true),
    field('開立人', esc(o.created_by_name)),
    field('開立時間', esc(shortTime(o.created_at))),
    field('最後修改時間', esc(shortTime(o.updated_at)) || '<span class="muted">未修改</span>'),
    field('', ''),
  ].join('');

  document.getElementById('dispatch').innerHTML = [
    field('狀態', badge(o.status)),
    field('工作中心', esc(o.wc_name) || '—'),
    field('預定生產日', esc(o.plan_date) || '—'),
    field('', ''),
    field('派工人', esc(o.dispatched_by_name)),
    field('派工時間', esc(shortTime(o.dispatched_at))),
  ].join('');

  const report = [
    field('開工人', esc(o.started_by_name)),
    field('開工時間', esc(shortTime(o.started_at))),
    field('良品數', o.good_qty ?? ''),
    field('不良數', o.ng_qty ?? ''),
    field('良率', esc(o.yield_rate)),
    field('', ''),
  ];
  if (o.status === '已完工') {
    report.push(field('完工備註', esc(o.close_note), true),
      field('回報人', esc(o.closed_by_name)), field('完工時間', esc(shortTime(o.closed_at))));
  } else if (o.status === '已取消') {
    report.push(field('取消理由', esc(o.close_note), true),
      field('取消人', esc(o.closed_by_name)), field('取消時間', esc(shortTime(o.closed_at))));
  }
  document.getElementById('report').innerHTML = report.join('');

  document.getElementById('actions').innerHTML = actionsFor(o)
    .map(([key, label]) => `<button type="button" data-mode="${key}">${label}</button>`).join('');
}

function openForm(newMode) {
  const o = data.order;
  mode = newMode;
  const fields = document.getElementById('form-fields');
  if (mode === 'edit') {
    document.getElementById('form-title').textContent = '修改工單';
    fields.innerHTML = orderFieldsHtml(o, data.products);
  } else if (mode === 'dispatch') {
    const redispatch = o.status === '已派工';
    document.getElementById('form-title').textContent = redispatch ? '改派' : '派工';
    fields.innerHTML = `<div class="row">
      <label>工作中心<select name="work_center_id">${optionTags(
        data.work_centers.map((w) => ({ value: w.id, label: w.name })), redispatch ? o.work_center_id : '', '請選擇')}</select></label>
      <label>預定生產日<input name="plan_date" type="date" value="${esc(redispatch ? o.plan_date : data.today)}"></label>
    </div>`;
  } else if (mode === 'finish') {
    document.getElementById('form-title').textContent = '完工回報';
    fields.innerHTML = `<div class="row">
      <label>良品數<input name="good_qty" type="number" min="0" max="99999"></label>
      <label>不良數<input name="ng_qty" type="number" min="0" max="99999"></label>
    </div>
    <div class="row"><label>完工備註<textarea name="close_note" maxlength="200"></textarea></label></div>`;
  } else {
    document.getElementById('form-title').textContent = '取消工單';
    fields.innerHTML = '<div class="row"><label>取消理由<textarea name="close_note" maxlength="200"></textarea></label></div>';
  }
  form.hidden = false;
  clearMessage();
}

function closeForm() {
  mode = null;
  form.hidden = true;
}

async function load() {
  data = await api('GET', '/api/orders/' + encodeURIComponent(orderId));
  render();
}

const url = () => '/api/orders/' + encodeURIComponent(orderId);

// Starting has no form, only a confirm box
async function startOrder() {
  if (!confirm(`確定 ${data.order.wo_no} 開工？`)) return;
  try {
    const { message } = await api('PUT', url() + '/start');
    closeForm();
    await load();
    showMessage(message, 'ok');
  } catch (err) {
    showMessage(err.message, 'error');
  }
}

document.getElementById('actions').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-mode]');
  if (!btn) return;
  if (btn.dataset.mode === 'start') startOrder();
  else openForm(btn.dataset.mode);
});

document.getElementById('cancel').addEventListener('click', () => { closeForm(); clearMessage(); });

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    let result;
    if (mode === 'edit') {
      result = await api('PUT', url(), readOrderFields(form));
    } else if (mode === 'dispatch') {
      result = await api('PUT', url() + '/dispatch', { work_center_id: form.work_center_id.value, plan_date: form.plan_date.value });
    } else if (mode === 'finish') {
      result = await api('PUT', url() + '/finish', {
        good_qty: form.good_qty.value, ng_qty: form.ng_qty.value, close_note: form.close_note.value,
      });
    } else {
      result = await api('PUT', url() + '/cancel', { close_note: form.close_note.value });
    }
    closeForm();
    await load();
    showMessage(result.message, 'ok');
  } catch (err) {
    showMessage(err.message, 'error');
  }
});

initPage().then((u) => { user = u; return load(); }).catch((err) => showMessage(err.message, 'error'));
