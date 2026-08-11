# 器材借用系統 — 系統規格書

## 0. 文件資訊

| 項目 | 內容 |
|------|------|
| 文件名稱 | 器材借用系統 系統規格書 |
| 版本 | v1.0 |
| 日期 | 2026-08-10 |
| 適用讀者 | 修習系統分析與設計課程的學生、後續維護此專案的開發者 |
| 系統版本 | 器材借用系統 v1.0（sad-equipment） |

### 0.1 文件定位

本專案的文件分為四層，各自回答不同的問題。撰寫或閱讀時請先確認自己需要的是哪一層：

| 文件 | 回答的問題 |
|------|-----------|
| `document/system-spec.md`（本文件） | 這個系統**是什麼**：功能、資料、規則、限制 |
| `document/build-guide.md` | 這個系統**怎麼建**：從空目錄到可執行的分階段步驟與驗收方式 |
| `CLAUDE.md`、各子目錄的 `CLAUDE.md` | AI 助理與開發者**怎麼協作**：專案速查、模組職責 |
| `rules/flask-blueprint.md`、`rules/database.md` | 寫程式時**要遵守什麼**：路由、表單、SQL、CSS 的具體慣例 |
| `document/auth.md`、`hub.md`、`profile.md`、`admin.md`、`equipment.md` | 單一子系統的**細部行為**：資料流、錯誤情境、畫面欄位 |

本文件是其他文件的上位依據。當本文件與其他文件衝突時，以本文件為準，並回頭修正衝突的那一份。

### 0.2 本系統的組成

本系統分成兩塊：

| 區塊 | 內容 |
|------|------|
| 會員帳號與管理 | `auth`、`hub`、`profile`、`admin` 四個 Blueprint、`users` 資料表、三層權限模型、`utils.py`、`rules/`、測試架構、CSS token 架構 |
| 器材借用 | `equipment` Blueprint、`equipment` / `borrow_orders` / `borrow_order_items` 三張資料表、借用單狀態機、庫存扣減邏輯、七個器材模板與 `equipment.css` |

---

## 1. 專案定位與範圍

### 1.1 系統目的

提供一個規模小到能在一堂課內讀完、但涵蓋完整交易流程的器材借用系統，讓學生能夠：

1. 追蹤一筆資料從表單輸入、驗證、寫入資料庫、到畫面呈現的完整路徑
2. 觀察**主檔／明細**（`borrow_orders` / `borrow_order_items`）這種在企業系統中隨處可見的結構
3. 觀察一個**狀態機**如何同時存在於資料欄位、Python 條件式與 Jinja 模板三個地方
4. 理解**共用資源的一致性**問題：可借數量什麼時候扣、什麼時候還、誰來檢查、檢查幾次
5. 理解**授權必須在伺服器端**：前端隱藏按鈕只是提示，測試會直接 POST 來證明這一點

### 1.2 功能範圍（In Scope）

| 子系統 | 功能 |
|--------|------|
| auth | 登入、申請帳號、登出、圖形驗證碼 |
| hub | 服務入口首頁（訪客／登入兩種模式）、內嵌登入 |
| profile | 檢視與修改自己的姓名與顯示名稱 |
| admin | 會員清單（篩選、搜尋、分頁）、會員明細、啟用／停用、調整角色、軟刪除 |
| equipment | 器材清單與詳細、器材維護、借用申請、修改與取消申請、我的借用紀錄、借用單審核、登記借出與歸還 |

### 1.3 不在範圍內（Out of Scope）

以下項目**刻意不實作**，但其中多數已在第 11 章記錄為技術債或缺口：

- 逾期偵測與逾期通知（`overdue` 狀態存在但無人寫入，KI-01）
- 借用期間的重疊檢查與真正的「預約」語意（KI-09）
- 購物車式的多項器材借用介面（KI-04）
- 部分歸還、損壞／遺失登記、罰則與停權
- 電子郵件或任何形式的通知（KI-27）
- 密碼重設、電子郵件驗證、雙因素驗證
- 報表、匯出、統計圖表
- API（本系統只有伺服器端渲染的 HTML 頁面）

### 1.4 使用情境

1. 學生用訪客身分瀏覽器材清單，確認有想借的器材後申請帳號
2. 登入後選擇器材，填寫借用期間、用途與數量，送出申請（狀態 `pending`）
3. 送出後如發現填錯，在管理員審核前可自行修改或取消
4. 管理員在「借用單管理」看到待審核的單，核准或拒絕（可留備註）
5. 學生實際到器材室領取，管理員按下「登記借出」，可借數量在此刻扣減
6. 歸還時管理員按下「登記歸還」，可借數量恢復

---

## 2. 技術棧與執行環境

### 2.1 技術棧

| 層級 | 技術 | 備註 |
|------|------|------|
| 後端 | Python 3.11 + Flask | 模組層級的 `app` 物件，**無 application factory** |
| 路由 | Flask Blueprint | 五個 Blueprint，彼此不互相 import |
| 樣板 | Jinja2 | 伺服器端渲染，無前端框架 |
| 樣式 | 純手寫 CSS | 六個檔案，無 CDN、無預處理器、無打包工具 |
| 前端腳本 | 無 | 只有 13 處 inline event handler（見 §8.5） |
| 資料庫 | SQLite（`sqlite3`） | WAL 模式，**無 ORM**，SQL 全部手寫於 `db/` |
| 密碼 | bcrypt | 註冊 cost=10，種子帳號 cost=4 |
| 驗證碼 | captcha（`ImageCaptcha`） | 伺服器端產生 160×50 PNG |
| 測試 | pytest + pytest-flask | Flask test client，不啟動實際伺服器 |
| 容器 | Docker + Docker Compose | `python:3.11-slim`，port 4000，named volume |

`requirements.txt` **不釘選版本**：

```
flask
bcrypt
captcha
pytest
pytest-flask
```

### 2.2 刻意不採用的技術

| 未採用 | 理由 |
|--------|------|
| SQLAlchemy 或任何 ORM | 讓學生直接讀到 SQL，看見資料表與查詢的對應 |
| Flask-Login | `login_required` 只有 7 行，讀完比讀文件快 |
| Flask-WTF / CSRF 保護 | 表單處理維持 `request.form.get()` 一層（見 KI-16） |
| Application factory | 測試直接 `from app import app` 並替換 `db.DB_PATH` |
| Alembic 等 migration 工具 | schema 以 `CREATE TABLE IF NOT EXISTS` 建立；改欄位就刪掉 `database.db`（見 KI-15） |
| Service layer | 驗證留在 Blueprint、狀態轉移與 transaction 留在 `db/`，兩層即可 |

### 2.3 環境變數

| 變數 | 預設值 | 說明 |
|------|--------|------|
| `SECRET_KEY` | `dev-secret-key-change-in-production` | Flask session 簽章金鑰 |
| `DB_PATH` | `database.db` | SQLite 檔案路徑 |

### 2.4 執行方式

```bash
# 本機
pip install -r requirements.txt
python app.py                    # http://localhost:4000

# Docker
docker compose up -d --build
docker compose down -v           # 停止並重置資料
```

`app.py` 只在 `__name__ == '__main__'` 時呼叫 `db.init_db()` 並以 `debug=True` 啟動，
port 固定 4000、綁定 `0.0.0.0`。

---

## 3. 系統架構

### 3.1 分層

```
瀏覽器
  │  HTTP（表單 POST / 連結 GET）
  ▼
Blueprint 路由層  ── 權限檢查、表單驗證、flash 訊息、POST-Redirect-GET
  │  db.* 函式呼叫
  ▼
db/ 資料存取層    ── 全部的 SQL、transaction、狀態轉移的前置條件檢查
  │  sqlite3
  ▼
SQLite（WAL）
```

規則：

- **所有 SQL 都寫在 `db/` 套件內**，Blueprint 不出現任何 SQL 字串
- **Blueprint 之間不互相 import**，跨子系統的連結只用 `url_for()`
- 每個 `db.*` 函式自行 `_get_conn()` 並在結束前 `conn.close()`，不使用 Flask `g`

