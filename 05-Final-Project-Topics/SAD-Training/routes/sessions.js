// FR-SES and FR-RES: session management, roster and results (HR only)

const { getDb, transaction, now, today } = require('../lib/db');
const { UserError } = require('../lib/http');
const { RESULTS, text, fail, toId, isDate, isTime } = require('../lib/validate');
const { displayStatus, isEnrollable, getSession, enrolledCount, enroll } = require('../lib/rules');

const STORED_STATUSES = ['開放報名', '截止報名', '已取消'];

// FR-SES-01: filter by course and shown status, latest first
function listSessions({ query }) {
  const db = getDb();
  const day = today();
  const courseId = toId(query.get('course_id'));
  const status = text(query.get('status'));
  const rows = db.prepare(`
    SELECT s.id, s.session_date, s.start_time, s.end_time, s.location, s.instructor, s.capacity,
           s.status, s.course_id, c.course_no, c.name AS course_name,
           (SELECT COUNT(*) FROM enrollments e WHERE e.session_id = s.id) AS enrolled
      FROM sessions s JOIN courses c ON c.id = s.course_id
     ORDER BY s.session_date DESC, s.start_time DESC
  `).all()
    .map((s) => ({ ...s, display_status: displayStatus(s, day) }))
    .filter((s) => (!courseId || s.course_id === courseId) && (!status || s.display_status === status));
  const courses = db.prepare('SELECT id, course_no, name, is_active FROM courses ORDER BY course_no').all();
  return { rows, courses };
}

// Session fields: spec 7.2 steps 5-10
function checkSessionFields(body) {
  const v = {
    session_date: text(body.session_date),
    start_time: text(body.start_time),
    end_time: text(body.end_time),
    location: text(body.location),
    instructor: text(body.instructor),
    capacity: Number(text(body.capacity)),
  };
  if (!isDate(v.session_date)) fail('請輸入正確的上課日期');
  if (!isTime(v.start_time) || !isTime(v.end_time)) fail('請輸入開始與結束時間');
  if (v.end_time <= v.start_time) fail('結束時間必須晚於開始時間');
  if (!v.location) fail('請輸入地點');
  if (v.location.length > 30) fail('地點不可超過 30 字');
  if (!v.instructor) fail('請輸入講師');
  if (v.instructor.length > 30) fail('講師不可超過 30 字');
  if (text(body.capacity) === '' || !Number.isInteger(v.capacity) || v.capacity < 1 || v.capacity > 100) {
    fail('人數上限須為 1 到 100 的整數');
  }
  return v;
}

// FR-SES-02
function createSession({ body, user }) {
  const db = getDb();
  // Steps 3-4: course selected and active
  const courseId = toId(body.course_id);
  const course = courseId && db.prepare('SELECT course_no, is_active FROM courses WHERE id = ?').get(courseId);
  if (!course) fail('請選擇課程');
  if (course.is_active !== 1) fail(`課程 ${course.course_no} 已停用，不能開設新梯次`);
  const v = checkSessionFields(body);
  const result = db.prepare(`
    INSERT INTO sessions (course_id, session_date, start_time, end_time, location, instructor,
                          capacity, status, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, '開放報名', ?, ?)
  `).run(courseId, v.session_date, v.start_time, v.end_time, v.location, v.instructor,
    v.capacity, user.id, now());
  return { message: '已新增梯次', id: Number(result.lastInsertRowid) };
}

// FR-SES-05: session detail with roster and what the page may do
function getDetail({ params }) {
  const db = getDb();
  const day = today();
  const s = getSession(db, toId(params.id));
  const creator = db.prepare('SELECT name FROM employees WHERE id = ?').get(s.created_by);
  const roster = db.prepare(`
    SELECT e.id, e.status AS result, e.note, e.enrolled_at, e.result_at,
           p.emp_no, p.name, p.department, e.employee_id, e.enrolled_by,
           r.name AS result_by_name
      FROM enrollments e
      JOIN employees p ON p.id = e.employee_id
      LEFT JOIN employees r ON r.id = e.result_by
     WHERE e.session_id = ?
     ORDER BY p.emp_no
  `).all(s.id).map((r) => ({ ...r, by_self: r.employee_id === r.enrolled_by }));
  const employees = db
    .prepare('SELECT id, emp_no, name, department FROM employees WHERE is_active = 1 ORDER BY emp_no')
    .all();
  const future = s.session_date > day;
  const cancelled = s.status === '已取消';
  return {
    session: { ...s, display_status: displayStatus(s, day), created_by_name: creator.name, enrolled: roster.length },
    roster,
    employees,
    can: {
      edit: future && !cancelled,
      enroll: isEnrollable(s, day),
      remove: future,
      record: !future && !cancelled,
    },
  };
}

