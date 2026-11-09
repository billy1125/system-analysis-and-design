// Factory visitor check-in system (revised): server.
// Serves the pages in public/ and a JSON API that reads and writes database.db.
// Start: node server.js, then open http://localhost:4000
// On the factory server (NFR-02), start with HOST=0.0.0.0 so other PCs in the plant can connect.

const http = require('node:http');
const path = require('node:path');
const { getDb } = require('./lib/db');
const { getCurrentUser } = require('./lib/auth');
const { UserError, FileResponse, sendFile, sendJson, readBody, serveStatic } = require('./lib/http');
const { ROLE_ADMIN, ROLE_RECEPTIONIST, ROLE_EMPLOYEE } = require('./lib/validate');

const PORT = Number(process.env.PORT) || 4000;
const HOST = process.env.HOST || '127.0.0.1';
const PUBLIC_DIR = path.join(__dirname, 'public');

// Which roles may call a route
const ACCESS = {
  login: [ROLE_ADMIN, ROLE_RECEPTIONIST, ROLE_EMPLOYEE], // any logged-in user
  staff: [ROLE_ADMIN, ROLE_RECEPTIONIST],                 // front desk work
  admin: [ROLE_ADMIN],
  employee: [ROLE_EMPLOYEE],                              // host employee (CR-01)
};

const routes = [
  ...require('./routes/auth'),
  ...require('./routes/onsite'),
  ...require('./routes/register'),
  ...require('./routes/visits'),
  ...require('./routes/visitors'),
  ...require('./routes/appointments'),
  ...require('./routes/overview'),
  ...require('./routes/admin'),
];

// Turn '/api/visits/:id' into a regex with named groups
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

  // Permission check runs on the server for every request (NFR-07)
  const user = getCurrentUser(req);
  if (route.access !== 'public') {
    if (!user) return sendJson(res, 401, { error: '請先登入' });
    if (!ACCESS[route.access].includes(user.role)) {
      return sendJson(res, 403, { error: '你的帳號不能使用這個功能' });
    }
  }

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
  if (data instanceof FileResponse) return sendFile(res, data);
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
      sendJson(res, 500, { error: '系統發生錯誤，請洽管理員' });
    }
  }
});

getDb(); // fail early if database.db is missing
server.listen(PORT, HOST, () => {
  console.log(`工廠訪客進出登記系統（修改版）已啟動：http://localhost:${PORT}`);
  if (HOST !== '127.0.0.1') console.log(`已開放其他電腦連線（HOST=${HOST}），請用這台電腦的 IP 位址連線。`);
  console.log('要結束時，在這個視窗按 Ctrl + C。');
});
