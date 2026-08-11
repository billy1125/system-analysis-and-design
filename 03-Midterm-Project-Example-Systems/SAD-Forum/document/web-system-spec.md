# 會員管理系統（純前端版）— 系統規格書

## 0. 文件資訊

| 項目 | 內容 |
|------|------|
| 文件名稱 | 會員管理系統 純前端版 系統規格書 |
| 版本 | v1.0 |
| 日期 | 2026-08-08 |
| 對照版本 | [`document/system-spec.md`](system-spec.md)（Flask 版 v1.0） |
| 適用讀者 | 已讀過 Flask 版規格書的學生與開發者 |

### 0.1 這份文件與 Flask 版的關係

本系統是 Flask 版的**平行實作**：相同的功能需求、相同的資料模型、相同的驗證規則與訊息字串，但執行環境從「伺服器端渲染」換成「瀏覽器端單頁應用」。

因此本文件**不重複** Flask 版已經寫過的內容。凡是兩版相同的部分，一律以「見 Flask 版 §X」帶過；本文件只寫**差異**與**純前端特有的設計**。

閱讀順序建議：先讀完 Flask 版規格書，再讀本文件。單獨讀本文件會缺少功能需求的細節。

| 文件 | 回答的問題 |
|------|-----------|
| `document/system-spec.md` | 這個系統**是什麼**（功能、資料、規則） |
| `document/web-system-spec.md`（本文件） | 純前端版**哪裡不一樣**，以及為什麼 |
| `document/web-build-guide.md` | 純前端版**怎麼建** |

### 0.2 為什麼要做兩個版本

同一組需求用兩種架構實作，可以讓幾件事變得可比較而非抽象：

| 議題 | 只看 Flask 版 | 兩版對照後 |
|------|--------------|-----------|
| 「權限檢查在伺服器端」 | 一句原則 | 可以親手在 DevTools 改掉前端版的 `currentUserId`，五秒內變成管理員 |
| 「SQL 寫在資料層」 | 一條規範 | 兩版的 `CREATE TABLE` 逐字相同，`SELECT` 幾乎相同，但呼叫方式完全不同 |
| 「POST-Redirect-GET」 | 一個慣例 | 前端版沒有 POST，只有 handler + 手動導向，才看得出這個慣例在解決什麼 |
| 「session 是什麼」 | 一個 cookie | 一邊是伺服器簽章、客戶端不可偽造；一邊是一個明文字串 |
| 「密碼雜湊」 | bcrypt cost=10 | PBKDF2 在瀏覽器跑，可以實際量測 100,000 次迭代要多久 |

---

## 1. 專案定位與範圍

### 1.1 範圍

**與 Flask 版完全相同**：Hub 首頁、身分驗證、個人資料、會員管理、論壇。五個子系統、三張資料表、相同的角色與權限模型。

**範圍外**：校園活動報名（events）、器材借用（equipment）。與 Flask 版一致。

### 1.2 這個版本不能做什麼

必須在一開始就說清楚，否則後面所有的設計都會被誤讀：

> **純前端版沒有可信任的執行環境。** 所有程式碼、所有資料、所有權限判斷都在使用者的瀏覽器裡，使用者對它們有完全的控制權。任何人打開 DevTools 就能把自己變成管理員、讀出所有密碼雜湊、直接改寫資料庫內容。
>
> 這不是實作的疏漏，是這個架構的**本質**。本系統的權限機制是**功能性的**（讓介面正確呈現不同角色該看到的東西），不是**安全性的**（阻止有意繞過的人）。

因此：

- 本版**不適合**任何真實用途，連內部工具都不行
- 本版的價值全部在教學：它讓「為什麼權限一定要在伺服器端」這句話從口號變成可以動手驗證的事實
- Flask 版的許多安全性技術債（KI-01 CSRF、KI-05 SECRET_KEY、KI-15 session fixation）在本版**不適用**——不是因為做得更好，而是因為連可以攻擊的伺服器都沒有

### 1.3 兩版對照速查

| 面向 | Flask 版 | 純前端版 |
|------|---------|---------|
| 執行位置 | 伺服器 | 瀏覽器 |
| 渲染 | Jinja2 伺服器端渲染 | JS 操作 DOM |
| 路由 | Flask `url_map`，21 條 | hash 路由，12 條 view + 9 個 action handler |
| 資料庫 | SQLite 檔（伺服器磁碟） | SQLite（sql.js／WASM，記憶體 + localStorage 持久化） |
| DDL | 三張表 | **逐字相同的三張表** |
| 密碼雜湊 | bcrypt cost=10 | PBKDF2-HMAC-SHA256，100,000 迭代（Web Crypto） |
| 驗證碼 | `captcha` 套件產生 PNG | Canvas 2D 繪製 |
| session | Flask 簽章 cookie，伺服器端驗證 | `sessionStorage` 的明文整數 |
| 權限檢查 | 伺服器端，不可繞過 | 瀏覽器端，**可任意繞過** |
| 部署 | Flask 開發伺服器，port 4000 | nginx 靜態服務，port 4000 |
| 測試 | pytest + Flask test client，約 112 案例 | 見 §12 |
| 相依套件 | flask、bcrypt、captcha | **sql.js 一個**（WASM，隨專案打包） |

---

## 2. 技術棧與執行環境

### 2.1 選型

| 層 | 技術 | 說明 |
|----|------|------|
| 標記 | HTML5 | 單一 `index.html`，各畫面以 `<template>` 定義 |
| 樣式 | CSS3 | 沿用 Flask 版的六個 CSS 檔，**幾乎不改** |
| 邏輯 | ES2020+ 原生 JavaScript | ES Modules，無框架、無打包工具 |
| 資料庫 | sql.js 1.x | SQLite 編譯成 WebAssembly，約 1.2 MB |
| 持久化 | `localStorage` | 存 SQLite 檔的 base64 編碼 |
| 密碼 | Web Crypto API（`crypto.subtle`） | PBKDF2-HMAC-SHA256，瀏覽器內建 |
| 驗證碼 | Canvas 2D API | 瀏覽器內建 |
| 部署 | nginx:alpine + Docker Compose | 純靜態檔服務，port 4000 |

### 2.2 唯一的第三方相依：sql.js

使用者要求「純 HTML + CSS + JS」，而 sql.js 是一個 WebAssembly 模組，嚴格說不是純 JS。這個取捨是刻意的，理由如下：

**若不用 sql.js**，資料要以 JSON 陣列存放，所有查詢、篩選、分頁、JOIN 都得用 `Array.prototype.filter/map/sort` 手寫。功能上完全做得到，但會失去這個專案最大的教學價值——**兩版的 SQL 逐字相同**。學生可以把 `db/forum.py` 的 `SELECT` 直接貼到前端版跑，看到一樣的結果。這個對照比「零相依」值錢得多。

**採用 sql.js 的代價**：

| 代價 | 具體影響 |
|------|---------|
| 體積 | `sql-wasm.wasm` 約 1.2 MB，首次載入需要下載 |
| 不能雙擊開啟 | WASM 與 ES Modules 都受 CORS 限制，`file://` 協定下無法載入，**必須透過 http server**——這正是 Docker 在本版的主要用途 |
| 非同步初始化 | `initSqlJs()` 回傳 Promise，整個 app 必須等它完成才能啟動 |
| 嚴格說不是「純 JS」 | 這一點在文件中明確標示，不迴避 |

sql.js 的兩個檔案（`sql-wasm.js` 與 `sql-wasm.wasm`）**隨專案打包在 `vendor/` 目錄下**，不從 CDN 載入。這與 Flask 版「不依賴任何外部資源」的原則一致，離線環境可正常運作。

