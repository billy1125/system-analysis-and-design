# 校園小型圖書借閱系統 — 系統規格書

## 0. 文件資訊

| 項目 | 內容 |
|------|------|
| 文件名稱 | 校園小型圖書借閱系統 系統規格書 |
| 版本 | v1.0 |
| 日期 | 2026-08-11 |
| 適用讀者 | 修習系統分析與設計課程的學生、後續維護此專案的開發者 |
| 系統版本 | 校園小型圖書借閱系統 v1.0 |

### 0.1 文件定位

本專案的文件分為五層，各自回答不同的問題。撰寫或閱讀時請先確認自己需要的是哪一層：

| 文件 | 回答的問題 |
|------|-----------|
| `document/system-spec.md`（本文件） | 這個系統**是什麼**：功能、資料、規則、限制 |
| `document/build-guide.md` | 這個系統**怎麼建**：從空目錄到可執行的分階段步驟與驗收方式 |
| `CLAUDE.md`、各子目錄的 `CLAUDE.md` | AI 助理與開發者**怎麼協作**：專案速查、模組職責 |
| `rules/flask-blueprint.md`、`rules/database.md` | 寫程式時**要遵守什麼**：路由、表單、SQL、CSS 的具體慣例 |
| `tests/CLAUDE.md` | 測試**怎麼寫**：fixtures、種子資料的陷阱、覆蓋要求 |

本文件是其他文件的上位依據。當本文件與其他文件衝突時，以本文件為準，並回頭修正衝突的那一份。

---

## 1. 專案定位與範圍

### 1.1 系統目的

本系統是一套以**學習與可理解性為優先**的校園小型圖書借閱系統，用於系統分析與設計課程的教學。它刻意維持小規模、不做過度抽象，讓學生能夠在兩小時內讀完全部程式碼，並且看清楚「讀者在瀏覽器上按下借閱」是如何一路走到資料庫、觸發一連串狀態變化，再走回畫面的。

系統提供五件事：讓訪客申請借閱證並登入、讓讀者查詢館藏、讓讀者借書還書續借、讓讀者在書被借光時排隊候補、讓館員治理帳號與館藏。

前兩件沿用會員管理系統的成果；後三件是本系統的主體，也是它相對於前一個專案真正新增的教學價值——**帳號的狀態與交易的狀態互相牽動**。一個被停用的帳號能不能繼續借書、一本借出中的書能不能被下架、一筆逾期的借閱會擋住哪些操作，這些問題只有在有交易子系統時才問得出來。

### 1.2 範圍

**範圍內：**

- Hub 首頁（訪客瀏覽 + 內嵌登入表單；登入後的借閱概況與服務入口）
- 身分驗證（登入、申請帳號、登出、圖形驗證碼）
- 個人資料（本人查看與編輯姓名、顯示名稱）
- 會員管理（館員專用：帳號清單、篩選、搜尋、分頁、啟用／停用、角色調整、軟刪除）
- 館藏查詢與維護（書目主檔 + 館藏複本明細；搜尋、分類篩選、分頁）
- 借閱（借書、續借、還書；借期、冊數上限、續借次數、逾期封鎖）
- 預約（無可借複本時候補排隊、順位計算、還書自動遞補）
- 健康檢查端點
- 上述功能的自動化測試
- Docker 容器化部署設定

**範圍外（明確不包含）：**

- 罰款與滯納金計算
- 館際互借、跨館調撥
- 條碼掃描器整合、RFID
- 電子郵件或簡訊通知（到期提醒、可取書通知）
- 圖書採購、編目、期刊管理
- 借閱統計報表與資料匯出
- 保留架與保留期限（預約只做候補排隊，見 §11 KI-21）

這些是真實圖書館系統會有、但對教學目的而言只會增加篇幅的功能。§13 列出其中值得作為課堂延伸作業的幾項。

### 1.4 為什麼不做館員審核

交易型系統常見的「申請 → 審核 → 核准後執行」流程，本系統**刻意不做**，理由有三：

1. **不符合圖書館的實際運作。** 圖書借閱是即時的自助行為，讀者拿著書到櫃台或自助機就完成，沒有「等待審核」這個環節。硬套上去會讓學生對領域建模產生錯誤印象。
2. **狀態機會膨脹。** 加上審核就會需要 pending、approved、rejected、cancelled 等狀態；本系統只有 2 種（borrowed、returned）加上一個推導出來的逾期。狀態少，學生才看得清楚每一次轉換的觸發點。
3. **規則的位置更值得教。** 省下來的篇幅換成了**借閱規則**：冊數上限、續借次數、逾期封鎖、預約遞補。這些規則彼此有交互作用（逾期會擋住借書、預約會擋住續借），比多幾個狀態更能示範「業務規則該放在哪一層」。

### 1.5 名詞定義

| 名詞 | 定義 |
|------|------|
| 讀者（reader） | `users` 表中 `role = 1` 的一筆紀錄。訪客申請借閱證後即成為讀者 |
| 館員（librarian） | `users` 表中 `role = 0` 的一筆紀錄。等同於系統管理員 |
| 訪客（guest） | 沒有有效 session 的瀏覽者。可瀏覽首頁、查詢館藏、申請借閱證，不能借閱或預約 |
| 角色（role） | 整數欄位。`0` = 館員（管理員），`1` = 讀者（一般使用者） |
| 啟用／停用（`is_active`） | `1` = 啟用，`0` = 停用。停用帳號無法登入，也無法借閱與預約 |
| 軟刪除（`is_deleted`） | `1` = 已刪除。系統**不執行實體 DELETE**，刪除只是把旗標設為 1 |
| 帳號可用（usable） | `utils._is_usable(user)` 的判定結果：使用者存在、`is_active` 為真、`is_deleted` 為假 |
| 書目（book） | `books` 表中的一筆紀錄，代表一個 ISBN。書目本身不能被借走 |
| 複本（copy） | `book_copies` 表中的一筆紀錄，代表架上一本實體書。**借閱的對象是複本，不是書目** |
| 條碼（barcode） | 複本的識別碼，格式 `{書目 id 補 4 位}-{流水號補 3 位}`，例如 `0007-002` |
| 在架（available） | 複本狀態之一，表示可以被借走 |
| 借閱（loan） | `loans` 表中的一筆紀錄，代表一位讀者借走一本複本 |
| 借期 | 從借出到應還的天數，本系統為 14 天 |
| 續借（renew） | 把應還日往後延長。本系統每筆借閱可續借 1 次，每次 14 天 |
| 逾期（overdue） | 未歸還且 `due_at` 早於現在。**不是資料庫欄位**，由查詢時推導 |
| 預約（reservation） | 書目無可借複本時的候補排隊。**不保留書本**，只是排隊 |
| 可取書（ready） | 預約狀態之一，表示輪到這位讀者了，可以來借。仍為先到先得 |
| 主檔／明細（master / detail） | 一對多的資料表配對。本系統的 `books` 與 `book_copies` 是唯一的例子 |
| 種子資料（seed data） | 資料庫初次建立時自動植入的示範資料：3 個帳號、10 筆書目、18 本複本 |

---

## 2. 技術棧與執行環境

### 2.1 選型

| 層次 | 技術 | 版本／說明 |
|------|------|-----------|
| 語言 | Python | 3.11（Docker 映像檔） |
| Web 框架 | Flask | 以 Blueprint 分割子系統 |
| 樣板引擎 | Jinja2 | Flask 內建，模板繼承自 `templates/base.html` |
| 資料庫 | SQLite | 單一檔案，啟用 WAL 模式 |
| 密碼雜湊 | bcrypt | 正式流程 cost=10，種子資料 cost=4 |
| 圖形驗證碼 | captcha | `ImageCaptcha`，160×50 px |
| 前端 | 原生 HTML + CSS | 無框架、無建置流程 |
| 測試 | pytest + pytest-flask | Flask test client，不啟動實際伺服器 |
| 容器 | Docker + docker compose | 單一 web 服務 + 一個具名 volume |

### 2.2 刻意不採用的技術

| 技術 | 不採用的理由 |
|------|-------------|
| ORM（SQLAlchemy 等） | 學生需要看見 SQL。ORM 會把「查詢怎麼寫」變成「設定怎麼填」 |
| 資料庫遷移工具（Alembic） | 只有五張表，`CREATE TABLE IF NOT EXISTS` 就夠 |
| 前端框架（React、Vue） | 會引入建置流程與狀態管理，模糊掉伺服器端渲染的請求／回應循環 |
| Flask-Login、Flask-WTF | session 與表單驗證只有幾十行，自己寫看得見全貌 |
| 背景排程（Celery、APScheduler） | 逾期狀態改為查詢時推導，就不需要排程器。見 §6.7 |
| 外鍵約束（FOREIGN KEY） | SQLite 預設不啟用，本系統也不啟用，後果記在 §11 KI-31 |

### 2.3 執行方式

**本機開發：**

```bash
pip install -r requirements.txt
python app.py            # http://localhost:4000
```

`app.py` 的 `__main__` 區塊會先呼叫 `db.init_db()` 建表並植入種子資料，再以 `debug=True` 啟動。

**容器：**

```bash
docker compose up --build
```

DB 檔案存放於具名 volume `db_data` 掛載的 `/app/data`，容器重建不會遺失資料。

**測試：**

```bash
pytest
```

### 2.4 環境變數

| 變數 | 預設值 | 說明 |
|------|--------|------|
| `SECRET_KEY` | `dev-secret-key-change-in-production` | Flask session 簽章金鑰。正式環境必須覆寫 |
| `DB_PATH` | `database.db` | SQLite 檔案路徑。容器中設為 `/app/data/database.db` |

---

## 3. 系統架構

### 3.1 分層

```
瀏覽器
   │  HTTP request
   ▼
┌──────────────────────────────────────────────┐
│ Blueprint（blueprints/<name>/__init__.py）    │
│  · 解析表單與 query string                    │
│  · 身分與權限守門                             │
│  · 呼叫 db.* 函式                             │
│  · 把回傳的狀態碼翻成使用者訊息               │
│  · POST-Redirect-GET                          │
└──────────────────────────────────────────────┘
   │  db.borrow_book(book_id, user_id)
   ▼
┌──────────────────────────────────────────────┐
│ 資料存取層（db/）                             │
│  · 全部 SQL                                   │
│  · 借閱業務規則與狀態機                       │
│  · transaction 邊界                           │
└──────────────────────────────────────────────┘
   │  sqlite3
   ▼
   SQLite 檔案
```

**Blueprint 不寫 SQL，`db/` 不碰 `session` 與 `flash`。** 這條界線是本專案唯一嚴格執行的架構規則。

### 3.2 模組邊界三原則

1. **SQL 只出現在 `db/`。** Blueprint 透過 `import db` → `db.func()` 呼叫。
2. **業務規則跟著資料走。** 借閱政策的數值與判斷都在 `db/loans.py`，因為它們是關於「資料能不能這樣變」的規則，不是關於畫面的規則。Blueprint 只負責把結果翻成中文。
3. **權限判斷留在 Blueprint。** `db` 層不知道誰是館員。`db.cancel_reservation()` 收一個 `is_admin` 旗標，但那個旗標由 Blueprint 算出來——這樣同一個函式才能同時服務讀者與館員兩種呼叫端。

