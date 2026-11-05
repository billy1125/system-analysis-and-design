// Equipment maintenance record system: local server.
// Serves the pages in public/ and a JSON API that reads and writes database.db.
// Start: node server.js, then open http://localhost:4000
// HOST=0.0.0.0 node server.js lets other computers connect.

const http = require('node:http');
const path = require('node:path');
const { getDb } = require('./lib/db');
const { getCurrentUser } = require('./lib/auth');
const { UserError, sendJson, readBody, serveStatic } = require('./lib/http');

const PORT = Number(process.env.PORT) || 4000;
const HOST = process.env.HOST || '127.0.0.1';
const PUBLIC_DIR = path.join(__dirname, 'public');

const routes = [
  ...require('./routes/auth'),
  ...require('./routes/due'),
  ...require('./routes/records'),
  ...require('./routes/equipment'),
  ...require('./routes/admin'),
];

// Turn '/api/records/:id' into a regex with named groups
for (const r of routes) {
  r.regex = new RegExp('^' + r.path.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$');
}

function findRoute(method, pathname) {
  for (const r of routes) {
    if (r.method !== method) continue;
    const m = r.regex.exec(pathname);
    if (m) return { route: r, params: m.groups || {} };
  }
  return null;
}

async function handleApi(req, res, url) {
  const found = findRoute(req.method, url.pathname);
  if (!found) return sendJson(res, 404, { error: '找不到這個功能' });
  const { route, params } = found;

  // Permission check runs on the server for every request
  const user = getCurrentUser(req);
  if (route.access !== 'public' && !user) return sendJson(res, 401, { error: '請先登入' });
  if (route.access === 'manager' && user.role !== 0) return sendJson(res, 403, { error: '只有主管可以使用這個功能' });

  const headers = {};
  const ctx = {
    req,
    user,
    params,
    query: url.searchParams,
    body: req.method === 'GET' ? {} : await readBody(req),
    setHeader: (name, value) => { headers[name] = value; },
  };
  const data = route.handler(ctx);
  sendJson(res, 200, data || {}, headers);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
    } else if (req.method !== 'GET' || !serveStatic(res, PUBLIC_DIR, url.pathname)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('找不到這個頁面');
    }
  } catch (e) {
    if (e instanceof UserError) {
      sendJson(res, e.status, { error: e.message });
    } else {
      console.error(e);
      sendJson(res, 500, { error: '系統發生錯誤，請洽設備課主管' });
    }
  }
});

getDb(); // fail early if database.db is missing
server.listen(PORT, HOST, () => {
  console.log(`設備保養紀錄管理系統已啟動：http://localhost:${PORT}`);
  console.log('要結束時，在這個視窗按 Ctrl + C。');
});