### 2.3 執行方式

**方式 A：Docker（建議）**

```bash
docker compose up -d --build    # http://localhost:4000
docker compose down
```

**方式 B：任何靜態 http server**

```bash
python -m http.server 4000      # 在專案根目錄執行
```

**不能用的方式**：直接雙擊 `index.html`。`file://` 協定下 ES Modules 與 WASM 都會被 CORS 擋下，且 `crypto.subtle` 不可用。

### 2.4 安全內容（Secure Context）的限制

`crypto.subtle` 只在**安全內容**中可用。安全內容的定義是：`https://`，或 host 為 `localhost` / `127.0.0.1` 的 `http://`。

因此：

| 存取方式 | `crypto.subtle` | 結果 |
|---------|:---:|------|
| `http://localhost:4000` | 可用 | 正常 |
| `http://127.0.0.1:4000` | 可用 | 正常 |
| `http://192.168.1.50:4000`（區網 IP） | **不可用** | 註冊與登入直接失敗 |
| `file:///.../index.html` | 不可用 | 連載入都失敗 |

若要讓同學從其他機器連進來示範，必須改用 https（自簽憑證即可）或請他們各自在自己機器上跑容器。這一點在課堂上很容易踩到，`web-build-guide.md` 的 Phase 0 會再提醒一次。

---

## 3. 系統架構

### 3.1 分層與 Flask 版的對應

```text
瀏覽器
  │
  ▼
index.html                    單一 HTML；各畫面以 <template> 定義
  │                           對應 Flask 的 templates/ 全部
  ▼
js/app.js                     啟動：初始化 sql.js → 載入 DB → 掛載 router
  │                           對應 app.py
  ▼
js/router.js                  監聽 hashchange，解析路徑與 query，分派 view
  │                           對應 Flask 的 url_map 與 Blueprint 註冊
  ▼
js/views/{auth,hub,profile,admin,forum}.js
  │                           渲染畫面、綁定事件、執行業務規則與權限檢查
  │                           對應 blueprints/*/__init__.py
  ├──▶ js/utils.js            requireLogin、isUsable、genCaptcha、drawCaptcha
  │                           對應 utils.py
  ▼
js/db/{connection,users,forum}.js
  │                           所有 SQL 集中於此
  │                           對應 db/*.py
  ▼
sql.js（WASM）→ 記憶體中的 SQLite
  │
  ▼
localStorage['sad_db']        base64 編碼的 SQLite 檔
```

目錄結構刻意與 Flask 版一一對應，讓兩邊可以並排比對。

### 3.2 目錄結構

```text
web/
├── index.html                # 單一 HTML，含所有 <template>
├── Dockerfile
├── docker-compose.yml
├── nginx.conf                # WASM 的 MIME type 設定
│
├── vendor/
│   ├── sql-wasm.js           # sql.js 載入器
│   └── sql-wasm.wasm         # SQLite WASM 本體（約 1.2 MB）
│
├── js/
│   ├── app.js                # 啟動流程
│   ├── router.js             # hash 路由
│   ├── utils.js              # 跨 view 共用 helper
│   ├── db/
│   │   ├── connection.js     # sql.js 初始化、載入、儲存、匯出、匯入
│   │   ├── index.js          # DDL、initDb()、公開函式匯出
│   │   ├── users.js          # users 表的資料存取
│   │   └── forum.js          # forum 與 forum_details 的資料存取
│   └── views/
│       ├── auth.js           # #/login #/register #/logout
│       ├── hub.js            # #/
│       ├── profile.js        # #/profile
│       ├── admin.js          # #/admin/users #/admin/users/:id
│       └── forum.js          # #/forum 及五條子路由
│
└── css/
    ├── common.css            # 與 Flask 版逐字相同
    ├── login.css             # 與 Flask 版逐字相同
    ├── hub.css               # 與 Flask 版逐字相同
    ├── profile.css           # 與 Flask 版逐字相同
    ├── admin.css             # 與 Flask 版逐字相同
    └── forum.css             # 與 Flask 版逐字相同
```

### 3.3 六個 CSS 檔為什麼可以逐字照搬

Flask 版的 CSS 沒有任何一條規則依賴 Jinja2 或伺服器端渲染——它們全部是選擇器加樣式，作用對象是最終的 HTML 結構。只要純前端版產生出**相同結構、相同 class 名稱**的 DOM，樣式就會完全一致。

這是一個值得指出的觀察：**表現層與渲染方式無關**。換掉整個後端，CSS 一行都不用動。

唯一的調整是 `<link>` 的路徑（Flask 用 `url_for('static', ...)`，這裡用相對路徑 `css/`），以及所有 CSS 在 `index.html` 中**一次全部載入**（單頁應用沒有「這一頁只載入某個 CSS」的機制）。全部載入不會衝突，因為各子系統都有自己的 class 前綴——這正是 Flask 版 CSS 規範在設計時就考慮到的性質，只是那時還沒有機會驗證。

### 3.4 View 職責

| View | hash 路徑 | 對應 Flask Blueprint | 守門 |
|------|----------|---------------------|------|
| `auth.js` | `#/login`、`#/register`、`#/logout` | `auth` | 已登入者存取 login/register 會被導回 `#/` |
| `hub.js` | `#/` | `hub` | 無（訪客／已登入雙模式） |
| `profile.js` | `#/profile` | `profile` | `requireLogin` + `isUsable`（**更新時刻意不檢查**，對應 KI-03） |
| `admin.js` | `#/admin/users`、`#/admin/users/:id` | `admin` | `requireLogin` + `isUsable` + `isAdmin` |
| `forum.js` | `#/forum` 及五條子路由 | `forum` | 依路由分級，與 Flask 版相同 |

### 3.5 啟動流程

Flask 版的 `db.init_db()` 在伺服器啟動時執行一次；純前端版每次**開啟頁面**都要重跑一次載入流程：

```text
1. index.html 載入 → <script type="module" src="js/app.js">
2. app.js: await initSqlJs({locateFile: f => 'vendor/' + f})
3. connection.js: 讀 localStorage['sad_db']
   ├─ 有資料 → base64 解碼 → new SQL.Database(bytes)
   └─ 沒資料 → new SQL.Database() → 執行 DDL → 植入種子帳號 → 存回 localStorage
4. router.js: 綁定 hashchange，讀取當前 hash，分派第一個 view
5. 畫面出現
```

第 2 步是唯一的非同步瓶頸，約 100–300 毫秒。這段期間 `index.html` 顯示一個載入中的提示，這是 Flask 版沒有的畫面狀態。

### 3.6 session 的對應

| Flask 版 | 純前端版 |
|---------|---------|
| `session['user_id']`（簽章 cookie） | `sessionStorage['currentUserId']`（明文字串） |
| `session['captcha']` | `sessionStorage['captchaAnswer']`（明文字串） |
| `session.clear()` | `sessionStorage.clear()` |

選 `sessionStorage` 而非 `localStorage` 的理由：它在關閉分頁時自動清除，語意最接近 Flask 的 session cookie（無過期時間、關閉瀏覽器即失效）。同時它與存放資料庫的 `localStorage` 分離，讓「身分狀態」與「持久資料」在儲存層就是兩件事——這與 Flask 版的 cookie／資料庫分離一致。

**但兩者的信任模型完全相反。** Flask 的 session cookie 由伺服器以 `SECRET_KEY` 簽章，客戶端改一個位元組就會驗證失敗。`sessionStorage['currentUserId']` 是一個誰都能改的字串：

