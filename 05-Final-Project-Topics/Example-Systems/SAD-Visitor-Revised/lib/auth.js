// Password hashing and login sessions.

const crypto = require('node:crypto');
const { getDb } = require('./db');

// Password hash format: scrypt$<salt hex>$<hash hex>
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 32);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  const parts = String(stored).split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  const actual = crypto.scryptSync(password, salt, expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

// Sessions live in memory only. Restarting server.js logs everyone out.
const sessions = new Map(); // session id -> user id

function createSession(userId) {
  const sid = crypto.randomBytes(24).toString('hex');
  sessions.set(sid, userId);
  return sid;
}

function destroySession(sid) {
  sessions.delete(sid);
}

function parseCookies(req) {
  const result = {};
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) result[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return result;
}

function getSessionId(req) {
  return parseCookies(req).sid || null;
}

// Return the logged-in user, or null. A disabled account is treated as logged out.
// A host employee account whose employee has left is also treated as logged out (BR-06).
function getCurrentUser(req) {
  const sid = getSessionId(req);
  if (!sid || !sessions.has(sid)) return null;
  const user = getDb().prepare(`
    SELECT u.id, u.username, u.name, u.role, u.is_active, u.employee_id, e.is_active AS employee_active
      FROM users u LEFT JOIN employees e ON e.id = u.employee_id
     WHERE u.id = ?
  `).get(sessions.get(sid));
  if (!user || user.is_active !== 1 || (user.role === 2 && user.employee_active !== 1)) {
    sessions.delete(sid);
    return null;
  }
  return user;
}

module.exports = {
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  getSessionId,
  getCurrentUser,
};