### 3.3 目錄結構

```
SAD-Library/
├── app.py                      # 建立 Flask app、註冊 7 個 Blueprint、/health
├── utils.py                    # _gen_captcha、_is_usable、login_required
├── requirements.txt
├── pytest.ini                  # testpaths 限定為 tests/
├── Dockerfile / docker-compose.yml / .dockerignore
├── CLAUDE.md                   # 專案速查
├── README.md
│
├── db/
│   ├── __init__.py             # DB_PATH、公開函式匯出、init_db()
│   ├── connection.py           # _get_conn()
│   ├── users.py                # users 表
│   ├── books.py                # books + book_copies 兩表
│   ├── loans.py                # loans 表 + 借閱政策常數
│   ├── reservations.py         # reservations 表
│   └── CLAUDE.md
│
├── blueprints/
│   ├── auth/                   # 登入、申請、登出、驗證碼
│   ├── hub/                    # 首頁
│   ├── profile/                # 個人資料
│   ├── admin/                  # 會員管理
│   ├── books/                  # 館藏查詢與維護
│   ├── loans/                  # 借書、續借、還書、借閱管理
│   └── reservations/           # 預約、取消、預約管理
│       └── 每個目錄含 __init__.py 與 CLAUDE.md
│
├── templates/
│   ├── base.html
│   ├── auth/       login.html、register.html
│   ├── hub/        home.html
│   ├── profile/    dashboard.html
│   ├── admin/      user_list.html、user_detail.html
│   ├── books/      index.html、book_form.html
│   ├── loans/      my_loans.html、loan_detail.html、admin_loans.html
│   └── reservations/  my_reservations.html、admin_reservations.html
│
├── static/
│   ├── common.css              # 設計 token（:root 的 --btn-* 變數）
│   ├── login.css               # 登入頁與內嵌登入表單
│   ├── hub.css / profile.css / admin.css
│   └── books.css / loans.css / reservations.css
│
├── rules/
│   ├── flask-blueprint.md
│   └── database.md
│
├── document/
│   ├── system-spec.md          # 本文件
│   └── build-guide.md
│
└── tests/
    ├── conftest.py             # fixtures
    ├── CLAUDE.md
    ├── data/  users.py、library.py
    └── test_admin.py / test_auth.py / test_books.py / test_hub.py
        test_loans.py / test_profile.py / test_reservations.py
```

### 3.4 Blueprint 職責

| Blueprint | url_prefix | 職責 | 開放瀏覽 |
|-----------|-----------|------|:--------:|
| `auth` | — | 登入、申請借閱證、登出、驗證碼圖片 | 是 |
| `hub` | — | 首頁：訪客視圖 / 登入視圖、借閱概況 | 是 |
| `profile` | — | 本人的資料查看與編輯 | 否 |
| `admin` | `/admin` | 帳號清單與治理 | 否 |
| `books` | `/books` | 館藏查詢（公開）、書目與複本維護（館員） | 部分 |
| `loans` | `/loans` | 借書、續借、還書、我的借閱、借閱管理 | 否 |
| `reservations` | `/reservations` | 預約、取消、我的預約、預約管理 | 否 |

### 3.5 請求生命週期與 session

1. 瀏覽器送出請求，帶著 Flask 簽章過的 session cookie
2. Flask 路由分派到對應 Blueprint 的函式
3. 需要登入的路由先過 `@login_required`：`session` 中沒有 `user_id` → redirect `/login`
4. 函式內以 `_current_user()` 取得使用者並檢查 `_is_usable()`
5. 呼叫 `db.*` 取得資料或執行變更
6. GET → `render_template()`；POST → `flash()` + `redirect()`

**session 只存 `user_id` 與 `captcha` 兩個鍵。** 角色、姓名等一律每次請求重新查資料庫——這樣館員把某個帳號停用時，該帳號的下一個請求就會被擋下，不需要等 session 過期。

---

## 4. 角色與權限

### 4.1 角色

| role | 名稱 | 說明 |
|:----:|------|------|
| `0` | 館員（管理員） | 治理帳號、維護館藏、代為還書、取消任何預約。館員也可以自己借書 |
| `1` | 讀者（一般使用者） | 查詢館藏、借書、續借、還書、預約 |

### 4.2 帳號狀態矩陣

| `is_active` | `is_deleted` | 狀態 | 可登入 | 可借閱／預約 | 館員可操作 |
|:-----------:|:------------:|------|:------:|:-----------:|:---------:|
| 1 | 0 | 啟用中 | ✅ | ✅ | ✅ |
| 0 | 0 | 已停用 | ❌ | ❌ | ✅（可啟用） |
| 1 | 1 | 已刪除 | ❌ | ❌ | ❌ |
| 0 | 1 | 已刪除 | ❌ | ❌ | ❌ |

`is_deleted = 1` 時 `is_active` 的值不再有意義，一律視為已刪除。

### 4.3 權限矩陣

| 功能 | 訪客 | 讀者 | 館員 |
|------|:----:|:----:|:----:|
| 瀏覽首頁 | ✅ | ✅ | ✅ |
| 申請借閱證 | ✅ | — | — |
| 查詢館藏、看書目詳細 | ✅ | ✅ | ✅ |
| 看複本清單 | ✅ | ✅ | ✅ |
| 看複本維護按鈕 | ❌ | ❌ | ✅ |
| 看書目的借閱歷程 | ❌ | ❌ | ✅ |
| 借書 | ❌ | ✅ | ✅ |
| 續借 | ❌ | ✅（限本人） | ✅（限本人） |
| 歸還 | ❌ | ✅（限本人） | ✅（任何一筆） |
| 預約 | ❌ | ✅ | ✅ |
| 取消預約 | ❌ | ✅（限本人） | ✅（任何一筆） |
| 看借閱明細 | ❌ | ✅（限本人） | ✅（任何一筆） |
| 全館借閱紀錄 | ❌ | ❌ | ✅ |
| 全館預約佇列 | ❌ | ❌ | ✅ |
| 新增／修改／下架書目 | ❌ | ❌ | ✅ |
| 新增／調整／刪除複本 | ❌ | ❌ | ✅ |
| 個人資料 | ❌ | ✅ | ✅ |
| 會員管理 | ❌ | ❌ | ✅ |

**續借是唯一館員也不能代勞的操作。** 續借是讀者對自己借閱的展期意思表示，館員代按沒有意義；還書則相反，櫃台代為登記是常態。

### 4.4 三層檢查機制

每一個需要權限的操作都經過三層，順序固定：

```
第 1 層：@login_required        session 中有 user_id 嗎？      → 沒有：redirect /login
第 2 層：_is_usable(user)       帳號啟用且未刪除嗎？           → 否：session.clear() + redirect /login
第 3 層：_is_admin(user)        role == 0 嗎？                 → 否：flash 無操作權限 + redirect
```

第 2 層存在的理由：session 是簽章過的 cookie，館員停用某個帳號時，該帳號手上的 cookie 仍然有效。若只檢查第 1 層，被停用的讀者可以繼續借書直到 cookie 過期。

**兩種實作寫法**，依子系統是否有開放路由而不同：

```python
# books：有開放瀏覽的路由，第 1、2 層收斂進 _current_user()，允許回傳 None
def _current_user():
    if 'user_id' not in session:
        return None
    user = db.find_user_by_id(session['user_id'])
    if not _is_usable(user):
        session.clear()
        return None
    return user

# admin：沒有開放路由，每一層的處置不同，分開寫才看得見差異
user = _current_user()
if not _is_usable(user):
    session.clear()
    return redirect(url_for('auth.login_page'))
if not _is_admin(user):
    flash('無操作權限', 'error')
    return redirect(url_for('hub.home'))
```

`loans` 與 `reservations` 採 `books` 的收斂寫法，但因為沒有開放路由，`None` 一律 redirect 到登入頁。

### 4.5 自我保護規則

館員不能對自己執行三種操作：

| 代號 | 規則 | 訊息 |
|------|------|------|
| R1 | 不可停用自己的帳號 | 不可停用自己的帳號 |
| R2 | 不可刪除自己的帳號 | 不可刪除自己的帳號 |
| R3 | 不可修改自己的角色 | 不可修改自己的角色 |

「啟用自己」不設限——無害且冪等。

**「最後一個館員」不受保護。** 系統中若有兩位館員，甲可以把乙降級為讀者，然後系統只剩甲一位館員；甲雖然不能降自己的級，但若甲的帳號被乙先降級，就可能出現零館員的狀態。本系統**不處理**這個情境，記錄為 KI-12。修正方式是在 `set_user_role` 前先數一數館員人數，但那需要一個「至少保留一位」的規則定義，超出教學範圍。

---

## 5. 功能需求

功能需求以 `FR-<子系統>-<序號>` 編號。

### 5.1 首頁（FR-HUB）

| 編號 | 需求 |
|------|------|
| FR-HUB-01 | 訪客可瀏覽首頁，看到館藏查詢入口與三張標示「需登入」的鎖定卡片 |
| FR-HUB-02 | 訪客可在首頁右欄的內嵌表單直接登入，驗證順序與 `/login` 完全一致 |
| FR-HUB-03 | 登入後顯示歡迎詞、借閱概況與服務卡片格線 |
| FR-HUB-04 | 借閱概況顯示三個數字：借閱中冊數／上限、逾期未還筆數、進行中的預約筆數 |
| FR-HUB-05 | 有逾期時，概況列的逾期方塊以警示色呈現，並在其下顯示一條說明「逾期期間無法再借新書」 |
| FR-HUB-06 | 館員額外看到三張管理卡片：借閱管理、預約管理、會員管理 |
| FR-HUB-07 | 其他子系統以 flash 回報的訊息（如「無操作權限」）在本頁顯示 |
| FR-HUB-08 | 帳號在登入期間被停用或刪除時，本頁回落為訪客視圖，不 redirect |

### 5.2 身分驗證（FR-AUTH）

| 編號 | 需求 |
|------|------|
| FR-AUTH-01 | 訪客可用電子郵件與密碼登入，需通過圖形驗證碼 |
| FR-AUTH-02 | 驗證碼為 5 位大寫英數字（排除易混淆的 I、O、0、1），不區分大小寫 |
| FR-AUTH-03 | 驗證碼圖片可點擊刷新，答案存於 `session['captcha']` |
| FR-AUTH-04 | 登入成功後更新 `last_login_at`，設定 `session['user_id']`，redirect 首頁 |
| FR-AUTH-05 | 已登入者存取 `/login` 或 `/register` 一律 redirect 首頁 |
| FR-AUTH-06 | 訪客可申請借閱證，必填電子郵件與密碼，選填姓名與顯示名稱 |
| FR-AUTH-07 | 密碼以 bcrypt（cost=10）雜湊後儲存，資料庫中不存明文 |
| FR-AUTH-08 | 申請成功後 redirect 登入頁並顯示「申請成功，請登入」 |
| FR-AUTH-09 | 表單驗證失敗時保留已填的欄位值（密碼除外） |
| FR-AUTH-10 | 登出清除整個 session 並 redirect 登入頁 |

### 5.3 個人資料（FR-PROFILE）

