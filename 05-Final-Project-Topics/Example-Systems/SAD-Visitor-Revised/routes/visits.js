// FR-QRY: search visit records, view detail, edit (no delete)

const { getDb, transaction, now, today } = require('../lib/db');
const { UserError } = require('../lib/http');
const { PURPOSES, text, fail, checkVisitInfo, toId } = require('../lib/validate');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// FR-QRY-01/02: date range on check-in date, keyword on visitor name, company, employee name
function search({ query }) {
  const from = text(query.get('from')) || today();
  const to = text(query.get('to')) || today();
  const keyword = text(query.get('q'));
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) fail('日期格式錯誤');
  if (from > to) fail('起始日期不可晚於結束日期');

  const like = `%${keyword}%`;
  const rows = getDb().prepare(`
    SELECT v.id, v.check_in_at, v.check_out_at, v.checkout_reason, v.purpose,
           vi.name AS visitor_name, vi.company, vi.id_number,
           e.name AS employee_name,
           p.pass_no
      FROM visits v
      JOIN visitors vi ON vi.id = v.visitor_id
      JOIN employees e ON e.id = v.employee_id
      JOIN visitor_passes p ON p.id = v.pass_id
     WHERE v.check_in_at >= ? AND v.check_in_at <= ?
       AND (? = '' OR vi.name LIKE ? OR vi.company LIKE ? OR e.name LIKE ?)
     ORDER BY v.check_in_at DESC
  `).all(`${from} 00:00:00`, `${to} 23:59:59`, keyword, like, like, like);
  return { rows, from, to, q: keyword };
}

function loadVisit(id) {
  return getDb().prepare(`
    SELECT v.*,
           vi.name AS visitor_name, vi.company, vi.phone, vi.id_number,
           e.name AS employee_name, e.department, e.extension,
           p.pass_no,
           ui.name AS checkin_by_name,
           uo.name AS checkout_by_name
      FROM visits v
      JOIN visitors vi ON vi.id = v.visitor_id
      JOIN employees e ON e.id = v.employee_id
      JOIN visitor_passes p ON p.id = v.pass_id
      JOIN users ui ON ui.id = v.checkin_by
      LEFT JOIN users uo ON uo.id = v.checkout_by
     WHERE v.id = ?
  `).get(id);
}

function companionNames(visitId) {
  return getDb()
    .prepare('SELECT name FROM visit_companions WHERE visit_id = ? ORDER BY id')
    .all(visitId)
    .map((c) => c.name);
}

// FR-QRY-03: all fields, plus options for the edit form
function detail({ params }) {
  const visit = loadVisit(toId(params.id));
  if (!visit) throw new UserError('找不到這筆來訪紀錄', 404);
  // Active employees, plus the current one even if no longer active
  const employees = getDb().prepare(`
    SELECT id, name, department FROM employees
     WHERE is_active = 1 OR id = ?
     ORDER BY emp_no
  `).all(visit.employee_id);
  return { visit, companion_names: companionNames(visit.id), employees, purposes: PURPOSES };
}

// FR-14 (revised): purpose, employee, companion names, plate and note can change.
// The old values are overwritten; only updated_at is recorded.
function update({ params, body }) {
  return transaction((db) => {
    const id = toId(params.id);
    const visit = db.prepare('SELECT id, employee_id, companions FROM visits WHERE id = ?').get(id);
    if (!visit) throw new UserError('找不到這筆來訪紀錄', 404);

    const employeeId = toId(body.employee_id);
    const employee = employeeId && db
      .prepare('SELECT 1 FROM employees WHERE id = ? AND (is_active = 1 OR id = ?)')
      .get(employeeId, visit.employee_id);
    if (!employee) fail('請選擇受訪員工');
    const info = checkVisitInfo(body);

    // Old records have a count but no names. Keep the count if no names are entered.
    const hadNames = db.prepare('SELECT COUNT(*) AS n FROM visit_companions WHERE visit_id = ?').get(id).n > 0;
    const keepOldCount = !hadNames && info.companion_names.length === 0;
    const companions = keepOldCount ? visit.companions : info.companion_names.length;

    db.prepare('DELETE FROM visit_companions WHERE visit_id = ?').run(id);
    const insertName = db.prepare('INSERT INTO visit_companions (visit_id, name) VALUES (?, ?)');
    for (const name of info.companion_names) insertName.run(id, name);

    db.prepare(`
      UPDATE visits
         SET purpose = ?, employee_id = ?, companions = ?, plate_no = ?, note = ?, updated_at = ?
       WHERE id = ?
    `).run(info.purpose, employeeId, companions, info.plate_no, info.note, now(), id);
    return { message: '已儲存修改' };
  });
}

module.exports = [
  { method: 'GET', path: '/api/visits', access: 'staff', handler: search },
  { method: 'GET', path: '/api/visits/:id', access: 'staff', handler: detail },
  { method: 'PUT', path: '/api/visits/:id', access: 'staff', handler: update },
];
