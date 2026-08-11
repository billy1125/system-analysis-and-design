# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

本文件提供 Claude Code（claude.ai/code）在此專案中的開發與理解指引。
各子系統的詳細說明位於對應 Blueprint 目錄下的 `CLAUDE.md`；測試子系統說明位於 `tests/CLAUDE.md`。

完整的功能與規則定義見 [`document/system-spec.md`](document/system-spec.md)；
建置步驟見 [`document/build-guide.md`](document/build-guide.md)。

---

## 專案說明

以學習為目的之**校園訂餐系統**。它由兩個部分組成：

1. **會員登入與管理系統**——直接沿用 `billy1125/sad-forum`，涵蓋帳號的完整生命週期
   （申請、登入、個人資料維護、管理員治理）
2. **訂餐子系統**——本專案的核心，示範一個真正的交易型業務子系統：主檔／明細、
   狀態機、庫存的一致性維護。設計模式取自 `billy1125/Course-SAD-Sample-System`
   的器材借用（equipment）

涵蓋：

- Flask 伺服器端渲染（Jinja2 Template）
- Python + Flask 後端（Blueprint 模組化架構）
- SQLite 資料庫整合（四張資料表，含主檔／明細與帶屬性的關聯表）
- 圖形驗證碼（captcha 套件，伺服器端產生）
- 角色權限控制（管理員 / 一般使用者）
- 訂單狀態機與庫存不變量

同時作為 Agentic / Harness Engineering 的練習專案。

> **範圍外**：論壇（`sad-forum` 有）、校園活動報名（events）、器材借用（equipment）
> 三個子系統**不屬於本系統**。文件中提到它們時，一律是說明血緣或對照關係。

---

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
docker compose up -d --build            # 建置映像並啟動（背景）
docker compose logs -f                  # 查看即時 log
docker compose down                     # 停止服務
docker compose down -v                  # 停止並刪除資料（重置 DB）

# 測試
pytest                                  # 執行所有測試（152 個）
pytest tests/test_meal.py -v            # 執行訂餐子系統測試
pytest -k "restock"                     # 執行名稱符合的測試
```

---

## 專案結構

```
sad-meal-order/
├── app.py                        # 主程式：組裝 Blueprint、啟動伺服器
├── utils.py                      # 跨 Blueprint 共用 helpers
├── pytest.ini                    # 限定 testpaths，避免收集參考專案的測試
├── requirements.txt
├── Dockerfile / docker-compose.yml / .dockerignore
├── database.db                   # SQLite（git 忽略，自動建立）
│
├── db/                           # 資料存取層套件
│   ├── __init__.py               # 匯出所有公開函式；定義 DB_PATH；init_db()
│   ├── connection.py             # _get_conn()：建立 SQLite 連線（WAL、row_factory）
│   ├── users.py                  # 使用者資料存取
│   ├── meals.py                  # 訂餐資料存取 + 狀態機 + 庫存規則
│   └── CLAUDE.md
│
├── blueprints/
│   ├── auth/                     # /login /register /logout /captcha.png
│   ├── hub/                      # /
│   ├── profile/                  # /profile /profile/update
│   ├── admin/                    # /admin/users 及四個管理動作
│   └── meal/                     # /meal/* 共 14 條
│
├── templates/
│   ├── base.html
│   ├── auth/{login,register}.html
│   ├── hub/home.html
│   ├── profile/dashboard.html
│   ├── admin/{user_list,user_detail}.html
│   └── meal/{index,meal_form,order_form,my_orders,order_detail,admin_orders}.html
│
├── static/{common,login,hub,profile,admin,meal}.css
│
├── tests/
│   ├── conftest.py               # fixtures：app、client、authed/admin/other_client
│   ├── data/users.py             # 種子常數（USERS、MEALS、ORDERS）與訊息字串
│   ├── test_{auth,hub,profile,admin,meal}.py
│   └── CLAUDE.md
│
├── rules/
│   ├── flask-blueprint.md        # Blueprint 開發規範
│   └── database.md               # 資料層開發規範
│
├── document/
│   ├── system-spec.md            # 系統規格書
│   ├── build-guide.md            # 建置流程書（15 個階段與驗收方式）
    └── {auth,hub,profile,admin,meal}.md
