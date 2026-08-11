# 會員管理系統 — 系統規格書

## 0. 文件資訊

| 項目 | 內容 |
|------|------|
| 文件名稱 | 會員管理系統 系統規格書 |
| 版本 | v1.0 |
| 日期 | 2026-08-08 |
| 適用讀者 | 修習系統分析與設計課程的學生、後續維護此專案的開發者 |
| 系統版本 | 會員管理系統 v1.0 |

### 0.1 文件定位

本專案的文件分為四層，各自回答不同的問題。撰寫或閱讀時請先確認自己需要的是哪一層：

| 文件 | 回答的問題 |
|------|-----------|
| `document/system-spec.md`（本文件） | 這個系統**是什麼**：功能、資料、規則、限制 |
| `document/build-guide.md` | 這個系統**怎麼建**：從空目錄到可執行的分階段步驟與驗收方式 |
| `CLAUDE.md`、各子目錄的 `CLAUDE.md` | AI 助理與開發者**怎麼協作**：專案速查、模組職責 |
| `rules/flask-blueprint.md`、`rules/database.md` | 寫程式時**要遵守什麼**：路由、表單、SQL、CSS 的具體慣例 |
| `document/auth.md`、`hub.md`、`profile.md`、`admin.md` | 單一子系統的**細部行為**：資料流、錯誤情境、畫面欄位 |

本文件是其他文件的上位依據。當本文件與其他文件衝突時，以本文件為準，並回頭修正衝突的那一份。

---

## 1. 專案定位與範圍

### 1.1 系統目的

本系統是一套以**學習與可理解性為優先**的會員管理與討論區系統，用於系統分析與設計課程的教學。它刻意維持小規模、不做過度抽象，讓學生能夠在一到兩小時內讀完全部程式碼，並且看清楚「使用者在瀏覽器上的一個動作」是如何一路走到資料庫，再走回畫面的。

系統提供四件事：讓訪客申請帳號並登入、讓會員查看與修改自己的資料、讓管理員治理所有會員帳號、讓會員在論壇中發表文章與回覆。

前三件構成一條完整的**帳號生命週期**；第四件是刻意加入的**使用者產生內容**（user-generated content）示範，讓帳號的狀態變化（停用、刪除、角色調整）有一個可以觀察後果的場域——一個被停用的帳號能不能繼續發文，這個問題只有在有內容子系統時才問得出來。

### 1.2 範圍

**範圍內：**

- Hub 首頁（訪客瀏覽 + 內嵌登入表單；登入後的服務入口）
- 身分驗證（登入、申請帳號、登出、圖形驗證碼）
- 個人資料（本人查看與編輯姓名、顯示名稱）
- 會員管理（管理員專用：會員清單、篩選、搜尋、分頁、啟用／停用、角色調整、軟刪除）
- 論壇（瀏覽、發表文章、回覆、修改、刪除；主檔／明細兩張資料表）
- 健康檢查端點
- 上述功能的自動化測試
- Docker 容器化部署設定

**範圍外（明確不包含）：** 帳號生命週期與論壇以外的業務子系統。本系統刻意維持在讀得完的規模。

### 1.3 名詞定義

| 名詞 | 定義 |
|------|------|
| 會員（user） | `users` 表中的一筆紀錄。訪客申請帳號後即成為會員 |
| 訪客（guest） | 沒有有效 session 的瀏覽者。可瀏覽首頁與申請帳號，不能存取個人資料與會員管理 |
| 角色（role） | 整數欄位。`0` = 管理員，`1` = 一般使用者 |
| 啟用／停用（`is_active`） | `1` = 啟用，`0` = 停用。停用帳號無法登入 |
| 軟刪除（`is_deleted`） | `1` = 已刪除。系統**不執行實體 DELETE**，刪除只是把旗標設為 1。已刪除帳號無法登入，但紀錄仍在資料庫中，管理員仍可查閱 |
| 帳號可用（usable） | `utils._is_usable(user)` 的判定結果：使用者存在、`is_active` 為真、`is_deleted` 為假。三者同時成立才算可用 |
| 種子帳號（seed user） | 資料庫初次建立時自動植入的三個示範帳號，供教學與測試使用 |
| 文章（master） | `forum` 表中的一筆紀錄，只存標題與作者。內容不在這裡 |
| 內文（original post） | `forum_details` 中 `is_original_post = 1` 的那一筆，與文章同時建立 |
| 回覆（reply） | `forum_details` 中 `is_original_post = 0` 的紀錄 |
| 主檔／明細（master / detail） | 一對多的資料表配對。本系統的 `forum` 與 `forum_details` 是唯一的例子 |

---

## 2. 技術棧與執行環境

### 2.1 選型

| 層 | 技術 | 版本／說明 |
|----|------|-----------|
| 語言 | Python | 3.11 |
| Web 框架 | Flask + Blueprint | 模組化路由 |
| 樣板引擎 | Jinja2 | 伺服器端渲染（SSR） |
| 資料庫 | SQLite（`sqlite3` 標準函式庫） | WAL 模式 |
| 密碼雜湊 | bcrypt | 註冊 cost=10，種子帳號 cost=4 |
| 圖形驗證碼 | captcha（`ImageCaptcha`） | 伺服器端產生 PNG |
| 測試 | pytest + pytest-flask | Flask test client，不啟動實際伺服器 |
| 部署 | Docker + Docker Compose | port 4000，named volume 持久化 |

`requirements.txt` 僅五個套件：`flask`、`bcrypt`、`captcha`、`pytest`、`pytest-flask`。

### 2.2 刻意不採用的技術

這一節是教學重點。以下三項在真實專案中通常是標準配備，本系統刻意不用：

**不用 ORM（如 SQLAlchemy）。** 所有資料存取都是手寫的參數化 SQL，集中在 `db/` 套件內。理由是讓學生直接看到 SQL 語句本身，理解「一次查詢對應一次資料庫往返」，而不是被 ORM 的延遲載入與 session 生命週期擋在中間。代價是重複的 `_get_conn()` / `close()` 樣板，這個代價記錄於 KI-10。

**不用前端框架（如 React、Vue）。** 全部採伺服器端渲染，瀏覽器收到的就是完成的 HTML。理由是讓「表單送出 → 路由處理 → 重新渲染」這條迴圈完整可見，不需要理解前後端分離與 API 契約。全站只有八處使用 JavaScript：驗證碼刷新的四個 `onclick`（`auth/login.html` 與 `hub/home.html` 各兩個——圖片本身與旁邊的 `↻` 按鈕），以及刪除確認的四個 `onclick="return confirm(...)"`（論壇的文章與回覆、會員管理的清單頁與明細頁）。

**不用 Flask-Login。** 身分狀態就是 `session['user_id']` 一個整數，登入即寫入、登出即 `session.clear()`。權限檢查是 `utils.login_required` 這個 12 行的裝飾器加上兩個 helper 函式。理由是讓學生能夠讀完整個身分驗證機制，而不是信任一個黑盒子。代價是缺少 session fixation 防護等成熟機制，記錄於 KI-15。

### 2.3 執行方式

**方式 A：本機 conda 環境**

```bash
conda activate flask
pip install -r requirements.txt
python app.py                   # http://localhost:4000
rm database.db && python app.py # 重置資料庫
```

**方式 B：Docker**

```bash
docker compose up -d --build    # 建置並啟動
docker compose logs -f          # 查看即時 log
docker compose down             # 停止
docker compose down -v          # 停止並刪除資料（重置 DB）
```

### 2.4 環境變數

| 變數 | 預設值 | 說明 |
|------|--------|------|
| `SECRET_KEY` | `dev-secret-key-change-in-production` | Flask session 簽章金鑰。**生產環境務必替換**，見 KI-05 |
| `DB_PATH` | `database.db` | SQLite 檔案路徑。Docker 中設為 `/app/data/database.db`；測試時由 `conftest.py` 動態替換為 `tmp_path` 下的暫存檔 |

---

## 3. 系統架構

### 3.1 分層

```text
瀏覽器
  │  HTTP request（含 session cookie）
  ▼
app.py                       建立 Flask app、註冊 4 個 Blueprint、設定 secret_key
  │
  ▼
blueprints/<name>/__init__.py  路由、表單處理、權限檢查、業務規則
  │                            （不寫任何 SQL）
  ├──▶ utils.py               跨子系統共用：login_required、_is_usable、_gen_captcha
  │
  ▼
db/                          資料存取層。所有 SQL 集中於此
  │  db/__init__.py           DB_PATH、公開函式匯出、init_db()
  │  db/connection.py         _get_conn()
  │  db/users.py              users 表的所有存取函式
  │  db/forum.py              forum 與 forum_details 兩表的所有存取函式
  ▼
SQLite（database.db，WAL 模式）
```

回傳路徑：Blueprint 取得資料後呼叫 `render_template()`，Jinja2 以 `templates/<blueprint>/*.html` 渲染出完整 HTML 回傳瀏覽器。

### 3.2 模組邊界三原則

1. **SQL 只寫在 `db/` 套件內。** Blueprint 一律透過 `db.<函式名>()` 存取資料，不得出現 `sqlite3` 或 SQL 字串
2. **Blueprint 不互相 import。** 子系統之間只透過 `url_for('<blueprint>.<endpoint>')` 建立關聯
3. **`utils.py` 只放與任何子系統都無關的 helper。** 特別是 `_is_admin()` **不得**放進 `utils.py`（見 `rules/flask-blueprint.md`），各 Blueprint 自行定義

### 3.3 目錄結構

```text
SAD-Forum/
├── app.py                        # 主程式：組裝 Blueprint、啟動伺服器
├── utils.py                      # 跨 Blueprint 共用 helpers
├── requirements.txt
├── Dockerfile
├── docker-compose.yml
├── .dockerignore
├── database.db                   # SQLite（git 忽略，自動建立）
│
├── db/
│   ├── __init__.py               # DB_PATH；匯出公開函式；init_db()
│   ├── connection.py             # _get_conn()
│   ├── users.py                  # users 表的資料存取
│   ├── forum.py                  # forum 與 forum_details 兩表的資料存取
│   └── CLAUDE.md
│
├── blueprints/
│   ├── __init__.py
│   ├── auth/                     # /login /register /logout /captcha.png
│   ├── hub/                      # /
│   ├── profile/                  # /profile /profile/update
│   ├── admin/                    # /admin/users ...
│   └── forum/                    # /forum ...（每個目錄含 __init__.py 與 CLAUDE.md）
│
├── templates/
│   ├── base.html
│   ├── auth/{login,register}.html
│   ├── hub/home.html
│   ├── profile/dashboard.html
│   ├── admin/{user_list,user_detail}.html
│   └── forum/{index,post_form}.html
│
├── static/
│   ├── common.css                # 全站設計 token（顏色變數的單一來源）
│   ├── login.css                 # auth 與 hub 內嵌登入表單
│   ├── hub.css                   # 首頁 layout
│   ├── profile.css               # 個人資料頁
│   ├── admin.css                 # 會員管理頁
│   └── forum.css                 # 論壇頁
│
├── tests/
│   ├── conftest.py               # fixtures
│   ├── data/users.py             # 種子帳號常數與訊息字串
│   ├── test_auth.py
│   ├── test_hub.py
│   ├── test_profile.py
│   ├── test_admin.py
│   ├── test_forum.py
│   └── CLAUDE.md
│
├── rules/
│   ├── flask-blueprint.md
│   └── database.md
│
├── document/
│   ├── system-spec.md            # 本文件
│   ├── build-guide.md
│   ├── auth.md
│   ├── hub.md
│   ├── profile.md
│   ├── admin.md
│   └── forum.md
```

### 3.4 Blueprint 職責

| Blueprint | 前綴 | 職責 | 守門層級 |
|-----------|------|------|---------|
| `auth` | 無 | 登入、申請帳號、登出、圖形驗證碼 | 無（本身就是入口）；已登入者存取 `/login`、`/register` 會被導回首頁 |
| `hub` | 無 | 服務入口。訪客可瀏覽並內嵌登入；登入後顯示服務卡片 | 無（雙模式） |
| `profile` | 無 | 本人查看與編輯自己的資料 | `@login_required` + `_is_usable`（`GET` 有、`POST` 無，見 KI-03） |
| `admin` | `/admin` | 管理員治理所有會員帳號 | `@login_required` + `_is_usable` + `_is_admin`，每條路由皆是 |
| `forum` | `/forum` | 討論區：瀏覽、發文、回覆、修改、刪除 | 依路由分級：主頁無守門；寫入類 `@login_required` + `_is_usable`；刪除另加 `_is_admin` |

### 3.5 請求生命週期與 session

系統的 session 中只會出現兩個 key：

| Key | 寫入時機 | 讀取時機 | 清除時機 |
|-----|---------|---------|---------|
| `captcha` | `GET /captcha.png` 每次產生新圖時 | `POST /login`、`POST /`（hub 內嵌登入）比對答案 | **從不主動清除**，只會被下一次 `GET /captcha.png` 覆寫（見 KI-07） |
| `user_id` | 登入成功時 | 幾乎每個路由 | 登出時 `session.clear()`；發現帳號不可用時 `session.clear()` |

一次典型的登入請求：

```text
GET /login
  -> 渲染 login.html，其中的 <img src="/captcha.png"> 觸發第二個請求
GET /captcha.png
  -> _gen_captcha() 產生 5 位字串 -> session['captcha'] = 該字串 -> 回傳 PNG
POST /login（email、password、captcha）
  -> 依序驗證（見 §9.2）
  -> 通過 -> db.update_last_login(id) -> session['user_id'] = id
  -> redirect '/'
```

---

## 4. 角色與權限

### 4.1 角色

| `role` | 身分 | 權限 |
|--------|------|------|
| `0` | 管理員 | 一般使用者的全部權限，加上會員管理（清單、啟用／停用、角色調整、軟刪除），以及修改任何人的文章與回覆、刪除任何文章與回覆 |
| `1` | 一般使用者 | 查看與編輯自己的個人資料；發表文章與回覆；修改自己的文章標題與內容 |

新申請的帳號一律為 `role = 1`（DDL 的 `DEFAULT 1`）。系統**沒有提供「申請成為管理員」的途徑**，管理員只能由既有管理員透過會員管理指定。

### 4.2 帳號狀態矩陣

`is_active` 與 `is_deleted` 兩個旗標組合出四種狀態：

| `is_active` | `is_deleted` | 狀態名稱 | 可否登入 | `_is_usable` | 管理員清單中 | 可執行的管理動作 |
|:---:|:---:|------|:---:|:---:|------|------|
| 1 | 0 | 正常 | 可以 | 真 | `active` 與 `all` 篩選 | 停用、調整角色、刪除 |
| 0 | 0 | 停用 | 否，回覆「帳號已停用」 | 假 | `disabled` 與 `all` 篩選 | 啟用、調整角色、刪除 |
| 1 | 1 | 已刪除 | 否，回覆「帳號或密碼錯誤」 | 假 | `deleted` 與 `all` 篩選 | **無**（軟刪除視為終態） |
| 0 | 1 | 已刪除 | 否，回覆「帳號或密碼錯誤」 | 假 | `deleted` 與 `all` 篩選 | **無** |

**帳號狀態對既有論壇內容的影響：零。** 停用或刪除一個帳號**不會**連帶隱藏或刪除他發過的文章與回覆——`forum` 與 `forum_details` 各自有獨立的 `is_deleted` 旗標，`users` 的狀態不會傳導過去。文章列表以 `LEFT JOIN users` 取作者顯示名稱，即使該帳號已被刪除，內容仍然照常顯示。

這是刻意的：討論的脈絡屬於整個討論區，不屬於單一作者。若要「刪帳號連帶刪內容」，那是另一條需求（見 §13），且會引出「其他人的回覆怎麼辦」這個更難的問題。

兩個設計細節值得注意：

- 「停用」與「已刪除」的登入錯誤訊息**刻意不同**。停用是可回復的行政狀態，明確告知使用者去聯絡管理員是合理的；已刪除則與「帳號不存在」共用同一訊息，避免洩漏「這個 email 曾經註冊過」
- 軟刪除是**終態**。系統不提供還原功能（見 KI-11），因此對已刪除帳號的啟用、停用、角色調整一律拒絕，避免產生「已刪除但被啟用」這種語意不明的狀態

### 4.3 權限矩陣

| 功能 | 訪客 | 一般使用者 | 管理員 | 停用／已刪除但持有舊 session |
|------|:---:|:---:|:---:|:---:|
| `GET /` 首頁 | 可（訪客視圖） | 可 | 可 | 可，但 session 被清除，退回訪客視圖 |
| `POST /` 內嵌登入 | 可 | 已登入時不處理 | 已登入時不處理 | 同訪客 |
| `GET/POST /login`、`/register` | 可 | 導回首頁 | 導回首頁 | 可 |
| `GET /captcha.png` | 可 | 可 | 可 | 可 |
| `GET /logout` | 可（無效果） | 可 | 可 | 可 |
| `GET /profile` | 導向 `/login` | 可 | 可 | 清除 session，導向 `/login` |
| `POST /profile/update` | 導向 `/login` | 可 | 可 | **可（KI-03，本版刻意保留的缺陷）** |
| `GET /admin/users`、`/admin/users/<id>` | 導向 `/login` | 導回首頁，訊息「無操作權限」 | 可 | 清除 session，導向 `/login` |
| `POST /admin/users/<id>/*` | 導向 `/login` | 導回首頁，訊息「無操作權限」 | 可 | 清除 session，導向 `/login` |
| `GET /forum` 瀏覽 | **可** | 可 | 可 | 可，但以訪客身分顯示 |
| `GET/POST /forum/new`、`/forum/reply/<id>` | 導向 `/login` | 可 | 可 | 清除 session，導向 `/login` |
| `GET/POST /forum/edit/master/<id>` | 導向 `/login` | 僅限自己的文章 | 任何文章 | 清除 session，導向 `/login` |
| `GET/POST /forum/edit/detail/<id>` | 導向 `/login` | 僅限自己的內文或回覆 | 任何內容 | 清除 session，導向 `/login` |
| `POST /forum/delete/master/<id>`、`/forum/delete/detail/<id>` | 導向 `/login` | 拒絕，訊息「無權限刪除文章／回覆」 | 可 | 清除 session，導向 `/login` |
| `GET /health` | 可 | 可 | 可 | 可 |