### 3.2 檔案結構

見 `CLAUDE.md`「專案結構」一節。

### 3.3 資料庫連線

```python
def _get_conn():
    from db import DB_PATH          # 延遲讀取，讓測試替換即時生效
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn
```

函式內的 `from db import DB_PATH` 是整個測試隔離機制的關鍵：
`tests/conftest.py` 只要 `db.DB_PATH = str(tmp_path / 'test.db')`，下一次連線就會落到暫存檔。

### 3.4 初始化

`db.init_db()` 依固定順序執行，重複呼叫是安全的：

1. `CREATE TABLE IF NOT EXISTS users`
2. `_init_equipment_tables(conn)` — 建立 `equipment`、`borrow_orders`、`borrow_order_items`
3. `_seed_users_if_empty(conn)` — `users` 為空時植入三個種子帳號
4. `_seed_equipment_if_empty(conn)` — `equipment` 為空時植入八筆種子器材

### 3.5 Session

- session 中**只存 `user_id`（int）與 `captcha`（str）**
- `role` 不進 session，每個請求都重新從資料庫讀取
- 因此管理員停用某帳號後，該帳號的下一個請求就會被擋下，不需要等 session 過期

---

## 4. 角色與權限

### 4.1 角色

| `role` | 身份 | 說明 |
|--------|------|------|
| `0` | 管理員 | 一般使用者的全部權限，加上會員管理、器材維護、借用單審核與登記借出／歸還、檢視任何人的借用單 |
| `1` | 一般使用者 | 自己的個人資料；瀏覽器材；送出／修改／取消自己的借用申請；檢視自己的借用紀錄 |

新申請的帳號一律為 `role = 1`（資料表預設值），系統沒有自助升級為管理員的途徑。

### 4.2 帳號狀態矩陣

`is_active` 與 `is_deleted` 是兩個獨立旗標：

| `is_deleted` | `is_active` | 狀態 | 能否登入 | 舊 session 能否使用 |
|--------------|-------------|------|---------|-------------------|
| 0 | 1 | 正常 | 可以 | 可以 |
| 0 | 0 | 已停用 | 不可（訊息「帳號已停用」） | 不可（第 2 層守門清除 session） |
| 1 | 任意 | 已刪除 | 不可（訊息「帳號或密碼錯誤」） | 不可 |

已刪除的帳號在登入時**刻意回報與帳號不存在相同的訊息**，避免洩漏「這個 email 曾經註冊過」。

### 4.3 三層權限檢查（順序不可調換）

```
1. @login_required   無 session       -> redirect auth.login_page
2. _is_usable(user)  帳號失效         -> session.clear() + redirect auth.login_page
3. _is_admin(user)   role != 0        -> flash 無操作權限 + redirect（首頁或器材頁）
```

第 2 層失敗代表**身分本身失效**，處置是登出；第 3 層失敗代表**身分有效但權限不足**，處置是導回。
若把第 3 層放前面，已被停用的管理員會收到與事實不符的「權限不足」，且 session 不會被清除。

`_is_admin(user)` 為各 Blueprint 的局部 helper，**不放入 `utils.py`**。
在 `admin` 的六個路由中，這三層是**明碼重複寫出**的，不抽象成裝飾器——這個重複是刻意的教學設計。

### 4.4 各子系統的守門層級

| 路由 | 層級 | 補充 |
|------|------|------|
| `GET/POST /` | 無 | 失效帳號清 session 後退回訪客視圖，不 redirect |
| `/login`、`/register` | 無 | 已登入時 redirect 首頁 |
| `GET /profile` | 1 + 2 | |
| `POST /profile/update` | 1 | **刻意缺少第 2 層**（KI-03） |
| `/admin/*` | 1 + 2 + 3 | 六個路由各自明碼寫出 |
| `GET /equipment/` | 無 | 訪客可瀏覽 |
| `/equipment/<id>/borrow`、`/my-orders`、`/orders/*` | 1 + 2 | 再加本人／管理員的物件層檢查 |
| `/equipment/new`、`/edit/*`、`/delete/*`、`/admin/*` | 1 + 2 + 3 | |

`equipment` 因為有開放瀏覽的頁面，第 1、2 層收斂進 `_current_user()`（回傳 `None` 代表訪客或失效帳號），
寫入類路由再各自 `if user is None: session.clear(); redirect`。
`_current_user()` 內**不**呼叫 `session.clear()`——訪客與失效帳號在它眼中都是 `None`，只有後者需要清。

### 4.5 權限矩陣

| 操作 | 訪客 | 一般使用者 | 管理員 |
|------|:----:|:---------:|:-----:|
| 瀏覽器材清單／詳細 | ✅ | ✅ | ✅ |
| 申請帳號、登入 | ✅ | — | — |
| 檢視／修改自己的個人資料 | ❌ | ✅ | ✅ |
| 新增／修改／刪除器材 | ❌ | ❌ | ✅ |
| 送出借用申請 | ❌ | ✅ | ✅ |
| 檢視借用單 | ❌ | 僅自己 | 全部 |
| 修改／取消借用申請 | ❌ | 僅自己 | 僅自己 |
| 核准／拒絕／登記借出／登記歸還 | ❌ | ❌ | ✅ |
| 會員清單／明細／啟用／停用／改角色／刪除 | ❌ | ❌ | ✅ |

管理員**沒有**代替他人修改或取消借用單的權限：那兩個操作只認 `borrower_id`。
管理員否決一張單的正式手段是「拒絕」，而不是「取消」——兩者在資料上是不同狀態，責任歸屬也不同。

### 4.6 自我保護規則

| 規則 | 內容 | 訊息 |
|------|------|------|
| R1 | 不可停用自己 | `不可停用自己的帳號` |
| R2 | 不可刪除自己 | `不可刪除自己的帳號` |
| R3 | 不可修改自己的角色 | `不可修改自己的角色` |

「啟用」不設限，因為對一個已啟用的執行者而言那是冪等的無害操作。

由 R1–R3 可推得：任何管理動作完成後，執行者仍是啟用、未刪除、`role=0` 的帳號，
因此系統中永遠至少有一個可用的管理員。系統**不實作管理員計數檢查**。

> ⚠️ 若未來放寬 R1–R3 任何一條，必須立即補上「操作後啟用中管理員數 ≥ 1」的檢查，
> 否則系統可被鎖死且無法從介面復原。

---

## 5. 功能需求

編號規則：`FR-<子系統>-<序號>`。

### 5.1 auth

| 編號 | 需求 |
|------|------|
| FR-AUTH-01 | 使用者可以 email 與密碼登入，需通過圖形驗證碼 |
| FR-AUTH-02 | 驗證碼比對不分大小寫，輸入前先 `.strip().upper()` |
| FR-AUTH-03 | 登入成功時更新 `last_login_at`，寫入 `session['user_id']`，redirect 首頁 |
| FR-AUTH-04 | 已刪除帳號與不存在帳號回報相同訊息 |
| FR-AUTH-05 | 已停用帳號回報「帳號已停用」 |
| FR-AUTH-06 | 使用者可申請帳號，需填 email 與密碼，姓名與顯示名稱選填 |
| FR-AUTH-07 | 密碼至少 8 個字元，需兩次輸入一致 |
| FR-AUTH-08 | email 重複時回報「此電子郵件已被使用」 |
| FR-AUTH-09 | 新帳號一律 `role = 1`、`is_active = 1` |
| FR-AUTH-10 | 登出清除整個 session |

### 5.2 hub

