// UI-03 check-in (FR-REG). The whole flow stays on this page.

// Which visitor the visit is for:
//   { mode: 'none' }                  not looked up yet
//   { mode: 'existing', visitorId }   picked from lookup result
//   { mode: 'new' }                   no match, fill the new visitor form
let selection = { mode: 'none' };

const lookupForm = document.getElementById('lookup-form');
const resultBox = document.getElementById('lookup-result');
const visitForm = document.getElementById('visit-form');

async function loadOptions() {
  const { employees, passes, purposes } = await api('GET', '/api/register/options');
  visitForm.employee_id.innerHTML = optionTags(
    employees.map((e) => ({ value: e.id, label: `${e.name}（${e.department}）` })), '', '請選擇');
  visitForm.purpose.innerHTML = optionTags(
    purposes.map((p) => ({ value: p, label: p })), '', '請選擇');
  visitForm.pass_id.innerHTML = optionTags(
    passes.map((p) => ({ value: p.id, label: p.pass_no })), '', '請選擇');
}

function showVisitor(v) {
  selection = { mode: 'existing', visitorId: v.id };
  resultBox.innerHTML = `
    <div class="row">
      <label>姓名<input value="${esc(v.name)}" readonly></label>
      <label>公司<input value="${esc(v.company)}" readonly></label>
      <label>身分證字號<input value="${esc(v.id_number)}" readonly></label>
    </div>`;
}

function showChoices(rows) {
  selection = { mode: 'none' };
  resultBox.innerHTML = `
    <table>
      <thead><tr><th>姓名</th><th>公司</th><th>手機</th><th>身分證字號</th><th></th></tr></thead>
      <tbody>${rows.map((v, i) => `
        <tr>
          <td>${esc(v.name)}</td><td>${esc(v.company)}</td><td>${esc(v.phone)}</td><td>${esc(v.id_number)}</td>
          <td><button type="button" class="small" data-index="${i}">選擇</button></td>
        </tr>`).join('')}
      </tbody>
    </table>`;
  resultBox.querySelectorAll('button[data-index]').forEach((btn) => {
    btn.addEventListener('click', () => showVisitor(rows[Number(btn.dataset.index)]));
  });
}

function showNewVisitorForm(phone) {
  selection = { mode: 'new' };
  resultBox.innerHTML = `
    <div class="row" id="new-visitor">
      <label>姓名<input name="name" maxlength="20"></label>
      <label>公司<input name="company" maxlength="40"></label>
      <label>手機<input name="phone" maxlength="10" value="${esc(phone)}"></label>
      <label>身分證字號<input name="id_number" maxlength="10"></label>
    </div>`;
}

function readNewVisitor() {
  const box = document.getElementById('new-visitor');
  const val = (name) => box.querySelector(`[name="${name}"]`).value;
  return { name: val('name'), company: val('company'), phone: val('phone'), id_number: val('id_number') };
}

lookupForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearMessage();
  const phone = lookupForm.phone.value.trim();
  try {
    const { rows, message } = await api('GET', '/api/visitors/lookup?phone=' + encodeURIComponent(phone));
    if (rows.length === 1) {
      showVisitor(rows[0]);
    } else if (rows.length > 1) {
      showMessage(message, 'ok');
      showChoices(rows);
    } else {
      showMessage(message, 'error');
      showNewVisitorForm(phone);
    }
  } catch (err) {
    selection = { mode: 'none' };
    resultBox.innerHTML = '';
    showMessage(err.message, 'error');
  }
});

// Typing a different phone number clears the earlier lookup
lookupForm.phone.addEventListener('input', () => {
  selection = { mode: 'none' };
  resultBox.innerHTML = '';
});

visitForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearMessage();
  const body = {
    employee_id: visitForm.employee_id.value,
    purpose: visitForm.purpose.value,
    companions: visitForm.companions.value,
    plate_no: visitForm.plate_no.value,
    note: visitForm.note.value,
    pass_id: visitForm.pass_id.value,
  };
  if (selection.mode === 'existing') body.visitor_id = selection.visitorId;
  if (selection.mode === 'new') body.new_visitor = readNewVisitor();

  try {
    const { message } = await api('POST', '/api/visits', body);
    setFlash(message);
    location.href = 'index.html';
  } catch (err) {
    showMessage(err.message, 'error');
    // Another receptionist may have taken the pass; refresh the list but keep other fields
    const keep = { employee_id: body.employee_id, purpose: body.purpose };
    await loadOptions();
    visitForm.employee_id.value = keep.employee_id;
    visitForm.purpose.value = keep.purpose;
  }
});

initPage().then(loadOptions).catch((err) => showMessage(err.message, 'error'));