論壇是全系統唯一**開放訪客讀取**的內容區。`GET /forum` 沒有任何守門，`_current_user()` 回傳 `None` 時模板改顯示「登入」連結，並隱藏所有寫入類的按鈕。

### 4.4 三層檢查機制

權限檢查分三層，**順序固定不可調換**：

| 層 | 檢查 | 實作 | 失敗處置 |
|---|------|------|---------|
| 1 | 是否登入 | `@login_required`（`utils.py`）：`'user_id' not in session` | `redirect(url_for('auth.login_page'))` |
| 2 | 帳號是否可用 | `_is_usable(user)`（`utils.py`） | `session.clear()` 後 `redirect(url_for('auth.login_page'))` |
| 3 | 是否為管理員 | `_is_admin(user)`：`user['role'] == 0`，各 Blueprint 內部定義 | `flash('無操作權限', 'error')` 後 `redirect(url_for('hub.home'))` |

順序不可調換的理由：第 2 層失敗代表**身分本身失效**，處置是清除 session 並要求重新登入；第 3 層失敗代表**身分有效但權限不足**，處置是導回首頁並告知原因。若把第 3 層放前面，一個已被停用的管理員會收到「權限不足」這種與事實不符的回饋，而且 session 不會被清除。

在 `admin` Blueprint 中，這三層以四行明碼寫在**每一個**路由的開頭，不抽象成裝飾器：

```python
user = _current_user()
if not _is_usable(user):
    session.clear()
    return redirect(url_for('auth.login_page'))
if not _is_admin(user):
    flash('無操作權限', 'error')
    return redirect(url_for('hub.home'))
```

這個重複是**刻意的**。在教學語境下，讀者從任一路由的第一行就能讀出完整的守門條件，不需要跳到別處查裝飾器的定義。`blueprints/admin/CLAUDE.md` 必須註明此決策，避免後續維護者「好心」重構掉。

在 `forum` Blueprint 中，第 1、2 層被收斂進 `_current_user()`：

```python
def _current_user():
    """從 session 取得目前登入且帳號有效的使用者，否則回傳 None。"""
    if 'user_id' not in session:
        return None
    user = db.find_user_by_id(session['user_id'])
    return user if _is_usable(user) else None
```

論壇之所以能這樣收斂而 admin 不行，是因為兩者對「查不到有效使用者」的處置不同。論壇主頁必須把 `None` 當成合法的訪客狀態繼續渲染，因此不能在 helper 裡直接 redirect；admin 則是任何一層失敗都要中斷請求，處置各不相同，收斂進 helper 反而會遮蔽差異。

### 4.5 自我保護規則與「最後一個管理員」

管理員對**自己**的帳號受三條規則限制：

| 規則 | 適用路由 | 條件 | 訊息 |
|------|---------|------|------|
| R1 不可停用自己 | `deactivate_user` | `user_id == user['id']` | `不可停用自己的帳號` |
| R2 不可刪除自己 | `delete_user` | `user_id == user['id']` | `不可刪除自己的帳號` |
| R3 不可修改自己的角色 | `update_role` | `user_id == user['id']` | `不可修改自己的角色` |

`activate_user` 對自己不設限。理由是它無害且冪等：能執行到這行的管理員必然已經通過 `_is_usable`，也就是已經是啟用狀態，對自己啟用等同無操作。

**「最後一個管理員被鎖死」的可達性論證：**

> 令執行操作的管理員為 A。
>
> 要進入任何一個 `admin` 路由，A 必須先通過 `_is_usable(A)`（即 `is_active = 1` 且 `is_deleted = 0`）與 `_is_admin(A)`（即 `role = 0`）。
>
> 由 R1、R2、R3，A 無法對自己執行停用、刪除或降級。因此任何一次管理動作完成之後，A 仍然是一個「啟用、未刪除、`role = 0`」的帳號。
>
> ∴ 系統中永遠至少存在一個可用的管理員。「所有管理員都被停用或刪除，導致無人能進入管理介面」這個狀態**不可達**。

因此本系統**不實作** `count_active_admins()` 這類計數檢查，符合「避免過度抽象」的開發原則。

> ⚠️ **警語**：上述保證完全依賴 R1、R2、R3 三條規則**同時成立**。若未來放寬任何一條（例如允許管理員自行降級為一般使用者），必須立即補上「操作完成後啟用中的管理員數 ≥ 1」的計數檢查，否則系統可被鎖死，且沒有從介面上復原的途徑。

---

## 5. 功能需求

每條需求的格式為：ID／名稱／觸發者／前置條件／主要流程／例外流程／後置條件。

### 5.1 首頁（FR-HUB）

**FR-HUB-01 訪客瀏覽首頁**
觸發者：訪客。前置條件：無。
主要流程：`GET /` → 系統偵測無 `session['user_id']` → 渲染訪客視圖（歡迎訊息、鎖定狀態的服務卡片、右側內嵌登入表單、右上角「申請帳號」連結）。
例外流程：無。後置條件：無狀態改變。

**FR-HUB-02 會員瀏覽首頁**
觸發者：已登入會員。前置條件：持有有效 session。
主要流程：`GET /` → `db.find_user_by_id()` 取得會員 → `_is_usable` 通過 → 渲染已登入視圖（歡迎回來 + 姓名、「個人資料」卡片、右上角登出）。角色為管理員時**額外顯示「會員管理」卡片**。
例外流程：`_is_usable` 為假 → `session.clear()`，`user` 設為 `None`，**不 redirect**，直接渲染訪客視圖。
後置條件：帳號失效時 session 被清空。

**FR-HUB-03 首頁內嵌登入**
觸發者：訪客。前置條件：已取得驗證碼圖片。
主要流程：`POST /`（email、password、captcha）→ 依 §9.2 的順序驗證 → 通過 → `db.update_last_login()` → 寫入 `session['user_id']` → `redirect('/')`。
例外流程：任一驗證失敗 → 不 redirect，直接重新渲染訪客視圖，錯誤訊息透過 `error` 變數傳入（**不使用 flash**，見 §9.6）。
後置條件：成功時建立 session。

**FR-HUB-04 已登入者送出內嵌登入表單**
觸發者：已登入會員。
主要流程：`POST /` 時 `user` 不為 `None`，系統**跳過整段登入處理**，直接渲染已登入視圖。
後置條件：無狀態改變。

### 5.2 身分驗證（FR-AUTH）

**FR-AUTH-01 顯示登入頁**
觸發者：訪客。主要流程：`GET /login` → 渲染 `auth/login.html`，含 email、password、驗證碼欄位與驗證碼圖片。若上一個請求是註冊成功，頁面頂端顯示 flash 訊息「申請成功，請登入」。
例外流程：已登入 → `redirect(url_for('hub.home'))`。

**FR-AUTH-02 登入**
觸發者：訪客。前置條件：已取得驗證碼。
主要流程：`POST /login` → 依 §9.2 驗證 → `db.update_last_login()` → `session['user_id']` → `redirect('/')`。
例外流程：任一驗證失敗 → 重新渲染 `login.html`，錯誤訊息透過 `error` 變數傳入。
後置條件：成功時建立 session，並更新該會員的 `last_login_at`。

**FR-AUTH-03 申請帳號**
觸發者：訪客。前置條件：無（**註冊不需要驗證碼**）。
主要流程：`POST /register`（email、password、confirm_password、name、display_name）→ 依 §9.3 驗證 → `db.create_user()`（bcrypt cost=10）→ `flash('申請成功，請登入', 'success')` → `redirect(url_for('auth.login_page'))`。
例外流程：驗證失敗或 email 重複（`sqlite3.IntegrityError`）→ 重新渲染 `register.html`，並以 `form_data` 回填 email、name、display_name（**password 不回填**）。
後置條件：成功時 `users` 表新增一筆 `role = 1`、`is_active = 1`、`is_deleted = 0` 的紀錄。
例外流程（已登入）：`redirect(url_for('hub.home'))`。

**FR-AUTH-04 取得驗證碼圖片**
觸發者：任何人。
主要流程：`GET /captcha.png` → `_gen_captcha()` 產生 5 位字串（字元集 `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`，刻意排除易混淆的 `I`、`O`、`0`、`1`）→ 寫入 `session['captcha']` → `ImageCaptcha(160×50)` 產生 PNG → `send_file(mimetype='image/png')`。
後置條件：session 中的驗證碼答案被覆寫。

**FR-AUTH-05 登出**
觸發者：任何人。
主要流程：`GET /logout` → `session.clear()` → `redirect(url_for('auth.login_page'))`。
後置條件：session 全部清空（含 `captcha`）。
> 此路由使用 `GET` 卻有副作用，違反「有副作用的動作一律用 POST」的專案慣例，記錄於 KI-14。

### 5.3 個人資料（FR-PROFILE）

**FR-PROFILE-01 查看個人資料**
觸發者：已登入會員。前置條件：持有有效 session。
主要流程：`GET /profile` → `@login_required` 通過 → `db.find_user_by_id()` → `_is_usable` 通過 → `edit_mode = False` → 渲染唯讀檢視（email、姓名、顯示名稱、角色、建立時間、最後登入時間；空值顯示 `—`）。
例外流程：未登入 → `redirect('/login')`；`_is_usable` 為假 → `session.clear()` + `redirect('/login')`。

**FR-PROFILE-02 進入編輯模式**
主要流程：`GET /profile?edit=1` → `edit_mode = True` → 姓名與顯示名稱改為 `<input>`，整頁包在 `<form method="POST" action="/profile/update">` 中，顯示「儲存」與「放棄」。
其餘欄位（email、角色、建立時間、最後登入時間）維持唯讀。

**FR-PROFILE-03 更新個人資料**
觸發者：已登入會員。
主要流程：`POST /profile/update` → `@login_required` 通過 → 讀取 `name`、`display_name`，`.strip()` 後空字串轉 `None` → `db.update_user_profile()` → `redirect(url_for('profile.dashboard'))`。
後置條件：`users` 表的 `name`、`display_name` 被更新。使用者可以把兩個欄位清空，資料庫中儲存為 `NULL`。
> **本路由沒有 `_is_usable` 檢查**。這代表一個已被管理員停用或刪除的會員，只要瀏覽器中的 session cookie 還在，仍然可以成功修改自己的資料。此行為與 FR-ADMIN-03（停用帳號）、FR-ADMIN-05（刪除帳號）的預期效果衝突，是本版刻意保留的技術債，詳見 KI-03。
> 此外，本路由對輸入沒有任何長度或內容驗證，成功後也沒有 flash 回饋（KI-04）。

### 5.4 會員管理（FR-ADMIN）

以下所有需求的前置條件皆為：已登入、帳號可用、`role = 0`。三層檢查任一失敗的處置見 §4.4。

**FR-ADMIN-01 檢視會員清單**
主要流程：`GET /admin/users` → 三層檢查通過 → 讀取 query string `status`（預設 `all`）、`q`、`page`（預設 1）→ `db.list_users(page, _PAGE_SIZE, status, keyword)` 取得 `(rows, total)` → 渲染表格與分頁列。
例外流程：`page` 超出範圍 → 回傳空清單，不報錯（KI-17）。
後置條件：無狀態改變。

**FR-ADMIN-02 檢視會員明細**
主要流程：`GET /admin/users/<user_id>` → 三層檢查通過 → `db.find_user_by_id(user_id)` → 渲染完整欄位與操作區。
例外流程：查無此人 → `flash('找不到該使用者', 'error')` + `redirect(url_for('admin.user_list'))`。

**FR-ADMIN-03 停用會員**
主要流程：`POST /admin/users/<user_id>/deactivate` → 三層檢查 → 目標存在 → 目標非自己（R1）→ 目標未被軟刪除 → `db.set_user_active(user_id, 0)` → `flash('帳號已停用', 'success')` → `redirect(url_for('admin.user_list'))`。
例外流程：查無此人 → `找不到該使用者`；目標是自己 → `不可停用自己的帳號`；目標已刪除 → `該帳號已刪除，無法操作`。三者皆為 `error` 分類並導回清單。
後置條件：目標的 `is_active` 設為 0，其後無法登入。
> 但目標若持有未過期的 session，仍可存取 `POST /profile/update`（KI-03）。

**FR-ADMIN-04 啟用會員**
主要流程：`POST /admin/users/<user_id>/activate` → 三層檢查 → 目標存在 → 目標未被軟刪除 → `db.set_user_active(user_id, 1)` → `flash('帳號已啟用', 'success')` → redirect。
例外流程：查無此人、目標已刪除。**不檢查是否為自己**（見 §4.5）。
後置條件：目標的 `is_active` 設為 1。對已啟用的帳號重複執行是冪等的，仍回傳成功訊息。

**FR-ADMIN-05 軟刪除會員**
主要流程：`POST /admin/users/<user_id>/delete` → 三層檢查 → 目標存在 → 目標非自己（R2）→ 目標未被軟刪除 → `db.soft_delete_user(user_id)` → `flash('帳號已刪除', 'success')` → redirect。
前端在按鈕上加 `onsubmit="return confirm(...)"` 作為誤觸防護。
例外流程：查無此人、目標是自己（`不可刪除自己的帳號`）、目標已刪除（`該帳號已刪除，無法操作`）。
後置條件：目標的 `is_deleted` 設為 1。紀錄仍在資料庫中，可在 `deleted` 篩選下查閱，但**無法還原**（KI-11）。

**FR-ADMIN-06 調整會員角色**
主要流程：`POST /admin/users/<user_id>/role`（表單欄位 `role`）→ 三層檢查 → 目標存在 → 目標非自己（R3）→ 目標未被軟刪除 → `role` 值為 `'0'` 或 `'1'` → `db.set_user_role(user_id, int(role))` → `flash('角色已更新', 'success')` → redirect。
例外流程：查無此人、目標是自己（`不可修改自己的角色`）、目標已刪除、`role` 值不合法或缺漏（`角色值不正確`）。
後置條件：目標的 `role` 被更新。

**FR-ADMIN-07 篩選與搜尋會員**
主要流程：清單頁提供四個狀態連結（全部／啟用中／已停用／已刪除，對應 `?status=all|active|disabled|deleted`）與一個搜尋表單（`<form method="get">`，欄位 `q`）。搜尋比對 email、姓名、顯示名稱三個欄位的部分字串。狀態、關鍵字、頁碼三者可組合。
例外流程：無符合結果 → 表格區顯示「查無資料」。
> 搜尋關鍵字未 escape SQL `LIKE` 的萬用字元 `%` 與 `_`（KI-20）。參數化查詢已防止 SQL injection，此項僅影響搜尋語意。

### 5.5 論壇（FR-FORUM）

論壇的守門依路由分級，各需求的前置條件分別標註。`_PAGE_SIZE = 10`。

**FR-FORUM-01 瀏覽論壇**
觸發者：任何人，含訪客。前置條件：無。
主要流程：`GET /forum` → 讀取 `?page`（預設 1）與 `?master_id` → `db.list_forum_masters(page, 10)` 取得 `(masters, total)` → 若 `master_id` 存在且該文章未被刪除，另以 `db.list_forum_details(master_id)` 取得內文與回覆 → 渲染左右兩欄版面。
例外流程：`master_id` 指向不存在或已刪除的文章 → **不報錯**，右欄顯示空白提示，左欄照常顯示列表。
後置條件：無狀態改變。
> 文章列表依 `updated_at` **降冪**排序，因此有新回覆的文章會浮到最上面——`create_forum_detail()` 會同步更新主檔的 `updated_at`。內文與回覆則依 `created_at` **降冪**排序，最新的回覆在最上面。

**FR-FORUM-02 發表文章**
觸發者：已登入且帳號有效的會員。
主要流程：`GET /forum/new` 顯示表單（標題 + 內容兩欄）→ `POST` → 標題與內容皆 `.strip()` 後不可為空 → `db.create_forum_master(title, content, user_id)` **在單一 transaction 中同時寫入 `forum` 與 `forum_details`**，後者 `is_original_post = 1` → 回傳 `master_id` → `redirect(url_for('forum.index', master_id=master_id))`。
例外流程：標題為空 → `請輸入文章標題`；內容為空 → `請輸入文章內容`。兩者皆透過 `error` 變數重新渲染表單，並以 `form_data` 回填。
後置條件：`forum` 新增一筆，`forum_details` 新增一筆。**兩者必須同時成功或同時失敗**——一篇沒有內文的文章是無效狀態。

**FR-FORUM-03 回覆文章**
觸發者：已登入且帳號有效的會員。
主要流程：`GET /forum/reply/<master_id>` → 目標文章存在且未刪除 → 顯示表單（僅內容欄，標題列出原文標題）→ `POST` → 內容不可為空 → `db.create_forum_detail(master_id, content, user_id)`，**在單一 transaction 中寫入回覆並更新主檔的 `updated_at`** → redirect 回該文章。
例外流程：文章不存在或已刪除 → flash `文章不存在或已刪除` + redirect 論壇主頁；內容為空 → `請輸入文章內容`。
後置條件：`forum_details` 新增一筆 `is_original_post = 0` 的紀錄；該文章浮到列表最上面。

**FR-FORUM-04 修改文章標題**
觸發者：原發文者或管理員。
主要流程：`GET /forum/edit/master/<master_id>` → 文章存在且未刪除 → 權限檢查 → 表單以現有標題預填 → `POST` → 標題不可為空 → `db.update_forum_master_title()` 同時更新 `updated_at` → redirect 回該文章。
例外流程：文章不存在或已刪除 → flash `文章不存在或已刪除` + redirect 主頁；非原發文者且非管理員 → flash `無權限修改此文章標題` + redirect 回該文章；標題為空 → `請輸入文章標題`。
後置條件：標題與 `updated_at` 被更新，文章浮到列表最上面。

**FR-FORUM-05 修改內文或回覆**
觸發者：原作者或管理員。
主要流程：`GET /forum/edit/detail/<detail_id>` → 該筆存在且未刪除 → 權限檢查 → 表單以現有內容預填 → `POST` → 內容不可為空 → `db.update_forum_detail_content()` → redirect 回所屬文章。
例外流程：不存在或已刪除 → flash `內文不存在或已刪除` + redirect 主頁；非原作者且非管理員 → flash `無權限修改此內容` + redirect 回該文章；內容為空 → `請輸入文章內容`。
後置條件：只更新 `forum_details.updated_at`，**不動主檔的 `updated_at`**——編輯舊內容不應該讓文章浮上來。

