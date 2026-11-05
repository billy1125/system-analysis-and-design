// FR-VIS: search and edit visitor records

const { getDb, now } = require('../lib/db');
const { UserError } = require('../lib/http');
const { text, checkVisitorFields, toId } = require('../lib/validate');

// FR-VIS-01: keyword on name, company or phone; empty keyword lists all
function search({ query }) {
  const keyword = text(query.get('q'));
  const like = `%${keyword}%`;
  const rows = getDb().prepare(`
    SELECT id, name, company, phone, id_number, created_at, updated_at
      FROM visitors
     WHERE ? = '' OR name LIKE ? OR company LIKE ? OR phone LIKE ?
     ORDER BY id
  `).all(keyword, like, like, like);
  return { rows };
}

// FR-VIS-02: overwrite name, company, phone and ID number
function update({ params, body }) {
  const db = getDb();
  const id = toId(params.id);
  if (!id || !db.prepare('SELECT 1 FROM visitors WHERE id = ?').get(id)) {
    throw new UserError('找不到這筆訪客資料', 404);
  }
  const v = checkVisitorFields(body);
  db.prepare(`
    UPDATE visitors SET name = ?, company = ?, phone = ?, id_number = ?, updated_at = ?
     WHERE id = ?
  `).run(v.name, v.company, v.phone, v.id_number, now(), id);
  return { message: '已儲存修改' };
}

module.exports = [
  { method: 'GET', path: '/api/visitors', access: 'staff', handler: search },
  { method: 'PUT', path: '/api/visitors/:id', access: 'staff', handler: update },
];
