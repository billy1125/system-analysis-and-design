// Shared field checks. Each check throws a UserError with the message to show.

const { UserError } = require('./http');

const ROLE_MANAGER = 0;
const ROLE_STAFF = 1;
const COUNT_TYPES = ['全盤', '抽盤'];
const COUNT_STATUSES = ['盤點中', '已結案'];
const MOVE_TYPES = ['入庫', '出庫', '盤點調整'];

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

// Whole number written with digits only, between min and max. Returns the number or null.
function toIntIn(value, min, max) {
  const s = text(value);
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return n >= min && n <= max ? n : null;
}

// 'YYYY-MM-DD' and a real calendar date
function isDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

function isUniqueError(e) {
  return /UNIQUE constraint failed/.test(String(e && e.message));
}

module.exports = {
  ROLE_MANAGER, ROLE_STAFF, COUNT_TYPES, COUNT_STATUSES, MOVE_TYPES,
  text, fail, toId, toIntIn, isDate, isUniqueError,
};
