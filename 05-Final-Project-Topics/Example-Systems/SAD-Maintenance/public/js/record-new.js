// UI-03 record maintenance (FR-REC-01..04)

const planId = new URLSearchParams(location.search).get('plan_id');
const form = document.getElementById('record-form');
let plan = null;

function field(label, value) {
  return `<dt>${label}</dt><dd>${value}</dd>`;
}

async function load() {
  const data = await api('GET', `/api/plans/${encodeURIComponent(planId)}/record-form`);
  plan = data.plan;
  document.getElementById('detail').innerHTML = [
    field('設備', esc(`${plan.equip_no} ${plan.equip_name}`)),
    field('產線／位置', esc(`${plan.line}／${plan.location}`)),
    field('保養類別', esc(`${plan.plan_type}（每 ${plan.cycle_days} 天）`)),
    field('負責人', esc(plan.owner_name)),
    field('上次保養日', esc(plan.last_done || '尚無紀錄')),
    field('下次應保養日', `${esc(plan.next_due)} ${badge(plan.due_status)}`),
  ].join('');

  if (data.blocked) {
    showMessage(data.blocked, 'error');
    return;
  }
  form.done_date.value = data.today;
  form.done_date.max = data.today;
  document.getElementById('items').innerHTML = itemEditorRows(plan.items.map((item) => ({ item })));
  form.hidden = false;
}

document.getElementById('all-normal').addEventListener('click', () => setAllNormal(form, plan.items.length));

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const { message } = await api('POST', `/api/plans/${encodeURIComponent(planId)}/records`, {
      done_date: form.done_date.value,
      note: form.note.value,
      items: readItemResults(form, plan.items.length),
    });
    setFlash(message);
    location.href = 'index.html';
  } catch (err) {
    showMessage(err.message, 'error');
  }
});

initPage().then(load).catch((err) => showMessage(err.message, 'error'));
