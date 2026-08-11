# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

本文件提供 Claude Code（claude.ai/code）在此專案中的開發與理解指引。
各子系統的詳細說明位於對應 Blueprint 目錄下的 `CLAUDE.md`；測試子系統說明位於 `tests/CLAUDE.md`。

完整的功能與規則定義見 [`document/system-spec.md`](document/system-spec.md)；建置步驟見 [`document/build-guide.md`](document/build-guide.md)。

---

## 專案說明

以學習為目的之**校園宿舍報修系統**。以會員登入系統為基礎，涵蓋帳號的完整生命週期（申請、登入、個人資料維護、管理員治理），並以報修子系統作為主體。涵蓋：

- Flask 伺服器端渲染（Jinja2 Template）
- Python + Flask 後端（Blueprint 模組化架構）
- SQLite 資料庫整合（三張資料表，含主檔／明細關聯）
- **狀態機**（六個狀態、七條轉移，集中在資料層）
- **資料範圍權限**（row-level：同樣是登入者，看得到的資料不同）
- **稽核軌跡**（每次狀態異動都留下紀錄）
- 圖形驗證碼、角色權限控制

同時作為 Agentic / Harness Engineering 的練習專案。

## 技術棧

- Python 3.11 / Flask + Blueprint
- HTML / CSS（Jinja2 Template）
- SQLite（sqlite3，WAL 模式）
- bcrypt（密碼雜湊）
- pytest + pytest-flask

---

## 常用指令

```bash
# 本機開發
conda activate flask                    # 啟用虛擬環境
pip install -r requirements.txt         # 安裝相依套件
python app.py                           # 啟動開發伺服器（http://localhost:4000）
rm database.db && python app.py         # 重置資料庫

# Docker
docker compose up -d --build
docker compose logs -f
docker compose down -v                  # 停止並刪除資料

# 測試
pytest                                  # 全部 188 個案例
pytest tests/test_repair.py -v
pytest -k "full_lifecycle"
```

---

## 專案結構

```
SAD-Dormitory-Repair/
├── app.py                        # 組裝五個 Blueprint、啟動伺服器
├── utils.py                      # 三個共用 helper
├── pytest.ini                    # testpaths = tests
├── requirements.txt / Dockerfile / docker-compose.yml
│
├── db/
│   ├── __init__.py               # DB_PATH；匯出公開函式；init_db()
│   ├── connection.py             # _get_conn()
│   ├── users.py                  # users 表
│   ├── repair.py                 # repair_requests 與 repair_logs；狀態機；種子
│   └── CLAUDE.md
│
├── blueprints/{auth,hub,profile,admin,repair}/
│                                 # 各含 __init__.py 與 CLAUDE.md
├── templates/{auth,hub,profile,admin,repair}/ + base.html
├── static/                       # common、login、hub、profile、admin、repair 六個 CSS
├── tests/                        # conftest、data/users.py、五個測試檔、CLAUDE.md
├── rules/                        # flask-blueprint.md、database.md
└── document/                     # system-spec、build-guide、五份子系統文件
```

---

## 路由總表

| Blueprint | 方法 | 路徑 | 說明 |
|-----------|------|------|------|
| hub | `GET POST` | `/` | 首頁；訪客可瀏覽並內嵌登入 |
| auth | `GET POST` | `/login` | 登入 |
| auth | `GET POST` | `/register` | 申請帳號（含棟別、房號、電話，選填） |
| auth | `GET` | `/captcha.png` | 驗證碼圖片 |
| auth | `GET` | `/logout` | 登出 |
| profile | `GET` | `/profile` | 個人資料；`?edit=1` 進入編輯模式 |
| profile | `POST` | `/profile/update` | 更新五個欄位 |
| admin | `GET` | `/admin/users` | 會員清單；`?status=` `?q=` `?page=` |
| admin | `GET` | `/admin/users/<int:user_id>` | 會員明細（含其報修單） |
| admin | `POST` | `/admin/users/<int:user_id>/activate` | 啟用帳號 |
| admin | `POST` | `/admin/users/<int:user_id>/deactivate` | 停用帳號（不可對自己） |
| admin | `POST` | `/admin/users/<int:user_id>/role` | 調整角色（不可對自己） |
| admin | `POST` | `/admin/users/<int:user_id>/delete` | 軟刪除帳號（不可對自己） |
| repair | `GET` | `/repair/` | 我的報修單；`?status=` `?page=` |
| repair | `GET POST` | `/repair/new` | 申報報修 |
| repair | `GET` | `/repair/<int:request_id>` | 詳細與處理歷程 |
| repair | `GET POST` | `/repair/<int:request_id>/edit` | 修改（限本人 + pending） |
| repair | `POST` | `/repair/<int:request_id>/comment` | 新增回覆 |
| repair | `POST` | `/repair/<int:request_id>/cancel` | 取消（限本人 + pending/assigned） |
| repair | `GET` | `/repair/manage` | 管理清單（管理員） |
| repair | `POST` | `/repair/<int:request_id>/assign` | 派工 |
| repair | `POST` | `/repair/<int:request_id>/start` | 開始處理 |
| repair | `POST` | `/repair/<int:request_id>/complete` | 登記完成 |
| repair | `POST` | `/repair/<int:request_id>/reject` | 退件（需原因） |
| repair | `POST` | `/repair/<int:request_id>/reopen` | 重新開啟（需原因） |
| repair | `POST` | `/repair/<int:request_id>/delete` | 刪除報修單 |
| — | `GET` | `/health` | 健康檢查 |

