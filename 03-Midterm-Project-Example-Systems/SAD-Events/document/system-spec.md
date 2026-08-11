# 校園活動報名系統 — 系統規格書

## 0. 文件資訊

| 項目 | 內容 |
|------|------|
| 文件名稱 | 校園活動報名系統 系統規格書 |
| 版本 | v1.0 |
| 日期 | 2026-08-11 |
| 適用讀者 | 修習系統分析與設計課程的學生、後續維護此專案的開發者 |
| 系統版本 | 校園活動報名系統 v1.0 |

### 0.1 文件定位

本專案的文件分為四層，各自回答不同的問題。撰寫或閱讀時請先確認自己需要的是哪一層：

| 文件 | 回答的問題 |
|------|-----------|
| `document/system-spec.md`（本文件） | 這個系統**是什麼**：功能、資料、規則、限制 |
| `document/build-guide.md` | 這個系統**怎麼建**：從空目錄到可執行的分階段步驟與驗收方式 |
| `CLAUDE.md`、各子目錄的 `CLAUDE.md` | AI 助理與開發者**怎麼協作**：專案速查、模組職責 |
| `rules/flask-blueprint.md`、`rules/database.md` | 寫程式時**要遵守什麼**：路由、表單、SQL、CSS 的具體慣例 |
| `document/auth.md`、`hub.md`、`profile.md`、`admin.md`、`events.md` | 單一子系統的**細部行為**：資料流、錯誤情境、畫面欄位 |

本文件是其他文件的上位依據。當本文件與其他文件衝突時，以本文件為準，並回頭修正衝突的那一份。

---

## 1. 專案定位與範圍

### 1.1 系統目的

本系統是一套以**學習與可理解性為優先**的校園活動報名系統，用於系統分析與設計課程的教學。
它刻意維持小規模、不做過度抽象，讓學生能在一到兩小時內讀完全部程式碼，
並且看清楚「使用者在瀏覽器上的一個動作」是如何一路走到資料庫，再走回畫面的。

系統提供五件事：讓訪客申請帳號並登入、讓會員查看與修改自己的資料、讓管理員治理所有會員帳號、
讓任何會員辦一場活動、讓任何會員報名別人辦的活動。

前三件構成一條完整的**帳號生命週期**；後兩件是本系統的主體，
提供了單純的會員系統問不出來的三類問題：

1. **權限不只看身分，也看關係。** 「活動發起者」不是一個角色欄位，而是
   `user['id'] == event['user_id']` 這個比較的結果。同一個人對 A 活動有修改權、對 B 活動沒有
2. **狀態不只由使用者決定，也由時間與資源決定。** 一場活動會**自己**從「尚未開放」
   變成「可報名」再變成「報名已截止」，中間沒有任何人按過按鈕
3. **資源是有限且互斥的。** 名額被別人佔走，你就報不到——這讓「檢查」與「寫入」之間的
   時間差第一次有了實質後果

### 1.2 範圍

**範圍內：**

- Hub 首頁（訪客瀏覽 + 內嵌登入表單；登入後的服務入口）
- 身分驗證（登入、申請帳號、登出、圖形驗證碼）
- 個人資料（本人查看與編輯姓名、顯示名稱）
- 會員管理（管理員專用：會員清單、篩選、搜尋、分頁、啟用／停用、角色調整、軟刪除）
- 校園活動報名（活動瀏覽、新增、修改、刪除、報名、取消、修改報名資訊、個人報名紀錄）
- 健康檢查端點
- 上述功能的自動化測試
- Docker 容器化部署設定

**範圍外（明確不包含）：**

- 討論區（forum）
- 器材借用（equipment）
- 候補機制（`waiting` 狀態雖存在於 DDL，但沒有任何路由會產生它，見 KI-14）
- 管理者強制取消他人報名（`rejected` 狀態同理）
- 活動的分類、標籤、搜尋與排序切換
- 報名通知（email、站內信）
- 報名資料匯出（CSV、Excel）

這些功能的設計方向見第 13 章。

### 1.4 名詞定義

| 名詞 | 定義 |
|------|------|
| 會員（user） | `users` 表中的一筆紀錄。訪客申請帳號後即成為會員 |
| 訪客（guest） | 沒有有效 session 的瀏覽者。可瀏覽首頁與活動、可申請帳號，不能報名 |
| 角色（role） | 整數欄位。`0` = 管理員，`1` = 一般使用者 |
| 活動發起者（organizer） | **不是角色，是關係。** `user['id'] == event['user_id']` 成立時，該使用者是該活動的發起者 |
| 啟用／停用（`is_active`） | `1` = 啟用，`0` = 停用。停用帳號無法登入 |
| 軟刪除（`is_deleted`） | `1` = 已刪除。系統**不執行實體 DELETE**，刪除只是把旗標設為 1 |
| 帳號可用（usable） | `utils._is_usable(user)` 的判定結果：使用者存在、`is_active` 為真、`is_deleted` 為假 |
| 種子帳號（seed user） | 資料庫初次建立時自動植入的三個示範帳號 |
| 種子活動（seed event） | 資料庫初次建立時自動植入的五筆示範活動，各對應一種活動狀態 |
| 活動（event） | `events` 表中的一筆紀錄。列表與狀態判斷需要的欄位都在這裡 |
| 活動細節（event detail） | `event_details` 中對應的那一筆，存四段長文字。與活動一對一 |
| 報名（registration） | `registrations` 表中的一筆紀錄。一個會員對一場活動最多一筆（`is_deleted = 0` 的） |
| 有效報名 | `registration_status` 為 `registered` 的報名。**只有有效報名佔用名額** |
| 活動狀態 | `_event_status()` 依時間與名額算出的五種值之一，**不存在資料庫中** |
| 報名狀態 | `registrations.registration_status` 欄位，四種值之一，**存在資料庫中** |

> 「活動狀態」與「報名狀態」是兩組完全不同的字彙，容易混淆。
> 前者是**計算出來的**（每次請求重算），後者是**存起來的**。
> 程式中分別以 `STATUS_LABELS` 與 `REG_STATUS_LABELS` 兩個 dict 提供中文標籤，刻意不合併。

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

這一節是教學重點。以下四項在真實專案中通常是標準配備，本系統刻意不用：

**不用 ORM（如 SQLAlchemy）。** 所有資料存取都是手寫的參數化 SQL，集中在 `db/` 套件內。
理由是讓學生直接看到 SQL 語句本身——尤其是 `list_events()` 那條帶 `LEFT JOIN` 與
`GROUP BY` 的查詢，它一次算出所有活動的報名人數，是「用一次查詢取代 N 次查詢」的
具體示範。ORM 的預設行為往往是後者。代價是重複的 `_get_conn()` / `close()` 樣板，記錄於 KI-10。

**不用前端框架（如 React、Vue）。** 全部採伺服器端渲染，瀏覽器收到的就是完成的 HTML。
理由是讓「表單送出 → 路由處理 → 重新渲染」這條迴圈完整可見。
全站只有十處使用 JavaScript：驗證碼刷新的四個 `onclick`，以及刪除／取消確認的六個
`onclick="return confirm(...)"`。

**不用 Flask-Login。** 身分狀態就是 `session['user_id']` 一個整數。
權限檢查是 `utils.login_required` 這個 12 行的裝飾器加上兩個 helper 函式。
理由是讓學生能夠讀完整個身分驗證機制，而不是信任一個黑盒子。代價記錄於 KI-15。

**不用資料庫層的 UNIQUE 約束來保證報名唯一性。**
`registrations` 表刻意**不**加 `UNIQUE(event_id, user_id)`。
理由是要支援「取消後重新報名」——加了 UNIQUE 之後，重新報名只能刪掉舊列再新增，
`cancelled_at` 這段歷史就不見了。唯一性改由 `create_or_restore_registration()` 在
application 層以「先 SELECT 再決定 INSERT 或 UPDATE」的方式維持。
代價是這個檢查不是原子的，記錄於 KI-11。

> 第四項是本系統最值得討論的取捨：**把約束從資料庫搬到應用層，換來狀態歷史的完整性，
> 代價是併發正確性。** 真實系統會兩者兼得（UNIQUE 約束 + 一張獨立的狀態異動表），
> 但那需要第五張資料表，超出教學範圍。

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
app.py                       建立 Flask app、註冊 5 個 Blueprint、設定 secret_key
  │
  ▼
blueprints/<name>/__init__.py  路由、表單處理、權限檢查、業務規則、狀態計算
  │                            （不寫任何 SQL）
  ├──▶ utils.py               跨子系統共用：login_required、_is_usable、_gen_captcha
  │
  ▼
db/                          資料存取層。所有 SQL 集中於此
  │  db/__init__.py           DB_PATH、公開函式匯出、init_db()
  │  db/connection.py         _get_conn()
  │  db/users.py              users 表的所有存取函式
  │  db/events.py             events / event_details / registrations 三表的所有存取函式
  ▼