**FR-FORUM-06 刪除文章**
觸發者：**僅管理員**。原發文者不能刪除自己的文章。
主要流程：`POST /forum/delete/master/<master_id>` → 文章存在且未刪除 → `_is_admin` 通過 → `db.soft_delete_forum_master()` **在單一 transaction 中把主檔與其所有明細的 `is_deleted` 一併設為 1** → flash `文章已刪除` + redirect 論壇主頁。
前端在按鈕上加 `onclick="return confirm('確定刪除此文章及所有回覆？')"`。
例外流程：文章不存在或已刪除 → flash `文章不存在或已刪除` + redirect 主頁；非管理員 → flash `無權限刪除文章` + redirect 回該文章。
後置條件：文章與所有回覆一併從列表消失。**級聯是在 application 層做的**，不是資料庫的 `ON DELETE CASCADE`——本系統沒有外鍵。

**FR-FORUM-07 刪除回覆**
觸發者：**僅管理員**。
主要流程：`POST /forum/delete/detail/<detail_id>` → 該筆存在且未刪除 → `_is_admin` 通過 → `db.soft_delete_forum_detail()` → flash `回覆已刪除` + redirect 回所屬文章。
例外流程：不存在或已刪除 → flash `回覆不存在或已刪除` + redirect 主頁；非管理員 → flash `無權限刪除回覆` + redirect 回該文章。
後置條件：該筆從內文列表消失。
> **注意**：這條路由不區分「內文」與「回覆」。管理員可以刪掉 `is_original_post = 1` 的那一筆，結果是一篇有標題、有回覆、但沒有內文的文章。系統不阻止這件事，也不會因此把整篇文章一併刪除。記錄為 KI-30。

**為何刪除限管理員：** 論壇的權限模型在「修改」與「刪除」之間刻意畫了一條線——原作者可以修改自己的內容，但不能刪除。理由是討論的脈絡屬於整個討論區：若原發文者能刪文，跟在後面的所有回覆都會一併消失（見 FR-FORUM-06 的級聯行為），等於一個人的決定抹掉了其他人的貢獻。把刪除權收攏到管理員，是把這個取捨交給有全局視角的角色。

---

## 6. 資料模型

### 6.1 概觀

本系統有**三張資料表**：

```text
users                    forum                      forum_details
─────                    ─────                      ─────────────
id  ◄──────┐             id  ◄──────────────┐       id
email      │             title              └────── master_id
hash       ├──────────── user_id                    content
role       │             created_at                 is_original_post
name       │             updated_at         ┌────── user_id
…          └──────────────────────────────  ┘       created_at
is_active                is_deleted                 updated_at
is_deleted                                          is_deleted
```

關聯有三條：`forum.user_id` → `users.id`（發文者）、`forum_details.user_id` → `users.id`（作者）、`forum_details.master_id` → `forum.id`（所屬文章）。

**但這三條關聯在資料庫層完全不存在。** 全專案沒有任何 `FOREIGN KEY` 宣告，SQLite 的 `PRAGMA foreign_keys` 也未開啟。所有關聯都靠 application 層在查詢時 `LEFT JOIN` 或在程式中比對。這帶來三個具體後果，都應該讓學生親眼確認：

1. 可以寫入一筆 `user_id = 999`（不存在的使用者）的文章，資料庫不會拒絕
2. 刪除一個使用者不會連動他的文章——這正是 §4.2 描述的行為
3. 刪除一篇文章不會自動刪除它的回覆，級聯必須由 `soft_delete_forum_master()` **在程式中明寫**

第 3 點特別值得注意：`db/forum.py` 的 `soft_delete_forum_master()` 用 `with conn:` 把主檔與明細的兩個 UPDATE 包在同一個 transaction 裡。這是本系統唯一真正需要 transaction 的場景族群（另兩個是 `create_forum_master` 與 `create_forum_detail`），也是 `rules/database.md` 那條 transaction 規範存在的理由。

記錄為 KI-09。

### 6.1.1 為何論壇要拆成兩張表

一張表也能存文章與回覆（加一個 `parent_id` 欄位自我關聯即可），但本系統採主檔／明細拆分，理由有三：

| 理由 | 說明 |
|------|------|
| 欄位語意不同 | 標題屬於「一篇文章」，內容屬於「一則發言」。硬塞進同一張表，回覆那些列的 `title` 只能是 `NULL` |
| 列表查詢不必碰內容 | `list_forum_masters()` 只讀主檔，不需要掃描動輒數千字的 `content` 欄位 |
| 這是 SAD 課程的核心樣式 | 訂單／訂單明細、活動／報名、文章／回覆是同一個結構。學會一次就能遷移 |

代價是新增文章與刪除文章都必須跨兩張表，因此必須用 transaction。這個代價正是教學重點。

### 6.2 `users` 表 DDL

以下為 `db/__init__.py` 中 `init_db()` 執行的完整建表語句：

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

### 6.3 欄位字典

| 欄位 | 型別 | 可為 NULL | 預設 | 語意 | 由誰寫入 |
|------|------|:---:|------|------|---------|
| `id` | INTEGER | 否 | AUTOINCREMENT | 主鍵 | SQLite |
| `email` | TEXT | 否 | 無 | 登入帳號，UNIQUE | `create_user()` |
| `hash` | TEXT | 否 | 無 | bcrypt 密碼雜湊 | `create_user()`（cost=10）、`_seed_users_if_empty()`（cost=4） |
| `role` | INTEGER | 否 | `1` | `0` 管理員 / `1` 一般使用者 | `_seed_users_if_empty()`、`set_user_role()` |
| `name` | TEXT | 是 | NULL | 姓名 | `create_user()`、`update_user_profile()` |
| `display_name` | TEXT | 是 | NULL | 顯示名稱 | `create_user()`、`update_user_profile()` |
| `is_active` | INTEGER | 否 | `1` | `1` 啟用 / `0` 停用 | `_seed_users_if_empty()`、`set_user_active()` |
| `is_deleted` | INTEGER | 否 | `0` | 軟刪除旗標 | `soft_delete_user()` |
| `created_at` | TEXT | 否 | `datetime('now')` | 建立時間（UTC） | SQLite |
| `last_login_at` | TEXT | 是 | NULL | 最後登入時間 | `update_last_login()` |

布林值一律以整數 0／1 表示，不用 SQLite 的 boolean 別名。時間一律為 `datetime('now')` 產生的 UTC 字串，格式 `YYYY-MM-DD HH:MM:SS`。

`email` 的 UNIQUE 約束使用 SQLite 預設的 BINARY collation，因此 `User@example.com` 與 `user@example.com` 是**兩個不同的帳號**，見 KI-22。

### 6.4 種子資料

`db.init_db()` 在 `users` 表為空時自動植入三個帳號（`db/users.py` 的 `_SEED_USERS`）：

| id | email | 密碼 | role | is_active | name | 用途 |
|:--:|-------|------|:--:|:--:|------|------|
| 1 | `user@example.com` | `password123` | 1 | 1 | 一般使用者 | 一般使用者情境 |
| 2 | `admin@example.com` | `admin1234` | 0 | 1 | 管理員 | 管理員情境 |
| 3 | `disabled@example.com` | `disabled123` | 1 | 0 | `NULL` | 停用帳號情境；也用於測試「姓名為 NULL」的顯示 |

id 由 AUTOINCREMENT 依 `_SEED_USERS` 的順序產生，**未在 INSERT 中顯式指定**。測試的 fixtures 依賴 id 1／2／3 的對應關係，因此調整 `_SEED_USERS` 的順序會讓全套測試的權限斷言靜默錯位（KI-27）。

種子帳號使用 `bcrypt.gensalt(4)` 加速測試，明文密碼直接寫在原始碼中，見 KI-21。

### 6.4.1 種子文章

`init_db()` 另外植入五篇論壇文章，由 `db/forum.py` 的 `_seed_forum_if_empty(conn)` 負責。機制與種子帳號**完全對稱**：`forum` 表為空時才執行、共用同一個 conn、冪等。

順序上**必須排在 `_seed_users_if_empty()` 之後**——文章的 `user_id` 指向那三個帳號。

| # | 標題 | 作者 | 內容數 | 設計用意 |
|---|------|------|:--:|---------|
| 1 | 【公告】討論區使用說明 | 管理員（2） | 1 | 最小案例：只有內文、沒有回覆。順帶說明論壇的權限規則 |
| 2 | 主檔與明細是怎麼分工的？ | 一般使用者（1） | 1 | 同上；內容本身就在問資料模型 |
| 3 | 被停用的帳號，發過的文章會怎麼樣？ | **停用帳號（3）** | 1 | 一次示範兩件事：§4.2 的「帳號狀態不影響既有內容」，以及 `COALESCE(u.name, u.email)` 在 `name` 為 NULL 時退回顯示 email |
| 4 | 軟刪除和真的刪掉，差在哪裡？ | 一般使用者（1） | 3 | 一對多：一則內文加兩則回覆，且作者交錯（1 → 2 → 1） |
| 5 | 期末專題可以自己選題目嗎？ | 一般使用者（1） | 2 | 最後有活動，因此排在列表最上面——示範 `updated_at` 降冪排序 |

**時間戳以 `datetime('now', '-N minutes')` 明確指定**，不用欄位預設值。理由是全部在同一秒內建立時 `updated_at` 會完全相同，列表排序變得不確定，「有新回覆的文章會浮上來」這個行為就看不出來了。五篇的最後活動時間分別散在 3 天前到 2 小時前之間。

> **為何種子資料由 `_seed_*_if_empty()` 提供。** 另一種常見做法是用一次性的 `setup/` 目錄植入模擬資料、執行後把目錄刪掉。那套機制不冪等：重置資料庫後除非手動把目錄放回去，否則永遠拿不回範例資料。本系統改成在 `init_db()` 裡檢查資料表是否為空再植入，重置幾次都拿得回來。
>
> 改用 `_seed_*_if_empty` 讓兩類種子資料的機制一致——`rm database.db && python app.py` 就能完整回到初始狀態，這也是 `README` 與 `CLAUDE.md` 一直宣稱的行為。

### 6.5 `db/users.py` 函式總表

回傳值慣例（依 `rules/database.md`）：**查詢函式回傳 `sqlite3.Row` 或 `None`；分頁查詢回傳 `(items, total)` tuple；寫入函式一律回傳 `None`**。

| 函式 | SQL 摘要 | 回傳 | 呼叫者 |
|------|---------|------|--------|
| `find_user_by_email(email)` | `SELECT` 10 欄，**含 `hash`**，`WHERE email = ?` | Row / None | `auth.login_page`、`hub.home` |
| `find_user_by_id(user_id)` | `SELECT` 9 欄，**不含 `hash`**，`WHERE id = ?` | Row / None | `hub.home`、`profile.dashboard`、`admin.*` |
| `create_user(email, password, name=None, display_name=None)` | `INSERT INTO users (email, hash, name, display_name)`，bcrypt cost=10 | None | `auth.register` |
| `update_user_profile(user_id, name, display_name)` | `UPDATE users SET name = ?, display_name = ?` | None | `profile.dashboard_update` |
| `update_last_login(user_id)` | `UPDATE users SET last_login_at = datetime('now')` | None | `auth.login_page`、`hub.home` |
| `soft_delete_user(user_id)` | `UPDATE users SET is_deleted = 1` | None | `admin.delete_user` |
| **`list_users(page, page_size, status='all', keyword=None)`** | 見 §6.6 | `(rows, total)` | `admin.user_list` |
| **`set_user_active(user_id, is_active)`** | `UPDATE users SET is_active = ?` | None | `admin.activate_user`、`admin.deactivate_user` |
| **`set_user_role(user_id, role)`** | `UPDATE users SET role = ?` | None | `admin.update_role` |
| `hard_delete_user_by_email(email)` | `DELETE FROM users WHERE email = ?` | None | **僅供測試清理，正式程式碼不得呼叫**（KI-11） |

粗體三個為本系統新增。

`find_user_by_email` 是唯一會回傳 `hash` 欄位的函式，因為登入時需要它做 `bcrypt.checkpw`。所有渲染到畫面上的查詢都走 `find_user_by_id`，確保密碼雜湊不會被傳進 template。

**為何不建立 `db/admin.py`：** `rules/database.md` 規定「新子系統的資料存取邏輯建立新模組」，但該規則的前提是新子系統有自己的資料表。會員管理操作的對象仍然是 `users` 表，因此三個新函式放進既有的 `db/users.py`，維持「一張資料表對應一個 `db/` 模組」這個更根本的原則。這是 `admin` 子系統唯一不完全套用「新增子系統七項清單」的地方。

### 6.6 `list_users()` 的查詢邏輯

```python
def list_users(page, page_size, status='all', keyword=None):
    """會員清單（分頁）。status: 'all' | 'active' | 'disabled' | 'deleted'。

    注意：本函式刻意不強制 is_deleted = 0 的過濾，因為管理員的職責
    就是要能檢視已刪除的紀錄。
    """
```

- 欄位清單與 `find_user_by_id` 完全一致（9 欄，不含 `hash`）
- 狀態條件：
  - `all` — 不加狀態條件
  - `active` — `is_deleted = 0 AND is_active = 1`
  - `disabled` — `is_deleted = 0 AND is_active = 0`
  - `deleted` — `is_deleted = 1`
- 關鍵字條件：`AND (email LIKE ? OR name LIKE ? OR display_name LIKE ?)`，三個參數皆為 `f'%{keyword}%'`
- 排序與分頁：`ORDER BY id`、`LIMIT ? OFFSET ?`，`offset = (page - 1) * page_size`
- `total` 以相同的 WHERE 條件另跑一次 `SELECT COUNT(*)`

### 6.7 `forum` 與 `forum_details` 表 DDL

以下為 `db/forum.py` 的 `_init_forum_tables(conn)` 執行的建表語句：

```sql
CREATE TABLE IF NOT EXISTS forum (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
    user_id    INTEGER NOT NULL,
    is_deleted INTEGER NOT NULL DEFAULT 0
)

CREATE TABLE IF NOT EXISTS forum_details (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    master_id        INTEGER NOT NULL,
    content          TEXT    NOT NULL,
    created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at       TEXT    NOT NULL DEFAULT (datetime('now')),
    user_id          INTEGER NOT NULL,
    is_original_post INTEGER NOT NULL DEFAULT 0,
    is_deleted       INTEGER NOT NULL DEFAULT 0
)
```

> **表名注意**：主檔的表名是 `forum`（單數，無 `_masters` 後綴）。函式名稱 `list_forum_masters` 中的 `masters` 指的是「主檔」這個概念，不是表名。

### 6.8 `forum` 相關欄位字典

**`forum`（文章主檔）**

| 欄位 | 型別 | 可為 NULL | 預設 | 語意 | 由誰寫入 |
|------|------|:---:|------|------|---------|
| `id` | INTEGER | 否 | AUTOINCREMENT | 主鍵 | SQLite |
| `title` | TEXT | 否 | 無 | 文章標題，**無長度上限**（KI-28） | `create_forum_master()`、`update_forum_master_title()` |
| `created_at` | TEXT | 否 | `datetime('now')` | 建立時間 | SQLite |
| `updated_at` | TEXT | 否 | `datetime('now')` | 最後活動時間，**列表排序依據** | `update_forum_master_title()`、`create_forum_detail()`、`soft_delete_forum_master()` |
| `user_id` | INTEGER | 否 | 無 | 發文者，**無外鍵約束** | `create_forum_master()` |
| `is_deleted` | INTEGER | 否 | `0` | 軟刪除旗標 | `soft_delete_forum_master()` |

**`forum_details`（內文與回覆）**

| 欄位 | 型別 | 可為 NULL | 預設 | 語意 | 由誰寫入 |
|------|------|:---:|------|------|---------|
| `id` | INTEGER | 否 | AUTOINCREMENT | 主鍵 | SQLite |
| `master_id` | INTEGER | 否 | 無 | 所屬文章，**無外鍵約束** | `create_forum_master()`、`create_forum_detail()` |
| `content` | TEXT | 否 | 無 | 內容，**無長度上限**（KI-28） | `create_forum_*()`、`update_forum_detail_content()` |
| `created_at` | TEXT | 否 | `datetime('now')` | 建立時間，**內文列表排序依據** | SQLite |
| `updated_at` | TEXT | 否 | `datetime('now')` | 最後編輯時間 | `update_forum_detail_content()`、`soft_delete_*()` |
| `user_id` | INTEGER | 否 | 無 | 作者，**無外鍵約束** | `create_forum_*()` |
| `is_original_post` | INTEGER | 否 | `0` | `1` = 與文章同時建立的首篇內文；`0` = 回覆 | `create_forum_master()` 寫 1，`create_forum_detail()` 用預設 0 |
| `is_deleted` | INTEGER | 否 | `0` | 軟刪除旗標 | `soft_delete_forum_master()`（級聯）、`soft_delete_forum_detail()` |

`updated_at` 在兩張表中的語意不同，這一點容易搞混：主檔的 `updated_at` 是「最後**活動**時間」（新回覆會更新它），明細的 `updated_at` 是「最後**編輯**時間」（只有內容被改才更新）。這個差異直接決定了文章在列表中的排序行為。

### 6.9 `db/forum.py` 函式總表

