# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

本文件提供 Claude Code（claude.ai/code）在此專案中的開發與理解指引。
各子系統的詳細說明位於對應 Blueprint 目錄下的 `CLAUDE.md`；資料層說明位於 `db/CLAUDE.md`，測試說明位於 `tests/CLAUDE.md`。

---

## 專案說明

以學習為目的的**器材借用系統**（sad-equipment），為系統分析與設計課程的範例系統。涵蓋：

- Flask 伺服器端渲染（Jinja2 Template）
- Python + Flask 後端（Blueprint 模組化架構）
- SQLite 資料庫整合（主檔／明細結構、狀態機、庫存一致性）
- 會員帳號與管理（bcrypt 密碼雜湊、圖形驗證碼、角色與帳號狀態）

系統分成兩塊：**會員帳號與管理**（auth / hub / profile / admin 四個 Blueprint 與 `users` 資料表、三層權限模型、測試架構），以及**器材借用**（equipment 子系統與其三張資料表、借用單狀態機、庫存扣減邏輯）。

同時作為 Agentic / Harness Engineering 的練習專案。

---

## 技術棧

- Python 3.11 / Flask + Blueprint
- HTML / CSS（Jinja2 Template，無前端框架、無 CDN、無打包工具）
- SQLite（`sqlite3` 標準函式庫，WAL 模式，無 ORM）
- bcrypt（密碼雜湊）、captcha（伺服器端圖形驗證碼）
- pytest + pytest-flask
- Docker / Docker Compose（選用）

套件版本不釘選（`requirements.txt` 只列名稱）。

---

## 常用指令

```bash
# 本機開發
conda activate flask                    # 啟用虛擬環境
pip install -r requirements.txt         # 安裝相依套件
python app.py                           # 啟動開發伺服器（http://localhost:4000）
rm database.db && python app.py         # 重置資料庫

# Docker
docker compose up -d --build            # 建置映像並啟動（背景）
docker compose logs -f                  # 查看即時 log
docker compose down                     # 停止服務
docker compose down -v                  # 停止並刪除資料（重置 DB）

# 測試
pytest                                  # 執行所有測試（125 個）
pytest tests/test_equipment.py -v       # 執行特定模組測試
pytest -k "test_borrow"                 # 執行特定測試
```

---

## 專案結構

```
SAD-Equipment/
├── app.py                        # 主程式：組裝 Blueprint、啟動伺服器
├── utils.py                      # 跨 Blueprint 共用 helpers
├── requirements.txt
├── pytest.ini                    # 限定測試收集範圍
├── Dockerfile                    # Docker 映像建置設定
├── docker-compose.yml            # Compose 服務定義（port 4000、named volume）
├── .dockerignore
├── database.db                   # SQLite（git 忽略，首次啟動自動建立）
│
├── db/                           # 資料存取層套件（所有 SQL 都在這裡）
│   ├── __init__.py               # 定義 DB_PATH；匯出公開函式；init_db()
│   ├── connection.py             # _get_conn()：SQLite 連線（WAL、row_factory）
│   ├── users.py                  # 使用者資料存取 + 種子帳號
│   ├── equipment.py              # 器材與借用單資料存取 + 種子器材
│   └── CLAUDE.md                 # 資料層說明（含完整欄位字典）
│
├── blueprints/
│   ├── auth/                     # /login /register /logout /captcha.png
│   ├── hub/                      # /
│   ├── profile/                  # /profile /profile/update
│   ├── admin/                    # /admin/users …（會員管理）
│   └── equipment/                # /equipment …（器材借用，14 條路由）
│       ├── __init__.py
│       └── CLAUDE.md             # 每個 Blueprint 都有自己的 CLAUDE.md
│
├── templates/
│   ├── base.html                 # 共用 HTML 結構，載入 common.css + login.css
│   ├── auth/                     # login.html、register.html
│   ├── hub/                      # home.html（服務卡片 + 訪客內嵌登入）
│   ├── profile/                  # dashboard.html（唯讀／編輯雙模式）
│   ├── admin/                    # user_list.html、user_detail.html
│   └── equipment/                # index、equipment_form、borrow_form、
│                                 # my_orders、order_detail、edit_order_form、admin_orders
│
├── static/
│   ├── common.css                # 全站按鍵顏色 token（CSS 自訂屬性）
│   ├── login.css                 # auth／profile 共用；button 樣式限定在 .login-form 內
│   ├── hub.css                   # 首頁 layout
│   ├── profile.css               # 個人資料頁
│   ├── admin.css                 # 會員管理
│   └── equipment.css             # 器材借用
│
├── tests/
│   ├── conftest.py               # fixtures：app、client、authed_client、admin_client、other_client
│   ├── data/users.py             # 種子帳號常數與訊息字串
│   ├── test_auth.py              # 23 個
│   ├── test_hub.py               # 12 個
│   ├── test_profile.py           # 8 個
│   ├── test_admin.py             # 30 個
│   ├── test_equipment.py         # 52 個
│   └── CLAUDE.md
│
├── rules/                        # 實作規範（撰寫程式時必讀）
│   ├── flask-blueprint.md
│   └── database.md
│
└── document/                     # 系統文件
    ├── system-spec.md            # 系統規格書
    ├── build-guide.md            # 建置流程書
    ├── auth.md / hub.md / profile.md / admin.md / equipment.md
    └── （各子系統功能文件）
```

