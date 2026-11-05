// UI-10 appointment list (FR-21, FR-23). "Check in" opens the check-in page (FR-22).

const form = document.getElementById('date-form');

async function load() {
  clearMessage();
  const tbody = document.getElementById('rows');
  try {
    const { rows } = await api('GET', '/api/appointments?date=' + encodeURIComponent(form.date.value));
    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="10" class="empty">這一天沒有預約</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map((a) => `
      <tr>
        <td>${esc(a.expected_time)}</td>
        <td>${esc(a.visitor_name)}</td>
        <td>${esc(a.visitor_company)}</td>
        <td>${esc(a.visitor_phone)}</td>
        <td>${esc(a.employee_name)}（${esc(a.department)}）</td>
        <td>${esc(a.extension)}</td>
        <td>${esc(a.purpose)}</td>
        <td>${esc(a.note)}</td>
        <td>${a.status_label === '未到' ? `<span class="warn">${a.status_label}</span>` : esc(a.status_label)}</td>
        <td>${a.can_check_in ? `<a href="register.html?appointment=${a.id}"><button type="button" class="small">報到</button></a>` : ''}</td>
      </tr>`).join('');
  } catch (err) {
    tbody.innerHTML = '';
    showMessage(err.message, 'error');
  }
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  load();
});

initPage().then(() => {
  form.date.value = localDate();
  load();
}).catch((err) => showMessage(err.message, 'error'));
