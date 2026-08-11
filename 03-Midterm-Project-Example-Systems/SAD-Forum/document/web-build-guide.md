# 會員管理系統（純前端版）— 建置流程書

## 0. 文件資訊

| 項目 | 內容 |
|------|------|
| 文件名稱 | 會員管理系統 純前端版 建置流程書 |
| 版本 | v1.0 |
| 日期 | 2026-08-08 |
| 上位依據 | [`document/web-system-spec.md`](web-system-spec.md) |
| 對照文件 | [`document/build-guide.md`](build-guide.md)（Flask 版） |

### 0.1 前提

開始之前必須：

1. 讀完 [`document/system-spec.md`](system-spec.md)（Flask 版規格書）——功能需求、驗證規則、訊息字串都在那裡，本版不重複
2. 讀完 [`document/web-system-spec.md`](web-system-spec.md)——特別是 §1.2（這個版本不能做什麼）與 §4.2（權限檢查是裝飾性的）
3. 手邊有 Flask 版的原始碼可以對照。本流程書大量出現「照抄 `db/forum.py` 的某個 SQL」這類指示

**建議先完成 Flask 版再做本版。** 反過來做也不是不行，但會失去大部分的對照價值。

### 0.2 階段總覽

共 11 個階段。與 Flask 版的 14 階段對照如下：

| Phase | 名稱 | 對應 Flask 版 | 相依 |
|:--:|------|--------------|------|
| 0 | 環境準備與 sql.js 取得 | Phase 0 | — |
| 1 | 專案骨架與 Docker | Phase 1 + 11 | 0 |
| 2 | 資料存取層 | Phase 2 | 1 |
| 3 | 共用模組（utils、messages、router） | Phase 1 的 `utils.py` | 2 |
| 4 | index.html 與 CSS | Phase 3 | 1 |
| 5 | auth view | Phase 4 | 3、4 |
| 6 | hub view | Phase 5 | 5 |
| 7 | profile view | Phase 6 | 5 |
| 8 | admin view | Phase 7 | 6 |
| 9 | forum view | Phase 8 | 6 |
| 10 | 匯出／匯入與稽核 | Phase 9（本版擴充） | 9 |
| 11 | 測試與最終驗收 | Phase 10 + 13 | 10 |

Docker 提前到 Phase 1（Flask 版在 Phase 11），因為 WASM 與 ES Modules 都需要 http server 才能載入——**沒有伺服器就沒辦法驗收任何東西**。

### 0.3 每階段的格式

與 Flask 版相同：目的／產出檔案／關鍵決策／驗收／常見錯誤。

驗收方式與 Flask 版不同：沒有 `curl` 與 `pytest`，改以**瀏覽器 Console 的一次性腳本**與**肉眼檢查**為主。每個階段都會給出可以直接貼進 Console 的驗收程式碼。

---

## Phase 0 — 環境準備與 sql.js 取得

### 目的

確認工具鏈，取得唯一的第三方相依，並確認安全內容的限制。

### 產出檔案

| 檔案 | 來源 |
|------|------|
| `web/vendor/sql-wasm.js` | sql.js 官方發行版 |
| `web/vendor/sql-wasm.wasm` | 同上 |

### 取得 sql.js

從 sql.js 的 GitHub Releases 下載 `sqljs-wasm.zip`（或 `sql-wasm.js` 與 `sql-wasm.wasm` 兩個檔），解壓後只取這兩個檔案放進 `web/vendor/`。

**不從 CDN 載入。** 理由與 Flask 版「不依賴任何外部資源」的原則一致——離線環境要能正常運作，而且教學環境的網路不一定可靠。

若無法下載，可退回純 JSON 實作（見規格書 §2.2 的取捨說明），但整份流程書的資料層章節都要改寫，不建議。

### 驗收

```bash
ls -la web/vendor/
```
預期：兩個檔案，`sql-wasm.wasm` 約 1.2 MB

```bash
docker --version
```
預期：有版本輸出。**若未安裝 Docker**，改用 `python -m http.server 4000`，本流程書的所有驗收都能照跑，只是 Phase 1 的容器驗收要跳過。

### 安全內容的檢查

在瀏覽器開一個空白分頁，Console 執行：

```js
console.log(window.isSecureContext, typeof crypto?.subtle);
```

- 在 `http://localhost:4000` 下預期：`true 'object'`
- 在 `http://<區網IP>:4000` 下會是：`false 'undefined'` ← **註冊與登入會完全失效**

### 關鍵決策記錄

**存取方式限定 `localhost`。** 若要讓其他機器連進來，必須改用 https（自簽憑證）或請對方各自在自己機器上跑容器。這一點寫進 `README`，並在 Phase 11 的驗收再確認一次。

### 常見錯誤

- 只下載 `sql-wasm.js` 而漏了 `.wasm`，症狀是載入時 404，畫面永遠停在載入中
- 從 CDN 引用而非本地打包，離線時整個系統打不開

---

## Phase 1 — 專案骨架與 Docker

### 目的

建立目錄結構與可運作的靜態伺服器。這是後續所有階段的驗收基礎。

### 產出檔案

| 檔案 | 動作 |
|------|------|
| `web/index.html` | 全新建立（此階段僅骨架） |
| `web/Dockerfile` | 全新建立 |
| `web/docker-compose.yml` | 全新建立 |
| `web/nginx.conf` | 全新建立 |
| `web/.dockerignore` | 全新建立 |
| 空目錄 `web/js/{db,views,tests}/`、`web/css/` | — |

### `Dockerfile`

```dockerfile
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY . /usr/share/nginx/html
EXPOSE 4000
```

沒有 `CMD`——nginx 映像自帶。沒有 build step——沒有打包工具。

### `nginx.conf`

關鍵是 `.wasm` 的 MIME type。近年的 nginx 內建 `mime.types` 已包含 `application/wasm`，但為了確保在舊版映像上也正確，明確宣告：

```nginx
server {
    listen 4000;
    root /usr/share/nginx/html;
    index index.html;

    types {
        application/wasm wasm;
    }

    # 開發用：不快取，避免改了檔案看不到效果
    location / {
        add_header Cache-Control "no-store";
        try_files $uri $uri/ /index.html;
    }
}
```

`try_files ... /index.html` 這一行在 hash 路由下**其實不需要**（hash 部分不會送到伺服器），但留著無害，且若日後改用 History API 路由就會用到。

### `docker-compose.yml`

```yaml
services:
  web:
    build: .
    ports:
      - "4000:4000"
    restart: unless-stopped
```

**沒有 volume，沒有環境變數。** 對照 Flask 版的 compose 檔，這裡少了 `db_data` volume 與 `SECRET_KEY`／`DB_PATH` 兩個環境變數。原因見規格書 §2：資料在瀏覽器裡，容器完全無狀態。

> 這個對照本身就是教材。可以直接把兩個 `docker-compose.yml` 並排，問學生「為什麼一邊需要 volume、一邊不需要」。

### `index.html`（此階段的骨架）

```html
<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>會員管理系統</title>
  <!-- CSS 於 Phase 4 加入 -->
</head>
<body>
  <div id="loading">載入中…</div>
  <main id="app" hidden></main>
  <script src="vendor/sql-wasm.js"></script>
  <script type="module" src="js/app.js"></script>
</body>
</html>
```

