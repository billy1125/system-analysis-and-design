// UI-03 my training records (FR-ENR-04)

// One row per sign-up
function recordRows(rows) {
  if (rows.length === 0) return '<tr><td colspan="7" class="empty">還沒有訓練紀錄</td></tr>';
  return rows.map((r) => `
    <tr>
      <td>${esc(r.session_date)}</td>
      <td>${esc(r.course_name)}</td>
      <td>${esc(r.category)}</td>
      <td>${hoursText(r.hours)}</td>
      <td>${badge(r.display_status)}</td>
      <td>${badge(r.result)}</td>
      <td>${esc(r.note)}</td>
    </tr>`).join('');
}

async function load() {
  const { rows, total_hours: total } = await api('GET', '/api/my/records');
  document.getElementById('summary').innerHTML = `累計完成時數 <strong>${hoursText(total)}</strong> 小時`;
  document.getElementById('rows').innerHTML = recordRows(rows);
}

initPage().then(load).catch((err) => showMessage(err.message, 'error'));