| 編號 | 需求 |
|------|------|
| FR-HUB-01 | 首頁開放訪客瀏覽 |
| FR-HUB-02 | 訪客視圖顯示可點的器材借用卡片，其餘卡片為鎖定樣式 |
| FR-HUB-03 | 訪客視圖右側內嵌登入表單，驗證邏輯與訊息與 `/login` 相同 |
| FR-HUB-04 | 已登入視圖顯示歡迎訊息與服務卡片 |
| FR-HUB-05 | 管理員額外顯示「借用單管理」與「會員管理」兩張卡片 |
| FR-HUB-06 | 持有失效帳號 session 者，清除 session 後以訪客視圖呈現，**不 redirect** |

### 5.3 profile

| 編號 | 需求 |
|------|------|
| FR-PROF-01 | 已登入者可檢視自己的 email、姓名、顯示名稱、身份、建立日期、最後登入 |
| FR-PROF-02 | `?edit=1` 進入編輯模式，可修改姓名與顯示名稱 |
| FR-PROF-03 | 空字串一律存為 `NULL` |
| FR-PROF-04 | 更新後 redirect 回唯讀模式（POST-Redirect-GET） |

### 5.4 admin

| 編號 | 需求 |
|------|------|
| FR-ADMIN-01 | 管理員可檢視會員清單，每頁 10 筆 |
| FR-ADMIN-02 | 清單可依 `status`（all / active / disabled / deleted）篩選 |
| FR-ADMIN-03 | 清單可依關鍵字搜尋 email、姓名、顯示名稱 |
| FR-ADMIN-04 | 篩選、搜尋、分頁三者可組合 |
| FR-ADMIN-05 | 可檢視單一會員明細（含已刪除者） |
| FR-ADMIN-06 | 可啟用、停用、調整角色、軟刪除 |
| FR-ADMIN-07 | 已刪除的帳號不可再執行任何操作 |
| FR-ADMIN-08 | 遵守 R1–R3 自我保護規則 |
| FR-ADMIN-09 | 目標不存在時回報「找不到該使用者」 |

### 5.5 equipment

| 編號 | 需求 |
|------|------|
| FR-EQ-01 | 器材清單開放訪客瀏覽，每頁 10 筆，依名稱升冪 |
| FR-EQ-02 | `?id=N` 在右側顯示該器材詳細 |
| FR-EQ-03 | 已邏輯刪除的器材不出現在清單與詳細 |
| FR-EQ-04 | 管理員可新增器材：名稱、編號、說明、總數量、可借數量、狀態 |
| FR-EQ-05 | 可借數量不可大於總數量，兩者皆不可為負 |
| FR-EQ-06 | 器材狀態限 `available` / `unavailable` / `maintenance` |
| FR-EQ-07 | 管理員可修改與邏輯刪除器材 |
| FR-EQ-08 | 已登入且帳號有效者可對 `available` 的器材送出借用申請 |
| FR-EQ-09 | 借用申請需填預計借用開始、預計歸還、用途、數量 |
| FR-EQ-10 | 預計歸還時間必須晚於預計借用開始時間 |
| FR-EQ-11 | 借用數量必須為正整數且不大於目前可借數量 |
| FR-EQ-12 | 送出後借用單狀態為 `pending`，**不扣減可借數量** |
| FR-EQ-13 | 借用者可檢視自己的借用紀錄 |
| FR-EQ-14 | 借用單詳細限借用者本人或管理員檢視 |
| FR-EQ-15 | 借用者可修改自己的借用申請，限狀態為 `pending` |
| FR-EQ-16 | 借用者可取消自己的借用申請，限狀態為 `pending` 或 `approved` |
| FR-EQ-17 | 管理員可檢視所有借用單，依建立時間降冪 |
| FR-EQ-18 | 管理員可核准或拒絕 `pending` 的借用單，可附備註 |
| FR-EQ-19 | 核准前重新檢查各器材的可借數量，不足則核准失敗 |
| FR-EQ-20 | 管理員可對 `approved` 的借用單登記借出，可借數量在此刻扣減 |
| FR-EQ-21 | 管理員可對 `borrowed` 或 `overdue` 的借用單登記歸還，可借數量恢復但不超過總數量 |
| FR-EQ-22 | 可借數量在任何情況下都不會成為負數 |

---

## 6. 資料模型

### 6.1 實體關係

```
users 1 ──< borrow_orders.borrower_id      （借用者）
users 1 ──< borrow_orders.reviewed_by      （審核者，可為 NULL）
borrow_orders 1 ──< borrow_order_items     （主檔／明細）
equipment 1 ──< borrow_order_items.equipment_id
```

四張表都**沒有宣告外鍵約束**，`PRAGMA foreign_keys` 也未開啟。關聯僅靠命名慣例與 Python 端維持（KI-06）。

### 6.2 DDL

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
);