---

## 路由總表

| Blueprint | 方法 | 路徑 | 說明 |
| --------- | ---- | ---- | ---- |
| hub | `GET / POST` | `/` | 首頁；訪客可瀏覽並內嵌登入 |
| auth | `GET / POST` | `/login` | 登入 |
| auth | `GET / POST` | `/register` | 申請帳號 |
| auth | `GET` | `/captcha.png` | 驗證碼圖片 |
| auth | `GET` | `/logout` | 登出 |
| profile | `GET` | `/profile` | 個人資料；`?edit=1` 進入編輯模式 |
| profile | `POST` | `/profile/update` | 更新個人資料 |
| admin | `GET` | `/admin/users` | 會員清單；`?status=` `?q=` `?page=` |
| admin | `GET` | `/admin/users/<user_id>` | 會員明細 |
| admin | `POST` | `/admin/users/<user_id>/activate` | 啟用帳號 |
| admin | `POST` | `/admin/users/<user_id>/deactivate` | 停用帳號 |
| admin | `POST` | `/admin/users/<user_id>/role` | 調整角色 |
| admin | `POST` | `/admin/users/<user_id>/delete` | 軟刪除帳號 |
| equipment | `GET` | `/equipment/` | 器材主頁；`?id=` `?page=`（訪客可瀏覽） |
| equipment | `GET / POST` | `/equipment/new` | 新增器材（管理員） |
| equipment | `GET / POST` | `/equipment/edit/<equipment_id>` | 修改器材（管理員） |
| equipment | `POST` | `/equipment/delete/<equipment_id>` | 刪除器材（管理員） |
| equipment | `GET / POST` | `/equipment/<equipment_id>/borrow` | 送出借用申請 |
| equipment | `GET` | `/equipment/my-orders` | 我的借用紀錄 |
| equipment | `GET` | `/equipment/orders/<order_id>` | 借用單詳細（本人或管理員） |
| equipment | `GET / POST` | `/equipment/orders/<order_id>/edit` | 修改借用申請（本人、限 pending） |
| equipment | `POST` | `/equipment/orders/<order_id>/cancel` | 取消借用申請 |
| equipment | `GET` | `/equipment/admin/orders` | 借用單管理（管理員） |
| equipment | `POST` | `/equipment/admin/orders/<order_id>/approve` | 核准 |
| equipment | `POST` | `/equipment/admin/orders/<order_id>/reject` | 拒絕 |
| equipment | `POST` | `/equipment/admin/orders/<order_id>/borrow` | 登記借出 |
| equipment | `POST` | `/equipment/admin/orders/<order_id>/return` | 登記歸還 |
| — | `GET` | `/health` | 健康檢查 |

共 28 條（hub 1、auth 4、profile 2、admin 6、equipment 14、health 1）。

---

## 測試架構

> 詳細說明見 [`tests/CLAUDE.md`](tests/CLAUDE.md)。

- **框架**：pytest + pytest-flask（Flask test client，不啟動實際伺服器）
- **DB 隔離**：每個測試函式使用 `tmp_path` 建立獨立 SQLite 暫存檔，含種子資料
- **驗證碼**：直接透過 `client.session_transaction()` 將答案寫入 session
- **測試資料**：`tests/data/users.py`，修改訊息字串時需同步更新

### Fixtures（conftest.py）

| Fixture | 說明 |
|---|---|
| `app` | function scope；暫存 DB + 種子資料；`TESTING=True` |
| `client` | Flask test client（未登入） |
| `authed_client` | `session['user_id'] = 1`（user@example.com，一般使用者） |
| `admin_client` | `session['user_id'] = 2`（admin@example.com，管理員） |
| `other_client` | `session['user_id'] = 3`（disabled@example.com，role=1，用於他人／停用帳號測試） |

