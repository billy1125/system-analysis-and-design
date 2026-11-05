// Shared field checks. Each check throws a UserError with the message to show.

const { UserError } = require('./http');

const ROLE_MANAGER = 0;
const ROLE_QC = 1;
const STATUSES = ['待處理', '處理中', '已結案', '不成立'];
const OPEN_STATUSES = ['待處理', '處理中'];

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

// 'YYYY-MM-DDTHH:MM' (from <input type="datetime-local">) or 'YYYY-MM-DD HH:MM'.
// Returns 'YYYY-MM-DD HH:MM:00', or null if the value is not a real time.
function toMinuteTime(value) {
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(:00)?$/.exec(value);
  if (!m || !isDate(m[1]) || Number(m[2]) > 23 || Number(m[3]) > 59) return null;
  return `${m[1]} ${m[2]}:${m[3]}:00`;
}

function isUniqueError(e) {
  return /UNIQUE constraint failed/.test(String(e && e.message));
}

module.exports = {
  ROLE_MANAGER, ROLE_QC, STATUSES, OPEN_STATUSES,
  text, fail, toId, isDate, toMinuteTime, isUniqueError,
};
