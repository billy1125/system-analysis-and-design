# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

本文件提供 Claude Code（claude.ai/code）在此專案中的開發與理解指引。
各子系統的詳細說明位於對應 Blueprint 目錄下的 `CLAUDE.md`；測試子系統說明位於 `tests/CLAUDE.md`。

完整的功能與規則定義見 [`document/system-spec.md`](document/system-spec.md)；建置步驟見 [`document/build-guide.md`](document/build-guide.md)。

---

## 專案說明

以學習為目的之**會員管理與討論區系統**。以登入系統為基礎，涵蓋使用者帳號的完整生命週期（申請、登入、個人資料維護、管理員治理），並附帶一個論壇子系統作為「使用者產生內容」的示範。涵蓋：

- Flask 伺服器端渲染（Jinja2 Template）
- Python + Flask 後端（Blueprint 模組化架構）
- SQLite 資料庫整合（三張資料表，含主檔／明細關聯）
- 圖形驗證碼（captcha 套件，伺服器端產生）
- 角色權限控制（管理員 / 一般使用者）

同時作為 Agentic / Harness Engineering 的練習專案。

> **範圍外**：校園活動報名（events）、器材借用（equipment）兩個子系統**不屬於本系統**。本系統由教學範本 `billy1125/Course-SAD-Sample-System` 抽取而來，該範本已不在本 repo 內；文件中提到它時，一律是說明血緣或對照關係。

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
pytest                                  # 執行所有測試
pytest tests/test_admin.py -v           # 執行特定模組測試
pytest -k "test_login"                  # 執行特定測試
```

---

## 專案結構

```
sad-user-management/
├── app.py                        # 主程式：組裝 Blueprint、啟動伺服器
├── utils.py                      # 跨 Blueprint 共用 helpers
├── requirements.txt
├── Dockerfile                    # Docker 映像建置設定
├── docker-compose.yml            # Docker Compose 服務定義（port 4000、named volume）
├── .dockerignore                 # Docker 建置排除清單
├── database.db                   # SQLite（git 忽略，自動建立）
│
├── db/                           # 資料存取層套件
│   ├── __init__.py               # 匯出所有公開函式；定義 DB_PATH；init_db()
│   ├── connection.py             # _get_conn()：建立 SQLite 連線（WAL、row_factory）
│   ├── users.py                  # 使用者資料存取函式
│   ├── forum.py                  # 論壇資料存取函式
│   └── CLAUDE.md                 # db 套件說明
│
├── blueprints/
│   ├── __init__.py
│   ├── auth/
│   │   ├── __init__.py           # 路由：/login /register /logout /captcha.png
│   │   └── CLAUDE.md             # auth 子系統說明
│   ├── hub/
│   │   ├── __init__.py           # 路由：/
│   │   └── CLAUDE.md             # hub 子系統說明
│   ├── profile/
│   │   ├── __init__.py           # 路由：/profile /profile/update
│   │   └── CLAUDE.md             # profile 子系統說明
│   ├── admin/
│   │   ├── __init__.py           # 路由：/admin/users 及四個管理動作
│   │   └── CLAUDE.md             # admin 子系統說明
│   └── forum/
│       ├── __init__.py           # 路由：/forum /forum/new /forum/reply/<id> 等
│       └── CLAUDE.md             # forum 子系統說明
│
├── templates/
│   ├── base.html                 # 共用 HTML 結構，引入 common.css 與 login.css
│   ├── auth/
│   │   ├── login.html            # 登入表單
│   │   └── register.html         # 申請帳號表單
│   ├── hub/
│   │   └── home.html             # 首頁（訪客／已登入雙模式）
│   ├── profile/
│   │   └── dashboard.html        # 個人資料（唯讀／編輯雙模式）
│   ├── admin/
│   │   ├── user_list.html        # 會員清單（篩選 + 搜尋 + 分頁）
│   │   └── user_detail.html      # 會員明細與操作
│   └── forum/
│       ├── index.html            # 論壇主頁（左側列表 + 右側內文）
│       └── post_form.html        # 新增／修改文章與回覆的共用表單
│
├── static/
│   ├── common.css                # 共用設計 token（CSS 自訂屬性）；所有子系統的按鍵顏色變數來源
│   ├── login.css                 # auth 共用樣式（body flex 置中）；button[type="submit"] 限定在 .login-form 內
│   ├── hub.css                   # Hub 首頁專用 layout
│   ├── profile.css               # 個人資料頁專用樣式
│   ├── admin.css                 # 會員管理頁專用樣式
│   └── forum.css                 # 論壇頁面專用樣式
│
├── tests/
│   ├── conftest.py               # fixtures：app、client、authed_client、admin_client、other_client
│   ├── data/users.py             # 種子帳號常數與訊息字串
│   ├── test_auth.py
│   ├── test_hub.py
│   ├── test_profile.py
│   ├── test_admin.py
│   ├── test_forum.py
│   └── CLAUDE.md                 # 測試子系統說明
│
├── rules/
│   ├── flask-blueprint.md        # Blueprint 開發規範
│   └── database.md               # 資料層開發規範
│
├── document/
│   ├── system-spec.md            # 系統規格書（功能、資料、規則、技術債）
│   ├── build-guide.md            # 建置流程書（13 個階段與驗收方式）
│   ├── auth.md                   # 登入系統文件
│   ├── hub.md                    # 首頁系統文件
│   ├── profile.md                # 個人資料系統文件
│   ├── admin.md                  # 會員管理系統文件
│   └── forum.md                  # 論壇系統文件
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
| forum     | `GET`        | `/forum`                                | 論壇主頁；左側文章列表（分頁）+ 右側 `?master_id` 內文 |
| forum     | `GET / POST` | `/forum/new`                            | 新增文章（需登入且帳號有效）                      |
| forum     | `GET / POST` | `/forum/reply/<int:master_id>`          | 回覆文章（需登入且帳號有效）                      |
| forum     | `GET / POST` | `/forum/edit/master/<int:master_id>`    | 修改文章標題（原發文者或管理員）                  |
| forum     | `GET / POST` | `/forum/edit/detail/<int:detail_id>`    | 修改內文或回覆（原作者或管理員）                  |
| forum     | `POST`       | `/forum/delete/master/<int:master_id>`  | 刪除文章及其所有回覆（僅管理員）                  |
| forum     | `POST`       | `/forum/delete/detail/<int:detail_id>`  | 刪除單一回覆（僅管理員）                          |
| —         | `GET`        | `/health`                               | 健康檢查                                          |