`sql-wasm.js` 用傳統 `<script>` 載入（它是 UMD 格式，會掛上全域的 `initSqlJs`），`app.js` 用 `type="module"`。兩者的載入順序由瀏覽器保證：module 一律在所有傳統 script 之後執行。

此階段的 `js/app.js` 只要能證明 WASM 載得起來：

```js
const SQL = await initSqlJs({ locateFile: f => 'vendor/' + f });
const db = new SQL.Database();
db.run('CREATE TABLE t (x INTEGER)');
db.run('INSERT INTO t VALUES (42)');
console.log('sql.js ok:', db.exec('SELECT x FROM t')[0].values[0][0]);
document.getElementById('loading').textContent = 'sql.js 載入成功';
```

### 驗收

```bash
cd web && docker compose up -d --build
sleep 3
curl -s -o /dev/null -w "%{http_code}\n" localhost:4000
curl -sI localhost:4000/vendor/sql-wasm.wasm | grep -i "content-type"
```
預期：`200` 與 `Content-Type: application/wasm`

**第二條是本階段最關鍵的驗收。** 若回傳 `application/octet-stream`，部分瀏覽器的 WASM 串流編譯會失敗。

瀏覽器開 `http://localhost:4000`：
- 畫面顯示「sql.js 載入成功」
- Console 顯示 `sql.js ok: 42`
- Network 面板中 `sql-wasm.wasm` 為 200，type 為 `wasm`

清理：`docker compose down`

### 常見錯誤

- 忘記 `COPY nginx.conf`，nginx 用預設設定聽 80 port，`localhost:4000` 連不上
- 用 `file://` 開啟 `index.html` 測試。**一定失敗**——ES Modules 與 WASM 都會被 CORS 擋下
- `locateFile` 的路徑寫錯，`.wasm` 404。這個錯誤在 Console 顯示為 `initSqlJs` 的 Promise rejection，訊息不直觀

---

## Phase 2 — 資料存取層

### 目的

建立三張表與所有資料存取函式。這是與 Flask 版對照最密集的一個階段。

### 產出檔案

| 檔案 | 對應 Flask 版 |
|------|--------------|
| `js/db/connection.js` | `db/connection.py`（+ 持久化、匯出、匯入） |
| `js/db/index.js` | `db/__init__.py` |
| `js/db/users.js` | `db/users.py` |
| `js/db/forum.js` | `db/forum.py` |

### `js/db/connection.js`

三個職責：持有全域的 `SQL.Database` 實例、負責持久化、提供測試的替換點。

```js
let SQL = null;
let db = null;
const STORAGE_KEY = 'sad_db';

export async function initSqlEngine() {
  if (!SQL) SQL = await initSqlJs({ locateFile: f => 'vendor/' + f });
  return SQL;
}

export function getDb() { return db; }

/** 測試用的替換點，對應 Flask 版的 db.DB_PATH 動態替換。 */
export function setDb(instance) { db = instance; }

export function loadOrCreate() { /* 見下方流程 */ }

export function persist() {
  localStorage.setItem(STORAGE_KEY, bytesToBase64(db.export()));
}

export function exportBytes() { return db.export(); }
export function importBytes(bytes) { /* 驗證後替換並 persist */ }
```

`loadOrCreate()` 的流程（對應規格書 §3.5 的第 3 步）：

```text
raw = localStorage[STORAGE_KEY]
raw 存在 → db = new SQL.Database(base64ToBytes(raw))
raw 不存在 → db = new SQL.Database()
            → initSchema()
            → await seedUsers()
            → persist()
```

**`setDb()` 這個替換點是刻意設計的**，動機與 Flask 版 `_get_conn()` 每次重讀 `db.DB_PATH` 完全相同：讓測試能換掉資料庫而不必動其他程式碼。Phase 11 的測試頁全靠它。

base64 轉換不用第三方庫：`btoa(String.fromCharCode(...bytes))` 在資料量大時會爆堆疊，因此要分塊處理（每次 8192 bytes）。這是一個容易踩的坑，實作時務必分塊。

### `js/db/index.js`

`initSchema()` 中的 `users` 表 DDL **從 Flask 版的 `db/__init__.py` 逐字複製**，一個字元都不改。然後呼叫 `initForumTables()`（在 `forum.js` 中，DDL 同樣逐字複製）。

種子帳號的資料（三組 email／密碼／role／is_active／name）與 Flask 版的 `_SEED_USERS` 相同。差別只有雜湊方式：

```js
const SEED_ITERATIONS = 1000;      // 對應 Flask 版的 bcrypt.gensalt(4)
const USER_ITERATIONS = 100000;    // 對應 bcrypt.gensalt(10)
```

`seedUsers()` 是 `async`（因為 PBKDF2），且沿用 Flask 版「users 表為空時才執行」的判斷。

### `js/db/users.js`

十個函式，SQL **從 Flask 版逐字複製**，只改包裝：

```js
export function findUserById(id) {
  const stmt = getDb().prepare(
    'SELECT id, email, role, name, display_name, is_active, is_deleted,' +
    ' created_at, last_login_at FROM users WHERE id = ?'
  );
  stmt.bind([id]);
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return row;
}
```

注意三件事：

1. **`stmt.free()` 一定要呼叫**，否則 WASM 的記憶體會洩漏。這相當於 Flask 版的 `conn.close()`，而且比它更容易漏——漏了不會立刻出錯，只會慢慢吃記憶體
2. **回傳的是純 JS 物件**（`row.email`），不是 `sqlite3.Row`（`row['email']`）。兩種寫法在 JS 中都能用，但統一用點記法
3. **寫入函式一律在最後呼叫 `persist()`**。這是本版新增的責任，Flask 版沒有對應

`createUser()` 與 `verifyPassword()` 是 `async`，其餘八個同步。

`listUsers()` 的四種 status 條件、關鍵字 `LIKE`、`ORDER BY id`、`LIMIT/OFFSET`、以及另跑一次 `COUNT(*)` 取得 total——全部與 Flask 版規格書 §6.6 相同。回傳 `{ items, total }`（Flask 版是 tuple，JS 用物件較自然）。

`hardDeleteUserByEmail` **不實作**（見規格書 §6.6）。

### `js/db/forum.js`

十個函式加 `initForumTables()`。兩張表的 DDL 從 Flask 版逐字複製。

三個需要 transaction 的函式，寫法對應 Flask 版的 `with conn:`：

```js
export function createForumMaster(title, content, userId) {
  const db = getDb();
  db.run('BEGIN');
  try {
    db.run('INSERT INTO forum (title, user_id) VALUES (?, ?)', [title, userId]);
    const masterId = db.exec('SELECT last_insert_rowid()')[0].values[0][0];
    db.run(
      'INSERT INTO forum_details (master_id, content, user_id, is_original_post)' +
      ' VALUES (?, ?, ?, 1)',
      [masterId, content, userId]
    );
    db.run('COMMIT');
    persist();
    return masterId;
  } catch (e) {
    db.run('ROLLBACK');
    throw e;
  }
}
```

`createForumDetail()` 與 `softDeleteForumMaster()` 同樣的結構。

`persist()` 放在 `COMMIT` 之後、`return` 之前——**不能放在 try 之外**，否則 rollback 之後也會把（未變更的）資料庫寫回去，雖然無害但語意不對。

### 驗收

這一階段的驗收全部在瀏覽器 Console 執行。先讓 `js/app.js` 把 db 模組掛到全域方便測試（正式版可移除，或保留作為教學用的探索入口）：