```

---

## 路由總表

| Blueprint | 方法 | 路徑 | 說明 |
|-----------|------|------|------|
| hub | `GET / POST` | `/` | 首頁；訪客可瀏覽並內嵌登入 |
| auth | `GET / POST` | `/login` | 登入；已登入 → redirect `/` |
| auth | `GET / POST` | `/register` | 申請帳號；成功 → redirect `/login` + flash |
| auth | `GET` | `/captcha.png` | 驗證碼圖片 |
| auth | `GET` | `/logout` | 登出 |
| profile | `GET` | `/profile` | 個人資料；`?edit=1` 進入編輯模式 |
| profile | `POST` | `/profile/update` | 更新個人資料 |
| admin | `GET` | `/admin/users` | 會員清單；`?status=` `?q=` `?page=` 可組合 |
| admin | `GET` | `/admin/users/<id>` | 會員明細 |
| admin | `POST` | `/admin/users/<id>/activate` | 啟用帳號 |
| admin | `POST` | `/admin/users/<id>/deactivate` | 停用帳號（不可對自己） |
| admin | `POST` | `/admin/users/<id>/role` | 調整角色（不可對自己） |
| admin | `POST` | `/admin/users/<id>/delete` | 軟刪除帳號（不可對自己） |
| meal | `GET` | `/meal/` | 菜單主頁；`?category=` `?meal_id=` `?page=` 可組合 |
| meal | `GET / POST` | `/meal/new` | 新增餐點（管理員） |
| meal | `GET / POST` | `/meal/edit/<id>` | 修改餐點（管理員） |
| meal | `POST` | `/meal/delete/<id>` | 下架餐點（管理員、軟刪除） |
| meal | `GET / POST` | `/meal/order/new` | 訂餐 |
| meal | `GET` | `/meal/my-orders` | 我的訂單 |
| meal | `GET` | `/meal/orders/<id>` | 訂單明細（本人或管理員） |
| meal | `GET / POST` | `/meal/orders/<id>/edit` | 修改訂單（本人、限 pending） |
| meal | `POST` | `/meal/orders/<id>/cancel` | 取消訂單（本人） |
| meal | `GET` | `/meal/admin/orders` | 所有訂單；`?status=` `?page=` |
| meal | `POST` | `/meal/admin/orders/<id>/confirm` | 確認訂單並扣減庫存 |
| meal | `POST` | `/meal/admin/orders/<id>/reject` | 拒絕訂單 |
| meal | `POST` | `/meal/admin/orders/<id>/complete` | 登記取餐 |
| meal | `POST` | `/meal/admin/orders/<id>/cancel` | 管理員代為取消 |
| — | `GET` | `/health` | 健康檢查 |

共 28 條（hub 1、auth 4、profile 2、admin 6、meal 14、health 1）。

`admin` 套用 `url_prefix='/admin'`，所有路由需通過三層檢查。
`meal` 套用 `url_prefix='/meal'`，菜單開放訪客瀏覽，其餘依路由分級。

---

## 訂單狀態機（本系統的核心）

```text
pending ──confirm──> confirmed ──complete──> completed
   │                     │
   ├──reject──> rejected └──cancel──> cancelled
   └──cancel──> cancelled