```js
// 在任何頁面的 DevTools Console 執行
sessionStorage.currentUserId = '2';   // 2 是種子管理員的 id
location.reload();                    // 現在你是管理員
```

這是本版最重要的已知問題（WKI-01），也是最好的教材。

---

## 4. 角色與權限

角色定義、帳號狀態矩陣、權限矩陣、三層檢查順序、自我保護規則 R1–R3、「最後一個管理員」的可達性論證——**全部與 Flask 版 §4 相同**，不重複。

以下只寫差異。

### 4.1 權限檢查的實作對應

| Flask 版 | 純前端版 |
|---------|---------|
| `@login_required` 裝飾器 | `utils.requireLogin()`，未登入時 `location.hash = '#/login'` 並回傳 `false` |
| `_is_usable(user)` | `utils.isUsable(user)`，判斷式逐字相同 |
| `_is_admin(user)` | 各 view 內部的區域函式 `isAdmin(user)`，判斷 `user.role === 0` |
| `session.clear()` + redirect | `sessionStorage.clear()` + `location.hash = '#/login'` |
| `flash(msg, 'error')` + redirect | `setFlash(msg, 'error')`（寫入 `sessionStorage`）+ 導向 |

`isAdmin` 一樣**不放進 `utils.js`**，各 view 自己定義。這條規範在 Flask 版的理由（讓權限判定的位置與使用它的地方在同一個檔案）在這裡完全成立。

admin view 的三層守門一樣在每個 action 開頭明碼寫出，不抽象成 wrapper：

```js
const user = currentUser();
if (!isUsable(user)) { sessionStorage.clear(); go('#/login'); return; }
if (!isAdmin(user))  { setFlash('無操作權限', 'error'); go('#/'); return; }
```

### 4.2 權限檢查是裝飾性的

這一節是本文件與 Flask 版最大的分歧，必須寫清楚。

Flask 版的權限檢查有實質效力：程式碼跑在伺服器上，使用者只能送 HTTP 請求，伺服器決定回什麼。使用者無法跳過 `_is_admin()`。

純前端版的權限檢查**只是介面邏輯**。它決定「畫面上要不要顯示刪除按鈕」，但阻止不了任何有意繞過的人。至少有四條繞過路徑：

| 路徑 | 做法 | 難度 |
|------|------|------|
| 改 session | DevTools 改 `sessionStorage.currentUserId` | 五秒 |
| 直接呼叫 db 函式 | Console 執行 `db.softDeleteUser(2)` | 十秒 |
| 直接改資料庫 | Console 執行 `sqlDb.run("UPDATE users SET role=0 WHERE id=1")` | 十秒 |
| 改程式碼 | DevTools 的 Sources 面板下中斷點，或直接改本地檔案 | 一分鐘 |

**這四條路徑都不需要任何攻擊技巧**，只需要打開開發者工具。

因此本版的定位必須誠實表述：它示範的是「權限模型長什麼樣子」，不是「權限模型如何被強制執行」。要看後者，必須看 Flask 版。

> **教學建議**：把「請你在三十秒內把自己變成管理員」設計成一個課堂練習。做完之後再問：「Flask 版能不能用同樣的方法？為什麼不能？」這個對比比講十遍「前端驗證不可信」有效。

---

## 5. 功能需求

**與 Flask 版 §5 完全相同**：FR-HUB-01~04、FR-AUTH-01~05、FR-PROFILE-01~03、FR-ADMIN-01~07、FR-FORUM-01~07，共 26 條。觸發者、前置條件、主要流程、例外流程、後置條件全部一致。

以下只列**實作方式必然不同**的五處：

**FR-AUTH-04 取得驗證碼圖片。** Flask 版是 `GET /captcha.png` 回傳 PNG。純前端版**沒有這條路由**——驗證碼在畫面渲染時直接以 Canvas 2D 繪製到 `<canvas>` 元素上，答案寫入 `sessionStorage`。字元集、長度（5 位）、尺寸（160×50）與 Flask 版相同。

**FR-AUTH-03 申請帳號的密碼雜湊。** Flask 版用 bcrypt cost=10（同步、約 100 毫秒）。純前端版用 PBKDF2-HMAC-SHA256 100,000 迭代（**非同步**、約 100 毫秒）。因為是非同步的，註冊與登入的流程都必須 `await`，這會影響所有呼叫鏈的寫法（見 §6.4）。

**FR-PROFILE-03 更新個人資料。** 行為與 Flask 版相同，包含**刻意保留的缺陷**：不做 `isUsable` 檢查。對應 Flask 版 KI-03。

**FR-ADMIN-01 與 FR-FORUM-01 的分頁。** 查詢邏輯（`LIMIT ? OFFSET ?`、`COUNT(*)`）完全相同，但分頁連結從 `<a href="/admin/users?page=2">` 變成 `<a href="#/admin/users?page=2">`。

**所有 POST 動作。** Flask 版是「表單 POST → 路由處理 → redirect」。純前端版是「按鈕 click 或表單 submit → handler 執行 → 更新 DB → 存回 localStorage → `location.hash = ...`」。沒有網路往返，沒有頁面重新載入。詳見 §7.3。

---

## 6. 資料模型

### 6.1 三張表的 DDL：與 Flask 版逐字相同

這是本專案最重要的對照點。`js/db/index.js` 中的 `users` 表 DDL 與 `js/db/forum.js` 中的兩張表 DDL，與 Flask 版的 `db/__init__.py`、`db/forum.py` **一個字元都不差**：

```sql
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT    UNIQUE NOT NULL,
    hash          TEXT    NOT NULL,
    role          INTEGER NOT NULL DEFAULT 1,
    name          TEXT,
    display_name  TEXT,
    is_active     INTEGER NOT NULL DEFAULT 1,
    is_deleted    INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    last_login_at TEXT
)
```

`forum` 與 `forum_details` 的 DDL 見 Flask 版 §6.7，同樣逐字沿用。

**這代表兩版的資料庫檔可以互換。** 把純前端版匯出的 `.sqlite` 檔放到 Flask 版的 `DB_PATH`，Flask 版可以直接讀（見 §6.5 的例外）。反過來也成立。這個性質值得在課堂上實際演示一次。

欄位字典、種子資料、軟刪除策略、查詢過濾約定——全部見 Flask 版 §6.3、§6.4、§6.10，不重複。

### 6.2 sql.js 的 API 對應

Flask 版用 `sqlite3` 模組，純前端版用 sql.js。SQL 字串相同，包裝方式不同：

| 操作 | Flask（`sqlite3`） | 純前端（sql.js） |
|------|-------------------|-----------------|
| 建立連線 | `sqlite3.connect(DB_PATH)` | `new SQL.Database(bytes?)`，全域單例 |
| 執行寫入 | `conn.execute(sql, params)` + `conn.commit()` | `db.run(sql, params)` + `persist()` |
| 查詢單筆 | `conn.execute(...).fetchone()` → `Row` 或 `None` | `stmt.step()` ? `stmt.getAsObject()` : `null` |
| 查詢多筆 | `.fetchall()` → `list[Row]` | `while (stmt.step()) rows.push(stmt.getAsObject())` |
| 取得 lastrowid | `cursor.lastrowid` | `db.exec('SELECT last_insert_rowid()')[0].values[0][0]` |
| Transaction | `with conn:` | `db.run('BEGIN'); ...; db.run('COMMIT')`，失敗時 `ROLLBACK` |
| 關閉 | `conn.close()` | 不關閉——全域單例存活整個 session |
| 欄位存取 | `row['email']`（`sqlite3.Row`） | `row.email`（純 JS 物件） |

兩處值得注意：

