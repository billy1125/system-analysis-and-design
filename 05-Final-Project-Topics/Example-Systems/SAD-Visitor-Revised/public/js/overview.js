// UI-12 daily visitor overview (FR-25) and CSV export (FR-26). Admin only.

function companionText(r) {
  if (r.companion_names.length > 0) return r.companion_names.map(esc).join('、');
  // Old records only have a number (data conversion rule)
  if (r.companions > 0) return `（未記錄姓名，共 ${r.companions} 人）`;
  return '';
}

async function loadOverview() {
  clearMessage();
  const tbody = document.getElementById('rows');
  try {
    const { rows, summary } = await api('GET', '/api/overview');
    document.getElementById('summary').innerHTML =
      `${esc(summary.date)}　預約中 <strong>${summary.booked}</strong>　` +
      `在廠 <strong>${summary.onsite}</strong>　` +
      `在廠（非今日報到） <strong class="warn">${summary.onsite_earlier}</strong>　` +
      `已離廠 <strong>${summary.left}</strong>　已取消 <strong>${summary.cancelled}</strong>`;
    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="10" class="empty">今天沒有外來人員</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map((r) => `
      <tr>
        <td>${r.status === '在廠（非今日報到）' ? `<span class="warn">${esc(r.status)}</span>` : esc(r.status)}</td>
        <td>${esc(r.visitor_name)}</td>
        <td>${esc(r.company)}</td>
        <td>${companionText(r)}</td>
        <td>${esc(r.employee_name)}（${esc(r.department)}）</td>
        <td>${esc(r.extension)}</td>
        <td>${esc(r.expected_time)}</td>
        <td>${esc(shortTime(r.check_in_at))}</td>
        <td>${esc(shortTime(r.check_out_at))}</td>
        <td>${esc(r.pass_no)}</td>
      </tr>`).join('');
  } catch (err) {
    tbody.innerHTML = '';
    showMessage(err.message, 'error');
  }
}

// Download the CSV through fetch so an error can be shown on this page
document.getElementById('export').addEventListener('click', async () => {
  clearMessage();
  try {
    const res = await fetch('/api/overview/export');
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || '匯出失敗');
    }
    const disposition = res.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename\*=UTF-8''([^;]+)/);
    const filename = match ? decodeURIComponent(match[1]) : '當日訪客總覽.csv';
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    showMessage(`已匯出 ${filename}`, 'ok');
  } catch (err) {
    showMessage(`${err.message}。請改用瀏覽器列印這一頁（Ctrl + P）。`, 'error');
  }
});

initPage({ roles: [ROLE_ADMIN] }).then(loadOverview).catch((err) => showMessage(err.message, 'error'));
