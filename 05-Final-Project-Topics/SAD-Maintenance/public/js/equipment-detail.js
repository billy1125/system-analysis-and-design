// UI-07 equipment detail, plans and history (FR-QRY-03, FR-ADM-02, 03)

const equipmentId = new URLSearchParams(location.search).get('id');
const form = document.getElementById('plan-form');
let data = null;
let editingId = null;
let isManager = false;

function field(label, value) {
  return `<dt>${label}</dt><dd>${value}</dd>`;
}

function resetForm() {
  editingId = null;
  form.reset();
  form.plan_type.disabled = false;
  form.first_due_date.readOnly = false;
  document.getElementById('form-title').textContent = '新增保養計畫';
}

function planButtons(p) {
  const buttons = [];
  if (p.is_active && data.equipment.is_active) buttons.push(`<button class="small" data-record="${p.id}">登錄保養</button>`);
  if (isManager) {
    buttons.push(`<button class="small secondary" data-edit="${p.id}">修改</button>`);
    buttons.push(`<button class="small secondary" data-active="${p.id}">${p.is_active ? '停用' : '啟用'}</button>`);
  }
  return buttons.join(' ');
}

function render() {
  const e = data.equipment;
  document.getElementById('detail').innerHTML = [
    field('設備編號', esc(e.equip_no)),
    field('名稱', esc(e.name)),
    field('型號', esc(e.model)),
    field('廠牌', esc(e.maker)),
    field('產線', esc(e.line)),
    field('位置', esc(e.location)),
    field('狀態', e.is_active ? '使用中' : '<span class="muted">停用</span>'),
  ].join('');

  // Only active equipment can get a new plan
  form.hidden = !isManager || (!e.is_active && !editingId);
  if (!form.plan_type.options.length) {
    form.plan_type.innerHTML = optionTags(data.plan_types.map((t) => ({ value: t, label: t })), '', '請選擇');
  }
  const ownerValue = form.owner_id.value;
  form.owner_id.innerHTML = optionTags(data.owners.map((u) => ({ value: u.id, label: `${u.emp_no} ${u.name}` })), ownerValue, '請選擇');

  const plans = document.getElementById('plans');
  plans.innerHTML = data.plans.length === 0
    ? '<tr><td colspan="10" class="empty">這台設備還沒有保養計畫</td></tr>'
    : data.plans.map((p) => `
      <tr>
        <td>${esc(p.plan_type)}</td>
        <td>${p.cycle_days} 天</td>
        <td>${p.items.map(esc).join('<br>')}</td>
        <td>${esc(p.owner_name)}</td>
        <td>${esc(p.first_due_date)}</td>
        <td>${esc(p.last_done)}</td>
        <td>${esc(p.next_due)}</td>
        <td>${p.is_active ? badge(p.due_status) : '—'}</td>
        <td>${p.is_active ? '啟用' : '<span class="muted">停用</span>'}</td>
        <td>${planButtons(p)}</td>
      </tr>`).join('');

  const records = document.getElementById('records');
  records.innerHTML = data.records.length === 0
    ? '<tr><td colspan="5" class="empty">還沒有保養紀錄</td></tr>'
    : data.records.map((r) => `
      <tr class="clickable" data-id="${r.id}">
        <td>${esc(r.done_date)}</td>
        <td>${esc(r.plan_type)}</td>
        <td>${esc(r.done_by_name)}</td>
        <td>${badge(r.result)}</td>
        <td>${esc(r.note)}</td>
      </tr>`).join('');
}

async function load() {
  data = await api('GET', '/api/equipment/' + encodeURIComponent(equipmentId));
  render();
}

document.getElementById('plans').addEventListener('click', async (ev) => {
  const recordBtn = ev.target.closest('button[data-record]');
  const editBtn = ev.target.closest('button[data-edit]');
  const activeBtn = ev.target.closest('button[data-active]');
  if (recordBtn) {
    location.href = 'record-new.html?plan_id=' + recordBtn.dataset.record;
  } else if (editBtn) {
    const p = data.plans.find((r) => r.id === Number(editBtn.dataset.edit));
    editingId = p.id;
    form.hidden = false;
    form.plan_type.value = p.plan_type;
    form.plan_type.disabled = true;
    form.cycle_days.value = p.cycle_days;
    form.owner_id.value = String(p.owner_id);
    form.first_due_date.value = p.first_due_date;
    // First due date is locked once the plan has a record
    form.first_due_date.readOnly = !!p.last_done;
    form.items.value = p.items.join('\n');
    document.getElementById('form-title').textContent = `修改保養計畫：${p.plan_type}`;
    clearMessage();
  } else if (activeBtn) {
    const p = data.plans.find((r) => r.id === Number(activeBtn.dataset.active));
    try {
      const { message } = await api('PUT', `/api/plans/${p.id}/active`, { is_active: p.is_active ? 0 : 1 });
      await load();
      showMessage(message, 'ok');
    } catch (err) {
      showMessage(err.message, 'error');
    }
  }
});

document.getElementById('records').addEventListener('click', (ev) => {
  const tr = ev.target.closest('tr[data-id]');
  if (tr) location.href = 'record.html?id=' + tr.dataset.id;
});

document.getElementById('reset').addEventListener('click', () => { resetForm(); clearMessage(); render(); });

form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const body = {
    plan_type: form.plan_type.value,
    cycle_days: form.cycle_days.value,
    owner_id: form.owner_id.value,
    first_due_date: form.first_due_date.value,
    items: form.items.value,
  };
  try {
    const { message } = editingId
      ? await api('PUT', `/api/plans/${editingId}`, body)
      : await api('POST', `/api/equipment/${encodeURIComponent(equipmentId)}/plans`, body);
    resetForm();
    await load();
    showMessage(message, 'ok');
  } catch (err) {
    showMessage(err.message, 'error');
  }
});

initPage().then((user) => {
  isManager = user.role === 0;
  return load();
}).catch((err) => showMessage(err.message, 'error'));