**沒有 `_get_conn()` / `close()` 的成對呼叫。** Flask 版每個函式各自開關連線（那是 KI-10 的來源）；純前端版只有一個常駐的 `SQL.Database` 實例。這反而讓資料層的程式碼更短、更乾淨——但代價是失去了「連線生命週期」這個教學題材。

**每次寫入後必須手動 `persist()`。** sql.js 的資料庫活在記憶體裡，不寫回 `localStorage` 就會在關閉分頁時消失。這相當於 Flask 版的 `conn.commit()`，但漏掉的後果嚴重得多——`commit()` 漏掉只是該筆交易未生效，`persist()` 漏掉是整個 session 的變更全部消失。

### 6.3 持久化機制

```text
寫入時：db.run(...) → persist()
                       ├─ bytes = db.export()          // Uint8Array
                       ├─ b64 = bytesToBase64(bytes)
                       └─ localStorage['sad_db'] = b64

載入時：b64 = localStorage['sad_db']
        ├─ 有 → bytes = base64ToBytes(b64) → new SQL.Database(bytes)
        └─ 無 → new SQL.Database() → 建表 → 種子 → persist()
```

**容量限制。** `localStorage` 每個 origin 約 5 MB，而 base64 編碼會讓體積膨脹約 33%，因此實際可用的 SQLite 檔大小約 3.7 MB。以教學規模（數十個帳號、數百篇文章）遠遠夠用，但這是一個硬上限，超過會拋 `QuotaExceededError`。記錄為 WKI-05。

**效能。** 每次寫入都要 export 整個資料庫再 base64 編碼。資料庫在 1 MB 以下時單次約 5–20 毫秒，感覺不出來；到 3 MB 時單次可能超過 100 毫秒，連續操作會有頓挫。記錄為 WKI-06。

### 6.4 密碼雜湊

Flask 版用 bcrypt。瀏覽器沒有內建 bcrypt，而引入 bcrypt.js 會再增加一個相依，因此改用 Web Crypto 內建的 **PBKDF2-HMAC-SHA256**。

> **選型說明**：原本的方向是「SHA-256 + salt」。單次 SHA-256 對密碼而言太快（現代 GPU 每秒可算數十億次），加了 salt 也只防彩虹表、不防暴力破解。PBKDF2 就是「SHA-256 + salt」的**正確形式**——同一個雜湊函式、同一個 Web Crypto API、不引入任何新相依，只是把它迭代十萬次讓暴力破解變慢。因此本版採 PBKDF2，視為原方向的具體化而非改變。

參數：

| 項目 | 值 | 對應 Flask 版 |
|------|---|--------------|
| 演算法 | PBKDF2-HMAC-SHA256 | bcrypt |
| 迭代次數（一般帳號） | 100,000 | cost=10 |
| 迭代次數（種子帳號） | 1,000 | cost=4 |
| salt | 16 bytes，`crypto.getRandomValues()` | bcrypt 內含 |
| 輸出 | 256 bits | 184 bits |

儲存格式為 `pbkdf2$<迭代次數>$<salt的base64>$<雜湊的base64>`，全部塞進**同一個 `hash` 欄位**。欄位型別是 `TEXT`，容納得下，因此 DDL 不需要改——這也是兩版資料庫檔能互換的前提之一。

種子帳號一樣用低迭代次數（1,000），理由與 Flask 版相同：初始化時要連續雜湊三個密碼，用 100,000 次會讓首次載入多花約 300 毫秒。這一樣是「教學便利」與「安全」的取捨，記錄為 WKI-07。

**API 是非同步的。** `crypto.subtle.deriveBits()` 回傳 Promise，因此 `createUser()`、`verifyPassword()` 以及所有呼叫它們的函式都必須是 `async`。這條非同步的傳染鏈一路上到 view 的事件 handler，是純前端版與 Flask 版在程式碼形狀上最明顯的差異。

### 6.5 兩版資料庫檔互換的限制

DDL 相同、欄位相同，因此結構完全相容。唯一不相容的是 `hash` 欄位的**內容格式**：

| 來源 | `hash` 格式 | 另一版能否驗證密碼 |
|------|------------|------------------|
| Flask 版建立的帳號 | `$2b$10$...`（bcrypt） | 純前端版**不能**——沒有 bcrypt 實作 |
| 純前端版建立的帳號 | `pbkdf2$100000$...` | Flask 版**不能**——沒有 PBKDF2 驗證邏輯 |

因此互換時：**所有資料都看得到、查詢得到、管理得到，但跨版本的帳號無法登入**。

這其實是一個很好的教學情境：它具體呈現了「資料格式相容」與「應用邏輯相容」是兩件事。真實系統的資料庫遷移經常卡在同一類問題上。

若要讓帳號也能互通，方案是在兩版都實作兩種格式的驗證（依 `hash` 的前綴分派），這是密碼系統升級演算法時的標準做法。列為未來擴充（§13）。

### 6.6 `js/db/` 的函式總表

函式名採 JS 慣例的 camelCase，其餘與 Flask 版一一對應：

| 純前端版 | Flask 版 | 非同步 |
|---------|---------|:---:|
| `findUserByEmail(email)` | `find_user_by_email` | 否 |
| `findUserById(id)` | `find_user_by_id` | 否 |
| `createUser(email, password, name, displayName)` | `create_user` | **是** |
| `verifyPassword(password, hash)` | `bcrypt.checkpw`（Blueprint 內） | **是** |
| `updateUserProfile(id, name, displayName)` | `update_user_profile` | 否 |
| `updateLastLogin(id)` | `update_last_login` | 否 |
| `softDeleteUser(id)` | `soft_delete_user` | 否 |
| `listUsers(page, pageSize, status, keyword)` | `list_users` | 否 |
| `setUserActive(id, isActive)` | `set_user_active` | 否 |
| `setUserRole(id, role)` | `set_user_role` | 否 |
| `listForumMasters(page, pageSize)` | `list_forum_masters` | 否 |
| `getForumMaster(id)` | `get_forum_master` | 否 |
| `createForumMaster(title, content, userId)` | `create_forum_master` | 否 |
| `updateForumMasterTitle(id, title)` | `update_forum_master_title` | 否 |
| `softDeleteForumMaster(id)` | `soft_delete_forum_master` | 否 |
| `listForumDetails(masterId)` | `list_forum_details` | 否 |
| `getForumDetail(id)` | `get_forum_detail` | 否 |
| `createForumDetail(masterId, content, userId)` | `create_forum_detail` | 否 |
| `updateForumDetailContent(id, content)` | `update_forum_detail_content` | 否 |
| `softDeleteForumDetail(id)` | `soft_delete_forum_detail` | 否 |

只有兩個函式是 `async`，都因為 Web Crypto。其餘全部同步——sql.js 的查詢是同步的，這一點與 IndexedDB 形成對比，也是選 sql.js 的次要理由。

`hardDeleteUserByEmail` **不實作**。Flask 版留著它是為了測試清理，純前端版的測試以「重建整個資料庫」清理，不需要它。這順帶消掉了 Flask 版 KI-11 的一半。

### 6.7 匯出與匯入

這是純前端版**獨有**的功能，Flask 版沒有對應。

**匯出**：任何頁面的 topbar 都有「匯出資料庫」按鈕。

```text
db.export() → Uint8Array
  → new Blob([bytes], {type: 'application/x-sqlite3'})
  → URL.createObjectURL(blob)
  → <a download="sad-database.sqlite"> 觸發點擊
  → URL.revokeObjectURL(url)
```

匯出的檔案是**標準 SQLite 格式**，可以用 DB Browser for SQLite、`sqlite3` CLI、或 Flask 版直接打開。

