// FR-ENR: open sessions, self sign-up and cancel, my records

const { getDb, transaction, today } = require('../lib/db');
const { UserError } = require('../lib/http');
const { fail, toId } = require('../lib/validate');
const { isEnrollable, enroll, employeeRecords } = require('../lib/rules');

// FR-ENR-01: sessions open for sign-up, earliest first
function openSessions({ user }) {
  const rows = getDb().prepare(`
    SELECT s.id, s.session_date, s.start_time, s.end_time, s.location, s.instructor, s.capacity,
           c.name AS course_name, c.category, c.hours,
           (SELECT COUNT(*) FROM enrollments e WHERE e.session_id = s.id) AS enrolled,
           (SELECT e.id FROM enrollments e WHERE e.session_id = s.id AND e.employee_id = ?) AS my_enrollment_id
      FROM sessions s JOIN courses c ON c.id = s.course_id
     WHERE s.status = '開放報名' AND s.session_date > ?
     ORDER BY s.session_date, s.start_time
  `).all(user.id, today());
  return { rows };
}

// FR-ENR-02: sign up myself
function signUp({ body, user }) {
  return transaction((db) => {
    const s = enroll(db, toId(body.session_id), user.id, user.id);
    const course = db.prepare('SELECT name FROM courses WHERE id = ?').get(s.course_id);
    return { message: `報名完成：${course.name}（${s.session_date}）` };
  });
}

// FR-ENR-03: cancel my own sign-up while the session is still open
function cancel({ params, user }) {
  return transaction((db) => {
    const id = toId(params.id);
    const e = id && db.prepare(`
      SELECT e.id, s.status, s.session_date
        FROM enrollments e JOIN sessions s ON s.id = e.session_id
       WHERE e.id = ? AND e.employee_id = ?
    `).get(id, user.id);
    if (!e) throw new UserError('找不到這筆報名', 404);
    if (!isEnrollable(e)) fail('已截止報名，無法取消，請洽人資');
    db.prepare('DELETE FROM enrollments WHERE id = ?').run(id);
    return { message: '已取消報名' };
  });
}

// FR-ENR-04
function myRecords({ user }) {
  return employeeRecords(getDb(), user.id);
}

module.exports = [
  { method: 'GET', path: '/api/open-sessions', access: 'login', handler: openSessions },
  { method: 'POST', path: '/api/my/enrollments', access: 'login', handler: signUp },
  { method: 'DELETE', path: '/api/my/enrollments/:id', access: 'login', handler: cancel },
  { method: 'GET', path: '/api/my/records', access: 'login', handler: myRecords },
];
