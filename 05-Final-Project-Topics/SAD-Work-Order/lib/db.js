// Database connection and small helpers.
// Uses node:sqlite (built into Node.js 22.13+), so no npm install is needed.

const fs = require('node:fs');
const path = require('node:path');

let DatabaseSync;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch (e) {
  console.error('無法載入 node:sqlite。請安裝 Node.js 22.13 以上的版本。');
  process.exit(1);
}

const DB_PATH = path.join(__dirname, '..', 'database.db');

function openDatabase(file) {
  const db = new DatabaseSync(file);
  // SQLite does not check foreign keys unless this is turned on per connection
  db.exec('PRAGMA foreign_keys = ON');
  return db;
}

let db = null;

// Open database.db once and reuse the same connection
function getDb() {
  if (!db) {
    if (!fs.existsSync(DB_PATH)) {
      console.error('找不到資料庫檔 database.db：' + DB_PATH);
      console.error('請重新從 GitHub 下載 database.db，放在 server.js 同一個資料夾。');
      process.exit(1);
    }
    db = openDatabase(DB_PATH);
  }
  return db;
}

// Run fn inside a transaction; roll back if it throws
function transaction(fn) {
  const conn = getDb();
  conn.exec('BEGIN IMMEDIATE');
  try {
    const result = fn(conn);
    conn.exec('COMMIT');
    return result;
  } catch (e) {
    conn.exec('ROLLBACK');
    throw e;
  }
}

function pad(n) {
  return String(n).padStart(2, '0');
}

// Local time as 'YYYY-MM-DD HH:MM:SS'
function now() {
  const d = new Date();
  return `${today()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// Local date as 'YYYY-MM-DD'
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

module.exports = { DB_PATH, openDatabase, getDb, transaction, now, today };
