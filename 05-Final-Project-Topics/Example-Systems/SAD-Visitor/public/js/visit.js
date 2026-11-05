// UI-05 visit detail and edit (FR-QRY-03..05). No delete button on purpose.

const visitId = new URLSearchParams(location.search).get('id');
const form = document.getElementById('visit-form');
let data = null;
let editing = false;

// Stay time = check-out time minus check-in time
function stayTime(v) {
  if (!v.check_out_at) return '尚未離廠';
  const ms = new Date(v.check_out_at.replace(' ', 'T')) - new Date(v.check_in_at.replace(' ', 'T'));
  const minutes = Math.round(ms / 60000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h} 小時 ${m} 分` : `${m} 分`;
}

function field(label, value) {
  return `<dt>${label}</dt><dd>${value}</dd>`;
}

function render() {
  const v = data.visit;
  const employeeCell = editing
    ? `<select name="employee_id">${optionTags(
      data.employees.map((e) => ({ value: e.id, label: `${e.name}（${e.department}）` })), v.employee_id)}</select>`
    : esc(`${v.employee_name}（${v.department}）分機 ${v.extension || '無'}`);
  const purposeCell = editing
    ? `<select name="purpose">${optionTags(data.purposes.map((p) => ({ value: p, label: p })), v.purpose)}</select>`
    : esc(v.purpose);
  const companionsCell = editing
    ? `<input name="companions" type="number" min="0" max="20" value="${v.companions}">`
    : v.companions;
  const plateCell = editing
    ? `<input name="plate_no" maxlength="10" value="${esc(v.plate_no)}">`
    : esc(v.plate_no) || '<span class="muted">無</span>';
  const noteCell = editing
    ? `<textarea name="note" maxlength="200">${esc(v.note)}</textarea>`
    : esc(v.note) || '<span class="muted">無</span>';

  document.getElementById('detail').innerHTML = [
    field('來訪編號', v.id),
    field('訪客證', esc(v.pass_no)),
    field('訪客姓名', esc(v.visitor_name)),
    field('公司', esc(v.company)),
    field('手機', esc(v.phone)),
    field('身分證字號', esc(v.id_number)),
    field('受訪員工', employeeCell),
    field('事由', purposeCell),
    field('隨行人數', companionsCell),
    field('車牌', plateCell),
    field('報到時間', esc(v.check_in_at)),
    field('報到登記人', esc(v.checkin_by_name)),
    field('離廠時間', v.check_out_at ? esc(v.check_out_at) : '<span class="muted">在廠</span>'),
    field('離廠登記人', esc(v.checkout_by_name) || '<span class="muted">無</span>'),
    field('停留時間', stayTime(v)),
    field('最後修改時間', esc(v.updated_at) || '<span class="muted">從未修改</span>'),
    field('備註', noteCell),
  ].join('');

  document.getElementById('actions').innerHTML = editing
    ? '<button type="submit">儲存</button><button type="button" class="secondary" id="cancel">取消</button>'
    : '<button type="button" id="edit">修改</button>';
  if (editing) document.getElementById('cancel').addEventListener('click', () => { editing = false; render(); });
  else document.getElementById('edit').addEventListener('click', () => { editing = true; render(); });
}

async function load() {
  data = await api('GET', '/api/visits/' + encodeURIComponent(visitId));
  render();
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const { message } = await api('PUT', '/api/visits/' + encodeURIComponent(visitId), {
      employee_id: form.employee_id.value,
      purpose: form.purpose.value,
      companions: form.companions.value,
      plate_no: form.plate_no.value,
      note: form.note.value,
    });
    editing = false;
    await load();
    showMessage(message, 'ok');
  } catch (err) {
    showMessage(err.message, 'error');
  }
});

initPage().then(load).catch((err) => showMessage(err.message, 'error'));
