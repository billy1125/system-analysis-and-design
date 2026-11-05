// FR-QRY: training records by employee and by course (HR only)

const { getDb } = require('../lib/db');
const { UserError } = require('../lib/http');
const { text, toId } = require('../lib/validate');
const { employeeRecords } = require('../lib/rules');

// FR-QRY-01: find employees by number or name, including inactive ones
function findEmployees({ query }) {
  const q = text(query.get('q'));
  const rows = q
    ? getDb().prepare(`
        SELECT id, emp_no, name, department, job_title, is_active
          FROM employees
         WHERE emp_no LIKE ? OR name LIKE ?
         ORDER BY emp_no
      `).all(`%${q.toUpperCase()}%`, `%${q}%`)
    : [];
  return { rows, message: q && rows.length === 0 ? '查無符合的員工' : '' };
}

function employeeHistory({ params }) {
  const db = getDb();
  const id = toId(params.id);
  const employee = id && db
    .prepare('SELECT id, emp_no, name, department, job_title, is_active FROM employees WHERE id = ?')
    .get(id);
  if (!employee) throw new UserError('找不到這位員工', 404);
  return { employee, ...employeeRecords(db, id) };
}

// FR-QRY-02: everyone who completed a course, latest first
function courseCompleters({ params }) {
  const db = getDb();
  const id = toId(params.id);
  const course = id && db.prepare('SELECT id, course_no, name FROM courses WHERE id = ?').get(id);
  if (!course) throw new UserError('找不到這門課程', 404);
  const rows = db.prepare(`
    SELECT p.emp_no, p.name, p.department, p.job_title, p.is_active, s.session_date AS completed_on
      FROM enrollments e
      JOIN sessions s ON s.id = e.session_id
      JOIN employees p ON p.id = e.employee_id
     WHERE s.course_id = ? AND e.status = '已完成'
     ORDER BY s.session_date DESC, p.emp_no
  `).all(id);
  return { course, rows };
}

function courseOptions() {
  const rows = getDb().prepare('SELECT id, course_no, name, is_active FROM courses ORDER BY course_no').all();
  return { rows };
}

module.exports = [
  { method: 'GET', path: '/api/records/employees', access: 'hr', handler: findEmployees },
  { method: 'GET', path: '/api/records/employees/:id', access: 'hr', handler: employeeHistory },
  { method: 'GET', path: '/api/records/courses', access: 'hr', handler: courseOptions },
  { method: 'GET', path: '/api/records/courses/:id', access: 'hr', handler: courseCompleters },
];