共 27 條（hub 1、auth 4、profile 2、admin 6、repair 13、health 1）。

`admin` 套用 `url_prefix='/admin'`，`repair` 套用 `url_prefix='/repair'`。
**`repair` 沒有任何開放給訪客的路由**——報修單含房號與電話。

---

## 報修單狀態機

```
pending ──assign──► assigned ──start──► in_progress ──complete──► completed
   │                    │                                              │
   ├──reject──► rejected│                                              │
   └──cancel──► cancelled◄──cancel──┘                                  │
   ▲                                                                   │
   └────────────────────── reopen ───────────────────────────────────┘
```

| 轉移 | 前置 → 後置 | 觸發者 | 必填 |
|------|------------|--------|------|
| `assign_request` | pending → assigned | 管理員 | `assignee_id`（須為啟用中的管理員） |
| `start_request` | assigned → in_progress | 管理員 | — |
| `complete_request` | in_progress → completed | 管理員 | — |
| `reject_request` | pending → rejected | 管理員 | **原因** |
| `cancel_request` | pending/assigned → cancelled | **申報人本人** | — |
| `reopen_request` | completed → pending | 管理員 | **原因** |

**三條不可違反的規則：**

1. **狀態轉移只能經由 `db/repair.py` 的六個函式。** Blueprint 不得直接 `UPDATE request_status`
2. **前置狀態寫在 SQL 的 `WHERE` 子句裡**，不是先讀出來再用 Python 比對（見 `document/system-spec.md` §7.3）
3. **每次轉移必須在同一個 transaction 中寫入一筆 `log_type='status'` 的紀錄。** `create_log()` 因此明確拒絕 `'status'` 型別

終態為 `completed`、`rejected`、`cancelled`，已結案的單不可再回覆。

---

## 角色與權限

| `role` 值 | 身份 | 說明 |
|-----------|------|------|
| `0` | 管理員 | 住宿生的全部權限，加上：檢視所有報修單、六條狀態轉移、刪除報修單、會員管理 |
| `1` | 住宿生 | 申報報修；檢視、修改、取消、回覆**自己的**報修單；編輯自己的個人資料 |

系統不設「維修人員」第三種角色，宿舍管理員與維修人員共用 `role = 0`（理由見 `document/system-spec.md` §4.1）。新申請的帳號一律為 `role = 1`。

### 四層權限檢查（前三層順序不可調換）

```
1. @login_required        無 session          -> redirect auth.login_page
2. _is_usable(user)       帳號失效            -> session.clear() + redirect auth.login_page
3. _is_admin(user)        role != 0           -> flash 無操作權限 + redirect
4. _can_view(user, req)   非申報人且非管理員  -> flash 無權限檢視此報修單 + redirect
```

第 2 層失敗代表**身分失效**（處置是登出），第 3 層失敗代表**權限不足**（處置是導回）。順序調換會讓停用中的管理員收到與事實不符的回饋。

**第 4 層與前三層性質不同**：前三層問「你是誰」，只看 session；第 4 層問「這筆資料是不是你的」，必須先把資料讀出來。因此它一定在 `db.get_request()` **之後**。

`_is_admin(user)` 為各 Blueprint 內部 helper（**非 `utils.py`**）。這些檢查在每個路由開頭**明碼重複寫出，不抽象成裝飾器**——這個重複是刻意的教學設計，請勿重構。

`edit` 與 `cancel` 比第 4 層更嚴：**只限申報人本人，管理員也不行**。理由是申報內容是住戶的原始證言，取消是申報人的權利（管理員該用的是退件）。

### 自我保護規則

| 規則 | 內容 | 訊息 |
|------|------|------|
| R1 | 不可停用自己 | `不可停用自己的帳號` |
| R2 | 不可刪除自己 | `不可刪除自己的帳號` |
| R3 | 不可修改自己的角色 | `不可修改自己的角色` |

由這三條可推得系統中永遠至少有一個可用的管理員，因此**不實作管理員計數檢查**。
⚠️ 放寬任何一條時，必須立即補上「操作後啟用中管理員數 ≥ 1」的檢查。