共 21 條（hub 1、auth 4、profile 2、admin 6、forum 7、health 1）。

`admin` 套用 `url_prefix='/admin'`，所有路由需通過三層檢查（已登入 → 帳號可用 → 管理員）。
`forum` 套用 `url_prefix='/forum'`，主頁開放訪客瀏覽，其餘六條需通過前兩層檢查（已登入 → 帳號可用），刪除另需第三層。

---

## 測試架構

> 詳細說明見 [`tests/CLAUDE.md`](tests/CLAUDE.md)。

- **框架**：pytest + pytest-flask（Flask test client，不啟動實際伺服器）
- **DB 隔離**：每個測試函式使用 `tmp_path` 建立獨立 SQLite 暫存檔，含種子資料
- **驗證碼**：直接透過 `client.session_transaction()` 將答案寫入 session
- **測試資料**：`tests/data/users.py`，修改訊息字串時需同步更新
- **案例數**：約 112（auth 23／hub 9／profile 8／admin 約 30／forum 42）

### Fixtures（conftest.py）

| Fixture | 說明 |
|---|---|
| `app` | function scope；暫存 DB + 種子資料；`TESTING=True` |
| `client` | Flask test client（未登入） |
| `authed_client` | `session['user_id'] = 1`（user@example.com，一般使用者） |
| `admin_client` | `session['user_id'] = 2`（admin@example.com，管理員） |
| `other_client` | `session['user_id'] = 3`（disabled@example.com，停用帳號但 session 直接注入） |

> `other_client` 在本系統有三個用途：測「非本人、非管理員」的權限邊界；測「停用中的管理員」是否被第 2 層守門攔下；測持有舊 session 的停用帳號在各路由的行為（驗證 KI-03）。

### 測試原則

- 被權限擋下的 POST **必須同時斷言資料庫沒有改變**。只驗 302 無法區分「被擋下」與「執行成功後 redirect」
- `db.create_user()` 使用 bcrypt cost=10，測試中不應大量建立會員
- 論壇測試以 local fixture（`db.create_forum_master(...)`）建立資料，不動種子資料

---

## 共用模組

### `utils.py`

- `_gen_captcha()` — 產生 5 位大寫字母 + 數字字串（字元集刻意排除易混淆的 `I` `O` `0` `1`）
- `_is_usable(user)` — `user and user['is_active'] and not user['is_deleted']`
- `login_required(f)` — 無 session 則 redirect `auth.login_page`

### `db/` 套件

- `db/__init__.py` — 定義 `DB_PATH`（環境變數 `DB_PATH` 或預設 `database.db`）；匯出所有公開函式；`init_db()` 建立 `users` 表、呼叫 `_init_forum_tables()`、植入種子資料
- `db/connection.py` — `_get_conn()`：每次呼叫時讀取 `db.DB_PATH`，支援測試動態替換路徑；WAL 模式；`row_factory = sqlite3.Row`
- `db/users.py` — 使用者資料存取：`find_user_by_email` `find_user_by_id` `create_user` `update_user_profile` `update_last_login` `soft_delete_user` `list_users` `set_user_active` `set_user_role` `hard_delete_user_by_email`
- `db/forum.py` — 論壇資料存取：`list_forum_masters` `get_forum_master` `create_forum_master` `update_forum_master_title` `soft_delete_forum_master` `list_forum_details` `get_forum_detail` `create_forum_detail` `update_forum_detail_content` `soft_delete_forum_detail`

