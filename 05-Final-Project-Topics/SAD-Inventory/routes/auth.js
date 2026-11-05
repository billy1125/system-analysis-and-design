// FR-AUTH: login, logout, current user

const { getDb } = require('../lib/db');
const auth = require('../lib/auth');
const { fail, text } = require('../lib/validate');

function login({ body, setHeader }) {
  const empNo = text(body.emp_no).toUpperCase();
  const password = body.password === undefined || body.password === null ? '' : String(body.password);
  if (!empNo || !password) fail('請輸入員工編號與密碼');

  const user = getDb()
    .prepare('SELECT id, name, role, is_active, password_hash FROM users WHERE emp_no = ?')
    .get(empNo);
  if (!user || !auth.verifyPassword(password, user.password_hash)) fail('員工編號或密碼錯誤');
  if (user.is_active !== 1) fail('此帳號已停用，請洽倉庫課長');

  const sid = auth.createSession(user.id);
  setHeader('Set-Cookie', `sid=${sid}; HttpOnly; Path=/; SameSite=Strict`);
  return { user: { id: user.id, name: user.name, role: user.role } };
}

function logout({ req, setHeader }) {
  const sid = auth.getSessionId(req);
  if (sid) auth.destroySession(sid);
  setHeader('Set-Cookie', 'sid=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0');
  return {};
}

function me({ user }) {
  return { user: { id: user.id, name: user.name, role: user.role } };
}

module.exports = [
  { method: 'POST', path: '/api/login', access: 'public', handler: login },
  { method: 'POST', path: '/api/logout', access: 'public', handler: logout },
  { method: 'GET', path: '/api/me', access: 'login', handler: me },
];