| 函式 | SQL 摘要 | 回傳 | Transaction | 呼叫者 |
|------|---------|------|:---:|--------|
| `_init_forum_tables(conn)` | 兩個 `CREATE TABLE IF NOT EXISTS` | None | — | `db.init_db()` |
| `list_forum_masters(page=1, page_size=10)` | `LEFT JOIN users` 取 `COALESCE(u.name, u.email) AS user_display`；`WHERE m.is_deleted = 0`；`ORDER BY m.updated_at DESC` | `(items, total)` | — | `forum.index` |
| `get_forum_master(master_id)` | 單筆查詢，**不過濾 `is_deleted`** | Row / None | — | `forum.reply`、`edit_master`、`delete_master` |
| `create_forum_master(title, content, user_id)` | `INSERT` 主檔 → 取 `lastrowid` → `INSERT` 明細（`is_original_post = 1`） | `master_id` | **是** | `forum.new_post` |
| `update_forum_master_title(master_id, title)` | `UPDATE forum SET title, updated_at` | None | — | `forum.edit_master` |
| `soft_delete_forum_master(master_id)` | `UPDATE forum` + `UPDATE forum_details WHERE master_id = ?`，兩者 `is_deleted = 1` | None | **是** | `forum.delete_master` |
| `list_forum_details(master_id)` | `LEFT JOIN users`；`WHERE master_id = ? AND is_deleted = 0`；`ORDER BY created_at DESC` | list[Row] | — | `forum.index` |
| `get_forum_detail(detail_id)` | 單筆查詢，**不過濾 `is_deleted`** | Row / None | — | `forum.edit_detail`、`delete_detail` |
| `create_forum_detail(master_id, content, user_id)` | `INSERT` 明細 → `UPDATE forum SET updated_at` | `detail_id` | **是** | `forum.reply` |
| `update_forum_detail_content(detail_id, content)` | `UPDATE forum_details SET content, updated_at` | None | — | `forum.edit_detail` |
| `soft_delete_forum_detail(detail_id)` | `UPDATE forum_details SET is_deleted = 1` | None | — | `forum.delete_detail` |

三個標註「是」的函式使用 `with conn:` 包住多個語句，由 sqlite3 自動 commit 或 rollback。這是 `rules/database.md` 的 transaction 規範在本系統中的唯一應用場景。

`COALESCE(u.name, u.email)` 的用意是：作者沒有填姓名時退回顯示 email。使用 `LEFT JOIN` 而非 `INNER JOIN`，是為了讓作者帳號被硬刪除（測試清理）時文章仍然顯示得出來，只是 `user_display` 為 `NULL`。

### 6.10 軟刪除策略與查詢過濾約定

`rules/database.md` 的通則是「刪除一律 `is_deleted = 1`，查詢一律加 `WHERE is_deleted = 0`」。本系統有四處**刻意的例外**，都必須在函式的 docstring 中明確標註：

| 函式 | 例外 | 理由 |
|------|------|------|
| `find_user_by_email` / `find_user_by_id` | 不過濾 `is_deleted` | 過濾責任交給呼叫端的 `_is_usable(user)`。這讓「帳號存在但不可用」與「帳號不存在」在資料層可區分，登入流程才能對兩者給出不同處置 |
| `list_users` | `status` 為 `all` 或 `deleted` 時不過濾 `is_deleted` | 管理員必須看得見已刪除的紀錄 |
| `get_forum_master` / `get_forum_detail` | 不過濾 `is_deleted` | 同樣把判斷交給呼叫端。Blueprint 需要區分「不存在」與「已刪除」以決定 redirect 的目標，因此資料層必須把已刪除的列也交出來 |

通則反過來說也成立：**所有列表類查詢一律過濾**。`list_forum_masters` 與 `list_forum_details` 都硬性帶 `is_deleted = 0`，沒有例外參數。

這四條例外必須同步寫進 `rules/database.md`，否則規範與程式碼會互相矛盾。

---

## 7. 路由總表

### 7.1 全站路由

| Blueprint | 方法 | 路徑 | endpoint 函式 | 權限層 | 成功回應 | 失敗回應 |
|-----------|------|------|--------------|--------|---------|---------|
| hub | `GET` `POST` | `/` | `home` | 無 | 200 渲染（雙模式） | 登入失敗時 200 重新渲染，錯誤走 `error` 變數 |
| auth | `GET` `POST` | `/login` | `login_page` | 無 | 302 → `/` | 200 重新渲染，錯誤走 `error` 變數；已登入 302 → `/` |
| auth | `GET` `POST` | `/register` | `register` | 無 | 302 → `/login` + flash | 200 重新渲染 + `form_data` 回填；已登入 302 → `/` |
| auth | `GET` | `/captcha.png` | `captcha_image` | 無 | 200 `image/png` | — |
| auth | `GET` | `/logout` | `logout` | 無 | 302 → `/login` | — |
| profile | `GET` | `/profile` | `dashboard` | 1 + 2 | 200 渲染 | 302 → `/login` |
| profile | `POST` | `/profile/update` | `dashboard_update` | 1 | 302 → `/profile` | 302 → `/login`（僅未登入） |
| admin | `GET` | `/admin/users` | `user_list` | 1 + 2 + 3 | 200 渲染 | 302 → `/login` 或 302 → `/` + flash |
| admin | `GET` | `/admin/users/<int:user_id>` | `user_detail` | 1 + 2 + 3 | 200 渲染 | 同上；查無此人 302 → `/admin/users` + flash |
| admin | `POST` | `/admin/users/<int:user_id>/activate` | `activate_user` | 1 + 2 + 3 | 302 → `/admin/users` + flash | 同上 |
| admin | `POST` | `/admin/users/<int:user_id>/deactivate` | `deactivate_user` | 1 + 2 + 3 | 302 → `/admin/users` + flash | 同上 |
| admin | `POST` | `/admin/users/<int:user_id>/role` | `update_role` | 1 + 2 + 3 | 302 → `/admin/users` + flash | 同上 |
| admin | `POST` | `/admin/users/<int:user_id>/delete` | `delete_user` | 1 + 2 + 3 | 302 → `/admin/users` + flash | 同上 |
| forum | `GET` | `/forum` | `index` | **無** | 200 渲染 | — |
| forum | `GET` `POST` | `/forum/new` | `new_post` | 1 + 2 | 302 → `/forum?master_id=<新id>` | 200 重新渲染，錯誤走 `error` 變數 |
| forum | `GET` `POST` | `/forum/reply/<int:master_id>` | `reply` | 1 + 2 | 302 → `/forum?master_id=<id>` | 同上；文章不存在 302 → `/forum` + flash |
| forum | `GET` `POST` | `/forum/edit/master/<int:master_id>` | `edit_master` | 1 + 2 + 作者或 3 | 302 → `/forum?master_id=<id>` | 同上；無權限 302 + flash |
| forum | `GET` `POST` | `/forum/edit/detail/<int:detail_id>` | `edit_detail` | 1 + 2 + 作者或 3 | 302 → `/forum?master_id=<所屬id>` | 同上 |
| forum | `POST` | `/forum/delete/master/<int:master_id>` | `delete_master` | 1 + 2 + 3 | 302 → `/forum` + flash | 302 + flash |
| forum | `POST` | `/forum/delete/detail/<int:detail_id>` | `delete_detail` | 1 + 2 + 3 | 302 → `/forum?master_id=<所屬id>` + flash | 302 + flash |
| — | `GET` | `/health` | `health` | 無 | 200 `OK` | — |

共 21 條。權限層代號見 §4.4：1 = 已登入、2 = 帳號可用、3 = 管理員。

`/admin/users` 的 query parameters：`?status=all|active|disabled|deleted`（預設 `all`）、`?q=<關鍵字>`、`?page=N`（預設 1，`_PAGE_SIZE = 10`）。三者可自由組合。

`/forum` 的 query parameters：`?page=N`（預設 1，`_PAGE_SIZE = 10`）控制左欄文章列表分頁；`?master_id=N` 指定右欄要顯示哪一篇的內文與回覆。兩者獨立，可組合。

`forum.index` 宣告時帶 `strict_slashes=False`，因此 `/forum` 與 `/forum/` 都能命中同一個 endpoint，不會產生 308 轉址。

### 7.2 命名慣例

- URL 一律小寫，多字以連字號分隔；Python 函式名以底線分隔
- Blueprint 名稱即 `url_for` 的前綴：`url_for('admin.user_list')`、`url_for('forum.index')`
- `admin` 與 `forum` 使用 `url_prefix`（`/admin`、`/forum`），其餘三個 Blueprint 掛在根路徑
- 論壇的動作路徑採「動詞／類型／id」的三段結構（`/forum/edit/master/<id>`、`/forum/delete/detail/<id>`），刻意讓「對主檔操作」與「對明細操作」在網址上就分得開

### 7.3 POST-Redirect-GET 與元素語意

所有有副作用的操作一律走 POST，成功後 `redirect()`，避免使用者重新整理時重複送出。

| 元素 | 使用時機 | 本系統的實例 |
|------|---------|-------------|
| `<a href="...">` | GET 導航（跳頁、返回、進入編輯模式或表單頁） | 首頁服務卡片、「修改資料」、admin 狀態篩選與分頁、「詳細」、論壇的「發表文章」「回覆」「修改」與分頁 |
| `<button type="submit">` | POST 動作（有副作用） | 登入、申請帳號、儲存個人資料、啟用、停用、調整角色、刪除帳號、送出文章／回覆、刪除文章／回覆 |

注意論壇的「新增文章」「回覆」「修改」三者都是 `<a>` 而非 `<button>`——它們導向的是**表單頁**（GET），真正的副作用發生在表單頁裡的 `<button type="submit">`。這是 POST-Redirect-GET 的標準兩段式流程。

**禁止**使用 `<a href="#">` 搭配 `onclick` 假裝按鍵——語意錯誤，且鍵盤操作與螢幕閱讀器的行為不正確。

唯一的例外是 `/logout`，它是 `<a>` 觸發的 GET 卻有副作用，見 KI-14。

### 7.4 `activate` 與 `deactivate` 為何拆成兩條路由

沒有採用單一的 toggle 路由，理由有二：

1. **冪等性。** 分立的動詞路由天然冪等：`POST /deactivate` 送出幾次，結果都是「已停用」。toggle 路由在瀏覽器重送 POST 時會反覆翻轉狀態，使用者無法從網址預期結果
2. **不需要先讀狀態。** toggle 必須先查出當前值才知道要設成什麼，多一次資料庫往返，而且在並行情況下有 race condition

代價是路由數多一條，以及前端要依 `is_active` 決定顯示哪一顆按鈕。這個交換在教學語境下是划算的。

---

## 8. 畫面設計與流程

### 8.1 畫面清單

| Template | 對應路由 | 主要區塊 |
|----------|---------|---------|
| `base.html` | —（被繼承） | `<head>` 載入 `common.css` + `login.css`；提供 `title`、`head`、`body` 三個 block |
| `hub/home.html` | `GET/POST /` | topbar；訪客視圖（服務卡片 + 內嵌登入面板）／已登入視圖（歡迎語 + 服務卡片） |
| `auth/login.html` | `GET/POST /login` | flash 區、錯誤區、登入表單（email / password / 驗證碼圖 + 輸入框）、「申請帳號」連結 |
| `auth/register.html` | `GET/POST /register` | 錯誤區、申請表單（email / password / confirm_password / name / display_name）、返回登入連結 |
| `profile/dashboard.html` | `GET /profile` | 資料卡（六個欄位）；`edit_mode` 控制唯讀／編輯；底部返回首頁、登出 |
| `admin/user_list.html` | `GET /admin/users` | topbar、flash 區、篩選列（狀態連結 + 搜尋框）、會員表格、分頁列 |
| `admin/user_detail.html` | `GET /admin/users/<id>` | topbar、flash 區、資訊卡（九個欄位）、操作區、返回清單連結 |
| `forum/index.html` | `GET /forum` | topbar、左欄文章列表（表格 + 分頁）、右欄選定文章的內文與回覆 |
| `forum/post_form.html` | `/forum/new`、`/forum/reply/<id>`、`/forum/edit/master/<id>`、`/forum/edit/detail/<id>` | **四條路由共用的表單頁**，以參數控制顯示哪些欄位 |

`forum/post_form.html` 是本系統唯一被多條路由共用的模板，由五個變數驅動：

| 變數 | 作用 |
|------|------|
| `form_title` | 表單頁標題字串，例如「新增文章」「回覆：{原文標題}」「修改文章標題」「修改內文」 |
| `show_title` | 是否顯示標題欄。新增文章與修改標題為 `True`，回覆與修改內文為 `False` |
| `show_content` | 是否顯示內容欄。修改標題為 `False`，其餘三者為 `True` |
| `form_data` | 回填值。新增時為空 dict，修改時預填現有值，驗證失敗時為 `request.form` |
| `back_url` | 「返回」連結的目標，依來源路由而異 |

四種組合恰好覆蓋四條路由：`(True, True)` 新增文章、`(False, True)` 回覆與修改內文、`(True, False)` 修改標題。這個設計避免了四份高度重複的模板，代價是讀模板時必須同時想著四種情境。

### 8.2 導覽關係

```text
                     ┌──────────────┐
        ┌───────────▶│  /  首頁      │◀──────────┐
        │            └──────┬───────┘           │
        │                   │                    │
   登入成功            ┌────┴────┐          返回首頁
        │              │         │               │
┌───────┴──────┐  ┌────▼─────┐ ┌─▼──────────────┴────┐
│ /login       │  │ /profile │ │ /admin/users        │
│ （含內嵌於   │  │          │ │ （僅管理員）         │
│   首頁的表單）│  │ ?edit=1  │ │                     │
└───────┬──────┘  └────┬─────┘ └─────────┬───────────┘
        │              │                  │
   申請帳號        POST /profile/update    ├─▶ /admin/users/<id>
        │              │                  │
┌───────▼──────┐       └──▶ 回 /profile   ├─▶ POST activate / deactivate
│ /register    │                          ├─▶ POST role
└───────┬──────┘                          └─▶ POST delete
        │                                       └──▶ 全部回 /admin/users
   flash 後回 /login

              ┌──────────────────────────────────┐
              │ /forum  （訪客亦可瀏覽）           │
              │ ?page=N 左欄分頁                  │
              │ ?master_id=N 右欄內文             │
              └──────────────┬───────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
   /forum/new         /forum/reply/<id>    /forum/edit/master/<id>
   （表單頁）            （表單頁）           /forum/edit/detail/<id>
        │                    │                （表單頁，共用 post_form.html）
        └────────────────────┴────────────────────┘
                             │
                    POST 後回 /forum?master_id=N

   POST /forum/delete/master/<id>  ──▶ 回 /forum（整篇消失）
   POST /forum/delete/detail/<id>  ──▶ 回 /forum?master_id=N
```

`/logout` 可從首頁、個人資料頁、會員管理頁、論壇頁的 topbar 觸發，一律導向 `/login`。論壇是唯一在未登入時 topbar 顯示「登入」而非「登出」的頁面。

### 8.3 各頁線框說明

**首頁 — 訪客視圖**

上方 topbar 顯示系統名稱與右側「申請帳號」連結。主區域分左右兩欄：左欄是歡迎語加上服務卡片格線，右欄是登入面板，內含錯誤訊息區與登入表單（email、密碼、驗證碼圖片 + 輸入框、登入按鈕、申請帳號連結）。

左欄的三張卡片：

| 卡片 | 元素 | 說明 |
|------|------|------|
| 論壇 | `<a>` 連向 `/forum` | **可點擊**。訪客能直接瀏覽討論區 |
| 個人資料 | `<div class="hub-card hub-card-locked">` | 鎖定，右下角 `🔒 需登入` 徽章 |
| 會員管理 | `<div class="hub-card hub-card-locked">` | 鎖定，右下角 `🔒 需管理員權限` 徽章 |

論壇卡片是訪客視圖中唯一可點的服務——這正是「開放內容 vs 需登入功能」的視覺對比，值得在課堂上指出來。

驗證碼圖片可點擊刷新（`onclick` 改寫 `src` 並附加時間戳），旁邊另有一顆 `↻` 按鈕做同一件事。

**首頁 — 已登入視圖**

topbar 右側改為顯示使用者名稱與「登出」。主區域是單欄：歡迎語「歡迎回來，{名稱}！」，下方服務卡片格線。一般使用者看到「個人資料」與「論壇」兩張卡；管理員額外看到「會員管理」卡片，連向 `/admin/users`。

名稱的顯示優先序為 `name` → `display_name` → `email`，三者皆為 Jinja 中的 `or` 串接。

**登入頁 / 申請帳號頁**

單欄置中的卡片版面（`login.css` 的 `body` 為 flex 置中）。兩頁的 `<form>` 都必須帶 `class="login-form"`，否則送出按鈕不會套用樣式，見 §8.5。

**個人資料頁 — 唯讀模式**

資料卡逐列顯示 email、姓名、顯示名稱、角色、建立時間、最後登入時間。空值一律顯示 `—`。底部有「修改資料」（連向 `?edit=1`）、「返回首頁」、「登出」。

**個人資料頁 — 編輯模式**

姓名與顯示名稱變成 `<input>`，其餘欄位維持唯讀文字。整張卡包在 `<form method="POST" action="/profile/update">` 中，底部改為「儲存」與「放棄」。

**會員管理 — 清單頁**

topbar（系統名稱、返回首頁、個人資料、使用者名稱、登出）→ flash 訊息區 → 篩選列（四個狀態 `<a>`，當前狀態加上 active 樣式；右側 `<form method="get">` 搜尋框）→ 表格 → 分頁列。

表格欄位：ID｜Email｜姓名｜顯示名稱｜角色｜狀態｜建立時間｜最後登入｜操作。角色與狀態以 badge 呈現。

「操作」欄的內容依該列的狀態決定：

- 未刪除：顯示「啟用」或「停用」其中之一（依 `is_active`）、「刪除」、「詳細」
- 已刪除：只顯示「詳細」
- **自己那一列**：三個動作按鈕全部隱藏，改顯示文字「（目前登入帳號）」，只保留「詳細」

前端隱藏只是提示，**後端檢查才是權威**。測試必須直接對後端 POST，驗證即使繞過前端也擋得住。

**會員管理 — 明細頁**

資訊卡以雙欄格線顯示 `users` 表的全部九個欄位（不含 `hash`）。下方操作區：角色調整表單（`<select name="role">` 加送出按鈕）、啟用或停用按鈕、刪除按鈕。若檢視的是自己，整個操作區換成提示文字。底部有返回清單的連結。

模板中被檢視的會員命名為 `target`，**刻意不叫 `user`**，避免與 topbar 使用的當前登入者 `user` 在 Jinja 中混淆。

**論壇 — 主頁**

topbar（系統名稱、返回首頁、使用者名稱 + 登出／或「登入」按鈕）→ 左右兩欄。

