// FR-DUE: maintenance due list

const { getDb, today } = require('../lib/db');
const { PLAN_SELECT, withDueState } = require('../lib/rules');
const { text, toId } = require('../lib/validate');

function listDue({ query }) {
  const db = getDb();
  const day = today();
  // Only active plans on active equipment
  const all = db.prepare(PLAN_SELECT + ' WHERE p.is_active = 1 AND e.is_active = 1').all()
    .map((p) => withDueState(p, day));

  // Summary counts ignore the filters (FR-DUE-03)
  const summary = {
    overdue: all.filter((p) => p.due_status === '逾期').length,
    soon: all.filter((p) => p.due_status === '即將到期').length,
  };

  const ownerId = toId(query.get('owner_id'));
  const line = text(query.get('line'));
  const status = text(query.get('status'));
  const rows = all
    .filter((p) => (!ownerId || p.owner_id === ownerId)
      && (!line || p.line === line)
      && (!status || p.due_status === status))
    .sort((a, b) => a.next_due.localeCompare(b.next_due) || a.equip_no.localeCompare(b.equip_no))
    .map(({ items, ...p }) => p);

  const owners = db.prepare('SELECT id, name FROM users WHERE is_active = 1 ORDER BY emp_no').all();
  const lines = db.prepare('SELECT DISTINCT line FROM equipment WHERE is_active = 1 ORDER BY line').all()
    .map((r) => r.line);
  return { rows, summary, owners, lines };
}

module.exports = [
  { method: 'GET', path: '/api/due', access: 'login', handler: listDue },
];
