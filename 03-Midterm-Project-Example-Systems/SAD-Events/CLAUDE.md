# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

本文件提供 Claude Code（claude.ai/code）在此專案中的開發與理解指引。
各子系統的詳細說明位於對應 Blueprint 目錄下的 `CLAUDE.md`；測試子系統說明位於 `tests/CLAUDE.md`。

完整的功能與規則定義見 [`document/system-spec.md`](document/system-spec.md)；建置步驟見 [`document/build-guide.md`](document/build-guide.md)。

---

## 專案說明

以學習為目的之**校園活動報名系統**。以會員登入與管理系統為基礎，加上一個完整的
活動報名子系統。涵蓋：

- Flask 伺服器端渲染（Jinja2 Template）
- Python + Flask 後端（Blueprint 模組化架構）
- SQLite 資料庫整合（四張資料表，含主表／副表與一對多關聯）
- 圖形驗證碼（captcha 套件，伺服器端產生）
- 角色權限控制（管理員 / 活動發起者 / 一般使用者 / 訪客）
- 狀態機（活動的五種報名狀態、報名的四種狀態）

同時作為 Agentic / Harness Engineering 的練習專案。

### 血緣關係

本系統由兩個參考專案組合而來：

| 來源 | 提供的部分 |
|------|-----------|
| `sad-forum` | 專案骨架、會員登入與管理系統（auth / hub / profile / admin）、`rules/`、測試架構、CSS token 體系、文件體例 |
| `Course-SAD-Sample-System` | 校園活動報名子系統（events）的資料模型、路由設計、畫面與樣式 |

> **範圍外**：討論區（forum）、器材借用（equipment）兩個子系統**不屬於本系統**。
> 文件中提到它們時，一律是說明血緣或對照關係。

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
pytest tests/test_events.py -v          # 執行特定模組測試
pytest -k "register"                    # 執行特定測試
```

---

## 專案結構

```
sad-events/
├── app.py                        # 主程式：組裝 Blueprint、啟動伺服器
├── utils.py                      # 跨 Blueprint 共用 helpers
├── requirements.txt
├── pytest.ini                    # 限定測試收集範圍
├── Dockerfile                    # Docker 映像建置設定
├── docker-compose.yml            # Docker Compose 服務定義（port 4000、named volume）
├── .dockerignore                 # Docker 建置排除清單
├── database.db                   # SQLite（git 忽略，自動建立）
│
├── db/                           # 資料存取層套件
│   ├── __init__.py               # 匯出所有公開函式；定義 DB_PATH；init_db()
│   ├── connection.py             # _get_conn()：建立 SQLite 連線（WAL、row_factory）
│   ├── users.py                  # 使用者資料存取（users 表）
│   ├── events.py                 # 活動與報名資料存取（三張表）
│   └── CLAUDE.md                 # db 套件說明
│
├── blueprints/
│   ├── __init__.py
│   ├── auth/                     # 路由：/login /register /logout /captcha.png
│   ├── hub/                      # 路由：/
│   ├── profile/                  # 路由：/profile /profile/update
│   ├── admin/                    # 路由：/admin/users 及四個管理動作
│   └── events/                   # 路由：/events 及七條活動與報名路由
│                                 #（每個目錄含 __init__.py 與 CLAUDE.md）
│
├── templates/
│   ├── base.html                 # 共用 HTML 結構，引入 common.css 與 login.css
│   ├── auth/{login,register}.html
│   ├── hub/home.html             # 首頁（訪客／已登入雙模式）
│   ├── profile/dashboard.html    # 個人資料（唯讀／編輯雙模式）
│   ├── admin/{user_list,user_detail}.html
│   └── events/
│       ├── index.html            # 活動主頁（左側清單 + 右側細節與報名名單）
│       ├── event_form.html       # 新增／修改活動的共用表單
│       ├── registration_form.html# 報名／修改報名的共用表單
│       └── my_registrations.html # 我的報名紀錄
│
├── static/
│   ├── common.css                # 共用設計 token（CSS 自訂屬性）；按鍵顏色的單一來源
│   ├── login.css                 # auth 共用樣式；button[type="submit"] 限定在 .login-form 內
│   ├── hub.css                   # Hub 首頁專用 layout
│   ├── profile.css               # 個人資料頁專用樣式
│   ├── admin.css                 # 會員管理頁專用樣式
│   └── events.css                # 活動報名頁面專用樣式
│
├── tests/
│   ├── conftest.py               # fixtures：app、client、authed_client、admin_client、other_client
│   ├── data/users.py             # 種子帳號、種子活動常數與訊息字串
│   ├── test_{auth,hub,profile,admin,events}.py
│   └── CLAUDE.md                 # 測試子系統說明
│
├── rules/
│   ├── flask-blueprint.md        # Blueprint 開發規範
│   └── database.md               # 資料層開發規範
│
├── document/
│   ├── system-spec.md            # 系統規格書（功能、資料、規則、技術債）
│   ├── build-guide.md            # 建置流程書（14 個階段與驗收方式）
│   ├── auth.md                   # 登入系統文件
│   ├── hub.md                    # 首頁系統文件
│   ├── profile.md                # 個人資料系統文件
│   ├── admin.md                  # 會員管理系統文件
    └── events.md                 # 校園活動報名系統文件