**匯入**：`<input type="file" accept=".sqlite,.db">` → `File.arrayBuffer()` → `new SQL.Database(new Uint8Array(buffer))` → 驗證三張表都存在 → `persist()` → `location.reload()`。

匯入會**完全取代**現有資料，因此按鈕上要有 `confirm()`。匯入失敗（檔案不是 SQLite、或缺少必要的表）時要保留原資料庫不動，並顯示錯誤訊息。

**這兩個功能是「一個檔案儲存資料」這個需求的實際落點。** 平常的自動保存靠 `localStorage`（無感、不需操作），要拿到實體檔案時就匯出。

---

## 7. 路由

### 7.1 hash 路由總表

Flask 版的 21 條路由，在純前端版拆成 **12 條 view 路由**與 **9 個 action handler**：

| # | hash 路由 | 對應 view | Flask 版對應 | 守門 |
|:--:|----------|----------|-------------|------|
| 1 | `#/` | `hub.render` | `GET /` | 無 |
| 2 | `#/login` | `auth.renderLogin` | `GET /login` | 已登入 → `#/` |
| 3 | `#/register` | `auth.renderRegister` | `GET /register` | 已登入 → `#/` |
| 4 | `#/logout` | `auth.logout` | `GET /logout` | 無 |
| 5 | `#/profile` | `profile.render` | `GET /profile` | 1 + 2 |
| 6 | `#/profile?edit=1` | 同上 | `GET /profile?edit=1` | 1 + 2 |
| 7 | `#/admin/users` | `admin.renderList` | `GET /admin/users` | 1 + 2 + 3 |
| 8 | `#/admin/users/:id` | `admin.renderDetail` | `GET /admin/users/<id>` | 1 + 2 + 3 |
| 9 | `#/forum` | `forum.renderIndex` | `GET /forum` | 無 |
| 10 | `#/forum/new` | `forum.renderForm` | `GET /forum/new` | 1 + 2 |
| 11 | `#/forum/reply/:masterId` | `forum.renderForm` | `GET /forum/reply/<id>` | 1 + 2 |
| 12 | `#/forum/edit/master/:id`<br>`#/forum/edit/detail/:id` | `forum.renderForm` | `GET /forum/edit/*` | 1 + 2 + 作者或 3 |

Query string 的解析方式與 Flask 版相同：`#/admin/users?status=active&q=admin&page=2`、`#/forum?page=2&master_id=5`。

**沒有對應的兩條 Flask 路由**：

| Flask 路由 | 為何沒有 |
|-----------|---------|
| `GET /captcha.png` | 驗證碼直接在 Canvas 上畫，不需要一個「取得圖片」的端點 |
| `GET /health` | 沒有伺服器可以健康檢查。nginx 本身的存活由 Docker 管 |

### 7.2 九個 action handler

Flask 版的 POST 路由在純前端版**沒有 URL**，它們是綁在按鈕或表單上的函式：

| Handler | 觸發元素 | Flask 版對應 |
|---------|---------|-------------|
| `auth.handleLogin` | `#/login` 與 `#/` 的登入表單 submit | `POST /login`、`POST /` |
| `auth.handleRegister` | `#/register` 表單 submit | `POST /register` |
| `profile.handleUpdate` | `#/profile?edit=1` 表單 submit | `POST /profile/update` |
| `admin.handleActivate` | 清單／明細的「啟用」按鈕 click | `POST /admin/users/<id>/activate` |
| `admin.handleDeactivate` | 「停用」按鈕 click | `POST .../deactivate` |
| `admin.handleUpdateRole` | 明細頁角色表單 submit | `POST .../role` |
| `admin.handleDeleteUser` | 「刪除」按鈕 click（含 confirm） | `POST .../delete` |
| `forum.handleSubmitForm` | `post_form` 表單 submit（四種情境共用） | `POST /forum/new`、`reply`、`edit/*` |
| `forum.handleDelete` | 刪除文章／回覆按鈕 click（含 confirm） | `POST /forum/delete/*` |

### 7.3 POST-Redirect-GET 在純前端版的形態

Flask 版的 POST-Redirect-GET 解決的是一個具體問題：使用者在 POST 之後按重新整理，瀏覽器會詢問「要重新送出表單嗎」，重送會造成重複寫入。redirect 讓最終停留的頁面是 GET，重新整理是安全的。

純前端版**沒有這個問題**——沒有真正的 POST，重新整理只是重跑當前的 hash 路由，而 hash 路由全部是唯讀的渲染。

但這個慣例**仍然保留**：

```js
function handleDeactivate(userId) {
  // ... 守門與驗證 ...
  setUserActive(userId, 0);
  persist();
  setFlash('帳號已停用', 'success');
  go('#/admin/users');          // ← 相當於 redirect
}
```

保留的理由有二：讓兩版的行為（包含操作後跳到哪一頁）完全一致，以便對照；以及讓「動作與呈現分離」這個結構仍然明顯——handler 只負責改資料與決定去哪，畫面由 view 重新渲染。

> **這是一個值得討論的教學點**：一個慣例在原本的問題消失之後，還值不值得保留？本版的答案是「值得，因為它帶來的結構清晰度獨立於原本的問題」。這類判斷在真實專案中很常見。

### 7.4 `<a>` vs `<button>` 的規則

與 Flask 版相同，但判準要重新表述：

| 元素 | 使用時機 |
|------|---------|
| `<a href="#/...">` | 改變 hash 的導航。**仍然是真的連結**，可以用中鍵開新分頁、可以複製網址 |
| `<button>` + click handler | 有副作用的動作（寫入資料庫） |

**禁止 `<a href="#">` 搭配 onclick 仍然成立**，而且理由更強：在 hash 路由的架構下，`href="#"` 會實際改變 hash（清空它），觸發路由器導向未定義的路徑。這不只是語意問題，是功能錯誤。

---

## 8. 畫面設計

畫面清單、線框說明、使用者旅程、CSS 架構——**全部見 Flask 版 §8**，因為 DOM 結構與 class 名稱刻意保持一致。

以下只列純前端特有的三處。

### 8.1 `<template>` 的組織

`index.html` 中每個畫面對應一個 `<template>`：

```html
<template id="tpl-hub-guest">...</template>
<template id="tpl-hub-user">...</template>
<template id="tpl-login">...</template>
<template id="tpl-register">...</template>
<template id="tpl-profile">...</template>
<template id="tpl-admin-list">...</template>
<template id="tpl-admin-detail">...</template>
<template id="tpl-forum-index">...</template>
<template id="tpl-forum-form">...</template>
```

View 以 `document.getElementById('tpl-x').content.cloneNode(true)` 取出，填入資料後掛到 `<main id="app">`。切換畫面時清空 `#app` 再掛新的。

這相當於 Jinja2 的 `render_template()`，但**沒有樣板引擎**：條件顯示用 `if` 加 `element.remove()`，迴圈用 `for` 加 `appendChild`。這讓「樣板引擎到底幫我們做了什麼」變得具體——答案是：條件、迴圈、變數插值，以及**自動跳脫**。

### 8.2 XSS 防護必須手動維持

Flask 版的 Jinja2 預設自動跳脫，論壇可以安全接受任意輸入（見 Flask 版 §10.2）。純前端版**沒有這層保護**。

規則：**所有使用者產生的內容一律用 `textContent` 寫入，絕不用 `innerHTML`。**

```js
cell.textContent = detail.content;   // 正確
cell.innerHTML = detail.content;     // 錯誤——直接可執行 XSS
```