SQLite（database.db，WAL 模式）
```

回傳路徑：Blueprint 取得資料後呼叫 `render_template()`，Jinja2 以
`templates/<blueprint>/*.html` 渲染出完整 HTML 回傳瀏覽器。

**活動狀態在哪一層計算？** 在 Blueprint 層（`_event_status()`），不在 SQL 中。
理由是狀態的判斷涉及「現在」這個時間點，而 SQLite 的 `datetime('now')` 是 UTC，
與 Python 的 `datetime.now()` 不同基準；把邏輯集中在一處比較不容易出錯。
資料層只負責提供 `registered_count` 這個純資料事實。

### 3.2 模組邊界三原則

1. **SQL 只寫在 `db/` 套件內。** Blueprint 一律透過 `db.<函式名>()` 存取資料，
   不得出現 `sqlite3` 或 SQL 字串
2. **Blueprint 不互相 import。** 子系統之間只透過 `url_for('<blueprint>.<endpoint>')` 建立關聯
3. **`utils.py` 只放與任何子系統都無關的 helper。** 特別是 `_is_admin()` **不得**放進
   `utils.py`（見 `rules/flask-blueprint.md`），各 Blueprint 自行定義

### 3.3 目錄結構

```text
sad-events/
├── app.py                        # 主程式：組裝 Blueprint、啟動伺服器
├── utils.py                      # 跨 Blueprint 共用 helpers
├── requirements.txt
├── pytest.ini                    # 限定測試收集範圍
├── Dockerfile
├── docker-compose.yml
├── .dockerignore
├── database.db                   # SQLite（git 忽略，自動建立）
│
├── db/
│   ├── __init__.py               # DB_PATH；匯出公開函式；init_db()
│   ├── connection.py             # _get_conn()
│   ├── users.py                  # users 表的資料存取
│   ├── events.py                 # 三張活動相關表的資料存取
│   └── CLAUDE.md
│
├── blueprints/
│   ├── __init__.py
│   ├── auth/                     # /login /register /logout /captcha.png
│   ├── hub/                      # /
│   ├── profile/                  # /profile /profile/update
│   ├── admin/                    # /admin/users ...
│   └── events/                   # /events ...（每個目錄含 __init__.py 與 CLAUDE.md）
│
├── templates/
│   ├── base.html
│   ├── auth/{login,register}.html
│   ├── hub/home.html
│   ├── profile/dashboard.html
│   ├── admin/{user_list,user_detail}.html
│   └── events/{index,event_form,registration_form,my_registrations}.html
│
├── static/
│   ├── common.css                # 全站設計 token（顏色變數的單一來源）
│   ├── login.css                 # auth 與 hub 內嵌登入表單
│   ├── hub.css                   # 首頁 layout
│   ├── profile.css               # 個人資料頁
│   ├── admin.css                 # 會員管理頁
│   └── events.css                # 活動報名頁
│
├── tests/
│   ├── conftest.py               # fixtures
│   ├── data/users.py             # 種子帳號、種子活動常數與訊息字串
│   ├── test_{auth,hub,profile,admin,events}.py
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
    └── events.md
```

### 3.4 Blueprint 職責

| Blueprint | 前綴 | 職責 | 守門層級 |
|-----------|------|------|---------|
| `auth` | 無 | 登入、申請帳號、登出、圖形驗證碼 | 無（本身就是入口）；已登入者存取 `/login`、`/register` 會被導回首頁 |
| `hub` | 無 | 服務入口。訪客可瀏覽並內嵌登入；登入後顯示服務卡片 | 無（雙模式） |
| `profile` | 無 | 本人查看與編輯自己的資料 | `@login_required` + `_is_usable`（`GET` 有、`POST` 無，見 KI-03） |
| `admin` | `/admin` | 管理員治理所有會員帳號 | `@login_required` + `_is_usable` + `_is_admin`，每條路由皆是 |
| `events` | `/events` | 活動瀏覽、辦理、報名 | 依路由分級：主頁無守門；寫入類 `@login_required` + `_is_usable`；改／刪活動另加發起者或管理員 |

### 3.5 請求生命週期與 session

1. 瀏覽器送出請求，附上 Flask 的 session cookie（HttpOnly，內容經 `SECRET_KEY` 簽章）
2. Flask 解出 `session['user_id']`（未登入時不存在）
3. `@login_required` 檢查 session 中有無 `user_id`，沒有就 redirect `/login`
4. 路由呼叫 `db.find_user_by_id()` 取得完整使用者資料
5. `_is_usable(user)` 檢查帳號狀態；events 把這一步收斂進 `_current_user()`
6. 業務邏輯 → `db.*` → `render_template()` 或 `redirect()`

session 中**只存 `user_id` 與 `captcha` 兩個鍵**。角色、姓名等一律每次請求重新查資料庫。
好處是管理員調整某人的角色後**立即生效**，不需要對方重新登入；代價是每個請求多一次查詢（KI-09）。

---

## 4. 角色與權限

### 4.1 三個概念：身分、狀態、關係

本系統的權限由三件事共同決定，混為一談是最常見的理解錯誤：

| 概念 | 存在哪裡 | 判定 | 誰能改 |
|------|---------|------|--------|
| **身分**（role） | `users.role` | `0` 管理員 / `1` 一般使用者 | 管理員 |
| **狀態**（usable） | `users.is_active`、`users.is_deleted` | `_is_usable(user)` | 管理員 |
| **關係**（organizer） | `events.user_id` | `user['id'] == event['user_id']` | **沒有人能直接改**——建立活動時自動決定 |

「活動發起者」是本系統最值得注意的設計：它不是一個可以被授予或撤銷的角色，
而是資料本身的屬性。一個人可能同時是 A 活動的發起者、B 活動的報名者、C 活動的路人。
權限判斷因此必須帶著「哪一場活動」這個參數：

```python
def _is_organizer_or_admin(user, event):
    return user is not None and (user['id'] == event['user_id'] or _is_admin(user))
```

對照 `admin` 的 `_is_admin(user)`——它不需要任何額外參數，因為身分與資料無關。

### 4.2 帳號狀態矩陣

| `is_active` | `is_deleted` | 狀態 | 能登入 | 舊 session 能用 | 顯示 |
|:--:|:--:|------|:--:|:--:|------|
| 1 | 0 | 啟用中 | ✅ | ✅ | 啟用中 |
| 0 | 0 | 已停用 | ❌ | ❌ | 已停用 |
| 1 | 1 | 已刪除 | ❌ | ❌ | 已刪除 |
| 0 | 1 | 已刪除 | ❌ | ❌ | 已刪除 |

`is_deleted` 的優先序高於 `is_active`：兩者皆為真時，畫面一律顯示「已刪除」。

「舊 session 能用」那一欄有**一個例外**：`POST /profile/update` 缺少 `_is_usable` 檢查（KI-03），
被停用或刪除的帳號只要 session 未清，仍能修改自己的姓名。這是刻意保留的教材。

### 4.3 權限矩陣

| 動作 | 訪客 | 一般使用者 | 活動發起者 | 管理員 |
|------|:--:|:--:|:--:|:--:|
| 瀏覽首頁 | ✅ | ✅ | ✅ | ✅ |
| 申請帳號、登入 | ✅ | — | — | — |
| 瀏覽活動列表與細節 | ✅ | ✅ | ✅ | ✅ |
| 檢視公開報名名單（報名者 + 報名時間） | ✅ | ✅ | ✅ | ✅ |
| 檢視完整報名名單（含聯絡資訊與已取消紀錄） | ❌ | ❌ | ✅（限自己的活動） | ✅（任何活動） |
| 新增活動 | ❌ | ✅ | ✅ | ✅ |
| 修改活動 | ❌ | ❌ | ✅（限自己的活動） | ✅（任何活動） |
| 刪除活動 | ❌ | ❌ | ✅（限自己的活動） | ✅（任何活動） |
| 報名活動 | ❌ | ✅ | ✅ | ✅ |
| 取消／修改自己的報名 | ❌ | ✅ | ✅ | ✅ |
| 取消／修改**別人**的報名 | ❌ | ❌ | ❌ | ❌ |
| 查看我的報名紀錄 | ❌ | ✅ | ✅ | ✅ |
| 查看與編輯自己的個人資料 | ❌ | ✅ | ✅ | ✅ |
| 會員管理（清單、啟用、停用、角色、刪除） | ❌ | ❌ | ❌ | ✅ |

> **注意最後兩列的不對稱。** 管理員可以刪除任何人的活動，卻**不能**取消任何人的報名。
> 這不是疏漏而是設計：報名紀錄是報名者自己的資料，`registrations` 的所有寫入路由都以
> `user_id = session['user_id']` 為條件。若要提供「管理者強制取消」，
> 應該寫入 `rejected` 狀態並新增一條專屬路由，而不是讓管理員代為執行 `cancel`。
> 目前 `rejected` 是不可達狀態（KI-14）。

### 4.4 三層檢查機制

```
1. @login_required        無 session      -> redirect auth.login_page
2. _is_usable(user)       帳號失效        -> session.clear() + redirect auth.login_page
3. 權限判定                權限不足        -> flash + redirect
```

第 2 層失敗代表**身分本身失效**，處置是登出；第 3 層失敗代表**身分有效但權限不足**，
處置是導回列表或首頁。若把第 3 層放前面，已被停用的管理員會收到與事實不符的
「權限不足」，且 session 不會被清除。

**兩個 Blueprint 用了不同的寫法，這是刻意的：**

| | `admin` | `events` |
|---|---------|----------|
| 第 1、2 層 | 每條路由開頭明碼重複寫出 | 收斂進 `_current_user()` |
| 為什麼 | 沒有開放瀏覽的路由，每一層的處置都不同，收斂反而遮蔽差異 | 有開放瀏覽的 `index`，必須把 `None` 當成合法狀態 |
| 第 3 層 | `_is_admin(user)` | `_is_organizer_or_admin(user, event)` |
| 檢查順序 | 先權限、後查目標是否存在 | 先查活動是否存在、後權限 |
| 為什麼 | 不讓非管理員探測出哪些 user id 存在 | 活動本來就公開可讀，隱藏 id 沒有意義；且要先知道活動存在才能決定 redirect 目標 |

`events._current_user()` 的寫法：

```python
def _current_user():
    if 'user_id' not in session:
        return None
    user = db.find_user_by_id(session['user_id'])
    return user if _is_usable(user) else None
```

因此**七條寫入路由必須各自處理 `user is None`**（`session.clear()` + redirect 登入頁），
`index` 則把 `None` 當成訪客繼續渲染。

> 不要把 `session.clear()` 塞進 `_current_user()`：訪客與失效帳號在它眼中都是 `None`，
> 但只有後者需要清 session。要區分兩者，helper 就得回傳多種狀態，複雜度會失控。

### 4.5 自我保護規則與「最後一個管理員」

管理員對自己的帳號受三條規則限制：

| 規則 | 內容 | 訊息 |
|------|------|------|
| R1 | 不可停用自己 | `不可停用自己的帳號` |
| R2 | 不可刪除自己 | `不可刪除自己的帳號` |
| R3 | 不可修改自己的角色 | `不可修改自己的角色` |

> 令執行操作的管理員為 A。要進入任何一個 admin 路由，A 必須先通過 `_is_usable(A)`
> 與 `_is_admin(A)`。由 R1、R2、R3，A 無法對自己執行停用、刪除或降級。
> 因此任何一次管理動作完成之後，A 仍然是一個「啟用、未刪除、`role = 0`」的帳號。
>
> ∴ 系統中永遠至少存在一個可用的管理員。「所有管理員都被鎖死」這個狀態**不可達**。

系統因此**不實作** `count_active_admins()` 這類計數檢查。

> ⚠️ 若未來放寬 R1–R3 任何一條，必須立即補上「操作後啟用中管理員數 ≥ 1」的檢查，
> 否則系統可被鎖死且無法從介面復原。

`activate_user` 對自己不設限——能執行到那裡的管理員必然已通過 `_is_usable`，
也就是已經是啟用狀態，對自己啟用等同無操作。

---

## 5. 功能需求

### 5.1 首頁（FR-HUB）

| ID | 需求 |
|----|------|
| FR-HUB-01 | `GET /` 對訪客與已登入者皆回傳 200，不 redirect |
| FR-HUB-02 | 已登入時顯示歡迎訊息與服務卡片：校園活動報名、我的報名、個人資料；`role == 0` 時額外顯示會員管理 |
| FR-HUB-03 | 未登入時顯示四張卡片，其中「校園活動報名」可點，其餘三張為 locked 樣式並標示所需權限 |
| FR-HUB-04 | 未登入時在右側顯示內嵌登入表單，含圖形驗證碼 |
| FR-HUB-05 | `POST /` 處理內嵌登入，驗證順序與訊息與 `auth.login_page` **完全相同** |
| FR-HUB-06 | 持有 session 但帳號已停用或刪除時，清除 session 並退回訪客視圖（**不 redirect**） |

### 5.2 身分驗證（FR-AUTH）

| ID | 需求 |
|----|------|
| FR-AUTH-01 | `GET /login` 顯示登入表單；已登入者 redirect `/` |
| FR-AUTH-02 | `POST /login` 依 §9.2 的順序驗證，成功則寫入 `session['user_id']` 並更新 `last_login_at` |
| FR-AUTH-03 | `GET /register` 顯示申請表單；已登入者 redirect `/` |
| FR-AUTH-04 | `POST /register` 依 §9.3 的順序驗證，成功則建立帳號（`role = 1`）並 redirect `/login` + flash |
| FR-AUTH-05 | 申請失敗時保留已填入的 email、姓名、顯示名稱（密碼欄不保留） |
| FR-AUTH-06 | `GET /captcha.png` 產生 5 位英數驗證碼圖片，答案寫入 `session['captcha']` |
| FR-AUTH-07 | `GET /logout` 清除整個 session 並 redirect `/login` |

### 5.3 個人資料（FR-PROFILE）

| ID | 需求 |
|----|------|
| FR-PROFILE-01 | `GET /profile` 顯示 email、姓名、顯示名稱、身份、建立日期、最後登入 |
| FR-PROFILE-02 | `GET /profile?edit=1` 進入編輯模式，姓名與顯示名稱變為輸入欄 |
| FR-PROFILE-03 | `POST /profile/update` 更新姓名與顯示名稱，空字串存為 `NULL`，完成後 redirect `/profile` |
| FR-PROFILE-04 | email、角色、建立時間**不可**由本人修改 |

### 5.4 會員管理（FR-ADMIN）

| ID | 需求 |
|----|------|
| FR-ADMIN-01 | `GET /admin/users` 顯示會員清單，每頁 10 筆 |
| FR-ADMIN-02 | 支援 `?status=all\|active\|disabled\|deleted` 篩選，無效值視同 `all` |
| FR-ADMIN-03 | 支援 `?q=` 關鍵字搜尋 email、姓名、顯示名稱（LIKE 模糊比對） |
| FR-ADMIN-04 | 篩選、搜尋、分頁三者可任意組合 |
| FR-ADMIN-05 | `GET /admin/users/<id>` 顯示會員九個欄位的明細與可用操作 |
| FR-ADMIN-06 | `POST .../activate`、`.../deactivate`、`.../role`、`.../delete` 四個動作，依 §9.4 驗證 |
| FR-ADMIN-07 | 四個動作成功後一律 flash + redirect 回清單（**不帶 query string**，見 KI-17） |
| FR-ADMIN-08 | 管理員可檢視已刪除的會員（`?status=deleted`），但不可對其執行任何操作 |

### 5.5 校園活動報名（FR-EVENT）

#### 瀏覽

| ID | 需求 |
|----|------|
| FR-EVENT-01 | `GET /events` 顯示活動列表，每頁 **5** 筆，依 `event_datetime` **升冪**排列 |
| FR-EVENT-02 | 列表每列顯示 ID、標題、活動時間、`已報名/名額`、狀態 badge |
| FR-EVENT-03 | 已軟刪除的活動不出現在列表中 |
| FR-EVENT-04 | `?event_id=N` 在右側顯示該活動的完整細節；已刪除或不存在時顯示佔位提示 |
| FR-EVENT-05 | 細節區顯示活動時間、地點、對象、名額、報名期間、發起者，以及活動內容、注意事項、聯絡資訊三段長文字（有值才顯示該段） |
| FR-EVENT-06 | 報名期間未設定時，開始顯示「建立後即可」、截止顯示「活動開始前」 |
| FR-EVENT-07 | 訪客可完成上述全部瀏覽動作，不需登入 |

#### 報名名單

| ID | 需求 |
|----|------|
| FR-EVENT-08 | 公開檢視顯示有效報名者的名稱（`COALESCE(name, email)`）與報名時間兩欄 |
| FR-EVENT-09 | 活動發起者或管理員改為顯示九欄完整名單，含真實姓名、電話、Email、用餐、狀態、備註，且**包含已取消的紀錄** |
| FR-EVENT-10 | 完整名單中已取消的列以淡化樣式標示 |

#### 活動管理

| ID | 需求 |
|----|------|
| FR-EVENT-11 | `GET/POST /events/new` 新增活動，需登入且帳號有效 |
| FR-EVENT-12 | 建立活動時**同時**寫入 `events` 與 `event_details`（transaction） |
| FR-EVENT-13 | 建立者自動成為該活動的發起者（`events.user_id`） |
| FR-EVENT-14 | `GET/POST /events/edit/<id>` 修改活動，限發起者或管理員；GET 時以現有資料預填表單 |
| FR-EVENT-15 | 修改時名額**不可低於**目前有效報名人數 |
| FR-EVENT-16 | `POST /events/delete/<id>` 刪除活動，限發起者或管理員；`events` 與 `event_details` 同時標記 `is_deleted = 1` |
| FR-EVENT-17 | 刪除活動**不影響**報名紀錄——報名者仍能在「我的報名」中看到，並標示「活動已撤銷」 |
| FR-EVENT-18 | 表單驗證失敗時重新渲染表單並保留輸入，**不** redirect |

#### 報名

| ID | 需求 |
|----|------|
| FR-EVENT-19 | `GET/POST /events/<id>/register` 報名活動，需登入且帳號有效 |
| FR-EVENT-20 | 僅當活動狀態為 `available` 時允許報名，否則 flash 對應訊息並 redirect |
| FR-EVENT-21 | 已有有效報名時拒絕，flash `您已報名此活動` |
| FR-EVENT-22 | 曾取消過的報名，重新報名時**恢復原本那一列**（UPDATE），不新增第二筆 |
| FR-EVENT-23 | 報名表單欄位：用餐選項（必選，預設不用餐）、真實姓名、電話、Email、備註（皆選填） |
| FR-EVENT-24 | POST 時**重新查詢活動並重算狀態**後才寫入（防止表單停留期間名額被填滿） |
| FR-EVENT-25 | `POST /events/<id>/cancel` 取消自己的報名，`registration_status` → `cancelled`，填入 `cancelled_at` |
| FR-EVENT-26 | 取消後名額立即釋出（`count_registered` 只算 `registered`） |
| FR-EVENT-27 | 沒有有效報名紀錄時取消，flash `您沒有有效的報名紀錄` |
| FR-EVENT-28 | `GET/POST /events/<id>/edit_registration` 修改自己的報名資訊，**不改動報名狀態** |
| FR-EVENT-29 | 三條報名相關路由一律以 `user_id = session['user_id']` 為條件，**無法操作他人的報名** |

#### 我的報名

| ID | 需求 |
|----|------|
| FR-EVENT-30 | `GET /events/my` 顯示登入者的全部報名紀錄，依活動時間**降冪** |
| FR-EVENT-31 | 每列顯示活動名稱、活動時間、地點、用餐、報名狀態、報名時間、操作 |
| FR-EVENT-32 | 僅 `registered` 且活動未撤銷時顯示「修改」「取消」操作，其餘顯示 `—` |
| FR-EVENT-33 | 活動已撤銷時，活動名稱不再是連結，並加上「活動已撤銷」標記 |

---

## 6. 資料模型

### 6.1 概觀

四張資料表：

```text
users
  │ 1
  ├──────────< events ──────1:1───── event_details
  │ N            │ 1
  │              │
  │              │ N
  └──────────< registrations
      1     N
```

| 表 | 筆數量級 | 主要用途 |
|----|---------|---------|
| `users` | 數十～數百 | 會員帳號、角色、狀態 |
| `events` | 數十 | 活動主表：列表與狀態判斷所需的欄位 |
| `event_details` | = `events` | 活動副表：四段長文字 |
| `registrations` | 數百～數千 | 報名紀錄 |

**資料庫層沒有外鍵約束。** `events.user_id`、`registrations.user_id`、
`registrations.event_id`、`event_details.event_id` 都只是普通的 INTEGER 欄位。
這是刻意保留的設計（KI-20），也是為什麼所有刪除都必須是軟刪除——
真的 `DELETE` 一個使用者，那些活動與報名的作者欄位就會 JOIN 不到人。

### 6.1.1 為何活動要拆成兩張表

`events` 存的是**列表與狀態判斷需要的欄位**（標題、時間、地點、名額、報名期間、發起者）；
`event_details` 存的是**只有進到詳情頁才需要的長文字**（活動內容、對象、聯絡方式、注意事項）。

活動列表一次要撈 5 筆並算出每筆的報名人數。如果四段長文字塞在同一張表裡，
每次列表查詢都會把它們一併讀出來卻完全用不到——`list_events()` 因此完全不碰副表。

這也是「主表／副表」在教學上的標準示範：兩張表以 `event_id` 一對一關聯，
建立、更新、刪除都必須成對進行，所以 `create_event`、`update_event`、
`soft_delete_event` 三個函式都用 `with conn:` 包成 transaction。

> 對照常見的「文章／回覆」結構：那是**一對多**（一篇文章多則回覆），
> 拆表的理由是「一筆主檔對應不定筆明細」。本系統的活動是**一對一**，
> 拆表的理由是「冷熱欄位分離」。同樣是主檔／明細的形狀，動機完全不同。

### 6.2 `users` 表 DDL

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

### 6.3 `events` / `event_details` / `registrations` DDL

```sql
CREATE TABLE IF NOT EXISTS events (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    event_title           TEXT    NOT NULL,
    event_datetime        TEXT    NOT NULL,
    event_place           TEXT    NOT NULL,
    capacity              INTEGER NOT NULL,
    registration_start_at TEXT,
    registration_end_at   TEXT,
    created_at            TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at            TEXT    NOT NULL DEFAULT (datetime('now')),
    user_id               INTEGER NOT NULL,
    is_deleted            INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS event_details (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id      INTEGER NOT NULL,
    event_note    TEXT    NOT NULL,
    event_target  TEXT,
    event_contact TEXT,
    event_notice  TEXT,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    is_deleted    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS registrations (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id            INTEGER NOT NULL,
    user_id             INTEGER NOT NULL,
    registration_status TEXT    NOT NULL DEFAULT 'registered',
    meal_type           INTEGER NOT NULL DEFAULT 0,
    participant_name    TEXT,
    participant_phone   TEXT,
    participant_email   TEXT,
    registration_note   TEXT,
    created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT    NOT NULL DEFAULT (datetime('now')),
    cancelled_at        TEXT,
    is_deleted          INTEGER NOT NULL DEFAULT 0
);
```

**沒有任何索引。** 資料量級在教學情境下不需要，記錄為 KI-21。

**沒有 `UNIQUE(event_id, user_id)`。** 理由見 §2.2 第四項。

### 6.4 欄位字典

#### `events`

| 欄位 | 型別 | 可空 | 說明 |
|------|------|:--:|------|
| `id` | INTEGER | ❌ | 主鍵 |
| `event_title` | TEXT | ❌ | 活動標題。表單 `maxlength="200"`，**後端未驗長度**（KI-27） |
| `event_datetime` | TEXT | ❌ | 活動開始時間，`YYYY-MM-DD HH:MM:SS` |
| `event_place` | TEXT | ❌ | 活動地點，後端驗證 ≤ 100 字元 |
| `capacity` | INTEGER | ❌ | 名額上限，必須 > 0 |
| `registration_start_at` | TEXT | ✅ | 報名開始時間。`NULL` = 建立後即可報名 |
| `registration_end_at` | TEXT | ✅ | 報名截止時間。`NULL` = 活動開始前皆可報名 |
| `created_at` | TEXT | ❌ | 建立時間（SQLite `datetime('now')`，UTC） |
| `updated_at` | TEXT | ❌ | 最後更新時間 |
| `user_id` | INTEGER | ❌ | **活動發起者**。決定誰能修改與刪除這場活動 |
| `is_deleted` | INTEGER | ❌ | 邏輯刪除旗標 |

#### `event_details`

| 欄位 | 型別 | 可空 | 說明 |
|------|------|:--:|------|
| `event_id` | INTEGER | ❌ | 對應 `events.id`，一對一 |
| `event_note` | TEXT | ❌ | 活動內容，**必填**。模板以 `white-space: pre-wrap` 保留換行 |
| `event_target` | TEXT | ✅ | 活動對象 |
| `event_contact` | TEXT | ✅ | 聯絡資訊 |
| `event_notice` | TEXT | ✅ | 注意事項 |

四段長文字**皆無長度上限**，且未做 HTML 以外的任何處理（KI-28）。
Jinja2 的自動跳脫已擋住 XSS，但沒有擋住資源耗用。

#### `registrations`

| 欄位 | 型別 | 可空 | 說明 |
|------|------|:--:|------|
| `event_id` | INTEGER | ❌ | 對應 `events.id` |
| `user_id` | INTEGER | ❌ | 報名者 |
| `registration_status` | TEXT | ❌ | `registered` / `cancelled` / `waiting` / `rejected` |
| `meal_type` | INTEGER | ❌ | `0` 不用餐 / `1` 葷食 / `2` 素食 |
| `participant_name` | TEXT | ✅ | 真實姓名。與 `users.name` 分開存，因為報名可能代填或需要正式姓名 |
| `participant_phone` | TEXT | ✅ | 聯絡電話。**無格式驗證**（KI-26） |
| `participant_email` | TEXT | ✅ | 聯絡 Email。同上 |
| `registration_note` | TEXT | ✅ | 備註 |
| `cancelled_at` | TEXT | ✅ | 取消時間。恢復報名時清為 `NULL` |
| `is_deleted` | INTEGER | ❌ | 邏輯刪除旗標。**目前沒有任何路由會設為 1**（KI-22） |

### 6.5 兩個狀態機

#### 活動狀態（計算得出，不存資料庫）

```text
                 ┌──────────────┐
   報名開始時間未到 │  not_open    │
                 └──────┬───────┘
                        │ 時間到達
                        ▼
                 ┌──────────────┐   報名數 = 名額    ┌──────────┐
                 │  available   │ ─────────────────▶ │   full   │
                 └──────┬───────┘ ◀───────────────── └──────────┘
                        │            有人取消
                        │ 報名截止時間到達
                        ▼
                 ┌──────────────┐
                 │   closed     │
                 └──────┬───────┘
                        │ 活動時間到達
                        ▼
                 ┌──────────────┐
                 │    ended     │  （終態）
                 └──────────────┘
```

**五種狀態互斥，判斷順序即優先序：** `ended` → `closed` → `not_open` → `full` → `available`。
順序的意義是「活動已結束」的事實蓋過報名期間，報名期間又蓋過名額。
一場已結束、名額未滿的活動應該顯示「活動已結束」而不是「可報名」。

`available` ⇄ `full` 是唯一可雙向轉移的一對，且**不需要任何人操作時間**——
有人取消報名，狀態就自動回到 `available`。

#### 報名狀態（存在資料庫）

```text
        （無紀錄）
             │ 報名
             ▼
      ┌─────────────┐   取消    ┌─────────────┐
      │ registered  │ ────────▶ │  cancelled  │
      └─────────────┘ ◀──────── └─────────────┘
                        重新報名
                       （UPDATE 同一列）

      ┌─────────────┐          ┌─────────────┐
      │   waiting   │          │  rejected   │   ← 兩者皆為不可達狀態（KI-14）
      └─────────────┘          └─────────────┘
```

`waiting`（候補）與 `rejected`（管理者取消）存在於 DDL 與模板的標籤中，
但**沒有任何路由會產生它們**。`cancel_registration()` 的 WHERE 條件寫了
`registration_status IN ('registered', 'waiting')`，那個 `'waiting'` 是為未來的候補機制預留的。

### 6.6 `db/` 函式總表

#### `db/users.py`（10 個）

| 函式 | 說明 |
|------|------|
| `find_user_by_email(email)` | 以 email 查詢，含 hash（供登入驗證）。**不過濾 `is_deleted`** |
| `find_user_by_id(user_id)` | 以 id 查詢，不含 hash。**不過濾 `is_deleted`** |
| `create_user(email, password, name, display_name)` | 新增使用者，bcrypt cost=10 |
| `update_user_profile(user_id, name, display_name)` | 更新姓名與顯示名稱 |
| `update_last_login(user_id)` | 更新 `last_login_at` |
| `soft_delete_user(user_id)` | 邏輯刪除 |
| `list_users(page, page_size, status, keyword)` | 回傳 `(items, total)`。**依 status 決定是否過濾 `is_deleted`** |
| `set_user_active(user_id, is_active)` | 設定啟用狀態 |
| `set_user_role(user_id, role)` | 設定角色 |
| `hard_delete_user_by_email(email)` | 實體刪除，**僅供測試清理** |

#### `db/events.py`（14 個）

| 函式 | transaction | 說明 |
|------|:--:|------|
| `list_events(page, page_size)` | | 回傳 `(items, total)`，依 `event_datetime` 升冪，含 `registered_count` |
| `get_event(event_id)` | | 活動完整資料（JOIN 副表 + users + 報名數）。**不過濾 `is_deleted`** |
| `get_event_for_edit(event_id)` | | 回傳 `(event_row, detail_row)`。**不過濾 `is_deleted`** |
| `create_event(...)` | ✅ | 新增主表 + 副表，回傳 `event_id` |
| `update_event(...)` | ✅ | 更新主表 + 副表 |
| `soft_delete_event(event_id)` | ✅ | 主表 + 副表標記刪除；**不動報名紀錄** |
| `list_registrations(event_id)` | | 有效報名者，供公開顯示 |
| `list_all_registrations(event_id)` | | 全部報名紀錄（含已取消），供發起者或管理員 |
| `get_registration(event_id, user_id)` | | 單筆報名紀錄，找不到回傳 `None` |
| `count_registered(event_id)` | | 有效報名人數 |
| `create_or_restore_registration(...)` | ✅ | 回傳 `'created'` / `'restored'` / `'duplicate'` |
| `cancel_registration(event_id, user_id)` | | status → `cancelled`，填 `cancelled_at` |
| `update_registration(...)` | | 修改報名資訊，不含 status |
| `list_my_registrations(user_id)` | | 依活動時間降冪。**不過濾 `events.is_deleted`** |

### 6.7 `list_events()` 的查詢邏輯

```sql
SELECT e.id, e.event_title, ..., e.user_id,
       COALESCE(u.name, u.email) AS user_display,
       COUNT(r.id) AS registered_count
FROM events e
LEFT JOIN users u ON u.id = e.user_id
LEFT JOIN registrations r
     ON e.id = r.event_id AND r.registration_status = 'registered' AND r.is_deleted = 0
WHERE e.is_deleted = 0
GROUP BY e.id
ORDER BY e.event_datetime ASC
LIMIT ? OFFSET ?
```

三個值得注意的地方：

1. **報名數的過濾條件寫在 `ON` 子句而非 `WHERE`。** 若寫在 `WHERE`，
   沒有任何報名的活動會被整列濾掉（`LEFT JOIN` 退化成 `INNER JOIN`）
2. **`COUNT(r.id)` 而非 `COUNT(*)`。** 沒有配對到報名時 `r.id` 是 `NULL`，
   `COUNT` 會正確回傳 0；`COUNT(*)` 則會回傳 1
3. **`COALESCE(u.name, u.email)`。** 沒填姓名的帳號（如種子的 `disabled@example.com`）
   退回顯示 email。這也是 KI-18 隱私問題的來源

### 6.8 軟刪除策略與查詢過濾約定

所有刪除操作設定 `is_deleted = 1`，**不執行 `DELETE`**。查詢時的過濾約定：

| 類別 | 是否過濾 | 函式 |
|------|:--:|------|
| 列表類（一般） | ✅ 硬性過濾 | `list_events`、`list_registrations`、`list_all_registrations` |
| 列表類（例外一：管理端） | ⚠️ 依參數 | `list_users`——管理員的職責就是要能檢視已刪除的紀錄 |
| 列表類（例外二：個人紀錄） | ⚠️ 不過濾關聯表 | `list_my_registrations`——活動被撤銷後報名者仍應看得到 |
| 單筆取得（例外三） | ❌ 不過濾 | `find_user_by_*`、`get_event`、`get_event_for_edit` |

三類例外的函式**都必須在 docstring 中明確標註**，否則讀者會誤以為是漏寫。

單筆取得不過濾的理由：讓「不存在」與「已刪除」在資料層可區分，
呼叫端才能給出不同的錯誤訊息與 redirect 目標。本系統目前兩者的訊息相同
（`活動不存在或已刪除`），但這是 Blueprint 的選擇，不是資料層的限制。

### 6.9 種子資料

#### 種子帳號（`_seed_users_if_empty`）

| id | email | 密碼 | role | is_active | name |
|----|-------|------|------|-----------|------|
| 1 | user@example.com | password123 | 1 | 1 | 一般使用者 |
| 2 | admin@example.com | admin1234 | 0 | 1 | 管理員 |
| 3 | disabled@example.com | disabled123 | 1 | 0 | `NULL` |

種子帳號使用 bcrypt cost=4（加速測試），註冊路徑使用 cost=10。

#### 種子活動（`_seed_events_if_empty`）

`init_db()` 另外植入五筆活動與七筆報名紀錄，**必須排在 `_seed_users_if_empty()` 之後**
——活動與報名的 `user_id` 指向那三個種子帳號。

| id | 標題 | 發起者 | 活動時間 | 報名期間 | 名額 | 狀態 | 示範什麼 |
|:--:|------|--------|---------|---------|:--:|------|---------|
| 1 | 新生入學說明會 | 管理員 | −30 天 | 未設 | 200 | `ended` | 活動已結束；名額還有空位也不能報名 |
| 2 | 春季校園路跑 | 管理員 | +3 天 | −30 天 ～ −1 天 | 300 | `closed` | 活動未到但報名已截止——兩個時間點是獨立的 |
| 3 | 系學會迎新茶會 | 一般使用者 | +7 天 | 未設 | 2 | `full` | 名額已滿；名額只算 `registered` 的紀錄 |
| 4 | 生成式 AI 實作工作坊 | 管理員 | +30 天 | +7 天 ～ +28 天 | 40 | `not_open` | 唯一會隨時間自動變成可報名的狀態 |
| 5 | 期末專題成果發表會 | 一般使用者 | +14 天 | 未設 | 40 | `available` | 未設報名期間；另含一筆已取消的報名 |

七筆報名紀錄的分佈：user 1 有三筆 `registered`（活動 1、2、3）與一筆 `cancelled`（活動 5）；
user 2 有兩筆 `registered`（活動 3、5）；user 3 沒有任何報名紀錄。

**時間欄位一律以 `datetime('now', '±N days')` 換算，不寫死絕對日期。**
理由是寫死日期的種子資料過幾個月後
會全部變成「活動已結束」，五種狀態就看不出差異了。

> 實作細節：`datetime('now', NULL)` 在 SQLite 中回傳 `NULL`，
> 因此報名期間留空的活動不需要另外分支處理。

---

## 7. 路由總表

### 7.1 全站路由

| # | Blueprint | 方法 | 路徑 | 端點 | 守門 |
|:--:|-----------|------|------|------|------|
| 1 | hub | `GET/POST` | `/` | `hub.home` | 無 |
| 2 | auth | `GET/POST` | `/login` | `auth.login_page` | 已登入 → `/` |
| 3 | auth | `GET/POST` | `/register` | `auth.register` | 已登入 → `/` |
| 4 | auth | `GET` | `/captcha.png` | `auth.captcha_image` | 無 |
| 5 | auth | `GET` | `/logout` | `auth.logout` | 無 |
| 6 | profile | `GET` | `/profile` | `profile.dashboard` | 1 + 2 |
| 7 | profile | `POST` | `/profile/update` | `profile.dashboard_update` | 1（**缺 2**，KI-03） |
| 8 | admin | `GET` | `/admin/users` | `admin.user_list` | 1 + 2 + 管理員 |
| 9 | admin | `GET` | `/admin/users/<id>` | `admin.user_detail` | 1 + 2 + 管理員 |
| 10 | admin | `POST` | `/admin/users/<id>/activate` | `admin.activate_user` | 1 + 2 + 管理員 |
| 11 | admin | `POST` | `/admin/users/<id>/deactivate` | `admin.deactivate_user` | 1 + 2 + 管理員 + R1 |
| 12 | admin | `POST` | `/admin/users/<id>/role` | `admin.update_role` | 1 + 2 + 管理員 + R3 |
| 13 | admin | `POST` | `/admin/users/<id>/delete` | `admin.delete_user` | 1 + 2 + 管理員 + R2 |
| 14 | events | `GET` | `/events` | `events.index` | 無 |
| 15 | events | `GET/POST` | `/events/new` | `events.new_event` | 1 + 2 |
| 16 | events | `GET/POST` | `/events/edit/<id>` | `events.edit_event` | 1 + 2 + 發起者或管理員 |
| 17 | events | `POST` | `/events/delete/<id>` | `events.delete_event` | 1 + 2 + 發起者或管理員 |
| 18 | events | `GET/POST` | `/events/<id>/register` | `events.register` | 1 + 2 + 狀態為 `available` |
| 19 | events | `POST` | `/events/<id>/cancel` | `events.cancel` | 1 + 2 + 有有效報名 |
| 20 | events | `GET/POST` | `/events/<id>/edit_registration` | `events.edit_registration` | 1 + 2 + 有有效報名 |
| 21 | events | `GET` | `/events/my` | `events.my_registrations` | 1 + 2 |
| 22 | — | `GET` | `/health` | `health` | 無 |

共 22 條。`events.index` 與 `events.my_registrations` 宣告 `strict_slashes=False`，
`url_for()` 產生的 URL 帶尾斜線（`/events/`、`/events/my`）。

### 7.2 命名慣例

- 路由函式名稱以動作或頁面語意命名（`index`、`new_event`、`edit_registration`）
- 刪除、取消、狀態變更一律用 `POST`，不用 `GET`
- 「對某個活動做某件事」的路徑放在 `/<event_id>/<動作>`（報名、取消、修改報名）；
  「對活動本身做某件事」的路徑放在 `/<動作>/<event_id>`（修改、刪除）

> 這兩種形狀的不一致是刻意保留的（KI-25）。可以理解成
> 「動詞在前 = 操作活動」「id 在前 = 操作活動底下的東西」，但系統並未如此宣告。

### 7.3 POST-Redirect-GET 與元素語意

所有有副作用的操作都是 `POST`，成功後一律 `flash()` + `redirect()`，
避免使用者按重新整理造成重複送出。

| 元素 | 使用時機 |
|------|---------|
| `<a href="...">` | GET 導航（跳頁、返回、修改表單頁、分頁等） |
| `<button type="submit">` | POST 動作（送出表單、報名、取消、刪除等） |

**兩個例外情境是刻意的：**

1. **表單驗證失敗時不 redirect，而是重新 `render_template()`。**
   理由是要保留使用者已填入的十個欄位。若 redirect，那些輸入就沒了
2. **報名成功與失敗都 redirect。** 因為報名表單只有五個欄位且四個選填，
   重填的成本低；而報名的結果（成功、重複、額滿）需要在活動頁上呈現

### 7.4 為何 `activate` 與 `deactivate` 拆成兩條路由

分立的動詞路由天然冪等：重送 POST 的結果一致，不會反覆翻轉狀態，也不需要先查當前值。
若做成 `/toggle`，使用者連按兩次會回到原狀，而且從 URL 讀不出這次操作到底做了什麼。

同樣的原則沒有套用在報名上——`register` 與 `cancel` 也是兩條分立路由，正是同一個判斷。

---

## 8. 畫面設計與流程

### 8.1 畫面清單

| # | 畫面 | 路徑 | 模板 | CSS |
|:--:|------|------|------|-----|
| 1 | 首頁（訪客） | `/` | `hub/home.html` | `hub.css` + `login.css` |
| 2 | 首頁（已登入） | `/` | 同上 | 同上 |
| 3 | 登入 | `/login` | `auth/login.html` | `login.css` |
| 4 | 申請帳號 | `/register` | `auth/register.html` | `login.css` |
| 5 | 個人資料（唯讀） | `/profile` | `profile/dashboard.html` | `profile.css` |
| 6 | 個人資料（編輯） | `/profile?edit=1` | 同上 | 同上 |
| 7 | 會員清單 | `/admin/users` | `admin/user_list.html` | `admin.css` |
| 8 | 會員明細 | `/admin/users/<id>` | `admin/user_detail.html` | `admin.css` |
| 9 | 活動主頁 | `/events` | `events/index.html` | `events.css` |
| 10 | 新增活動 | `/events/new` | `events/event_form.html` | `events.css` |
| 11 | 修改活動 | `/events/edit/<id>` | 同上（`mode='edit'`） | `events.css` |
| 12 | 報名活動 | `/events/<id>/register` | `events/registration_form.html` | `events.css` |
| 13 | 修改報名 | `/events/<id>/edit_registration` | 同上（`mode='edit'`） | `events.css` |
| 14 | 我的報名 | `/events/my` | `events/my_registrations.html` | `events.css` |

十四個畫面，十個模板。兩對「新增／修改」共用同一個模板，以 `mode` 參數切換標題與按鈕文字。

### 8.2 導覽關係

```text
                        ┌──────────────┐
              ┌────────▶│   / （hub）   │◀────────┐
              │         └──┬───┬───┬───┘         │
              │            │   │   │             │
        ┌─────┴─────┐      │   │   │       ┌─────┴──────┐
        │  /login   │      │   │   └──────▶│ /admin/... │
        │ /register │      │   │           └────────────┘
        └───────────┘      │   └──────────▶┌────────────┐
              ▲            │               │  /profile  │
              │            ▼               └────────────┘
              │      ┌───────────┐
              │      │  /events  │◀───────── 訪客也可進入
              │      └─────┬─────┘
              │            │
              │   ┌────────┼─────────┬──────────────┐
              │   ▼        ▼         ▼              ▼
              │ /new   /edit/<id>  /<id>/register  /my
              │                    /<id>/cancel
              │                    /<id>/edit_registration
              │                         │
              └─────────────────────────┘
                    （帳號失效時一律導回 /login）
```

`/events` 是唯一從首頁可以直接進入、且不需登入的子系統入口。

### 8.3 活動主頁的線框

```text
┌────────────────────────────────────────────────────────────────────────┐
│ 校園活動報名系統      返回首頁  我的報名  張三   [登出]                    │  topbar
├────────────────────────────────────────────────────────────────────────┤
│ ✔ 報名成功                                                              │  flash
├──────────────────────────────┬─────────────────────────────────────────┤
│ 活動清單    共 6 筆 [+新增活動] │ 期末專題成果發表會  [可報名] [修改][刪除] │  panel header
├──────────────────────────────┼─────────────────────────────────────────┤
│ ID 活動名稱  時間  名額  狀態  │ 活動時間  2026-08-25 14:00:00           │
│ ─────────────────────────────│ 活動地點  圖書館 一樓展演空間            │
│  1 新生入學說明會 … 1/200 已結束│ 活動對象  全校師生                      │  info grid
│  2 春季校園路跑   … 1/300 已截止│ 報名名額  1 / 40 人                     │
│  3 系學會迎新茶會 … 2/2   已滿  │ 報名期間  建立後即可 ～ 活動開始前        │
│  5 期末專題發表 ● … 1/40  可報名│ 發起者    一般使用者                    │
│  4 生成式 AI …    … 0/40  未開放├─────────────────────────────────────────┤
│ ─────────────────────────────│ 活動內容                                │
│      « 上一頁  1/2  下一頁 »   │ 各組展示一學期的專題成果…                │  sections
│                              ├─────────────────────────────────────────┤
│                              │ [我要報名]                              │  reg actions
│                              ├─────────────────────────────────────────┤
│                              │ 目前報名者  1 人                        │
│                              │ 報名者      報名時間                     │  registrant
│                              │ 管理員      2026-08-11 09:12            │  list
└──────────────────────────────┴─────────────────────────────────────────┘
```

左右兩欄各自捲動（`overflow-y: auto`），topbar 與分頁列固定不動。
選取中的那一列以 `.events-row-selected` 標示。

**「操作」欄與「+ 新增活動」按鈕只在登入後出現**——訪客看到的是五欄表格。
即使如此，後端仍會獨立檢查權限；前端隱藏只是提示。

### 8.4 使用者旅程

#### 旅程一：訪客瀏覽 → 報名

```text
1. 開啟 /                     看到四張卡片，只有「校園活動報名」可點
2. 點擊 → /events             看到五筆活動與各自的狀態 badge
3. 點擊「期末專題成果發表會」   右側顯示細節；報名區顯示「請先登入以報名活動」
4. 點擊「登入」→ /login        輸入帳號、密碼、驗證碼
5. 登入成功 → /               首頁變成四張可點的卡片
6. 點擊「校園活動報名」→ /events 「操作」欄與「+ 新增活動」出現
7. 選取活動 → 點「我要報名」    進入報名表單
8. 選用餐選項、填聯絡資訊 → 送出 flash「報名成功」，回到 /events?event_id=5
9. 報名區變成「已報名 [修改報名資訊] [取消報名]」，名單多一列
```

#### 旅程二：辦一場活動 → 看報名名單

```text
1. /events → 「+ 新增活動」
2. 填十個欄位（五個必填）→ 送出
3. flash「活動已建立」，redirect /events?event_id=<新 id>
4. 該活動的「修改活動」「刪除活動」按鈕出現（因為我是發起者）
5. 有人報名後，「目前報名者」區塊變成九欄完整表格
   ——含真實姓名、電話、Email、備註，以及已取消的紀錄
6. 想調降名額 → 「修改活動」→ 若填的數字低於目前報名人數，會被擋下並提示
```

#### 旅程三：帳號被停用之後

```text
1. 管理員在 /admin/users 停用某帳號
2. 該帳號的瀏覽器仍持有 session cookie
3. 存取 /events           ✅ 可以，但以**訪客身分**呈現（無「操作」欄）
4. 存取 /events/new       ❌ session 被清除，導回 /login
5. 存取 /events/5/register ❌ 同上
6. 存取 /events/my        ❌ 同上
7. 存取 /profile （GET）   ❌ session 被清除，導回 /login
8. 存取 /profile/update（POST） ⚠️ **成功**——KI-03 刻意保留的缺陷
9. 該帳號既有的活動與報名紀錄**不受影響**，仍公開顯示
```

第 9 步是軟刪除策略的直接後果：帳號狀態與既有內容是分離的。

### 8.5 CSS 架構

`static/common.css` 是全站按鍵**顏色的單一來源**（CSS 自訂屬性），`base.html` 最先載入。
各子系統 CSS 使用自己的 prefixed 類別，顏色值透過 `var(--...)` 引用，**不寫死色碼**：

| CSS 檔案 | 按鍵前綴 | 適用頁面 |
|---------|---------|---------|
| `common.css` | — | 全站共用 token |
| `login.css` | `.login-form button` | auth 登入／申請頁、hub 內嵌登入表單 |
| `hub.css` | `hub-*` | 首頁 |
| `profile.css` | `profile-*` | 個人資料頁 |
| `admin.css` | `admin-btn-*`、`admin-btn-action-*` | 會員管理所有頁面 |
| `events.css` | `events-btn-*`、`events-btn-action-*` | 活動報名所有頁面 |

#### `.login-form` class 的限制

`login.css` 的 `button[type="submit"]` 樣式限定在 `.login-form` 選擇器內，
**不會全域污染**其他子系統。全系統恰有三處需要加上此 class：
`auth/login.html`、`auth/register.html`、`hub/home.html`（內嵌登入表單）。

`profile`、`admin`、`events` 的表單**不加**此 class。

#### 狀態 badge 的顏色

`events.css` 定義了九個 badge 顏色（五個活動狀態 + 四個報名狀態），
`admin.css` 定義了五個（啟用／停用／已刪除 + 兩個角色）。
這些底色**硬編碼在各自的 CSS 中**，因為 `common.css` 只定義按鍵顏色，
未定義狀態語意色（KI-19）。

| Badge | 底色 / 文字色 | 語意 |
|-------|--------------|------|
| `available` | `#e8f5e9` / `#2e7d32`（綠） | 可行動 |
| `full` | `#fff3e0` / `#e65100`（橘） | 受阻但非錯誤 |
| `closed` | `#fce4ec` / `#b71c1c`（紅） | 錯過時機 |
| `not_open` | `#e3f2fd` / `#1565c0`（藍） | 尚待時間 |
| `ended` | `#f5f5f5` / `#757575`（灰） | 終態 |

#### 跨子系統共用的例外

欄寬工具類 `.col-id`、`.col-title`、`.col-status`、`.col-action` 等在
`admin.css` 與 `events.css` 中重複定義（值不同）。這是唯一允許的重複——
它們只管欄寬、不管顏色，各子系統的表格欄位本來就不一樣。

---

## 9. 驗證規則與訊息字串

### 9.1 輸入欄位規格

#### 活動表單（10 個欄位）

| 欄位 | 必填 | 前端限制 | 後端驗證 |
|------|:--:|---------|---------|
| `event_title` | ✅ | `maxlength="200"` | 非空（**未驗長度**，KI-27） |
| `event_datetime` | ✅ | `type="datetime-local"` | 非空 + 可解析為 ISO 格式 |
| `event_place` | ✅ | `maxlength="100"` | 非空 + ≤ 100 字元 |
| `capacity` | ✅ | `type="number" min="1"` | 可轉整數 + > 0 + ≥ 目前有效報名人數 |
| `registration_start_at` | ❌ | `type="datetime-local"` | 可空；有值時需可解析 + ≤ 報名截止 |
| `registration_end_at` | ❌ | `type="datetime-local"` | 可空；有值時需可解析 + ≤ 活動開始 |
| `event_note` | ✅ | `<textarea>` | 非空（**無長度上限**，KI-28） |
| `event_target` | ❌ | — | 無 |
| `event_contact` | ❌ | — | 無 |
| `event_notice` | ❌ | `<textarea>` | 無 |

#### 報名表單（5 個欄位）

| 欄位 | 必填 | 前端限制 | 後端驗證 |
|------|:--:|---------|---------|
| `meal_type` | ✅ | `radio`，預設 `0` | 可轉整數 + ∈ {0, 1, 2} |
| `participant_name` | ❌ | — | 無 |
| `participant_phone` | ❌ | `type="tel"` | 無（**無格式驗證**，KI-26） |
| `participant_email` | ❌ | `type="email"` | 無（**後端不驗**，KI-26） |
| `registration_note` | ❌ | `<textarea>` | 無 |

> 報名者資訊全部選填，是刻意的：多數校園活動只需要知道「誰報名了」，
> 而系統已經從 session 知道這件事。額外欄位是給需要聯絡或訂餐的活動用的。

### 9.2 登入驗證順序

1. 驗證碼不可空白 → `請輸入驗證碼`
2. 驗證碼比對（`session['captcha']`，輸入先 `.upper()`）→ `驗證碼錯誤，請重新輸入`
3. email / password 不可空白 → `請輸入帳號與密碼`
4. 查找使用者；不存在或 `is_deleted` 為真或密碼錯誤 → `帳號或密碼錯誤`
5. `is_active` 為假 → `帳號已停用`
6. 通過：`update_last_login` → 設 `session['user_id']` → redirect `hub.home`

第 4 步把「帳號不存在」「已刪除」「密碼錯誤」三種情況合併為同一則訊息，
避免帳號列舉（account enumeration）。第 5 步則沒有合併——這是刻意的取捨，
讓被停用的使用者知道要去找管理員，而不是懷疑自己記錯密碼。

### 9.3 申請帳號驗證順序

1. email / password 不可空白 → `請輸入電子郵件與密碼`
2. email 格式（`EMAIL_REGEX`）→ `電子郵件格式不正確`
3. 密碼長度 ≥ 8 → `密碼至少需要 8 個字元`
4. 兩次密碼一致 → `兩次密碼輸入不一致`
5. `create_user`；email 重複（`sqlite3.IntegrityError`）→ `此電子郵件已被使用`

### 9.4 會員管理操作驗證順序

1. 未登入 → redirect `/login`
2. `_is_usable` 為假 → `session.clear()` + redirect `/login`
3. `_is_admin` 為假 → flash `無操作權限` + redirect `/`
4. 目標不存在 → flash `找不到該使用者` + redirect 清單
5. 目標是自己（僅 deactivate / delete / role）→ flash 對應的自我保護訊息
6. 目標 `is_deleted` 為真 → flash `該帳號已刪除，無法操作`
7. `role` 值非 `'0'` / `'1'`（僅 role 路由）→ flash `角色值不正確`
8. 通過 → 執行 `db.*` → flash 成功訊息 → redirect 清單

### 9.5 活動操作驗證順序

#### 新增活動（`POST /events/new`）

1. 未登入 → redirect `/login`
2. `_current_user()` 回傳 `None` → `session.clear()` + redirect `/login`
3. 表單十條驗證（依 §9.6 順序）→ 失敗則**重新渲染表單**並保留輸入
4. 通過 → `db.create_event()` → flash `活動已建立` → redirect `/events?event_id=<新 id>`

#### 修改／刪除活動

1. 未登入 → redirect `/login`
2. `_current_user()` 回傳 `None` → `session.clear()` + redirect `/login`
3. **活動不存在或已刪除** → flash `活動不存在或已刪除` + redirect `/events`
4. 非發起者且非管理員 → flash `無權限修改此活動` / `無權限刪除此活動` + redirect 該活動
5. （修改）表單驗證，含「名額 ≥ 目前有效報名人數」
6. 通過 → 執行 → flash → redirect

> 第 3 步排在第 4 步**之前**，與 admin 相反。理由見 §4.4。

#### 報名（`POST /events/<id>/register`）

1. 未登入 → redirect `/login`
2. `_current_user()` 回傳 `None` → `session.clear()` + redirect `/login`
3. 活動不存在或已刪除 → flash `活動不存在或已刪除` + redirect `/events`
4. 已有有效報名 → flash `您已報名此活動` + redirect 該活動
5. 活動狀態 ≠ `available` → flash 對應狀態訊息 + redirect 該活動
6. **（POST 時）重新查活動、重算狀態**，若已非 `available` → 同第 5 步
7. `meal_type` ∉ {0,1,2} → **重新渲染表單** + `請選擇正確的用餐選項`
8. 通過 → `create_or_restore_registration()` → flash `報名成功`（或 `您已報名此活動`）→ redirect

第 4 步排在第 5 步之前：已經報名的人看到「您已報名此活動」比看到「名額已滿」更合理。

#### 取消／修改報名

1. 未登入 → redirect `/login`
2. `_current_user()` 回傳 `None` → `session.clear()` + redirect `/login`
3. 活動不存在或已刪除 → flash `活動不存在或已刪除` + redirect `/events`
4. 沒有 `registered` / `waiting` 的報名紀錄 → flash `您沒有有效的報名紀錄` + redirect 該活動
5. （修改）`meal_type` 驗證
6. 通過 → 執行 → flash `已取消報名` / `報名資訊已更新` → redirect 該活動

**這兩條路由沒有「是不是自己的報名」這一步**——因為查詢條件本身就是
`WHERE event_id = ? AND user_id = ?`，`user_id` 來自 session。
別人的報名根本不會被查到，第 4 步就攔下了。

### 9.6 活動表單的十條驗證（順序固定）

| # | 條件 | 訊息 |
|:--:|------|------|
| 1 | 標題非空 | `請輸入活動標題` |
| 2 | 活動日期時間非空 | `請輸入活動日期時間` |
| 3 | 地點非空 | `請輸入活動地點` |
| 4 | 地點 ≤ 100 字元 | `活動地點不可超過 100 字元` |
| 5 | 活動內容非空 | `請輸入活動內容` |
| 6 | 名額可轉整數 | `請輸入正確活動名額` |
| 7 | 名額 > 0 | `請輸入正確活動名額（必須大於 0）` |
| 8 | 名額 ≥ 目前有效報名人數（僅修改時） | `名額不可低於目前有效報名人數（N 人）` |
| 9 | 活動日期時間格式正確 | `活動日期時間格式不正確` |
| 10 | 報名時間格式正確 | `報名時間格式不正確` |
| 11 | 報名截止 ≤ 活動開始 | `報名截止時間不可晚於活動開始時間` |
| 12 | 報名開始 ≤ 報名截止 | `報名開始時間不可晚於報名截止時間` |

**一次只回報第一個錯誤**，不列出全部問題。這是刻意的簡化（KI-30），
在欄位多達十個時體驗不佳——使用者可能要來回送出好幾次。

### 9.7 訊息字串總表（50 條）

#### auth（11 條）

| Key | 字串 |
|-----|------|
| `captchaRequired` | 請輸入驗證碼 |
| `captchaInvalid` | 驗證碼錯誤，請重新輸入 |
| `missingCredentials` | 請輸入帳號與密碼 |
| `loginError` | 帳號或密碼錯誤 |
| `accountDisabled` | 帳號已停用 |
| `registerSuccess` | 申請成功，請登入 |
| `emailTaken` | 此電子郵件已被使用 |
| `invalidEmailFormat` | 電子郵件格式不正確 |
| `passwordTooShort` | 密碼至少需要 8 個字元 |
| `passwordMismatch` | 兩次密碼輸入不一致 |
| `missingEmailOrPassword` | 請輸入電子郵件與密碼 |

#### admin（11 條）

| Key | 字串 |
|-----|------|
| `adminForbidden` | 無操作權限 |
| `adminSelfDeactivate` | 不可停用自己的帳號 |
| `adminSelfDelete` | 不可刪除自己的帳號 |
| `adminSelfRole` | 不可修改自己的角色 |
| `adminUserNotFound` | 找不到該使用者 |
| `adminDeletedUser` | 該帳號已刪除，無法操作 |
| `adminInvalidRole` | 角色值不正確 |
| `adminActivated` | 帳號已啟用 |
| `adminDeactivated` | 帳號已停用 |
| `adminRoleUpdated` | 角色已更新 |
| `adminUserDeleted` | 帳號已刪除 |

#### events — 活動表單驗證（12 條）

| Key | 字串 |
|-----|------|
| `eventTitleRequired` | 請輸入活動標題 |
| `eventDatetimeRequired` | 請輸入活動日期時間 |
| `eventPlaceRequired` | 請輸入活動地點 |
| `eventPlaceTooLong` | 活動地點不可超過 100 字元 |
| `eventNoteRequired` | 請輸入活動內容 |
| `eventCapacityInvalid` | 請輸入正確活動名額 |
| `eventCapacityNotPositive` | 請輸入正確活動名額（必須大於 0） |
| `eventCapacityBelowRegistered` | 名額不可低於目前有效報名人數 |
| `eventDatetimeMalformed` | 活動日期時間格式不正確 |
| `eventRegTimeMalformed` | 報名時間格式不正確 |
| `eventRegEndAfterStart` | 報名截止時間不可晚於活動開始時間 |
| `eventRegStartAfterEnd` | 報名開始時間不可晚於報名截止時間 |

#### events — 活動操作（6 條）

| Key | 字串 |
|-----|------|
| `eventCreated` | 活動已建立 |
| `eventUpdated` | 活動已更新 |
| `eventDeleted` | 活動已刪除 |
| `eventNotFound` | 活動不存在或已刪除 |
| `eventEditForbidden` | 無權限修改此活動 |
| `eventDeleteForbidden` | 無權限刪除此活動 |

#### events — 報名（6 條）

| Key | 字串 |
|-----|------|
| `regSuccess` | 報名成功 |
| `regDuplicate` | 您已報名此活動 |
| `regCancelled` | 已取消報名 |
| `regNotFound` | 您沒有有效的報名紀錄 |
| `regUpdated` | 報名資訊已更新 |
| `regMealInvalid` | 請選擇正確的用餐選項 |

#### events — 活動狀態擋下報名（4 條）

| Key | 字串 |
|-----|------|
| `statusEnded` | 活動已結束 |
| `statusClosed` | 報名已截止 |
| `statusNotOpen` | 尚未開放報名 |
| `statusFull` | 活動名額已滿 |

全部 50 條集中在 `tests/data/users.py` 的 `MESSAGES`。**修改 Blueprint 的訊息字串時必須同步更新。**

> `statusNotOpen`（尚未開放報名）與畫面上的 badge 標籤「尚未開放」不同字串，
> `statusFull`（活動名額已滿）與 badge 的「名額已滿」也不同。
> badge 要短、flash 要完整，這是刻意的區分——但也代表**同一個狀態有兩份中文字**，
> 修改時容易漏掉一邊（KI-32）。

### 9.8 flash 的使用慣例

| 分類 | 使用時機 | 畫面樣式 |
|------|---------|---------|
| `'success'` | 操作成功 | 綠底（`events-flash-success`） |
| `'error'` | 操作被拒絕、權限不足、狀態不允許 | 紅底（`events-flash-error`） |

**一個例外：表單欄位驗證失敗不用 flash**，而是把錯誤字串傳給模板的 `error` 變數，
渲染成表單內的 `events-alert-error`。理由是 flash 會跨請求存活，
而表單驗證錯誤與「這次渲染的這份表單」綁定，用 flash 會在使用者放棄表單後
仍出現在下一頁。

---

## 10. 非功能需求

### 10.1 效能

| 項目 | 目標 | 現況 |
|------|------|------|
| 活動列表載入 | < 200 ms | 一次查詢（帶 JOIN + GROUP BY）取得五筆活動與報名數 |
| 活動詳情 | < 300 ms | 三～四次查詢：`get_event`、`list_registrations`、（可能）`list_all_registrations`、`get_registration` |
| 登入 | < 500 ms | bcrypt cost=10 約 100 ms |
| 資料量級 | 數百會員、數十活動、數千報名 | SQLite 單檔，無索引（KI-21） |

活動詳情頁的三～四次查詢可以合併，但會讓 SQL 難以閱讀。
在這個資料量級下不值得，記錄為 KI-09 的延伸。

### 10.2 安全性

| 面向 | 現況 |
|------|------|
| 密碼儲存 | bcrypt（註冊 cost=10） |
| SQL injection | 全部使用參數化查詢（`?` 佔位符），無字串拼接 |
| XSS | Jinja2 自動跳脫；模板中無 `\|safe` |
| CSRF | **無防護**（KI-01）——所有 POST 都可被跨站偽造 |
| Session | HttpOnly cookie，內容經 `SECRET_KEY` 簽章；無 session fixation 防護（KI-15） |
| 帳號列舉 | 登入的四種失敗合併為同一則訊息；但「帳號已停用」仍可區分 |
| 暴力破解 | **無速率限制**（KI-02）；驗證碼可重放（KI-07） |
| 授權 | 全部在伺服器端；前端隱藏只是提示 |
| 隱私 | 公開報名名單顯示所有報名者的姓名或 email（KI-18） |

**本系統不適合直接用於生產環境。** 上述缺陷是教材，不是疏漏。

### 10.3 可用性與相容性

- 桌面瀏覽器優先。活動主頁的雙欄配置在 760 px 以下未做 responsive（KI-33）
- `datetime-local` 輸入元素在 Safari 舊版本支援不佳
- 無鍵盤快捷鍵、無 ARIA 標記（KI-34）

### 10.4 可維護性

- 五個 Blueprint 各自獨立，不互相 import
- 所有 SQL 集中在 `db/` 套件，共 24 個函式
- 每個 Blueprint 目錄、`db/`、`tests/` 各有一份 `CLAUDE.md` 說明職責
- 訊息字串集中在 `tests/data/users.py` 供測試斷言；**但 Blueprint 中仍是硬編碼字面量**（KI-08）

### 10.5 可測試性

- `db.DB_PATH` 可在測試中動態替換，無需重啟 app
- 驗證碼可透過 `session_transaction()` 直接注入答案繞過
- 五筆種子活動涵蓋全部五種狀態，測試不必自行建構特定時間條件的資料
- 152 個案例，執行時間約 2 秒

### 10.6 部署

```yaml
services:
  web:
    build: .
    ports: ["4000:4000"]
    volumes: [db_data:/app/data]
    environment:
      - SECRET_KEY=please-change-this-to-a-random-string
      - DB_PATH=/app/data/database.db
    restart: unless-stopped
volumes:
  db_data:
```

以 named volume 持久化資料庫。**使用 Flask 內建的開發伺服器**（`app.run(debug=True)`），
未使用 gunicorn 等 WSGI 伺服器（KI-24）。

---

## 11. 已知技術債 / Known Issues

### 11.0 為何有些債修、有些不修

本系統刻意保留既有的技術債，**不做全面強化**——這些債本身就是教材。
但有三項做了修正（§11.5）。判準只有一條：

> **缺陷的影響是否會外溢到當事人以外的人。**

`POST /profile/update` 缺少帳號有效性檢查（KI-03），後果是被停用的人可以改**自己的**姓名——
影響範圍就是他自己。保留，作為「技術債如何跨功能傳染」的教材。

`events._current_user()` 缺少同一個檢查，後果是被停用的人可以**建立公開活動、
佔用別人的名額**——影響範圍超出當事人。修正。

這條判準本身就是規格的一部分，寫在這裡是為了讓後續的維護者能沿用同一個標準做判斷，
而不是憑感覺決定要不要「順手修一下」。

### 11.1 安全性

| ID | 問題 | 影響 | 為何接受 | 修補方向 |
|----|------|------|---------|---------|
| KI-01 | 無 CSRF token | 所有 POST（報名、取消、刪除活動、會員管理）可被跨站偽造 | 引入 Flask-WTF 會把表單處理變成另一套抽象，遮蔽「表單 → request.form」這條主線 | 加入 Flask-WTF 或手寫 token 機制 |
| KI-02 | 登入無速率限制 | 可暴力破解密碼 | 需要額外的狀態儲存（Redis 或資料表） | Flask-Limiter，或在 `users` 加失敗計數欄位 |
| KI-05 | `SECRET_KEY` 有預設值 | 未設環境變數時使用公開已知的金鑰，session 可被偽造 | 方便本機直接執行 | 生產環境強制要求環境變數，未設則拒絕啟動 |
| KI-07 | 驗證碼在登入成功後未 `session.pop` | 驗證碼可重放 | 刻意保留為教材 | 登入成功後 `session.pop('captcha', None)` |
| KI-15 | 無 session fixation 防護 | 登入前後 session id 不變 | 不用 Flask-Login 的代價 | 登入成功後重新產生 session |
| KI-16 | `/health` 無任何保護 | 可被用於探測服務存在 | 健康檢查端點的常見做法 | 加入 IP 白名單或 token |
| KI-18 | 公開報名名單顯示所有報名者的姓名或 email | **訪客即可看到**。未填姓名的帳號會退回顯示 email | 「誰已經報名」是活動報名系統的常見需求；但顯示 email 確實過度 | 只顯示遮罩後的名稱（`王＊明`），或改為僅顯示人數 |
| KI-24 | 使用 Flask 開發伺服器部署 | 單執行緒、無 worker 管理、debug 模式開啟 | 教學專案 | 改用 gunicorn + `debug=False` |

### 11.2 正確性與一致性

| ID | 問題 | 影響 | 為何接受 | 修補方向 |
|----|------|------|---------|---------|
| **KI-03** | `POST /profile/update` **缺少 `_is_usable` 檢查** | 被停用或刪除的會員仍可修改自己資料，與 admin 的停用功能直接衝突 | **核心教材**：技術債如何跨功能傳染。見 §11.0 | 補上三行；但**請勿「順手」修補** |
| **KI-11** | 名額檢查與報名寫入不在同一個 transaction | 兩個請求同時通過 `_event_status()` 的 `full` 檢查後同時 INSERT，名額會超收 | 教學情境不會發生；而正確的修法需要引入鎖或 `INSERT ... SELECT ... WHERE`，複雜度陡增 | 把 `count_registered` 與 `INSERT` 放進同一個 `with conn:`，或改用 `INSERT ... WHERE (SELECT COUNT(*) ...) < capacity` |
| **KI-13** | `datetime.now()`（本機時間）與 SQLite `datetime('now')`（UTC）混用 | 種子資料、`created_at`、`cancelled_at` 是 UTC；狀態判斷是本機時間。台灣時區有 8 小時偏差 | 種子活動的時間間隔都 ≥ 1 天，偏差不會翻轉任何狀態；使用者建立的活動則兩邊都是本機時間，一致 | 全面改用 UTC，顯示時再轉當地時區 |
| KI-14 | `waiting` 與 `rejected` 是不可達狀態 | DDL 與模板都支援，但沒有任何路由會產生 | 為未來的候補與強制取消機制預留 | 見第 13 章 |
| KI-22 | `registrations.is_deleted` 從不被設為 1 | 欄位存在但無寫入路徑 | 取消報名用 `registration_status` 而非 `is_deleted` | 移除欄位，或定義它與 `cancelled` 的語意差別 |
| KI-23 | hub 內嵌登入是 auth 登入的完整複製 | 五條錯誤訊息各硬編碼兩份；登入政策強化必須兩處都改 | 抽取共用函式會讓兩個 Blueprint 產生依賴，違反模組邊界原則 | 把驗證邏輯抽到 `utils.py` 或獨立的 service 模組 |
| KI-25 | 活動路由的 id 位置不一致 | `/events/edit/<id>` 與 `/events/<id>/register` 兩種形狀 | 刻意保留為教材 | 統一為 `/events/<id>/edit` 等 RESTful 形狀 |
| KI-30 | 表單驗證一次只回報第一個錯誤 | 活動表單有十個欄位，使用者可能要來回送出多次 | 刻意的簡化寫法 | 改為收集全部錯誤後一次回傳 |
| KI-32 | 同一個活動狀態有兩份中文字串 | badge 用「名額已滿」，flash 用「活動名額已滿」；修改時容易漏掉一邊 | 短標籤與完整句子的用途不同 | 定義 `SHORT_LABELS` 與 `FLASH_MESSAGES` 並在測試中斷言兩者的 key 集合相同 |

### 11.3 資料層

| ID | 問題 | 影響 | 為何接受 | 修補方向 |
|----|------|------|---------|---------|
| KI-09 | 每個請求都重新查詢使用者 | 每個受保護路由至少多一次 DB 查詢 | 換來「角色調整立即生效」 | 快取，但需處理失效 |
| KI-10 | 每個 `db.*` 函式重複 `_get_conn()` / `close()` | 24 個函式各有三行樣板 | 不用 ORM 的代價；context manager 會多一層間接 | 自訂 context manager 或 decorator |
| KI-12 | `soft_delete_event` 不處理報名紀錄 | 活動被撤銷後，報名紀錄仍存在且仍在「我的報名」中顯示 | **這是刻意的**——報名紀錄是報名者的資料，不該因活動撤銷而消失。模板加上「活動已撤銷」標記 | 若要改變此行為，同時標記報名為 `rejected` 並通知報名者 |
| KI-20 | 資料庫無外鍵約束 | 孤兒資料在資料庫層不會被阻止 | 軟刪除策略已在應用層規避 | 啟用 `PRAGMA foreign_keys=ON` 並加上 `REFERENCES` |
| KI-21 | 無任何索引 | `list_events` 的 JOIN 與 `get_registration` 的查詢都是全表掃描 | 資料量級不需要 | 至少加上 `registrations(event_id, user_id)` 與 `events(event_datetime)` |
| KI-26 | 電話與 Email 欄位無後端格式驗證 | 可存入任意字串。前端的 `type="email"` 可被繞過 | 選填欄位，且格式因國別而異 | 加入基本的正規表達式驗證 |
| KI-27 | `event_title` 無後端長度驗證 | 前端 `maxlength="200"` 可被繞過，可存入任意長度標題 | `event_place` 有驗但 `event_title` 沒有，這個不一致本身就值得討論 | 補上 `len(...) > 200` 檢查 |
| KI-28 | 四段活動長文字無長度上限 | 可寫入任意大小的內容 | Jinja2 已擋住 XSS；資源耗用在教學情境不成問題 | 加入長度上限（如 10000 字元） |

### 11.4 使用者體驗與前端

| ID | 問題 | 影響 | 為何接受 | 修補方向 |
|----|------|------|---------|---------|
| KI-08 | Blueprint 中的訊息字串硬編碼 | 修改時必須同步更新 `tests/data/users.py` | 集中管理會多一層間接 | 建立 `messages.py` 常數模組，Blueprint 與測試共用 |
| KI-17 | admin 的四個 POST 動作 redirect 時不帶 query string | 篩選與頁碼會被重設 | 刻意保留為教材 | redirect 時帶回原本的 `status` / `q` / `page` |
| KI-19 | 狀態 badge 的底色硬編碼於 `admin.css` 與 `events.css` | `common.css` 未定義狀態語意色，兩個檔案各有一套 | 兩者的狀態語意不同（帳號狀態 vs 活動狀態） | 在 `common.css` 加入 `--status-ok-*`、`--status-warn-*` 等 token |
| KI-31 | `hub.css` 的 `.hub-register-link` 與 `.hub-logout` 寫死色碼 | 違反「顏色一律用 token」原則；類別名稱不含 `btn`，稽核抓不到 | 刻意保留為教材 | 改用 `var(--btn-primary-bg)` / `var(--btn-danger-bg)` |
| KI-33 | 活動主頁雙欄配置未做 responsive | 760 px 以下右欄會被擠壓 | 桌面優先的教學專案 | 加入 media query，窄螢幕改為單欄堆疊 |
| KI-34 | 無 ARIA 標記與鍵盤導覽最佳化 | 螢幕閱讀器體驗不佳 | 超出教學範圍 | 加上 `aria-label`、`role`、focus 管理 |
| KI-35 | 分頁只有「上一頁／下一頁」，無法跳頁 | 活動多時要按很多次 | 資料量級不需要 | 加入頁碼列表 |
| KI-36 | `blueprints/auth/__init__.py` 直接 `import sqlite3` 以攔截 `IntegrityError` | 資料庫實作洩漏到 Blueprint 層，違反「SQL 只寫在 `db/` 內」的模組邊界原則。換掉資料庫就得改這裡 | 替代方案是讓 `db.create_user()` 自行攔截並回傳 `None` 或拋出自訂例外，但那會多一層間接 | `db/users.py` 定義 `EmailTakenError` 並在 `create_user()` 中轉換 |

### 11.5 三項刻意做強的地方

| # | 項目 | 為什麼這樣做 |
|:--:|------|-------------|
| 1 | **`events._current_user()` 加上 `_is_usable` 檢查** | 只查 id 不驗狀態的話，被停用的帳號只要 session 未清，仍能建立公開活動、報名並佔用別人的名額，讓 admin 的停用功能形同虛設。影響外溢到當事人以外，依 §11.0 的判準必須修 |
| 2 | **刪除與取消改用 `<button type="submit">`** | 用 `<a href="#" onclick="...this.closest('form').submit()">` 是語意錯誤：`<a>` 表示導航，這裡是有副作用的 POST，而且鍵盤操作與螢幕閱讀器行為不正確 |
| 3 | **events 的訊息字串集中到 `MESSAGES`** | 訊息散落在測試斷言中會造成兩處不一致，改一句話要翻遍測試檔。50 條訊息現在全部在一處 |

另有兩項**刻意不做**：

| 項目 | 為什麼不做 |
|------|-----------|
| `admin_set_registration_status()` 這類沒有路由呼叫的函式 | 沒有入口的函式就是死碼；`rejected` 狀態的完整設計見第 13 章 |
| 一次性的種子植入機制 | 種子資料一律走 `_seed_events_if_empty()`——與種子帳號同一個機制、同一個時機、同一套「表為空才執行」的判斷，讀者不必學兩種東西 |

---

## 12. 測試策略

### 12.1 測試層級

只有一層：**以 Flask test client 進行的路由層整合測試**。
不寫單元測試（`db.*` 函式的行為透過路由測試間接覆蓋），不寫端對端測試（不啟動瀏覽器）。

理由是這個層級的投資報酬率最高：一個測試同時覆蓋路由、權限、業務邏輯、資料層與模板渲染，
而且測試程式讀起來就像使用者操作的敘述。

### 12.2 隔離機制

| 機制 | 做法 |
|------|------|
| 資料庫 | 每個測試函式用 `tmp_path` 建立獨立的 SQLite 暫存檔；`db.DB_PATH` 動態替換 |
| 種子資料 | `db.init_db()` 自動植入三個帳號與五筆活動，測試不必自行建立 |
| 登入狀態 | 直接以 `session_transaction()` 注入 `session['user_id']`，不走登入流程 |
| 驗證碼 | 直接以 `session_transaction()` 注入 `session['captcha']` |
| 收集範圍 | `pytest.ini` 的 `testpaths = tests` 限定只收集本系統的測試 |

### 12.3 Fixtures

| Fixture | 說明 |
|---------|------|
| `app` | function scope；暫存 DB + 種子資料；`TESTING=True` |
| `client` | Flask test client（未登入） |
| `authed_client` | `session['user_id'] = 1`（一般使用者） |
| `admin_client` | `session['user_id'] = 2`（管理員） |
| `other_client` | `session['user_id'] = 3`（停用帳號但 session 直接注入） |
| `event`（test_events 內） | 可報名的未來活動，發起者 user 1 |
| `registered`（test_events 內） | 上述活動 + user 1 已報名 |
| `many_users`（test_admin 內） | 補 8 筆會員湊足 11 筆，供分頁測試 |

### 12.4 測試檔案與案例數

| 檔案 | 案例數 | 覆蓋 |
|------|:--:|------|
| `test_auth.py` | 23 | 登入、申請、登出、驗證碼 |
| `test_hub.py` | 11 | 訪客／已登入雙模式、卡片顯示與上鎖 |
| `test_profile.py` | 8 | 查看、編輯、更新、停用帳號的行為 |
| `test_admin.py` | 30 | 權限守門、清單／篩選／搜尋／分頁、四個管理動作與自我保護 |
| `test_events.py` | **80** | 見下 |
| **合計** | **152** | |

`test_events.py` 的分佈：

| 區塊 | 案例數 | 重點 |
|------|:--:|------|
| 種子資料 | 3 | 五種狀態齊備、名額計算正確 |
| 瀏覽 | 10 | 匿名瀏覽、公開／完整名單的分界、已刪除活動、分頁 |
| 新增活動 | 13 | 成功、雙表寫入、停用帳號被擋、九條驗證 |
| 修改活動 | 12 | 發起者／管理員／他人、預填、名額下限、已刪除活動 |
| 刪除活動 | 6 | 發起者／管理員／他人、軟刪除、級聯副表 |
| 報名 | 14 | 成功、欄位儲存、五種狀態擋下、重複、恢復同一列 |
| 取消 | 7 | 軟取消、釋出名額、重複取消、他人無法取消 |
| 修改報名 | 7 | 預填、更新、不改狀態、他人被拒、取消後被拒 |
| 我的報名 | 8 | 種子紀錄、已取消、活動撤銷後保留、停用帳號被擋 |

### 12.5 覆蓋原則

1. **被權限擋下的 POST 必須同時斷言資料庫沒有改變。**
   只驗 302 無法區分「被擋下」與「執行成功後 redirect」
2. **每條路由至少覆蓋四種身分**：訪客、一般使用者、活動發起者、管理員
3. **每個狀態轉移至少一個案例**：五種活動狀態各有一個「擋下報名」的測試
4. **數量斷言用相對式**：`before = ...` / `assert after == before + 1`，
   不寫死絕對值——種子資料改變時測試不該全面崩潰

### 12.6 兩個測試陷阱

**陷阱一：events 的權限測試必須先啟用 user 3。**
`events._current_user()` 把停用帳號視為 `None`，因此「他人無權限」的測試若直接用
`other_client`，會被更前面的帳號有效性檢查攔下，測不到權限那一層。
`test_events.py` 提供 `_enable_other()` helper 處理。

**陷阱二：三個 authed fixture 是同一個物件。**
`authed_client`、`admin_client`、`other_client` 都由 `client` 衍生，
同一個測試中同時請求兩個，拿到的是同一個 test client。
需要第二個乾淨的 client 時，請求 `app` fixture 後自行 `app.test_client()`。

### 12.7 已知的測試缺口

| 缺口 | 說明 |
|------|------|
| 並行報名 | KI-11 描述的 race condition 無法用 test client 重現，需要多執行緒或多程序 |
| 時區偏差 | KI-13 的影響沒有測試覆蓋——測試中的活動時間間隔都遠大於 8 小時 |
| 模板渲染細節 | 只斷言關鍵字串出現，不驗證 HTML 結構或 CSS class 的完整性 |
| Docker | 無自動化的容器建置與啟動驗證 |
| `waiting` / `rejected` | 不可達狀態（KI-14），無法從路由測試 |

### 12.8 執行測試

```bash
pytest                              # 全部 152 個
pytest tests/test_events.py -v      # 單一模組
pytest -k "register"                # 名稱符合的測試
pytest --collect-only -q            # 只列出案例
```

---

## 13. 未來擴充建議

以下五項依「教學價值 ÷ 實作成本」排序，適合作為期末專題的擴充方向。

### 13.1 候補機制（啟用 `waiting` 狀態）

**需求**：名額已滿時，使用者仍可報名並進入候補；有人取消時，最早候補的人自動遞補。

**需要改的東西**：

- `_event_status()` 增加一種狀態，或讓 `full` 也允許報名（改為候補）
- `create_or_restore_registration()` 依當前人數決定寫入 `registered` 或 `waiting`
- `cancel_registration()` 之後觸發遞補：找出最早的 `waiting` 改為 `registered`
- 候補順序需要一個明確的排序依據（`created_at` 即可）

**教學價值**：這是第一個需要「一個操作觸發另一個資料變更」的需求，
也會逼出「遞補應該在 transaction 內完成」這個結論。

### 13.2 管理者強制取消（啟用 `rejected` 狀態）

**需求**：活動發起者或管理員可以取消特定報名（例如重複報名、資格不符）。

**需要改的東西**：

- 新增路由 `POST /events/<event_id>/registrations/<reg_id>/reject`
- 新增 `db.set_registration_status(registration_id, status)`
- 權限為 `_is_organizer_or_admin`，且**必須驗證該報名確實屬於該活動**
  （否則可以用任意 `reg_id` 取消別場活動的報名）
- 完整報名名單的每一列加上「取消此報名」按鈕

**教學價值**：最後那條驗證是典型的 IDOR（不安全的直接物件參照）防護，
而且是本系統目前完全沒有出現過的漏洞形態——因為現有的報名路由都以
`user_id = session['user_id']` 為條件，天然免疫。

### 13.3 報名資料匯出

**需求**：活動發起者可下載該活動的報名名單 CSV。

**需要改的東西**：新增 `GET /events/<id>/export`，權限同完整名單，
以 `csv` 模組產生內容並設定 `Content-Disposition` 標頭。

**教學價值**：第一個回傳非 HTML 的路由。也會碰到中文編碼問題（Excel 需要 BOM）。

### 13.4 活動搜尋與排序

**需求**：依標題關鍵字搜尋、依狀態篩選、切換排序方向。

**需要改的東西**：`list_events()` 增加 `keyword`、`sort` 參數，
模板加上篩選列（可直接參考 `admin/user_list.html` 的做法）。

**難點**：**活動狀態不存在資料庫中**，無法用 SQL 的 `WHERE` 篩選。
可選的做法有三種——在應用層過濾（會破壞分頁）、把狀態寫進資料庫並定期更新（要處理同步）、
把狀態的判斷條件翻譯成 SQL 條件（正確但 SQL 會變長）。這個取捨本身就是很好的題目。

### 13.5 稽核紀錄

**需求**：記錄所有寫入操作（誰、何時、對哪筆資料、做了什麼）。

**需要改的東西**：新增第五張表 `audit_logs`，在每個寫入路由後呼叫 `db.log_action(...)`。

**教學價值**：這是唯一需要**橫跨所有子系統**的擴充，會逼出「要不要用裝飾器」
這個問題——而本專案的開發原則明文禁止把權限檢查抽成裝飾器。
稽核紀錄是否適用同一條原則？答案不明顯，值得討論。

---

## 附錄 A：路由與訊息字串對照

| 路由 | 可能的訊息 |
|------|-----------|
| `POST /login` | `請輸入驗證碼`、`驗證碼錯誤，請重新輸入`、`請輸入帳號與密碼`、`帳號或密碼錯誤`、`帳號已停用` |
| `POST /register` | `請輸入電子郵件與密碼`、`電子郵件格式不正確`、`密碼至少需要 8 個字元`、`兩次密碼輸入不一致`、`此電子郵件已被使用`、`申請成功，請登入` |
| `POST /admin/users/<id>/*` | `無操作權限`、`找不到該使用者`、`該帳號已刪除，無法操作`、`不可停用自己的帳號`、`不可刪除自己的帳號`、`不可修改自己的角色`、`角色值不正確`、`帳號已啟用`、`帳號已停用`、`角色已更新`、`帳號已刪除` |
| `POST /events/new` | 12 條表單驗證訊息、`活動已建立` |
| `POST /events/edit/<id>` | 12 條表單驗證訊息、`活動不存在或已刪除`、`無權限修改此活動`、`活動已更新` |
| `POST /events/delete/<id>` | `活動不存在或已刪除`、`無權限刪除此活動`、`活動已刪除` |
| `POST /events/<id>/register` | `活動不存在或已刪除`、`您已報名此活動`、`活動已結束`、`報名已截止`、`尚未開放報名`、`活動名額已滿`、`請選擇正確的用餐選項`、`報名成功` |
| `POST /events/<id>/cancel` | `活動不存在或已刪除`、`您沒有有效的報名紀錄`、`已取消報名` |
| `POST /events/<id>/edit_registration` | `活動不存在或已刪除`、`您沒有有效的報名紀錄`、`請選擇正確的用餐選項`、`報名資訊已更新` |

## 附錄 B：詞彙表

| 中文 | 英文 | 在本系統中的意義 |
|------|------|-----------------|
| 軟刪除 | soft delete | 把 `is_deleted` 設為 1，不執行 `DELETE` |
| 主表／副表 | master / detail | `events` 與 `event_details`，一對一，冷熱欄位分離 |
| 名額 | capacity | `events.capacity`，只被 `registered` 狀態的報名佔用 |
| 有效報名 | active registration | `registration_status = 'registered'` 的報名 |
| 活動發起者 | organizer | `events.user_id` 指向的使用者。是關係不是角色 |
| 活動狀態 | event status | 五種，由時間與名額**計算**得出，不存資料庫 |
| 報名狀態 | registration status | 四種，**存在** `registrations.registration_status` |
| 守門 | gatekeeping | 路由開頭的權限檢查 |
| 種子資料 | seed data | 資料庫初次建立時自動植入的示範資料 |
| 冪等 | idempotent | 重複執行結果相同。`activate` / `deactivate` 拆成兩條路由即為此 |
