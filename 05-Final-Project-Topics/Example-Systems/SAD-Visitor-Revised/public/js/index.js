// UI-02 on-site visitor list: check-out (FR-12), today / earlier split (FR-11),
// late check-out (FR-24)

const lateForm = document.getElementById('late-form');
let rowsById = {};
let lateVisitId = null;

function rowHtml(r) {
  return `
    <tr>
      <td>${esc(shortTime(r.check_in_at))}</td>
      <td>${esc(r.visitor_name)}</td>
      <td>${esc(r.company)}</td>
      <td>${esc(r.employee_name)}</td>
      <td>${esc(r.extension)}</td>
      <td>${esc(r.pass_no)}</td>
      <td>${r.companions}</td>
      <td>
        <button class="small" data-action="checkout" data-id="${r.id}">離廠</button>
        <button class="small secondary" data-action="late" data-id="${r.id}">補登離廠</button>
      </td>
    </tr>`;
}

function fillTable(id, rows, emptyText) {
  document.getElementById(id).innerHTML = rows.length
    ? rows.map(rowHtml).join('')
    : `<tr><td colspan="8" class="empty">${emptyText}</td></tr>`;
}

async function loadOnsite() {
  const { rows, summary } = await api('GET', '/api/onsite');
  rowsById = Object.fromEntries(rows.map((r) => [r.id, r]));
  document.getElementById('summary').innerHTML =
    `今日報到 <strong>${summary.today_count}</strong> 位、` +
    `非今日報到 <strong class="${summary.earlier_count ? 'warn' : ''}">${summary.earlier_count}</strong> 位，` +
    `另有隨行 <strong>${summary.companion_count}</strong> 人`;
  fillTable('earlier-rows', rows.filter((r) => !r.is_today), '沒有非今日報到的訪客');
  fillTable('today-rows', rows.filter((r) => r.is_today), '今天還沒有在廠訪客');
}

function openLateForm(r) {
  lateVisitId = r.id;
  document.getElementById('late-title').textContent =
    `補登離廠：${r.visitor_name}（報到時間 ${shortTime(r.check_in_at)}）`;
  lateForm.reset();
  lateForm.hidden = false;
  lateForm.check_out_at.focus();
}

document.querySelector('main').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const r = rowsById[btn.dataset.id];
  clearMessage();
  if (btn.dataset.action === 'late') return openLateForm(r);

  if (!confirm(`確定登記 ${r.visitor_name} 離廠？`)) return;
  try {
    const { message } = await api('POST', `/api/visits/${r.id}/checkout`);
    showMessage(message, 'ok');
  } catch (err) {
    showMessage(err.message, 'error');
  }
  loadOnsite();
});

lateForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const { message } = await api('POST', `/api/visits/${lateVisitId}/late-checkout`, {
      check_out_at: lateForm.check_out_at.value,
      reason: lateForm.reason.value,
    });
    lateForm.hidden = true;
    showMessage(message, 'ok');
    loadOnsite();
  } catch (err) {
    showMessage(err.message, 'error');
  }
});

document.getElementById('late-cancel').addEventListener('click', () => {
  lateForm.hidden = true;
});

initPage().then(loadOnsite).catch((err) => showMessage(err.message, 'error'));