```

**庫存不變量：`meals.remaining_quantity` 只在 `confirmed` 狀態被佔用。**

| 轉移 | 庫存 | 理由 |
|------|------|------|
| pending → confirmed | **扣減** | 開始佔用 |
| confirmed → cancelled | **回補** | 停止佔用 |
| pending → cancelled / rejected | 不動 | 本來就沒佔用 |
| confirmed → completed | 不動 | 餐點已被取走，額度真的消耗掉了 |

回補以 `MIN(remaining + qty, daily_quantity)` 封頂——管理員可能在訂單存續期間調低
`daily_quantity`，不封頂就會把剩餘份數加到超過當日供應量。

三個常見的誤改：

1. **`complete_meal_order()` 順手寫成回補庫存**（照抄範本的 `mark_order_returned`）。
   便當吃掉就沒了，器材才會還回來
2. **`confirm_meal_order()` 先扣減再檢查**，導致部分確認。必須先全部檢查通過才動手
3. **在 Blueprint 中重複檢查訂單狀態**。狀態檢查的權威位置在資料層

---

## 業務規則放在哪一層

| 類型 | 例子 | 放在哪 | 為什麼 |
|------|------|--------|--------|
| **輸入驗證** | 日期格式、地點非空、總份數上限 | Blueprint 的 `_validate_*` | 只跟這一次表單提交有關，失敗時要把使用者填的內容原樣退回畫面 |
| **狀態不變量** | 狀態轉移是否合法、庫存夠不夠 | **資料層** `db/meals.py` | 判斷所依據的事實可能在使用者看到畫面之後被別人改掉 |

樣板的 `{% if %}` 是**第三次**檢查，但那只決定按鈕要不要顯示，不是安全邊界。

---

## 測試架構

> 詳細說明見 [`tests/CLAUDE.md`](tests/CLAUDE.md)。

- **框架**：pytest + pytest-flask（Flask test client，不啟動實際伺服器）
- **DB 隔離**：每個測試函式使用 `tmp_path` 建立獨立 SQLite 暫存檔，含種子資料
- **驗證碼**：直接透過 `client.session_transaction()` 將答案寫入 session
- **測試資料**：`tests/data/users.py`（`USERS`、`MEALS`、`ORDERS`、`MESSAGES`）
- **案例數**：152（auth 23／hub 11／profile 10／admin 30／meal 78）

### Fixtures（conftest.py）

| Fixture | 說明 |
|---|---|
| `app` | function scope；暫存 DB + 種子資料；`TESTING=True` |
| `client` | Flask test client（未登入） |
| `authed_client` | `session['user_id'] = 1`（user@example.com，一般使用者） |
| `admin_client` | `session['user_id'] = 2`（admin@example.com，管理員） |
| `other_client` | `session['user_id'] = 3`（disabled@example.com，停用帳號但 session 直接注入） |

> ⚠️ 三個已登入 fixture 都由 `client` 衍生，**同一個測試中同時請求兩個，拿到的是同一個
> 物件**。需要第二個乾淨 client 時，請求 `app` fixture 後自行 `app.test_client()`
> （`test_meal.py` 的 `clean_client` 就是這樣做的）。

### 測試原則

- 被權限擋下的 POST **必須同時斷言資料庫沒有改變**。只驗 302 無法區分「被擋下」與
  「執行成功後 redirect」
- **涉及庫存的操作必須斷言庫存**。狀態改對了但庫存沒跟上，是本系統最容易出現的錯
- 斷言數量一律用**相對式**（`before` / `after`）——種子資料的存在使得資料庫從來不是空的
- `db.create_user()` 使用 bcrypt cost=10，測試中不應大量建立會員

---

## 共用模組

### `utils.py`

- `_gen_captcha()` — 產生 5 位大寫字母 + 數字字串（字元集刻意排除易混淆的 `I` `O` `0` `1`）
- `_is_usable(user)` — `user and user['is_active'] and not user['is_deleted']`
- `login_required(f)` — 無 session 則 redirect `auth.login_page`

### `db/` 套件

- `db/__init__.py` — 定義 `DB_PATH`（環境變數 `DB_PATH` 或預設 `database.db`）；
  匯出所有公開函式；`init_db()` 建立四張表、依序植入種子帳號與種子餐點／訂單
- `db/connection.py` — `_get_conn()`：每次呼叫時讀取 `db.DB_PATH`，支援測試動態替換；
  WAL 模式；`row_factory = sqlite3.Row`
- `db/users.py` — `users` 表的十個存取函式
- `db/meals.py` — `meals`、`meal_orders`、`meal_order_items` 三表；狀態機的六個轉移函式；
  庫存的扣減與回補

模組拆分的依據是**資料表**，不是子系統。三張訂餐表放在同一個模組，因為它們構成一個
完整的語意單位；反之，訂餐的管理端函式仍在 `db/meals.py`，**不另建 `db/meal_admin.py`**。

### 資料庫種子帳號

| email | 密碼 | 身份 |
|-------|------|------|
| user@example.com | password123 | 一般使用者（ID=1，role=1） |
| admin@example.com | admin1234 | 管理員（ID=2，role=0） |
| disabled@example.com | disabled123 | 停用帳號（ID=3，role=1，is_active=0） |

種子帳號使用 bcrypt cost=4（加速測試），註冊路徑使用 cost=10。

### 種子餐點與訂單

`init_db()` 另外植入 **6 道餐點**（id 1–6）與 **4 張訂單**（id 1–4），由
`db/meals.py` 的 `_seed_meals_if_empty()` 負責，**必須排在 `_seed_users_if_empty()`
之後**——訂單的 `orderer_id` 指向種子帳號。

六道餐點各自對應一個值得觀察的狀態（正常、被佔用、售完、停售、附餐、飲料）；
四張訂單覆蓋狀態機的四個可達狀態。詳見 [`db/CLAUDE.md`](db/CLAUDE.md)。

> **種子訂單 #3（confirmed）在植入時實際扣減了庫存**，因此 A02 的初始剩餘是 38 而非 40。
> 這是為了維持庫存不變量——只寫訂單而不扣庫存的話，系統一啟動就帳實不符。

---

## 環境變數

| 變數 | 預設值 | 說明 |
|------|--------|------|
| `SECRET_KEY` | `dev-secret-key-change-in-production` | Flask session 加密金鑰；生產環境務必替換 |
| `DB_PATH` | `database.db` | SQLite 資料庫路徑；測試時動態替換為 `tmp_path` 下的暫存檔 |

---

## 角色與權限

| `role` | 身份 | 說明 |
|:--:|------|------|
| `0` | 管理員 | 一般使用者的全部權限，加上：會員管理、餐點管理、訂單審核（確認／拒絕／登記取餐／代為取消所有人的訂單） |
| `1` | 一般使用者 | 查看與編輯自己的個人資料；瀏覽菜單；訂餐；檢視、修改、取消**自己的**訂單 |

新申請的帳號一律為 `role = 1`。系統沒有「申請成為管理員」的途徑。

> **管理員可以取消別人的訂單，但不能修改別人的訂單內容。** 取消是「不做這筆生意」，
> 語意明確且對訂購人無害（庫存會回補）；修改內容則是「替他決定要吃什麼」。

### 三層權限檢查（順序不可調換）

1. `@login_required` — 無 session → redirect `auth.login_page`
2. `_is_usable(user)` — 帳號停用或已刪除 → `session.clear()` + redirect `auth.login_page`
3. `_is_admin(user)` — `user['role'] != 0` → flash `無操作權限` + redirect `hub.home`

第 2 層失敗代表**身分失效**（處置是登出），第 3 層失敗代表**權限不足**（處置是導回首頁）。
順序調換會讓停用中的管理員收到與事實不符的回饋。

`_is_admin(user)` 為各 Blueprint 內部 helper（**非 `utils.py`**）。這三層在 `admin` 與
`meal` 管理端的每個路由開頭明碼重複寫出，**不抽象成裝飾器** —— 這個重複是刻意的教學
設計，請勿重構。

`meal` 的會員端路由把第 1、2 層收斂進 `_current_user()`，因為 `index` 開放訪客瀏覽，
需要一個「未登入或帳號失效都回傳 `None`」的 helper：

| 路由 | 需要的層級 |
|------|-----------|
| `GET /meal/` | 無（訪客可瀏覽） |
| `/meal/order/new`、`/meal/my-orders`、`/meal/orders/*` | 1 + 2 |
| `/meal/new`、`/meal/edit/*`、`/meal/delete/*`、`/meal/admin/*` | 1 + 2 + 3 |

> `meal._current_user()` **必須**做 `_is_usable` 檢查（相對於範本已修正）。否則被停用
> 的帳號只要 session 未清，仍能送出訂單、佔用真實的餐點份數，讓 admin 的停用功能形同
> 虛設。

### 自我保護規則

管理員不可停用自己（R1）、不可刪除自己（R2）、不可修改自己的角色（R3）。由這三條可推得
系統中永遠至少有一個可用的管理員，因此**不實作管理員計數檢查**。

> ⚠️ 若未來放寬 R1–R3 任何一條，必須立即補上「操作後啟用中管理員數 ≥ 1」的檢查。

---

## 已知技術債

完整清單見 [`document/system-spec.md`](document/system-spec.md) 第 11 章。分兩類：

- **沿用自 `sad-forum`（KI-01 ~ KI-31）**：保留不修，它們本身就是教材
- **訂餐子系統新增（KI-M1 ~ KI-M10）**：全部是刻意的取捨，每一條都有記錄理由

判準只有一條：**缺陷的影響是否會外溢到當事人以外的人。**

修改程式碼時最需要注意的五條：

| ID | 內容 | 注意事項 |
|----|------|---------|
| **KI-03** | `POST /profile/update` **缺少 `_is_usable` 檢查** | 被停用的會員仍可修改自己資料。**請勿「順手」補上這三行**——它是「技術債如何跨功能傳染」的核心教材，且有測試在保護它 |
| **KI-M1** | `pending` 不佔用庫存，可超額登記 | 十個人各訂最後一份便當都會成功，直到管理員確認第一張。這是刻意的語意選擇 |
| **KI-M6** | `hub/home.html` 未渲染 flash 區塊 | 所有第 3 層權限失敗的「無操作權限」訊息都被靜默丟棄。測試斷言請驗 redirect 目標，不要驗訊息 |
| **KI-M7** | `remaining_quantity` 不會每日自動重設 | 管理員必須手動調整 |
| **KI-07** | 驗證碼在登入成功後未 `session.pop` | 驗證碼可重放。修補成本最低、安全效益最高的一項 |

> KI-03 與 `meal` 的守門是**刻意的不對稱**：profile 保留缺陷作為教材，meal 則修補。
> 理由是 meal 會佔用真實的餐點份數，缺陷的影響範圍超出當事人自己。

---

## 開發原則

- 以學習與可理解性為優先，避免過度抽象
- 維持模組邊界清晰（Blueprint / Template / DB）
- **SQL 只寫在 `db/` 套件內**，Blueprint 不得出現 `sqlite3` 或 SQL 字串
- Blueprint 之間不互相 import，只透過 `url_for()` 建立關聯
- **金額與狀態的權威計算都在資料層。** 表單傳來的價格一律忽略，總金額由資料層依明細算出
- 沿用既有技術債，不主動修補；但必須在 `document/system-spec.md` 第 11 章明列
- 新增子系統時：建立新 Blueprint + 對應 templates 子目錄 + `static/<name>.css` +
  `db/<name>.py` + 對應 test 檔案 + 子目錄 CLAUDE.md + `app.py` 註冊
- 使用任何 Skill 之前，先詢問確認後再進行

---

## CSS 按鍵設計規範

### 架構：共用 Token + 各子系統獨立類別

`static/common.css` 是全站按鍵**顏色的單一來源**（CSS 自訂屬性），`base.html` 最先載入。
各子系統 CSS 使用自己的 prefixed 類別，顏色值透過 `var(--...)` 引用，**不寫死色碼**：

| CSS 檔案 | 按鍵前綴 | 適用頁面 |
|---------|---------|---------|
| `common.css` | — | 全站共用 token（無直接 class） |
| `login.css` | （無前綴）`.login-form button` | auth 登入／申請頁、hub 內嵌登入表單 |
| `hub.css` | `hub-*` | 首頁 |
| `profile.css` | `profile-*` | 個人資料頁 |
| `admin.css` | `admin-btn-*`、`admin-btn-action-*` | 會員管理所有頁面 |
| `meal.css` | `meal-btn-*`、`meal-btn-action-*` | 訂餐所有頁面 |

### 共用設計 Token（`common.css`）

| 變數 | 說明 |
|------|------|
| `--btn-primary-bg / --btn-primary-hover` | 主要動作（藍） |
| `--btn-secondary-bg / -color / -hover` | 次要動作（灰） |
| `--btn-danger-bg / --btn-danger-hover` | 危險操作（紅） |
| `--btn-action-*` | 行內小按鍵 |
| `--btn-action-danger-*` | 行內小按鍵 danger 變體 |

> 三處已知例外：
> - 狀態 badge 的底色硬編碼於 `admin.css` 與 `meal.css`（`common.css` 未定義狀態語意色，KI-19）
> - `hub.css` 的 `.hub-register-link` 與 `.hub-logout` 是按鍵卻寫死色碼（KI-31）
> - 分頁按鍵（`.meal-page-btn` / `.admin-page-btn`）的中性灰不屬於動作按鍵的語意體系

### 關鍵限制：`.login-form` class

`login.css` 的 `button[type="submit"]` 樣式限定在 `.login-form` 選擇器內，**不會全域污染**。
全系統恰有三處使用：`auth/login.html`、`auth/register.html`、`hub/home.html`。
`profile`、`admin`、`meal` 的表單**不加**此 class。

### `<a>` vs `<button>` 選用規則

| 元素 | 使用時機 |
|------|---------|
| `<a href="...">` | GET 導航（跳頁、返回、篩選、分頁、進入表單頁） |
| `<button type="submit">` | POST 動作（送出、確認、拒絕、取消、下架） |

不用 `<a href="#">` 搭配 `onclick` 假裝按鍵。全站僅十處允許 inline event handler：
驗證碼刷新 4 處（`auth/login.html` 與 `hub/home.html` 各 2）、刪除／取消確認 6 處
（`admin` 2、`meal/index.html` 1、`meal/order_detail.html` 1、`meal/admin_orders.html` 2）。

稽核指令：`grep -ro "onclick" templates/ | wc -l` 應為 `10`。

確認對話框一律寫在 `<button>` 的 `onclick` 上，不寫在 `<form>` 的 `onsubmit` 上。

---

## 開發規範文件

實作時請同時參照 `rules/` 目錄下的規範：

| 文件 | 說明 |
|------|------|
| [`rules/flask-blueprint.md`](rules/flask-blueprint.md) | Blueprint 路由結構、表單處理、權限檢查、POST-Redirect-GET、CSS 類別命名 |
| [`rules/database.md`](rules/database.md) | `db/` 套件使用方式、transaction 寫法、soft delete 模式、回傳值慣例 |

系統定義與建置步驟見 `document/` 目錄：

| 文件 | 說明 |
|------|------|
| [`document/system-spec.md`](document/system-spec.md) | 系統規格書：功能需求、資料模型、狀態機、驗證規則、訊息字串、已知技術債、測試策略 |
| [`document/build-guide.md`](document/build-guide.md) | 建置流程書：15 個階段的產出、決策與驗收指令 |
| [`document/meal.md`](document/meal.md) | 訂餐子系統的細部行為 |
| [`document/auth.md`](document/auth.md)、[`hub.md`](document/hub.md)、[`profile.md`](document/profile.md)、[`admin.md`](document/admin.md) | 會員系統各子系統的細部行為 |

測試規範見 [`tests/CLAUDE.md`](tests/CLAUDE.md)。

---

## 兩個參考專案

| 目錄 | 提供什麼 | 用法 |
|------|---------|------|
| `sad-forum/` | 會員登入與管理系統（auth、hub、profile、admin）、資料層骨架、測試骨架、`rules/`、文件結構 | 修改會員系統時先看它的對應檔案——本系統的四個 Blueprint 是**逐字沿用** |
| `Course-SAD-Sample-System/` | 器材借用（equipment）的主檔／明細 + 狀態機 + 資源數量增減 | 擴充訂餐子系統時參考它的模式；但**不要照抄** `mark_order_returned` 的回補邏輯 |

兩者都是獨立的 git repo，**不要修改它們**。它們的存在是為了讓「本系統改了什麼、
為什麼改」可以直接 diff 出來。
