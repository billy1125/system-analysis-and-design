// Shared field checks. Each check throws a UserError with the message to show.

const { UserError } = require('./http');

const ROLE_MANAGER = 0;
const ROLE_TECH = 1;
const PLAN_TYPES = ['月保養', '季保養', '半年保養', '年度保養'];
const ITEM_RESULTS = ['正常', '異常', '未執行'];

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

function isUniqueError(e) {
  return /UNIQUE constraint failed/.test(String(e && e.message));
}

module.exports = {
  ROLE_MANAGER, ROLE_TECH, PLAN_TYPES, ITEM_RESULTS,
  text, fail, toId, isDate, isUniqueError,
};