`innerHTML` 在本專案中只允許用在**開發者自己寫死的**標記上，不允許碰任何來自資料庫的字串。這條規則要寫進 `web-build-guide.md` 的 CSS/JS 稽核階段，並以 grep 檢查。

這是純前端版新增的一條真實風險（WKI-02）。雖然在「使用者本來就能執行任意 JS」的架構下，XSS 的危害有限（沒有別人的 session 可以偷），但養成習慣仍然重要——同一段渲染程式碼搬到有後端的專案就會出事。

### 8.3 匯出／匯入的 UI

Flask 版沒有這組功能。純前端版在**每個頁面的 topbar** 加入兩個元素：

- 「匯出資料庫」`<button>` — 觸發下載
- 「匯入資料庫」`<label>` 包住隱藏的 `<input type="file">` — 選檔後跳 `confirm()` 再執行

樣式沿用各子系統既有的 `*-btn-secondary`，不新增 class。這是本版唯一需要動到 CSS 的地方——而且只是**使用**既有的 class，不新增規則。

---

## 9. 驗證規則與訊息字串

**與 Flask 版 §9 完全相同**：輸入欄位規格、登入驗證順序（5 段）、註冊驗證順序（5 段）、admin 操作驗證順序（8 段）、論壇操作驗證順序（6 段）、33 條訊息字串（auth 11 + admin 11 + forum 11）、flash 的使用慣例。

三處實作差異：

**flash 的傳遞。** Flask 版的 `flash()` 把訊息存進 session，下一個請求以 `get_flashed_messages()` 取出後自動清除。純前端版以 `sessionStorage['flash']` 模擬同樣的「存入 → 讀取一次 → 清除」語意：

```js
function setFlash(msg, category) {
  sessionStorage.flash = JSON.stringify({msg, category});
}
function takeFlash() {
  const raw = sessionStorage.flash;
  if (!raw) return null;
  sessionStorage.removeItem(raw ? 'flash' : '');   // 讀取即清除
  return JSON.parse(raw);
}
```

每個 view 在渲染開始時呼叫一次 `takeFlash()`，有值就渲染到 flash 區。

**`error` 變數的傳遞。** Flask 版把錯誤字串當作 `render_template()` 的參數。純前端版直接在 handler 中呼叫 `view.render({error: '請輸入驗證碼'})`，語意相同。

**訊息字串的集中管理。** Flask 版的 auth 與 admin 訊息集中在 `tests/data/users.py` 的 `MESSAGES`，論壇的 11 條散在測試裡（Flask 版 KI-29）。純前端版把**全部 33 條**集中在 `js/messages.js` 一個檔案，view 一律引用常數而非寫死字串。

> 這是純前端版**主動修正**的一處。理由是：JS 沒有 Python 那種「測試檔與實作檔天然分離」的組織壓力，把字串集中的成本趨近於零；而且 hash 路由的架構下，同一條訊息可能在多個 view 中出現，散落的成本更高。

---

## 10. 非功能需求

### 10.1 效能

| 項目 | 數量級 | 說明 |
|------|-------|------|
| 首次載入 | 1.3 MB / 100–300 ms | 主要是 `sql-wasm.wasm`。之後由瀏覽器快取 |
| 資料庫初始化（首次） | 約 100 ms | 建三張表 + 三個種子帳號的 PBKDF2（1,000 迭代 × 3） |
| 資料庫載入（後續） | 5–30 ms | base64 解碼 + `new SQL.Database(bytes)` |
| 查詢 | < 1 ms | 記憶體中的 SQLite，教學規模下感覺不到 |
| 寫入 + persist | 5–100 ms | 隨資料庫大小線性成長（WKI-06） |
| 註冊或登入 | 約 100 ms | PBKDF2 100,000 迭代 |
| 畫面切換 | < 5 ms | 無網路往返，比 Flask 版快得多 |

**畫面切換無網路往返**是純前端版唯一在效能上勝出的地方，也是單頁應用的核心賣點。值得在課堂上讓兩版並排點擊比較。

### 10.2 安全性

見 §1.2 與 §4.2。摘要：**本版沒有安全性可言，也不宣稱有。**

實際做到的只有兩件事，且都只是「格式正確」而非「有效防護」：

- 密碼以 PBKDF2 雜湊儲存，資料庫中沒有明文
- 使用者產生的內容以 `textContent` 寫入，不會執行

第一項的價值在於：即使有人匯出資料庫檔，也不能直接讀出密碼。但由於同一個瀏覽器裡就能執行任意 JS，這個保護的實際意義接近於零。

### 10.3 相容性

| 需求 | 最低版本 | 用途 |
|------|---------|------|
| WebAssembly | Chrome 57 / Firefox 52 / Safari 11 | sql.js |
| ES Modules | Chrome 61 / Firefox 60 / Safari 11 | `import` / `export` |
| `crypto.subtle` | 全現代瀏覽器（**需安全內容**，見 §2.4） | PBKDF2 |
| `<template>` | 全現代瀏覽器 | 畫面樣板 |
| Canvas 2D | 全現代瀏覽器 | 驗證碼 |

不支援 IE。不使用任何需要 polyfill 的功能。

### 10.4 可維護性

目錄結構、函式命名、分層邊界都刻意與 Flask 版對齊，讓兩版可以並排閱讀。`rules/flask-blueprint.md` 與 `rules/database.md` 的多數條文在本版仍然適用，只需要替換名詞（Blueprint → view、`db/` → `js/db/`）。

一條在本版**加強**的規範：所有 SQL 只寫在 `js/db/` 內，view 不得出現 SQL 字串。Flask 版靠模組邊界與 code review 維持，本版可以直接 grep 驗證（見 build guide 的稽核階段）。

### 10.5 可測試性

沒有 Flask test client 這種現成工具，因此測試策略必須重新設計。見 §12。

### 10.6 部署

nginx:alpine 靜態服務，port 4000（與 Flask 版相同，方便對照）。需要在 `nginx.conf` 中確認 `.wasm` 的 MIME type 為 `application/wasm`——若回傳 `application/octet-stream`，部分瀏覽器的串流編譯會失敗。

容器**不需要 volume**。所有資料都在使用者的瀏覽器裡，容器完全無狀態，重建不會丟失任何東西（見 §11 的 WKI-04）。

---

## 11. 已知問題

Flask 版的 29 條 known issues 在本版的適用情況分為三類。

### 11.1 不再適用（架構性消失）

| Flask 版 ID | 為何不適用 |
|------------|-----------|
| KI-01 CSRF | 沒有跨站請求可以偽造——沒有伺服器端點 |
| KI-05 SECRET_KEY | 沒有 session 簽章機制 |
| KI-06 session cookie 設定 | 不使用 cookie |
| KI-14 `/logout` 是 GET | 沒有 HTTP method 的概念 |
| KI-15 session fixation | 同上 |
| KI-16 `debug=True` | 沒有應用伺服器 |
| KI-24 `init_db()` 在 `__main__` | 啟動流程只有一條 |
| KI-25 無 errorhandler | 沒有 HTTP 狀態碼 |
| KI-10 連線管理 | 單一常駐 DB 實例，沒有開關連線 |
| KI-11 的一半 | 不實作 `hardDeleteUserByEmail` |

**注意**：這些消失**不代表本版更安全**。它們消失是因為對應的攻擊面被一個更大的問題取代了——見 WKI-01。

### 11.2 原樣繼承