### 測試原則

- 被權限擋下的 POST **必須同時斷言資料庫沒有改變**。只驗 302 無法區分「被擋下」與「執行成功後 redirect」
- 涉及庫存的操作**必須同時斷言 `available_quantity`**。狀態對了但數量沒動，是最容易漏掉的錯誤
- 數量斷言一律用相對式（先讀 before 再比 after），不寫死絕對值
- 借用時間一律用 `2099` 年，避免未來因日期規則調整而失效

---

## 共用模組

### `utils.py`

- `_gen_captcha()` — 產生 5 位大寫字母 + 數字字串（排除 `I O 0 1`）
- `_is_usable(user)` — `user and user['is_active'] and not user['is_deleted']`
- `login_required(f)` — 無 session 則 redirect `auth.login_page`

`_is_admin` **刻意不放在這裡**，由各 Blueprint 各自定義局部 helper。

### `db/` 套件

- `db/__init__.py` — 定義 `DB_PATH`（環境變數 `DB_PATH` 或預設 `database.db`）；匯出所有公開函式；`init_db()` 建立資料表並植入種子資料
- `db/connection.py` — `_get_conn()`：每次呼叫時才讀取 `db.DB_PATH`，支援測試動態替換路徑；WAL 模式；`row_factory = sqlite3.Row`
- `db/users.py` — `find_user_by_email` `find_user_by_id` `create_user` `update_user_profile` `update_last_login` `soft_delete_user` `list_users` `set_user_active` `set_user_role` `hard_delete_user_by_email`
- `db/equipment.py` — `list_equipment` `get_equipment` `create_equipment` `update_equipment` `soft_delete_equipment` `create_borrow_order` `get_borrow_order` `list_order_items` `list_my_orders` `list_all_orders` `cancel_order` `approve_order` `reject_order` `mark_order_borrowed` `mark_order_returned` `update_borrow_order`

完整欄位字典與 transaction 說明見 [`db/CLAUDE.md`](db/CLAUDE.md)。

### 資料庫種子帳號

| email | 密碼 | 身份 |
|-------|------|------|
| user@example.com | password123 | 一般使用者（ID=1） |
| admin@example.com | admin1234 | 管理員（ID=2，role=0） |
| disabled@example.com | disabled123 | 停用帳號（ID=3，is_active=0） |

### 種子器材

`init_db()` 另植入 **8 筆器材**（id 1–8），涵蓋三種 `equipment_status` 與 `available_quantity = 0` 的情形。
**借用單不植入種子資料**——借用流程涉及狀態轉移與庫存扣減，由實際操作產生的資料才會與 `available_quantity` 一致。

---

## 環境變數

| 變數 | 預設值 | 說明 |
|------|--------|------|
| `SECRET_KEY` | `dev-secret-key-change-in-production` | Flask session 加密金鑰；生產環境務必替換 |
| `DB_PATH` | `database.db` | SQLite 資料庫路徑；測試時動態替換為 `tmp_path` 下的暫存檔 |

---

## 角色與權限

| `role` 值 | 身份 | 說明 |
|-----------|------|------|
| `0` | 管理員 | 一般使用者的全部權限，加上：會員管理（檢視所有會員含已刪除、啟用／停用、調整角色、軟刪除）、器材維護（新增／修改／刪除）、借用單審核與登記借出／歸還、檢視任何人的借用單 |
| `1` | 一般使用者 | 查看與編輯自己的個人資料；瀏覽器材；送出／修改／取消自己的借用申請；檢視自己的借用紀錄 |

新申請的帳號一律為 `role = 1`。系統沒有「申請成為管理員」的途徑，只能由既有管理員指定。

身份只存 `session['user_id']`，**role 不進 session**——每個請求都重新從資料庫讀取，
因此管理員停用某帳號後，該帳號的下一個請求就會被擋下。

### 三層權限檢查（順序不可調換）

1. `@login_required` — 無 session → redirect `auth.login_page`
2. `_is_usable(user)` — 帳號停用或已刪除 → `session.clear()` + redirect `auth.login_page`
3. `_is_admin(user)` — `user['role'] != 0` → flash `無操作權限` + redirect（`hub.home` 或 `equipment.index`）

第 2 層失敗代表**身分失效**（處置是登出），第 3 層失敗代表**權限不足**（處置是導回首頁）。順序調換會讓停用中的管理員收到與事實不符的回饋。

