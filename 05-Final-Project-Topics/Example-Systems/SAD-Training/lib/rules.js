// Values derived from dates and stored status (spec 5.4), and the enrollment check (spec 7.1).
// None of these values are stored in the database.

const { today, now } = require('./db');
const { UserError } = require('./http');
const { fail } = require('./validate');

// Status shown on screen: 已取消 / 已結束 / 今日上課 / stored status
function displayStatus(session, day = today()) {
  if (session.status === '已取消') return '已取消';
  if (session.session_date < day) return '已結束';
  if (session.session_date === day) return '今日上課';
  return session.status;
}

// Open for sign-up: status is 開放報名 and the class date is after today
function isEnrollable(session, day = today()) {
  return session.status === '開放報名' && session.session_date > day;
}

function getSession(db, id) {
  const s = id && db.prepare(`
    SELECT s.*, c.course_no, c.name AS course_name, c.category, c.hours
      FROM sessions s JOIN courses c ON c.id = s.course_id
     WHERE s.id = ?
  `).get(id);
  if (!s) throw new UserError('找不到這個梯次', 404);
  return s;
}

function enrolledCount(db, sessionId) {
  return db.prepare('SELECT COUNT(*) AS n FROM enrollments WHERE session_id = ?').get(sessionId).n;
}

// Enroll one employee. Checks follow spec 7.1 in order; steps 1-2 are done by the caller.
function enroll(db, sessionId, employeeId, byId) {
  const day = today();

  // Step 3: session exists
  const s = sessionId && db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
  if (!s) fail('找不到這個梯次');

  // Step 4: open for sign-up
  if (!isEnrollable(s, day)) fail('這個梯次目前不開放報名');

  // Step 5: not enrolled in this session
  const dup = db.prepare('SELECT 1 FROM enrollments WHERE session_id = ? AND employee_id = ?')
    .get(sessionId, employeeId);
  if (dup) fail('已經報名過這個梯次');

  // Step 6: not enrolled in another upcoming session of the same course
  const other = db.prepare(`
    SELECT s.session_date
      FROM enrollments e JOIN sessions s ON s.id = e.session_id
     WHERE e.employee_id = ? AND s.course_id = ? AND s.id <> ?
       AND s.status IN ('開放報名', '截止報名') AND s.session_date > ?
  `).get(employeeId, s.course_id, sessionId, day);
  if (other) fail(`已報名這門課 ${other.session_date} 的梯次，請先取消再報名`);

  // Step 7: not full
  if (enrolledCount(db, sessionId) >= s.capacity) fail('這個梯次已額滿');

  db.prepare(`
    INSERT INTO enrollments (session_id, employee_id, status, enrolled_at, enrolled_by)
    VALUES (?, ?, '已報名', ?, ?)
  `).run(sessionId, employeeId, now(), byId);
  return s;
}

// One person's records, newest class first, plus total completed hours
function employeeRecords(db, employeeId) {
  const day = today();
  const rows = db.prepare(`
    SELECT e.id, e.status AS result, e.note,
           s.session_date, s.status, c.course_no, c.name AS course_name, c.category, c.hours
      FROM enrollments e
      JOIN sessions s ON s.id = e.session_id
      JOIN courses c ON c.id = s.course_id
     WHERE e.employee_id = ?
     ORDER BY s.session_date DESC, s.start_time DESC
  `).all(employeeId).map((r) => ({ ...r, display_status: displayStatus(r, day) }));
  const totalHours = rows
    .filter((r) => r.result === '已完成')
    .reduce((sum, r) => sum + r.hours, 0);
  return { rows, total_hours: totalHours };
}

module.exports = { displayStatus, isEnrollable, getSession, enrolledCount, enroll, employeeRecords };