```js
// js/app.js 暫時加上
import * as dbUsers from './db/users.js';
import * as dbForum from './db/forum.js';
window.dbUsers = dbUsers;
window.dbForum = dbForum;
```

**1. 種子資料與篩選**

```js
localStorage.clear(); location.reload();
// 重新載入後執行：
console.log(dbUsers.listUsers(1, 10, 'all').total);        // 3
console.log(dbUsers.listUsers(1, 10, 'active').total);     // 2
console.log(dbUsers.listUsers(1, 10, 'disabled').total);   // 1
console.log(dbUsers.listUsers(1, 10, 'all').items.map(u => u.email));
// ['user@example.com', 'admin@example.com', 'disabled@example.com']
```

**2. 狀態轉換**

```js
dbUsers.setUserActive(1, 0);
console.log(dbUsers.listUsers(1, 10, 'disabled').total);   // 2
dbUsers.setUserRole(1, 0);
console.log(dbUsers.findUserById(1).role);                 // 0
dbUsers.softDeleteUser(1);
console.log(dbUsers.listUsers(1, 10, 'deleted').total);    // 1
console.log(dbUsers.listUsers(1, 10, 'active').total);     // 1
```

**3. 論壇的 transaction 與級聯**（對應 Flask 版 Phase 2 的同一組驗收）

```js
localStorage.clear(); location.reload();
// 重新載入後：
const mid = dbForum.createForumMaster('第一篇', '這是內文', 1);
console.log(dbForum.listForumMasters(1, 10).total);              // 1
console.log(dbForum.listForumDetails(mid).length);               // 1
console.log(dbForum.listForumDetails(mid)[0].is_original_post);  // 1
console.log(dbForum.listForumDetails(mid)[0].user_display);      // '一般使用者'

dbForum.createForumDetail(mid, '這是回覆', 2);
console.log(dbForum.listForumDetails(mid).length);               // 2

dbForum.softDeleteForumMaster(mid);
console.log(dbForum.listForumMasters(1, 10).total,
            dbForum.listForumDetails(mid).length);               // 0 0
```

最後一行是級聯的關鍵驗證，與 Flask 版完全相同的斷言。

**4. 持久化**

```js
dbForum.createForumMaster('持久化測試', 'x', 1);
location.reload();
// 重新載入後：
console.log(dbForum.listForumMasters(1, 10).total);   // 應該還在
```

若重新載入後歸零，代表某個寫入函式漏了 `persist()`。

**5. 密碼雜湊**

```js
const h = await dbUsers.hashPassword('password123');
console.log(h.split('$').length, h.startsWith('pbkdf2$'));   // 4 true
console.log(await dbUsers.verifyPassword('password123', h)); // true
console.log(await dbUsers.verifyPassword('wrong', h));       // false
// 種子帳號
const u = dbUsers.findUserByEmail('user@example.com');
console.log(await dbUsers.verifyPassword('password123', u.hash));  // true
```

**6. 與 Flask 版的 DDL 一致性**

```js
console.log(getDb().exec("SELECT sql FROM sqlite_master WHERE type='table'")[0].values);
```
把輸出與 Flask 版的 `db/__init__.py`、`db/forum.py` 逐字比對，應完全相同（SQLite 會原樣保存 DDL 文字）。

### 常見錯誤

- **漏 `stmt.free()`**：不會立刻出錯，長時間操作後記憶體暴增。養成 prepare／bind／step／free 四步一組的習慣
- **漏 `persist()`**：重新整理後資料消失。這是本階段最常見的錯誤，驗收第 4 條專門抓它
- **base64 轉換沒有分塊**：資料庫超過幾百 KB 後 `String.fromCharCode(...bytes)` 會拋 `RangeError: Maximum call stack size exceeded`
- 忘記 `createUser` 是 `async`，忘記 `await`，寫進去的 `hash` 是 `[object Promise]`
- `persist()` 寫在 try 之外或 rollback 之後

---

## Phase 3 — 共用模組

### 目的

建立跨 view 共用的工具、訊息常數與路由器。

### 產出檔案

| 檔案 | 對應 Flask 版 |
|------|--------------|
| `js/utils.js` | `utils.py` |
| `js/messages.js` | `tests/data/users.py` 的 `MESSAGES`（本版提前到正式程式碼） |
| `js/router.js` | Flask 的 `url_map` 與 Blueprint 註冊 |

### `js/utils.js`

```js
export const CAPTCHA_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CAPTCHA_LENGTH = 5;

export function genCaptcha() { /* 隨機取 5 字元 */ }
export function drawCaptcha(canvas, text) { /* Canvas 2D 繪製 */ }

export function isUsable(user) {
  return !!user && !!user.is_active && !user.is_deleted;
}

export function currentUser() { /* 依 sessionStorage.currentUserId 查 */ }
export function requireLogin() { /* 未登入則導向 #/login 並回傳 false */ }

export function setFlash(msg, category) { /* 寫入 sessionStorage */ }
export function takeFlash() { /* 讀取後清除 */ }
export function go(hash) { location.hash = hash; }
```

`isUsable()` 的判斷式與 Flask 版 `_is_usable()` 逐字對應。注意 SQLite 的布林是整數 0／1，而 JS 的 `0` 是 falsy，因此 `!!user.is_active` 與 `!user.is_deleted` 直接成立，不需要額外轉換。

`drawCaptcha()` 的 Canvas 繪製要對齊 Flask 版的視覺特徵：160×50、5 個字元、每字隨機旋轉與位移、加幾條干擾線。這不需要做得多好看——它的功能性在本版本來就是零（答案就在 `sessionStorage` 裡）。

**`isAdmin` 不放這裡。** 與 Flask 版規範一致，由各 view 自己定義。

### `js/messages.js`

33 條訊息全部集中，分三個區段：

```js
export const MESSAGES = {
  // ── auth / hub（11 條）──
  captchaRequired: '請輸入驗證碼',
  captchaInvalid: '驗證碼錯誤，請重新輸入',
  // ...
  // ── admin（11 條）──
  adminForbidden: '無操作權限',
  // ...
  // ── forum（11 條）──
  forumTitleRequired: '請輸入文章標題',
  forumContentRequired: '請輸入文章內容',
  forumMasterNotFound: '文章不存在或已刪除',
  forumDetailNotFound: '內文不存在或已刪除',
  forumReplyNotFound: '回覆不存在或已刪除',
  forumNoEditTitle: '無權限修改此文章標題',
  forumNoEditContent: '無權限修改此內容',
  forumNoDeleteMaster: '無權限刪除文章',
  forumNoDeleteDetail: '無權限刪除回覆',
  forumMasterDeleted: '文章已刪除',
  forumDetailDeleted: '回覆已刪除',
};
```

字串必須與 Flask 版規格書 §9.5 **逐字一致**，包含全形標點。這是兩版行為對照的前提。

> 這是本版相對 Flask 版**主動改善**的一處（見規格書 §9）。Flask 版的論壇訊息散在測試檔中（KI-29），本版全部集中。

### `js/router.js`

