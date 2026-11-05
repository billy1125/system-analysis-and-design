// FR-ADM: courses and employee accounts (HR only)

const { getDb, now, today } = require('../lib/db');
const { UserError } = require('../lib/http');
const { hashPassword } = require('../lib/auth');
const { ROLE_HR, ROLE_EMPLOYEE, CATEGORIES, text, fail, toId, isDate, isUniqueError } = require('../lib/validate');

// ---------- courses (FR-ADM-01) ----------

function listCourses() {
  const rows = getDb().prepare(`
    SELECT c.id, c.course_no, c.name, c.category, c.hours, c.description, c.is_active,
           (SELECT COUNT(*) FROM sessions s WHERE s.course_id = c.id) AS session_count
      FROM courses c
     ORDER BY c.course_no
  `).all();
  return { rows, categories: CATEGORIES };
}

function checkCourseFields(body) {
  const c = {
    course_no: text(body.course_no).toUpperCase(),
    name: text(body.name),
    category: text(body.category),
    hours: Number(text(body.hours)),
    description: text(body.description),
  };
  if (!/^TR-\d{3}$/.test(c.course_no)) fail('課程編號格式錯誤，須為 TR- 加 3 碼數字');
  if (!c.name) fail('請輸入課程名稱');
  if (c.name.length > 40) fail('課程名稱不可超過 40 字');
  if (!CATEGORIES.includes(c.category)) fail('請選擇課程類別');
  if (text(body.hours) === '' || !Number.isInteger(c.hours * 2) || c.hours < 0.5 || c.hours > 40) {
    fail('時數須為 0.5 到 40 之間，以 0.5 為單位');
  }
  if (c.description.length > 200) fail('說明不可超過 200 字');
  c.description = c.description || null;
  return c;
}

function createCourse({ body }) {
  const c = checkCourseFields(body);
  try {
    getDb().prepare('INSERT INTO courses (course_no, name, category, hours, description) VALUES (?, ?, ?, ?, ?)')
      .run(c.course_no, c.name, c.category, c.hours, c.description);
  } catch (err) {
    if (isUniqueError(err)) fail('課程編號已存在');
    throw err;
  }
  return { message: '已儲存課程' };
}

function updateCourse({ params, body }) {
  const db = getDb();
  const id = toId(params.id);
  const old = id && db.prepare('SELECT hours FROM courses WHERE id = ?').get(id);
  if (!old) throw new UserError('找不到這門課程', 404);
  const c = checkCourseFields(body);
  // Hours are locked once a session exists, so past totals do not change
  const used = db.prepare('SELECT 1 FROM sessions WHERE course_id = ?').get(id);
  if (used && c.hours !== old.hours) fail('這門課已開設過梯次，不能修改時數');
  try {
    db.prepare('UPDATE courses SET course_no = ?, name = ?, category = ?, hours = ?, description = ? WHERE id = ?')
      .run(c.course_no, c.name, c.category, c.hours, c.description, id);
  } catch (err) {
    if (isUniqueError(err)) fail('課程編號已存在');
    throw err;
  }
  return { message: '已儲存課程' };
}

function setCourseActive({ params, body }) {
  const db = getDb();
  const id = toId(params.id);
  const course = id && db.prepare('SELECT course_no FROM courses WHERE id = ?').get(id);
  if (!course) throw new UserError('找不到這門課程', 404);
  const active = body.is_active ? 1 : 0;
  db.prepare('UPDATE courses SET is_active = ? WHERE id = ?').run(active, id);
  return { message: `已${active ? '啟用' : '停用'}課程 ${course.course_no}` };
}

// ---------- employees (FR-ADM-02, FR-ADM-03) ----------

function listEmployees() {
  const rows = getDb().prepare(`
    SELECT id, emp_no, name, department, job_title, hire_date, role, is_active
      FROM employees ORDER BY emp_no
  `).all();
  return { rows };
}

