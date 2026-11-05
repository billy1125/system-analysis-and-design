// Shared field checks. Each check throws a UserError with the message to show.

const { UserError } = require('./http');

const ROLE_HR = 0;
const ROLE_EMPLOYEE = 1;
const CATEGORIES = ['法規', '客戶要求', '內部'];
const RESULTS = ['已完成', '未完成'];

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

// 'HH:MM', 00:00 to 23:59
function isTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function isUniqueError(e) {
  return /UNIQUE constraint failed/.test(String(e && e.message));
}

module.exports = {
  ROLE_HR, ROLE_EMPLOYEE, CATEGORIES, RESULTS,
  text, fail, toId, isDate, isTime, isUniqueError,
};
