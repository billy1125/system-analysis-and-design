// UI-07 course management (FR-ADM-01). No delete button on purpose.

const form = document.getElementById('course-form');
let rows = [];
let editingId = null;

function resetForm() {
  editingId = null;
  form.reset();
  form.hours.readOnly = false;
  document.getElementById('form-title').textContent = '新增課程';
}

async function load() {
  const data = await api('GET', '/api/admin/courses');
  rows = data.rows;
  if (!form.category.options.length) {
    form.category.innerHTML = optionTags(data.categories.map((c) => ({ value: c, label: c })), '', '請選擇');
  }
  document.getElementById('rows').innerHTML = rows.map((c) => `
    <tr>
      <td>${esc(c.course_no)}</td>
      <td>${esc(c.name)}</td>
      <td>${esc(c.category)}</td>
      <td>${hoursText(c.hours)}</td>
      <td>${esc(c.description)}</td>
      <td>${c.session_count}</td>
      <td>${c.is_active ? '啟用' : '<span class="muted">停用</span>'}</td>
      <td>
        <button class="small secondary" data-edit="${c.id}">修改</button>
        <button class="small secondary" data-active="${c.id}">${c.is_active ? '停用' : '啟用'}</button>
      </td>
    </tr>`).join('');
}

document.getElementById('rows').addEventListener('click', async (e) => {
  const editBtn = e.target.closest('button[data-edit]');
  const activeBtn = e.target.closest('button[data-active]');
  if (editBtn) {
    const c = rows.find((r) => r.id === Number(editBtn.dataset.edit));
    editingId = c.id;
    form.course_no.value = c.course_no;
    form.name.value = c.name;
    form.category.value = c.category;
    form.hours.value = c.hours;
    // Hours are locked once the course has a session
    form.hours.readOnly = c.session_count > 0;
    form.description.value = c.description || '';
    document.getElementById('form-title').textContent = `修改課程 ${c.course_no}`;
    clearMessage();
  } else if (activeBtn) {
    const c = rows.find((r) => r.id === Number(activeBtn.dataset.active));
    try {
      const { message } = await api('PUT', `/api/admin/courses/${c.id}/active`, { is_active: c.is_active ? 0 : 1 });
      showMessage(message, 'ok');
    } catch (err) {
      showMessage(err.message, 'error');
    }
    load();
  }
});

document.getElementById('reset').addEventListener('click', () => { resetForm(); clearMessage(); });

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = {
    course_no: form.course_no.value,
    name: form.name.value,
    category: form.category.value,
    hours: form.hours.value,
    description: form.description.value,
  };
  try {
    const { message } = editingId
      ? await api('PUT', `/api/admin/courses/${editingId}`, body)
      : await api('POST', '/api/admin/courses', body);
    showMessage(message, 'ok');
    resetForm();
    load();
  } catch (err) {
    showMessage(err.message, 'error');
  }
});

initPage({ hrOnly: true }).then(load).catch((err) => showMessage(err.message, 'error'));