```js
const routes = [
  { pattern: /^\/$/,                          handler: hub.render },
  { pattern: /^\/login$/,                     handler: auth.renderLogin },
  { pattern: /^\/register$/,                  handler: auth.renderRegister },
  { pattern: /^\/logout$/,                    handler: auth.logout },
  { pattern: /^\/profile$/,                   handler: profile.render },
  { pattern: /^\/admin\/users$/,              handler: admin.renderList },
  { pattern: /^\/admin\/users\/(\d+)$/,       handler: admin.renderDetail },
  { pattern: /^\/forum$/,                     handler: forum.renderIndex },
  { pattern: /^\/forum\/new$/,                handler: forum.renderNew },
  { pattern: /^\/forum\/reply\/(\d+)$/,       handler: forum.renderReply },
  { pattern: /^\/forum\/edit\/master\/(\d+)$/, handler: forum.renderEditMaster },
  { pattern: /^\/forum\/edit\/detail\/(\d+)$/, handler: forum.renderEditDetail },
];
```

路由器負責：切掉開頭的 `#`、拆出 path 與 query string、把 query 解析成物件、比對 pattern、把捕獲的參數與 query 一起交給 handler。找不到符合的路由就導向 `#/`。

`window.addEventListener('hashchange', dispatch)` 加上啟動時的一次 `dispatch()`。

**每次 dispatch 前先清空 `#app`。** 這是最容易漏的一步，漏了會讓畫面疊加。

### 驗收

```js
// Console
console.log(isUsable({is_active: 1, is_deleted: 0}));   // true
console.log(isUsable({is_active: 0, is_deleted: 0}));   // false
console.log(isUsable({is_active: 1, is_deleted: 1}));   // false
console.log(isUsable(null));                            // false

const c = genCaptcha();
console.log(c.length, /^[A-Z2-9]{5}$/.test(c));         // 5 true

Object.keys(MESSAGES).length                            // 33
```

路由驗收（此時 view 還是空殼，能分派到就算通過）：

```js
location.hash = '#/forum?page=2&master_id=5';
// router 應解析出 path='/forum', query={page:'2', master_id:'5'}
```

### 常見錯誤

- 忘記在 dispatch 前清空 `#app`
- 正規表示式漏了 `^` 或 `$`，`#/forum/new` 被 `/^\/forum/` 誤判成主頁
- `hashchange` 只在 hash **改變**時觸發。若目前已是 `#/forum`，再設一次相同的值不會觸發——需要重新渲染時要直接呼叫 dispatch

---

## Phase 4 — index.html 與 CSS

### 目的

建立所有畫面的 `<template>` 與樣式。

### 產出檔案

| 檔案 | 動作 |
|------|------|
| `web/index.html` | 補上九個 `<template>` 與 CSS 連結 |
| `web/css/*.css`（六個） | **從 Flask 版逐字複製** |

### CSS 逐字複製

把 Flask 版的 `static/` 六個 CSS 檔複製到 `web/css/`，**一個字元都不改**。理由見規格書 §3.3。

`index.html` 一次載入全部六個：

```html
<link rel="stylesheet" href="css/common.css">
<link rel="stylesheet" href="css/login.css">
<link rel="stylesheet" href="css/hub.css">
<link rel="stylesheet" href="css/profile.css">
<link rel="stylesheet" href="css/admin.css">
<link rel="stylesheet" href="css/forum.css">
```

`common.css` 必須排第一（它定義的 token 要被後面的檔案引用）。其餘順序不影響，因為各子系統的 class 前綴不重疊。

> **一次全部載入會不會互相干擾？** 不會——這正是 Flask 版 CSS 規範（各子系統獨立前綴、`.login-form` 限定作用域）在設計時就要求的性質。本版是它的第一次實地驗證。唯一要注意的是 `login.css` 對 `body` 設了 flex 置中，這在非 auth 頁面會影響版面，需要以 `body` 上的一個狀態 class 控制（見下方）。

### `body` 的狀態 class

Flask 版每個頁面是獨立的 HTML，`login.css` 的 `body` 規則只影響 auth 頁。單頁應用中 `body` 只有一個，因此需要區分：

```html
<body class="page-auth">   <!-- router 依當前路由切換 -->
```

`login.css` 中的 `body { display: flex; ... }` 改為 `body.page-auth { ... }`。

**這是六個 CSS 檔中唯一必要的修改**，且只改一個選擇器。router 在 dispatch 時依路由設定 `document.body.className`：`page-auth`、`page-hub`、`page-profile`、`page-admin`、`page-forum`。

### 九個 `<template>`

| id | 對應 Flask 版 template |
|----|----------------------|
| `tpl-hub-guest` | `hub/home.html` 的訪客區 |
| `tpl-hub-user` | `hub/home.html` 的已登入區 |
| `tpl-login` | `auth/login.html` |
| `tpl-register` | `auth/register.html` |
| `tpl-profile` | `profile/dashboard.html` |
| `tpl-admin-list` | `admin/user_list.html` |
| `tpl-admin-detail` | `admin/user_detail.html` |
| `tpl-forum-index` | `forum/index.html` |
| `tpl-forum-form` | `forum/post_form.html` |

hub 拆成兩個 template（Flask 版是一個檔案內的 `{% if user %}`），因為兩種模式的結構差異大，分開比在 JS 中做大量 `remove()` 清楚。

**HTML 結構與 class 名稱必須與 Flask 版逐一對應**，否則 CSS 會失效。逐個對照 Flask 版的模板，把 Jinja2 語法拿掉、留下純結構：

| Jinja2 | `<template>` 中的處理 |
|--------|---------------------|
| `{{ user.name }}` | 留一個 `<span data-field="name">`，由 JS 填 `textContent` |
| `{% if %}` | 留著兩種結構，JS 依條件 `remove()` 掉不要的 |
| `{% for %}` | 留一個代表列作為 `<template>` 內的子樣板，JS 複製 |
| `url_for('x')` | 直接寫 `href="#/x"` |

**驗證碼**：Flask 版是 `<img src="/captcha.png">`，本版改為 `<canvas width="160" height="50">`，旁邊的 `↻` 按鈕保留。

**topbar 的匯出／匯入**：在每個有 topbar 的 template 中加入兩個元素，樣式沿用該子系統既有的 `*-btn-secondary`（見規格書 §8.3）。

### 驗收

```bash
grep -c "<template" web/index.html          # 9
ls web/css/                                  # 六個 CSS
diff web/css/forum.css ../static/forum.css   # 應無差異（若 Flask 版在同一 repo）
```

```js
// Console
document.querySelectorAll('template').length              // 9
// 隨機檢查一個 template 的 class 是否與 Flask 版一致
document.getElementById('tpl-forum-index').content
  .querySelectorAll('[class]').length > 0                 // true
```

**`.login-form` 恰三處**（與 Flask 版相同的規則）：

```bash
grep -c 'class="login-form"' web/index.html   # 3
```
三處分別在 `tpl-login`、`tpl-register`、`tpl-hub-guest` 的內嵌登入表單。

### 常見錯誤

- 改了 class 名稱，CSS 全部失效
- 忘記把 `login.css` 的 `body` 規則改成 `body.page-auth`，導致論壇與會員管理頁面被 flex 置中撐爛
- `<template>` 內容在 DOM 中不會渲染也不會執行——這是它的特性，但初次使用容易誤以為壞掉

---

## Phase 5 — auth view

### 目的

登入、註冊、登出、驗證碼。這是第一個完整可用的功能。

### 產出檔案

`js/views/auth.js`。

### 實作重點

**驗證順序與訊息字串完全照 Flask 版**（規格書 §9.2、§9.3）。五段登入驗證、五段註冊驗證，一段不漏、順序不改。