**左欄**（`.forum-left`）：標題列與「發表文章」按鈕（未登入時不顯示）→ 文章表格 → 分頁列。表格欄位為 ID｜標題｜作者｜最後更新｜操作。標題是 `<a>`，點擊後以 `?master_id=` 帶回同一頁並選定該篇；當前選定的列加上 `.forum-row-selected` 樣式。「操作」欄依權限顯示「修改」（原發文者或管理員）與「刪除」（僅管理員，帶 `confirm`）。

**右欄**（`.forum-right`）：未選定文章時顯示 `.forum-placeholder` 提示；選定後顯示標題列與「回覆」按鈕，下方逐筆列出內文與回覆（依 `created_at` 降冪，最新在上）。`is_original_post = 1` 的那一筆加上 `.forum-row-original` 樣式以資區別。每筆的操作依權限顯示「修改」與「刪除」。

分頁連結必須同時帶上 `page` 與當前的 `master_id`，否則翻頁會讓右欄的內容消失。

**論壇 — 表單頁**

單欄置中的卡片（`.forum-form-page` / `.forum-form-card`）。依 `form_title` 顯示頁面標題，依 `show_title` 與 `show_content` 決定顯示哪些欄位，底部是「送出」按鈕與連向 `back_url` 的「返回」連結。錯誤訊息以 `.forum-alert-error` 顯示在表單上方。

這個表單**不加** `class="login-form"`。

### 8.4 使用者旅程

**旅程 A：申請帳號到編輯資料**

```text
訪客開啟 /            -> 訪客視圖
點「申請帳號」        -> /register
填表送出              -> 驗證通過 -> create_user -> flash -> /login
在登入頁看到「申請成功，請登入」
填 email/密碼/驗證碼   -> 通過 -> session['user_id'] -> /
點「個人資料」卡片     -> /profile（唯讀）
點「修改資料」         -> /profile?edit=1
改姓名後「儲存」       -> POST /profile/update -> /profile（唯讀，已更新）
```

**旅程 B：管理員停用某會員**

```text
管理員登入            -> / （看得到「會員管理」卡片）
點「會員管理」        -> /admin/users
點「啟用中」篩選       -> /admin/users?status=active
在目標列點「停用」     -> POST /admin/users/1/deactivate
                      -> flash「帳號已停用」-> /admin/users
點「已停用」篩選       -> 目標出現在此清單中
```

被停用的會員下一次開啟 `/` 或 `/profile` 時，`_is_usable` 判定為假，session 被清除並退回訪客視圖或登入頁。但如果他直接送出 `POST /profile/update`，仍然會成功——這是 KI-03。

**旅程 C：管理員嘗試對自己操作**

```text
管理員 -> /admin/users
自己那一列沒有操作按鈕，顯示「（目前登入帳號）」
若以工具直接 POST /admin/users/2/deactivate
  -> 後端 R1 攔下 -> flash「不可停用自己的帳號」-> /admin/users
  -> 資料庫中 admin 的 is_active 仍為 1
```

**旅程 D：發文、回覆、被管理員刪除**

```text
會員甲登入 -> / -> 點「論壇」卡片 -> /forum
點「發表文章」        -> /forum/new（表單頁，標題 + 內容）
填表送出              -> create_forum_master（transaction 寫兩張表）
                      -> /forum?master_id=5（右欄顯示剛發的文）
會員乙登入 -> /forum -> 點該篇標題 -> /forum?master_id=5
點「回覆」            -> /forum/reply/5
送出                  -> create_forum_detail（transaction：寫明細 + 更新主檔 updated_at）
                      -> /forum?master_id=5，該篇浮到列表最上面
會員甲想刪自己的文     -> 列表上沒有「刪除」按鈕（僅管理員可見）
管理員登入 -> /forum   -> 該篇的「刪除」按鈕出現
點「刪除」            -> confirm 對話框 -> POST /forum/delete/master/5
                      -> soft_delete_forum_master（transaction：主檔 + 所有明細）
                      -> flash「文章已刪除」-> /forum，該篇與乙的回覆一併消失
```

**旅程 E：停用帳號後的論壇行為（驗證守門修正）**

```text
管理員 -> /admin/users -> 停用會員甲
會員甲仍持有 session：
  GET  /forum              -> 200，但以「訪客」身分呈現，發文按鈕消失
  GET  /forum/new          -> _current_user() 回傳 None
                           -> @login_required 已過，但 _is_usable 擋下
                           -> session.clear() -> 302 /login
  POST /forum/reply/5      -> 同樣被擋，資料庫沒有新增任何回覆
  POST /profile/update     -> **成功**（KI-03，刻意保留的缺陷）
```

最後兩行的對比是本系統最重要的一課：**同一個帳號狀態，在兩個子系統得到相反的處置**。forum 修補了、profile 沒有。這不是疏忽，是刻意安排的教材（判準見 §11.2 開頭）。

### 8.5 CSS 架構

**設計 token 是顏色的單一來源。** `static/common.css` 由 `base.html` 最先載入，定義全站按鍵的 CSS 自訂屬性。各子系統的 CSS 一律以 `var(--...)` 引用，**不得寫死色碼**。

| 變數 | 用途 |
|------|------|
| `--btn-primary-bg` / `--btn-primary-hover` | 主要動作（藍） |
| `--btn-secondary-bg` / `--btn-secondary-color` / `--btn-secondary-hover` | 次要動作（灰） |
| `--btn-danger-bg` / `--btn-danger-hover` | 危險操作（紅） |
| `--btn-action-bg` / `--btn-action-border` / `--btn-action-color` / `--btn-action-hover` | 表格內的行內小按鍵 |
| `--btn-action-danger-border` / `-bg` / `-color` / `-hover` | 行內小按鍵的 danger 變體 |

**各子系統使用自己的類別前綴，不跨系統共用樣式：**

| CSS 檔案 | 按鍵前綴 | 適用頁面 |
|---------|---------|---------|
| `common.css` | —（只有 token） | 全站 |
| `login.css` | 無前綴，限定在 `.login-form` 內 | 登入頁、申請帳號頁、首頁內嵌登入表單 |
| `hub.css` | `hub-*` | 首頁 |
| `profile.css` | `profile-*` | 個人資料頁 |
| `admin.css` | `admin-btn-*`、`admin-btn-action-*` | 會員管理頁 |
| `forum.css` | `forum-btn-*`、`forum-btn-action-*` | 論壇主頁與表單頁 |

`forum.css` 另有一組不帶子系統前綴的欄寬工具類（`.col-id`、`.col-title`、`.col-uid`、`.col-time`、`.col-content`、`.col-action`），只在論壇的表格內使用。`admin.css` 沿用同一套命名。這是唯一允許跨子系統共用的類別族，因為它們只管欄寬、不管顏色。

**關鍵限制 — `.login-form`：** `login.css` 的 `button[type="submit"]` 樣式限定在 `.login-form` 選擇器內，不會全域污染其他子系統。凡是要套用登入頁按鈕樣式的表單，`<form>` 元素**必須**加上 `class="login-form"`。全系統恰有三處：

- `templates/auth/login.html`
- `templates/auth/register.html`
- `templates/hub/home.html`（內嵌登入表單）

`admin`、`profile`、`forum` 的表單**不加**這個 class，否則會誤套登入頁樣式。

**已知的 token 缺口：** 狀態 badge（啟用／停用／已刪除／管理員／一般使用者）的底色目前硬編碼在 `admin.css` 中，因為 `common.css` 沒有定義狀態語意色。`forum.css` 的 `.forum-row-original`、`.forum-row-selected`、`.forum-alert-*` 也有同樣情況。全站一致地這樣處理，記錄於 KI-19。

---

## 9. 驗證規則與訊息字串

### 9.1 輸入欄位規格

| 欄位 | 出現於 | 必填 | 格式 | 長度 | 正規化 |
|------|--------|:---:|------|------|--------|
| `email` | login、register、hub 內嵌登入 | 是 | register 驗 `EMAIL_REGEX`；**login 不驗** | 無限制 | `.strip()` |
| `password` | login、register、hub 內嵌登入 | 是 | 無複雜度規則 | register 驗 ≥ 8；login 不驗 | **不 strip**（前後空白是密碼的一部分） |
| `confirm_password` | register | 是 | 須與 `password` 相同 | 同上 | 不 strip |
| `captcha` | login、hub 內嵌登入 | 是 | 比對 `session['captcha']` | — | `.strip().upper()` |
| `name` | register、profile 編輯 | 否 | 無 | **無限制**（KI-04） | `.strip()`，空字串轉 `None` |
| `display_name` | register、profile 編輯 | 否 | 無 | **無限制**（KI-04） | `.strip()`，空字串轉 `None` |
| `role` | admin 明細頁 | 是 | 須為 `'0'` 或 `'1'` | — | 無 |
| `q` | admin 清單頁 | 否 | 無 | 無限制 | `.strip()` |
| `status` | admin 清單頁 | 否 | `all` / `active` / `disabled` / `deleted` | — | 非法值視為 `all` |
| `page` | admin 清單頁、forum 主頁 | 否 | 整數 | — | 缺漏或非法時視為 1 |
| `master_id` | forum 主頁 | 否 | 整數 | — | 缺漏或指向已刪除文章時，右欄留白 |
| `title` | forum 新增文章、修改標題 | 是 | 無 | **無上限**（KI-28） | `.strip()` |
| `content` | forum 新增文章、回覆、修改內文 | 是 | 無 | **無上限**（KI-28） | `.strip()` |

`EMAIL_REGEX` 定義於 `blueprints/auth/__init__.py`：

```python
EMAIL_REGEX = re.compile(r'^[^\s@]+@[^\s@]+\.[^\s@]+$')
```

這是一個刻意寬鬆的格式檢查，只確保有 `@` 與一個點，不試圖完整實作 RFC 5322。

### 9.2 登入驗證順序

`POST /login` 與 `POST /`（hub 內嵌登入）使用**完全相同**的驗證邏輯。順序不可調換：

| 順序 | 條件 | 錯誤訊息 |
|:--:|------|---------|
| 1 | 驗證碼欄位為空 | `請輸入驗證碼` |
| 2 | 驗證碼不符 `session['captcha']`（比對前先 `.upper()`） | `驗證碼錯誤，請重新輸入` |
| 3 | email 或 password 為空 | `請輸入帳號與密碼` |
| 4 | 帳號不存在、或 `is_deleted` 為真、或 `bcrypt.checkpw` 失敗 | `帳號或密碼錯誤` |
| 5 | `is_active` 為假 | `帳號已停用` |
| 6 | 以上皆通過 | 成功：`update_last_login` → 寫入 session → redirect |

**為何驗證碼先於帳密：** 驗證碼是防自動化的第一道關卡，先驗它可以在不查資料庫、不做 bcrypt 運算的情況下擋掉大量無效請求。bcrypt 是刻意設計為慢的運算，把它放在最後可以避免被當成 CPU 消耗的攻擊面。

**為何第 4 步把三種情況合併成同一則訊息：** 帳號不存在、已刪除、密碼錯誤如果給出不同回應，攻擊者就能藉此列舉出哪些 email 曾經註冊過。第 5 步的「帳號已停用」則是刻意例外——停用是可回復的行政狀態，讓使用者知道要去找管理員是合理的。

### 9.3 申請帳號驗證順序

`POST /register`，**不需要驗證碼**：

| 順序 | 條件 | 錯誤訊息 |
|:--:|------|---------|
| 1 | email 或 password 為空 | `請輸入電子郵件與密碼` |
| 2 | email 不符 `EMAIL_REGEX` | `電子郵件格式不正確` |
| 3 | `len(password) < 8` | `密碼至少需要 8 個字元` |
| 4 | `password != confirm_password` | `兩次密碼輸入不一致` |
| 5 | `create_user()` 拋出 `sqlite3.IntegrityError`（email 重複） | `此電子郵件已被使用` |
| 6 | 以上皆通過 | 成功：flash `申請成功，請登入` → redirect `/login` |

第 5 步以捕捉資料庫例外的方式偵測重複，而不是先查詢再插入。這避免了「查詢與插入之間有另一個請求插入同一 email」的競態，UNIQUE 約束是唯一的權威。

### 9.4 會員管理操作驗證順序

所有 `POST /admin/users/<id>/*` 路由共用以下順序：

| 順序 | 條件 | 處置 |
|:--:|------|------|
| 1 | 未登入 | `redirect('/login')` |
| 2 | `_is_usable(user)` 為假 | `session.clear()` + `redirect('/login')` |
| 3 | `_is_admin(user)` 為假 | flash `無操作權限` + `redirect('/')` |
| 4 | 目標會員不存在 | flash `找不到該使用者` + redirect 清單 |
| 5 | 目標是自己（僅 deactivate / delete / role 三條路由） | flash 對應的自我保護訊息 + redirect 清單 |
| 6 | 目標 `is_deleted` 為真 | flash `該帳號已刪除，無法操作` + redirect 清單 |
| 7 | `role` 值非 `'0'` 或 `'1'`（僅 role 路由） | flash `角色值不正確` + redirect 清單 |
| 8 | 以上皆通過 | 執行 `db.*` 寫入 → flash 成功訊息 → redirect 清單 |

第 4 步之所以在第 3 步之後，是因為「目標存不存在」對非管理員來說不應該是可探測的資訊。

### 9.4.1 論壇操作驗證順序

論壇的順序與 admin **相反**：先檢查目標是否存在，再檢查權限。

| 順序 | 條件 | 處置 |
|:--:|------|------|
| 1 | 未登入 | `redirect('/login')`（由 `@login_required` 處理） |
| 2 | `_current_user()` 回傳 `None`（帳號停用或已刪除） | `session.clear()` + `redirect('/login')` |
| 3 | 目標文章／內文不存在，或 `is_deleted = 1` | flash 對應的「不存在或已刪除」訊息 + redirect 論壇主頁 |
| 4 | 權限不足（非原作者且非管理員；刪除則是非管理員） | flash 對應的「無權限…」訊息 + redirect **回該文章** |
| 5 | 標題或內容為空 | 以 `error` 變數重新渲染表單，並回填 `form_data` |
| 6 | 以上皆通過 | 執行 `db.*` 寫入 → redirect（刪除另加 flash 成功訊息） |

**為何論壇的第 3、4 步順序與 admin 相反：** admin 把「目標存在與否」藏在權限檢查之後，是為了不讓非管理員探測出哪些使用者 id 存在——會員清單是敏感資訊。論壇的文章本來就公開可讀，任何人都能從主頁看到有哪些 id，隱藏它沒有意義；反過來，先確認目標存在才能決定 redirect 要回哪一篇，順序反過來反而寫不出來。

**兩種 redirect 目標的區別也值得注意：** 第 3 步回論壇主頁（因為目標不存在，無處可回），第 4 步回該文章（目標存在，只是不能改）。這個差異讓使用者知道自己的操作是「找不到東西」還是「不被允許」。

### 9.5 訊息字串總表

共 33 條。auth 與 admin 的 22 條集中在 `tests/data/users.py` 的 `MESSAGES` 中，修改任何一條時**必須同步更新**，否則測試會失敗。

> 論壇的 11 條**不放進 `MESSAGES`**。`tests/test_forum.py` 把這些字串直接寫在斷言中，沒有 import `MESSAGES`，與 auth／admin 的做法不一致。這個不一致本身列為 KI-29。

**既有 11 條（auth 與 hub 共用）**

| 字串 | 觸發條件 | 傳遞方式 | `MESSAGES` key |
|------|---------|---------|---------------|
| `請輸入驗證碼` | 登入驗證第 1 步 | `error` 變數 | `captchaRequired` |
| `驗證碼錯誤，請重新輸入` | 登入驗證第 2 步 | `error` 變數 | `captchaInvalid` |
| `請輸入帳號與密碼` | 登入驗證第 3 步 | `error` 變數 | `missingCredentials` |
| `帳號或密碼錯誤` | 登入驗證第 4 步 | `error` 變數 | `loginError` |
| `帳號已停用` | 登入驗證第 5 步 | `error` 變數 | `accountDisabled` |
| `申請成功，請登入` | 註冊成功 | `flash(..., 'success')` | `registerSuccess` |
| `此電子郵件已被使用` | 註冊第 5 步 | `error` 變數 | `emailTaken` |
| `電子郵件格式不正確` | 註冊第 2 步 | `error` 變數 | `invalidEmailFormat` |
| `密碼至少需要 8 個字元` | 註冊第 3 步 | `error` 變數 | `passwordTooShort` |
| `兩次密碼輸入不一致` | 註冊第 4 步 | `error` 變數 | `passwordMismatch` |
| `請輸入電子郵件與密碼` | 註冊第 1 步 | `error` 變數 | `missingEmailOrPassword` |

**新增 11 條（admin）**

| 字串 | 觸發條件 | 傳遞方式 | `MESSAGES` key |
|------|---------|---------|---------------|
| `無操作權限` | 非管理員存取 `/admin/*` | `flash(..., 'error')` | `adminForbidden` |
| `不可停用自己的帳號` | R1 | `flash(..., 'error')` | `adminSelfDeactivate` |
| `不可刪除自己的帳號` | R2 | `flash(..., 'error')` | `adminSelfDelete` |
| `不可修改自己的角色` | R3 | `flash(..., 'error')` | `adminSelfRole` |
| `找不到該使用者` | 目標 id 不存在 | `flash(..., 'error')` | `adminUserNotFound` |
| `該帳號已刪除，無法操作` | 目標 `is_deleted = 1` | `flash(..., 'error')` | `adminDeletedUser` |
| `角色值不正確` | `role` 非 `'0'` / `'1'` | `flash(..., 'error')` | `adminInvalidRole` |
| `帳號已啟用` | activate 成功 | `flash(..., 'success')` | `adminActivated` |
| `帳號已停用` | deactivate 成功 | `flash(..., 'success')` | `adminDeactivated` |
| `角色已更新` | role 成功 | `flash(..., 'success')` | `adminRoleUpdated` |
| `帳號已刪除` | delete 成功 | `flash(..., 'success')` | `adminUserDeleted` |

> 注意：`帳號已停用` 這個字串在系統中出現兩次，語意不同。在登入流程中它是**錯誤訊息**（`accountDisabled`，透過 `error` 變數），在會員管理中它是**成功訊息**（`adminDeactivated`，透過 flash）。兩者的 `MESSAGES` key 因此必須分開，測試斷言時要留意上下文。

