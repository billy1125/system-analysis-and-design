// UI-08 visitor pass management (FR-ADM-02)

const form = document.getElementById('pass-form');
let rows = [];

async function load() {
  ({ rows } = await api('GET', '/api/admin/passes'));
  document.getElementById('rows').innerHTML = rows.map((p) => `
    <tr>
      <td>${esc(p.pass_no)}</td>
      <td>${p.is_active ? '啟用' : '<span class="muted">停用</span>'}</td>
      <td>${esc(p.note)}</td>
      <td><button class="small secondary" data-id="${p.id}">${p.is_active ? '停用' : '啟用'}</button></td>
    </tr>`).join('');
}

document.getElementById('rows').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-id]');
  if (!btn) return;
  const pass = rows.find((r) => r.id === Number(btn.dataset.id));
  const action = pass.is_active ? '停用' : '啟用';
  // Ask for the note (e.g. reason for disabling); cancel stops the action
  const note = prompt(`${action}訪客證 ${pass.pass_no}，請填寫備註：`, pass.note || '');
  if (note === null) return;
  try {
    const { message } = await api('PUT', `/api/admin/passes/${pass.id}/active`, {
      is_active: pass.is_active ? 0 : 1,
      note,
    });
    showMessage(message, 'ok');
    load();
  } catch (err) {
    showMessage(err.message, 'error');
  }
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const { message } = await api('POST', '/api/admin/passes', { pass_no: form.pass_no.value, note: form.note.value });
    showMessage(message, 'ok');
    form.reset();
    load();
  } catch (err) {
    showMessage(err.message, 'error');
  }
});

initPage({ adminOnly: true }).then(load).catch((err) => showMessage(err.message, 'error'));