| 編號 | 需求 |
|------|------|
| FR-PROFILE-01 | 讀者可查看自己的電子郵件、姓名、顯示名稱、身分、建立日期、最後登入 |
| FR-PROFILE-02 | `?edit=1` 進入編輯模式，可修改姓名與顯示名稱 |
| FR-PROFILE-03 | 電子郵件、身分、時間欄位不可自行修改 |
| FR-PROFILE-04 | 儲存後 redirect 回檢視模式 |
| FR-PROFILE-05 | 帳號已刪除時 redirect 登入頁 |

### 5.4 會員管理（FR-ADMIN）

| 編號 | 需求 |
|------|------|
| FR-ADMIN-01 | 館員可查看所有帳號清單，每頁 10 筆 |
| FR-ADMIN-02 | 可依狀態篩選：全部／啟用中／已停用／已刪除 |
| FR-ADMIN-03 | 可依關鍵字搜尋 email、姓名、顯示名稱，可與狀態篩選組合 |
| FR-ADMIN-04 | 可查看單一帳號的明細頁 |
| FR-ADMIN-05 | 可啟用／停用帳號 |
| FR-ADMIN-06 | 可調整角色（館員 ↔ 讀者） |
| FR-ADMIN-07 | 可軟刪除帳號；已刪除的帳號不可再被操作 |
| FR-ADMIN-08 | 自我保護規則 R1～R3（見 §4.5） |
| FR-ADMIN-09 | 清單中自己的那一列以底色標示，並顯示「（目前登入帳號）」取代操作按鈕 |

### 5.5 館藏（FR-BOOK）

| 編號 | 需求 |
|------|------|
| FR-BOOK-01 | 任何人（含訪客）可查詢館藏清單，每頁 10 筆 |
| FR-BOOK-02 | 可依關鍵字搜尋，同時比對書名、作者、ISBN |
| FR-BOOK-03 | 可依分類篩選（文學／自然科學／應用科技／社會科學／藝術／其他），非法分類值回落為全部 |
| FR-BOOK-04 | 搜尋、分類、分頁、書目選取四個參數可自由組合 |
| FR-BOOK-05 | 清單顯示在架冊數與館藏冊數；在架數由複本即時彙總 |
| FR-BOOK-06 | 點選書名在右欄顯示書目詳細與複本清單 |
| FR-BOOK-07 | 右欄的動作區依身分與狀態顯示：登入提示／借閱按鈕／預約按鈕／已借閱提示／暫停借閱提示 |
| FR-BOOK-08 | 館員可新增書目，並在新增時一次建立 1～50 本複本，條碼自動編號 |
| FR-BOOK-09 | 館員可修改書目主檔，包含把書目設為暫停借閱 |
| FR-BOOK-10 | 館員可下架書目（軟刪除）；尚有未歸還的借閱時拒絕 |
| FR-BOOK-11 | 下架書目時一併軟刪除其所有複本，並取消該書所有等待中的預約 |
| FR-BOOK-12 | 館員可為既有書目新增單一複本，流水號接續既有編號 |
| FR-BOOK-13 | 館員可調整複本狀態為在架／整理中／遺失；`borrowed` 不可手動指定 |
| FR-BOOK-14 | 館員可刪除單一複本；借出中的複本不可調整狀態也不可刪除 |
| FR-BOOK-15 | ISBN 必須是 10 碼（末碼可為 X）或 13 碼；輸入時可含連字號，儲存前移除 |
| FR-BOOK-16 | ISBN 在未刪除的書目中不可重複；修改時排除自己 |
| FR-BOOK-17 | 館員可在書目詳細頁看到該書最近 10 筆借閱紀錄 |

### 5.6 借閱（FR-LOAN）

| 編號 | 需求 |
|------|------|
| FR-LOAN-01 | 讀者可借閱有可借複本的書目，系統自動指派條碼最小的在架複本 |
| FR-LOAN-02 | 借期 14 天，`due_at` 於借出當下計算並寫入 |
| FR-LOAN-03 | 每人同時借閱上限 5 冊 |
| FR-LOAN-04 | 有逾期未還時不可再借任何書 |
| FR-LOAN-05 | 同一書目已借且未還時，不可再借第二本 |
| FR-LOAN-06 | 書目狀態為暫停借閱時不可借 |
| FR-LOAN-07 | 借閱成立時，複本狀態轉為借出中，該書的在架數即時減少 |
| FR-LOAN-08 | 借到自己預約中的書時，該筆預約自動轉為已完成 |
| FR-LOAN-09 | 讀者可查看自己的借閱紀錄，可依全部／借閱中／已歸還篩選 |
| FR-LOAN-10 | 讀者可查看自己的借閱明細；館員可查看任何一筆 |
| FR-LOAN-11 | 讀者可續借自己的借閱，延長 14 天，每筆上限 1 次 |
| FR-LOAN-12 | 已逾期、已歸還、已達續借上限、有他人預約等待中時不可續借 |
| FR-LOAN-13 | 館員不可代讀者續借 |
| FR-LOAN-14 | 讀者可歸還自己的借閱；館員可代為登記任何一筆 |
| FR-LOAN-15 | 歸還時複本回架，並把該書排隊最久的等待中預約升級為可取書 |
| FR-LOAN-16 | 已歸還的借閱不可重複歸還 |
| FR-LOAN-17 | 館員可查看全館借閱紀錄，每頁 10 筆 |
| FR-LOAN-18 | 全館紀錄可依借閱中／逾期／已歸還／全部篩選，可搜尋書名與借閱人 |
| FR-LOAN-19 | 全館紀錄頁顯示目前逾期總筆數 |
| FR-LOAN-20 | 逾期狀態由查詢當下推導，不需要任何排程或人工更新 |

### 5.7 預約（FR-RES）

| 編號 | 需求 |
|------|------|
| FR-RES-01 | 讀者可預約目前無可借複本的書目 |
| FR-RES-02 | 尚有可借複本時不可預約，訊息引導讀者直接借閱 |
| FR-RES-03 | 自己已借閱且未歸還的書目不可預約 |
| FR-RES-04 | 同一書目不可重複預約 |
| FR-RES-05 | 書目狀態為暫停借閱時不可預約 |
| FR-RES-06 | 讀者可查看自己的預約紀錄與候補順位 |
| FR-RES-07 | 順位由 SQL 即時計算，前面的人取消時自動往前 |
| FR-RES-08 | 有人還書時，該書排隊最久的等待中預約升級為可取書 |
| FR-RES-09 | 可取書的預約在清單上提供「立即借閱」按鈕 |
| FR-RES-10 | 讀者可取消自己進行中的預約；館員可取消任何一筆 |
| FR-RES-11 | 取消可取書狀態的預約時，順位遞補給下一位等待者 |
| FR-RES-12 | 已完成或已取消的預約不可再取消 |
| FR-RES-13 | 館員可查看全館預約佇列，可依進行中／等待中／可取書／已結束／全部篩選 |
| FR-RES-14 | 預約頁面須明示「預約不保留書本，取書先到先得」 |

---

## 6. 資料模型

### 6.1 概觀

五張資料表，兩組關聯：

```
       users
         │ 1
         ├──────────────┬──────────────┐
         │ N            │ N            │ N
      loans        reservations   （會員管理不產生新表）
         │ N            │ N
         │              │
         ▼ 1            ▼ 1
    book_copies ──N──1── books
```

| 表 | 角色 | 筆數量級 |
|----|------|---------|
| `users` | 帳號 | 十～百 |
| `books` | 書目主檔（一個 ISBN 一筆） | 百～千 |
| `book_copies` | 館藏複本明細（一本實體書一筆） | 千 |
| `loans` | 借閱交易 | 千～萬（含歷史） |
| `reservations` | 預約候補 | 百 |

### 6.1.1 為何書目要拆成主檔與明細

同一個 ISBN 的書，圖書館通常會買好幾本。若只用一張表加一個「數量」欄位，會遇到三個問題：

1. **借出的是哪一本？** 讀者還書時，櫃台要能對上條碼。沒有複本表就無法回答。
2. **狀態沒地方放。** 三本書中一本送去修補、一本遺失、一本在架——單一數量欄位表達不了。
3. **數量會不同步。** `available_quantity` 需要在借書時減、還書時加，任何一條路徑漏掉就永久錯誤。