**登入 handler 是 `async`**（因為 `verifyPassword`）：

```js
async function handleLogin(form) {
  const email = form.email.value.trim();
  const password = form.password.value;
  const captchaInput = form.captcha.value.trim().toUpperCase();
  const captchaAnswer = sessionStorage.captchaAnswer || '';

  if (!captchaInput)                    return renderLogin({error: MESSAGES.captchaRequired});
  if (captchaInput !== captchaAnswer)   return renderLogin({error: MESSAGES.captchaInvalid});
  if (!email || !password)              return renderLogin({error: MESSAGES.missingCredentials});

  const user = findUserByEmail(email);
  if (!user || user.is_deleted || !(await verifyPassword(password, user.hash)))
    return renderLogin({error: MESSAGES.loginError});
  if (!user.is_active)                  return renderLogin({error: MESSAGES.accountDisabled});

  updateLastLogin(user.id);
  sessionStorage.currentUserId = String(user.id);
  go('#/');
}
```

與 Flask 版 `blueprints/auth/__init__.py` 的第 42–57 行逐句對應。

**驗證碼在 render 時繪製**：

```js
function renderCaptcha(canvas) {
  const text = genCaptcha();
  sessionStorage.captchaAnswer = text;
  drawCaptcha(canvas, text);
}
```

`↻` 按鈕與 canvas 本身的 click 都重新呼叫它，對應 Flask 版的兩個 `onclick`。

**登入成功後不清除 `captchaAnswer`** —— 刻意保留 Flask 版的 KI-07。

**註冊成功後 `setFlash(MESSAGES.registerSuccess, 'success')` 再 `go('#/login')`**，對應 Flask 版的 flash + redirect。

**已登入者存取 `#/login` 或 `#/register` 導回 `#/`**，對應 Flask 版的前兩行。

### 驗收

瀏覽器操作，`localStorage.clear()` 後重新載入：

| 步驟 | 預期 |
|------|------|
| 進入 `#/login` | 表單出現，canvas 上有五個字元 |
| 驗證碼留空送出 | 「請輸入驗證碼」 |
| 驗證碼亂填 | 「驗證碼錯誤，請重新輸入」 |
| 驗證碼正確、帳密留空 | 「請輸入帳號與密碼」 |
| 正確驗證碼 + `user@example.com` / 錯密碼 | 「帳號或密碼錯誤」 |
| 正確驗證碼 + `disabled@example.com` / `disabled123` | 「帳號已停用」 |
| 正確驗證碼 + `user@example.com` / `password123` | 導向 `#/`，`sessionStorage.currentUserId === '1'` |
| `#/register` 填表送出 | 導向 `#/login`，頂端顯示「申請成功，請登入」 |
| 重複的 email 註冊 | 「此電子郵件已被使用」 |
| 密碼 7 字元 | 「密碼至少需要 8 個字元」 |
| `#/logout` | `sessionStorage` 清空，導向 `#/login` |

作弊取得驗證碼答案：Console 執行 `sessionStorage.captchaAnswer`。

**KI-07 的驗證**：登入成功後在 Console 檢查 `sessionStorage.captchaAnswer` 仍然存在——這是刻意保留的缺陷。

### 常見錯誤

- 忘記 `await verifyPassword(...)`，Promise 物件是 truthy，導致**任何密碼都能登入**。這是本階段最危險的錯誤
- `sessionStorage.currentUserId` 存成數字。`sessionStorage` 只能存字串，讀出來要 `Number()`
- 驗證順序寫錯（例如先查帳號再驗驗證碼），與 Flask 版行為不一致

---

## Phase 6 — hub view

### 目的

首頁的訪客／已登入雙模式。

### 產出檔案

`js/views/hub.js`。

### 實作重點

與 Flask 版 `blueprints/hub/__init__.py` 對應：

```text
currentUserId 存在 → 查 user → isUsable 為假 → sessionStorage.clear()、user = null
                                              （不導向，退回訪客視圖）
user 為 null → 掛 tpl-hub-guest（含內嵌登入表單）
user 存在   → 掛 tpl-hub-user
              user.role === 0 → 額外顯示「會員管理」卡片
```

**內嵌登入表單重用 `auth.handleLogin`。** Flask 版把整段登入邏輯複製了一份（KI-23），本版**也保留這個複製**還是**共用一份**？

**決定：共用一份。** 理由是 KI-23 在 Flask 版存在的原因是「抽出共用函式會讓兩個 Blueprint 產生依賴，違反模組邊界」；在 JS 中 `import { handleLogin } from './auth.js'` 是完全正常的模組相依，沒有任何架構代價。硬要複製一份反而是為了對照而製造缺陷。

> 這是本版**第二處主動改善**（第一處是訊息字串集中）。改善的判準是：Flask 版接受該技術債的**理由在本版不成立**時，就修掉，並在規格書中記錄差異。反之，若理由仍然成立（如 KI-03），就保留。

三張卡片：

| 卡片 | 訪客視圖 | 已登入視圖 |
|------|---------|-----------|
| 論壇 | `<a href="#/forum">`，**可點** | `<a href="#/forum">` |
| 個人資料 | `<div class="hub-card hub-card-locked">` + `🔒 需登入` | `<a href="#/profile">` |
| 會員管理 | `<div class="hub-card hub-card-locked">` + `🔒 需管理員權限` | 僅 `role === 0` 時顯示 `<a href="#/admin/users">` |

與 Flask 版規格書 §8.3 完全相同。

### 驗收

| 狀態 | 預期 |
|------|------|
| 未登入 `#/` | 三張卡片，只有論壇可點；右側登入面板 |
| 內嵌登入 `user@example.com` | 導向 `#/`，顯示「歡迎回來，一般使用者！」 |
| 一般使用者 `#/` | 兩張卡（個人資料、論壇），**沒有**會員管理 |
| 管理員 `#/` | 三張卡，含會員管理 |
| 停用後仍持 session | Console `dbUsers.setUserActive(1, 0)` 後重新整理 → 退回訪客視圖，`sessionStorage.currentUserId` 已被清除 |

### 常見錯誤

- `isUsable` 為假時導向 `#/login`。**錯了**——Flask 版是退回訪客視圖，不導向
- 會員管理卡片忘記包 `role === 0` 的條件
- 訪客區的 locked 卡片誤用 `<a>`

---

## Phase 7 — profile view

### 目的

個人資料的檢視與編輯。

### 產出檔案

`js/views/profile.js`。

### 實作重點

```text
render:  requireLogin → currentUser() → isUsable 為假 → clear + go('#/login')
                     → query.edit === '1' → 編輯模式，否則唯讀
handleUpdate:  讀 name / display_name → trim() → 空字串轉 null
               → updateUserProfile(id, name, displayName)
               → go('#/profile')
```

**`handleUpdate` 刻意不做 `isUsable` 檢查**，對應 Flask 版 KI-03。也不做輸入驗證、不設 flash，對應 KI-04。

> 這一段的註解要寫清楚，否則下一個人一定會「順手」補上：
>
> ```js
> // 刻意不檢查 isUsable —— 對應 Flask 版 KI-03。
> // 這與 admin 的停用功能構成行為矛盾，是規格書 §11.2 的核心教材。
> // 請勿補上檢查。判準見規格書 §11.0。
> ```

