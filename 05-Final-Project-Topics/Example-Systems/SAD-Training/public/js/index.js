// UI-02 open sessions: sign up and cancel (FR-ENR-01..03)

async function load() {
  const { rows } = await api('GET', '/api/open-sessions');
  const tbody = document.getElementById('rows');
  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty">目前沒有開放報名的梯次</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map((r) => {
    let op;
    if (r.my_enrollment_id) {
      op = `<button class="small secondary" data-cancel="${r.my_enrollment_id}"
              data-label="${esc(`${r.course_name}（${r.session_date}）`)}">取消報名</button>`;
    } else if (r.enrolled >= r.capacity) {
      op = '<span class="muted">額滿</span>';
    } else {
      op = `<button class="small" data-enroll="${r.id}">報名</button>`;
    }
    return `
    <tr>
      <td>${esc(r.session_date)}</td>
      <td>${esc(r.start_time)}–${esc(r.end_time)}</td>
      <td>${esc(r.course_name)}</td>
      <td>${esc(r.category)}</td>
      <td>${hoursText(r.hours)}</td>
      <td>${esc(r.location)}</td>
      <td>${esc(r.instructor)}</td>
      <td>${r.enrolled} / ${r.capacity}</td>
      <td>${op}</td>
    </tr>`;
  }).join('');
}

document.getElementById('rows').addEventListener('click', async (e) => {
  const enrollBtn = e.target.closest('button[data-enroll]');
  const cancelBtn = e.target.closest('button[data-cancel]');
  try {
    if (enrollBtn) {
      const { message } = await api('POST', '/api/my/enrollments', { session_id: Number(enrollBtn.dataset.enroll) });
      showMessage(message, 'ok');
    } else if (cancelBtn) {
      if (!confirm(`確定取消報名 ${cancelBtn.dataset.label}？`)) return;
      const { message } = await api('DELETE', `/api/my/enrollments/${cancelBtn.dataset.cancel}`);
      showMessage(message, 'ok');
    } else {
      return;
    }
  } catch (err) {
    showMessage(err.message, 'error');
  }
  load();
});

initPage().then(load).catch((err) => showMessage(err.message, 'error'));
