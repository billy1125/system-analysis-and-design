// FR-REG: visitor lookup and check-in (one page, no page change).
// Revised: check-in from an appointment (CR-01-2), companion names (CR-03-3).

const { getDb, transaction, now, today } = require('../lib/db');
const { PURPOSES, text, fail, checkVisitorFields, checkVisitInfo, toId } = require('../lib/validate');

// A pass is "in use" when an on-site visit points to it
const AVAILABLE_PASSES_SQL = `
  SELECT p.id, p.pass_no
    FROM visitor_passes p
   WHERE p.is_active = 1
     AND NOT EXISTS (SELECT 1 FROM visits v WHERE v.pass_id = p.id AND v.check_out_at IS NULL)
   ORDER BY p.pass_no
`;

function options() {
  const db = getDb();
  const employees = db
    .prepare('SELECT id, name, department FROM employees WHERE is_active = 1 ORDER BY emp_no')
    .all();
  const passes = db.prepare(AVAILABLE_PASSES_SQL).all();
  return { employees, passes, purposes: PURPOSES };
}

// FR-REG-01: look up visitors by phone (exact match)
function lookupByPhone({ query }) {
  const phone = text(query.get('phone'));
  if (!phone) fail('請輸入手機號碼');
  const rows = getDb()
    .prepare('SELECT id, name, company, phone, id_number FROM visitors WHERE phone = ? ORDER BY id')
    .all(phone);
  let message = '';
  if (rows.length === 0) message = '查無此手機號碼的訪客，請建立新訪客資料';
  else if (rows.length > 1) message = `找到 ${rows.length} 筆訪客資料，請選擇`;
  return { rows, message };
}

// FR-REG-03..06, FR-22: create the visit.
// Step 0 is the appointment check; steps 1-10 follow spec 7.1.
function checkIn({ body, user }) {
  return transaction((db) => {
    // Step 0: an appointment can be checked in only on its date while still booked (BR-02)
    let appointmentId = null;
    if (body.appointment_id) {
      appointmentId = toId(body.appointment_id);
      const appt = appointmentId &&
        db.prepare('SELECT status, visit_date FROM appointments WHERE id = ?').get(appointmentId);
      if (!appt || appt.status !== 0 || appt.visit_date !== today()) {
        fail('此預約無法報到（已報到、已取消或不是今天）');
      }
    }

    // Steps 1-4: new visitor fields, or an existing visitor id
    let visitorId = null;
    let newVisitor = null;
    if (body.new_visitor) {
      newVisitor = checkVisitorFields(body.new_visitor);
    } else {
      visitorId = toId(body.visitor_id);
      const exists = visitorId && db.prepare('SELECT 1 FROM visitors WHERE id = ?').get(visitorId);
      if (!exists) fail('請先查詢訪客');
    }

    // Step 5: visited employee must be an active employee (FR-REG-04)
    const employeeId = toId(body.employee_id);
    const employee = employeeId &&
      db.prepare('SELECT 1 FROM employees WHERE id = ? AND is_active = 1').get(employeeId);
    if (!employee) fail('請選擇受訪員工');

    // Steps 6-7: purpose, companion names (replaces the companion count), plate and note
    const info = checkVisitInfo(body);

    // Step 8: a pass is selected
    const passId = toId(body.pass_id);
    const pass = passId && db.prepare('SELECT id, pass_no, is_active FROM visitor_passes WHERE id = ?').get(passId);
    if (!pass) fail('請選擇訪客證');
    if (pass.is_active !== 1) fail(`訪客證 ${pass.pass_no} 已停用，請重新選擇`);

    // Step 9: check again that the pass is not in use (FR-REG-05)
    const passInUse = db
      .prepare('SELECT 1 FROM visits WHERE pass_id = ? AND check_out_at IS NULL')
      .get(passId);
    if (passInUse) fail(`訪客證 ${pass.pass_no} 已在使用中，請重新選擇`);

    // Step 10: the same visitor record must not be on site (FR-REG-06)
    if (visitorId) {
      const onsite = db
        .prepare('SELECT check_in_at FROM visits WHERE visitor_id = ? AND check_out_at IS NULL')
        .get(visitorId);
      if (onsite) {
        fail(`此訪客目前仍在廠內（報到時間 ${onsite.check_in_at.slice(0, 16)}），請先完成離廠登記`);
      }
    }

    const time = now();
    if (newVisitor) {
      const result = db.prepare(`
        INSERT INTO visitors (name, company, phone, id_number, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(newVisitor.name, newVisitor.company, newVisitor.phone, newVisitor.id_number, time);
      visitorId = Number(result.lastInsertRowid);
    }

    const result = db.prepare(`
      INSERT INTO visits (visitor_id, employee_id, purpose, companions, plate_no, pass_id,
                          appointment_id, check_in_at, checkin_by, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(visitorId, employeeId, info.purpose, info.companion_names.length, info.plate_no, passId,
      appointmentId, time, user.id, info.note);
    const visitId = Number(result.lastInsertRowid);

    const insertName = db.prepare('INSERT INTO visit_companions (visit_id, name) VALUES (?, ?)');
    for (const name of info.companion_names) insertName.run(visitId, name);

    if (appointmentId) {
      db.prepare('UPDATE appointments SET status = 1, updated_at = ? WHERE id = ?').run(time, appointmentId);
    }

    return { message: `登記完成：訪客證 ${pass.pass_no}` };
  });
}

module.exports = [
  { method: 'GET', path: '/api/register/options', access: 'staff', handler: options },
  { method: 'GET', path: '/api/visitors/lookup', access: 'staff', handler: lookupByPhone },
  { method: 'POST', path: '/api/visits', access: 'staff', handler: checkIn },
];