```

---

## 路由總表

| Blueprint | 方法         | 路徑                                    | 說明                                              |
| --------- | ------------ | --------------------------------------- | ------------------------------------------------- |
| hub       | `GET / POST` | `/`                                     | 首頁；訪客可瀏覽並內嵌登入，登入後顯示服務卡片    |
| auth      | `GET / POST` | `/login`                                | 登入；已登入 → redirect `/`                       |
| auth      | `GET / POST` | `/register`                             | 申請帳號；成功 → redirect `/login` + flash        |
| auth      | `GET`        | `/captcha.png`                          | 驗證碼圖片                                        |
| auth      | `GET`        | `/logout`                               | 登出                                              |
| profile   | `GET`        | `/profile`                              | 個人資料；`?edit=1` 進入編輯模式                  |
| profile   | `POST`       | `/profile/update`                       | 更新個人資料                                      |
| admin     | `GET`        | `/admin/users`                          | 會員清單；`?status=` `?q=` `?page=` 可組合        |
| admin     | `GET`        | `/admin/users/<int:user_id>`            | 會員明細                                          |
| admin     | `POST`       | `/admin/users/<int:user_id>/activate`   | 啟用帳號                                          |
| admin     | `POST`       | `/admin/users/<int:user_id>/deactivate` | 停用帳號（不可對自己）                            |
| admin     | `POST`       | `/admin/users/<int:user_id>/role`       | 調整角色（不可對自己）                            |
| admin     | `POST`       | `/admin/users/<int:user_id>/delete`     | 軟刪除帳號（不可對自己）                          |
| events    | `GET`        | `/events`                               | 活動主頁；左側活動清單（分頁）+ 右側 `?event_id` 細節 |
| events    | `GET / POST` | `/events/new`                           | 新增活動（需登入且帳號有效）                      |
| events    | `GET / POST` | `/events/edit/<int:event_id>`           | 修改活動（活動發起者或管理員）                    |
| events    | `POST`       | `/events/delete/<int:event_id>`         | 刪除活動（活動發起者或管理員）                    |
| events    | `GET / POST` | `/events/<int:event_id>/register`       | 報名活動（需登入且帳號有效）                      |
| events    | `POST`       | `/events/<int:event_id>/cancel`         | 取消自己的報名                                    |
| events    | `GET / POST` | `/events/<int:event_id>/edit_registration` | 修改自己的報名資訊                             |
| events    | `GET`        | `/events/my`                            | 我的報名紀錄                                      |
| —         | `GET`        | `/health`                               | 健康檢查                                          |

共 22 條（hub 1、auth 4、profile 2、admin 6、events 8、health 1）。

`admin` 套用 `url_prefix='/admin'`，所有路由需通過三層檢查（已登入 → 帳號可用 → 管理員）。
`events` 套用 `url_prefix='/events'`，主頁開放訪客瀏覽，其餘七條需通過前兩層檢查，
修改與刪除活動另需第三層（活動發起者或管理員）。

---

## 測試架構

> 詳細說明見 [`tests/CLAUDE.md`](tests/CLAUDE.md)。

- **框架**：pytest + pytest-flask（Flask test client，不啟動實際伺服器）
- **DB 隔離**：每個測試函式使用 `tmp_path` 建立獨立 SQLite 暫存檔，含種子資料
- **驗證碼**：直接透過 `client.session_transaction()` 將答案寫入 session
- **測試資料**：`tests/data/users.py`，修改訊息字串時需同步更新
- **案例數**：152（auth 23／hub 11／profile 8／admin 30／events 80）

### Fixtures（conftest.py）

| Fixture | 說明 |
|---|---|
| `app` | function scope；暫存 DB + 種子資料；`TESTING=True` |
| `client` | Flask test client（未登入） |
| `authed_client` | `session['user_id'] = 1`（user@example.com，一般使用者） |
| `admin_client` | `session['user_id'] = 2`（admin@example.com，管理員） |
| `other_client` | `session['user_id'] = 3`（disabled@example.com，停用帳號但 session 直接注入） |

### 測試原則

- 被權限擋下的 POST **必須同時斷言資料庫沒有改變**。只驗 302 無法區分「被擋下」與「執行成功後 redirect」
- `db.create_user()` 使用 bcrypt cost=10，測試中不應大量建立會員
- events 的「他人無權限」測試必須先 `db.set_user_active(3, 1)`，否則會被帳號有效性檢查先攔下

---

## 共用模組

### `utils.py`

- `_gen_captcha()` — 產生 5 位大寫字母 + 數字字串（字元集刻意排除易混淆的 `I` `O` `0` `1`）
- `_is_usable(user)` — `user and user['is_active'] and not user['is_deleted']`
- `login_required(f)` — 無 session 則 redirect `auth.login_page`

### `db/` 套件

- `db/__init__.py` — 定義 `DB_PATH`；匯出所有公開函式；`init_db()` 建立四張表並植入種子資料
- `db/connection.py` — `_get_conn()`：每次呼叫時讀取 `db.DB_PATH`，支援測試動態替換；WAL 模式
- `db/users.py` — 使用者資料存取（10 個函式）
- `db/events.py` — 活動與報名資料存取（14 個函式）

模組拆分的依據是**資料表**，不是子系統。`db/events.py` 獨立成模組是因為 `events`、
`event_details`、`registrations` 是新資料表；反之，會員管理的三個新函式操作的仍是 `users` 表，
因此併入 `db/users.py`，**不另建 `db/admin.py`**。報名相關函式同理併入 `db/events.py`。

### 資料庫種子帳號

| email | 密碼 | 身份 |
|-------|------|------|
| user@example.com | password123 | 一般使用者（ID=1，role=1） |
| admin@example.com | admin1234 | 管理員（ID=2，role=0） |
| disabled@example.com | disabled123 | 停用帳號（ID=3，role=1，is_active=0） |

種子帳號使用 bcrypt cost=4（加速測試），註冊路徑使用 cost=10。

### 種子活動

`init_db()` 另外植入 **5 筆活動**（共 7 筆報名紀錄），同樣是「`events` 表為空時才執行」。
由 `db/events.py` 的 `_seed_events_if_empty()` 負責，**排在 `_seed_users_if_empty()` 之後**
——活動與報名的 `user_id` 指向種子帳號。

五筆各自對應 `_event_status()` 的一種回傳值（`ended` / `closed` / `full` / `not_open` /
`available`），讓活動列表一開啟就能同時看到五種狀態的 badge。詳見 [`db/CLAUDE.md`](db/CLAUDE.md)。

時間欄位以 `datetime('now', '±N days')` 換算，**不寫死絕對日期**——寫死的話過幾個月後
五筆會全部變成「活動已結束」，狀態差異就消失了。

---

## 環境變數

| 變數 | 預設值 | 說明 |
|------|--------|------|
| `SECRET_KEY` | `dev-secret-key-change-in-production` | Flask session 加密金鑰；生產環境務必替換 |
| `DB_PATH` | `database.db` | SQLite 資料庫路徑；測試時動態替換為 `tmp_path` 下的暫存檔 |

---

## 角色與權限

本系統有兩種**身分**（由 `role` 欄位決定）與一種**關係**（由資料決定）：

| 概念 | 判定 | 取得方式 |
|------|------|---------|
| 管理員 | `user['role'] == 0` | 由既有管理員指定 |
| 一般使用者 | `user['role'] == 1` | 新申請帳號的預設值 |
| 活動發起者 | `user['id'] == event['user_id']` | **建立一場活動就成為那場活動的發起者** |

「活動發起者」不是角色而是**關係**——同一個人對 A 活動是發起者，對 B 活動就不是。
這是本系統相對於單純角色制的關鍵設計：權限不只看「你是誰」，也看「這筆資料是不是你的」。

| 動作 | 訪客 | 一般使用者 | 活動發起者 | 管理員 |
|------|:--:|:--:|:--:|:--:|
| 瀏覽活動列表與細節 | ✅ | ✅ | ✅ | ✅ |
| 檢視公開報名名單 | ✅ | ✅ | ✅ | ✅ |
| 新增活動 | ❌ | ✅ | ✅ | ✅ |
| 報名／取消／修改自己的報名 | ❌ | ✅ | ✅ | ✅ |
| 修改／刪除活動 | ❌ | ❌ | ✅（限自己的） | ✅（任何一場） |
| 檢視完整報名名單（含聯絡資訊） | ❌ | ❌ | ✅（限自己的） | ✅（任何一場） |
| 查看與編輯自己的個人資料 | ❌ | ✅ | ✅ | ✅ |
| 會員管理 | ❌ | ❌ | ❌ | ✅ |

新申請的帳號一律為 `role = 1`。系統沒有「申請成為管理員」的途徑，只能由既有管理員指定。

### 三層權限檢查（順序不可調換）

1. `@login_required` — 無 session → redirect `auth.login_page`
2. `_is_usable(user)` — 帳號停用或已刪除 → `session.clear()` + redirect `auth.login_page`
3. `_is_admin(user)` / `_is_organizer_or_admin(user, event)` — 權限不足 → flash + redirect

第 2 層失敗代表**身分失效**（處置是登出），第 3 層失敗代表**權限不足**（處置是導回列表或首頁）。
順序調換會讓停用中的管理員收到與事實不符的回饋。

`_is_admin(user)` 為各 Blueprint 內部 helper（**非 `utils.py`**），判斷邏輯統一為 `user['role'] == 0`。
在 `admin` 的每個路由開頭明碼重複寫出，**不抽象成裝飾器** —— 這個重複是刻意的教學設計，請勿重構。

`events` 的守門依路由分級：

| 路由 | 需要的層級 |
|------|-----------|
| `GET /events` | 無（訪客可瀏覽；`_current_user()` 回傳 `None` 時模板顯示登入連結） |
| `/events/new`、`/events/<id>/register`、`/cancel`、`/edit_registration`、`/events/my` | 1 + 2 |
| `/events/edit/*`、`/events/delete/*` | 1 + 2 + 3（發起者或管理員） |

> `events._current_user()` **必須**做 `_is_usable` 檢查（相對於 `Course-SAD-Sample-System`
> 已修正）。否則被停用或刪除的帳號只要 session 未清，仍能建立活動、報名並佔用別人的名額，
> 讓 admin 的停用功能形同虛設。

### 自我保護規則（admin）

管理員對自己的帳號受三條規則限制：不可停用自己、不可刪除自己、不可修改自己的角色。
由這三條可推得系統中永遠至少有一個可用的管理員，因此**不實作管理員計數檢查**。
詳見 [`blueprints/admin/CLAUDE.md`](blueprints/admin/CLAUDE.md)。

---

## 活動狀態機

`blueprints/events/_event_status()` 依時間與名額計算，五種狀態互斥，**判斷順序即優先序**：

| 順序 | 狀態 | 條件 | 標籤 |
|:--:|------|------|------|
| 1 | `ended` | 活動時間 < 現在 | 活動已結束 |
| 2 | `closed` | 報名截止時間 < 現在 | 報名已截止 |
| 3 | `not_open` | 報名開始時間 > 現在 | 尚未開放 |
| 4 | `full` | `registered_count >= capacity` | 名額已滿 |
| 5 | `available` | 以上皆不符合 | 可報名 |

**只有 `available` 允許報名。** 報名的 POST 會在寫入前重新查一次活動並重算狀態，
因為使用者停留在表單頁的期間名額可能已被填滿（仍非完整並行防護，見 KI-11）。

報名紀錄另有四種狀態：`registered`、`cancelled`、`waiting`、`rejected`。
後兩者目前沒有任何路由會產生，是**不可達狀態**（KI-14）。

---

## 已知技術債

本系統沿用兩個參考專案的既有技術債，**不做強行強化**——這些債本身就是教材。
完整清單見 [`document/system-spec.md`](document/system-spec.md) 第 11 章。

修改程式碼時最需要注意的五條：

| ID | 內容 | 注意事項 |
|----|------|---------|
| **KI-03** | `POST /profile/update` **缺少 `_is_usable` 檢查** | 被停用或刪除的會員仍可修改自己資料。**請勿「順手」補上這三行**——它是「技術債如何跨功能傳染」的核心教材 |
| **KI-11** | 報名的名額檢查與寫入不在同一個 transaction | 高並行下可能超收。教學情境不會發生，但這是最典型的 race condition 範例 |
| **KI-13** | `datetime.now()`（本機時間）與 SQLite `datetime('now')`（UTC）混用 | 種子資料與 `created_at` 是 UTC，狀態判斷是本機時間。台灣時區有 8 小時偏差 |
| **KI-18** | 公開報名名單顯示所有報名者的姓名或 email | 訪客即可看到。隱私議題，但也是活動報名系統的常見需求 |
| **KI-23** | hub 內嵌登入是 auth 登入的完整複製 | 任何登入政策的強化都**必須兩處都改**，漏改就能從另一個入口繞過 |

> KI-03 與 events 的守門是**刻意的不對稱**：profile 保留缺陷作為教材，events 則修補。
> 判準是缺陷的影響是否會外溢到當事人以外的人——profile 只能改自己的姓名，
> events 能產生公開內容並佔用別人的名額。這個判準本身寫在規格書 §11.0。

---

## 開發原則

- 以學習與可理解性為優先，避免過度抽象
- 維持模組邊界清晰（Blueprint / Template / DB）
- Blueprint 之間不互相 import，只透過 `url_for()` 建立關聯
- 沿用既有技術債，不主動修補；但必須在 `document/system-spec.md` 第 11 章明列
- 新增子系統時：建立新 Blueprint + 對應 templates 子目錄 + `static/<name>.css` + 對應 test 檔案 + 子目錄 CLAUDE.md
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
| `events.css` | `events-btn-*`、`events-btn-action-*` | 活動報名所有頁面 |

### 共用設計 Token（`common.css`）

| 變數 | 說明 |
|------|------|
| `--btn-primary-bg / --btn-primary-hover` | 主要動作（藍） |
| `--btn-secondary-bg / --btn-secondary-color / --btn-secondary-hover` | 次要動作（灰） |
| `--btn-danger-bg / --btn-danger-hover` | 危險操作（紅） |
| `--btn-action-bg / --btn-action-border / --btn-action-color / --btn-action-hover` | 行內小按鍵 |
| `--btn-action-danger-*` | 行內小按鍵 danger 變體 |

新增子系統時，按鍵類別的顏色屬性一律使用這些變數，不另行定義新色碼。

> 兩處已知例外：
> - 狀態 badge 的底色硬編碼於 `admin.css` 與 `events.css`，因為 `common.css` 未定義狀態語意色（KI-19）
> - `hub.css` 的 `.hub-register-link` 與 `.hub-logout` 是按鍵卻寫死色碼（KI-31）。它們的類別名稱不含 `btn`，以「btn」為關鍵字的稽核抓不到

### 關鍵限制：`.login-form` class

`login.css` 的 `button[type="submit"]` 樣式限定在 `.login-form` 選擇器內，**不會全域污染**
其他子系統。凡使用 `login.css` 登入樣式的表單，`<form>` 元素必須加上 `class="login-form"`。
全系統恰有三處：

- `templates/auth/login.html`
- `templates/auth/register.html`
- `templates/hub/home.html`（內嵌登入表單）

`profile`、`admin`、`events` 的表單**不加**此 class，否則會誤套登入頁樣式。

### `<a>` vs `<button>` 選用規則

| 元素 | 使用時機 |
|------|---------|
| `<a href="...">` | GET 導航（跳頁、返回、修改表單頁、篩選、分頁等） |
| `<button type="submit">` | POST 動作（有副作用：送出表單、報名、取消、刪除等） |

不用 `<a href="#">` 搭配 `onclick` 來假裝按鍵——語意錯誤、鍵盤和無障礙行為不正確。

> 這是相對於 `Course-SAD-Sample-System` 的修正：範本的 events 模板用
> `<a href="#" onclick="...this.closest('form').submit()">` 送出刪除與取消，
> 本系統一律改為 `<button type="submit" onclick="return confirm(...)">`。

全站僅十處允許使用 inline event handler：

| 位置 | 用途 |
|------|------|
| `auth/login.html` × 2 | 驗證碼刷新（圖片本身、`↻` 按鈕）的 `onclick` |
| `hub/home.html` × 2 | 同上 |
| `events/index.html` × 3 | 刪除活動（清單、細節）、取消報名的 `onclick="return confirm(...)"` |
| `events/my_registrations.html` × 1 | 取消報名 |
| `admin/user_list.html` × 1 | 刪除帳號 |
| `admin/user_detail.html` × 1 | 同上 |

確認對話框一律寫在 `<button>` 的 `onclick` 上，不寫在 `<form>` 的 `onsubmit` 上。

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
| [`document/system-spec.md`](document/system-spec.md) | 系統規格書：功能需求、資料模型、驗證規則、訊息字串、已知技術債、測試策略 |
| [`document/build-guide.md`](document/build-guide.md) | 建置流程書：14 個階段的產出、決策與驗收指令 |

測試規範見 [`tests/CLAUDE.md`](tests/CLAUDE.md)。