| Flask 版 ID | 內容 | 本版狀態 |
|------------|------|---------|
| **KI-03** | `profile` 更新不做 `isUsable` 檢查 | **刻意保留**，與 Flask 版一致 |
| KI-04 | profile 無輸入驗證與成功回饋 | 保留 |
| KI-07 | 驗證碼答案登入後未清除 | 保留 |
| KI-08 | 無索引 | 保留（DDL 逐字相同） |
| KI-09 | 無 `FOREIGN KEY` | 保留（DDL 逐字相同） |
| KI-12 | 密碼只檢查長度 ≥ 8 | 保留 |
| KI-13 | 無稽核紀錄 | 保留 |
| KI-17 | admin 動作後不保留篩選狀態 | 保留 |
| KI-19 | 狀態 badge 底色未納入 token | 保留（CSS 逐字相同） |
| KI-20 | 搜尋未 escape `LIKE` 萬用字元 | 保留（SQL 逐字相同） |
| KI-22 | email 未大小寫正規化 | 保留 |
| KI-23 | hub 內嵌登入是 auth 登入的複製 | 保留 |
| KI-26 | 無共用的 flash 區塊 | 保留 |
| KI-27 | 種子帳號 id 隱含綁定 | 保留 |
| KI-28 | 論壇內容無長度上限 | 保留 |
| KI-30 | 可刪除首篇內文 | 保留 |

**KI-03 與 forum 守門的不對稱同樣保留。** 純前端版的 forum view 做 `isUsable` 檢查，profile 的更新 handler 不做。判準與 Flask 版 §11.0 相同。

> 在權限已經完全不可信的架構下保留這組不對稱，看起來像是無意義的堅持。但它的教學價值不在安全，而在**行為一致性**：兩版對同一個操作應該給出同樣的結果，這樣學生做對照實驗時才不會被無關的差異干擾。

### 11.3 純前端版特有

**WKI-01 — 所有權限檢查都可繞過** ⚠️
描述：`sessionStorage.currentUserId` 是明文字串，資料庫實例掛在全域，所有 JS 都可以在 Console 中呼叫。四條繞過路徑見 §4.2。
影響：**權限系統完全沒有強制力**。任何使用者都能在數秒內成為管理員、刪除任何資料、讀出所有密碼雜湊。
為何接受：這是純前端架構的本質，不是實作缺陷。無法在不引入後端的前提下修補。
修補方向：**不存在**。唯一的「修補」是改用 Flask 版。
> 這是本版最重要的一條，也是它作為教材存在的理由。

**WKI-02 — XSS 防護靠人工紀律**
描述：沒有 Jinja2 的自動跳脫。渲染使用者內容時若誤用 `innerHTML`，論壇的內容欄位可直接執行任意腳本。
影響：在本架構下危害有限（使用者本來就能執行 JS，沒有他人的 session 可偷），但同一段程式碼搬到有後端的專案就是嚴重漏洞。
為何接受：不引入樣板引擎的必然結果。以「一律 `textContent`」的規範加上 grep 稽核來管理。
修補方向：引入一個極小的樣板函式，統一負責跳脫。或改用 `<template>` + `textContent` 的固定樣式（本版採此法）。工作量 30 分鐘。

**WKI-03 — 密碼雜湊演算法與 Flask 版不同**
描述：Flask 用 bcrypt，本版用 PBKDF2。兩版的資料庫檔結構相容但 `hash` 格式不同，跨版本的帳號無法登入（見 §6.5）。
影響：兩版無法共用帳號。做對照演示時要說明清楚，否則學生會以為是 bug。
為何接受：瀏覽器沒有內建 bcrypt，引入 bcrypt.js 會增加相依並偏離「盡量用原生 API」的原則。
修補方向：兩版都實作雙格式驗證（依 `hash` 前綴分派）。工作量 2 小時，且需要 Flask 版也改。

**WKI-04 — 資料綁在瀏覽器，不綁在容器**
描述：資料存在使用者瀏覽器的 `localStorage`。換瀏覽器、換裝置、清除瀏覽資料、使用無痕視窗，資料都不會跟著走。Docker volume 對此完全無效（見 §2）。
影響：學生在教室電腦做的作業，回家看不到。清除瀏覽器快取會連同資料一起清掉。
為何接受：純前端架構的必然結果。以匯出／匯入功能緩解——資料可以帶著走，只是要手動。
修補方向：無法根治。可加強的是提示：在 topbar 常駐顯示「上次匯出時間」，超過一定時間未匯出就提醒。工作量 1 小時。

**WKI-05 — `localStorage` 容量上限約 5 MB**
描述：base64 編碼讓 SQLite 檔膨脹約 33%，實際可用約 3.7 MB。超過時 `persist()` 會拋 `QuotaExceededError`。
影響：以教學規模不會遇到。但若有人貼上大量文字（KI-28 論壇內容無長度上限），可能提前撞到。
為何接受：教學規模下不是問題，而處理它需要引入 IndexedDB 或 OPFS，複雜度顯著上升。
修補方向：`persist()` 加 try/catch，捕捉 `QuotaExceededError` 時提示使用者匯出並清理舊資料。工作量 30 分鐘。這是最低成本的緩解。

**WKI-06 — 每次寫入都要 export 整個資料庫**
描述：sql.js 沒有增量持久化機制，`persist()` 必須 export 全庫再 base64 編碼。
影響：資料庫在 1 MB 以下時感覺不到；到 3 MB 時單次寫入可能超過 100 毫秒，連續操作有頓挫。
為何接受：sql.js 的架構限制。以教學規模而言可接受。
修補方向：改用支援增量持久化的 wa-sqlite + OPFS。工作量 1 天以上，且會引入 COOP/COEP 的 header 設定，複雜度不成比例。

**WKI-07 — 種子帳號的迭代次數偏低**
描述：種子帳號用 PBKDF2 1,000 迭代（一般帳號為 100,000），以縮短首次載入時間。
影響：與 Flask 版的 KI-21 同構——種子帳號的雜湊強度不足，且明文密碼公開於原始碼。
為何接受：與 Flask 版相同的取捨。三個帳號用 100,000 迭代會讓首次載入多花約 300 毫秒。
修補方向：把兩個迭代次數抽成具名常數並加註說明。工作量 15 分鐘。

**WKI-08 — 沒有載入失敗的處理**
描述：若 `sql-wasm.wasm` 載入失敗（檔案缺失、MIME type 錯誤、網路中斷），`initSqlJs()` 會 reject，目前沒有對應的錯誤畫面。
影響：使用者只看到永遠停在「載入中」的空白頁，不知道發生什麼事。
為何接受：正常部署下不會發生。
修補方向：`app.js` 的啟動流程包 try/catch，失敗時渲染一個說明頁（含常見原因：是否用 `file://` 開啟、`.wasm` 的 MIME type）。工作量 30 分鐘。這對教學環境很值得做——「用雙擊開啟」是新手最常犯的錯。

**WKI-09 — 沒有並行控制**
描述：同一個瀏覽器開兩個分頁，兩邊各自持有一份記憶體中的資料庫。A 分頁寫入後 `persist()`，B 分頁再寫入時會用自己那份（過時的）資料覆蓋掉 A 的變更。
影響：後寫入的分頁會靜默覆蓋先寫入的變更。教學情境下容易觸發——學生常同時開兩個分頁比較不同角色的畫面。
為何接受：處理它需要監聽 `storage` 事件並重新載入資料庫，或加版本號做衝突偵測，複雜度不低。
修補方向：最低成本的做法是監聽 `window.addEventListener('storage', ...)`，偵測到其他分頁寫入時提示「資料已在其他分頁更新，請重新整理」。工作量 1 小時。
> **這條在演示時很容易踩到**，`web-build-guide.md` 的最終驗收會特別提醒。

---

## 12. 測試策略

### 12.1 與 Flask 版的根本差異

