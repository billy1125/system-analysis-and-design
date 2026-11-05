// Shared field checks. Each check throws a UserError with the message to show.

const { UserError } = require('./http');

const PURPOSES = ['開會', '送貨', '維修', '參觀', '面試', '其他'];

// users.role values
const ROLE_ADMIN = 0;
const ROLE_RECEPTIONIST = 1;
const ROLE_EMPLOYEE = 2; // host employee (CR-01)

const MAX_COMPANIONS = 20;

function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function fail(message) {
  throw new UserError(message);
}

// Visitor fields: spec 7.1 steps 1-4
function checkVisitorFields(input) {
  const v = {
    name: text(input.name),
    company: text(input.company),
    phone: text(input.phone),
    id_number: text(input.id_number).toUpperCase(),
  };
  if (!v.name) fail('請輸入訪客姓名');
  if (v.name.length > 20) fail('訪客姓名不可超過 20 字');
  if (!v.company) fail('請輸入公司名稱');
  if (v.company.length > 40) fail('公司名稱不可超過 40 字');
  if (!/^09\d{8}$/.test(v.phone)) fail('手機號碼格式錯誤，須為 09 開頭的 10 碼數字');
  if (!/^[A-Z]\d{9}$/.test(v.id_number)) fail('身分證字號格式錯誤，須為 1 個英文字母加 9 個數字');
  return v;
}

// Companion names (CR-02-4, BR-05). Empty lines are dropped.
function checkCompanionNames(input) {
  const list = Array.isArray(input) ? input : [];
  const names = list.map(text).filter((n) => n !== '');
  if (names.length > MAX_COMPANIONS) fail(`隨行人員最多 ${MAX_COMPANIONS} 位`);
  if (names.some((n) => n.length > 20)) fail('隨行人員姓名不可超過 20 字');
  return names;
}

// Visit fields after the visitor: purpose, companion names, plate and note
function checkVisitInfo(input) {
  const v = {
    purpose: text(input.purpose),
    plate_no: text(input.plate_no),
    note: text(input.note),
  };
  if (!PURPOSES.includes(v.purpose)) fail('請選擇來訪事由');
  v.companion_names = checkCompanionNames(input.companion_names);
  if (v.plate_no.length > 10) fail('車牌不可超過 10 字');
  if (v.note.length > 200) fail('備註不可超過 200 字');
  v.plate_no = v.plate_no || null;
  v.note = v.note || null;
  return v;
}

function toId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

module.exports = {
  PURPOSES,
  ROLE_ADMIN,
  ROLE_RECEPTIONIST,
  ROLE_EMPLOYEE,
  text,
  fail,
  checkVisitorFields,
  checkCompanionNames,
  checkVisitInfo,
  toId,
};