function checkEmployeeFields(body) {
  const e = {
    emp_no: text(body.emp_no).toUpperCase(),
    name: text(body.name),
    department: text(body.department),
    job_title: text(body.job_title),
    hire_date: text(body.hire_date),
    role: Number(body.role),
    password: body.password === undefined || body.password === null ? '' : String(body.password),
  };
  if (!/^E\d{4}$/.test(e.emp_no)) fail('員工編號格式錯誤，須為 E 加 4 碼數字');
  if (!e.name) fail('請輸入姓名');
  if (e.name.length > 20) fail('姓名不可超過 20 字');
  if (!e.department) fail('請輸入部門');
  if (e.department.length > 20) fail('部門不可超過 20 字');
  if (!e.job_title) fail('請輸入職稱');
  if (e.job_title.length > 20) fail('職稱不可超過 20 字');
  if (!isDate(e.hire_date)) fail('請輸入正確的到職日');
  if (e.role !== ROLE_HR && e.role !== ROLE_EMPLOYEE) fail('請選擇角色');
  return e;
}

function createEmployee({ body }) {
  const e = checkEmployeeFields(body);
  if (!e.password) fail('新增員工時請輸入密碼');
  try {
    getDb().prepare(`
      INSERT INTO employees (emp_no, password_hash, name, department, job_title, hire_date, role, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
    `).run(e.emp_no, hashPassword(e.password), e.name, e.department, e.job_title, e.hire_date, e.role, now());
  } catch (err) {
    if (isUniqueError(err)) fail('員工編號已存在');
    throw err;
  }
  return { message: '已儲存員工資料' };
}

function updateEmployee({ params, body, user }) {
  const db = getDb();
  const id = toId(params.id);
  const target = id && db.prepare('SELECT id, role FROM employees WHERE id = ?').get(id);
  if (!target) throw new UserError('找不到這位員工', 404);
  const e = checkEmployeeFields(body);
  if (target.id === user.id && e.role !== target.role) fail('不能修改自己的角色');
  try {
    db.prepare(`
      UPDATE employees SET emp_no = ?, name = ?, department = ?, job_title = ?, hire_date = ?, role = ?
       WHERE id = ?
    `).run(e.emp_no, e.name, e.department, e.job_title, e.hire_date, e.role, id);
    // Blank password means keep the old one
    if (e.password) db.prepare('UPDATE employees SET password_hash = ? WHERE id = ?').run(hashPassword(e.password), id);
  } catch (err) {
    if (isUniqueError(err)) fail('員工編號已存在');
    throw err;
  }
  return { message: '已儲存員工資料' };
}

function setEmployeeActive({ params, body, user }) {
  const db = getDb();
  const id = toId(params.id);
  const target = id && db.prepare('SELECT id, name FROM employees WHERE id = ?').get(id);
  if (!target) throw new UserError('找不到這位員工', 404);
  const active = body.is_active ? 1 : 0;
  if (!active) {
    if (target.id === user.id) fail('不能停用自己的帳號');
    // Upcoming sign-ups would keep a seat, so they must be removed first
    const n = db.prepare(`
      SELECT COUNT(*) AS n FROM enrollments e JOIN sessions s ON s.id = e.session_id
       WHERE e.employee_id = ? AND s.session_date > ? AND s.status <> '已取消'
    `).get(id, today()).n;
    if (n > 0) fail(`此員工還有 ${n} 筆尚未上課的報名，請先移除後再停用`);
  }
  db.prepare('UPDATE employees SET is_active = ? WHERE id = ?').run(active, id);
  return { message: '已儲存員工資料' };
}

module.exports = [
  { method: 'GET', path: '/api/admin/courses', access: 'hr', handler: listCourses },
  { method: 'POST', path: '/api/admin/courses', access: 'hr', handler: createCourse },
  { method: 'PUT', path: '/api/admin/courses/:id', access: 'hr', handler: updateCourse },
  { method: 'PUT', path: '/api/admin/courses/:id/active', access: 'hr', handler: setCourseActive },
  { method: 'GET', path: '/api/admin/employees', access: 'hr', handler: listEmployees },
  { method: 'POST', path: '/api/admin/employees', access: 'hr', handler: createEmployee },
  { method: 'PUT', path: '/api/admin/employees/:id', access: 'hr', handler: updateEmployee },
  { method: 'PUT', path: '/api/admin/employees/:id/active', access: 'hr', handler: setEmployeeActive },
];
