// UI-04 session management: filter and create (FR-SES-01, 02)

const form = document.getElementById('new-form');
const courseFilter = document.getElementById('f-course');
const statusFilter = document.getElementById('f-status');
let coursesLoaded = false;

async function load() {
  const params = new URLSearchParams({ course_id: courseFilter.value, status: statusFilter.value });
  const { rows, courses } = await api('GET', '/api/sessions?' + params);

  if (!coursesLoaded) {
    courseFilter.innerHTML = optionTags(courses.map((c) => ({ value: c.id, label: `${c.course_no} ${c.name}` })), '', '全部');
    // Only active courses can get a new session
    form.course_id.innerHTML = optionTags(
      courses.filter((c) => c.is_active).map((c) => ({ value: c.id, label: `${c.course_no} ${c.name}` })), '', '請選擇');
    coursesLoaded = true;
  }

  const tbody = document.getElementById('rows');
  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty">沒有符合條件的梯次</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map((s) => `
    <tr class="clickable" data-id="${s.id}">
      <td>${esc(s.session_date)}</td>
      <td>${esc(s.start_time)}–${esc(s.end_time)}</td>
      <td>${esc(s.course_name)}</td>
      <td>${esc(s.location)}</td>
      <td>${esc(s.instructor)}</td>
      <td>${s.enrolled} / ${s.capacity}</td>
      <td>${badge(s.display_status)}</td>
    </tr>`).join('');
}

document.getElementById('rows').addEventListener('click', (e) => {
  const tr = e.target.closest('tr[data-id]');
  if (tr) location.href = 'session.html?id=' + tr.dataset.id;
});

courseFilter.addEventListener('change', () => load().catch((err) => showMessage(err.message, 'error')));
statusFilter.addEventListener('change', () => load().catch((err) => showMessage(err.message, 'error')));

document.getElementById('show-new').addEventListener('click', () => { form.hidden = false; });
document.getElementById('hide-new').addEventListener('click', () => { form.hidden = true; form.reset(); });

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const { message, id } = await api('POST', '/api/sessions', {
      course_id: form.course_id.value,
      session_date: form.session_date.value,
      start_time: form.start_time.value,
      end_time: form.end_time.value,
      location: form.location.value,
      instructor: form.instructor.value,
      capacity: form.capacity.value,
    });
    setFlash(message);
    location.href = 'session.html?id=' + id;
  } catch (err) {
    showMessage(err.message, 'error');
  }
});

initPage({ hrOnly: true }).then(load).catch((err) => showMessage(err.message, 'error'));