Flask 版用 pytest + Flask test client，每個測試函式拿到一個全新的暫存資料庫，斷言 HTTP 回應與資料庫狀態。這套機制在純前端版**完全不適用**：沒有 Python、沒有 HTTP 請求、沒有檔案系統。

三個可行方向：

| 方向 | 說明 | 建議 |
|------|------|------|
| 瀏覽器內測試頁 | `tests.html` 載入所有模組，以自寫的極簡斷言函式跑測試，結果渲染在頁面上 | **採用** |
| Node + jsdom | 在 Node 中模擬 DOM 跑測試 | 不採用——引入 npm 生態，違背零工具鏈的定位 |
| Playwright / Puppeteer | 真實瀏覽器端對端測試 | 不採用——工具鏈成本遠超本專案規模 |

### 12.2 測試頁的設計

`web/tests.html` 是一個獨立的 HTML，與主程式共用 `js/` 下的所有模組：

```text
tests.html
  ├─ 載入 sql.js 與所有 js/db/ 模組
  ├─ 每個測試前：建立全新的記憶體資料庫（不碰 localStorage）
  ├─ 執行測試，收集 pass / fail
  └─ 結果以表格渲染，失敗的顯示期望值與實際值
```

隔離機制對應 Flask 版的 `tmp_path` fixture：

| Flask 版 | 純前端版 |
|---------|---------|
| `db_module.DB_PATH = tmp_path / 'test.db'` | `setTestDatabase(new SQL.Database())` |
| `db.init_db()` | `initSchema(); await seedUsers();` |
| 無 teardown（靠 `tmp_path`） | 無 teardown（下一個測試直接換掉實例） |

關鍵在於 `js/db/connection.js` 要提供一個 `setDatabase(instance)` 的注入點，讓測試能替換全域實例——這與 Flask 版 `_get_conn()` 每次重讀 `db.DB_PATH` 的設計動機完全相同：**為了可測試性而保留一個替換點**。

### 12.3 測試範圍

| 層 | 可測 | 案例數 |
|----|------|:--:|
| `js/db/users.js` | 全部函式的查詢、寫入、篩選、分頁、狀態轉換 | 約 25 |
| `js/db/forum.js` | 全部函式，含 transaction 與級聯 | 約 20 |
| `js/utils.js` | `isUsable`、`genCaptcha`、密碼雜湊與驗證 | 約 10 |
| 業務規則 | 自我保護 R1–R3、守門判斷（以純函式抽出的部分） | 約 15 |
| **合計** | | **約 70** |

**不測的部分**：DOM 渲染、事件綁定、hash 路由分派、Canvas 繪製。這些需要真實的瀏覽器環境與更重的工具，超出本專案的定位。它們靠手動驗收覆蓋（見 build guide 的最終階段）。

Flask 版的約 112 個案例中，有相當比例是透過 test client 驗證路由與權限，這部分在本版落到手動驗收。這個覆蓋率的落差要誠實記錄——**純前端版的自動化測試覆蓋率明顯低於 Flask 版**，這也是架構選擇的代價之一。

### 12.4 測試資料

`js/tests/data.js` 對應 Flask 版的 `tests/data/users.py`，內容相同：三個種子帳號的 email、密碼、id。

訊息字串不需要另外定義——本版已把 33 條集中在 `js/messages.js`（見 §9），測試直接引用同一份常數。這消掉了 Flask 版「訊息字串存兩份、需人工同步」的問題。

---

## 13. 未來擴充建議

| 優先 | 項目 | 說明 | 工作量 |
|:--:|------|------|-------|
| 1 | WKI-08 載入失敗的錯誤頁 | 新手最常踩「雙擊開啟」，一個說明頁能省下大量助教時間 | 30 分鐘 |
| 2 | WKI-05 容量超限的處理 | `persist()` 加 try/catch 並提示匯出 | 30 分鐘 |
| 3 | WKI-09 多分頁衝突提示 | 監聽 `storage` 事件 | 1 小時 |
| 4 | 「上次匯出時間」提示 | 緩解 WKI-04 的資料遺失風險 | 1 小時 |
| 5 | 雙格式密碼驗證 | 讓兩版帳號互通（需 Flask 版一併修改） | 2 小時 |
| 6 | File System Access API | Chrome/Edge 下可直接讀寫使用者指定的 `.sqlite` 檔，自動保存 | 3 小時 |
| 7 | 稽核紀錄（對應 KI-13） | 與 Flask 版同構，新增第四張表 | 3 小時 |

**明確不建議做的：**

| 項目 | 為何不做 |
|------|---------|
| 加入前端框架（React／Vue） | 本版存在的目的之一就是示範「不用框架也做得出來」。加了框架，對照的對象就從「架構差異」變成「框架差異」 |
| 引入打包工具（Vite／webpack） | ES Modules 原生可用。加入打包會讓「打開 DevTools 就能讀懂每一行」這個性質消失 |
| 試圖修補 WKI-01 | 前端加密、混淆、完整性檢查全部無效——程式碼在使用者手上。想要真正的權限控制，答案是 Flask 版 |

---

## 附錄 A：兩版檔案對照

| Flask 版 | 純前端版 | 關係 |
|---------|---------|------|
| `app.py` | `js/app.js` + `js/router.js` | 重寫 |
| `utils.py` | `js/utils.js` | 重寫（`isUsable` 邏輯逐字對應） |
| `db/connection.py` | `js/db/connection.js` | 重寫（多了 persist／export／import） |
| `db/__init__.py` | `js/db/index.js` | 重寫，**DDL 逐字相同** |
| `db/users.py` | `js/db/users.js` | 重寫，**SQL 幾乎逐字相同** |
| `db/forum.py` | `js/db/forum.js` | 重寫，**SQL 幾乎逐字相同** |
| `blueprints/auth/` | `js/views/auth.js` | 重寫，驗證順序與訊息相同 |
| `blueprints/hub/` | `js/views/hub.js` | 同上 |
| `blueprints/profile/` | `js/views/profile.js` | 同上 |
| `blueprints/admin/` | `js/views/admin.js` | 同上 |
| `blueprints/forum/` | `js/views/forum.js` | 同上 |
| `templates/*.html`（9 個） | `index.html` 的 9 個 `<template>` | 結構與 class 相同，語法重寫 |
| `static/*.css`（6 個） | `css/*.css`（6 個） | **逐字相同**，只改 `<link>` 路徑 |
| `tests/*.py`（5 個） | `tests.html` + `js/tests/*.js` | 完全重寫 |
| `Dockerfile` | `Dockerfile` | 重寫（python:slim → nginx:alpine） |
| `docker-compose.yml` | `docker-compose.yml` | 簡化（無 volume、無環境變數） |
| — | `vendor/sql-wasm.{js,wasm}` | 新增 |
| — | `nginx.conf` | 新增 |
| — | `js/messages.js` | 新增（33 條訊息集中管理） |

## 附錄 B：詞彙對照

| 純前端版 | Flask 版 | 說明 |
|---------|---------|------|
| view | Blueprint | 一個子系統的邏輯單位 |
| `<template>` | Jinja2 template | 畫面樣板 |
| hash 路由 | `url_map` | 路徑到處理函式的對應 |
| action handler | POST 路由 | 有副作用的操作 |
| `persist()` | `conn.commit()` | 讓變更生效 |
| `sessionStorage` | Flask session | 身分狀態的儲存 |
| `setFlash` / `takeFlash` | `flash` / `get_flashed_messages` | 跨導向的訊息傳遞 |
| `go('#/x')` | `redirect(url_for('x'))` | 導向 |
| `setDatabase()` | `db.DB_PATH = ...` | 測試用的替換點 |