模組拆分的依據是**資料表**，不是子系統。`db/forum.py` 獨立成模組是因為 `forum` 與 `forum_details` 是新資料表；反之，會員管理的三個新函式（`list_users`、`set_user_active`、`set_user_role`）操作的仍是 `users` 表，因此併入 `db/users.py`，**不另建 `db/admin.py`**。

### 資料庫種子帳號

| email | 密碼 | 身份 |
|-------|------|------|
| user@example.com | password123 | 一般使用者（ID=1，role=1） |
| admin@example.com | admin1234 | 管理員（ID=2，role=0） |
| disabled@example.com | disabled123 | 停用帳號（ID=3，role=1，is_active=0） |

種子帳號使用 bcrypt cost=4（加速測試），註冊路徑使用 cost=10。

### 種子文章

`init_db()` 另外植入 **5 篇論壇文章**（共 8 則內文與回覆），同樣是「`forum` 表為空時才執行」。
由 `db/forum.py` 的 `_seed_forum_if_empty()` 負責，**排在 `_seed_users_if_empty()` 之後**
——文章的 `user_id` 指向種子帳號。

五篇的內容各自對應一個值得觀察的行為：無回覆的最小案例、停用帳號發表的文章（示範帳號狀態
不影響既有內容，且作者欄退回顯示 email）、一對多的問答串、以及最後有活動因此浮到列表頂端的文章。
詳見 [`db/CLAUDE.md`](db/CLAUDE.md)。

種子文章的時間戳以 `datetime('now', '-N minutes')` 明確指定——若全用預設值，同一秒內建立的
文章排序會不確定，看不出 `updated_at` 降冪排序的效果。

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
| `0` | 管理員 | 一般使用者的全部權限，加上：會員管理（檢視所有會員含已刪除、啟用／停用、調整角色、軟刪除）、修改任何人的文章標題與內容、刪除任何文章與回覆 |
| `1` | 一般使用者 | 查看與編輯自己的個人資料；發表文章與回覆；修改自己的文章標題與內容 |

論壇的權限採**三段式**：瀏覽開放給所有人（含訪客）；發表與回覆需登入且帳號有效；修改限原作者或管理員；**刪除僅限管理員**——一般使用者連自己的文章都不能刪。這個設計把「內容留存」看得比「作者自主」重要，適合教學情境的討論區。

新申請的帳號一律為 `role = 1`。系統沒有「申請成為管理員」的途徑，只能由既有管理員指定。

### 三層權限檢查（順序不可調換）

1. `@login_required` — 無 session → redirect `auth.login_page`
2. `_is_usable(user)` — 帳號停用或已刪除 → `session.clear()` + redirect `auth.login_page`
3. `_is_admin(user)` — `user['role'] != 0` → flash `無操作權限` + redirect `hub.home`

第 2 層失敗代表**身分失效**（處置是登出），第 3 層失敗代表**權限不足**（處置是導回首頁）。順序調換會讓停用中的管理員收到與事實不符的回饋。

`_is_admin(user)` 為各 Blueprint 內部 helper（**非 `utils.py`**），判斷邏輯統一為 `user['role'] == 0`。這三層在 `admin` 的每個路由開頭明碼重複寫出，**不抽象成裝飾器** —— 這個重複是刻意的教學設計，請勿重構。

`forum` 的守門依路由分級：

| 路由 | 需要的層級 |
|------|-----------|
| `GET /forum` | 無（訪客可瀏覽；`_current_user()` 回傳 `None` 時模板顯示登入連結） |
| `/forum/new`、`/forum/reply/*`、`/forum/edit/*` | 1 + 2 |
| `/forum/delete/*` | 1 + 2 + 3 |

> `forum._current_user()` **必須**做 `_is_usable` 檢查（相對於範本已修正）。否則被停用或刪除的帳號只要 session 未清，仍能發表公開內容，讓 admin 的停用功能形同虛設。

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

本系統刻意沿用參考範本的既有技術債，**不做強行強化**——這些債本身就是教材。完整清單（30 條，含影響、接受理由、修補方向與工作量）見 [`document/system-spec.md`](document/system-spec.md) 第 11 章。

修改程式碼時最需要注意的四條：