---

## 共用模組

### `utils.py`

- `_gen_captcha()` — 5 位大寫字母 + 數字（字元集排除易混淆的 `I` `O` `0` `1`）
- `_is_usable(user)` — `user and user['is_active'] and not user['is_deleted']`
- `login_required(f)` — 無 session 則 redirect `auth.login_page`

### `db/` 套件

- `db/__init__.py` — `DB_PATH`（環境變數或預設 `database.db`）；匯出公開函式；`init_db()` 建三張表、依序植入種子帳號與種子報修單
- `db/connection.py` — `_get_conn()`：呼叫時才讀 `db.DB_PATH`，支援測試動態替換；WAL；`row_factory = sqlite3.Row`
- `db/users.py` — `users` 表（含 `list_active_admins()` 供派工下拉）
- `db/repair.py` — `repair_requests` 與 `repair_logs` 兩表；六個轉移函式；種子報修單

模組拆分的依據是**資料表**，不是子系統。`list_active_admins()` 雖然只有 repair 用得到，但它操作 `users` 表，因此放在 `db/users.py`。

### 種子資料

| id | email | 密碼 | 身份 |
|----|-------|------|------|
| 1 | user@example.com | password123 | 住宿生 陳小明（A 棟 301） |
| 2 | admin@example.com | admin1234 | 宿舍管理員（role=0） |
| 3 | disabled@example.com | disabled123 | 停用帳號（role=1，is_active=0，name 為 NULL） |
| 4 | staff@example.com | staff1234 | 維修組 王師傅（role=0） |

另有**六張種子報修單**（id 1–6），涵蓋六個狀態各一張。因此 `db.count_by_status()` 在初始狀態下六個數字都是 1。
`_seed_repair_if_empty()` **必須排在 `_seed_users_if_empty()` 之後**。

種子帳號使用 bcrypt cost=4（加速測試），註冊路徑使用 cost=10。

---

## 環境變數

| 變數 | 預設值 | 說明 |
|------|--------|------|
| `SECRET_KEY` | `dev-secret-key-change-in-production` | Flask session 加密金鑰；生產環境務必替換 |
| `DB_PATH` | `database.db` | SQLite 路徑；測試時動態替換為 `tmp_path` 下的暫存檔 |

---

## 測試架構

> 詳細說明見 [`tests/CLAUDE.md`](tests/CLAUDE.md)。

- **框架**：pytest + pytest-flask（Flask test client，不啟動實際伺服器）
- **DB 隔離**：每個測試函式使用 `tmp_path` 建立獨立 SQLite 暫存檔，含種子資料
- **案例數**：188（auth 29／hub 15／profile 12／admin 38／repair 94），約 2.7 秒

### Fixtures（`conftest.py`）

| Fixture | 說明 |
|---|---|
| `app` | function scope；暫存 DB + 種子資料；`TESTING=True` |
| `client` | Flask test client（未登入） |
| `authed_client` | `user_id = 1`（住宿生） |
| `admin_client` | `user_id = 2`（宿舍管理員） |
| `other_client` | `user_id = 3`（停用帳號，session 直接注入） |
| `staff_client` | `user_id = 4`（第二位管理員） |

> **陷阱**：五個 client fixture 都由 `client` 衍生，**同一個測試中同時請求兩個會拿到同一個物件**。需要兩個身分同時存在時，用 `tests/test_repair.py` 的 `_client_as(app, user_id)` helper。

### 測試原則

- 被權限或狀態擋下的 POST **必須同時斷言資料庫沒有改變**。只驗 302 無法區分「被擋下」與「執行成功後 redirect」——在有狀態機的系統中，兩者的 redirect 目標往往相同
- 數量斷言用相對式（`before` / `after`），不寫死絕對值——種子資料有 6 張報修單
- `db.create_user()` 使用 bcrypt cost=10，不要大量建立會員；`db.create_request()` 成本極低

---

## 已知技術債

完整清單（30 條，含影響、接受理由、修補方向與工作量）見 [`document/system-spec.md`](document/system-spec.md) 第 12 章。

修改程式碼時最需要注意的五條：

| ID | 內容 | 注意事項 |
|----|------|---------|
| **KI-25** | 所有時間為 UTC，畫面未轉時區 | 在台灣使用時每個時間都慢 8 小時。**唯一一條使用者一眼就會發現**的缺陷 |
| **KI-11** | 報修單的個資存取無稽核 | 有權限（誰能看）但沒有紀錄（誰看過）。本系統特有的債 |
| **KI-13** | 狀態轉移的併發窗口 | `SELECT` 與 `UPDATE` 之間仍有空隙。修補方向是把條件也放進 `UPDATE ... WHERE` 並檢查 `rowcount` |
| **KI-12** | hub 內嵌登入是 auth 登入的完整複製 | 任何登入政策的強化都**必須兩處都改** |
| **KI-14** | 承辦人被停用或降級後，報修單仍顯示其為承辦人 | 與「不設維修人員角色」的簡化直接相關 |