**論壇 11 條**

| 字串 | 觸發條件 | 傳遞方式 |
|------|---------|---------|
| `請輸入文章標題` | 新增文章或修改標題時，`title` 為空 | `error` 變數 |
| `請輸入文章內容` | 新增文章、回覆或修改內文時，`content` 為空 | `error` 變數 |
| `文章不存在或已刪除` | 回覆、修改標題、刪除文章時目標不存在或已刪除 | `flash(..., 'error')` |
| `內文不存在或已刪除` | 修改內文時目標不存在或已刪除 | `flash(..., 'error')` |
| `回覆不存在或已刪除` | 刪除回覆時目標不存在或已刪除 | `flash(..., 'error')` |
| `無權限修改此文章標題` | 非原發文者且非管理員 | `flash(..., 'error')` |
| `無權限修改此內容` | 非原作者且非管理員 | `flash(..., 'error')` |
| `無權限刪除文章` | 非管理員 | `flash(..., 'error')` |
| `無權限刪除回覆` | 非管理員 | `flash(..., 'error')` |
| `文章已刪除` | 刪除文章成功 | `flash(..., 'success')` |
| `回覆已刪除` | 刪除回覆成功 | `flash(..., 'success')` |

> `請輸入文章內容` 這一條同時服務三條路由（新增文章、回覆、修改內文）。三處的欄位名都是 `content`，訊息因此共用——這是刻意的，讓「內容不可為空」在使用者心中是一條規則而不是三條。
>
> 相對地，「不存在或已刪除」拆成三條（文章／內文／回覆），因為使用者需要知道消失的是哪個層級的東西。

**訊息數量分佈**

| 子系統 | 條數 | 集中於 `MESSAGES` |
|--------|:--:|:--:|
| auth + hub | 11 | 是 |
| admin | 11 | 是 |
| forum | 11 | 否（KI-29） |
| profile | **0** | — |

profile 一條訊息都沒有——它既不驗證輸入，成功後也不回饋（KI-04）。這個空白本身就是那條技術債最直觀的呈現。

### 9.6 flash 的使用慣例與一個例外

- `flash(msg, 'success')` — 操作成功的回饋
- `flash(msg, 'error')` — 操作被拒絕
- Template 端以 `get_flashed_messages(with_categories=true)` 取出

**通則：伴隨 redirect 的訊息用 flash，伴隨重新渲染的訊息用 `error` 變數。**

flash 的價值在於**跨 redirect** 傳遞訊息——它把字串暫存進 session，下一個請求取出後即清除。若當下就要重新渲染同一頁，直接把訊息當成 template 變數傳入更直接，用 flash 反而多繞一圈 session。

依這條通則，全系統的分佈是：

| 情境 | 方式 | 例子 |
|------|------|------|
| 表單驗證失敗，重新渲染同一頁 | `error` 變數 | 登入五種錯誤、註冊四種錯誤、論壇的空標題與空內容 |
| 操作成功或被拒絕，redirect 到別頁 | `flash()` | 註冊成功、admin 全部 11 條、論壇的權限與不存在錯誤、論壇刪除成功 |

註冊成功之所以用 flash，正是因為它會 redirect 到 `/login`，訊息必須跨請求存活。論壇的「無權限修改此文章標題」用 flash，也是因為它會 redirect 回該文章而非重新渲染表單。

一個容易誤判的邊界：論壇的 `文章不存在或已刪除` 出現在 `GET /forum/reply/<id>` 的處理中——雖然是 GET，但處置是 redirect，所以用 flash。判斷依據是**有沒有 redirect**，不是 HTTP method。

---

## 10. 非功能需求

### 10.1 效能

本系統的目標規模是單機教學使用，資料量在數十到數百筆之間。以下取捨在此規模下成立，換到真實規模就不成立：

- **無資料庫索引。** 三張表除了 `users.email` 的 UNIQUE 隱含索引外沒有任何索引。會員清單的關鍵字搜尋使用 `LIKE '%kw%'`，前綴萬用字元讓索引無法生效，是全表掃描。論壇的影響更直接：`list_forum_details()` 以 `WHERE master_id = ?` 撈取回覆，`master_id` 沒有索引，每次開啟一篇文章都要掃描整張 `forum_details` 表（KI-08）
- **文章列表的排序沒有索引支撐。** `list_forum_masters()` 以 `ORDER BY updated_at DESC` 搭配 `LIMIT/OFFSET`，SQLite 必須先排序整張表才能取出前 10 筆。文章數到數千筆時每次載入論壇主頁都會有感
- **bcrypt cost 的兩套值。** 註冊使用 cost=10（約 100 毫秒），種子帳號使用 cost=4（約 1 毫秒）。cost=4 是為了讓測試套件不被雜湊運算拖慢——每個測試函式都會重建資料庫並植入三個帳號，若都用 cost=10，光是 fixture 就會讓整套測試多花數十秒。代價是種子帳號的雜湊強度不足，記錄於 KI-21
- **測試中建立會員的成本。** `db.create_user()` 走 cost=10，撰寫分頁測試時建立 8 筆約需 0.8 秒。測試中不應大量建立會員

### 10.2 安全性

**有做到的：**

- 密碼以 bcrypt 雜湊儲存，資料庫中沒有明文
- `find_user_by_id()` 不回傳 `hash` 欄位，確保密碼雜湊不會被傳進 template
- 所有 SQL 皆為 `?` 參數化查詢，**無 SQL injection 風險**。全專案沒有任何以 f-string 或 `.format()` 組裝的 SQL
- 圖形驗證碼阻擋最基本的自動化登入
- 登入錯誤訊息不洩漏帳號是否存在
- 三層權限檢查，且順序經過設計
- **論壇內容的 XSS 由 Jinja2 的自動跳脫擋住。** 模板以 `{{ d['content'] }}` 輸出使用者內容，Jinja2 預設會把 `<`、`>`、`&`、`"`、`'` 轉成 HTML 實體。系統中**沒有任何地方使用 `|safe` 過濾器或 `{% autoescape false %}`**——這是論壇能安全接受任意輸入的唯一理由，新增功能時務必維持

**沒有做到的：** 見第 11 章。其中影響最大的三項是無 CSRF 保護（KI-01）、`SECRET_KEY` 有公開的預設值（KI-05）、`debug=True` 對外綁定（KI-16）。

本系統**不適合部署到公開網際網路**。這不是疏忽，而是教學專案的定位選擇：把安全機制留白，讓它們成為課程後續討論的題材，而不是被框架隱藏起來的既成事實。

### 10.3 可用性與相容性

- 全站伺服器端渲染，不需要 JavaScript 即可完成所有操作（除了驗證碼刷新與刪除確認這兩個增強功能）
- 不依賴任何 CDN 或外部資源，離線環境可正常運作
- `confirm()` 只用在不可逆的刪除操作上。啟用、停用、角色調整都可以再操作一次改回來，因此不加確認對話框

### 10.4 可維護性

- 模組邊界清晰：SQL 只在 `db/`、業務規則只在 `blueprints/`、樣式只在 `static/`
- 每個 Blueprint、`db/`、`tests/` 都有自己的 `CLAUDE.md` 說明職責
- `rules/` 目錄以明文規範路由、表單、SQL、CSS 的慣例，新增子系統時有七項檢查清單可循
- 訊息字串集中在 `tests/data/users.py` 的 `MESSAGES` 中做為測試的單一參照點——**但字串本身仍散落在各 Blueprint 中硬編碼**，兩處需人工保持同步

### 10.5 可測試性

兩個關鍵設計讓測試不需要啟動伺服器或使用 mock 框架：

- **`db.DB_PATH` 可動態替換。** `db/connection.py` 的 `_get_conn()` 在**每次呼叫時**才 `from db import DB_PATH`，而不是在模組載入時綁定。因此測試只要在 fixture 中執行 `db_module.DB_PATH = str(tmp_path / 'test.db')`，後續所有資料存取就自動指向暫存資料庫，不需要重啟 app
- **驗證碼可繞過。** 驗證碼的答案存在 session 中，測試以 `client.session_transaction()` 直接寫入已知答案，就能跳過圖片產生與人工辨識

### 10.6 部署

- Docker 映像基於 `python:3.11-slim`，`EXPOSE 4000`
- `docker-compose.yml` 使用 named volume `db_data` 掛載到 `/app/data`，並將 `DB_PATH` 設為 `/app/data/database.db`，確保容器重建後資料仍在。`docker compose down -v` 才會刪除資料
- `restart: unless-stopped`
- `GET /health` 回傳 `OK` 與 200，供健康檢查使用
- 容器以 `python app.py` 啟動，也就是 Flask 內建的開發伺服器且 `debug=True`。**這只適用於教學環境**（KI-16）

---

## 11. 已知技術債 / Known Issues

本章是這份規格書最重要的部分。

本系統**刻意保留既有的技術債，不做強行強化**。原因是這些債本身就是教材：學生能夠在一個小到讀得完的系統裡，看見「已知的缺陷」如何具體地存在於程式碼中，而不是只在課本上讀到條列的原則。

共 30 條（編號至 KI-31，其中 KI-18 保留不用）。每一條都記錄：描述、影響、**為何本版接受**、修補方向與工作量。

> 編號說明：KI-18 原本指向「`_is_admin` 未搭配 `_is_usable`」。`admin` 子系統已處理這一點，因此它不是本系統的技術債，改列於 §11.5。編號保留不再使用，避免既有交叉引用失效。

### 11.0 為何有些債修、有些不修

納入論壇之後，本系統出現了一個看似矛盾的現象：`forum` 的帳號有效性檢查修了，`profile` 的沒修（KI-03）。這不是前後不一致，而是套用了一條明確的判準：

> **缺陷的影響是否會外溢到當事人以外的人？**

| 子系統 | 停用帳號能做的事 | 影響範圍 | 處置 |
|--------|-----------------|---------|------|
| `profile` | 修改自己的姓名與顯示名稱 | 只有自己。姓名甚至不會出現在任何公開頁面 | **保留**，作為教材 |
| `forum` | 發表文章、回覆、修改內容 | 所有訪客都看得到。等於停用完全失效 | **修補** |

保留 KI-03 的教學價值在於讓學生看見「技術債如何隨新功能擴大影響」；但若連論壇也一併保留，示範的就不再是教學案例，而是一個真的壞掉的權限系統。教材與缺陷之間的界線就畫在這裡。

這條判準應該在課堂上明講——它比任何一條單獨的技術債都更接近真實工程的決策方式。

### 11.1 安全性

**KI-01 — 全站 POST 表單無 CSRF token**
描述：所有 POST 表單都沒有 CSRF token，`requirements.txt` 也沒有 `flask-wtf`。Flask 的 session cookie 未設定 `SameSite`。
影響：攻擊者可以架設外部網頁，誘導已登入的管理員送出偽造的請求，例如停用或刪除任意會員。
為何接受：加入 CSRF 需要引入 `flask-wtf`、在每個表單插入隱藏欄位、在測試中處理 token，會讓「表單送出」這條主線多出一層學生尚未理解的機制。
修補方向：引入 `flask-wtf` 的 `CSRFProtect`，或自行以 session 儲存 token 並在每個 POST 路由比對。工作量約 2 小時，含測試調整。

**KI-02 — 無登入失敗次數限制**
描述：登入沒有任何 rate limiting 或帳號鎖定機制。`users` 表也沒有 `failed_login_count`、`locked_until` 等欄位，資料模型層面就不支援鎖定。
影響：可對任意帳號進行密碼暴力破解。
為何接受：需要新增資料表欄位與時間窗邏輯，超出本系統的範圍。
修補方向：`users` 表加三個欄位，登入失敗時累計、成功時歸零，超過門檻則在時間窗內拒絕登入。工作量約 3 小時。
> **加乘效應警告**：本項與 KI-07（驗證碼可重放）、KI-21（種子帳號 cost=4 且密碼公開）疊加後，管理員帳號可被自動化爆破。三者單獨看都不算致命，合起來就是。

**KI-05 — `SECRET_KEY` 有公開的預設值**
描述：`app.py` 使用 `os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')`。未設環境變數時靜默採用這個字串，而它公開在原始碼中。`docker-compose.yml` 中的 `please-change-this-to-a-random-string` 同樣公開。
影響：知道金鑰的人可以自行簽出任意內容的 session cookie，直接假冒 `user_id = 2`（管理員）。這繞過了整個身分驗證機制。
為何接受：有預設值讓學生 `git clone` 後可以直接 `python app.py`，不需要先設定環境變數。
修補方向：改為未設定環境變數時直接拋出例外（fail fast），或至少在啟動時印出明顯警告。工作量 10 分鐘。

**KI-06 — 無 session cookie 安全設定**
描述：`app.py` 沒有設定 `SESSION_COOKIE_SECURE`、`SESSION_COOKIE_SAMESITE`、`SESSION_COOKIE_HTTPONLY`、`PERMANENT_SESSION_LIFETIME`。
影響：session 沒有過期時間（關閉瀏覽器才失效），HTTP 明文傳輸時不會被阻擋，也缺少 SameSite 這道 CSRF 的緩解。
為何接受：這四個設定值需要理解 cookie 屬性才有意義，屬於後續課程主題。
修補方向：在 `app.py` 加四行 `app.config[...]`。工作量 30 分鐘，含理解各屬性的意義。

**KI-07 — 驗證碼答案在登入成功後未清除**
描述：`session['captcha']` 寫入後從未被 `session.pop()`，只會被下一次 `GET /captcha.png` 覆寫。
影響：同一組驗證碼答案可以在多次 POST 中重複使用。攻擊者只要人工辨識一次，就能以同一個 cookie 無限次嘗試不同密碼——驗證碼作為防自動化機制形同虛設。
為何接受：刻意保留為教材，讓學生看得到這個缺口具體長什麼樣子。
修補方向：登入流程（成功與失敗皆然）結束後執行 `session.pop('captcha', None)`。工作量 15 分鐘，但需同步調整測試中 `_set_captcha` 的呼叫時機。
> 這是本章中**修補成本最低、安全效益最高**的一項。

**KI-12 — 密碼規則只有長度**
描述：唯一的密碼規則是 `len(password) < 8`，且 `8` 是寫死在 Blueprint 中的 magic number。沒有複雜度要求、沒有常見密碼黑名單、沒有與 email 的相似度檢查。此外 bcrypt 會**靜默截斷**超過 72 bytes 的輸入，而系統沒有上限檢查——中文密碼每字 3 bytes，約 24 字就會觸及截斷且使用者無從察覺。系統也完全沒有變更密碼或忘記密碼的功能。
影響：`password123`、`12345678`、`aaaaaaaa` 全部通過。使用者密碼外洩後沒有自救途徑。
為何接受：密碼政策是可以獨立討論的主題，本系統保留最小可行的長度檢查作為「有驗證」的示範。
修補方向：把 `8` 抽成常數；加入 72 bytes 上限檢查；新增 `db.update_password()` 與 `POST /profile/password` 路由。工作量約 3 小時。

**KI-14 — `/logout` 是 GET 且有副作用**
描述：`@auth_bp.route('/logout')` 只接受 GET，卻執行 `session.clear()`。這直接違反 `rules/flask-blueprint.md` 中「有副作用的動作一律用 POST」的規範。
影響：可被 `<img src="/logout">` 之類的方式從外站觸發，造成登出 CSRF。危害輕微（只是被登出），但它是一個規範與實作不一致的明確案例。
為何接受：改成 POST 會讓三個模板的登出連結都要改成表單。
修補方向：改為 `methods=['POST']`，模板中的 `<a>` 改成 `<form>` + `<button>`。工作量 30 分鐘。

**KI-15 — 無 session fixation 防護**
描述：登入成功時直接執行 `session['user_id'] = user['id']`，沒有先 `session.clear()` 或重新產生 session id。
影響：攻擊者若能事先在受害者瀏覽器植入一個已知的 session，該 session 在受害者登入後仍然有效，攻擊者即可共用之。
為何接受：Flask 的 session 是簽章 cookie 而非伺服器端 session store，此攻擊的可行性較低，且完整修補需要理解 session 的實作機制。
修補方向：登入成功時先 `session.clear()` 再寫入 `user_id`。工作量 10 分鐘。

**KI-16 — `debug=True` 且綁定 `0.0.0.0`**
描述：`app.py` 以 `app.run(host='0.0.0.0', port=4000, debug=True)` 啟動，而 `Dockerfile` 的 `CMD ["python", "app.py"]` 直接走這條路徑。沒有使用 gunicorn 或 waitress 等生產級 WSGI 伺服器。
影響：**這是本系統最嚴重的單一問題。** Werkzeug 的互動式 debugger 會暴露在網路上，任何能觸發例外的人都可以在該頁面執行任意 Python 程式碼，等同於拿到伺服器的完整控制權。同時還會洩漏完整的 traceback 與原始碼。
為何接受：`debug=True` 提供的自動重載與錯誤頁對教學開發流程有實質幫助，而本系統的預期使用環境是本機或課堂內網。
修補方向：以環境變數控制 debug 旗標；Dockerfile 改用 `gunicorn`。工作量 1 小時。
> **本系統不得部署到公開網際網路。** 若有此需求，KI-16 必須先修補。

**KI-21 — 種子帳號的雜湊強度與明文密碼散布**
描述：`_seed_users_if_empty()` 使用 `bcrypt.gensalt(4)`。這個為了加速測試而降低的 cost 值寫在**正式的**種子函式中，因此 `python app.py` 正式啟動時建立的種子帳號也是 cost=4。三組明文密碼同時出現在 `db/users.py`、`README.md`、`tests/data/users.py`、`tests/CLAUDE.md`、`CLAUDE.md` 與本文件中。系統也沒有「首次登入強制改密碼」的機制。
影響：任何部署此專案的環境都帶有已知帳密，其中包含一個管理員帳號。cost=4 的 bcrypt 在現代硬體上接近可暴力破解。
為何接受：種子帳號的目的就是讓學生開箱即用，密碼必須是公開已知的。cost=4 是測試效能的必要取捨（見 §10.1）。
修補方向：把 cost 值抽成兩個常數（`SEED_COST = 4`、`USER_COST = 10`）並加註說明；正式部署時以環境變數控制。工作量 30 分鐘。這一項的本質是「教學便利」與「安全」的直接衝突，無法兩全，只能明確標示。

