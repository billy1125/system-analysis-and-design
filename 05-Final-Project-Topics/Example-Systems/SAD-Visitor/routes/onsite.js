// FR-OUT: on-site visitor list and check-out

const { getDb, transaction, now } = require('../lib/db');
const { UserError } = require('../lib/http');
const { fail, toId } = require('../lib/validate');

// "On site" is not a column: it means check_out_at IS NULL
function listOnsite() {
  const db = getDb();
  const rows = db.prepare(`
    SELECT v.id, v.check_in_at, v.companions,
           vi.name AS visitor_name, vi.company,
           e.name AS employee_name, e.extension,
           p.pass_no
      FROM visits v
      JOIN visitors vi ON vi.id = v.visitor_id
      JOIN employees e ON e.id = v.employee_id
      JOIN visitor_passes p ON p.id = v.pass_id
     WHERE v.check_out_at IS NULL
     ORDER BY v.check_in_at ASC
  `).all();
  const summary = db.prepare(`
    SELECT COUNT(*) AS visitor_count, COALESCE(SUM(companions), 0) AS companion_count
      FROM visits
     WHERE check_out_at IS NULL
  `).get();
  return { rows, summary };
}

function checkOut({ params, user }) {
  const id = toId(params.id);
  return transaction((db) => {
    const visit = db.prepare(`
      SELECT v.id, v.check_out_at, vi.name AS visitor_name
        FROM visits v JOIN visitors vi ON vi.id = v.visitor_id
       WHERE v.id = ?
    `).get(id);
    if (!visit) throw new UserError('找不到這筆來訪紀錄', 404);
    if (visit.check_out_at !== null) fail('此筆來訪已登記離廠');

    db.prepare('UPDATE visits SET check_out_at = ?, checkout_by = ? WHERE id = ?')
      .run(now(), user.id, id);
    return { message: `已登記 ${visit.visitor_name} 離廠` };
  });
}

module.exports = [
  { method: 'GET', path: '/api/onsite', access: 'login', handler: listOnsite },
  { method: 'POST', path: '/api/visits/:id/checkout', access: 'login', handler: checkOut },
];