// FR-SES-03: edit a future session that is not cancelled (spec 7.2)
function updateSession({ params, body }) {
  return transaction((db) => {
    const s = getSession(db, toId(params.id));
    if (s.status === '已取消') fail('已取消的梯次不能修改');
    if (s.session_date <= today()) fail('上課日期已到，不能修改梯次資料');
    const v = checkSessionFields(body);
    const n = enrolledCount(db, s.id);
    if (v.capacity < n) fail(`人數上限不可少於目前報名人數（${n} 人）`);
    db.prepare(`
      UPDATE sessions SET session_date = ?, start_time = ?, end_time = ?, location = ?,
                          instructor = ?, capacity = ?, updated_at = ?
       WHERE id = ?
    `).run(v.session_date, v.start_time, v.end_time, v.location, v.instructor, v.capacity, now(), s.id);
    return { message: '已儲存梯次資料' };
  });
}

// FR-SES-04: 開放報名 <-> 截止報名, or 已取消 (final)
function setStatus({ params, body }) {
  const db = getDb();
  const s = getSession(db, toId(params.id));
  const status = text(body.status);
  if (!STORED_STATUSES.includes(status)) fail('梯次狀態不正確');
  if (s.status === '已取消') fail('已取消的梯次不能再變更狀態');
  if (s.session_date <= today()) fail('上課日期已到，不能變更梯次狀態');
  db.prepare('UPDATE sessions SET status = ?, updated_at = ? WHERE id = ?').run(status, now(), s.id);
  return { message: `梯次狀態已改為「${status}」` };
}

// FR-RES-01: HR signs up an active employee (spec 7.1 steps 1-2, then the shared checks)
function addEnrollment({ params, body, user }) {
  return transaction((db) => {
    const employeeId = toId(body.employee_id);
    const emp = employeeId && db.prepare('SELECT name, is_active FROM employees WHERE id = ?').get(employeeId);
    if (!emp) fail('請選擇員工');
    if (emp.is_active !== 1) fail('只能替在職員工報名');
    enroll(db, toId(params.id), employeeId, user.id);
    return { message: `已替 ${emp.name} 報名` };
  });
}

// FR-RES-02: remove a sign-up before the class date
function removeEnrollment({ params }) {
  return transaction((db) => {
    const s = getSession(db, toId(params.id));
    const e = db.prepare(`
      SELECT e.id, p.name FROM enrollments e JOIN employees p ON p.id = e.employee_id
       WHERE e.id = ? AND e.session_id = ?
    `).get(toId(params.eid), s.id);
    if (!e) throw new UserError('找不到這筆報名', 404);
    if (s.session_date <= today()) fail('上課日期已到，不能移除報名');
    db.prepare('DELETE FROM enrollments WHERE id = ?').run(e.id);
    return { message: `已移除 ${e.name} 的報名` };
  });
}

// FR-RES-03: save results for the whole roster (spec 7.3)
function saveResults({ params, body, user }) {
  return transaction((db) => {
    const s = getSession(db, toId(params.id));
    if (s.status === '已取消') fail('已取消的梯次不能登錄結訓結果');
    if (s.session_date > today()) fail('上課日期當天起才能登錄結訓結果');

    const current = new Map(
      db.prepare('SELECT id, status, note FROM enrollments WHERE session_id = ?').all(s.id).map((r) => [r.id, r]),
    );
    const input = Array.isArray(body.rows) ? body.rows : [];
    const changes = [];
    for (const row of input) {
      const old = current.get(toId(row.id));
      if (!old) fail('結訓結果不正確');
      const result = text(row.result);
      const note = text(row.note);
      // A row without a result is skipped; a recorded row cannot go back to no result
      if (result === '' && old.status === '已報名') continue;
      if (!RESULTS.includes(result)) fail('結訓結果不正確');
      if (note.length > 100) fail('備註不可超過 100 字');
      if (result !== old.status || (note || null) !== old.note) changes.push({ id: old.id, result, note: note || null });
    }

    const time = now();
    const update = db.prepare('UPDATE enrollments SET status = ?, note = ?, result_by = ?, result_at = ? WHERE id = ?');
    for (const c of changes) update.run(c.result, c.note, user.id, time, c.id);
    return { message: `已儲存結訓結果（${changes.length} 筆）` };
  });
}

module.exports = [
  { method: 'GET', path: '/api/sessions', access: 'hr', handler: listSessions },
  { method: 'POST', path: '/api/sessions', access: 'hr', handler: createSession },
  { method: 'GET', path: '/api/sessions/:id', access: 'hr', handler: getDetail },
  { method: 'PUT', path: '/api/sessions/:id', access: 'hr', handler: updateSession },
  { method: 'PUT', path: '/api/sessions/:id/status', access: 'hr', handler: setStatus },
  { method: 'POST', path: '/api/sessions/:id/enrollments', access: 'hr', handler: addEnrollment },
  { method: 'DELETE', path: '/api/sessions/:id/enrollments/:eid', access: 'hr', handler: removeEnrollment },
  { method: 'PUT', path: '/api/sessions/:id/results', access: 'hr', handler: saveResults },
];