六個欄位的顯示、空值顯示 `—`、`?edit=1` 的雙模式——與 Flask 版相同。

### 驗收

| 步驟 | 預期 |
|------|------|
| 未登入進 `#/profile` | 導向 `#/login` |
| 已登入 `#/profile` | 顯示 email、姓名、顯示名稱、角色、建立時間、最後登入 |
| `#/profile?edit=1` | 姓名與顯示名稱變成 `<input>` |
| 改姓名後儲存 | 回到唯讀模式，值已更新 |
| 姓名清空後儲存 | 顯示 `—`，`findUserById(1).name === null` |

**KI-03 的驗證**（這是驗證缺陷仍在，不是驗證功能正常）：

```js
// 以 user_id=1 登入後，在 Console：
dbUsers.setUserActive(1, 0);          // 模擬被管理員停用
// 不重新整理，直接在 #/profile?edit=1 改姓名並儲存
// 預期：儲存成功
console.log(dbUsers.findUserById(1).name);   // 改過的名字
// 但重新整理後進 #/profile：
location.reload();                            // → 導向 #/login
```

### 常見錯誤

- 在 `handleUpdate` 補上 `isUsable` 檢查——**這會抹掉核心教材**
- 忘記空字串轉 `null`，資料庫存進空字串而非 NULL

---

## Phase 8 — admin view

### 目的

會員管理。這是 view 層最複雜的一個。

### 產出檔案

`js/views/admin.js`。

### 實作重點

**三層守門在每個 render 與每個 handler 開頭明碼寫出**，不抽成 wrapper（理由見規格書 §4.1）：

```js
const user = currentUser();
if (!isUsable(user)) { sessionStorage.clear(); go('#/login'); return; }
if (!isAdmin(user))  { setFlash(MESSAGES.adminForbidden, 'error'); go('#/'); return; }
```

**八段驗證順序照 Flask 版規格書 §9.4**：登入 → 帳號有效 → 管理員 → 目標存在 → 非自己 → 非已刪除 → 參數合法 → 執行。

**自我保護 R1／R2／R3** 與「最後一個管理員」的論證完全沿用。`activate` 不設自我限制。

**清單頁**：`?status=` `?q=` `?page=` 三者可組合；篩選列四個 `<a href="#/admin/users?status=...">`；搜尋表單以 hidden 欄位帶上當前 status；分頁連結保留 status 與 q。

**「操作」欄的三種情況**與 Flask 版相同：自己那一列顯示「（目前登入帳號）」；已刪除的只有「詳細」；其餘顯示啟用／停用、刪除、詳細。

**明細頁的變數命名**：被檢視者叫 `target`，當前登入者叫 `user`。與 Flask 版相同的理由——避免混淆。

**刪除按鈕的 `confirm()`** 綁在 button 的 click handler 中，不寫 inline `onclick`（純前端版沒有 inline handler 的必要，全部用 `addEventListener`）。

> 這是與 Flask 版的一處形式差異：Flask 版的模板中有七處 inline handler（規格書 §7.3），本版**零處**——所有事件都在 JS 中綁定。這其實比 Flask 版更符合「行為與結構分離」的原則，值得在文件中指出。

### 驗收

以管理員登入後操作，並在 Console 驗證資料庫狀態：

```js
// 停用他人
dbUsers.findUserById(1).is_active        // 操作後應為 0
// 自我保護：在畫面上自己那列沒有按鈕，直接呼叫 handler 也要被擋
// （在 Console 執行 admin.handleDeactivate(2) 應被 R1 攔下）
dbUsers.findUserById(2).is_active        // 仍為 1
dbUsers.findUserById(2).role             // 調整自己角色後仍為 0
dbUsers.findUserById(2).is_deleted       // 刪除自己後仍為 0
```

| 步驟 | 預期 |
|------|------|
| 一般使用者進 `#/admin/users` | 導回 `#/`，flash「無操作權限」 |
| 未登入進 `#/admin/users` | 導向 `#/login` |
| 管理員進入 | 清單顯示三個種子帳號 |
| `?status=active` | 不含 `disabled@example.com` |
| 搜尋 `admin` | 只剩一筆 |
| 對他人停用／啟用／改角色／刪除 | 各有對應 flash，資料庫狀態改變 |
| 對自己的三個動作 | 各有對應的自我保護 flash，資料庫不變 |
| 對已刪除帳號操作 | 「該帳號已刪除，無法操作」 |
| 不存在的 id | 「找不到該使用者」 |
| `role` 傳 `'9'` | 「角色值不正確」 |

**WKI-01 的演示**（這是本階段最重要的教學驗收）：

```js
// 以一般使用者登入，然後在 Console：
sessionStorage.currentUserId = '2';
location.hash = '#/admin/users';
// 現在是管理員，可以做任何事
```

讓學生親手做一次，然後問：Flask 版能不能用同樣的方法？

### 常見錯誤

- 守門三層順序寫反
- 自我保護只加在部分 handler 上
- 搜尋表單忘記帶當前 status，一搜尋就把篩選重設
- 明細頁用 `user` 而非 `target`，topbar 顯示被檢視者的名字

---

## Phase 9 — forum view

### 目的

論壇。這是唯一開放訪客瀏覽的子系統。

### 產出檔案

`js/views/forum.js`。

### 實作重點

**`currentUser()` 已在 `utils.js` 中包含 `isUsable` 檢查**（見 Phase 3），這對應 Flask 版 Phase 8 的守門修正。因此 forum view 拿到的 `user` 若為 `null`，可能是訪客也可能是失效帳號。

**`renderIndex` 把 `null` 當成合法的訪客狀態**繼續渲染；**其餘六條路由與 handler 在 `user === null` 時 `sessionStorage.clear()` 並導向 `#/login`**。

這與 Flask 版的處理完全一致，包括「為什麼不把 `session.clear()` 放進 `currentUser()`」的理由（訪客與失效帳號在 helper 眼中都是 `null`，但只有後者需要清）。

**六段驗證順序照 Flask 版規格書 §9.4.1**：登入 → 帳號有效 → 目標存在 → 權限 → 內容非空 → 執行。注意這與 admin 的順序相反（先查目標存在，再查權限），理由見 Flask 版規格書。

**兩種 redirect 目標**：目標不存在 → `#/forum`；權限不足 → `#/forum?master_id=<id>`。

**`tpl-forum-form` 由四條路由共用**，以五個參數驅動（`formTitle`、`showTitle`、`showContent`、`formData`、`backUrl`），與 Flask 版的 `post_form.html` 相同。

**渲染使用者內容一律用 `textContent`。** 這是本版新增的紀律（WKI-02），也是本階段最重要的一條：

```js
contentCell.textContent = detail.content;   // 正確
contentCell.innerHTML = detail.content;     // 絕對不可
```

標題、作者顯示名稱、內文、回覆——所有來自資料庫的字串都適用。

**刪除限管理員**，原作者不能刪自己的文章。與 Flask 版相同。

**保留的技術債**：內容無長度上限（KI-28）、可刪除首篇內文（KI-30）。

### 驗收

