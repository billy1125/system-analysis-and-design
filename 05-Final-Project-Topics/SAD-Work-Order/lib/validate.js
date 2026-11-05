// Shared field checks. Each check throws a UserError with the message to show.

const { UserError } = require('./http');

const ROLE_PLANNER = 0;
const ROLE_LEADER = 1;
const STATUSES = ['待派工', '已派工', '生產中', '已完工', '已取消'];
const OPEN_STATUSES = ['待派工', '已派工', '生產中'];

function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function fail(message) {
  throw new UserError(message);
}

function toId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// 'YYYY-MM-DD' and a real calendar date
function isDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

// Whole number between min and max, or null
function toCount(value, min, max) {
  const s = text(value);
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return n >= min && n <= max ? n : null;
}

function isUniqueError(e) {
  return /UNIQUE constraint failed/.test(String(e && e.message));
}

module.exports = {
  ROLE_PLANNER, ROLE_LEADER, STATUSES, OPEN_STATUSES,
  text, fail, toId, isDate, toCount, isUniqueError,
};