`_is_admin(user)` 為各 Blueprint 內部 helper（**非 `utils.py`**），判斷邏輯統一為 `user['role'] == 0`。這三層在 `admin` 的每個路由開頭明碼重複寫出，**不抽象成裝飾器**——這個重複是刻意的教學設計，請勿重構。

`equipment` 因為有開放訪客瀏覽的頁面，第 1、2 層收斂進 `_current_user()`（回傳 `None` 代表訪客或失效帳號），寫入類路由再各自處理 `user is None`：

| 路由 | 需要的層級 |
|------|-----------|
| `GET /equipment/` | 無（訪客可瀏覽） |
| `/equipment/<id>/borrow`、`/equipment/my-orders`、`/equipment/orders/*` | 1 + 2（＋本人或管理員的物件層檢查） |
| `/equipment/new`、`/equipment/edit/*`、`/equipment/delete/*`、`/equipment/admin/*` | 1 + 2 + 3 |

### 自我保護規則

管理員對自己的帳號受三條規則限制：

| 規則 | 內容 | 訊息 |
|------|------|------|
| R1 | 不可停用自己 | `不可停用自己的帳號` |
| R2 | 不可刪除自己 | `不可刪除自己的帳號` |
| R3 | 不可修改自己的角色 | `不可修改自己的角色` |

由這三條規則可推得：任何管理動作完成後，執行者仍是一個啟用、未刪除、`role=0` 的帳號，因此系統中永遠至少有一個可用的管理員，「最後一個管理員被鎖死」的狀態不可達。系統因此**不實作管理員計數檢查**。

> ⚠️ 若未來放寬 R1–R3 任何一條，必須立即補上「操作後啟用中管理員數 ≥ 1」的檢查，否則系統可被鎖死且無法從介面復原。

---

## 已知技術債

本系統刻意保留既有的技術債，**不做強行強化**——這些債本身就是教材。完整清單（含影響、接受理由、修補方向與工作量）見 [`document/system-spec.md`](document/system-spec.md) 第 11 章。

修改程式碼時最需要注意的五條：

| ID | 內容 | 注意事項 |
|----|------|---------|
| **KI-01** | `overdue` 狀態**沒有任何程式碼會寫入** | 狀態標籤、歸還按鈕、`mark_order_returned` 都支援它，但沒有任何排程或請求時檢查會把過期的 `borrowed` 改成 `overdue`。逾期偵測是本系統最明顯的功能缺口 |
| **KI-02** | hub 內嵌登入是 auth 登入的完整複製 | 任何登入政策的強化都**必須兩處都改**，漏改就能從另一個入口繞過 |
| **KI-03** | `POST /profile/update` **缺少 `_is_usable` 檢查** | 被停用或刪除的會員仍可修改自己資料。**請勿「順手」補上這三行**——它是「技術債如何跨功能傳染」的核心教材 |
| **KI-07** | 驗證碼在登入成功後未 `session.pop` | 驗證碼可重放。修補成本最低、安全效益最高的一項 |
| **KI-10** | 核准（`approved`）不保留庫存 | 兩張單可同時核准，後登記借出的那張才失敗。這是「檢查時機與使用時機」的經典題目，測試已鎖住現況 |

> KI-03 與 equipment 守門的**刻意不對稱**：profile 保留缺陷作為教材；equipment 則補上第 2 層檢查。理由是器材借用會**扣減共用資源**，缺陷的影響範圍超出當事人自己。這個判準本身要寫進規格書。

---

## 開發原則

- 以學習與可理解性為優先，避免過度抽象
- 維持模組邊界清晰（Blueprint / Template / DB）
- Blueprint 之間不互相 import，只透過 `url_for()` 建立關聯
- 所有 SQL 都寫在 `db/` 套件內，Blueprint 只呼叫 `db.*` 函式
- 刪除一律邏輯刪除（`is_deleted = 1`），不執行 `DELETE`
- 沿用既有技術債，不主動修補；但必須在 `document/system-spec.md` 第 11 章明列
- 新增子系統時：建立新 Blueprint + 對應 templates 子目錄 + `static/<name>.css` + `db/<name>.py` + 對應 test 檔案 + 子目錄 CLAUDE.md
- 使用任何 Skill 之前，先詢問確認後再進行

---

## CSS 按鍵設計規範

### 架構：共用 Token + 各子系統獨立類別

`static/common.css` 是全站按鍵**顏色的單一來源**（CSS 自訂屬性），`base.html` 最先載入。各子系統 CSS 使用自己的 prefixed 類別，顏色值透過 `var(--...)` 引用，**不寫死色碼**：