拆成兩張表後，「在架幾本」變成一個 `COUNT`，不再是需要維護的欄位。這是本系統最重要的一個資料模型決策。

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
);
```

欄位在建立之後未再變更。

### 6.3 `books` 與 `book_copies` 表 DDL

```sql
CREATE TABLE IF NOT EXISTS books (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    isbn         TEXT    NOT NULL,
    title        TEXT    NOT NULL,
    author       TEXT    NOT NULL,
    publisher    TEXT,
    publish_year INTEGER,
    category     TEXT    NOT NULL DEFAULT 'other',
    description  TEXT,
    book_status  TEXT    NOT NULL DEFAULT 'available',
    created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    is_deleted   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS book_copies (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id      INTEGER NOT NULL,
    copy_barcode TEXT    NOT NULL,
    copy_status  TEXT    NOT NULL DEFAULT 'available',
    created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    is_deleted   INTEGER NOT NULL DEFAULT 0
);
```

`isbn` 沒有 `UNIQUE` 約束——重複性由 `_validate_book_form()` 在應用層檢查，因為軟刪除的書目不應該佔用 ISBN。這個取捨記錄為 KI-32。

### 6.4 `loans` 與 `reservations` 表 DDL

```sql
CREATE TABLE IF NOT EXISTS loans (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id     INTEGER NOT NULL,
    copy_id     INTEGER NOT NULL,
    borrower_id INTEGER NOT NULL,
    borrowed_at TEXT    NOT NULL DEFAULT (datetime('now')),
    due_at      TEXT    NOT NULL,
    returned_at TEXT,
    returned_by INTEGER,
    renew_count INTEGER NOT NULL DEFAULT 0,
    loan_status TEXT    NOT NULL DEFAULT 'borrowed',
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    is_deleted  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS reservations (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id            INTEGER NOT NULL,
    user_id            INTEGER NOT NULL,
    reserved_at        TEXT    NOT NULL DEFAULT (datetime('now')),
    ready_at           TEXT,
    reservation_status TEXT    NOT NULL DEFAULT 'waiting',
    created_at         TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at         TEXT    NOT NULL DEFAULT (datetime('now')),
    is_deleted         INTEGER NOT NULL DEFAULT 0
);
```

`loans.book_id` 與 `copy_id` 並存是刻意的冗餘：`book_id` 可以從 `copy_id` JOIN 出來，但幾乎每個查詢都要用到它（找同書目的借閱、預約遞補、借閱歷程），直接存下來省掉一層 JOIN。這是唯一被允許的冗餘，因為複本一旦建立就不會換書目。

### 6.5 欄位字典

**`books`**

| 欄位 | 型別 | 可空 | 說明 |
|------|------|:----:|------|
| `isbn` | TEXT | ❌ | 已移除連字號的 10 或 13 碼，大寫 |
| `title` | TEXT | ❌ | 書名 |
| `author` | TEXT | ❌ | 作者 |
| `publisher` | TEXT | ✅ | 出版者 |
| `publish_year` | INTEGER | ✅ | 出版年，1000–2100 |
| `category` | TEXT | ❌ | `literature` / `science` / `technology` / `social` / `art` / `other` |
| `description` | TEXT | ✅ | 內容簡介 |
| `book_status` | TEXT | ❌ | `available`（可借閱）/ `unavailable`（暫停借閱） |

**`book_copies`**

| 欄位 | 型別 | 說明 |
|------|------|------|
| `copy_barcode` | TEXT | `{book_id:04d}-{seq:03d}`，例如 `0007-002` |
| `copy_status` | TEXT | `available`（在架）/ `borrowed`（借出中）/ `maintenance`（整理中）/ `lost`（遺失） |

**`loans`**

| 欄位 | 型別 | 可空 | 說明 |
|------|------|:----:|------|
| `borrowed_at` | TEXT | ❌ | 借出時間 |
| `due_at` | TEXT | ❌ | 應還時間，借出時 = `borrowed_at + 14 days` |
| `returned_at` | TEXT | ✅ | 實際歸還時間；`NULL` 表示未還 |
| `returned_by` | INTEGER | ✅ | 執行歸還操作的使用者 id（可能是館員） |
| `renew_count` | INTEGER | ❌ | 已續借次數，0 或 1 |
| `loan_status` | TEXT | ❌ | `borrowed` / `returned` |

**`reservations`**

| 欄位 | 型別 | 可空 | 說明 |
|------|------|:----:|------|
| `reserved_at` | TEXT | ❌ | 預約時間，同時是排序依據 |
| `ready_at` | TEXT | ✅ | 轉為可取書的時間 |
| `reservation_status` | TEXT | ❌ | `waiting` / `ready` / `fulfilled` / `cancelled` |

### 6.6 兩個刻意不存的欄位

#### 在架冊數

`books` 沒有 `available_copies` 欄位。所有書目查詢都帶這兩個子查詢：

```sql
(SELECT COUNT(*) FROM book_copies c
  WHERE c.book_id = b.id AND c.is_deleted = 0) AS total_copies,
(SELECT COUNT(*) FROM book_copies c
  WHERE c.book_id = b.id AND c.is_deleted = 0 AND c.copy_status = 'available')
  AS available_copies
```

代價是每次查詢多兩個子查詢；換來的是**主檔與明細不可能不一致**。若把可借數量存成欄位，每一條借出／歸還／刪除路徑都得記得同步——這正是真實系統中資料錯亂的常見來源。

#### 逾期狀態

`loans.loan_status` 只有 `borrowed` 與 `returned`。逾期由查詢推導：

```sql
CASE WHEN l.returned_at IS NULL AND l.due_at < datetime('now')
     THEN 1 ELSE 0 END AS is_overdue
```

存成欄位就需要每天跑一次排程把到期的改成 `overdue`，而本系統沒有排程器，也不該為此引入一個。推導的作法還有一個好處：**時間往前走，狀態自動正確**，不會出現「排程掛掉三天，畫面上沒有任何逾期」的情況。

畫面上的三種狀態是這樣組出來的：

| `returned_at` | `is_overdue` | 顯示 |
|:-------------:|:------------:|------|
| 有值 | — | 已歸還 |
| `NULL` | 1 | 逾期未還 |
| `NULL` | 0 | 借閱中 |

### 6.7 狀態機

**複本（`copy_status`）**

```
   ┌────── 館員調整 ──────┐
   ↓                      │
available ──借出──→ borrowed ──歸還──→ available
   │                                       ↑
   └──→ maintenance ── 館員調整 ───────────┘
   └──→ lost ───────── 館員調整 ───────────┘
```

`borrowed` 只能由借還書流程寫入，館員不可手動指定；借出中的複本也不可調整狀態或刪除。

**借閱（`loan_status` + 推導）**

```
borrowed ──歸還──→ returned
    │
    └── due_at 過了 → 畫面顯示「逾期未還」（資料庫仍是 borrowed）
```

**預約（`reservation_status`）**

```
                    ┌──── 讀者／館員取消 ────┐
                    ↓                        │
  waiting ─有人還書→ ready ────借閱成功────→ fulfilled
     │                 │
     └─ 取消 ──────────┴──→ cancelled
                            ↑
                   書目下架時一併取消
```

`ready` 被取消時會自動遞補下一位 `waiting`，否則佇列會卡住。

### 6.8 種子資料

**帳號**（`db/users.py` → `_seed_users_if_empty`，bcrypt cost=4）

| id | email | 密碼 | role | is_active | name |
|----|-------|------|:----:|:---------:|------|
| 1 | user@example.com | password123 | 1 | 1 | 一般讀者 |
| 2 | admin@example.com | admin1234 | 0 | 1 | 圖書館員 |
| 3 | disabled@example.com | disabled123 | 1 | 0 | （空） |

**書目**（`db/books.py` → `_seed_books_if_empty`）

| id | 書名 | 分類 | 複本數 |
|----|------|------|:------:|
| 1 | 系統分析與設計 | 應用科技 | 3 |
| 2 | 資料庫系統概論 | 應用科技 | 2 |
| 3 | 演算法圖鑑 | 應用科技 | 2 |
| 4 | 台灣通史新編 | 社會科學 | 1 |
| 5 | 經濟學原理 | 社會科學 | 2 |
| 6 | 百年孤寂 | 文學 | 2 |
| 7 | 文心雕龍讀本 | 文學 | 1 |
| 8 | 西洋美術史 | 藝術 | 1 |
| 9 | 普通物理學 | 自然科學 | 3 |
| 10 | 有機化學導論 | 自然科學 | 1 |

共 10 筆書目、18 本複本。單複本的書目（4、7、8、10）是刻意安排的——預約流程需要「借走一本就沒了」的情境才示範得出來。

**不植入借閱與預約。** 交易資料從空的開始，測試才能以絕對值斷言。

### 6.9 `db/` 函式總表

**`users.py`**

`find_user_by_email`、`find_user_by_id`、`create_user`、`update_user_profile`、`update_last_login`、`soft_delete_user`、`list_users`、`set_user_active`、`set_user_role`、`hard_delete_user_by_email`（僅供測試清理）

**`books.py`**

| 函式 | 回傳 | 說明 |
|------|------|------|
| `list_books(page, page_size, keyword, category, available_only)` | `(items, total)` | 書目清單，含彙總的兩個數量 |
| `get_book(book_id)` | Row / `None` | 單筆書目 |
| `find_book_by_isbn(isbn)` | Row / `None` | ISBN 重複性檢查 |
| `create_book(..., copy_count)` | `book_id` | 主檔 + N 筆複本，同一 transaction |
| `update_book(...)` | — | 只改主檔 |
| `soft_delete_book(book_id)` | `'deleted'` / `'on_loan'` / `'missing'` | 書目 + 複本 + 取消預約 |
| `list_copies(book_id)` | list | 未刪除的複本 |
| `get_copy(copy_id)` | Row / `None` | 單一複本（含書名） |
| `add_copy(book_id)` | `copy_id` | 流水號接續歷來總數 |
| `set_copy_status(copy_id, status)` | `'updated'` / `'on_loan'` / `'missing'` | |
| `soft_delete_copy(copy_id)` | `'deleted'` / `'on_loan'` / `'missing'` | |

**`loans.py`**

| 函式 | 回傳 | 說明 |
|------|------|------|
| `borrow_book(book_id, user_id)` | `(狀態碼, loan_id)` | 六道規則檢查 + 三段更新 |
| `return_loan(loan_id, actor_id)` | `'ok'` / `'missing'` / `'returned'` | 含預約遞補 |
| `renew_loan(loan_id, user_id)` | 七種狀態碼 | |
| `get_loan(loan_id)` | Row / `None` | 含書目、複本、借閱人 |
| `list_my_loans(user_id, status)` | list | `all` / `active` / `returned` |
| `list_all_loans(page, page_size, status, keyword)` | `(items, total)` | 含 `overdue` 篩選 |
| `list_book_loan_history(book_id, limit)` | list | 書目詳細頁用 |
| `count_active_loans(user_id)` | int | |
| `count_overdue_loans()` | int | 全館 |
| `has_overdue_loans(user_id)` | bool | |
| `find_active_loan(book_id, user_id)` | Row / `None` | |
| `_promote_next_reservation(conn, book_id)` | — | 跑在呼叫端 transaction 內，不 commit |

**`reservations.py`**

| 函式 | 回傳 | 說明 |
|------|------|------|
| `create_reservation(book_id, user_id)` | `(狀態碼, reservation_id)` | 五道規則檢查 |
| `cancel_reservation(reservation_id, user_id, is_admin)` | 四種狀態碼 | 取消 `ready` 時遞補 |
| `get_reservation(reservation_id)` | Row / `None` | |
| `list_my_reservations(user_id)` | list | 含 `queue_position` |
| `list_all_reservations(page, page_size, status)` | `(items, total)` | |
| `count_waiting_reservations(book_id)` | int | |
| `find_active_reservation(book_id, user_id)` | Row / `None` | |

### 6.10 借閱政策常數

定義於 `db/loans.py`，由 `db/__init__.py` 匯出：

| 常數 | 值 | 影響 |
|------|:--:|------|
| `LOAN_PERIOD_DAYS` | 14 | 借出時 `due_at` 的計算 |
| `RENEW_PERIOD_DAYS` | 14 | 續借時 `due_at` 的延長量 |
| `MAX_ACTIVE_LOANS` | 5 | 借書時的冊數上限檢查 |
| `MAX_RENEW_COUNT` | 1 | 續借時的次數上限檢查 |

**任何地方都不得寫死這四個數字**，包含訊息字串（以 f-string 帶入）與模板（由路由傳入）。改政策只需要動這四行。

### 6.11 軟刪除策略與查詢過濾約定

所有刪除都是 `is_deleted = 1`，查詢一律加 `is_deleted = 0`。

**唯一的例外是 `list_users()`**：館員的職責就是要能檢視已刪除的帳號，該函式以 `status='deleted'` 參數明確表達這個意圖。`db/books.py`、`loans.py`、`reservations.py` 沒有這種例外。

軟刪除的連鎖效果：

| 刪除對象 | 連帶效果 |
|---------|---------|
| 帳號 | 無連帶。該帳號的借閱與預約仍在資料庫中，館員仍查得到（見 KI-33） |
| 書目 | 所有複本一併軟刪除；所有進行中的預約轉為 `cancelled`；有未歸還借閱時**拒絕刪除** |
| 複本 | 無連帶。借出中的複本**拒絕刪除** |

---

## 7. 路由總表

### 7.1 全站路由（31 條）

| 方法 | 路徑 | Endpoint | 權限 | 成功後 |
|------|------|----------|------|--------|
| GET/POST | `/` | `hub.home` | 公開 | 渲染 |
| GET | `/health` | `health` | 公開 | `200 OK` |
| GET | `/captcha.png` | `auth.captcha_image` | 公開 | PNG |
| GET/POST | `/login` | `auth.login_page` | 公開 | → `/` |
| GET/POST | `/register` | `auth.register` | 公開 | → `/login` |
| GET | `/logout` | `auth.logout` | 登入 | → `/login` |
| GET | `/profile` | `profile.dashboard` | 登入 | 渲染 |
| POST | `/profile/update` | `profile.dashboard_update` | 登入 | → `/profile` |
| GET | `/admin/users` | `admin.user_list` | 館員 | 渲染 |
| GET | `/admin/users/<id>` | `admin.user_detail` | 館員 | 渲染 |
| POST | `/admin/users/<id>/activate` | `admin.activate_user` | 館員 | → 清單 |
| POST | `/admin/users/<id>/deactivate` | `admin.deactivate_user` | 館員 | → 清單 |
| POST | `/admin/users/<id>/role` | `admin.update_role` | 館員 | → 清單 |
| POST | `/admin/users/<id>/delete` | `admin.delete_user` | 館員 | → 清單 |
| GET | `/books/` | `books.index` | 公開 | 渲染 |
| GET/POST | `/books/new` | `books.new_book` | 館員 | → `/books/?id=N` |
| GET/POST | `/books/edit/<id>` | `books.edit_book` | 館員 | → `/books/?id=N` |
| POST | `/books/delete/<id>` | `books.delete_book` | 館員 | → `/books/` |
| POST | `/books/<id>/copies/add` | `books.add_copy` | 館員 | → `/books/?id=N` |
| POST | `/books/copies/<id>/status` | `books.update_copy_status` | 館員 | → `/books/?id=N` |
| POST | `/books/copies/<id>/delete` | `books.delete_copy` | 館員 | → `/books/?id=N` |
| POST | `/loans/borrow/<book_id>` | `loans.borrow` | 登入 | → `/loans/<id>` |
| GET | `/loans/my-loans` | `loans.my_loans` | 登入 | 渲染 |
| GET | `/loans/<id>` | `loans.loan_detail` | 本人／館員 | 渲染 |
| POST | `/loans/<id>/renew` | `loans.renew` | 本人 | → `/loans/<id>` |
| POST | `/loans/<id>/return` | `loans.return_book` | 本人／館員 | → 明細或管理頁 |
| GET | `/loans/admin/loans` | `loans.admin_loans` | 館員 | 渲染 |
| POST | `/reservations/new/<book_id>` | `reservations.reserve` | 登入 | → 我的預約 |
| GET | `/reservations/my-reservations` | `reservations.my_reservations` | 登入 | 渲染 |
| POST | `/reservations/<id>/cancel` | `reservations.cancel` | 本人／館員 | → 我的預約或管理頁 |
| GET | `/reservations/admin/reservations` | `reservations.admin_reservations` | 館員 | 渲染 |

### 7.2 命名慣例

- URL 使用小寫與連字號（`/my-loans`），路由函式名使用底線（`my_loans`）
- 所有有副作用的操作一律 `POST`，即使語意上是「刪除」
- 開放瀏覽的清單頁宣告 `strict_slashes=False`，讓 `/books` 與 `/books/` 都能到達
- 館員專用的頁面放在子系統的 `/admin/` 之下（`/loans/admin/loans`），而非另開一個 Blueprint

### 7.3 POST-Redirect-GET 與元素語意

所有 POST 成功後一律 `redirect()`，避免重新整理造成重複送出。表單驗證失敗則直接 `render_template()` 並保留已填欄位。

| 元素 | 使用時機 |
|------|---------|
| `<a href="...">` | GET 導航（跳頁、返回、前往表單頁） |
| `<button type="submit">` | POST 動作（借閱、續借、歸還、刪除、取消） |

**不使用 `<a href="#">` + `onclick` 模擬按鈕**，那會破壞鍵盤操作與無障礙語意。因此畫面上每一個借閱／歸還按鈕都包在自己的 `<form>` 裡，這是 `.loan-inline-form { display: inline }` 這類樣式存在的原因。

### 7.4 為何 `activate` 與 `deactivate` 拆成兩條路由

可以合併成 `/admin/users/<id>/active` 收一個布林參數，但拆開有兩個好處：一是 URL 本身就說明了意圖，看 log 就知道發生了什麼；二是兩者的自我保護規則不同——停用自己要擋（R1），啟用自己不必擋。合併後就得在同一個函式裡分岔，反而更繞。

同樣的邏輯適用於 `/loans/<id>/renew` 與 `/loans/<id>/return`。

---

## 8. 畫面設計與流程

### 8.1 畫面清單

| # | 畫面 | 路徑 | 模板 | CSS |
|:-:|------|------|------|-----|
| 1 | 首頁（訪客） | `/` | `hub/home.html` | hub |
| 2 | 首頁（登入） | `/` | `hub/home.html` | hub |
| 3 | 登入 | `/login` | `auth/login.html` | login |
| 4 | 申請借閱證 | `/register` | `auth/register.html` | login |
| 5 | 個人資料（檢視） | `/profile` | `profile/dashboard.html` | profile |
| 6 | 個人資料（編輯） | `/profile?edit=1` | 同上 | profile |
| 7 | 會員清單 | `/admin/users` | `admin/user_list.html` | admin |
| 8 | 會員明細 | `/admin/users/<id>` | `admin/user_detail.html` | admin |
| 9 | 館藏查詢 | `/books/` | `books/index.html` | books |
| 10 | 新增／修改書目 | `/books/new`、`/books/edit/<id>` | `books/book_form.html` | books |
| 11 | 我的借閱 | `/loans/my-loans` | `loans/my_loans.html` | loans |
| 12 | 借閱明細 | `/loans/<id>` | `loans/loan_detail.html` | loans |
| 13 | 借閱管理 | `/loans/admin/loans` | `loans/admin_loans.html` | loans |
| 14 | 我的預約 | `/reservations/my-reservations` | `reservations/my_reservations.html` | reservations |
| 15 | 預約管理 | `/reservations/admin/reservations` | `reservations/admin_reservations.html` | reservations |

### 8.2 導覽關係

```
                        ┌─────────────┐
              ┌─────────│   首頁 /    │─────────┐
              │         └─────────────┘         │
              │            │      │             │
     ┌────────▼──────┐     │      │      ┌──────▼────────┐
     │  /login       │     │      │      │  /profile     │
     │  /register    │     │      │      └───────────────┘
     └───────────────┘     │      │
                           │      └──────────────┐（館員）
              ┌────────────▼──────┐              │
              │   /books/         │       ┌──────▼─────────────┐
              │  （公開查詢）      │       │ /admin/users       │
              └───────┬───────────┘       │ /loans/admin/loans │
                      │                   │ /reservations/     │
        ┌─────────────┼─────────────┐     │   admin/…          │
        │             │             │     └────────────────────┘
   借閱 POST      預約 POST     館員維護
        │             │        （新增／修改書目、複本）
        ▼             ▼
  /loans/<id>   /reservations/my-reservations
        │             │
        ▼             │
  /loans/my-loans ◄───┘（立即借閱）
```

每個子系統的頂欄都提供回首頁與跨子系統的連結，任何頁面都能在兩次點擊內到達其他頁面。

### 8.3 各頁線框說明

#### 首頁（登入視圖）

```
┌──────────────────────────────────────────────────────────┐
│ 校園圖書借閱系統 v1.0              一般讀者   [登出]      │
├──────────────────────────────────────────────────────────┤
│ 歡迎回來，一般讀者！                                      │
│ 請選擇要使用的服務                                        │
│                                                          │
│ ┌────────┐ ┌────────┐ ┌────────┐   ← 借閱概況           │
│ │ 2 / 5  │ │   1    │ │   0    │     （逾期為紅色）      │
│ │借閱中冊│ │逾期未還│ │進行中預│                         │
│ └────────┘ └────────┘ └────────┘                        │
│ ┌──────────────────────────────────────────────────────┐ │
│ │ 您有 1 本書已逾期，請儘速歸還。逾期期間無法再借新書。 │ │
│ └──────────────────────────────────────────────────────┘ │
│                                                          │
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐             │
│ │館藏查詢│ │我的借閱│ │我的預約│ │個人資料│             │
│ └────────┘ └────────┘ └────────┘ └────────┘             │
│  （館員另有：借閱管理、預約管理、會員管理三張卡片）       │
└──────────────────────────────────────────────────────────┘
```

#### 館藏查詢（兩欄式）

```
┌──────────────────────────────────────────────────────────────────┐
│ 館藏查詢   返回首頁 我的借閱 我的預約 [借閱管理] 一般讀者 [登出]  │
├────────────────────────────────┬─────────────────────────────────┤
│ 書目清單          共 10 筆     │ 系統分析與設計      [可借閱]    │
│ [搜尋____][分類▾][搜尋][清除]  │ ─────────────────────────────── │
│ ┌────────────────────────────┐ │ 作者      陳建志                │
│ │ID│書名  │作者│分類│架│藏│態│ │ ISBN      9789861371234        │
│ │ 1│系統分│陳建│科技│2│3│可│ │ 出版者    碁峰資訊              │
│ │ 2│資料庫│林美│科技│2│2│可│ │ 館藏/在架 3 冊 / 在架 2 冊      │
│ │ 4│台灣通│張文│社會│0│1│可│ │ 預約排隊  0 人                  │
│ └────────────────────────────┘ │ ┌─────────────────────────────┐ │
│      上一頁 第 1 / 1 頁 下一頁 │ │      [借閱這本書]           │ │
│                                │ └─────────────────────────────┘ │
│                                │ 館藏複本                        │
│                                │  0001-001  借出中               │
│                                │  0001-002  在架                 │
│                                │  0001-003  在架                 │
│                                │ （館員另有複本維護與借閱歷程）  │
└────────────────────────────────┴─────────────────────────────────┘
```

左欄清單、右欄詳細的配置。選取以 `?id=` 傳遞，
換頁時保留 `?q=`、`?category=` 與 `?id=`，避免翻頁後篩選條件消失。

#### 我的借閱

```
┌──────────────────────────────────────────────────────────────┐
│ 我的借閱   返回首頁 館藏查詢 我的預約     一般讀者  [登出]    │
├──────────────────────────────────────────────────────────────┤
│ 借閱紀錄                              借閱中 2 / 5 冊        │
│ [全部] [借閱中] [已歸還]                                     │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ID│書名    │條碼    │借出日│到期日│續借│狀態    │操作     │ │
│ │ 1│系統分析│0001-001│08-11 │08-25 │0/1 │借閱中  │詳細     │ │
│ │  │        │        │      │      │    │        │續借 歸還│ │
│ │ 2│台灣通史│0004-001│07-20 │08-03 │1/1 │逾期未還│詳細 歸還│ │
│ └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

逾期或已達續借上限時，「續借」按鈕不渲染——不顯示一個按下去必定失敗的按鈕。
但伺服器端仍然會檢查，畫面上的隱藏只是體驗優化，不是安全機制。

#### 借閱管理（館員）

在「我的借閱」的欄位上多出「借閱人」，操作換成「還書登記」，
並加上狀態篩選（借閱中／逾期／已歸還／全部）、關鍵字搜尋與分頁。
標題列顯示「共 N 筆，逾期 M 筆」。

#### 我的預約

```
┌──────────────────────────────────────────────────────────────┐
│ 我的預約   返回首頁 館藏查詢 我的借閱     一般讀者  [登出]    │
├──────────────────────────────────────────────────────────────┤
│ 預約紀錄                                        共 2 筆      │
│ 預約僅代表候補排隊，不會替您保留書本。狀態顯示「可取書」時    │
│ 請儘早前往借閱，取書順序為先到先得。                          │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ID│書名      │作者  │預約時間   │順位│狀態  │操作         │ │
│ │ 1│台灣通史  │張文彬│08-11 09:30│ —  │可取書│立即借閱     │ │
│ │  │          │      │           │    │      │取消預約     │ │
│ │ 2│西洋美術史│吳靜宜│08-11 10:02│ 2  │等待中│取消預約     │ │
│ └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

`ready` 狀態不顯示順位（已經輪到了，順位沒有意義），顯示為 `—`。

### 8.4 使用者旅程

#### 旅程 A：新讀者借第一本書

1. 訪客開啟 `/`，看到館藏卡片可點、其餘三張標示「需登入」
2. 點右欄「申請借閱證」→ `/register`
3. 填入 email、密碼、確認密碼、姓名 → 送出
4. → `/login`，畫面上方顯示「申請成功，請登入」
5. 輸入帳密與驗證碼 → 登入成功 → `/`
6. 借閱概況顯示 `0 / 5`
7. 點「館藏查詢」→ `/books/`
8. 在搜尋框輸入「資料庫」→ 清單只剩一筆
9. 點書名 → 右欄顯示詳細，在架 2 冊
10. 按「借閱這本書」→ POST `/loans/borrow/2`
11. → `/loans/<id>`，顯示「借閱成功，請於 14 天內歸還」
12. 明細頁顯示條碼 `0002-001`、應還日期為 14 天後
13. 回首頁，借閱概況變成 `1 / 5`

#### 旅程 B：書被借光 → 預約 → 遞補 → 借到

1. 讀者甲借走《台灣通史新編》（唯一複本）
2. 讀者乙開啟該書詳細頁，右欄顯示「目前無可借複本」與「預約候補」按鈕
3. 乙按下預約 → `/reservations/my-reservations`，狀態「等待中」，順位 1
4. 讀者丙也預約 → 順位 2
5. 甲歸還 → `db.return_loan()` 在同一 transaction 內：複本回架 + 乙的預約轉為 `ready`
6. 乙的預約頁顯示「可取書」與「立即借閱」；丙仍是「等待中」，順位變成 1
7. 乙按「立即借閱」→ 借閱成立，同時乙的預約自動轉為 `fulfilled`
8. 丙的順位維持 1，等待下一次還書

> **若乙遲遲不來借，丙搶先借走了呢？** 系統允許——預約不保留書本。
> 乙的預約會停在 `ready` 直到自己取消，或直到乙借到該書。這是刻意的簡化，見 KI-21。

#### 旅程 C：逾期的連鎖反應

1. 讀者的某筆借閱過了 `due_at`
2. 首頁概況的「逾期未還」變成 1 並轉為紅色，下方出現警示條
3. 「我的借閱」該列狀態變成「逾期未還」，續借按鈕消失
4. 該讀者嘗試借任何一本書 → 「您有逾期未還的書，請先歸還後再借閱」
5. 嘗試續借該筆 → 「已逾期的借閱無法續借，請先歸還」
6. 館員在借閱管理頁的「逾期」篩選中看得到這筆，可代為還書登記
7. 歸還後，該讀者立刻可以再借

> 逾期沒有罰款，只有借閱封鎖。這是刻意的：罰款需要金額規則、繳費紀錄、
> 減免流程，是另一個完整的子系統。

#### 旅程 D：館員新增一本書並上架

1. 館員登入 → `/books/` → 按「+ 新增書目」
2. 填 ISBN（可含連字號）、書名、作者、出版者、出版年、分類、簡介、複本數 3
3. 送出 → 系統建立 1 筆書目與 3 本複本（`0011-001`～`0011-003`），全部在架
4. → `/books/?id=11`，右欄顯示新書
5. 其中一本書破損，館員把 `0011-002` 的狀態改為「整理中」→ 在架數變成 2
6. 該本確定無法修復，館員按「刪除」→ 複本軟刪除，館藏數變成 2
7. 之後補了一本新的，按「+ 新增複本」→ 條碼是 `0011-004`，**不重用 `-002`**

### 8.5 CSS 架構

```
common.css      設計 token（:root 的 --btn-* 變數）  ← base.html 一律載入
login.css       登入頁版面與 .login-form 內的按鈕     ← base.html 一律載入
   ├── hub.css
   ├── profile.css
   ├── admin.css
   ├── books.css
   ├── loans.css
   └── reservations.css                              ← 各頁以 block head 載入
```

**四條規則：**

1. 每個子系統一個 CSS 檔，類別以子系統前綴命名（`book-`、`loan-`、`res-`）
2. 按鍵顏色一律 `var(--btn-*)`，**不在子系統 CSS 中寫死色碼**
3. `login.css` 的 `button[type="submit"]` 樣式限定在 `.login-form` 選擇器內，
   因此只有登入／申請／首頁內嵌登入的 `<form>` 需要加這個 class
4. 欄寬工具類 `.col-id`、`.col-status`、`.col-qty`、`.col-action` 在多個子系統 CSS
   中重複定義，這是**唯一允許的跨子系統重複**——它們只管欄寬、不管顏色

`books.css`、`loans.css`、`reservations.css` 三者結構相同：
以前綴取代產生骨架，再替換成各自的狀態徽章，並補上篩選列與搜尋框的樣式。

---

## 9. 驗證規則與訊息字串

### 9.1 輸入欄位規格

| 欄位 | 必填 | 規則 | 違反時的訊息 |
|------|:----:|------|-------------|
| email（登入） | ✅ | 非空 | 請輸入帳號與密碼 |
| email（申請） | ✅ | 需符合基本 email 格式 | 電子郵件格式不正確 |
| password（申請） | ✅ | 長度 ≥ 8 | 密碼至少需要 8 個字元 |
| confirm_password | ✅ | 與 password 相同 | 兩次密碼輸入不一致 |
| captcha | ✅ | 與 `session['captcha']` 相同（不分大小寫） | 驗證碼錯誤，請重新輸入 |
| name / display_name | ❌ | 空字串轉 `None` | — |
| title（書名） | ✅ | 非空 | 書名不可為空 |
| author（作者） | ✅ | 非空 | 作者不可為空 |
| isbn | ✅ | 移除連字號後為 10 碼（末碼可 X）或 13 碼數字 | ISBN 格式不正確（需為 10 碼或 13 碼） |
| isbn | ✅ | 未刪除書目中不重複（修改時排除自己） | 此 ISBN 已有相同書目 |
| publish_year | ❌ | 可轉為整數且介於 1000–2100 | 出版年格式不正確／出版年需介於 1000 與 2100 之間 |
| category | ✅ | 六個代碼之一 | 分類不正確 |
| book_status | ✅ | `available` 或 `unavailable` | 書目狀態不正確 |
| copy_count | ✅ | 整數，1–50 | 複本數量至少為 1／複本數量不可超過 50 |
| copy_status | ✅ | `available`／`maintenance`／`lost` | 複本狀態不正確 |
| role | ✅ | `'0'` 或 `'1'` | 角色值不正確 |

### 9.2 登入驗證順序

1. 驗證碼不可空白 → `請輸入驗證碼`
2. 驗證碼比對（輸入先 `.upper()`）→ `驗證碼錯誤，請重新輸入`
3. email／password 不可空白 → `請輸入帳號與密碼`
4. 查帳號；不存在或 `is_deleted` → `帳號或密碼錯誤`
5. `bcrypt.checkpw` → `帳號或密碼錯誤`
6. `is_active` 為假 → `帳號已停用`
7. 通過：`update_last_login` → 設 session → redirect `/`

> 第 4、5 步用同一句訊息，不透露「這個 email 有沒有註冊過」。
> 第 6 步的訊息不同——帳號存在且密碼正確，告知停用才幫得上使用者。
> 這個取捨記錄為 KI-13。

### 9.3 申請帳號驗證順序

1. email／password 不可空白 → `請輸入電子郵件與密碼`
2. email 格式 → `電子郵件格式不正確`
3. 密碼長度 ≥ 8 → `密碼至少需要 8 個字元`
4. 兩次密碼一致 → `兩次密碼輸入不一致`
5. `create_user`；`sqlite3.IntegrityError` → `此電子郵件已被使用`

### 9.4 借書驗證順序（`db.borrow_book`）

| # | 檢查 | 狀態碼 | 訊息 |
|:-:|------|--------|------|
| 1 | 書目存在且未下架 | `missing` | 書目不存在 |
| 2 | 書目狀態為可借閱 | `book_unavailable` | 此書目目前暫停借閱 |
| 3 | 讀者無逾期未還 | `has_overdue` | 您有逾期未還的書，請先歸還後再借閱 |
| 4 | 未達冊數上限 | `limit_reached` | 已達同時借閱上限（5 冊） |
| 5 | 未借過同一書目 | `already_borrowed` | 您已借閱此書且尚未歸還 |
| 6 | 有在架複本 | `no_copy` | 此書目前無可借複本，可改為預約 |

**順序有意義。** 第 3 步排在第 4 步之前：逾期的人看到的應該是「請先歸還」，
而不是「已達上限」——前者告訴他該做什麼，後者只是陳述事實。

### 9.5 續借驗證順序（`db.renew_loan`）

| # | 檢查 | 狀態碼 | 訊息 |
|:-:|------|--------|------|
| 1 | 借閱單存在 | `missing` | 借閱紀錄不存在 |
| 2 | 是本人的借閱 | `forbidden` | 無權限操作他人的借閱紀錄 |
| 3 | 尚未歸還 | `returned` | 此借閱已歸還，無法續借 |
| 4 | 未達續借上限 | `limit_reached` | 已達續借次數上限（1 次） |
| 5 | 未逾期 | `overdue` | 已逾期的借閱無法續借，請先歸還 |
| 6 | 無他人預約等待中 | `reserved` | 此書已有其他讀者預約，無法續借 |

### 9.6 預約驗證順序（`db.create_reservation`）

| # | 檢查 | 狀態碼 | 訊息 |
|:-:|------|--------|------|
| 1 | 書目存在且未下架 | `missing` | 書目不存在 |
| 2 | 書目狀態為可借閱 | `book_unavailable` | 此書目目前暫停借閱 |
| 3 | **沒有**在架複本 | `available` | 此書尚有可借複本，請直接借閱 |
| 4 | 自己沒有借著這本 | `already_borrowed` | 您已借閱此書且尚未歸還 |
| 5 | 自己沒有進行中的預約 | `duplicate` | 您已預約此書 |

### 9.7 會員管理操作驗證順序

1. `_is_usable(user)` → 否：`session.clear()` + redirect `/login`
2. `_is_admin(user)` → 否：`無操作權限` + redirect `/`
3. 目標存在 → 否：`找不到該使用者`
4. 自我保護（依操作）→ `不可停用自己的帳號`／`不可刪除自己的帳號`／`不可修改自己的角色`
5. 目標未刪除 → 否：`該帳號已刪除，無法操作`
6. 參數合法（角色調整）→ 否：`角色值不正確`

### 9.8 訊息字串總表

**auth（11 條）**

| 訊息 | 觸發 |
|------|------|
| 請輸入驗證碼 | 驗證碼空白 |
| 驗證碼錯誤，請重新輸入 | 驗證碼不符 |
| 請輸入帳號與密碼 | 登入表單空白 |
| 帳號或密碼錯誤 | 帳號不存在／已刪除／密碼錯誤 |
| 帳號已停用 | `is_active = 0` |
| 請輸入電子郵件與密碼 | 申請表單空白 |
| 電子郵件格式不正確 | 格式檢查失敗 |
| 密碼至少需要 8 個字元 | 密碼過短 |
| 兩次密碼輸入不一致 | 兩次密碼不同 |
| 此電子郵件已被使用 | email 重複 |
| 申請成功，請登入 | 申請成功（flash） |

**admin（11 條）**

無操作權限／找不到該使用者／該帳號已刪除，無法操作／不可停用自己的帳號／
不可刪除自己的帳號／不可修改自己的角色／角色值不正確／帳號已啟用／帳號已停用／
角色已更新／帳號已刪除

**books（16 條）**

| 訊息 | 觸發 |
|------|------|
| 書目已新增 / 書目已更新 / 書目已下架 | 對應操作成功 |
| 尚有未歸還的借閱，無法下架此書目 | `soft_delete_book` 回傳 `on_loan` |
| 書目不存在 | 書目查無資料 |
| 複本已新增 / 複本狀態已更新 / 複本已刪除 | 對應操作成功 |
| 複本借出中，無法變更狀態 | `set_copy_status` 回傳 `on_loan` |
| 複本借出中，無法刪除 | `soft_delete_copy` 回傳 `on_loan` |
| 複本不存在 | 複本查無資料 |
| 複本狀態不正確 | 送出非法的 `copy_status` |
| 書名不可為空 / 作者不可為空 / ISBN 不可為空 | 表單驗證 |
| ISBN 格式不正確（需為 10 碼或 13 碼） | 表單驗證 |
| 此 ISBN 已有相同書目 | 表單驗證 |
| 出版年格式不正確 / 出版年需介於 1000 與 2100 之間 | 表單驗證 |
| 分類不正確 / 書目狀態不正確 | 表單驗證 |
| 複本數量格式不正確 / 複本數量至少為 1 / 複本數量不可超過 50 | 表單驗證 |

**loans（15 條）**

| 訊息 | 觸發 |
|------|------|
| 借閱成功，請於 14 天內歸還 | 借閱成功（數字由 `LOAN_PERIOD_DAYS` 帶入） |
| 書目不存在 / 此書目目前暫停借閱 | 借書失敗 |
| 您有逾期未還的書，請先歸還後再借閱 | 借書失敗 |
| 已達同時借閱上限（5 冊） | 借書失敗（數字由 `MAX_ACTIVE_LOANS` 帶入） |
| 您已借閱此書且尚未歸還 | 借書失敗 |
| 此書目前無可借複本，可改為預約 | 借書失敗 |
| 續借成功，到期日延長 14 天 | 續借成功 |
| 借閱紀錄不存在 | 借閱單查無資料 |
| 無權限操作他人的借閱紀錄 | 續借非本人的借閱 |
| 此借閱已歸還，無法續借 | 續借失敗 |
| 已逾期的借閱無法續借，請先歸還 | 續借失敗 |
| 已達續借次數上限（1 次） | 續借失敗 |
| 此書已有其他讀者預約，無法續借 | 續借失敗 |
| 無權限查看此借閱紀錄 / 無權限操作此借閱紀錄 | 越權存取 |
| 歸還完成 / 此借閱已歸還 | 還書 |

**reservations（9 條）**

預約成功，可借閱時會在「我的預約」顯示可取書／此書尚有可借複本，請直接借閱／
您已借閱此書且尚未歸還／您已預約此書／此書目目前暫停借閱／預約已取消／
預約紀錄不存在／無權限取消他人的預約／此預約已結束，無法取消

### 9.9 flash 的使用慣例與一個例外

- **成功**：`flash(訊息, 'success')`
- **失敗**：`flash(訊息, 'error')`
- 模板以 `get_flashed_messages(with_categories=true)` 取出，`error` 走紅色樣式

**例外**：`auth` 的登入與申請表單驗證失敗時**不用 flash**，而是把錯誤字串傳給
`render_template()` 的 `error` 參數。理由是這兩個表單失敗時不 redirect（要保留已填欄位），
flash 會殘留到下一次請求。這個不一致記錄為 KI-14。

`hub/home.html` 負責顯示 flash——`loans`、`reservations` 的館員頁面在權限不足時會
flash 後 redirect 回首頁，訊息要在那裡才看得到。首頁若沒有這段，
是本系統修正的其中一項（見 §11.5）。

---

## 10. 非功能需求

### 10.1 效能

| 項目 | 目標 | 現況 |
|------|------|------|
| 頁面回應 | < 200 ms | 本機測試遠低於此值 |
| 資料量 | 千筆書目、萬筆借閱 | SQLite 綽綽有餘 |
| 併發 | 個位數同時使用者 | 教學用途，未做壓力測試 |

**已知的效能取捨：**

- 書目清單的兩個彙總子查詢會對每一列各跑一次。書目數上萬時應改為 `LEFT JOIN … GROUP BY`
- `book_copies.book_id`、`loans.borrower_id`、`reservations.book_id` **沒有索引**。
  資料量小時無感，這是刻意保留的優化空間（KI-34）

### 10.2 安全性

**已實作：**

- 密碼以 bcrypt（cost=10）雜湊，資料庫中無明文
- session 為 Flask 簽章 cookie，`SECRET_KEY` 可由環境變數覆寫
- 所有 SQL 使用參數化查詢（`WHERE` 子句只拼欄位名，值一律走 `?`）
- Jinja2 預設 HTML escape，全站無 `|safe`
- 圖形驗證碼防止自動化登入嘗試
- 每個請求重新查資料庫確認帳號狀態，停用即時生效

**未實作（見 §11.1）：** CSRF token、登入失敗次數限制、Cookie 的
`Secure` / `SameSite` 旗標、密碼複雜度要求。

### 10.3 可用性與相容性

- 介面語言為繁體中文
- 版面在 1280 px 以上桌機瀏覽器為主要目標
- 兩欄式頁面在窄螢幕下會橫向捲動，**未做響應式設計**（KI-41）
- 不依賴 JavaScript 即可完成所有操作；JS 只用於驗證碼刷新與刪除確認對話框

### 10.4 可維護性

- 每個子系統一個 Blueprint、一個 CSS、一個測試檔、一份 `CLAUDE.md`
- 業務規則常數集中於 `db/loans.py`，改政策只需改四行
- 狀態碼與訊息的對照集中於各 Blueprint 頂部的字典
- 訊息字串同時記錄於 `tests/data/library.py`，改動時測試會失敗以提醒同步更新本文件

### 10.5 可測試性

- `db.DB_PATH` 為模組層級變數，測試時直接覆寫即可換成暫存檔
- `_get_conn()` 在每次呼叫時才讀取 `DB_PATH`，替換立即生效
- 驗證碼答案存於 session，測試以 `session_transaction()` 直接寫入繞過
- 逾期以直接改寫 `due_at` 製造，不需要等待或凍結時間

### 10.6 部署

- 單一 Docker 映像檔（`python:3.11-slim`），無外部服務相依
- DB 存於具名 volume，容器重建資料不失
- `/health` 端點供健康檢查
- **正式部署前必須**：覆寫 `SECRET_KEY`、關閉 `debug=True`、改用 WSGI 伺服器（KI-01、KI-02、KI-08）

---

## 11. 已知技術債 / Known Issues

### 11.0 為何有些債修、有些不修

本系統的定位是教學。判斷準則是：

- **會讓學生學到錯誤觀念的 → 修。** 例如帳號停用後仍能借書，這會讓人誤以為
  「檢查一次就夠了」。這類問題本版全部修掉，並在 §11.5 列出。
- **與教學主題無關、修了只是加篇幅的 → 不修，但寫下來。** 例如 CSRF token、
  響應式版面。學生應該知道它們缺席，而不是以為不需要。
- **修了會遮蔽教學重點的 → 刻意保留。** 例如登入邏輯在 `auth` 與 `hub` 各寫一次，
  抽成共用函式後，「兩個入口做同一件事」這個現象就看不見了。

每一項都標註是哪一類。

### 11.1 安全性

| 代號 | 問題 | 影響 | 類別 |
|------|------|------|------|
| KI-01 | `debug=True` 寫死在 `app.py` | 正式環境會洩漏堆疊追蹤並開放互動式除錯器 | 部署前必修 |
| KI-02 | `SECRET_KEY` 有預設值 | 忘記覆寫時 session 可被偽造 | 部署前必修 |
| KI-03 | 無 CSRF token | 所有 POST 可被跨站偽造請求觸發，包含借書、還書、下架書目 | 不修，寫下來 |
| KI-04 | 無登入失敗次數限制 | 驗證碼提高了成本，但沒有上限 | 不修，寫下來 |
| KI-05 | Cookie 未設 `Secure` / `SameSite` | HTTP 傳輸下 session 可被竊聽 | 不修，寫下來 |
| KI-06 | 密碼只檢查長度 ≥ 8 | 可用 `12345678` | 不修，寫下來 |
| KI-07 | 驗證碼答案存於 session 且不過期 | 同一組答案可重複使用直到下次刷新 | 不修，寫下來 |
| KI-08 | 開發用 Flask 伺服器 | 單執行緒、無 HTTPS | 部署前必修 |

### 11.2 正確性與一致性

| 代號 | 問題 | 影響 | 類別 |
|------|------|------|------|
| KI-11 | 登入邏輯在 `auth.login_page` 與 `hub.home` 各實作一次 | 改動時可能只改一處 | **刻意保留** |
| KI-12 | 不保護「最後一位館員」 | 兩位館員互相降級可能造成零館員 | 不修，寫下來 |
| KI-13 | 帳號停用的訊息與帳密錯誤不同 | 可藉此判斷 email 是否註冊過 | 刻意如此（可用性優先） |
| KI-14 | `auth` 表單錯誤用 `error` 參數而非 flash | 與其他子系統不一致 | **刻意保留** |
| KI-15 | 借閱與預約無併發控制 | 兩個請求同時借最後一本時，理論上可能都成功 | 見下方說明 |

> **關於 KI-15：** `borrow_book()` 的檢查與寫入分成兩段 SQL，中間沒有鎖。
> SQLite 的寫入本身是序列化的，實務上極難重現；但嚴格來說這是 TOCTOU
> （check-then-act）。正確作法是把檢查與寫入合併成一條帶條件的 `UPDATE`
> 並檢查 `rowcount`。教學上刻意保留這個結構，因為它清楚示範了問題長什麼樣子。

### 11.3 資料層

| 代號 | 問題 | 影響 | 類別 |
|------|------|------|------|
| KI-31 | 未啟用外鍵約束 | 刪除書目時複本、借閱不會被資料庫擋下，全靠應用層 | 不修，寫下來 |
| KI-32 | `books.isbn` 無 `UNIQUE` 約束 | 重複性只靠應用層檢查；直接寫 SQL 可繞過 | 刻意如此（軟刪除的書目不應佔用 ISBN） |
| KI-33 | 刪除帳號不影響其借閱與預約 | 已刪除帳號的未還書仍計入全館借閱清單 | 見下方說明 |
| KI-34 | 三個外鍵欄位無索引 | 資料量大時查詢變慢 | 不修，寫下來 |
| KI-35 | 時間全部以 `datetime('now')` 產生（UTC） | 畫面顯示的是 UTC 時間，非台灣時間 | 不修，寫下來 |

> **關於 KI-33：** 館員刪除一個還有未還書的帳號時，那些借閱不會自動歸還。
> 這其實是**正確的**——書還在讀者手上，不能因為帳號被刪就當作還了。
> 但目前系統沒有提供「處理已刪除帳號的未還書」的流程，館員只能手動代為還書登記。
> 完整的作法需要一個「帳號結清」流程，超出本系統範圍。

### 11.4 使用者體驗與前端

| 代號 | 問題 | 影響 | 類別 |
|------|------|------|------|
| KI-21 | 預約不保留書本 | `ready` 狀態的讀者可能白跑一趟 | **刻意簡化**（見 §1.5、§8.4 旅程 B） |
| KI-22 | 無到期提醒 | 讀者只能自己記得，或每次登入看首頁概況 | 不修（需要郵件服務） |
| KI-23 | 預約無到期釋出機制 | `ready` 的預約會一直停在那裡直到讀者自己取消 | 不修，寫下來 |
| KI-41 | 無響應式設計 | 手機上兩欄式頁面需橫向捲動 | 不修，寫下來 |
| KI-42 | 刪除確認用 `confirm()` | 樣式無法自訂，且 JS 停用時直接送出 | 不修，寫下來 |
| KI-43 | 分頁未顯示頁碼清單 | 只能一頁一頁翻，不能跳頁 | 不修，寫下來 |

### 11.5 幾項刻意做強的地方

以下五項是交易型系統很容易做錯、本系統刻意處理掉的地方：

| 容易做錯的地方 | 本系統的作法 |
|--------------|-------------|
| 交易子系統的 `_current_user()` 不檢查 `_is_usable()`，停用帳號持有舊 session 仍可借書 | `books`、`loans`、`reservations` 的 `_current_user()` 一律檢查並 `session.clear()`。`test_loans.py` 與 `test_reservations.py` 各有一個測試守著 |
| 把可借數量存成反正規化欄位，需要在四條路徑上手動同步 | 改為由 `book_copies` 即時彙總，欄位不存在（§6.6） |
| 用 `overdue` 狀態值表示逾期，卻沒有任何程式會寫入它 | 改為查詢時推導，時間往前走狀態自動正確（§6.6） |
| 首頁不顯示 flash，子系統 redirect 回首頁的錯誤訊息會消失 | `hub/home.html` 加上 flash 區塊（§9.9） |
| 借閱表單允許選擇過去的時間 | 借出時間由系統產生，讀者無從指定 |

---

## 12. 測試策略

### 12.1 測試層級

只有一種層級：**以 Flask test client 驅動的整合測試**。不寫單元測試，
因為 `db/` 的函式本身就很薄，透過路由測反而同時覆蓋了權限與訊息。

### 12.2 隔離機制

```python
@pytest.fixture(scope='function')
def app(tmp_path):
    flask_app.config['TESTING'] = True
    db_module.DB_PATH = str(tmp_path / 'test.db')
    db_module.init_db()
    yield flask_app
```

每個測試函式一個全新的暫存 DB，含完整種子資料，結束後由 pytest 自動清除。
測試之間沒有任何狀態共用。

### 12.3 Fixtures

| Fixture | 說明 |
|---------|------|
| `app` / `client` | Flask app 與未登入的 test client |
| `authed_client` | `user_id = 1`（讀者） |
| `admin_client` | `user_id = 2`（館員） |
| `other_client` | `user_id = 3`（停用中的讀者） |
| `single_copy_book` | 單一複本的書目，用於預約流程 |
| `multi_copy_book` | 三本複本的書目，用於複本維護 |
| `overdue_loan` | 讀者 1 的一筆逾期借閱 |
| `make_overdue` | 把任一筆借閱改為逾期的 helper |

**兩個陷阱**（詳見 `tests/CLAUDE.md`）：三個身分 client 都由同一個 `client`
衍生，同一測試中同時取用會拿到同一個物件；`other_client` 的帳號是停用的，
測「他人權限」時必須先 `db.set_user_active(3, 1)`。

### 12.4 測試檔案與案例數

| 檔案 | 案例數 | 涵蓋重點 |
|------|:-----:|---------|
| `test_auth.py` | 23 | 登入、申請、登出、驗證碼 |
| `test_hub.py` | 13 | 兩種視圖、館員卡片、借閱概況、逾期警示 |
| `test_profile.py` | 8 | 檢視、編輯、已刪除帳號的處置 |
| `test_admin.py` | 30 | 清單、篩選、搜尋、分頁、四種操作、三條自我保護 |
| `test_books.py` | 62 | 查詢、身分差異、表單驗證、書目與複本維護 |
| `test_loans.py` | 53 | 借書六種失敗、續借六種失敗、還書權限、逾期連鎖 |
| `test_reservations.py` | 29 | 預約五種失敗、順位、遞補、取消權限 |
| **合計** | **218** | |

### 12.5 覆蓋原則

1. 每個功能需求（FR-xx）至少一個測試
2. 每個驗證規則至少一個測試
3. 每個狀態碼至少一個測試
4. **被權限擋下的 POST 必須同時斷言資料庫沒有改變**——只驗 302 無法區分
   「被擋下」與「執行成功後 redirect」
5. 業務規則的交互作用要有測試：逾期擋借書、逾期擋續借、預約擋續借、
   還書解除逾期封鎖、還書遞補預約、借書完成預約

### 12.6 已知的測試缺口

- 沒有併發測試（KI-15 無法以 test client 重現）
- 沒有 CSS 或版面的測試，只驗證 HTML 中出現預期的字串
- 沒有測試 Docker 映像檔實際能否啟動
- `tests/data/users.py` 與 `library.py` 的訊息字串分屬兩個檔案，
  沿襲自不同來源，未合併

### 12.7 執行測試

```bash
pytest                          # 全部 218 個
pytest tests/test_loans.py -v   # 單一模組
pytest -k "overdue"             # 名稱含 overdue 的測試
```

`pytest.ini` 把 `testpaths` 限定為 `tests`，確保只收集本系統的測試。
少了這個設定，pytest 走進不相干的目錄時會收集到多份 `conftest.py`
而產生 `ImportPathMismatchError`。

---

## 13. 未來擴充建議

依實作成本由低到高排序，每一項都標註會碰到哪些檔案，適合作為課堂延伸作業。

| # | 主題 | 說明 | 會動到 |
|:-:|------|------|--------|
| 1 | 分頁頁碼清單 | 目前只能一頁一頁翻 | 各模板的分頁區塊 |
| 2 | 加索引 | `book_copies.book_id` 等三個欄位 | `db/*.py` 的 `_init_*_tables` |
| 3 | 時區處理 | 把 UTC 轉為 `Asia/Taipei` 顯示 | 新增樣板 filter |
| 4 | 借閱歷史匯出 | 讀者下載自己的借閱紀錄 CSV | `blueprints/loans` |
| 5 | 到期提醒 | 首頁列出三天內到期的書 | `db/loans.py` + `hub` |
| 6 | 罰款計算 | 逾期天數 × 每日金額，新增 `fines` 表 | 新子系統 |
| 7 | 預約保留期限 | `ready` 後 N 天未取自動釋出並遞補 | `db/reservations.py` + 排程 |
| 8 | CSRF 保護 | 每個表單加 token | `base.html` + 所有 POST 路由 |
| 9 | 借閱統計 | 熱門書排行、分類借閱比例 | 新子系統 + 圖表 |
| 10 | 條碼掃描 | 以條碼直接借還，取代點選 | `blueprints/loans` + 前端 |

**不建議的方向**：把借閱單改成「一單多本」的主檔／明細結構。
圖書館的借閱在概念上就是一本書對一位讀者，硬加一層會讓續借與逾期的規則變得難以表達。

---

## 附錄 A：狀態碼與訊息對照速查

| `db` 函式 | 狀態碼 | Blueprint 訊息 |
|-----------|--------|---------------|
| `borrow_book` | `ok` | 借閱成功，請於 14 天內歸還 |
| | `missing` | 書目不存在 |
| | `book_unavailable` | 此書目目前暫停借閱 |
| | `has_overdue` | 您有逾期未還的書，請先歸還後再借閱 |
| | `limit_reached` | 已達同時借閱上限（5 冊） |
| | `already_borrowed` | 您已借閱此書且尚未歸還 |
| | `no_copy` | 此書目前無可借複本，可改為預約 |
| `renew_loan` | `ok` | 續借成功，到期日延長 14 天 |
| | `missing` | 借閱紀錄不存在 |
| | `forbidden` | 無權限操作他人的借閱紀錄 |
| | `returned` | 此借閱已歸還，無法續借 |
| | `overdue` | 已逾期的借閱無法續借，請先歸還 |
| | `limit_reached` | 已達續借次數上限（1 次） |
| | `reserved` | 此書已有其他讀者預約，無法續借 |
| `return_loan` | `ok` | 歸還完成 |
| | `returned` | 此借閱已歸還 |
| | `missing` | 借閱紀錄不存在 |
| `create_reservation` | `ok` | 預約成功，可借閱時會在「我的預約」顯示可取書 |
| | `available` | 此書尚有可借複本，請直接借閱 |
| | `already_borrowed` | 您已借閱此書且尚未歸還 |
| | `duplicate` | 您已預約此書 |
| | `book_unavailable` | 此書目目前暫停借閱 |
| | `missing` | 書目不存在 |
| `cancel_reservation` | `ok` | 預約已取消 |
| | `missing` | 預約紀錄不存在 |
| | `forbidden` | 無權限取消他人的預約 |
| | `closed` | 此預約已結束，無法取消 |
| `soft_delete_book` | `deleted` | 書目已下架 |
| | `on_loan` | 尚有未歸還的借閱，無法下架此書目 |
| | `missing` | 書目不存在 |
| `set_copy_status` | `updated` | 複本狀態已更新 |
| | `on_loan` | 複本借出中，無法變更狀態 |
| | `missing` | 複本不存在 |
| `soft_delete_copy` | `deleted` | 複本已刪除 |
| | `on_loan` | 複本借出中，無法刪除 |
| | `missing` | 複本不存在 |

## 附錄 B：詞彙表

| 中文 | 英文 | 程式中的識別字 |
|------|------|---------------|
| 書目 | book / bibliographic record | `books` |
| 複本 | copy / item | `book_copies` |
| 條碼 | barcode | `copy_barcode` |
| 在架 | available | `copy_status = 'available'` |
| 借出中 | on loan | `copy_status = 'borrowed'` |
| 整理中 | under maintenance | `copy_status = 'maintenance'` |
| 借閱 | loan / circulation | `loans` |
| 借期 | loan period | `LOAN_PERIOD_DAYS` |
| 應還日 | due date | `due_at` |
| 續借 | renew | `renew_loan` |
| 逾期 | overdue | `is_overdue`（推導欄位） |
| 預約 | reservation / hold | `reservations` |
| 候補順位 | queue position | `queue_position` |
| 可取書 | ready for pickup | `reservation_status = 'ready'` |
| 館員 | librarian | `role = 0` |
| 讀者 | reader / patron | `role = 1` |