| 步驟 | 預期 |
|------|------|
| 訪客進 `#/forum` | 200 顯示列表；topbar 是「登入」；沒有「發表文章」 |
| 訪客點文章標題 | 右欄顯示內文與回覆 |
| 訪客直接進 `#/forum/new` | 導向 `#/login` |
| 登入後發文 | 導向 `#/forum?master_id=<新id>`，右欄顯示該篇 |
| 標題留空 | 「請輸入文章標題」 |
| 內容留空 | 「請輸入文章內容」 |
| 他人回覆 | 該篇浮到列表最上面 |
| 原作者修改自己的文章 | 成功 |
| 非作者非管理員修改 | 「無權限修改此文章標題」，導回該篇 |
| 一般使用者刪除 | 畫面上沒有按鈕；直接呼叫 handler 被擋，「無權限刪除文章」 |
| 管理員刪除文章 | confirm → 整篇連同回覆消失 |
| 修改不存在的 id | 「文章不存在或已刪除」，導回 `#/forum` |

**級聯驗證**：

```js
const mid = dbForum.createForumMaster('測試', '內文', 1);
dbForum.createForumDetail(mid, '回覆', 2);
// 以管理員身分在畫面上刪除該篇後：
console.log(dbForum.listForumMasters(1, 10).total,
            dbForum.listForumDetails(mid).length);   // 少 1，且 0
```

**XSS 驗證**（確認 `textContent` 生效）：

```js
dbForum.createForumMaster('<img src=x onerror=alert(1)>', '<script>alert(2)</script>', 1);
location.hash = '#/forum';
```
預期：標題與內文**以純文字顯示**那些標籤，沒有任何彈窗。若跳出 alert，代表某處用了 `innerHTML`。

**守門驗證**：

```js
// 以 user_id=1 登入，在 Console：
dbUsers.setUserActive(1, 0);
location.hash = '#/forum';        // 200，但沒有「發表文章」
location.hash = '#/forum/new';    // 導向 #/login，sessionStorage 已清空
```

### 常見錯誤

- `renderIndex` 也加了 `null` 防護，訪客連論壇都進不去
- 某處用了 `innerHTML`，XSS 驗證會抓到
- 六段驗證順序寫成 admin 的八段順序（先權限後查目標），導致 redirect 目標算不出來
- 分頁連結忘記帶 `master_id`，翻頁後右欄清空

---

## Phase 10 — 匯出／匯入與稽核

### 目的

完成「一個檔案儲存資料」這個需求，並做全專案的一致性稽核。

### 產出檔案

`js/db/connection.js` 補上 `exportBytes()` 與 `importBytes()`；各 template 的 topbar 補上兩個元素。

### 匯出

```js
export function downloadDatabase() {
  const bytes = exportBytes();
  const blob = new Blob([bytes], { type: 'application/x-sqlite3' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'sad-database.sqlite';
  a.click();
  URL.revokeObjectURL(url);
}
```

`URL.revokeObjectURL()` 一定要呼叫，否則 blob 會一直佔著記憶體。

### 匯入

```text
<input type="file" accept=".sqlite,.db"> 選檔
  → confirm('匯入會完全取代現有資料，確定嗎？')
  → file.arrayBuffer()
  → 嘗試 new SQL.Database(new Uint8Array(buffer))
  → 驗證三張表都存在（查 sqlite_master）
  → 成功：setDb(新實例) → persist() → location.reload()
  → 失敗：保留原資料庫不動，顯示錯誤訊息
```

驗證三張表存在是必要的——匯入一個結構不對的 SQLite 檔會讓整個系統壞掉，而且因為已經 `persist()` 了，重新整理也救不回來。

### 稽核

**1. SQL 只在 `js/db/` 內**

```bash
grep -rniE "SELECT |INSERT |UPDATE |DELETE FROM|CREATE TABLE" web/js/views/ web/js/*.js
```
預期：**無輸出**。這是 Flask 版靠模組邊界與 code review 維持的規範，本版可以直接驗證。

**2. 沒有 `innerHTML` 碰使用者資料**

```bash
grep -rn "innerHTML" web/js/
```
預期：逐筆檢視。只允許用在開發者自己寫死的標記上，不得出現任何來自 `db.*` 回傳值的變數。建議直接規定**零 `innerHTML`**，全部用 `textContent` 與 `createElement`，這樣稽核就變成「預期無輸出」。

**3. `isAdmin` 不在 `utils.js`**

```bash
grep -c "isAdmin" web/js/utils.js
```
預期：`0`

**4. 訊息字串沒有寫死在 view 中**

```bash
grep -rn "'請輸入\|'無權限\|'帳號" web/js/views/
```
預期：**無輸出**——全部應該引用 `MESSAGES.*`

**5. `.login-form` 恰三處**

```bash
grep -c 'class="login-form"' web/index.html
```
預期：`3`

**6. 沒有 inline event handler**

```bash
grep -rnE "onclick=|onsubmit=|onchange=" web/index.html
```
預期：**無輸出**——全部用 `addEventListener`

**7. 每個寫入函式都有 `persist()`**

```bash
grep -c "persist()" web/js/db/users.js web/js/db/forum.js
```
逐一核對：`users.js` 的寫入函式有 5 個（create、updateProfile、updateLastLogin、softDelete、setActive、setRole 共 6 個），`forum.js` 有 5 個。人工確認每個都呼叫了。

### 驗收

| 步驟 | 預期 |
|------|------|
| 點「匯出資料庫」 | 下載 `sad-database.sqlite` |
| 用 `sqlite3` CLI 開啟該檔 | `.tables` 顯示 `forum`、`forum_details`、`users` |
| `SELECT email FROM users;` | 三個種子帳號 |
| `localStorage.clear()` 後重新整理 | 回到全新的種子狀態 |
| 匯入剛才下載的檔 | 資料回來了 |
| 匯入一個隨便的 txt 檔 | 顯示錯誤，原資料不受影響 |

**與 Flask 版互通的驗證**（若手邊有 Flask 版）：

```bash
cp ~/Downloads/sad-database.sqlite /path/to/flask/database.db
cd /path/to/flask && python app.py
```
預期：Flask 版能正常啟動，論壇與會員清單顯示純前端版建立的資料。但**跨版本的帳號無法登入**（WKI-03，`hash` 格式不同）。這個「資料看得到、帳號登不了」的現象要在課堂上說明清楚。

### 常見錯誤

- 忘記 `URL.revokeObjectURL()`
- 匯入時沒有驗證表結構，壞檔案直接 `persist()` 覆蓋掉好資料
- 匯入後忘記 `location.reload()`，畫面還顯示舊資料

---

## Phase 11 — 測試與最終驗收

### 目的

建立測試頁並完成整體驗收。

### 產出檔案

| 檔案 | 說明 |
|------|------|
| `web/tests.html` | 測試頁 |
| `js/tests/runner.js` | 極簡的測試執行器與斷言函式 |
| `js/tests/data.js` | 對應 Flask 版 `tests/data/users.py` |
| `js/tests/{users,forum,utils,rules}.test.js` | 約 70 個案例 |

### 測試執行器

不引入任何框架，自己寫約 40 行：

```js
const results = [];
export function test(name, fn) { /* 執行、捕捉例外、記錄 pass/fail */ }
export function assertEqual(actual, expected, msg) { /* ... */ }
export function assertTrue(value, msg) { /* ... */ }
export async function runAll() { /* 依序執行、渲染結果表格 */ }
```

**每個測試前重建資料庫**，對應 Flask 版的 `app` fixture：

```js
async function freshDb() {
  const SQL = await initSqlEngine();
  setDb(new SQL.Database());     // ← Phase 2 埋的替換點
  initSchema();
  await seedUsers();
}
```