### 11.2 正確性與一致性

**KI-03 — `POST /profile/update` 缺少帳號有效性檢查** ⚠️
描述：`profile.dashboard_update()` 只套用了 `@login_required`，**沒有** `_is_usable(user)` 檢查。相對地，`profile.dashboard()`（GET）有做這個檢查。
影響：一個已被管理員停用或軟刪除的會員，只要瀏覽器中的 session cookie 還沒被清除，仍然可以成功修改自己的姓名與顯示名稱。

**因為系統有 FR-ADMIN-03（停用）與 FR-ADMIN-05（刪除），這條路徑不只是理論缺陷，而是可實際觸發的行為矛盾**：管理員在會員管理介面按下「停用」，系統顯示「帳號已停用」，但被停用者只要不重新整理頁面、直接送出個人資料表單，寫入依然成功。

為何接受：經明確裁決保留。它是本系統中最好的教材——**技術債不會停留在原地，它會隨著新功能的加入而擴大影響範圍**。一個在舊系統中無關痛癢的疏漏，在新功能的脈絡下變成了功能矛盾。這個現象在真實專案中極為常見，值得學生親眼看見一次。

修補方向：在 `dashboard_update()` 中補上與 `dashboard()` 相同的三行：

```python
user = db.find_user_by_id(session['user_id'])
if not _is_usable(user):
    session.clear()
    return redirect(url_for('auth.login_page'))
```

工作量：3 行程式碼，約 5 分鐘，加上一個測試案例。

> **驗證此行為的方式**：以 `admin_client` 停用 id=1，然後用仍持有 session 的 `authed_client` 送出 `POST /profile/update`，觀察 `db.find_user_by_id(1)['name']` 確實被改變了。

**KI-04 — `POST /profile/update` 無輸入驗證與成功回饋**
描述：`name` 與 `display_name` 只做 `.strip()` 與空字串轉 `None`，沒有長度、字元或內容驗證。資料庫欄位是無長度限制的 `TEXT`。更新成功後直接 redirect，沒有任何 flash 回饋。
影響：可寫入任意長度的字串。使用者送出表單後看不到「已儲存」的確認，只能從畫面上的值判斷。
為何接受：與 KI-03 同屬 profile 子系統，一併保留為教材。
修補方向：加入長度上限檢查與 `flash('已更新', 'success')`。工作量 30 分鐘。

**KI-22 — email 未做大小寫正規化，且登入不驗格式**
描述：`create_user()` 直接以原始字串 INSERT，而 `email` 的 UNIQUE 約束使用 SQLite 預設的 BINARY collation。`EMAIL_REGEX` 只在 `/register` 使用，`/login` 與 hub 內嵌登入完全不驗格式。
影響：`User@example.com` 與 `user@example.com` 會是兩個獨立的帳號。使用者登入時大小寫打錯就會失敗，且錯誤訊息是「帳號或密碼錯誤」，難以自行診斷。
為何接受：刻意保留為教材。
修補方向：`create_user()` 與 `find_user_by_email()` 都對 email 執行 `.lower()`；或把欄位改為 `TEXT COLLATE NOCASE`。工作量 30 分鐘，但既有資料需要遷移。

**KI-23 — hub 內嵌登入是 auth 登入的完整複製**
描述：`blueprints/hub/__init__.py` 的登入處理與 `blueprints/auth/__init__.py` 幾乎逐行相同，包含五條錯誤訊息各自硬編碼兩份。
影響：任何登入政策的強化（失敗鎖定、密碼規則、session 重生、驗證碼清除）都必須同時改兩處。漏改任何一處，攻擊者就能從另一個入口繞過。
為何接受：`document/hub.md` 已把這件事記為既定行為。抽出共用函式會讓兩個 Blueprint 產生依賴，違反「Blueprint 不互相 import」的邊界原則；抽到 `utils.py` 又會讓 `utils.py` 承載業務邏輯。
修補方向：這是一個真正的設計難題，沒有廉價解法。可能的方向是把登入邏輯下放為 `db` 層或獨立的 `services` 模組的函式。工作量 2 小時以上，且會改變專案的分層架構。
> 修補 KI-02、KI-07、KI-15 時，**務必記得兩處都要改**。

### 11.3 資料層

**KI-08 — 無索引**
描述：三張表除了 `users.email` 的 UNIQUE 隱含索引外沒有任何索引。三個具體熱點：`list_users()` 的 `LIKE '%kw%'` 因前綴萬用字元無法用索引；`list_forum_details()` 的 `WHERE master_id = ?` 每次都全表掃描 `forum_details`；`list_forum_masters()` 的 `ORDER BY updated_at DESC` 必須先排序整張表才能取前 10 筆。
影響：在教學規模（數百筆）下無感。`forum_details` 到數千筆時，每開一篇文章都會有可察覺的延遲。
為何接受：符合系統的預期規模。過早最佳化會讓學生誤以為每張表都需要一堆索引。
修補方向：優先加 `CREATE INDEX idx_forum_details_master ON forum_details(master_id)`（效益最大、成本最低），其次 `forum(updated_at)`。關鍵字搜尋要真正加速則需改用 SQLite 的 FTS5。工作量 30 分鐘（前兩個索引）到 3 小時（FTS5）。

**KI-09 — 無 `FOREIGN KEY` 宣告**
描述：三張表之間有三條邏輯關聯（`forum.user_id`、`forum_details.user_id`、`forum_details.master_id`），但全部沒有 `FOREIGN KEY` 宣告，SQLite 的 `PRAGMA foreign_keys` 也未開啟。
影響：資料完整性完全依賴 application 層自律。具體來說：可以寫入指向不存在使用者的文章；刪除文章不會自動刪除回覆（級聯必須在 `soft_delete_forum_master()` 中明寫）；孤兒明細（`master_id` 指向不存在的主檔）不會被資料庫拒絕。
為何接受：在**軟刪除**的前提下 FK 的約束力本來就有限——`ON DELETE CASCADE` 只對實體 DELETE 生效，對 `UPDATE is_deleted = 1` 完全不作用。真正的價值是 `FOREIGN KEY` 能擋住無效的 `user_id` 與 `master_id` 寫入。
修補方向：在兩張 forum 表的 DDL 加上 `REFERENCES`，並在 `_get_conn()` 中執行 `PRAGMA foreign_keys = ON`。工作量 30 分鐘，但既有測試若有插入無效 id 的案例會失敗，需一併檢查。
> 教學建議：讓學生實際插入一筆 `user_id = 999` 的文章，觀察資料庫不會拒絕，然後在論壇主頁看到作者欄是空的（`LEFT JOIN` 找不到對應的 user）。這比任何文字說明都有效。

**KI-10 — 連線管理無 context manager**
描述：每個 `db/` 函式各自呼叫 `_get_conn()` 並在結束前 `conn.close()`，沒有連線池，也沒有使用 `with` 或 `contextlib.closing`。
影響：若 `conn.execute()` 拋出例外，`conn.close()` 會被跳過，連線洩漏。這不是理論問題——`create_user()` 的 `IntegrityError` 就是一條**已知會發生**的例外路徑，每一次重複 email 的註冊嘗試都會洩漏一個連線。
為何接受：手動的 `_get_conn()` / `close()` 讓「開啟連線 → 執行 → 關閉」這三個步驟在每個函式中都清晰可見。SQLite 的連線很輕量，教學規模下不會耗盡資源。
修補方向：改用 `with closing(_get_conn()) as conn:`，或以 Flask 的 `g` 物件搭配 `teardown_appcontext` 管理請求生命週期內的單一連線。工作量 1 小時。

**KI-11 — 軟刪除無還原，且 `hard_delete_*` 是公開 API**
描述：系統只能把 `is_deleted` 設為 1，沒有任何介面或函式可以設回 0——帳號、文章、回覆三者皆然。同時 `hard_delete_user_by_email()` 雖然在 `rules/database.md` 中被標註為「僅供測試清理」，卻由 `db/__init__.py` 匯出成公開 API，沒有任何機制阻止正式程式碼呼叫它。
影響：管理員誤刪後無法從介面復原，必須直接操作資料庫。論壇的情況更嚴重：刪除文章是**級聯**的，一次操作會連同所有回覆一併標記刪除，誤刪的損失是整串討論而非單筆資料。
為何接受：還原功能會讓狀態機從「三態」變成「可逆的四態」，邊界條件顯著增加。論壇的還原更麻煩——若某則回覆是被單獨刪除的，還原整篇文章時它該不該一起回來？資料表沒有記錄「是被級聯刪的還是被單獨刪的」，因此**現有 schema 無法正確還原**。
修補方向：帳號的還原較單純，新增 `db.restore_user()` 與 `POST /admin/users/<id>/restore` 即可（2 小時）。論壇的還原需要先在 `forum_details` 加一個欄位區分刪除來源，才有辦法做對（4 小時以上）。`hard_delete_*` 可改名加底線前綴，或移到 `tests/` 目錄下。

**KI-13 — 無稽核紀錄**
描述：系統不記錄任何管理操作。誰在什麼時候停用了誰、誰把誰升成管理員、誰刪了哪一篇文章，都沒有痕跡。登入失敗同樣沒有記錄——`update_last_login()` 只在成功時執行。
影響：發生爭議或安全事件時無法追溯。這對一個同時具備「帳號治理」與「內容刪除」的系統來說是明顯的缺口——論壇的刪除是**級聯**且**不可還原**的（一次刪掉整串討論），卻沒有任何紀錄說明是誰做的。
為何接受：稽核需要新增資料表與 `db/audit.py` 模組，並在 admin 的四個與 forum 的兩個 POST 路由中插入寫入邏輯，超出本版範圍。
修補方向：新增 `audit_logs` 表（`operator_id`、`target_type`、`target_id`、`action`、`detail`、`created_at`），在六個 POST 路由中寫入。工作量 3 小時。這是本系統最值得的下一步擴充，詳見 §13。
> 設計提示：稽核紀錄是全系統唯一**不應該**套用軟刪除的資料表——一份可以被刪除的稽核紀錄沒有稽核價值。真要做的話，這條例外要寫進 `rules/database.md`。

**KI-20 — 搜尋關鍵字未 escape `LIKE` 萬用字元**
描述：`list_users()` 的關鍵字直接包成 `f'%{keyword}%'`，沒有 escape SQL `LIKE` 的 `%` 與 `_`。
影響：使用者搜尋 `a_c` 時，`_` 會被當成「任意單一字元」，因此 `abc`、`adc` 都會命中。搜尋 `%` 會列出全部。**不是 injection 風險**（參數化查詢已經防住），只是搜尋語意不符預期。
為何接受：影響極輕微，且 escape 邏輯會讓 `list_users()` 的可讀性下降。
修補方向：以 `ESCAPE` 子句搭配自訂逸出字元。工作量 20 分鐘。

**KI-24 — `init_db()` 只在 `__main__` 區塊中執行**
描述：`app.py` 把 `db.init_db()` 放在 `if __name__ == '__main__':` 之內。
影響：以 `python app.py` 啟動時正常；但改用 WSGI 伺服器（例如 `gunicorn app:app`）時，這個區塊不會執行，資料表永遠不會建立，第一個請求就會遇到 `no such table: users`。
為何接受：本系統的兩種啟動方式（本機與 Docker）都走 `python app.py`，此問題不會顯現。
修補方向：把 `db.init_db()` 移到模組層級，或改用 Flask CLI 的 `flask init-db` 命令。工作量 15 分鐘。
> 修補 KI-16（改用 gunicorn）時，**必須同時修補此項**，否則會直接壞掉。

**KI-25 — 無自訂錯誤頁**
描述：全專案沒有任何 `@app.errorhandler` 或 `abort()`。
影響：使用者遇到 404 或 500 時看到的是 Flask 的原生錯誤頁。在 `debug=True` 下更是直接看到完整 traceback（見 KI-16）。
為何接受：教學系統中，原生錯誤頁反而比美化過的錯誤頁更有診斷價值。
修補方向：加入 404 與 500 的 handler 與對應 template。工作量 30 分鐘。

**KI-28 — 論壇內容無長度上限**
描述：`title` 與 `content` 只做 `.strip()` 與非空檢查，沒有任何長度上限。資料庫欄位是無長度限制的 `TEXT`，前端也沒有 `maxlength` 屬性。
影響：單一使用者可以寫入任意大小的內容，撐爆資料庫或讓論壇主頁載入緩慢（標題會直接渲染在列表中）。這不是 XSS——Jinja2 的自動跳脫已經擋住了——而是純粹的資源耗用。配合 KI-02（無 rate limiting），一個腳本就能塞滿磁碟。
為何接受：加入長度檢查需要同時決定「多長算長」、在前後端各實作一次、並補上對應的測試與訊息字串，而這個決定沒有客觀答案。
修補方向：在 `blueprints/forum/__init__.py` 定義 `_MAX_TITLE = 200`、`_MAX_CONTENT = 10000` 兩個常數並加入驗證，模板加 `maxlength`，新增兩條訊息字串。工作量 1 小時。

**KI-29 — 論壇訊息字串未納入 `MESSAGES`**
描述：auth 與 admin 的 22 條訊息集中在 `tests/data/users.py` 的 `MESSAGES` 中，但論壇的 11 條直接硬編碼在 `tests/test_forum.py` 的斷言裡。
影響：同一個專案有兩套訊息字串的管理方式。修改論壇訊息時必須自己記得去改測試，沒有集中的地方可查。
為何接受：`tests/test_forum.py` 的 39 個案例把訊息直接寫在斷言中，改寫成引用 `MESSAGES` 要動到的行數遠多於它換來的一致性。
修補方向：在 `tests/data/` 新增 `forum.py` 存放論壇的 `MESSAGES`，並改寫 `test_forum.py` 的斷言。工作量 1 小時。

**KI-30 — 可以刪除首篇內文，留下沒有內文的文章**
描述：`POST /forum/delete/detail/<id>` 不檢查目標是否為 `is_original_post = 1` 的那一筆。管理員刪掉它之後，該文章仍然存在於列表中、仍有標題、仍有其他回覆，但點進去看不到原始貼文。
影響：產生一個語意不完整的狀態。使用者看到的是一串回覆卻不知道在回覆什麼。
為何接受：要處理的話有三種選擇（禁止刪除首篇／刪首篇即刪整篇／顯示「原文已刪除」佔位），三者都合理，選哪一個屬於產品決策而非技術問題。
修補方向：建議採第三種——在 `list_forum_details()` 中不過濾首篇，改在模板中對已刪除的首篇顯示佔位文字。這保留了討論脈絡，也不會讓管理員的操作產生意外的連鎖。工作量 1 小時。

**KI-27 — 種子帳號的 id 是隱含綁定**
描述：`_SEED_USERS` 的 INSERT 沒有顯式指定 id，1／2／3 是由 AUTOINCREMENT 依插入順序產生的。但 `tests/conftest.py` 的 `authed_client`、`admin_client`、`other_client` 三個 fixture 直接寫死 `sess['user_id'] = 1/2/3`。
影響：若有人調整 `_SEED_USERS` 的順序，全套測試的權限斷言會**靜默錯位**——測試仍然通過或失敗，但驗證的已經不是原本的身分。
為何接受：`_SEED_USERS` 的順序不常變動。
修補方向：INSERT 時顯式指定 id，或在 `tests/data/users.py` 中以 email 查詢 id 而非寫死。工作量 30 分鐘。

### 11.4 使用者體驗與前端

**KI-17 — admin POST 動作後不保留篩選狀態**
描述：四個管理動作成功後一律 `redirect(url_for('admin.user_list'))`，不帶任何 query string。
影響：管理員在「已停用」篩選的第 3 頁對某人執行操作，操作完會被丟回「全部」篩選的第 1 頁，必須重新篩選與翻頁。連續處理多筆時很不順手。
為何接受：保留狀態需要在每個表單中夾帶 hidden 欄位，或在 redirect 時重組 query string，會讓路由與模板都變複雜。
修補方向：在每個 inline form 中加入 `<input type="hidden" name="page">` 等欄位，redirect 時帶回。工作量 1 小時。

**KI-19 — 狀態 badge 底色未納入 token 體系**
描述：啟用／停用／已刪除／管理員／一般使用者這五種 badge 的底色硬編碼在 `admin.css` 中，因為 `common.css` 只定義了按鍵顏色，沒有狀態語意色。
影響：違反「顏色的單一來源」原則。日後要調整狀態色需要改各子系統的 CSS。
為何接受：全站各子系統一致地這樣處理，一致性優先於原則的完整性。
修補方向：在 `common.css` 補上 `--badge-success-*`、`--badge-warning-*`、`--badge-neutral-*` 等 token。工作量 30 分鐘。

**KI-31 — `hub.css` 的兩個按鍵未使用設計 token**
描述：`.hub-register-link`（#4a90e2 / #357abd）與 `.hub-logout`（#e53935 / #c62828）在視覺與語意上都是按鍵，卻把顏色寫死，沒有引用 `common.css` 的 `--btn-primary-*` 與 `--btn-danger-*`。
影響：違反專案自己宣告的「`common.css` 是全站按鍵顏色的單一來源」規範。日後調整主色時，首頁 topbar 的這兩顆按鍵不會跟著變，會出現視覺不一致。實際色值與 token 相近但不完全相同（`--btn-primary-bg` 是 #1a73e8，這裡是 #4a90e2）。
為何接受：`hub.css` 依建置流程書是**逐字複製**的檔案，改它會讓「原樣沿用」這個標記失真。而且這正好示範了一件事——規範是後來才建立的，既有程式碼不會自動符合它。
修補方向：兩個規則的四個色值改為 `var(--btn-primary-bg)`、`var(--btn-primary-hover)`、`var(--btn-danger-bg)`、`var(--btn-danger-hover)`。工作量 5 分鐘，但首頁 topbar 的按鍵顏色會微幅改變。
> 稽核時容易漏掉這一項，因為 `.hub-register-link` 與 `.hub-logout` 的類別名稱不含 `btn`，以「btn」為關鍵字的 grep 抓不到。