### ⚠️ `POST /profile/update` 的 `_is_usable` 檢查不可省略

個人資料頁只改姓名時，少了這層檢查影響只及於當事人；但本系統改的是**房號與電話**，它們會印在報修單上、成為維修人員上門的依據。一個已經退宿、帳號被停用的人若能改房號，維修人員就會照著跑錯一趟。

`tests/test_profile.py` 的 `test_profile_update_rejects_disabled_user` 與 `test_profile_update_rejects_deleted_user_and_clears_session` 是這條檢查的迴歸防線。**不要移除它們。**

---

## 開發原則

- 以學習與可理解性為優先，避免過度抽象
- 維持模組邊界清晰（Blueprint / Template / DB）
- Blueprint 之間不互相 import，只透過 `url_for()` 建立關聯
  - 具體後果：`admin` 的會員明細頁**不顯示報修狀態**，因為標籤定義在 `repair` 內。當一個功能需要跨越邊界時，先問這個功能是不是真的需要那個資訊
- 沿用既有技術債，不主動修補；但必須在 `document/system-spec.md` 第 12 章明列
- 新增子系統時：建立新 Blueprint + 對應 templates 子目錄 + `static/<name>.css` + 對應 test 檔案 + 子目錄 CLAUDE.md
- 使用任何 Skill 之前，先詢問確認後再進行

---

## CSS 按鍵設計規範

`static/common.css` 是全站按鍵**顏色的單一來源**（CSS 自訂屬性），`base.html` 最先載入。各子系統 CSS 使用自己的 prefixed 類別，顏色透過 `var(--...)` 引用，**不寫死色碼**。

| CSS 檔案 | 按鍵前綴 | 適用頁面 |
|---------|---------|---------|
| `common.css` | — | 全站共用 token（**勿改**） |
| `login.css` | （無前綴）`.login-form button` | auth 兩頁、hub 內嵌登入表單 |
| `hub.css` | `hub-*` | 首頁 |
| `profile.css` | `profile-*` | 個人資料頁 |
| `admin.css` | `admin-btn-*`、`admin-btn-action-*` | 會員管理兩頁 |
| `repair.css` | `repair-btn-*`、`repair-btn-action-*` | 報修四頁 |

可用變數：`--btn-primary-*`、`--btn-secondary-*`、`--btn-danger-*`、`--btn-action-*`、`--btn-action-danger-*`。

> **例外**：狀態語意色（報修的六個狀態、四個優先等級、三種紀錄類型，以及會員的狀態與角色 badge）硬編碼在 `repair.css` 與 `admin.css`，因為 `common.css` 只定義按鍵色（KI-19）。新增子系統時**不要**把狀態色塞進 `common.css` 的 `--btn-*` 區塊。

### 關鍵限制：`.login-form` class

`login.css` 的 `button[type="submit"]` 樣式限定在 `.login-form` 選擇器內，**不會全域污染**。凡使用登入樣式的表單，`<form>` 必須加上此 class。全系統恰有三處：`auth/login.html`、`auth/register.html`、`hub/home.html`。
`profile`、`admin`、`repair` 的表單**不加**此 class。

各子系統的 CSS 開頭都要覆蓋 `body { display: block; }`——否則 `login.css` 的 flex 置中會把整頁塞到畫面中央。

### `<a>` vs `<button>`

| 元素 | 使用時機 |
|------|---------|
| `<a href="...">` | GET 導航（跳頁、返回、篩選、分頁） |
| `<button type="submit">` | POST 動作（送出、派工、刪除等有副作用的操作） |

不用 `<a href="#">` 搭配 `onclick` 假裝按鍵。inline event handler 僅允許用於驗證碼刷新與 `confirm()` 確認。

---

## 開發規範文件

| 文件 | 說明 |
|------|------|
| [`rules/flask-blueprint.md`](rules/flask-blueprint.md) | Blueprint 路由結構、表單處理、四層權限檢查、POST-Redirect-GET、CSS 命名 |
| [`rules/database.md`](rules/database.md) | `db/` 套件使用方式、transaction、軟刪除、**狀態轉移函式的撰寫規範** |
| [`document/system-spec.md`](document/system-spec.md) | 系統規格書：功能、資料、狀態機、規則、訊息、技術債、測試策略 |
| [`document/build-guide.md`](document/build-guide.md) | 建置流程書：14 個階段的產出、決策與可執行的驗收指令 |
| [`document/repair.md`](document/repair.md) 等五份 | 各子系統的細部行為 |
