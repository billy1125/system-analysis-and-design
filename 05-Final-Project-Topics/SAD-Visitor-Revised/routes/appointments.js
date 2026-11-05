// CR-01 appointments
//   FR-19, FR-20: host employees manage their own appointments ("my appointments")
//   FR-21, FR-23: front desk lists appointments by date; no-show is derived

const { getDb, now, today } = require('../lib/db');
const { UserError } = require('../lib/http');
const { PURPOSES, text, fail, toId } = require('../lib/validate');

const STATUS_LABELS = { 0: '已預約', 1: '已報到', 2: '已取消' };

// BR-01: "no-show" is not stored. It is a booked appointment whose date has passed.
function withLabel(row) {
  const noShow = row.status === 0 && row.visit_date < today();
  return { ...row, status_label: noShow ? '未到' : STATUS_LABELS[row.status] };
}

// FR-20: only booked appointments dated today or later can be changed
function isEditable(row) {
  return row.status === 0 && row.visit_date >= today();
}

function checkAppointmentFields(body) {
  const a = {
    visitor_name: text(body.visitor_name),
    visitor_company: text(body.visitor_company),
    visitor_phone: text(body.visitor_phone),
    visit_date: text(body.visit_date),
    expected_time: text(body.expected_time),
    purpose: text(body.purpose),
    note: text(body.note),
  };
  if (!a.visitor_name) fail('請輸入訪客姓名');
  if (a.visitor_name.length > 20) fail('訪客姓名不可超過 20 字');
  if (!a.visitor_company) fail('請輸入公司名稱');
  if (a.visitor_company.length > 40) fail('公司名稱不可超過 40 字');
  if (!/^09\d{8}$/.test(a.visitor_phone)) fail('手機號碼格式錯誤，須為 09 開頭的 10 碼數字');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.visit_date)) fail('請選擇預約日期');
  if (a.visit_date < today()) fail('預約日期不得早於今天');
  if (!/^\d{2}:\d{2}$/.test(a.expected_time) || a.expected_time < '07:00' || a.expected_time > '18:00') {
    fail('預計到達時間須在 07:00 到 18:00 之間');
  }
  if (!PURPOSES.includes(a.purpose)) fail('請選擇來訪事由');
  if (a.note.length > 200) fail('備註不可超過 200 字');
  a.note = a.note || null;
  return a;
}

// ---------- host employee: my appointments (UI-11) ----------

function listMine({ user }) {
  const rows = getDb().prepare(`
    SELECT id, visitor_name, visitor_company, visitor_phone, visit_date, expected_time,
           purpose, note, status, created_at, updated_at
      FROM appointments
     WHERE employee_id = ?
     ORDER BY visit_date DESC, expected_time DESC
  `).all(user.employee_id);
  return {
    rows: rows.map((r) => ({ ...withLabel(r), editable: isEditable(r) })),
    purposes: PURPOSES,
    today: today(),
  };
}

// Load one of the user's own appointments. Others' appointments look like "not found" (NFR-07).
function loadMine(user, id) {
  const row = getDb()
    .prepare('SELECT * FROM appointments WHERE id = ? AND employee_id = ?')
    .get(toId(id), user.employee_id);
  if (!row) throw new UserError('找不到這筆預約', 404);
  return row;
}

function createMine({ body, user }) {
  const a = checkAppointmentFields(body);
  getDb().prepare(`
    INSERT INTO appointments (employee_id, visitor_name, visitor_company, visitor_phone, visit_date,
                              expected_time, purpose, note, status, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
  `).run(user.employee_id, a.visitor_name, a.visitor_company, a.visitor_phone, a.visit_date,
    a.expected_time, a.purpose, a.note, user.id, now());
  return { message: `已新增預約：${a.visit_date} ${a.expected_time} ${a.visitor_name}` };
}

function updateMine({ params, body, user }) {
  const row = loadMine(user, params.id);
  if (!isEditable(row)) fail('只有今天以後、狀態為已預約的預約可以修改');
  const a = checkAppointmentFields(body);
  getDb().prepare(`
    UPDATE appointments
       SET visitor_name = ?, visitor_company = ?, visitor_phone = ?, visit_date = ?,
           expected_time = ?, purpose = ?, note = ?, updated_at = ?
     WHERE id = ?
  `).run(a.visitor_name, a.visitor_company, a.visitor_phone, a.visit_date, a.expected_time,
    a.purpose, a.note, now(), row.id);
  return { message: '已儲存修改' };
}

function cancelMine({ params, user }) {
  const row = loadMine(user, params.id);
  if (!isEditable(row)) fail('只有今天以後、狀態為已預約的預約可以取消');
  getDb().prepare('UPDATE appointments SET status = 2, updated_at = ? WHERE id = ?').run(now(), row.id);
  return { message: `已取消 ${row.visitor_name} 的預約` };
}

// ---------- front desk: appointment list (UI-10) ----------

const LIST_SQL = `
  SELECT a.id, a.visitor_name, a.visitor_company, a.visitor_phone, a.visit_date, a.expected_time,
         a.purpose, a.note, a.status, a.employee_id,
         e.name AS employee_name, e.department, e.extension
    FROM appointments a
    JOIN employees e ON e.id = a.employee_id
`;

function listByDate({ query }) {
  const date = text(query.get('date')) || today();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail('日期格式錯誤');
  const rows = getDb().prepare(`${LIST_SQL} WHERE a.visit_date = ? ORDER BY a.expected_time`).all(date);
  // BR-02: only today's booked appointments can be checked in
  return {
    rows: rows.map((r) => ({ ...withLabel(r), can_check_in: r.status === 0 && r.visit_date === today() })),
    date,
  };
}

// Used by the check-in page to fill the form (FR-22)
function getOne({ params }) {
  const row = getDb().prepare(`${LIST_SQL} WHERE a.id = ?`).get(toId(params.id));
  if (!row) throw new UserError('找不到這筆預約', 404);
  return { appointment: { ...withLabel(row), can_check_in: row.status === 0 && row.visit_date === today() } };
}

module.exports = [
  { method: 'GET', path: '/api/my/appointments', access: 'employee', handler: listMine },
  { method: 'POST', path: '/api/my/appointments', access: 'employee', handler: createMine },
  { method: 'PUT', path: '/api/my/appointments/:id', access: 'employee', handler: updateMine },
  { method: 'POST', path: '/api/my/appointments/:id/cancel', access: 'employee', handler: cancelMine },
  { method: 'GET', path: '/api/appointments', access: 'staff', handler: listByDate },
  { method: 'GET', path: '/api/appointments/:id', access: 'staff', handler: getOne },
];