**KI-26 — `base.html` 沒有共用的 flash 區塊**
描述：`base.html` 只有 14 行，提供 `title`、`head`、`body` 三個 block，沒有統一的 flash 訊息渲染。各 template 自行處理 `get_flashed_messages()`。
影響：新增頁面時容易忘記加 flash 區塊，導致訊息送出了卻不顯示。`rules/flask-blueprint.md` 中「flash 分類視 `base.html` 的實作而定」這句話目前沒有對應的實作。
為何接受：刻意保留為教材。
修補方向：在 `base.html` 的 `body` block 之前加入統一的 flash 渲染區塊，各子系統移除自己的版本。工作量 45 分鐘，需同時調整五個 template 與對應的 CSS。

### 11.5 幾項刻意的強化

以下幾項是刻意做強的地方，記錄於此以說明取捨：

| 項目 | 若不處理會怎樣 | 本系統的做法 |
|------|---------|--------|
| `auth/login.html` 的標題標籤 | `<h2>範例系統 v1.0</h1>` 開閉不匹配 | 修正為 `</h2>` |
| `profile/dashboard.html` 的樣式 | 第 5–76 行為內嵌 `<style>`，色碼硬編碼，未使用 token | 外提為 `static/profile.css`，class 加 `profile-` 前綴，顏色改用 `var(--btn-*)` |
| `blueprints/auth/__init__.py` | `login_required` 被 import 但整檔未使用 | 移除該 import |
| `blueprints/hub/CLAUDE.md` | 描述「未登入 → redirect `/login`」，與程式碼不符 | 更正為「未登入退回訪客視圖，可內嵌登入」 |
| `tests/data/users.py` 首行註解 | 寫 `db._seed_if_empty()`，函式名已改 | 更正為 `db.users._seed_users_if_empty()` |
| `admin` 的權限檢查 | `_is_admin` 未搭配 `_is_usable` 時，停用中的管理員仍可通過 | 採三段式檢查，並以專屬測試案例守住 |
| **`forum` 的帳號有效性檢查** | `blueprints/forum/__init__.py:11-15` 的 `_current_user()` 只查 id 不驗狀態；該檔第 4 行未 import `_is_usable`。停用或已刪除的帳號仍可發文、回覆、修改、刪文 | `_current_user()` 加入 `_is_usable` 判斷，不通過即回傳 `None`。判準見 §11.0 |
| `blueprints/forum/CLAUDE.md` 的表名 | 寫作 `forum_masters`，實際表名是 `forum` | 更正為 `forum` |

`forum` 這一項的修正細節：

```python
def _current_user():
    """從 session 取得目前登入且帳號有效的使用者，否則回傳 None。"""
    if 'user_id' not in session:
        return None
    user = db.find_user_by_id(session['user_id'])
    return user if _is_usable(user) else None
```

同時第 4 行的 import 改為 `from utils import _is_usable, login_required`。

因為 `_current_user()` 在帳號失效時回傳 `None`，而所有寫入類路由都在 `@login_required` 之後立刻取用 `user['id']`，若不額外處理會拋出 `TypeError`。因此每條寫入類路由在取得 `user` 之後必須加上：

```python
if user is None:
    session.clear()
    return redirect(url_for('auth.login_page'))
```

`forum.index` 是唯一**不加**這段的路由——它必須把 `None` 當成合法的訪客狀態繼續渲染。

對應的測試案例（`tests/test_forum.py`，共 42 條）：

- `test_new_post_disabled_user_redirects_to_login` — 以 `other_client`（id=3，停用）POST `/forum/new`，斷言 302 → `/login` 且 `db.list_forum_masters()` 的 total 未增加
- `test_reply_disabled_user_redirects_to_login` — 同上，針對回覆
- `test_index_disabled_user_sees_guest_view` — 停用帳號 GET `/forum` 得到 200，且頁面不含「發表文章」

---

## 12. 測試策略

### 12.1 測試層級

本系統**不區分單元測試與整合測試**。所有測試都透過 Flask test client 發出 HTTP 請求，斷言回應與資料庫狀態。理由是這個系統的每一層都很薄——Blueprint 只有幾十行、`db/` 函式各只有幾行——分層測試會產生大量沒有診斷價值的樣板，而端到端的路由測試能直接對應到功能需求。

不使用 mock 框架。需要控制的外部因素只有兩個（資料庫路徑與驗證碼），兩者都以更直接的方式處理，見 §12.2。

### 12.2 隔離機制

每個測試函式都拿到一個全新的資料庫：

```python
@pytest.fixture
def app(tmp_path):
    flask_app.config['TESTING'] = True
    db_module.DB_PATH = str(tmp_path / 'test.db')
    db_module.init_db()
    yield flask_app
```

關鍵在於 `db_module.DB_PATH = ...` 這一行直接指派模組屬性，而 `db/connection.py` 的 `_get_conn()` 在**每次呼叫時**才 `from db import DB_PATH`。這讓路徑替換立即生效，不需要重啟 app 或使用 monkeypatch。

fixture 沒有 teardown，靠 pytest 的 `tmp_path` 自動清理暫存目錄。

驗證碼以 helper 直接寫入 session 繞過：

```python
def _set_captcha(client, answer='ABCDE'):
    with client.session_transaction() as sess:
        sess['captcha'] = answer
```

### 12.3 Fixtures

| Fixture | Scope | 說明 |
|---------|-------|------|
| `app` | function | 暫存 DB + 種子資料；`TESTING = True` |
| `client` | function | Flask test client（未登入） |
| `authed_client` | function | `session['user_id'] = 1`（一般使用者） |
| `admin_client` | function | `session['user_id'] = 2`（管理員） |
| `other_client` | function | `session['user_id'] = 3`（停用帳號，session 直接注入） |

`other_client` 在本系統中有兩個用途：測試「非本人、非管理員」的權限邊界，以及測試「持有舊 session 的停用帳號」在各路由的行為——後者正是驗證 KI-03 的關鍵工具。

### 12.4 測試檔案與案例數

| 檔案 | 對應 | 案例數 |
|------|------|:---:|
| `tests/test_auth.py` | auth Blueprint | 23 |
| `tests/test_hub.py` | hub Blueprint | 9 |
| `tests/test_profile.py` | profile Blueprint | 8 |
| `tests/test_admin.py` | admin Blueprint | 約 30 |
| `tests/test_forum.py` | forum Blueprint | 42 |
| **合計** | | **約 112** |

`tests/test_admin.py` 的案例分佈：

- **權限守門（10）** — 匿名、一般使用者、管理員三種身分 × 清單／明細／三個 POST 動作。其中 `test_user_list_disabled_admin_redirects_to_login` 專門守住 §4.4 的守門順序：先 `db.set_user_role(3, 0)` 讓 id=3 成為管理員（但 `is_active = 0`），再以 `other_client` 存取，驗證第 2 層檢查先於第 3 層生效。所有 POST 被擋的案例**必須同時斷言資料庫未改變**，只驗 302 不足以證明後端擋住了
- **清單、篩選、搜尋、分頁（7）** — 四種 `status` 的篩選結果、關鍵字比對 email 與 name、第二頁的分頁。分頁測試以 local fixture 用 `db.create_user()` 補 8 筆湊足 11 筆
- **啟用與停用（6）** — 正常停用、正常啟用、redirect 目標、R1 自我保護、目標不存在、目標已刪除
- **角色調整（4）** — 升為管理員、降為一般使用者、R3 自我保護、非法 role 值
- **刪除（3）** — 正常軟刪除、R2 自我保護、刪除後無法登入（整合案例：軟刪除 id=1 → `_set_captcha` → `POST /login` → 斷言「帳號或密碼錯誤」）

`tests/test_hub.py` 共 9 條：論壇卡片的斷言（`'論壇'` 與 `/forum` 存在）、「管理員看得到會員管理卡片」與「一般使用者看不到」。

`tests/test_forum.py` 的 42 條分佈：

| 分組 | 條數 | 涵蓋 |
|------|:--:|------|
| 瀏覽 | 6 | 訪客可讀、顯示文章、顯示內文、已刪除的主檔不顯示、已刪除的明細不顯示、分頁 |
| 新增文章 | 6 | 未登入導向、GET 表單、空標題、空內容、成功後 redirect、**確認主檔與明細都被寫入** |
| 回覆 | 6 | 未登入導向、GET 表單、空內容、成功、目標不存在、目標已刪除 |
| 修改標題 | 6 | 未登入、原作者可改、管理員可改、他人不可改、空標題、成功 |
| 修改內文 | 6 | 同上結構 |
| 刪除文章 | 5 | 未登入、一般使用者被拒、確認是軟刪除、刪除後不再顯示、**確認級聯到所有回覆** |
| 刪除回覆 | 4 | 未登入、一般使用者被拒、確認是軟刪除、刪除後不再顯示 |
| **守門修正（新增）** | 3 | 停用帳號無法發文、無法回覆、瀏覽時退回訪客視圖 |

其中兩條特別重要：`test_new_post_creates_master_and_detail` 驗證 transaction 的兩張表都寫成功；`test_delete_master_cascades_to_details` 驗證級聯是在 application 層正確實作的。這兩條是主檔／明細模式的核心保證，若沒有它們，transaction 寫錯了測試也不會發現。

測試資料以 local fixture 建立，不動種子資料：

```python
@pytest.fixture
def forum_post(app):
    """建立一篇論壇測試文章，發文者 user@example.com（ID=1）。"""
    return db.create_forum_master('測試文章標題', '測試文章內文', 1)
```

論壇的 fixture 不涉及 bcrypt，建立成本極低，分頁測試可以放心建立十幾筆。這與 admin 的 `many_users` fixture（每筆約 0.1 秒）形成對比。

### 12.5 覆蓋原則

每個功能都應覆蓋四個面向（`rules` 與 `tests/CLAUDE.md` 的既有要求）：

1. **正常流程** — 合法輸入產生預期結果
2. **邊界條件** — 空值、超長、不存在的 id、超出範圍的頁碼
3. **權限控制** — 未登入、一般使用者、管理員、他人四種身分
4. **狀態驗證** — 不只斷言 HTTP 回應，也要用 `db.find_user_by_id()` 確認資料庫真的（或真的沒有）改變

第 4 點在 admin 的測試中特別重要。一個被權限擋下的 POST 也會回 302，只斷言狀態碼無法區分「被擋下」與「執行成功後 redirect」。

### 12.6 已知的測試缺口

- **fixture 沒有 teardown**，依賴 `tmp_path` 清理。若未來加入其他外部資源（檔案、快取），需要補上
- **沒有 CSS 與 JavaScript 的測試**。`.login-form` class 是否存在、按鈕是否使用 token 顏色，只能靠 `grep` 稽核（見建置流程書 Phase 8）
- **沒有端到端瀏覽器測試**。驗證碼圖片的實際可辨識性、`confirm()` 對話框的行為都未被測試
- **`GET /captcha.png` 只驗證 content type 與 session 內容**，不驗證圖片本身
- **`db.create_user()` 使用 cost=10**，讓需要建立多筆會員的測試明顯變慢。撰寫測試時應控制建立數量
- **訊息字串在 Blueprint 與 `tests/data/users.py` 中各存一份**，沒有機制保證同步。改動訊息時若忘記更新測試資料，測試會以「找不到預期字串」的形式失敗——這其實是刻意的，讓遺漏無法靜默通過
- **論壇訊息字串未納入 `MESSAGES`**（KI-29），管理方式與其他子系統不一致
- **沒有測試驗證 XSS 防護**。Jinja2 的自動跳脫是論壇能安全接受任意輸入的唯一依據，但沒有任何案例送入 `<script>` 來確認它確實生效。若日後有人在模板中加了 `|safe`，測試不會發現。建議補一條
- **transaction 的 rollback 路徑未被測試**。`create_forum_master()` 的兩個 INSERT 若第二個失敗應該整筆回滾，但沒有案例製造這個失敗情境

### 12.7 執行測試

```bash
pytest                          # 全部
pytest tests/test_admin.py -v   # 單一模組，顯示每個案例
pytest -k "test_deactivate"     # 名稱符合的案例
pytest -q --durations=5         # 顯示最慢的五個案例
```

---

## 13. 未來擴充建議

依「投入產出比」由高到低排序：

| 優先 | 項目 | 說明 | 估計工作量 |
|:--:|------|------|-----------|
| 1 | 修補 KI-07（驗證碼清除） | 最低成本、最高安全效益的一項 | 15 分鐘 |
| 2 | 論壇索引（KI-08） | `CREATE INDEX idx_forum_details_master ON forum_details(master_id)`。單行 SQL，隨資料量成長效益立刻顯現 | 15 分鐘 |
| 3 | 稽核紀錄（KI-13） | 新增 `audit_logs` 表與 `db/audit.py`，在 admin 的四個與 forum 的兩個 POST 路由中寫入。論壇的刪除是級聯且不可還原的，卻沒有任何紀錄說明是誰做的——這使稽核從「有比較好」變成「應該要有」 | 3 小時 |
| 4 | 論壇內容長度上限（KI-28） | 兩個常數 + 驗證 + `maxlength` + 兩條訊息 | 1 小時 |
| 5 | 變更密碼 | `db.update_password()` + `POST /profile/password`，含舊密碼驗證 | 2 小時 |
| 6 | CSRF 保護（KI-01） | 引入 `flask-wtf`，全站表單加 token。表單數已隨論壇增加，做得越晚成本越高 | 2 小時 |
| 7 | 帳號軟刪除還原（KI-11） | 需先定義還原後的 `is_active` 狀態 | 2 小時 |
| 8 | 論壇搜尋 | 依標題或內容搜尋文章，沿用 `list_users` 的關鍵字模式 | 2 小時 |
| 9 | 忘記密碼 | 需要 email 發送能力，會引入新的外部相依 | 1 天 |
| 10 | Email 驗證 | 註冊後寄送驗證信，`users` 表加 `is_verified` 欄位 | 1 天 |
| 11 | 會員清單 CSV 匯出 | 管理員匯出目前篩選結果 | 2 小時 |
| 12 | 批次操作 | 表格加 checkbox，一次停用或刪除多筆。**需先確認自我保護規則在批次情境下仍然成立** | 4 小時 |

**明確不建議做的兩件事：**

| 項目 | 為何不做 |
|------|---------|
| 刪除帳號時連帶刪除其論壇內容 | 會抹掉其他人在該串下的回覆。且與 §4.2 的設計原則（討論的脈絡屬於整個討論區）直接衝突。若真有此需求，正確做法是把作者顯示名稱換成「已刪除的使用者」而非刪除內容 |
| 論壇的巢狀回覆（回覆某則回覆） | 需要在 `forum_details` 加自我關聯的 `parent_id`，並在模板中做遞迴渲染。這會讓目前極易讀懂的兩層結構變成任意深度的樹，教學成本遠高於效益 |

---

## 附錄 A：路由與訊息字串對照

| 路由 | 可能出現的訊息 |
|------|---------------|
| `POST /login`、`POST /` | 請輸入驗證碼／驗證碼錯誤，請重新輸入／請輸入帳號與密碼／帳號或密碼錯誤／帳號已停用 |
| `POST /register` | 請輸入電子郵件與密碼／電子郵件格式不正確／密碼至少需要 8 個字元／兩次密碼輸入不一致／此電子郵件已被使用／申請成功，請登入（flash） |
| `GET /profile`、`POST /profile/update` | 無（KI-04） |
| `GET /admin/users` | 無操作權限（非管理員時） |
| `GET /admin/users/<id>` | 無操作權限／找不到該使用者 |
| `POST /admin/users/<id>/activate` | 無操作權限／找不到該使用者／該帳號已刪除，無法操作／帳號已啟用 |
| `POST /admin/users/<id>/deactivate` | 無操作權限／找不到該使用者／不可停用自己的帳號／該帳號已刪除，無法操作／帳號已停用 |
| `POST /admin/users/<id>/role` | 無操作權限／找不到該使用者／不可修改自己的角色／該帳號已刪除，無法操作／角色值不正確／角色已更新 |
| `POST /admin/users/<id>/delete` | 無操作權限／找不到該使用者／不可刪除自己的帳號／該帳號已刪除，無法操作／帳號已刪除 |
| `GET /forum` | 無 |
| `GET/POST /forum/new` | 請輸入文章標題／請輸入文章內容 |
| `GET/POST /forum/reply/<id>` | 文章不存在或已刪除／請輸入文章內容 |
| `GET/POST /forum/edit/master/<id>` | 文章不存在或已刪除／無權限修改此文章標題／請輸入文章標題 |
| `GET/POST /forum/edit/detail/<id>` | 內文不存在或已刪除／無權限修改此內容／請輸入文章內容 |
| `POST /forum/delete/master/<id>` | 文章不存在或已刪除／無權限刪除文章／文章已刪除 |
| `POST /forum/delete/detail/<id>` | 回覆不存在或已刪除／無權限刪除回覆／回覆已刪除 |

## 附錄 B：詞彙表

| 中文 | 英文 | 在本系統中的具體所指 |
|------|------|---------------------|
| 藍圖 | Blueprint | Flask 的模組化路由單位，本系統有 4 個 |
| 樣板 | Template | Jinja2 的 `.html` 檔，位於 `templates/` |
| 軟刪除 | Soft delete | 設定 `is_deleted = 1`，不執行 SQL DELETE |
| 種子資料 | Seed data | `init_db()` 在資料表為空時自動植入的三個帳號 |
| 設計 token | Design token | `common.css` 中的 CSS 自訂屬性，全站顏色的單一來源 |
| 雜湊 | Hash | bcrypt 產生的不可逆密碼字串，存於 `users.hash` |
| 冪等 | Idempotent | 執行一次與執行多次結果相同，例如 `POST /activate` |
| 可達性 | Reachability | 某個系統狀態是否可能透過合法操作序列到達，見 §4.5 |
| 主檔／明細 | Master / Detail | 一對多的資料表配對。本系統的 `forum` 與 `forum_details` |
| 交易 | Transaction | 多個 SQL 語句要嘛全部成功、要嘛全部回滾。本系統有三處，全在 `db/forum.py` |
| 級聯 | Cascade | 刪除主檔時連帶處理明細。本系統在 application 層明寫，不靠資料庫的 `ON DELETE CASCADE` |
| 自動跳脫 | Auto-escaping | Jinja2 預設把 `<`、`>` 等字元轉成 HTML 實體，是論壇防 XSS 的唯一機制 |