| ID | 內容 | 注意事項 |
|----|------|---------|
| **KI-03** | `POST /profile/update` **缺少 `_is_usable` 檢查** | 被停用或刪除的會員仍可修改自己資料。這與 admin 的停用功能直接衝突。**請勿「順手」補上這三行**——它是「技術債如何跨功能傳染」的核心教材 |
| **KI-07** | 驗證碼在登入成功後未 `session.pop` | 驗證碼可重放。這是修補成本最低、安全效益最高的一項 |
| **KI-23** | hub 內嵌登入是 auth 登入的完整複製 | 任何登入政策的強化都**必須兩處都改**，漏改就能從另一個入口繞過 |
| **KI-28** | 論壇內容無長度上限，且未 escape HTML 以外的任何處理 | 可寫入任意大小的內容。Jinja2 的自動跳脫已擋住 XSS，但沒有擋住資源耗用 |

> KI-03 與 forum 的守門是**刻意的不對稱**：profile 保留缺陷作為教材，forum 則修補。理由是 forum 能產生**公開內容**，缺陷的影響範圍超出當事人自己。這個判準本身要寫進規格書。

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

`static/common.css` 是全站按鍵**顏色的單一來源**（CSS 自訂屬性），`base.html` 最先載入。各子系統 CSS 使用自己的 prefixed 類別，顏色值透過 `var(--...)` 引用，**不寫死色碼**：

| CSS 檔案 | 按鍵前綴 | 適用頁面 |
|---------|---------|---------|
| `common.css` | — | 全站共用 token（無直接 class） |
| `login.css` | （無前綴）`.login-form button` | auth 登入／申請頁、hub 內嵌登入表單 |
| `hub.css` | `hub-*` | 首頁 |
| `profile.css` | `profile-*` | 個人資料頁 |
| `admin.css` | `admin-btn-*`、`admin-btn-action-*` | 會員管理所有頁面 |
| `forum.css` | `forum-btn-*`、`forum-btn-action-*` | 論壇所有頁面 |

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
> - 狀態 badge（啟用／停用／已刪除／角色）的底色硬編碼於 `admin.css`，因為 `common.css` 未定義狀態語意色（KI-19）
> - `hub.css` 的 `.hub-register-link` 與 `.hub-logout` 是按鍵卻寫死色碼（KI-31）。它們的類別名稱不含 `btn`，以「btn」為關鍵字的稽核抓不到

### 關鍵限制：`.login-form` class

`login.css` 的 `button[type="submit"]` 樣式限定在 `.login-form` 選擇器內，**不會全域污染**其他子系統。凡使用 `login.css` 登入樣式的表單，`<form>` 元素必須加上 `class="login-form"`。全系統恰有三處：

- `templates/auth/login.html`
- `templates/auth/register.html`
- `templates/hub/home.html`（內嵌登入表單）

`profile`、`admin`、`forum` 的表單**不加**此 class，否則會誤套登入頁樣式。

### `<a>` vs `<button>` 選用規則

| 元素 | 使用時機 |
|------|---------|
| `<a href="...">` | GET 導航（跳頁、返回、修改表單頁、篩選、分頁等） |
| `<button type="submit">` | POST 動作（有副作用：送出表單、啟用、停用、刪除等） |

不用 `<a href="#">` 搭配 `onclick` 來假裝按鍵——語意錯誤、鍵盤和無障礙行為不正確。

全站僅八處允許使用 inline event handler：

| 位置 | 用途 |
|------|------|
| `auth/login.html` × 2 | 驗證碼刷新（圖片本身、`↻` 按鈕）的 `onclick` |
| `hub/home.html` × 2 | 同上 |
| `forum/index.html` × 2 | 刪除文章、刪除回覆的 `onclick="return confirm(...)"` |
| `admin/user_list.html` × 1 | 刪除帳號的 `onclick="return confirm(...)"` |
| `admin/user_detail.html` × 1 | 同上（明細頁也有刪除按鈕） |

刪除確認一律寫在 `<button>` 的 `onclick` 上（對齊論壇的既有寫法），不寫在 `<form>` 的 `onsubmit` 上。

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
| [`document/build-guide.md`](document/build-guide.md) | 建置流程書：13 個階段的產出、決策與驗收指令 |
| [`document/web-system-spec.md`](document/web-system-spec.md) | 純前端版（HTML + CSS + JS）規格書：與本版的差異、sql.js 資料層、前端權限的本質限制 |
| [`document/web-build-guide.md`](document/web-build-guide.md) | 純前端版建置流程書：11 個階段 |

> 純前端版是同一組需求的平行實作，用於對照「權限為什麼一定要在伺服器端」。兩版的三張資料表 DDL 逐字相同、六個 CSS 逐字相同，資料庫檔可互換。

測試規範見 [`tests/CLAUDE.md`](tests/CLAUDE.md)。