| CSS 檔案 | 按鍵前綴 | 適用頁面 |
|---------|---------|---------|
| `common.css` | — | 全站共用 token（無直接 class） |
| `login.css` | （無前綴）`.login-form button` | auth 登入／申請頁、hub 內嵌登入表單 |
| `hub.css` | `hub-*` | 首頁 |
| `profile.css` | `profile-*` | 個人資料頁 |
| `admin.css` | `admin-btn-*`、`admin-btn-action-*` | 會員管理所有頁面 |
| `equipment.css` | `eq-btn-*`、`eq-btn-action-*` | 器材借用所有頁面 |

### 共用設計 Token（`common.css`）

| 變數 | 說明 |
|------|------|
| `--btn-primary-bg / --btn-primary-hover` | 主要動作（藍） |
| `--btn-secondary-bg / --btn-secondary-color / --btn-secondary-hover` | 次要動作（灰） |
| `--btn-danger-bg / --btn-danger-hover` | 危險操作（紅） |
| `--btn-action-bg / --btn-action-border / --btn-action-color / --btn-action-hover` | 行內小按鍵 |
| `--btn-action-danger-*` | 行內小按鍵 danger 變體 |

新增子系統時，按鍵類別的顏色屬性一律使用這些變數，不另行定義新色碼。

> 已知例外：狀態 badge（帳號狀態、角色、器材狀態、借用單狀態）的底色硬編碼於 `admin.css` 與 `equipment.css`，因為 `common.css` 未定義狀態語意色（KI-19）。

### 關鍵限制：`.login-form` class

`login.css` 的 `button[type="submit"]` 樣式限定在 `.login-form` 選擇器內，**不會全域污染**其他子系統。凡使用 `login.css` 登入樣式的表單，`<form>` 元素必須加上 `class="login-form"`。全系統恰有三處：

- `templates/auth/login.html`
- `templates/auth/register.html`
- `templates/hub/home.html`（內嵌登入表單）

`profile`、`admin`、`equipment` 的表單**不加**此 class，否則會誤套登入頁樣式。

### `<a>` vs `<button>` 選用規則

| 元素 | 使用時機 |
|------|---------|
| `<a href="...">` | GET 導航（跳頁、返回、修改表單頁、篩選、分頁等） |
| `<button type="submit">` | POST 動作（有副作用：送出表單、審核、登記借出／歸還、刪除等） |

不用 `<a href="#">` 搭配 `onclick` 來假裝按鍵——語意錯誤、鍵盤和無障礙行為不正確。

全站僅十三處允許使用 inline event handler：

| 位置 | 用途 |
|------|------|
| `auth/login.html` × 2 | 驗證碼刷新（圖片本身、`↻` 按鈕）的 `onclick` |
| `hub/home.html` × 2 | 同上 |
| `admin/user_list.html` × 1、`admin/user_detail.html` × 1 | 刪除帳號的 `onclick="return confirm(...)"` |
| `equipment/admin_orders.html` × 2 | 核准／拒絕備註的 `onclick="…prompt(…)"` |
| `equipment/admin_orders.html` × 2 | 登記借出／歸還的 `onsubmit="return confirm(...)"` |
| `equipment/index.html` × 1、`my_orders.html` × 1、`order_detail.html` × 1 | 刪除器材／取消借用的 `onsubmit="return confirm(...)"` |

> 兩個子系統的確認寫法不一致：admin 寫在 `<button onclick>`、equipment 寫在 `<form onsubmit>`。這是兩份來源程式碼各自的慣例，保留原樣，記錄為 KI-12。

---

## 開發規範文件

實作時請同時參照 `rules/` 目錄下的規範：

| 文件 | 說明 |
|------|------|
| [`rules/flask-blueprint.md`](rules/flask-blueprint.md) | Blueprint 路由結構、表單處理、權限檢查、POST-Redirect-GET、CSS 類別命名等 |
| [`rules/database.md`](rules/database.md) | `db/` 套件使用方式、transaction 寫法、soft delete 模式、回傳值慣例 |

系統定義與建置步驟見 `document/` 目錄：

| 文件 | 說明 |
|------|------|
| [`document/system-spec.md`](document/system-spec.md) | 系統規格書：功能需求、資料模型、狀態機、驗證規則、訊息字串、已知技術債、測試策略 |
| [`document/build-guide.md`](document/build-guide.md) | 建置流程書：各階段的產出、決策與驗收指令 |
| [`document/auth.md`](document/auth.md) 等 | 各子系統功能文件（auth / hub / profile / admin / equipment） |

測試規範見 [`tests/CLAUDE.md`](tests/CLAUDE.md)。