**不碰 `localStorage`**——測試用的資料庫只存在記憶體中，跑完測試不會影響正式資料。這比 Flask 版的 `tmp_path` 更乾淨。

### 測試範圍

| 檔案 | 涵蓋 | 案例數 |
|------|------|:--:|
| `users.test.js` | 十個 users 函式、篩選、搜尋、分頁、狀態轉換 | 約 25 |
| `forum.test.js` | 十個 forum 函式、transaction、級聯、排序 | 約 20 |
| `utils.test.js` | `isUsable`、`genCaptcha`、雜湊與驗證 | 約 10 |
| `rules.test.js` | 自我保護 R1–R3、守門判斷（抽成純函式的部分） | 約 15 |

**不測**：DOM 渲染、事件綁定、路由分派、Canvas。這些靠前面各階段的手動驗收覆蓋。

覆蓋率明顯低於 Flask 版（約 70 對約 112），這是誠實要記錄的落差——Flask 版透過 test client 自動驗證的路由與權限，本版落到人工。

### 最終驗收

**1. 測試全綠**

開啟 `http://localhost:4000/tests.html`，預期約 70 個案例全數通過，失敗數為 0。

**2. 路由清單對照**

```js
// Console
router.routes.map(r => r.pattern.source)
```
預期 12 條，與規格書 §7.1 逐條對得上。

**3. 手動走完七條旅程**

與 Flask 版建置流程書 Phase 13 的七條旅程**完全相同**，逐條走一次。兩版的行為應該一模一樣（除了網址從 `/forum` 變成 `#/forum`）。

> 這是整個雙版本專案的收尾：把兩個瀏覽器視窗並排，一邊 Flask 版一邊純前端版，同時走同一條旅程。看起來應該幾乎沒有差別——**這正是重點**：使用者看到的東西一樣，底下的架構天差地遠。

**4. 「刻意不對稱」的驗證**

與 Flask 版相同：forum 的守門**要生效**，profile 的 KI-03 **要仍然存在**。

```js
// 以 user_id=1 登入
dbUsers.setUserActive(1, 0);

location.hash = '#/forum/new';
// 預期：導向 #/login，sessionStorage 已清空

// 重新設定 session 再試 profile
sessionStorage.currentUserId = '1';
// 在 #/profile?edit=1 改姓名並儲存
console.log(dbUsers.findUserById(1).name);   // 預期：改過的名字（KI-03 仍在）
```

**5. WKI-01 的演示**

```js
sessionStorage.currentUserId = '2';
location.hash = '#/admin/users';
```
預期：五秒內成為管理員。**這一條「通過」代表系統符合設計，不是代表有漏洞**——它本來就是這樣。

**6. WKI-09 的提醒**

開兩個分頁，各自發一篇文，然後重新整理。預期會看到其中一篇消失——這是多分頁覆蓋（WKI-09），演示時要避免同時開多個分頁。

**7. 安全內容的確認**

```js
console.log(window.isSecureContext);   // localhost 下為 true
```
若在區網 IP 下存取，這裡是 `false`，註冊與登入會失效。README 中要寫明。

### 完工檢查清單

- [ ] `tests.html` 全綠，約 70 個案例
- [ ] 路由 12 條，與規格書 §7.1 相符
- [ ] 七條手動旅程全部走通，行為與 Flask 版一致
- [ ] forum 守門生效（停用帳號無法發文）
- [ ] KI-03 缺陷仍在（停用帳號仍可改自己資料）
- [ ] XSS 驗證：`<script>` 標籤以純文字顯示
- [ ] 匯出的 `.sqlite` 可用外部工具開啟
- [ ] 匯入功能可還原，壞檔案不會破壞現有資料
- [ ] 稽核七項全部通過（SQL 只在 db/、零 `innerHTML`、零 inline handler…）
- [ ] `docker compose up -d --build` 後 `localhost:4000` 可用
- [ ] `.wasm` 的 Content-Type 為 `application/wasm`
- [ ] 六個 CSS 與 Flask 版逐字相同（除 `login.css` 的 `body` 選擇器）

---

## 附錄 A：兩版建置流程對照

| Flask 版 Phase | 純前端版 Phase | 差異重點 |
|:--:|:--:|------|
| 0 環境準備 | 0 環境準備 + sql.js | 多了 WASM 下載與安全內容檢查 |
| 1 骨架 | 1 骨架 + Docker | Docker 提前——沒有 http server 什麼都驗不了 |
| 2 db 層 | 2 db 層 | DDL 與 SQL 逐字相同；多了 persist |
| 3 base + CSS | 4 index.html + CSS | CSS 逐字複製；template 語法重寫 |
| 4 auth | 5 auth | 驗證順序與訊息相同；雜湊改 PBKDF2 且非同步 |
| 5 hub | 6 hub | 相同；內嵌登入改為共用函式（本版改善） |
| 6 profile | 7 profile | 相同；KI-03 一併保留 |
| 7 admin | 8 admin | 相同；多了 WKI-01 的演示 |
| 8 forum | 9 forum | 相同；多了 XSS 稽核 |
| 9 CSS 稽核 | 10 匯出匯入 + 稽核 | 稽核項目從 6 項增為 7 項 |
| 10 測試 | 11 測試 + 最終驗收 | 測試機制完全不同，覆蓋率較低 |
| 11 Docker | （併入 Phase 1） | — |
| 12 文件 | （本文件與規格書即是） | — |
| 13 最終驗收 | （併入 Phase 11） | — |

## 附錄 B：完整檔案清單

### 從 Flask 版逐字複製（6 個）

`css/common.css`、`css/login.css`（僅改一個 `body` 選擇器）、`css/hub.css`、`css/profile.css`、`css/admin.css`、`css/forum.css`

### 從 Flask 版複製 SQL 與 DDL（3 個檔案的內容）

`js/db/index.js` 的 `users` DDL、`js/db/forum.js` 的兩張表 DDL 與十個函式的 SQL、`js/db/users.js` 的十個函式的 SQL

### 全新建立（約 20 個）

| 檔案 | Phase |
|------|:--:|
| `index.html` | 1、4 |
| `Dockerfile`、`docker-compose.yml`、`nginx.conf`、`.dockerignore` | 1 |
| `vendor/sql-wasm.js`、`vendor/sql-wasm.wasm` | 0（下載） |
| `js/app.js` | 1 |
| `js/db/connection.js`、`index.js`、`users.js`、`forum.js` | 2 |
| `js/utils.js`、`js/messages.js`、`js/router.js` | 3 |
| `js/views/auth.js` | 5 |
| `js/views/hub.js` | 6 |
| `js/views/profile.js` | 7 |
| `js/views/admin.js` | 8 |
| `js/views/forum.js` | 9 |
| `tests.html`、`js/tests/runner.js`、`data.js`、四個 `*.test.js` | 11 |

### 沒有對應的 Flask 版檔案

| Flask 版 | 為何沒有 |
|---------|---------|
| `app.py` 的 `/health` | 沒有應用伺服器 |
| `blueprints/auth/` 的 `/captcha.png` | Canvas 直接畫 |
| `db/users.py` 的 `hard_delete_user_by_email` | 測試以重建資料庫清理 |
| `requirements.txt` | 沒有套件管理 |
| `rules/*.md` | 沿用 Flask 版，名詞對照見規格書附錄 B |