CREATE TABLE IF NOT EXISTS equipment (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    equipment_name        TEXT    NOT NULL,
    equipment_code        TEXT    NOT NULL,
    equipment_description TEXT,
    total_quantity        INTEGER NOT NULL DEFAULT 0,
    available_quantity    INTEGER NOT NULL DEFAULT 0,
    equipment_status      TEXT    NOT NULL DEFAULT 'available',
    created_at            TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at            TEXT    NOT NULL DEFAULT (datetime('now')),
    is_deleted            INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS borrow_orders (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    borrower_id        INTEGER NOT NULL,
    borrow_start_at    TEXT    NOT NULL,
    borrow_end_at      TEXT    NOT NULL,
    actual_borrowed_at TEXT,
    actual_returned_at TEXT,
    borrow_reason      TEXT    NOT NULL,
    order_status       TEXT    NOT NULL DEFAULT 'pending',
    reviewed_by        INTEGER,
    reviewed_at        TEXT,
    review_note        TEXT,
    created_at         TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at         TEXT    NOT NULL DEFAULT (datetime('now')),
    is_deleted         INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS borrow_order_items (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    borrow_order_id INTEGER NOT NULL,
    equipment_id    INTEGER NOT NULL,
    quantity        INTEGER NOT NULL,
    item_status     TEXT    NOT NULL DEFAULT 'pending',
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    is_deleted      INTEGER NOT NULL DEFAULT 0
);
```

唯一的索引是 `email TEXT UNIQUE` 自動產生的 `sqlite_autoindex_users_1`。

### 6.3 欄位字典

完整的欄位說明見 [`db/CLAUDE.md`](../db/CLAUDE.md)。以下只列容易誤解的幾個：

| 欄位 | 說明 |
|------|------|
| `equipment.total_quantity` | 器材的**實體總數**。不因借出而變動 |
| `equipment.available_quantity` | **目前可借數量**。只在登記借出與登記歸還時變動 |
| `equipment.equipment_code` | 器材編號。**未加 UNIQUE 約束**，重複值不會被擋（KI-06） |
| `borrow_orders.borrow_start_at` / `borrow_end_at` | **預計**起訖，由申請者填寫 |
| `borrow_orders.actual_borrowed_at` / `actual_returned_at` | **實際**時間，由系統在登記時填入 `datetime('now')` |
| `borrow_orders.reviewed_by` | 審核者的 `users.id`；核准與拒絕都會寫入 |
| `borrow_order_items.item_status` | 永遠與 `order_status` 同步，不獨立轉移 |

所有時間欄位都是 TEXT，格式 `YYYY-MM-DD HH:MM:SS`，時區為 SQLite 的 `datetime('now')`（UTC）。
表單送來的 `datetime-local` 值格式為 `YYYY-MM-DDTHH:MM`，由 `_normalize_dt()` 轉換後寫入。

### 6.4 狀態值定義

**`equipment_status`**

| 值 | 中文 | 可否借用 |
|----|------|---------|
| `available` | 可借用 | 是（且需 `available_quantity > 0`） |
| `unavailable` | 暫停借用 | 否 |
| `maintenance` | 維修中 | 否 |

**`order_status` / `item_status`**

| 值 | 中文 | 允許的來源狀態 |
|----|------|--------------|
| `pending` | 待審核 | （初始狀態） |
| `approved` | 已核准 | `pending` |
| `rejected` | 已拒絕 | `pending` |
| `cancelled` | 已取消 | `pending`、`approved` |
| `borrowed` | 已借出 | `approved` |
| `returned` | 已歸還 | `borrowed`、`overdue` |
| `overdue` | 逾期未還 | **無——尚未實作**（KI-01） |

狀態值以 TEXT 儲存，**沒有 CHECK 約束**，合法性由 Blueprint 與 `db/` 的條件式維持。

### 6.5 種子資料

**種子帳號**（`users` 為空時植入，bcrypt cost=4）

| id | email | 密碼 | role | is_active | name |
|----|-------|------|------|-----------|------|
| 1 | user@example.com | password123 | 1 | 1 | 一般使用者 |
| 2 | admin@example.com | admin1234 | 0 | 1 | 管理員 |
| 3 | disabled@example.com | disabled123 | 1 | 0 | NULL |

**種子器材**（`equipment` 為空時植入，共 8 筆）

| id | 名稱 | 編號 | 總數 | 可借 | 狀態 | 示範的情境 |
|----|------|------|-----:|-----:|------|-----------|
| 1 | 單槍投影機 | PRJ-001 | 5 | 5 | available | 一般可借 |
| 2 | 筆記型電腦 | NB-001 | 8 | 6 | available | 部分已借出 |
| 3 | 無線麥克風組 | MIC-001 | 4 | 4 | available | 一般可借 |
| 4 | 數位單眼相機 | CAM-001 | 2 | 1 | available | 剩最後一台 |
| 5 | 三腳架 | TRP-001 | 6 | 6 | available | 一般可借 |
| 6 | 行動電源 | PWR-001 | 3 | 0 | available | **狀態可借但無庫存** |
| 7 | 攝影機 | VID-001 | 1 | 0 | maintenance | 維修中 |
| 8 | 會議用喇叭 | SPK-001 | 2 | 2 | unavailable | 暫停外借 |

第 6 筆與第 7、8 筆的對照是刻意的：**「狀態」與「數量」是兩個獨立條件**，
由兩段不同的程式碼把關，錯誤訊息也不同。

**借用單不植入種子資料**——借用流程涉及狀態轉移與庫存扣減，
由實際操作產生的資料才會與 `available_quantity` 一致。

---

## 7. 路由總表

見 `CLAUDE.md`「路由總表」一節，共 28 條（hub 1、auth 4、profile 2、admin 6、equipment 14、health 1）。

命名慣例：

- URL 使用小寫與連字號（`/equipment/my-orders`），路由函式名稱使用底線（`my_orders`）
- **有副作用的操作一律用 POST**，即使是「刪除」也不用 GET
- 成功的 POST 一律 redirect（POST-Redirect-GET），失敗則 `render_template` 保留表單內容

---

## 8. 畫面設計與流程

### 8.1 樣板結構

`templates/base.html` 只有 14 行，提供三個 block：`title`、`head`、`body`。
它無條件載入 `common.css` 與 `login.css`；子系統樣式由各頁在 `{% block head %}` 中補上。

**base 中沒有 nav、沒有 flash 區塊**——每一頁自行渲染 topbar 與 flash 迴圈（KI-24）。

### 8.2 主要畫面

| 畫面 | 樣板 | 佈局 |
|------|------|------|
| 登入／申請帳號 | `auth/login.html`、`auth/register.html` | 置中卡片 |
| 首頁（訪客） | `hub/home.html` | 左側服務卡片 + 右側登入面板 |
| 首頁（登入） | 同上 | 卡片網格 |
| 個人資料 | `profile/dashboard.html` | 置中卡片，唯讀／編輯雙模式 |
| 會員清單 | `admin/user_list.html` | 篩選列 + 表格 + 分頁 |
| 會員明細 | `admin/user_detail.html` | 資訊卡 + 操作卡 |
| 器材主頁 | `equipment/index.html` | 左側清單（分頁）+ 右側詳細 |
| 器材表單 | `equipment/equipment_form.html` | 單欄表單，`mode` 決定新增／修改 |
| 借用申請 | `equipment/borrow_form.html` | 單欄表單 |
| 我的借用紀錄 | `equipment/my_orders.html` | 表格 + 狀態徽章 |
| 借用單詳細 | `equipment/order_detail.html` | 表頭 + 明細表 + 操作 |
| 修改借用申請 | `equipment/edit_order_form.html` | 表頭欄位 + 明細列 |
| 借用單管理 | `equipment/admin_orders.html` | 表格 + 依狀態的操作按鈕 |

### 8.3 兩欄「清單 + 詳細」型樣

`equipment/index.html` 採用一個在本系列教材中反覆出現的型樣：
左側是分頁表格，名稱是連結 `?id=N&page=N`；右側依 `selected` 渲染詳細。
選取的列加上 `eq-row-selected`。這種做法不需要 JavaScript，
每次選取都是一個完整的 GET，網址可以直接複製分享。

### 8.4 狀態如何呈現

狀態在畫面上分成兩件事：

- **CSS class** 由原始狀態值組成：`eq-badge-order-{{ order['order_status'] }}`
- **中文標籤**來自 Blueprint 傳入的 `order_status_labels` 字典

兩者不共用同一份字串，新增狀態時 CSS 與字典都要補。

`admin_orders.html` 直接把狀態機渲染成按鈕：

```jinja
{% if order['order_status'] == 'pending' %}        核准 / 拒絕
{% elif order['order_status'] == 'approved' %}     登記借出
{% elif order['order_status'] in ('borrowed', 'overdue') %} 登記歸還
{% endif %}
```

這是「狀態機同時存在於三個地方」的具體展示：資料欄位、`db/` 的前置條件檢查、模板的條件式。
三者必須一致，任何一處改動都要檢查另外兩處。

### 8.5 CSS 架構與 inline handler

CSS 架構、按鍵 token、`.login-form` 限制、`<a>` vs `<button>` 規則、
以及全站僅 13 處允許的 inline event handler 清單，見 `CLAUDE.md`「CSS 按鍵設計規範」。

---

## 9. 驗證規則與訊息字串

所有訊息字串同時存在於 Blueprint 與 `tests/data/users.py` 的 `MESSAGES`。**改一處必須改兩處**（KI-28）。

### 9.1 auth

| 順序 | 條件 | 訊息 |
|:----:|------|------|
| 1 | 驗證碼空白 | `請輸入驗證碼` |
| 2 | 驗證碼不符 | `驗證碼錯誤，請重新輸入` |
| 3 | email 或密碼空白 | `請輸入帳號與密碼` |
| 4 | 帳號不存在／已刪除／密碼錯誤 | `帳號或密碼錯誤` |
| 5 | 帳號已停用 | `帳號已停用` |

註冊：`請輸入電子郵件與密碼` → `電子郵件格式不正確` → `密碼至少需要 8 個字元` →
`兩次密碼輸入不一致` → `此電子郵件已被使用`；成功為 `申請成功，請登入`。

### 9.2 admin

`無操作權限`、`找不到該使用者`、`該帳號已刪除，無法操作`、`角色值不正確`、
`不可停用自己的帳號`、`不可刪除自己的帳號`、`不可修改自己的角色`、
`帳號已啟用`、`帳號已停用`、`角色已更新`、`帳號已刪除`。

檢查順序：權限 → 目標存在 → 自我保護 → 目標已刪除 → 值合法性 → 執行。
**存在性檢查刻意排在權限檢查之後**，避免非管理員藉由訊息差異探測哪些 user_id 存在。

### 9.3 equipment

**器材表單**（依序）

| 順序 | 條件 | 訊息 |
|:----:|------|------|
| 1 | 名稱空白 | `器材名稱不可為空` |
| 2 | 編號空白 | `器材編號不可為空` |
| 3 | 總數量非整數 | `總數量格式不正確` |
| 4 | 總數量 < 0 | `總數量不可小於 0` |
| 5 | 可借數量非整數 | `可借數量格式不正確` |
| 6 | 可借數量 < 0 | `可借數量不可小於 0` |
| 7 | 可借數量 > 總數量 | `可借數量不可大於總數量` |
| 8 | 狀態值不在三者之中 | `器材狀態不正確` |

**借用申請表單**（依序）

| 順序 | 條件 | 訊息 |
|:----:|------|------|
| 1 | 開始時間空白 | `請填寫預計借用開始時間` |
| 2 | 歸還時間空白 | `請填寫預計歸還時間` |
| 3 | 時間格式錯誤 | `時間格式不正確` |
| 4 | 歸還 ≤ 開始 | `預計歸還時間必須晚於借用開始時間` |
| 5 | 用途空白 | `借用用途不可為空` |
| 6 | 數量非整數 | `借用數量格式不正確` |
| 7 | 數量 ≤ 0 | `借用數量必須大於 0` |
| 8 | 數量 > 可借數量 | `借用數量不可大於可借數量（目前可借：N）` |

**flash 訊息**

| 情境 | 訊息 | 類別 |
|------|------|------|
| 器材新增／更新／刪除成功 | `器材已新增` / `器材已更新` / `器材已刪除` | success |
| 器材不存在 | `器材不存在` | error |
| 器材非可借狀態 | `此器材目前無法借用` | error |
| 送出申請成功 | `借用申請已送出` | success |
| 修改申請成功 | `借用申請已更新` | success |
| 取消成功／失敗 | `借用申請已取消` / `無法取消此借用單` | success / error |
| 借用單不存在 | `借用單不存在` | error |
| 無權限查看／修改 | `無權限查看此借用單` / `無權限修改此借用單` | error |
| 非待審核不可改 | `只有待審核的借用單可以修改` | error |
| 核准成功／失敗 | `借用單已核准` / `核准失敗（器材可借數量不足或借用單狀態不符）` | success / error |
| 拒絕成功／失敗 | `借用單已拒絕` / `拒絕失敗（借用單狀態不符）` | success / error |
| 登記借出成功／失敗 | `已登記借出` / `登記借出失敗（器材可借數量不足或借用單狀態不符）` | success / error |
| 登記歸還成功／失敗 | `已登記歸還` / `登記歸還失敗（借用單狀態不符）` | success / error |

### 9.4 錯誤呈現方式的兩種慣例

| 方式 | 使用時機 | 呈現 |
|------|---------|------|
| `error` 樣板變數 | 表單驗證失敗，需保留使用者輸入 | HTTP 200，重新渲染同一頁 |
| `flash()` | 操作結果、權限拒絕、跨頁導向 | HTTP 302，redirect 後由目標頁顯示 |

判準是「使用者需不需要看到自己剛才填的內容」。

---

## 10. 非功能需求

| 項目 | 規格 |
|------|------|
| 效能 | 單機教學用途，未做效能設計。分頁每頁 10 筆，查詢皆為全表掃描（無索引） |
| 併發 | SQLite WAL 模式支援多讀單寫。庫存扣減以 `available_quantity >= ?` 條件式防護，但**未使用交易隔離級別控制** |
| 可用性 | `/health` 回傳 200 供容器健康檢查 |
| 資料保存 | Docker named volume `db_data` 掛載於 `/app/data` |
| 瀏覽器相容 | 現代瀏覽器；使用 `<input type="datetime-local">`，舊瀏覽器會退化為文字輸入 |
| 語言 | 介面全中文（繁體），程式碼識別字與註解為英文／中文混合，commit message 為英文 |
| 無障礙 | 表單有 `<label for>`；操作按鈕使用語意正確的 `<a>` 與 `<button>` |

---

## 11. 已知技術債 / Known Issues

本章是這份規格書最重要的部分。

本系統從兩個教學專案整併而來，**刻意沿用它們既有的技術債，不做強行強化**。
原因是這些債本身就是教材：學生能夠在一個小到讀得完的系統裡，
看見「已知的缺陷」如何具體地存在於程式碼中，而不是只在課本上讀到條列的原則。

每一條都記錄：描述、影響、**為何本版接受**、修補方向與工作量。

### 11.0 為何有些債修、有些不修

整併之後，本系統出現一個看似矛盾的現象：`equipment` 的帳號有效性檢查修了，`profile` 的沒修（KI-03）。
這不是前後不一致，而是套用了一條明確的判準：

> **缺陷的影響是否會外溢到當事人以外的人？**

| 子系統 | 停用帳號能做的事 | 影響範圍 | 處置 |
|--------|-----------------|---------|------|
| `profile` | 修改自己的姓名與顯示名稱 | 只有自己。姓名甚至不會出現在任何公開頁面 | **保留**，作為教材 |
| `equipment` | 送出借用申請、佔用審核流程、最終扣減共用器材 | 全系統共用資源 | **修補** |

保留 KI-03 的教學價值在於讓學生看見「技術債如何隨新功能擴大影響」；
但若連器材借用也一併保留，示範的就不再是教學案例，而是一個真的壞掉的權限系統。
教材與缺陷之間的界線就畫在這裡。這條判準應該在課堂上明講——
它比任何一條單獨的技術債都更接近真實工程的決策方式。

### 11.1 業務邏輯與流程

**KI-01 — `overdue` 狀態沒有任何寫入路徑**
描述：`ORDER_STATUS_LABELS` 定義了 `overdue`（逾期未還），`admin_orders.html` 會為它顯示「登記歸還」按鈕，
`mark_order_returned` 也接受它作為來源狀態——但**全專案沒有任何一行程式碼會把借用單設為 `overdue`**。
既沒有排程作業，也沒有請求時的延遲判定。
影響：借用單過了 `borrow_end_at` 仍停在 `borrowed`，管理員無法從清單上區分「還在借用期間內」與「已經逾期」。
逾期本身是器材借用系統最核心的管理需求之一，這個缺口讓系統只能記錄，不能管理。
為何接受：保留這個缺口是為了讓它成為課堂練習題——
它同時牽涉「狀態要用存的還是算的」這個典型的設計取捨。
修補方向：兩種做法。(a) **計算式**：新增 `_order_status(order, now)` helper，
在渲染時把 `borrowed` 且 `borrow_end_at < now` 的單顯示為逾期，資料庫不動；
(b) **儲存式**：在 `admin_orders` 進入時或以排程執行
`UPDATE borrow_orders SET order_status='overdue' WHERE order_status='borrowed' AND borrow_end_at < datetime('now')`。
(a) 約 1 小時且無資料一致性風險，(b) 約 2 小時但狀態欄位會反映真實情況、便於後續統計。

**KI-02 — hub 內嵌登入是 auth 登入的完整複製**
描述：`hub.home` 的 POST 分支逐行複製了 `auth.login_page` 的登入邏輯，五條錯誤訊息各硬編碼兩份。
影響：任何登入政策的強化（失敗次數限制、密碼policy、二階段驗證）都必須兩處都改，漏改就能從另一個入口繞過。
為何接受：抽出共用函式會讓「登入怎麼運作」分散到第三個檔案，對初學者反而更難追。
修補方向：抽出 `_authenticate(email, password, captcha_input, captcha_answer) -> (user_or_None, error_or_None)`
放在 `utils.py`，兩處共用。工作量約 1 小時，含測試調整。

**KI-03 — `POST /profile/update` 缺少 `_is_usable` 檢查**
描述：該路由只有 `@login_required`，沒有第 2 層帳號有效性檢查。
影響：被停用或刪除的會員只要 session 未清，仍可修改自己的姓名與顯示名稱。這與 admin 的停用功能直接衝突。
為何接受：**這是刻意保留的教材**（見 §11.0）。它讓學生看見「同一個缺陷在不同功能上的影響差異」。
修補方向：補上三行，與 `GET /profile` 一致。工作量 5 分鐘。
> ⚠️ **請勿「順手」補上這三行**。若要修補，必須同時更新本規格書、`document/profile.md` 與 `tests/test_profile.py`。

**KI-04 — 借用單明細支援多項，但沒有多項借用的介面**
描述：`borrow_order_items` 是明細表，`update_borrow_order` 與 `edit_order` 都能處理
`equipment_id[]` / `quantity[]` 多列表單；但 `borrow()` 一次只能建立一筆明細，
`edit_order_form.html` 也只渲染既有項目，沒有「新增一列」的按鈕。
影響：使用者要借三種器材必須送三張單，管理員也要審三次。
為何接受：購物車需要 session 暫存或前端動態表格，兩者都會引入本系統刻意避開的複雜度。
修補方向：最小做法是在 `edit_order_form.html` 加一個「新增一列」的 `<template>` + 少量 JS；
完整做法是引入 session 購物車。前者約 2 小時，後者約 6 小時。

**KI-05 — `cancel_order` / `approve_order` / `reject_order` 未使用 transaction**
描述：這三個函式各自更新 `borrow_orders` 與 `borrow_order_items` 兩張表，但用的是
兩次 `conn.execute()` 加一次 `conn.commit()`，而不是 `with conn:`。
影響：理論上第一次 UPDATE 之後、第二次之前若發生例外，會留下主檔與明細狀態不一致的資料。
實務上兩次 UPDATE 之間沒有任何可能失敗的操作，風險極低。
為何接受：與 `mark_order_borrowed` 的對照本身就是教材——
讓學生思考「什麼時候真的需要 transaction」。
修補方向：改用 `with conn:` 包住兩次 UPDATE。工作量 15 分鐘。

### 11.2 資料模型

**KI-06 — 四張表無外鍵、CHECK、UNIQUE 與索引**
描述：除了 `users.email` 的 UNIQUE，schema 沒有任何約束或索引。
`PRAGMA foreign_keys` 未開啟；狀態欄位是自由文字；`equipment_code` 可以重複。
影響：(a) 直接以 SQL 工具寫入不合法的狀態值不會被擋；(b) 刪除使用者不會影響其借用單，
留下指向不存在使用者的孤兒資料；(c) 器材編號重複時，管理員無法從清單分辨；
(d) 資料量增大後 `borrow_order_items` 的查詢會全表掃描。
為何接受：讓學生先看見「約束不存在時會發生什麼」，再理解為什麼要加。
修補方向：加上 `FOREIGN KEY`、`CHECK (order_status IN (...))`、`UNIQUE (equipment_code)`，
以及 `borrow_orders(borrower_id)`、`borrow_orders(order_status)`、`borrow_order_items(borrow_order_id)`、
`borrow_order_items(equipment_id)` 四個索引，並在 `_get_conn()` 加 `PRAGMA foreign_keys=ON`。
工作量約 2 小時，含既有資料的清理。

**KI-08 — 借用期間無上限，開始時間可在過去**
描述：日期驗證只檢查 `end > start` 與格式。可以申請 2020 年開始、2099 年歸還的借用單。
影響：資料品質差，且「借用期間」失去意義。
為何接受：加入期限規則需要先定義業務政策（最長幾天？可以提前幾天預約？），超出範例系統的範圍。
修補方向：在 `_validate_borrow_form` 加 `start >= now`（或允許數分鐘誤差）與
`(end - start) <= timedelta(days=N)`。工作量 30 分鐘。

**KI-09 — 無期間重疊檢查、無每人同時借用上限**
描述：可借數量是一個單純的計數器，與時間無關。系統不會因為「這台相機下週已經被預約了」而拒絕本週的申請，
也不限制同一個人同時持有幾張未結案的借用單。
影響：`approved` 並不等於「這段期間保留給你」。系統實際上是**借出登記系統**，不是**預約系統**。
為何接受：真正的預約需要以「期間重疊」計算可用量，而不是維護單一計數器，這是完全不同的資料模型。
修補方向：改以 `SELECT SUM(quantity) FROM borrow_order_items JOIN borrow_orders ...
WHERE equipment_id = ? AND order_status IN ('approved','borrowed') AND NOT (end <= ? OR start >= ?)`
推導可用量，`available_quantity` 降為快取或移除。工作量約 8 小時，含測試重寫。

**KI-10 — 核准（`approved`）不保留庫存**
描述：核准會重新檢查可借數量，但**不扣減**。兩張各借 1 台的單，在庫存只剩 1 台時可以都被核准；
先登記借出的成功，後一張在 `mark_order_borrowed` 才失敗。
影響：管理員核准後仍可能無法交付，需要回頭向申請者說明。
為何接受：這是「檢查時機與使用時機（time-of-check to time-of-use）」的經典題目，
在小系統裡完整重現，非常適合課堂討論。測試 `test_available_quantity_not_below_zero` 已鎖住現況。
修補方向：(a) 核准時即扣減、取消／拒絕時回補（改動範圍大，取消邏輯要跟著改）；
(b) 新增 `reserved_quantity` 欄位，核准時累加、借出時轉為實扣。(a) 約 3 小時，(b) 約 5 小時。

**KI-14 — `available_quantity` 可被管理員任意改寫，且不與在借數量對帳**
描述：器材修改表單直接編輯 `available_quantity`，唯一的限制是不大於 `total_quantity`。
系統從不驗證「可借數量 + 在借數量 = 總數量」。
影響：管理員手滑就能讓庫存與實際狀況脫節，且沒有任何機制會發現。
為何接受：對帳需要先定義「在借」的範圍（含不含 `approved`？），與 KI-10 綁在一起。
修補方向：新增對帳查詢與一個管理端的「重算可借數量」動作。工作量約 2 小時。

**KI-15 — 無 migration 機制**
描述：schema 以 `CREATE TABLE IF NOT EXISTS` 建立。新增欄位時既有的 `database.db` 不會被更新。
影響：改 schema 的唯一方式是刪掉資料庫重來，既有資料全失。
為何接受：教學專案的資料本來就是拋棄式的，引入 Alembic 會大幅增加初次上手的門檻。
修補方向：引入 Alembic，或自行維護一張 `schema_version` 表與一組升級腳本。工作量約 4 小時。

### 11.3 安全性

**KI-07 — 驗證碼答案在登入成功後未清除**
描述：`session['captcha']` 寫入後從未 `session.pop()`，只會被下一次 `GET /captcha.png` 覆寫。
影響：同一組驗證碼可以無限次重放，驗證碼對自動化攻擊的阻擋效果大打折扣。
為何接受：刻意保留為教材。
修補方向：登入成功（或每次比對之後）呼叫 `session.pop('captcha', None)`。**工作量 5 分鐘，是本清單中投資報酬率最高的一項。**

**KI-16 — 全站 POST 表單無 CSRF token**
描述：所有 POST 表單都沒有 CSRF token，session cookie 也未設定 `SameSite`。
影響：攻擊者可誘導已登入的管理員送出偽造請求，例如刪除任意會員或核准任意借用單。
為何接受：加入 CSRF 需要引入 `flask-wtf`、在每個表單插入隱藏欄位、在測試中處理 token。
修補方向：`CSRFProtect`，或自行以 session 儲存 token 並在每個 POST 路由比對。工作量約 2 小時。

**KI-17 — `SECRET_KEY` 有公開的預設值**
描述：`app.py` 使用 `os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')`。
`docker-compose.yml` 的 `please-change-this-to-a-random-string` 同樣公開。
影響：知道金鑰的人可以自行簽出任意內容的 session cookie，直接假冒 `user_id = 2`（管理員），繞過整個身分驗證。
為何接受：有預設值讓學生 clone 後可以直接 `python app.py`。
修補方向：未設定環境變數時直接拋出例外（fail fast），或至少在啟動時印出明顯警告。工作量 10 分鐘。

**KI-18 — 無 session cookie 安全設定**
描述：未設定 `SESSION_COOKIE_SECURE`、`SESSION_COOKIE_SAMESITE`、`SESSION_COOKIE_HTTPONLY`、`PERMANENT_SESSION_LIFETIME`。
影響：session 沒有過期時間，HTTP 明文傳輸時不會被阻擋，也缺少 SameSite 這道 CSRF 緩解。
為何接受：這四個設定需要理解 cookie 屬性才有意義。
修補方向：在 `app.py` 加四行 `app.config[...]`。工作量 30 分鐘。

**KI-20 — 無登入失敗次數限制**
描述：登入沒有 rate limiting 或帳號鎖定，`users` 表也沒有相關欄位。
影響：可對任意帳號進行密碼暴力破解。
為何接受：需要新增欄位與時間窗邏輯，超出本系統範圍。
修補方向：`users` 加 `failed_login_count`、`locked_until` 欄位。工作量約 3 小時。
> **加乘效應警告**：本項與 KI-07（驗證碼可重放）、KI-21（種子帳號 cost=4 且密碼公開）疊加後，
> 管理員帳號可被自動化爆破。三者單獨看都不算致命，合起來就是。

**KI-21 — 種子帳號 cost=4 且密碼公開於原始碼**
描述：`_SEED_USERS` 的三組明文密碼寫在 `db/users.py`，雜湊成本刻意降為 4 以加速測試。
影響：任何部署都帶著一組公開的管理員帳密。
為何接受：教學需要固定的測試帳號。
修補方向：正式部署前刪除種子帳號，或改為只在 `FLASK_ENV=development` 時植入。工作量 30 分鐘。

**KI-22 — `debug=True` 硬編碼**
描述：`app.run(host='0.0.0.0', port=4000, debug=True)`，Docker 映像也是用它啟動。
影響：未攔截的例外會回傳含原始碼的 Werkzeug 除錯頁；debugger PIN 若外洩可執行任意程式碼。
為何接受：教學情境需要自動重載與詳細錯誤頁。
修補方向：改由環境變數控制，正式部署改用 gunicorn。工作量 30 分鐘。

### 11.4 前端與樣式

**KI-11 — topbar 在七個器材模板中重複**
描述：`templates/equipment/` 的七個檔案各自寫了一份幾乎相同的 topbar，沒有抽成 partial 或 macro。
`admin` 的兩個模板同樣如此。
影響：導覽列改動要改九個檔案，容易漏掉。
為何接受：「以學習與可理解性為優先，避免過度抽象」——讀者從單一檔案就能看見完整的頁面結構。
修補方向：抽成 `templates/_topbar.html` 並以 `{% include %}` 引入。工作量 1 小時。

**KI-12 — 確認對話框的寫法在兩個子系統中不一致**
描述：`admin` 寫在 `<button onclick="return confirm(...)">`，`equipment` 寫在 `<form onsubmit="return confirm(...)">`。
影響：純粹的不一致，兩種寫法功能相同。
為何接受：兩種寫法都可行，統一等於為了整齊而改動其中一份。
修補方向：擇一統一。建議統一為 `<form onsubmit>`，因為它同時涵蓋鍵盤送出。工作量 30 分鐘。

**KI-19 — 狀態 badge 的色碼硬編碼**
描述：帳號狀態、角色、器材狀態、借用單狀態的徽章底色直接寫在 `admin.css` 與 `equipment.css` 中，
沒有走 `common.css` 的 token。
影響：`common.css` 只定義了按鍵語意色，沒有狀態語意色，因此「顏色的單一來源」這條規則有兩個破口。
為何接受：要補齊需要先定義一套狀態語意色（成功／警告／危險／中性／停用），是一次設計決策而非單純重構。
修補方向：在 `common.css` 補上 `--status-*` token，兩個 CSS 改用 `var()`。工作量 1.5 小時。

**KI-23 — 審核備註使用 `prompt()`**
描述：核准／拒絕的備註由 `onclick="this.form.review_note.value=prompt(...)"` 收集。
影響：`prompt()` 無法輸入多行、無法取消區分（取消會得到 `null`，被 `|| ''` 轉成空字串）、
在部分瀏覽器中可被停用、行動裝置體驗差。
為何接受：它是全站唯一需要「送出前補一個欄位」的場景。
修補方向：改為在 `admin_orders.html` 中展開一個 `<textarea>`，或做成獨立的審核頁。工作量 1.5 小時。

**KI-24 — 無 flash 區塊的共用 partial**
描述：`base.html` 不含 flash 區塊，每個頁面自行寫 `get_flashed_messages` 迴圈，且三個子系統的 class 命名各不相同
（`.alert`、`.admin-flash`、`.eq-flash`）。
影響：新增頁面時容易忘記加 flash 區塊，訊息會靜默消失。
為何接受：與 KI-11 同一個判準。
修補方向：在 `base.html` 加一個 `{% block flash %}` 預設實作。工作量 1 小時。

### 11.5 可用性與規模

**KI-13 — 「我的借用紀錄」與「借用單管理」無分頁與篩選**
描述：`list_my_orders` 與 `list_all_orders` 都是一次撈出全部，沒有 `LIMIT`，也沒有依狀態篩選的介面。
影響：借用單累積後，管理員頁面會變成一張極長的表格，找出待審核的單只能靠肉眼。
為何接受：器材清單已示範過分頁型樣，重複實作對教學沒有額外價值。
修補方向：比照 `list_users` 加上 `(page, page_size, status)` 參數與 `(items, total)` 回傳。工作量約 2 小時。

**KI-25 — admin 操作後的 redirect 不帶查詢字串**
描述：六個 admin 操作路由成功後都 `redirect(url_for('admin.user_list'))`，不帶 `status`、`q`、`page`。
影響：管理員在「已停用 + 第 3 頁」執行操作後，會被丟回「全部 + 第 1 頁」，必須重新篩選。
為何接受：帶回查詢字串需要在每個路由讀取並轉傳三個參數，會讓已經很長的路由更長。
修補方向：以 `request.referrer` 或隱藏欄位帶回。工作量 1 小時。

**KI-26 — 器材清單無搜尋與狀態篩選**
描述：`list_equipment` 只有分頁，沒有關鍵字或狀態參數。
影響：器材數量增加後，找特定器材只能翻頁。
為何接受：`list_users` 已示範過篩選與搜尋的做法。
修補方向：比照 `list_users` 增加 `keyword` 與 `status` 參數。工作量 1.5 小時。

**KI-30 — `POST /profile/update` 無輸入驗證、無成功回饋**
描述：姓名與顯示名稱沒有長度上限、沒有內容檢查，更新成功後也不 flash 任何訊息，
使用者只會看到頁面跳回唯讀模式。
影響：可寫入極長的字串；使用者無法確定操作是否成功。
為何接受：與 KI-03 同屬 profile 的「刻意保留」範圍——這個路由整體就是本系統的技術債展示區。
修補方向：加上 `len(name) <= 50` 之類的檢查與一行 `flash('個人資料已更新', 'success')`。工作量 30 分鐘。

**KI-27 — 無任何通知機制**
描述：借用單被核准、拒絕、或即將到期時，系統不會通知申請者。使用者必須自己回來看。
影響：流程的回饋迴圈不完整。
為何接受：郵件需要 SMTP 設定與非同步處理，兩者都超出範圍。
修補方向：最小做法是在首頁與 topbar 顯示「您有 N 張借用單狀態更新」；完整做法是接上郵件。
前者約 2 小時，後者約 6 小時。

### 11.6 測試與文件

**KI-28 — 訊息字串在 Blueprint 與測試資料中各存一份**
描述：所有中文訊息同時寫在 Blueprint 與 `tests/data/users.py` 的 `MESSAGES`。
影響：改一處而忘記改另一處時，測試會以看似無關的方式失敗。
為何接受：讓測試持有「預期值」的獨立副本，本身是正確的測試設計——測試不該從被測程式匯入預期值。
修補方向：不建議修補；改為在 code review 檢查清單中列出這條。

**KI-29 — 無並行情境的測試**
描述：測試都是單執行緒循序執行，`available_quantity` 的競態條件只以「先後呼叫」模擬，
沒有真正的並行測試。
影響：`mark_order_borrowed` 的 `available_quantity >= ?` 防線在真正並行下是否足夠，未經驗證。
為何接受：SQLite 的並行測試需要多執行緒與時序控制，複雜度遠高於本系統其他部分。
修補方向：以 `threading` 同時發動兩次 `mark_order_borrowed`，斷言最終庫存不為負。工作量 2 小時。

### 11.7 幾項刻意做強的地方

以下幾點**不是**本系統的技術債，而是刻意做強的設計，記錄於此以免日後被誤認為偏差：

| 項目 | 本系統的做法 | 理由 |
|------|-------------|------|
| `equipment._current_user()` | 加上 `_is_usable` 檢查，失效帳號回傳 `None` | 停用帳號不應能佔用審核流程並扣減共用器材（§11.0） |
| equipment 管理端路由 | 除了 `_is_admin`，補上第 2 層 `user is None → session.clear()` | 對齊 §4.3 的三層順序；停用中的管理員應被登出而非收到「權限不足」 |
| `equipment.borrow` | 失效帳號由第 2 層統一處理，清 session 並導回登入 | 同上，不用 flash「帳號已停用」草草擋下 |
| 種子器材 | `_seed_equipment_if_empty()` 可重複執行 | 讓 `rm database.db && python app.py` 就能還原完整的可操作環境 |
| `tests/data/users.py` | equipment 訊息字串全部集中到 `MESSAGES` | 與 auth／admin 的測試資料慣例一致 |
| `pytest.ini` | 限定 `testpaths = tests` | 確保只收集本系統的測試

---

## 12. 測試策略

### 12.1 範圍與方法

- **框架**：pytest + pytest-flask，使用 Flask test client，不啟動實際伺服器
- **層級**：以路由層的整合測試為主。`db/` 的函式透過路由測試間接覆蓋，
  狀態機的邊界條件則直接呼叫 `db.*` 驗證回傳值
- **隔離**：每個測試函式一個 `tmp_path` 下的獨立 SQLite 檔，含種子資料
- **驗證碼**：直接以 `client.session_transaction()` 寫入 `session['captcha']`

### 12.2 測試數量

| 檔案 | 數量 | 對象 |
|------|-----:|------|
| `tests/test_auth.py` | 23 | 登入、註冊、登出、驗證碼 |
| `tests/test_hub.py` | 12 | 訪客／登入視圖、卡片顯示與隱藏 |
| `tests/test_profile.py` | 8 | 檢視、編輯模式、更新、KI-03 的現況 |
| `tests/test_admin.py` | 30 | 清單、篩選、搜尋、分頁、四種操作、R1–R3、守門順序 |
| `tests/test_equipment.py` | 52 | 見 `document/equipment.md`「測試對應」 |
| **合計** | **125** | |

### 12.3 三條硬性規則

1. **被權限擋下的 POST 必須同時斷言資料庫沒有改變。**
   只驗 302 無法區分「被擋下」與「執行成功後 redirect」。
2. **涉及庫存的操作必須同時斷言 `available_quantity`。**
   狀態欄位對了但數量沒動，是最容易漏掉的錯誤。
3. **數量斷言一律用相對式**（先讀 before 再比 after），不寫死絕對值——種子資料可能會調整。

### 12.4 未覆蓋的部分

- 逾期（沒有可測的行為，KI-01）
- 並行競態（KI-29）
- CSS 與版面（無視覺回歸測試）
- 驗證碼圖片本身的內容（只測 HTTP 200 與 MIME type）

---

## 13. 未來擴充建議

依「教學價值 ÷ 工作量」排序：

| 優先 | 項目 | 對應 KI | 教學重點 |
|:----:|------|---------|---------|
| 1 | 驗證碼登入後清除 | KI-07 | 5 分鐘的修補如何改變攻擊面 |
| 2 | 逾期狀態（先做計算式） | KI-01 | 狀態要用「存的」還是「算的」 |
| 3 | 借用期間規則（最長天數、不可回溯） | KI-08 | 業務政策如何落成驗證程式碼 |
| 4 | 借用單分頁與狀態篩選 | KI-13 | 複用既有的 `(items, total)` 型樣 |
| 5 | 外鍵與 CHECK 約束 | KI-06 | 約束該放在資料庫還是應用程式 |
| 6 | 核准即保留庫存 | KI-10 | TOCTOU 與資源保留 |
| 7 | CSRF 保護 | KI-16 | 瀏覽器如何被誘導送出請求 |
| 8 | 真正的預約（期間重疊） | KI-09 | 計數器模型與區間模型的本質差異 |
| 9 | 多項器材借用（購物車） | KI-04 | 主檔／明細結構的完整發揮 |
| 10 | 通知機制 | KI-27 | 非同步與外部服務整合 |

---

## 附錄 A：路由與訊息字串對照

| 路由 | 可能的訊息 |
|------|-----------|
| `POST /login`、`POST /` | `請輸入驗證碼`、`驗證碼錯誤，請重新輸入`、`請輸入帳號與密碼`、`帳號或密碼錯誤`、`帳號已停用` |
| `POST /register` | `請輸入電子郵件與密碼`、`電子郵件格式不正確`、`密碼至少需要 8 個字元`、`兩次密碼輸入不一致`、`此電子郵件已被使用`、`申請成功，請登入` |
| `/admin/*` | `無操作權限`、`找不到該使用者`、`該帳號已刪除，無法操作`、`角色值不正確`、`不可停用自己的帳號`、`不可刪除自己的帳號`、`不可修改自己的角色`、`帳號已啟用`、`帳號已停用`、`角色已更新`、`帳號已刪除` |
| `POST /equipment/new`、`/edit/<id>` | `器材名稱不可為空`、`器材編號不可為空`、`總數量格式不正確`、`總數量不可小於 0`、`可借數量格式不正確`、`可借數量不可小於 0`、`可借數量不可大於總數量`、`器材狀態不正確`、`器材已新增`、`器材已更新` |
| `POST /equipment/delete/<id>` | `器材不存在`、`器材已刪除`、`無操作權限` |
| `POST /equipment/<id>/borrow` | `器材不存在`、`此器材目前無法借用`、`請填寫預計借用開始時間`、`請填寫預計歸還時間`、`時間格式不正確`、`預計歸還時間必須晚於借用開始時間`、`借用用途不可為空`、`借用數量格式不正確`、`借用數量必須大於 0`、`借用數量不可大於可借數量（目前可借：N）`、`借用申請已送出` |
| `/equipment/orders/<id>`、`/edit`、`/cancel` | `借用單不存在`、`無權限查看此借用單`、`無權限修改此借用單`、`只有待審核的借用單可以修改`、`至少需選擇一項器材`、`借用申請已更新`、`借用申請已取消`、`無法取消此借用單` |
| `/equipment/admin/orders/*` | `無操作權限`、`借用單已核准`、`核准失敗（器材可借數量不足或借用單狀態不符）`、`借用單已拒絕`、`拒絕失敗（借用單狀態不符）`、`已登記借出`、`登記借出失敗（器材可借數量不足或借用單狀態不符）`、`已登記歸還`、`登記歸還失敗（借用單狀態不符）` |

## 附錄 B：詞彙表

| 詞 | 說明 |
|----|------|
| 借用單（borrow order） | 一次借用申請的完整紀錄，含主檔與明細 |
| 主檔／明細（master / detail） | 一張單據拆成「表頭一列」與「品項多列」的資料結構 |
| 可借數量（available quantity） | 目前實際可以被借走的數量，只在登記借出／歸還時變動 |
| 邏輯刪除（soft delete） | 以 `is_deleted = 1` 標記，不執行 `DELETE`，資料仍可查 |
| 三層權限檢查 | 登入 → 帳號有效 → 角色，順序固定不可調換 |
| POST-Redirect-GET | 成功的 POST 一律以 redirect 收尾，避免重整造成重複送出 |
| TOCTOU | Time-of-check to time-of-use，檢查時機與使用時機之間狀態改變所導致的問題（KI-10） |
| KI | Known Issue，本文件第 11 章的技術債編號 |
