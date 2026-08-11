# 校園宿舍報修系統 — 系統規格書

## 0. 文件資訊

| 項目 | 內容 |
|------|------|
| 文件名稱 | 校園宿舍報修系統 系統規格書 |
| 版本 | v1.0 |
| 日期 | 2026-08-11 |
| 適用讀者 | 修習系統分析與設計課程的學生、後續維護此專案的開發者 |
| 系統版本 | 校園宿舍報修系統 v1.0 |

### 0.1 文件定位

本專案的文件分為四層，各自回答不同的問題。撰寫或閱讀時請先確認自己需要的是哪一層：

| 文件 | 回答的問題 |
|------|-----------|
| `document/system-spec.md`（本文件） | 這個系統**是什麼**：功能、資料、狀態、規則、限制 |
| `document/build-guide.md` | 這個系統**怎麼建**：從空目錄到可執行的分階段步驟與驗收方式 |
| `CLAUDE.md`、各子目錄的 `CLAUDE.md` | AI 助理與開發者**怎麼協作**：專案速查、模組職責 |
| `rules/flask-blueprint.md`、`rules/database.md` | 寫程式時**要遵守什麼**：路由、表單、SQL、CSS 的具體慣例 |
| `document/auth.md`、`hub.md`、`profile.md`、`admin.md`、`repair.md` | 單一子系統的**細部行為**：資料流、錯誤情境、畫面欄位 |

本文件是其他文件的上位依據。當本文件與其他文件衝突時，以本文件為準，並回頭修正衝突的那一份。

---

## 1. 專案定位與範圍

### 1.1 系統目的

本系統是一套以**學習與可理解性為優先**的校園宿舍報修系統，用於系統分析與設計課程的教學。它刻意維持小規模、不做過度抽象，讓學生能夠在一到兩小時內讀完全部程式碼，並且看清楚「住宿生在瀏覽器上按下送出」這個動作是如何一路走到資料庫，再走回維修人員的畫面。

系統提供四件事：讓住宿生申請帳號並登入、讓住宿生維護自己的房號與聯絡方式、讓住宿生申報宿舍設施故障並追蹤處理進度、讓管理員派工、處理、結案並治理所有帳號。

前兩件沿用會員管理的既有架構；後兩件是本系統的主體。相對於作為樣板的討論區系統，報修帶進了三個新的教學主題，這三件事構成了本系統存在的理由：

1. **狀態機**——一張報修單不是「有」或「沒有」，而是在六個狀態之間依固定規則移動。不合法的移動必須被擋下。
2. **資料範圍權限（row-level）**——同樣是合法登入的使用者，看得到的報修單不同。這是「路由能不能進」無法表達的權限。
3. **稽核軌跡（audit trail）**——每一次狀態異動都必須留下誰、在何時、做了什麼。歷程本身就是報修系統一半的價值。

### 1.2 範圍

**範圍內：**

- Hub 首頁（訪客服務簡介 + 內嵌登入表單；登入後的服務入口與摘要）
- 身分驗證（登入、申請帳號、登出、圖形驗證碼）
- 個人資料（本人查看與編輯姓名、顯示名稱、宿舍棟別、房號、聯絡電話）
- 報修（申報、修改、取消、回覆、查詢自己的報修單）
- 報修管理（管理員專用：全部報修單清單、篩選、搜尋、分頁、派工、開始處理、完成、退件、重新開啟、刪除）
- 會員管理（管理員專用：會員清單、篩選、搜尋、分頁、啟用／停用、角色調整、軟刪除）
- 健康檢查端點
- 上述功能的自動化測試（188 個案例）
- Docker 容器化部署設定

**範圍外（明確不包含）：**

- 圖片附件（報修最常見的需求，但需要檔案上傳與儲存策略，見 KI-27）
- 通知機制（email、簡訊、站內信，見 KI-28）
- 維修成本、零件庫存、廠商管理
- 滿意度評價（見 KI-30）

### 1.4 名詞定義

| 名詞 | 定義 |
|------|------|
| 會員（user） | `users` 表中的一筆紀錄。訪客申請帳號後即成為會員 |
| 住宿生 | `role = 1` 的會員。可申報報修、查詢自己的報修單 |
| 管理員 | `role = 0` 的會員。宿舍管理人員與維修人員共用此角色（見 §4.1 的說明） |
| 訪客（guest） | 沒有有效 session 的瀏覽者。只能瀏覽首頁與申請帳號 |
| 報修單（request） | `repair_requests` 表中的一筆紀錄。一張單對應一個故障問題 |
| 處理紀錄（log） | `repair_logs` 表中的一筆紀錄。分三種：申報內容、回覆、狀態異動 |
| 申報內容（report） | `log_type = 'report'` 的紀錄，與報修單同時建立，一張單恰有一筆 |
| 回覆（comment） | `log_type = 'comment'` 的紀錄。申報人或管理員的補充說明 |
| 狀態異動（status） | `log_type = 'status'` 的紀錄。由狀態轉移函式寫入，使用者不可直接建立 |
| 承辦人（assignee） | `repair_requests.assigned_to` 指向的管理員。派工時指定 |
| 結案 | 報修單處於 `completed`、`rejected`、`cancelled` 三個終態之一 |
| 軟刪除（`is_deleted`） | `1` = 已刪除。系統**不執行實體 DELETE**，刪除只是把旗標設為 1 |
| 帳號可用（usable） | `utils._is_usable(user)`：使用者存在、`is_active` 為真、`is_deleted` 為假 |
| 資料範圍權限 | 決定「這個人能看到哪幾筆資料」的權限，相對於決定「能不能進這個頁面」的路由權限 |

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

以下四項在真實專案中通常是標準配備，本系統刻意不用：

**不用 ORM（如 SQLAlchemy）。** 所有資料存取都是手寫的參數化 SQL，集中在 `db/` 套件內。理由是讓學生直接看到 SQL 語句本身，尤其是狀態轉移那七個函式——它們把「合法性判斷」寫在 `WHERE` 子句裡，這個技巧在 ORM 的抽象底下看不見。代價是重複的 `_get_conn()` / `close()` 樣板，記錄於 KI-23。

**不用狀態機函式庫（如 `transitions`）。** 六個轉移函式各自明碼寫出前置狀態、後置狀態與副作用，不用宣告式的狀態表。理由是宣告式寫法會把「這條轉移做了什麼」拆散到設定與回呼兩處，而本系統希望讀者能在一個函式內讀完一條轉移的全部語意。代價是七條轉移的結構高度重複。

**不用前端框架（如 React、Vue）。** 全部採伺服器端渲染。全站僅八處使用 JavaScript：驗證碼刷新的四個 `onclick`，以及刪除／取消確認的四個 `onclick="return confirm(...)"`。

**不用 Flask-Login。** 身分狀態就是 `session['user_id']` 一個整數。權限檢查是 `utils.login_required` 這個 12 行的裝飾器加上兩個 helper。代價是缺少 session fixation 防護等成熟機制，記錄於 KI-08。

### 2.3 執行方式

```bash
# 本機開發
conda activate flask
pip install -r requirements.txt
python app.py                       # http://localhost:4000
rm database.db && python app.py     # 重置資料庫（含重新植入種子資料）

# Docker
docker compose up -d --build
docker compose down -v              # 停止並刪除資料

# 測試
pytest                              # 188 個案例
pytest tests/test_repair.py -v
pytest -k "lifecycle"
```

`python app.py` 啟動時會呼叫 `db.init_db()`，它會建立三張資料表，並在**各表為空時**植入種子資料。已有資料的資料庫不會被覆寫。

> 專案根目錄有 `pytest.ini`，其中 `testpaths = tests` 限定只收集本系統的測試。若不限定，pytest 會一路往下走進其他目錄，收到依賴別的 `app.py` 的測試而必然失敗。

### 2.4 環境變數

| 變數 | 預設值 | 說明 |
|------|--------|------|
| `SECRET_KEY` | `dev-secret-key-change-in-production` | Flask session 加密金鑰；生產環境務必替換（KI-03） |
| `DB_PATH` | `database.db` | SQLite 資料庫路徑；測試時動態替換為 `tmp_path` 下的暫存檔 |

---

## 3. 系統架構

### 3.1 分層

```
瀏覽器
  │  HTTP（表單送出 / 連結點擊）
  ▼
Flask 路由（blueprints/*/__init__.py）
  │  ① 權限檢查　② 表單驗證　③ 呼叫 db 函式　④ flash + redirect 或 render
  ▼
資料存取層（db/*.py）
  │  參數化 SQL；transaction；狀態轉移的合法性判斷
  ▼
SQLite（三張資料表）
```

三層之間的規則：

- **Blueprint 不寫 SQL。** 所有 SQL 都在 `db/` 套件內。
- **`db/` 不做權限判斷，但做狀態判斷。** 「這個人可不可以」是 Blueprint 的事；「這張單現在可不可以轉到那個狀態」是 `db/` 的事。兩者的差別在於前者依賴 session，後者只依賴資料本身。
- **Blueprint 之間不互相 import。** 只透過 `url_for()` 建立關聯。

第二條是本系統最重要的架構決定，值得展開說明。`db.assign_request()` 會自己確認報修單目前是 `pending`，即使呼叫它的 Blueprint 已經檢查過。這個重複不是疏忽：它讓「一張單只能從 pending 派工」這條規則有一個**唯一且無法繞過**的執行點。任何未來新增的呼叫端——批次匯入、管理指令、另一條路由——都自動受到保護。

### 3.2 模組邊界三原則

1. **一張資料表對應一個 `db/` 模組。** 一個模組可以管多張表（`repair.py` 管兩張），但一張表不應該被兩個模組操作。
2. **一個子系統對應一個 Blueprint、一個 templates 子目錄、一個 CSS 檔、一個測試檔。**
3. **共用的東西放 `utils.py`，只放三個：`_gen_captcha`、`_is_usable`、`login_required`。** `_is_admin` 刻意**不放**在這裡——它由每個需要的 Blueprint 各自定義，見 §4.4。

### 3.3 目錄結構

```
SAD-Dormitory-Repair/
├── app.py                        # 主程式：組裝 Blueprint、啟動伺服器
├── utils.py                      # 跨 Blueprint 共用 helpers（3 個）
├── requirements.txt
├── pytest.ini                    # testpaths = tests
├── Dockerfile
├── docker-compose.yml
├── .dockerignore
├── database.db                   # SQLite（git 忽略，自動建立）
│
├── db/
│   ├── __init__.py               # DB_PATH；匯出公開函式；init_db()
│   ├── connection.py             # _get_conn()
│   ├── users.py                  # users 表
│   ├── repair.py                 # repair_requests 與 repair_logs 兩表
│   └── CLAUDE.md
│
├── blueprints/
│   ├── auth/       __init__.py + CLAUDE.md    # /login /register /logout /captcha.png
│   ├── hub/        __init__.py + CLAUDE.md    # /
│   ├── profile/    __init__.py + CLAUDE.md    # /profile /profile/update
│   ├── admin/      __init__.py + CLAUDE.md    # /admin/users 及四個管理動作
│   └── repair/     __init__.py + CLAUDE.md    # /repair 及 12 條子路由
│
├── templates/
│   ├── base.html
│   ├── auth/       login.html、register.html
│   ├── hub/        home.html
│   ├── profile/    dashboard.html
│   ├── admin/      user_list.html、user_detail.html
│   └── repair/     index.html、detail.html、request_form.html、manage.html
│
├── static/
│   ├── common.css                # 設計 token（按鍵顏色的單一來源）
│   ├── login.css                 # auth 共用樣式
│   ├── hub.css
│   ├── profile.css
│   ├── admin.css
│   └── repair.css
│
├── tests/
│   ├── conftest.py               # 6 個 fixtures
│   ├── data/users.py             # 種子常數與訊息字串
│   ├── test_auth.py    (29)
│   ├── test_hub.py     (15)
│   ├── test_profile.py (12)
│   ├── test_admin.py   (38)
│   ├── test_repair.py  (94)
│   └── CLAUDE.md
│
├── rules/
│   ├── flask-blueprint.md
│   └── database.md
│
├── document/
│   ├── system-spec.md            # 本文件
│   ├── build-guide.md            # 建置流程書
    └── auth.md / hub.md / profile.md / admin.md / repair.md
```

### 3.4 Blueprint 職責

| Blueprint | url_prefix | 職責 | 需要登入 |
|-----------|-----------|------|---------|
| `hub` | 無 | 首頁；訪客服務簡介與內嵌登入；登入後的服務入口與摘要 | 否 |
| `auth` | 無 | 登入、申請帳號、登出、驗證碼圖片 | 否 |
| `profile` | 無 | 本人的資料查看與編輯 | 是 |
| `admin` | `/admin` | 會員帳號治理 | 是（且需管理員） |
| `repair` | `/repair` | 報修申報、查詢、回覆、狀態機、管理清單 | **全部路由皆是** |

`repair` 沒有任何開放給訪客的路由。理由見 §4.3。

### 3.5 請求生命週期與 session

1. 瀏覽器送出請求，附上 session cookie
2. Flask 解出 `session['user_id']`（若有）
3. 路由開頭執行權限檢查（§4.4）
4. 表單驗證（`request.form.get(...).strip()`）
5. 呼叫 `db.*` 函式
6. 成功 → `flash(訊息, 'success')` + `redirect()`；失敗 → `flash(訊息, 'error')` + `redirect()`，或以 `error` 變數重新渲染表單
7. 瀏覽器收到 302 後重新 GET，`get_flashed_messages()` 取出訊息

session 只存 `user_id` 與 `captcha` 兩個鍵。使用者的角色、姓名、房號**每次請求都重新從資料庫讀取**，不快取在 session 中。這讓管理員的停用操作在下一個請求就生效，代價是每個請求多一次查詢。

---

## 4. 角色與權限

### 4.1 角色

| `role` 值 | 身份 | 說明 |
|-----------|------|------|
| `0` | 管理員 | 住宿生的全部權限，加上：檢視所有報修單、派工、開始處理、完成、退件、重新開啟、刪除報修單；會員管理（檢視所有會員含已刪除、啟用／停用、調整角色、軟刪除） |
| `1` | 住宿生 | 申報報修；檢視、修改、取消、回覆**自己的**報修單；查看與編輯自己的個人資料 |

新申請的帳號一律為 `role = 1`。系統沒有「申請成為管理員」的途徑，只能由既有管理員指定。

**為何不設「維修人員」這個第三種角色。** 真實的宿舍報修至少有三種人：住宿生、宿舍管理員（受理與派工）、維修人員（實際動工）。本系統把後兩者合併為 `role = 0`，種子資料中以 `admin@example.com`（宿舍管理員）與 `staff@example.com`（維修組 王師傅）兩個帳號示意分工，但兩者的權限完全相同——維修人員也能派工，管理員也能登記完工。

這是一個**刻意的簡化**，理由有三：其一，兩角色模型足以表達本系統的全部權限規則；其二，三角色會讓權限矩陣從 2×N 變成 3×N，而多出來的那一列在教學上並不產生新概念；其三，角色的粒度問題本身值得單獨討論，把它留作擴充練習（見 §14）比硬塞進來更有價值。

代價是系統無法表達「王師傅只能處理派給他的單」。這一點記錄為 KI-14 的相關限制，也是 §14 的第一項擴充建議。

### 4.2 帳號狀態矩陣

| `is_active` | `is_deleted` | 可登入 | 可操作 | 說明 |
|:---:|:---:|:---:|:---:|------|
| 1 | 0 | ✅ | ✅ | 正常帳號 |
| 0 | 0 | ❌ | ❌ | 已停用（如退宿）。持有舊 session 也會在下一個請求被登出 |
| 1 | 1 | ❌ | ❌ | 已軟刪除 |
| 0 | 1 | ❌ | ❌ | 已停用且已刪除 |

`_is_usable(user)` 同時檢查三件事：使用者存在、`is_active` 為真、`is_deleted` 為假。

### 4.3 權限矩陣

| 動作 | 訪客 | 住宿生（本人） | 住宿生（他人） | 管理員 |
|------|:---:|:---:|:---:|:---:|
| 瀏覽首頁 | ✅ | ✅ | ✅ | ✅ |
| 申請帳號、登入 | ✅ | — | — | — |
| 查看／編輯個人資料 | ❌ | ✅ | ❌ | ✅（自己的） |
| 申報報修 | ❌ | ✅ | — | ✅ |
| 檢視報修單 | ❌ | ✅ | **❌** | ✅（全部） |
| 修改報修單（限 pending） | ❌ | ✅ | ❌ | **❌** |
| 取消報修單（限 pending/assigned） | ❌ | ✅ | ❌ | **❌** |
| 回覆報修單（未結案） | ❌ | ✅ | ❌ | ✅ |
| 派工／開始／完成／退件／重新開啟 | ❌ | ❌ | ❌ | ✅ |
| 刪除報修單 | ❌ | ❌ | ❌ | ✅ |
| 報修管理清單 | ❌ | ❌ | ❌ | ✅ |
| 會員管理 | ❌ | ❌ | ❌ | ✅ |

三個值得注意的格子：

**管理員不能修改報修單內容。** 申報內容是住戶對故障的描述，是這張單的原始證言。管理員若能改，歷程就失真了——事後無從分辨「當初申報的就是這樣」與「有人後來改成這樣」。管理員要補充資訊，用的是回覆，它會留下作者與時間。

**管理員不能代為取消。** 取消是申報人的權利（「我自己修好了」）。管理員認為不該受理時，該用的是**退件**，而退件強制填寫原因。兩者的差別不只是誰按按鈕，而是誰對這個決定負責。

**訪客沒有任何可進入的子系統。** 每一張報修單都帶著房號與聯絡電話，因此沒有開放訪客瀏覽的頁面。首頁上的四張服務卡片對訪客全部是鎖定狀態。

### 4.4 權限檢查機制

本系統的權限分四層，前三層問「你是誰」，第四層問「這筆資料是不是你的」。

```
1. @login_required        無 session          -> redirect auth.login_page
2. _is_usable(user)       帳號失效            -> session.clear() + redirect auth.login_page
3. _is_admin(user)        role != 0           -> flash 無操作權限 + redirect
4. _can_view(user, req)   非申報人且非管理員  -> flash 無權限檢視此報修單 + redirect
```

**前三層的順序不可調換。** 第 2 層失敗代表**身分本身失效**（處置是登出），第 3 層失敗代表**身分有效但權限不足**（處置是導回）。若把第 3 層放前面，已被停用的管理員會收到與事實不符的「權限不足」，且 session 不會被清除。

**第 4 層與前三層的性質不同。** 前三層問的是「你是誰」，只看 session 與 `users` 表；第 4 層問的是「這筆資料是不是你的」，必須把資料先讀出來才能判斷。這也是為什麼它一定發生在 `db.get_request()` 之後，而前三層都在之前。

```python
def _can_view(user, req):
    return user is not None and req is not None and (
        req['requester_id'] == user['id'] or _is_admin(user)
    )
```

`_is_admin(user)` 為各 Blueprint 內部 helper（**非 `utils.py`**），判斷邏輯統一為 `user['role'] == 0`。這些檢查在每個路由開頭**明碼重複寫出，不抽象成裝飾器**——讀者從任一路由的前幾行就能讀出完整的守門條件。這個重複是刻意的教學設計，請勿重構。

`repair` 各路由需要的層級：

| 路由 | 需要的層級 |
|------|-----------|
| `GET /repair/`、`/repair/new` | 1 + 2 |
| `GET /repair/<id>`、`POST /repair/<id>/comment` | 1 + 2 + 4 |
| `/repair/<id>/edit`、`/repair/<id>/cancel` | 1 + 2 + **限申報人本人**（比第 4 層更嚴：管理員也不行） |
| `/repair/manage` 及六條管理動作 | 1 + 2 + 3 |

### 4.5 自我保護規則與「最後一個管理員」

管理員對自己的帳號受三條規則限制：

| 規則 | 內容 | 訊息 |
|------|------|------|
| R1 | 不可停用自己 | `不可停用自己的帳號` |
| R2 | 不可刪除自己 | `不可刪除自己的帳號` |
| R3 | 不可修改自己的角色 | `不可修改自己的角色` |

由這三條規則可推得：任何管理動作完成後，執行者仍是一個啟用、未刪除、`role=0` 的帳號，因此系統中永遠至少有一個可用的管理員，「最後一個管理員被鎖死」的狀態不可達。系統因此**不實作管理員計數檢查**。

> ⚠️ 若未來放寬 R1–R3 任何一條，必須立即補上「操作後啟用中管理員數 ≥ 1」的檢查，否則系統可被鎖死且無法從介面復原。

啟用（activate）**不設自我限制**：對自己啟用是無害且冪等的。

**與報修的交互作用。** 停用一個帳號不會影響他已經申報的報修單，也不會把他從承辦人欄位移除。這產生兩個要注意的狀態，兩者都記錄在 §12：

- 被停用的管理員仍可能是某張單的 `assigned_to`（KI-14）
- 被停用或刪除的住宿生，他的報修單仍在管理清單中，且申報人欄位會退回顯示 email（因為 `name` 可能為 NULL）

第二點是刻意保留的行為，理由見 §6.6。

---

## 5. 功能需求

### 5.1 首頁（FR-HUB）

**FR-HUB-01 訪客首頁**
主要流程：`GET /` 無 session → 渲染左側四張鎖定卡片（我要報修、我的報修單、個人資料、報修管理）與右側內嵌登入表單。
後置條件：無狀態改變。
> 四張卡片全部鎖定，訪客無法從首頁進入任何子系統。頁面下方以一句話說明理由：報修單載有房號與聯絡電話。

**FR-HUB-02 內嵌登入**
主要流程：`POST /` → 驗證碼 → 帳密 → `db.update_last_login()` → `session['user_id']` → redirect `/`。
例外流程：與 FR-AUTH-01 完全相同的五種錯誤。
> 這段程式碼是 `auth.login_page()` 的完整複製（KI-12）。任何登入政策的強化都必須兩處都改。

**FR-HUB-03 登入後首頁**
主要流程：`GET /` 有有效 session → 渲染歡迎訊息（含住宿位置）與服務卡片。「我的報修單」卡片顯示自己的單數；管理員另外顯示「報修管理」（含待受理筆數）與「會員管理」兩張卡片。
例外流程：session 存在但帳號失效 → `session.clear()`，改以訪客視圖渲染（不 redirect）。

### 5.2 身分驗證（FR-AUTH）

**FR-AUTH-01 登入**
主要流程：`GET /login` 顯示表單 → `POST` → 驗證碼非空 → 驗證碼正確 → 帳密非空 → 帳號存在且未刪除且密碼正確 → 帳號啟用中 → `db.update_last_login()` → `session['user_id']` → redirect `/`。
例外流程（依檢查順序）：`請輸入驗證碼`、`驗證碼錯誤，請重新輸入`、`請輸入帳號與密碼`、`帳號或密碼錯誤`、`帳號已停用`。
> 「帳號不存在」與「密碼錯誤」與「帳號已刪除」共用同一則訊息，不讓外部探測帳號是否存在。但「帳號已停用」是不同的訊息——這是刻意的取捨：停用是管理員的行政處置，當事人有權知道自己為何登不進去。

**FR-AUTH-02 申請帳號**
主要流程：`GET /register` → `POST` → email 與密碼非空 → email 格式正確 → 密碼長度 ≥ 8 → 兩次密碼一致 → `db.create_user()` → flash `申請成功，請登入` → redirect `/login`。
例外流程：`請輸入電子郵件與密碼`、`電子郵件格式不正確`、`密碼至少需要 8 個字元`、`兩次密碼輸入不一致`、`此電子郵件已被使用`（`sqlite3.IntegrityError`）。
後置條件：新帳號 `role = 1`、`is_active = 1`、`is_deleted = 0`。
> **住宿資料（棟別、房號、電話）為選填。** 理由是新生可能在分配房間前就先開帳號；報修表單會在缺漏時要求補齊，不必卡在註冊這一關。錯誤重新渲染時，這三個欄位與姓名一併以 `form_data` 回填。

**FR-AUTH-03 登出**：`GET /logout` → `session.clear()` → redirect `/login`。（GET 且有副作用，KI-07）

**FR-AUTH-04 驗證碼圖片**：`GET /captcha.png` → 產生 5 碼字串寫入 `session['captcha']` → 回傳 PNG。字元集刻意排除易混淆的 `I` `O` `0` `1`。

### 5.3 個人資料（FR-PROFILE）

**FR-PROFILE-01 檢視**
主要流程：`GET /profile` → 三層檢查（1+2）→ 渲染唯讀欄位。`?edit=1` 進入編輯模式。
例外流程：未登入 → redirect `/login`；帳號失效 → `session.clear()` + redirect `/login`。

**FR-PROFILE-02 更新**
主要流程：`POST /profile/update` → **層 1 + 層 2** → 取五個欄位（姓名、顯示名稱、棟別、房號、電話），空字串轉 `None` → `db.update_user_profile()` → redirect `/profile`。
後置條件：五個欄位被更新。棟別、房號、電話會成為下一張報修單的預設值。
> **層 2 的檢查在此處絕不能省**，詳見 §12.5。

### 5.4 報修（FR-REPAIR）

以下所有需求的前置條件皆包含：已登入、帳號可用。`_PAGE_SIZE = 10`。

**FR-REPAIR-01 我的報修單**
主要流程：`GET /repair/` → 讀取 `?status`（預設 `all`）與 `?page`（預設 1）→ `db.list_my_requests(user_id, page, 10, status)` → 渲染表格、狀態篩選列與分頁列。
例外流程：`status` 不是合法值 → 視同 `all`；`page` 超出範圍 → 回傳空清單，不報錯（KI-16）。
後置條件：無狀態改變。
> 管理員在此頁看到的**一樣只有自己申報的單**。要看全部請到 `/repair/manage`。兩個視角刻意分成兩條路由，而不是在同一頁用一個開關切換——它們的欄位、操作與心智模型都不同，混在一起會讓管理員分不清自己現在是住戶還是管理者。
> 列表依 `updated_at` 降冪排序，因此最近有回覆或狀態異動的單會浮到最上面。

**FR-REPAIR-02 申報報修**
主要流程：`GET /repair/new` → 表單以個人資料的棟別、房號、電話預填 → `POST` → 標題非空 → 描述非空 → 棟別非空 → 房號非空 → 類別合法 → 優先等級合法 → `db.create_request()` **在單一 transaction 中同時寫入 `repair_requests` 與一筆 `log_type='report'` 的 `repair_logs`** → flash `報修單已送出` → redirect 該單的詳細頁。
例外流程：六則驗證訊息（見 §10.1），皆以 `error` 變數重新渲染表單並回填 `form`。
後置條件：新報修單 `request_status = 'pending'`、`assigned_to = NULL`。
> 主檔與首則描述**必須同時成功或同時失敗**——一張沒有描述的報修單是無效狀態，維修人員無從判斷要修什麼。

**FR-REPAIR-03 檢視報修單**
主要流程：`GET /repair/<id>` → 層 1+2 → 報修單存在且未刪除 → **層 4（`_can_view`）** → `db.list_logs()` 取得處理歷程 → 渲染基本資料、時間軸、以及依身分與狀態決定的操作區。
例外流程：不存在或已刪除 → flash `報修單不存在或已刪除` + redirect `/repair/`；非申報人且非管理員 → flash `無權限檢視此報修單` + redirect `/repair/`。
> 兩則訊息刻意不同。有人可能認為「無權限」應該偽裝成「不存在」以免洩漏單號的存在性。本系統選擇說實話，理由是報修單號在宿舍內部本來就會口頭流通（「我的單是 37 號」），隱藏它換不到實質的保護，卻會讓誤點連結的人收到誤導性的訊息。

**FR-REPAIR-04 修改報修單**
觸發者：**僅申報人本人**。
主要流程：`GET /repair/<id>/edit` → 層 1+2 → 存在且未刪除 → 是本人 → 狀態為 `pending` → 表單以現值預填（描述取自 `log_type='report'` 的那筆）→ `POST` → 同 FR-REPAIR-02 的六項驗證 → `db.update_request()` **在單一 transaction 中更新主檔與首則描述** → flash `報修單已更新` → redirect 詳細頁。
例外流程：非本人（含管理員）→ `無權限修改此報修單`；狀態非 `pending` → `只有待受理的報修單可以修改`。
> 一旦派工，內容就成為維修人員已經讀過並據以準備的依據，此時再改標題或地點會讓兩邊對不上。要補充資訊請用回覆（FR-REPAIR-06），它會留下時間與作者，不會覆蓋原本的敘述。

**FR-REPAIR-05 取消報修**
觸發者：**僅申報人本人**。
主要流程：`POST /repair/<id>/cancel` → 層 1+2 → 存在且未刪除 → 是本人 → `db.cancel_request()`（內部再確認狀態為 `pending` 或 `assigned`）→ flash `報修單已取消` → redirect 詳細頁。
例外流程：非本人 → `無權限取消此報修單`；狀態不符 → `無法取消此報修單（狀態不符）`。
後置條件：狀態轉為 `cancelled`，`closed_at` 寫入，並新增一筆 `status` 紀錄。
> 已進入 `in_progress` 不可取消：取消不會讓拆開的水管復原，只會讓紀錄與現場不符。

**FR-REPAIR-06 回覆報修單**
觸發者：申報人本人或管理員。
主要流程：`POST /repair/<id>/comment` → 層 1+2+4 → 狀態不在終態 → 內容非空 → `db.create_log(..., 'comment')` **在單一 transaction 中新增紀錄並更新主檔的 `updated_at`** → flash `已新增回覆` → redirect 詳細頁。
例外流程：無權限 → `無權限檢視此報修單`；已結案 → `此報修單已結案，無法新增回覆`；內容為空 → `請輸入回覆內容`。
後置條件：新增一筆 `comment` 紀錄；該單浮到列表最上面。

**FR-REPAIR-07 報修管理清單**
觸發者：**僅管理員**。
主要流程：`GET /repair/manage` → 層 1+2+3 → 讀取 `?status` `?q` `?page` → `db.list_all_requests()` → 另呼叫 `db.count_by_status()` 取得六個狀態的計數 → 渲染摘要列、篩選列、搜尋表單、表格與分頁。
搜尋比對標題、棟別、房號、申報人 email 與姓名五個欄位。三個 query parameter 可組合。
> 搜尋關鍵字未 escape SQL `LIKE` 的萬用字元（KI-17）。參數化查詢已防止 SQL injection，此項僅影響搜尋語意。

**FR-REPAIR-08 ~ FR-REPAIR-12 狀態轉移（管理員）**
五條路由：`/assign`、`/start`、`/complete`、`/reject`、`/reopen`。共同結構為：層 1+2+3 → 取表單參數 → 呼叫對應的 `db.*_request()` → 依回傳的布林值 flash 成功或失敗訊息 → redirect 詳細頁。
各條轉移的前置狀態、後置狀態、必填參數與副作用，見 §7。

**FR-REPAIR-13 刪除報修單**
觸發者：**僅管理員**。
主要流程：`POST /repair/<id>/delete` → 層 1+2+3 → 存在且未刪除 → `db.soft_delete_request()` **在單一 transaction 中把主檔與所有紀錄的 `is_deleted` 一併設為 1** → flash `報修單已刪除` → redirect `/repair/manage`。
前端在按鈕上加 `onclick="return confirm(...)"`。
後置條件：該單與其所有紀錄從所有清單消失。**級聯是在 application 層做的**，不是資料庫的 `ON DELETE CASCADE`——本系統沒有外鍵（KI-20）。**且無法還原**（KI-24）。

### 5.5 會員管理（FR-ADMIN）

前置條件皆為層 1+2+3。此子系統幾乎不受領域影響，只有兩處顯示與報修有關。

**FR-ADMIN-01 會員清單**：`GET /admin/users`，`?status=all|active|disabled|deleted`、`?q=`、`?page=` 三者可組合。搜尋比對 email、姓名、顯示名稱**與房號**（房號是本系統新增的比對欄位）。清單新增「住宿位置」與「聯絡電話」兩欄。

**FR-ADMIN-02 會員明細**：`GET /admin/users/<id>`。除帳號欄位外，**另有一個區塊列出該會員最近 5 筆報修單**，讓管理員在停用帳號前先看到會受影響的紀錄。
例外流程：查無此人 → `找不到該使用者` + redirect 清單。

**FR-ADMIN-03 停用會員**：`POST .../deactivate`。R1：不可停用自己。目標已刪除 → `該帳號已刪除，無法操作`。
**FR-ADMIN-04 啟用會員**：`POST .../activate`。**不檢查是否為自己**（無害且冪等）。
**FR-ADMIN-05 軟刪除會員**：`POST .../delete`。R2：不可刪除自己。**不連動刪除其報修單**（見 §6.6）。
**FR-ADMIN-06 調整角色**：`POST .../role`，表單欄位 `role` 須為 `'0'` 或 `'1'`。R3：不可修改自己的角色。

---

## 6. 資料模型

### 6.1 概觀

三張資料表：

```
users                    repair_requests              repair_logs
─────                    ───────────────              ───────────
id ◄──────┬───────────── requester_id                 id
email     │              id ◄──────────────────────── request_id
hash      └───────────── assigned_to                  user_id ─────┐
role                     title                        log_type     │
name                     category                     content      │
display_name             priority                     created_at   │
dorm_building            dorm_building                updated_at   │
room_no                  room_no                      is_deleted   │
phone                    contact_phone                             │
is_active                request_status                            │
is_deleted               assigned_at                               │
created_at               started_at                                │
last_login_at ◄──────────closed_at                                 │
      ▲                  created_at                                │
      │                  updated_at                                │
      └──────────────────is_deleted ───────────────────────────────┘
                                （所有關聯皆為裸整數，無外鍵約束）
```

**為何報修要拆成主檔與明細兩張表。** 一張報修單會累積多則紀錄：申報描述、雙方的來回討論、每一次狀態異動。若把這些塞回主檔，就只能靠不斷覆寫同一個欄位，歷程會消失。而報修系統的價值有一半在歷程——「這台冷氣今年修過三次」「上次是誰處理的」「當初申報時說的症狀跟現在一樣嗎」，這些問題都要靠明細才答得出來。

這是常見的主檔／明細模式，但用途不只一種：報修的明細**同時**是使用者產生的內容與系統的稽核軌跡。`log_type` 這個欄位就是用來區分兩者的。

### 6.2 `users` 表 DDL

```sql
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT    UNIQUE NOT NULL,
    hash          TEXT    NOT NULL,
    role          INTEGER NOT NULL DEFAULT 1,
    name          TEXT,
    display_name  TEXT,
    dorm_building TEXT,
    room_no       TEXT,
    phone         TEXT,
    is_active     INTEGER NOT NULL DEFAULT 1,
    is_deleted    INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    last_login_at TEXT
);
```

比一般的會員表多三欄：`dorm_building`、`room_no`、`phone`，全部可為 NULL。

### 6.3 `repair_requests` 與 `repair_logs` DDL

```sql
CREATE TABLE IF NOT EXISTS repair_requests (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    requester_id   INTEGER NOT NULL,
    title          TEXT    NOT NULL,
    category       TEXT    NOT NULL DEFAULT 'other',
    priority       TEXT    NOT NULL DEFAULT 'normal',
    dorm_building  TEXT    NOT NULL,
    room_no        TEXT    NOT NULL,
    contact_phone  TEXT,
    request_status TEXT    NOT NULL DEFAULT 'pending',
    assigned_to    INTEGER,
    assigned_at    TEXT,
    started_at     TEXT,
    closed_at      TEXT,
    created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at     TEXT    NOT NULL DEFAULT (datetime('now')),
    is_deleted     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS repair_logs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id INTEGER NOT NULL,
    user_id    INTEGER NOT NULL,
    log_type   TEXT    NOT NULL DEFAULT 'comment',
    content    TEXT    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
    is_deleted INTEGER NOT NULL DEFAULT 0
);
```

**為何報修單自己存 `dorm_building` 與 `room_no`，而不是每次都 JOIN `users`。** 因為報修地點不必然是申報人的房間——走廊的燈、交誼廳的冷氣、洗衣間的水管都會被申報。更重要的是，報修單記錄的是**申報當下**的地點；住戶換房之後，舊的報修單仍應指向舊房號。這是資料倉儲中「快照 vs 參照」的取捨，本系統在報修地點上選擇快照。`contact_phone` 同理。

### 6.4 欄位字典

**`repair_requests`**

| 欄位 | 型別 | 說明 |
|------|------|------|
| `requester_id` | INTEGER | 申報人的 `users.id`。無外鍵約束（KI-20） |
| `title` | TEXT | 報修標題，必填 |
| `category` | TEXT | `water` 給排水 / `electric` 電力照明 / `furniture` 家具修繕 / `network` 網路 / `aircon` 空調 / `door` 門窗鎖具 / `other` 其他 |
| `priority` | TEXT | `low` / `normal` / `high` / `urgent` |
| `dorm_building` | TEXT | 棟別，必填。申報當下的快照 |
| `room_no` | TEXT | 房號或地點描述（可為「3 樓走廊」），必填 |
| `contact_phone` | TEXT | 聯絡電話，可為 NULL；為 NULL 時詳細頁退回顯示申報人的個人資料電話 |
| `request_status` | TEXT | 六個狀態之一，見 §7 |
| `assigned_to` | INTEGER | 承辦人的 `users.id`，可為 NULL（尚未派工） |
| `assigned_at` | TEXT | 派工時間 |
| `started_at` | TEXT | 開始處理時間；`reopen` 會清空 |
| `closed_at` | TEXT | 結案時間（完成／退件／取消皆寫入）；`reopen` 會清空 |
| `updated_at` | TEXT | 最後異動時間。新增回覆與狀態轉移都會更新，列表依此降冪排序 |

**`repair_logs`**

| 欄位 | 型別 | 說明 |
|------|------|------|
| `request_id` | INTEGER | 對應 `repair_requests.id` |
| `user_id` | INTEGER | 這則紀錄的作者。狀態紀錄的作者是執行操作的管理員 |
| `log_type` | TEXT | `report` 申報內容（一張單恰一筆）/ `comment` 回覆 / `status` 狀態異動 |
| `content` | TEXT | 內容。`status` 型別的內容由 `db/repair.py` 以字串串接產生（KI-18） |

### 6.5 種子資料

**四個種子帳號**（`_seed_users_if_empty`，`users` 表為空時植入）：

| id | email | 密碼 | role | is_active | name | 住宿位置 |
|----|-------|------|:----:|:---------:|------|---------|
| 1 | user@example.com | password123 | 1 | 1 | 陳小明 | A 棟 301 |
| 2 | admin@example.com | admin1234 | 0 | 1 | 宿舍管理員 | — |
| 3 | disabled@example.com | disabled123 | 1 | **0** | *(NULL)* | B 棟 205 |
| 4 | staff@example.com | staff1234 | 0 | 1 | 維修組 王師傅 | — |

種子帳號使用 bcrypt cost=4（加速測試），註冊路徑使用 cost=10（KI-10）。

第 4 個帳號存在的理由有二：報修的派工需要一個「不是操作者本人」的承辦人；會員管理的自我保護規則（R1–R3）需要一個「另一個管理員」作為對照，才能驗證限制只針對自己而非所有管理員。帳號 3 的 `name` 刻意留 NULL，用來示範 `COALESCE(name, display_name, email)` 的退回顯示。

**六張種子報修單**（`_seed_repair_if_empty`，`repair_requests` 表為空時植入）：

| # | 標題 | 申報人 | 狀態 | 紀錄數 | 示範什麼 |
|---|------|--------|------|:---:|---------|
| 1 | 浴室水龍頭持續漏水 | 1 | pending | 1 | 最小案例：只有申報內容，等待受理 |
| 2 | 房間日光燈管閃爍 | 1 | assigned | 2 | 派工後的樣子；狀態紀錄帶備註 |
| 3 | 冷氣不冷且有異音 | 1 | in_progress | 4 | 三種 `log_type` 並存的完整時間軸 |
| 4 | 衣櫃門把鬆脫 | 1 | completed | 5 | 走完全程；雙方來回討論後結案 |
| 5 | 想在房間加裝個人洗衣機 | **3** | rejected | 2 | 停用帳號的既有資料不受影響；申報人欄退回顯示 email；退件強制附原因 |
| 6 | 走廊燈泡不亮（已自行更換） | 1 | cancelled | 2 | 申報人自行取消；`room_no` 可以是「3 樓走廊」這種非房號 |

六張單涵蓋六個狀態，因此 `db.count_by_status()` 在初始狀態下六個數字都是 1。

種子資料的時間戳以 `datetime('now', '-N minutes')` 明確指定，不用預設值。理由是全部在同一秒內建立時 `updated_at` 會完全相同，列表排序變得不確定，看不出「最近有異動的單會浮上來」這個行為。

`_seed_repair_if_empty()` **必須排在 `_seed_users_if_empty()` 之後**——報修單的 `requester_id` 與 `assigned_to` 都指向那四個帳號。

### 6.6 跨子系統的資料保留規則

**停用或軟刪除一個會員，不連動處理他的報修單。** 這是一條明確的設計決定，不是疏漏。

理由是：**報修紀錄是宿舍設施的維護歷程，屬於宿舍，不屬於個人。** 學生畢業退宿、帳號停用之後，「A 棟 301 的冷氣去年修過三次」這件事仍然要查得到——下一個住進去的人、負責編列維修預算的人、判斷該不該整台換掉的人，都需要這段歷史。若隨帳號一起消失，設施的生命週期就斷了。

具體後果有三，都是可觀察的行為：

1. 被停用會員的報修單仍出現在管理清單中，申報人欄位正常顯示（`name` 為 NULL 時退回顯示 email）
2. 被停用的管理員仍可能掛在某張單的 `assigned_to` 上（KI-14）
3. 已刪除會員的報修單，管理員仍可檢視與操作

反過來說，若某天的需求變成「退宿後個資必須清除」，正確的做法不是刪除報修單，而是**匿名化**：把 `requester_id` 指向一個保留帳號、清空 `contact_phone`，保留其餘欄位。這個取捨值得在課堂上與 GDPR 的「被遺忘權」一起討論。

### 6.7 `db/` 函式總表

**`db/users.py`**

| 函式 | 說明 |
|------|------|
| `find_user_by_email(email)` | 以 email 查詢，含 hash。**不過濾 `is_deleted`** |
| `find_user_by_id(user_id)` | 以 id 查詢，不含 hash。**不過濾 `is_deleted`** |
| `create_user(email, password, name, display_name, dorm_building, room_no, phone)` | 新增，bcrypt cost=10 |
| `update_user_profile(user_id, name, display_name, dorm_building, room_no, phone)` | 更新五個欄位 |
| `update_last_login(user_id)` | 更新 `last_login_at` |
| `soft_delete_user(user_id)` | `is_deleted = 1` |
| `list_users(page, page_size, status, keyword)` | 回傳 `(items, total)`。**刻意不強制過濾 `is_deleted`** |
| `list_active_admins()` | 可指派的管理員清單，供派工下拉選單 |
| `set_user_active(user_id, is_active)` / `set_user_role(user_id, role)` | 狀態與角色 |
| `hard_delete_user_by_email(email)` | 實體刪除，**僅供測試清理** |

**`db/repair.py`**

| 函式 | 類別 | 說明 |
|------|------|------|
| `list_my_requests(user_id, page, page_size, status)` | 查詢 | 回傳 `(items, total)`，依 `updated_at` 降冪 |
| `list_all_requests(page, page_size, status, keyword)` | 查詢 | 同上，供管理員使用 |
| `get_request(request_id)` | 查詢 | 單筆，含申報人與承辦人顯示名稱。**不過濾 `is_deleted`** |
| `list_logs(request_id)` | 查詢 | 未刪除的紀錄，依 `created_at` 遞增（時間軸由舊到新） |
| `get_report_log(request_id)` | 查詢 | 首則申報內容，供修改表單預填 |
| `count_by_status()` | 查詢 | 六個狀態的計數 dict |
| `create_request(...)` | 寫入 | **transaction**：主檔 + 首則 `report` 紀錄 |
| `update_request(...)` | 寫入 | **transaction**：主檔 + 首則紀錄。內部再確認本人與 `pending` |
| `create_log(request_id, user_id, content, log_type)` | 寫入 | **transaction**：紀錄 + 主檔 `updated_at`。**不接受 `'status'`** |
| `soft_delete_request(request_id)` | 寫入 | **transaction**：主檔與所有紀錄一併標記 |
| `assign_request` / `start_request` / `complete_request` / `reject_request` / `cancel_request` / `reopen_request` | 狀態轉移 | 見 §7。全部回傳布林值 |

### 6.8 軟刪除策略與查詢過濾約定

所有刪除操作設定 `is_deleted = 1`，**不執行 `DELETE`**。查詢時一律加上 `is_deleted = 0` 過濾，兩類例外必須在 docstring 中明確標註：

**例外一：管理端清單。** `list_users()` 依 `status` 參數決定是否過濾，因為管理員的職責就是要能檢視已刪除的紀錄。
> 注意 `list_all_requests()` **不屬於**這個例外——它硬性過濾 `is_deleted = 0`。理由是報修單沒有「檢視已刪除紀錄」的業務需求，刪除在這裡的語意是「這張單根本不該存在」（重複申報、誤送、測試資料），不是「已結束的歷史」。已結束的歷史用的是 `completed` / `rejected` / `cancelled` 三個終態，它們仍然看得到。

**例外二：單筆取得函式。** `find_user_by_email`、`find_user_by_id`、`get_request` 一律不過濾，過濾責任交給呼叫端（`utils._is_usable(user)` 或 Blueprint 中的 `if not req or req['is_deleted']`）。這讓「不存在」與「已刪除」在資料層可區分，呼叫端才能給出不同的錯誤訊息與 redirect 目標。

反過來，**列表類函式一律過濾，沒有例外參數**：`list_my_requests` 與 `list_logs` 都硬性帶 `is_deleted = 0`。

---

## 7. 報修單狀態機

這一章是本系統最核心的內容。

### 7.1 狀態圖

```
                    ┌──────────────────────────────┐
                    │                              │ reopen（管理員，需原因）
                    ▼                              │
                ┌───────┐                          │
   建立 ───────►│pending│  待受理                   │
                └───┬───┘                          │
          ┌─────────┼─────────┐                    │
   assign │  reject │  cancel │                    │
（管理員）│（管理員，│（申報人）│                    │
          │  需原因）│         │                    │
          ▼         ▼         ▼                    │
     ┌────────┐ ┌────────┐ ┌─────────┐             │
     │assigned│ │rejected│ │cancelled│             │
     │ 已派工 │ │ 已退件 │ │  已取消  │             │
     └───┬────┘ └────────┘ └─────────┘             │
         │  ▲        終態        ▲  終態            │
   start │  └──── cancel ────────┘                 │
（管理員）│      （申報人）                          │
         ▼                                         │
   ┌───────────┐                                   │
   │in_progress│ 處理中                             │
   └─────┬─────┘                                   │
         │ complete（管理員）                       │
         ▼                                         │
    ┌─────────┐                                    │
    │completed│ 已完成 ─────────────────────────────┘
    └─────────┘
      終態（但可 reopen）
```

### 7.2 轉移表

| # | 函式 | 前置狀態 | 後置狀態 | 觸發者 | 必填參數 | 副作用 |
|---|------|---------|---------|--------|---------|--------|
| 1 | `assign_request` | `pending` | `assigned` | 管理員 | `assignee_id`（須為啟用中的管理員） | 寫入 `assigned_to`、`assigned_at` |
| 2 | `start_request` | `assigned` | `in_progress` | 管理員 | — | 寫入 `started_at` |
| 3 | `complete_request` | `in_progress` | `completed` | 管理員 | — | 寫入 `closed_at` |
| 4 | `reject_request` | `pending` | `rejected` | 管理員 | **`reason`** | 寫入 `closed_at` |
| 5 | `cancel_request` | `pending` 或 `assigned` | `cancelled` | **申報人本人** | — | 寫入 `closed_at` |
| 6 | `reopen_request` | `completed` | `pending` | 管理員 | **`reason`** | 清空 `closed_at` 與 `started_at`；**保留 `assigned_to`** |

六個函式涵蓋七條轉移（`cancel` 一個函式吃兩個來源狀態）。**每一條轉移都額外寫入一筆 `log_type='status'` 的紀錄**，與主檔的更新在同一個 transaction 內完成。

### 7.3 三個設計決定

**退件與重新開啟強制填寫原因，其餘四條不強制。** 判準是「這個決定會不會讓對方需要解釋」。退件是拒絕受理，申報人有權知道為什麼，否則他只會再申報一次同樣的問題；重新開啟是推翻先前的完工判斷，承辦人有權知道哪裡沒修好。派工、開始、完成、取消四條不需要解釋——狀態本身就說明了一切。

**重新開啟不清空 `assigned_to`。** 回到 `pending` 之後理論上要重新派工，但保留上一次的承辦人是有意義的線索：同一個問題重複發生時，管理員第一眼就看得到上次是誰處理的。代價是 `assigned_at` 仍停留在上一輪的時間，語意上略顯含糊（KI-15）。

**合法性判斷寫在 SQL 的 `WHERE` 子句裡，不是先讀出來再用 Python 比對。**

```python
row = conn.execute(
    "SELECT * FROM repair_requests"
    " WHERE id = ? AND is_deleted = 0 AND request_status = 'pending'",
    (request_id,)
).fetchone()
if not row:
    return False
```

兩者的差別在於**查詢與更新之間有沒有空隙**。若寫成「先 `SELECT *`，再 `if row['request_status'] != 'pending': return False`，最後 `UPDATE`」，兩個管理員同時按下派工按鈕時，兩邊都可能讀到 `pending` 而雙雙通過檢查。把條件放進 `WHERE`，加上 SQLite 的寫入鎖，只有先到的那個會撈到資料。

這不是完整的併發控制——嚴格來說 `SELECT` 與 `UPDATE` 之間仍有窗口，真正的解法是把條件也放進 `UPDATE ... WHERE request_status = 'pending'` 並檢查 `rowcount`。本系統選擇目前的寫法是因為它足以示範「條件下推」這個概念，而且在單機 SQLite 的實際使用情境下風險極低。完整的修補方向見 KI-13。

### 7.4 狀態與可執行操作的對照

詳細頁的操作區依身分與狀態渲染，這張表是模板邏輯的依據：

| 狀態 | 申報人可做 | 管理員可做 | 可回覆 |
|------|-----------|-----------|:---:|
| `pending` 待受理 | 修改、取消 | 派工、退件、刪除 | ✅ |
| `assigned` 已派工 | 取消 | 開始處理、刪除 | ✅ |
| `in_progress` 處理中 | — | 登記完成、刪除 | ✅ |
| `completed` 已完成 | — | 重新開啟、刪除 | ❌ |
| `rejected` 已退件 | — | 刪除 | ❌ |
| `cancelled` 已取消 | — | 刪除 | ❌ |

---

## 8. 路由總表

| Blueprint | 方法 | 路徑 | 守門層級 | 說明 |
|-----------|------|------|:--------:|------|
| hub | `GET POST` | `/` | — | 首頁；訪客可瀏覽並內嵌登入 |
| auth | `GET POST` | `/login` | — | 登入；已登入 → redirect `/` |
| auth | `GET POST` | `/register` | — | 申請帳號 |
| auth | `GET` | `/captcha.png` | — | 驗證碼圖片 |
| auth | `GET` | `/logout` | — | 登出（GET 且有副作用，KI-07） |
| profile | `GET` | `/profile` | 1+2 | 個人資料；`?edit=1` 進入編輯模式 |
| profile | `POST` | `/profile/update` | 1+2 | 更新個人資料 |
| admin | `GET` | `/admin/users` | 1+2+3 | 會員清單；`?status=` `?q=` `?page=` |
| admin | `GET` | `/admin/users/<int:user_id>` | 1+2+3 | 會員明細（含其報修單） |
| admin | `POST` | `/admin/users/<int:user_id>/activate` | 1+2+3 | 啟用帳號 |
| admin | `POST` | `/admin/users/<int:user_id>/deactivate` | 1+2+3 | 停用帳號（R1） |
| admin | `POST` | `/admin/users/<int:user_id>/role` | 1+2+3 | 調整角色（R3） |
| admin | `POST` | `/admin/users/<int:user_id>/delete` | 1+2+3 | 軟刪除帳號（R2） |
| repair | `GET` | `/repair/` | 1+2 | 我的報修單；`?status=` `?page=` |
| repair | `GET POST` | `/repair/new` | 1+2 | 申報報修 |
| repair | `GET` | `/repair/<int:request_id>` | 1+2+4 | 報修單詳細與處理歷程 |
| repair | `GET POST` | `/repair/<int:request_id>/edit` | 1+2+本人 | 修改報修單（限 pending） |
| repair | `POST` | `/repair/<int:request_id>/comment` | 1+2+4 | 新增回覆 |
| repair | `POST` | `/repair/<int:request_id>/cancel` | 1+2+本人 | 取消報修 |
| repair | `GET` | `/repair/manage` | 1+2+3 | 管理清單；`?status=` `?q=` `?page=` |
| repair | `POST` | `/repair/<int:request_id>/assign` | 1+2+3 | 派工 |
| repair | `POST` | `/repair/<int:request_id>/start` | 1+2+3 | 開始處理 |
| repair | `POST` | `/repair/<int:request_id>/complete` | 1+2+3 | 登記完成 |
| repair | `POST` | `/repair/<int:request_id>/reject` | 1+2+3 | 退件（需原因） |
| repair | `POST` | `/repair/<int:request_id>/reopen` | 1+2+3 | 重新開啟（需原因） |
| repair | `POST` | `/repair/<int:request_id>/delete` | 1+2+3 | 刪除報修單 |
| — | `GET` | `/health` | — | 健康檢查 |

**共 27 條**（hub 1、auth 4、profile 2、admin 6、repair 13、health 1）。

### 8.1 命名慣例

- URL 使用小寫；路由函式名稱使用底線
- 有副作用的動作一律用 `POST`（`/logout` 是唯一的例外，KI-07）
- 資源在前、動作在後（`/repair/<id>/assign`，不是 `/repair/assign/<id>`）
- 清單頁的篩選、搜尋、分頁一律用 query parameter，不用路徑參數

### 8.2 為何狀態轉移是六條路由，不是一條

可以設計成 `POST /repair/<id>/transition`，用表單欄位 `action` 決定要走哪一條。本系統刻意不這樣做，理由有三：

其一，**每條路由的必填參數不同**（`assign` 要 `assignee_id`，`reject` 與 `reopen` 要 `note`，其餘可選），合併之後驗證邏輯會變成一串 `if action == ...`。

其二，**URL 本身就是文件**。`/repair/5/reject` 一眼就知道發生了什麼，`/repair/5/transition` 要看 request body 才知道。伺服器 log 與瀏覽器歷史紀錄都因此更容易讀。

其三，**權限若未來要分化，分開的路由才有掛載點**。若哪天「退件」要限縮給資深管理員，六條路由的版本只要改一個函式；合併版本則要在 `if` 分支裡塞條件。

代價是六個函式的前幾行完全相同（三層檢查）。這個重複與 `admin` 子系統是同一個取捨，見 §4.4。

---

## 9. 畫面設計與流程

### 9.1 畫面清單

| 畫面 | 樣板 | CSS | 對應路由 |
|------|------|-----|---------|
| 首頁（訪客／已登入雙模式） | `hub/home.html` | `hub.css` | `/` |
| 登入 | `auth/login.html` | `login.css` | `/login` |
| 申請帳號 | `auth/register.html` | `login.css` | `/register` |
| 個人資料（唯讀／編輯雙模式） | `profile/dashboard.html` | `profile.css` | `/profile` |
| 會員清單 | `admin/user_list.html` | `admin.css` | `/admin/users` |
| 會員明細 | `admin/user_detail.html` | `admin.css` | `/admin/users/<id>` |
| 我的報修單 | `repair/index.html` | `repair.css` | `/repair/` |
| 報修表單（新增／修改雙模式） | `repair/request_form.html` | `repair.css` | `/repair/new`、`/repair/<id>/edit` |
| 報修單詳細 | `repair/detail.html` | `repair.css` | `/repair/<id>` |
| 報修管理清單 | `repair/manage.html` | `repair.css` | `/repair/manage` |

共 10 個畫面、11 個樣板檔（含 `base.html`）、6 個 CSS 檔。

### 9.2 導覽關係

```
                    ┌──────────┐
       ┌────────────│  首頁 /  │────────────┐
       │            └────┬─────┘            │
       │                 │                  │
       ▼                 ▼                  ▼
  ┌─────────┐    ┌──────────────┐    ┌────────────┐
  │個人資料  │    │ 我的報修單    │    │ 報修管理    │（僅管理員）
  │/profile │    │ /repair/     │    │/repair/    │
  └─────────┘    └──────┬───────┘    │  manage    │
                        │            └──────┬─────┘
              ┌─────────┴────────┐          │
              ▼                  ▼          │
        ┌───────────┐    ┌──────────────┐   │
        │ 申報報修   │    │ 報修單詳細    │◄──┘
        │/repair/new│───►│/repair/<id>  │
        └───────────┘    └──────┬───────┘
                                │
                                ▼
                         ┌─────────────┐
                         │ 修改報修單   │（限本人 + pending）
                         │/<id>/edit   │
                         └─────────────┘

  ┌────────────┐        ┌─────────────┐
  │ 會員清單    │───────►│  會員明細    │──► 報修單詳細
  │/admin/users│◄───────│/users/<id>  │
  └────────────┘        └─────────────┘（僅管理員）
```

每個內頁的 topbar 都有「返回首頁」；管理員的三個管理頁彼此互通。

### 9.3 報修單詳細頁的版面

這是全系統最複雜的畫面，左右兩欄：

```
┌──────────────────────────────────────────────────────────────────┐
│ 報修單 #7            返回首頁 | 我的報修單 | 報修管理 | 王小明 | 登出 │
├──────────────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────┐ ┌──────────────────────┐  │
│ │ 房間插座沒電          [處理中]      │ │ 我的操作              │  │
│ │ ────────────────────────────────── │ │  （依狀態顯示按鈕）   │  │
│ │ 維修類別 電力照明  優先等級 [高]     │ └──────────────────────┘  │
│ │ 報修地點 A 棟 301  申報人  陳小明    │ ┌──────────────────────┐  │
│ │ 聯絡電話 0912-…    承辦人  王師傅    │ │ 管理操作（僅管理員）   │  │
│ │ 申報時間 …  派工時間 …               │ │  依狀態渲染不同表單    │  │
│ │ 開始處理 …  結案時間 —               │ │  ─────────────────    │  │
│ └────────────────────────────────────┘ │  刪除報修單           │  │
│ ┌────────────────────────────────────┐ └──────────────────────┘  │
│ │ 處理歷程（5 則）                    │ ┌──────────────────────┐  │
│ │  ● [申報內容] 陳小明  08-11 10:02   │ │ 狀態流程              │  │
│ │    靠窗那組插座完全沒電…             │ │  ① 待受理  ✓          │  │
│ │  ● [狀態異動] 宿舍管理員 10:15      │ │  ② 已派工  ✓          │  │
│ │    已派工給 維修組 王師傅            │ │  ③ 處理中  ◄ 目前      │  │
│ │  ● [回覆] 陳小明  10:30             │ │  ④ 已完成             │  │
│ │    我下午都在房間                    │ └──────────────────────┘  │
│ │  ● [狀態異動] 王師傅  14:02         │                           │
│ │    開始處理：已到場                  │                           │
│ │ ────────────────────────────────── │                           │
│ │ 新增回覆  [ textarea      ] [送出]  │                           │
│ └────────────────────────────────────┘                           │
└──────────────────────────────────────────────────────────────────┘
```

三種 `log_type` 在時間軸上以不同顏色的圓點與標籤區分：申報內容（藍）、狀態異動（紫）、回覆（灰）。這個視覺區分是刻意的——讀者要能一眼分辨「這句話是人寫的」還是「這是系統記錄的事實」。

右欄的操作區在**已結案**時只剩刪除按鈕，左欄的回覆表單也會替換成一句說明。畫面本身就把狀態機的規則表達出來，使用者不需要按下去才知道不行。

### 9.4 使用者旅程

**旅程一：住宿生申報到結案**

1. 訪客進入 `/`，看到四張鎖定的卡片與右側登入表單
2. 以 `user@example.com` 登入 → 首頁顯示「歡迎回來，陳小明！住宿位置：A 棟 301」與四張卡片
3. 點「我要報修」→ 表單的棟別、房號、電話已用個人資料預填
4. 填標題、選類別與優先等級、寫故障情形 → 送出 → 導向該單的詳細頁，狀態為「待受理」
5. 發現漏填資訊 → 右欄「修改報修單」→ 改完儲存
6. 管理員派工後回到此頁，「修改」按鈕消失，只剩「取消報修」
7. 維修人員登記完成後，回覆表單消失，改顯示「此報修單已結案」

**旅程二：管理員受理到結案**

1. 以 `admin@example.com` 登入 → 首頁的「報修管理」卡片顯示「1 筆待受理」
2. 進入 `/repair/manage` → 頂端六個狀態的計數方塊，點擊即篩選
3. 點「處理」進入詳細頁 → 右欄選承辦人、填備註 → 派工
4. 時間軸立刻多一則紫色的「已派工給 維修組 王師傅：請帶備用燈管」
5. 以 `staff@example.com` 登入 → 同一張單 → 「開始處理」→「登記完成」
6. 住戶回報沒修好 → 管理員在詳細頁「重新開啟」，填原因 → 狀態回到待受理，承辦人保留

**旅程三：權限邊界**

1. 以 `user@example.com` 登入，手動輸入 `/repair/5`（屬於帳號 3 的單）→ flash「無權限檢視此報修單」+ 導回我的報修單
2. 手動輸入 `/repair/manage` → 導回 `/repair/`
3. 管理員停用帳號 1 → 帳號 1 的瀏覽器下一次點任何頁面 → session 被清除，導向登入頁

### 9.5 CSS 架構

`static/common.css` 是全站按鍵**顏色的單一來源**（CSS 自訂屬性），`base.html` 最先載入。各子系統 CSS 使用自己的 prefixed 類別，顏色值透過 `var(--...)` 引用，**不寫死色碼**：

| CSS 檔案 | 按鍵前綴 | 適用頁面 |
|---------|---------|---------|
| `common.css` | — | 全站共用 token |
| `login.css` | （無前綴）`.login-form button` | auth 兩頁、hub 內嵌登入表單 |
| `hub.css` | `hub-*` | 首頁 |
| `profile.css` | `profile-*` | 個人資料頁 |
| `admin.css` | `admin-btn-*`、`admin-btn-action-*` | 會員管理兩頁 |
| `repair.css` | `repair-btn-*`、`repair-btn-action-*` | 報修四頁 |

**已知例外**：狀態 badge（帳號狀態、角色、報修狀態、優先等級）的底色硬編碼於 `admin.css` 與 `repair.css`，因為 `common.css` 只定義按鍵色，未定義狀態語意色（KI-19）。

**關鍵限制：`.login-form` class。** `login.css` 的 `button[type="submit"]` 樣式限定在 `.login-form` 選擇器內，**不會全域污染**。凡使用登入樣式的表單，`<form>` 必須加上 `class="login-form"`。全系統恰有三處：`auth/login.html`、`auth/register.html`、`hub/home.html`。`profile`、`admin`、`repair` 的表單**不加**此 class。

**`<a>` vs `<button>` 選用規則**：GET 導航用 `<a href>`，POST 動作用 `<button type="submit">`。不用 `<a href="#">` 搭配 `onclick` 假裝按鍵。

全站僅八處允許使用 inline event handler：

| 位置 | 用途 |
|------|------|
| `auth/login.html` × 2、`hub/home.html` × 2 | 驗證碼刷新 |
| `admin/user_list.html` × 1、`admin/user_detail.html` × 1 | 刪除帳號的 `confirm` |
| `repair/manage.html` × 1、`repair/detail.html` × 3 | 刪除報修單 ×2、取消報修 ×1 的 `confirm` |

（實際為十處；`repair` 的三處確認是本系統新增的，數量隨功能增加，原則不變：只有 `confirm` 與驗證碼刷新可以用 inline handler。）

---

## 10. 驗證規則與訊息字串

### 10.1 輸入欄位規格

| 欄位 | 必填 | 規則 | 上限 |
|------|:---:|------|------|
| email | ✅ | `^[^\s@]+@[^\s@]+\.[^\s@]+$` | 無（KI-26） |
| password | ✅ | 長度 ≥ 8 | 無（bcrypt 靜默截斷 72 bytes，KI-06） |
| 姓名、顯示名稱 | ❌ | `.strip()` 後空字串轉 `None` | 無 |
| 棟別、房號、電話（個人資料） | ❌ | 同上 | 無 |
| 報修標題 | ✅ | `.strip()` 後非空 | 無（KI-26） |
| 故障情形 | ✅ | `.strip()` 後非空 | 無（KI-26） |
| 棟別、房號（報修單） | ✅ | `.strip()` 後非空 | 無 |
| 聯絡電話（報修單） | ❌ | 空字串轉 `None` | 無 |
| 維修類別 | ✅ | 須在 `db.CATEGORIES` 內 | — |
| 優先等級 | ✅ | 須在 `db.PRIORITIES` 內 | — |
| 回覆內容 | ✅ | `.strip()` 後非空 | 無（KI-26） |
| 退件原因、重新開啟原因 | ✅ | `.strip()` 後非空 | 無 |
| 派工承辦人 | ✅ | 須為啟用中的管理員 | — |

所有文字輸出都經過 Jinja2 的自動跳脫，HTML 注入不成立。

### 10.2 驗證順序

**登入**：驗證碼非空 → 驗證碼正確 → 帳密非空 → 帳號存在且未刪除且密碼正確 → 帳號啟用中

**申請帳號**：email 與密碼非空 → email 格式 → 密碼長度 → 兩次一致 → email 未被使用

**報修表單**（新增與修改共用）：標題 → 故障情形 → 棟別 → 房號 → 類別 → 優先等級。第一個不通過的就回傳，不累積多則訊息。

**報修管理動作**：層 1 → 層 2 → 層 3 → 表單參數（如退件原因）→ `db` 層的狀態合法性。最後一關失敗時的訊息一律是「無法…（報修單狀態不符）」，因為 Blueprint 拿到的只是一個 `False`，它無從得知是狀態不對、單不存在、還是承辦人無效。

### 10.3 訊息字串總表

**auth（11 則）**

| 訊息 | 觸發情境 |
|------|---------|
| `請輸入驗證碼` / `驗證碼錯誤，請重新輸入` | 驗證碼 |
| `請輸入帳號與密碼` / `帳號或密碼錯誤` / `帳號已停用` | 登入 |
| `請輸入電子郵件與密碼` / `電子郵件格式不正確` / `密碼至少需要 8 個字元` / `兩次密碼輸入不一致` / `此電子郵件已被使用` | 申請帳號 |
| `申請成功，請登入` | 申請成功（flash） |

**admin（11 則）**：`無操作權限`、`找不到該使用者`、`該帳號已刪除，無法操作`、`角色值不正確`、`不可停用自己的帳號`、`不可刪除自己的帳號`、`不可修改自己的角色`、`帳號已啟用`、`帳號已停用`、`角色已更新`、`帳號已刪除`

**repair（33 則）**

| 分類 | 訊息 |
|------|------|
| 表單驗證 | `請輸入報修標題`、`請描述故障情形`、`請輸入宿舍棟別`、`請輸入房號`、`維修類別不正確`、`優先等級不正確` |
| 存取控制 | `報修單不存在或已刪除`、`無權限檢視此報修單`、`無權限修改此報修單`、`無權限取消此報修單`、`無操作權限` |
| 申報人操作 | `報修單已送出`、`報修單已更新`、`只有待受理的報修單可以修改`、`報修單已取消`、`無法取消此報修單（狀態不符）` |
| 回覆 | `已新增回覆`、`請輸入回覆內容`、`此報修單已結案，無法新增回覆` |
| 派工 | `請選擇承辦人`、`已完成派工`、`派工失敗（報修單狀態不符，或承辦人不是啟用中的管理員）` |
| 處理 | `已開始處理`、`無法開始處理（報修單狀態不符）`、`已登記完成`、`無法登記完成（報修單狀態不符）` |
| 退件 | `請填寫退件原因`、`報修單已退件`、`無法退件（報修單狀態不符）` |
| 重新開啟 | `請填寫重新開啟的原因`、`報修單已重新開啟`、`無法重新開啟（報修單狀態不符）` |
| 刪除 | `報修單已刪除` |

全部 55 個鍵、53 則相異字串（`無操作權限` 與 `帳號已停用` 各由兩個子系統共用）都定義在 `tests/data/users.py` 的 `MESSAGES` 中，供測試斷言使用。**修改 Blueprint 中的訊息字串時，必須同步更新該檔。** 訊息一律集中在此，不散落到各測試檔的斷言中。

### 10.4 flash 的使用慣例

| 情境 | 作法 |
|------|------|
| POST 成功 | `flash(訊息, 'success')` + `redirect()` |
| POST 失敗（權限、狀態、找不到） | `flash(訊息, 'error')` + `redirect()` |
| 表單驗證失敗 | **不用 flash**，以 `error` 變數重新渲染表單並回填 `form` |

第三條是刻意的：表單驗證失敗時使用者需要看到自己剛剛填的內容，redirect 會把它們沖掉。

---

## 11. 非功能需求

### 11.1 效能

- 目標規模：數百名住宿生、每學期數百張報修單。SQLite 單檔足夠
- 分頁一律 10 筆，避免一次撈出全部資料
- `bcrypt` cost=10 約 0.1 秒／次，只在註冊與登入時發生
- **沒有任何索引**（KI-22）。`repair_requests` 的每次查詢都是全表掃描。在數百筆的規模下不成問題，數萬筆就會有感
- 每個 `db` 函式自行開關連線，無連線池（KI-23）

### 11.2 安全性

| 項目 | 現況 |
|------|------|
| 密碼儲存 | bcrypt 雜湊，不可逆 |
| SQL injection | 全面使用參數化查詢，**不存在此風險** |
| XSS | Jinja2 自動跳脫，**不存在此風險** |
| CSRF | **無防護**（KI-01） |
| 暴力破解 | **無防護**（KI-02）；驗證碼可重放（KI-05） |
| session | 簽章 cookie；無 `Secure`/`SameSite`/過期時間（KI-04）；無 fixation 防護（KI-08） |
| 個資存取 | 有資料範圍權限，但**無存取稽核**（KI-11） |
| 部署 | `debug=True` 且綁 `0.0.0.0`（KI-09）——**本系統不得部署到公開網際網路** |

### 11.3 可用性與相容性

- 支援桌機與平板；報修單詳細頁在 900px 以下改為單欄
- 全站繁體中文；無多語系機制（KI-18）
- 無 ARIA 標記、無鍵盤導航最佳化

### 11.4 可維護性

- 全部程式碼約 5,200 行（Python 1,935、樣板 1,427、CSS 1,826；不含文件與測試），一到兩小時可讀完
- 模組邊界清晰，新增子系統的步驟明確（見 `rules/flask-blueprint.md`）
- 刻意的重複（三層檢查、六個轉移函式）已在程式碼註解與本文件中標明理由，避免後人「順手重構」

### 11.5 可測試性

- 188 個測試案例，執行時間約 2.7 秒
- 每個測試函式使用 `tmp_path` 建立獨立 SQLite 檔，測試之間完全隔離
- 驗證碼透過 `session_transaction()` 繞過，不需要 OCR
- 種子帳號使用 cost=4 加速雜湊——這個為了測試而降低的參數寫在正式的種子函式中（KI-10）

### 11.6 部署

- Docker + Docker Compose，port 4000，named volume 持久化 `/app/data`
- `DB_PATH` 指向 volume，容器重建不影響資料
- `/health` 端點供 health check 使用
- **未使用生產級 WSGI 伺服器**（KI-09）

---

## 12. 已知技術債 / Known Issues

本章是這份規格書最重要的部分。

共 30 條。每一條都記錄：描述、影響、**為何本版接受**、修補方向與工作量。

### 12.0 判準：哪些債要修、哪些不修

30 條技術債裡，哪些該修、哪些該留下來當教材？判準只有一條：

> **缺陷的影響是否會外溢到當事人以外的人？**

值得注意的是，**同一條判準套用在不同的領域上，會得出不同的結論**。最清楚的例子是 `POST /profile/update` 缺少帳號有效性檢查這件事：

| 個人資料頁能改的東西 | 影響範圍 | 處置 |
|------------------|---------|------|
| 姓名與顯示名稱 | 只有自己。姓名不會出現在任何公開頁面 | 可以**保留**作為教材 |
| **房號與聯絡電話** | 會印在報修單上、成為維修人員上門的依據 | **必須修補** |

同樣一行程式碼、同樣一條判準，因為欄位的用途不同而得出相反的結論。這是本系統最值得在課堂上講的一件事：**技術債的嚴重性不是程式碼的屬性，是脈絡的屬性。** 一個在討論區系統中無關痛癢的疏漏，換到報修系統就變成「已退宿的人還能改聯絡地址，維修人員照著跑一趟」。

其餘的債（CSRF、驗證碼重放、`debug=True` 等）不因領域而異，一律保留為教材。

### 12.1 安全性

**KI-01 — 全站 POST 表單無 CSRF token**
描述：所有 POST 表單都沒有 CSRF token，`requirements.txt` 也沒有 `flask-wtf`。session cookie 未設定 `SameSite`。
影響：攻擊者可誘導已登入的管理員送出偽造請求，例如把所有待受理的報修單一次退件、或停用任意會員。
為何接受：加入 CSRF 需引入 `flask-wtf`、在每個表單插入隱藏欄位、在測試中處理 token，會讓「表單送出」這條主線多出一層學生尚未理解的機制。
修補方向：`CSRFProtect`，或自行以 session 儲存 token 比對。約 2 小時，含測試調整。

**KI-02 — 無登入失敗次數限制**
描述：登入沒有 rate limiting 或帳號鎖定。`users` 表也沒有 `failed_login_count`、`locked_until` 等欄位，資料模型層面就不支援。
影響：可對任意帳號暴力破解。
修補方向：`users` 表加三個欄位，失敗累計、成功歸零、超過門檻拒絕。約 3 小時。
> **加乘效應警告**：本項與 KI-05（驗證碼可重放）、KI-10（種子帳號 cost=4 且密碼公開）疊加後，管理員帳號可被自動化爆破。三者單獨看都不算致命，合起來就是。

**KI-03 — `SECRET_KEY` 有公開的預設值**
描述：`app.py` 使用 `os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')`。`docker-compose.yml` 中的 `please-change-this-to-a-random-string` 同樣公開。
影響：知道金鑰的人可自行簽出任意 session cookie，直接假冒 `user_id = 2`（管理員），繞過整個身分驗證。
為何接受：有預設值讓學生 clone 後可直接 `python app.py`。
修補方向：未設環境變數時直接拋例外（fail fast）。10 分鐘。

**KI-04 — 無 session cookie 安全設定**
描述：未設定 `SESSION_COOKIE_SECURE`、`SAMESITE`、`HTTPONLY`、`PERMANENT_SESSION_LIFETIME`。
影響：session 沒有過期時間，HTTP 明文傳輸不會被阻擋，缺少 SameSite 這道 CSRF 緩解。
修補方向：`app.py` 加四行 `app.config[...]`。30 分鐘。

**KI-05 — 驗證碼答案在登入成功後未清除**
描述：`session['captcha']` 寫入後從未 `session.pop()`，只會被下一次 `GET /captcha.png` 覆寫。
影響：同一組答案可重複使用。攻擊者人工辨識一次就能無限次嘗試密碼——驗證碼形同虛設。
為何接受：刻意保留為教材。
修補方向：登入流程結束後 `session.pop('captcha', None)`。15 分鐘，需同步調整測試中 `_set_captcha` 的時機。
> 這是本章中**修補成本最低、安全效益最高**的一項。

**KI-06 — 密碼規則只有長度，且無變更密碼功能**
描述：唯一規則是 `len(password) < 8`，`8` 是寫死的 magic number。沒有複雜度要求、沒有黑名單。bcrypt 會**靜默截斷**超過 72 bytes 的輸入而系統無上限檢查（中文每字 3 bytes，約 24 字觸及截斷）。系統也完全沒有變更密碼或忘記密碼的功能。
影響：`password123` 全部通過；密碼外洩後使用者沒有自救途徑。
修補方向：抽常數、加 72 bytes 檢查、新增 `db.update_password()` 與 `POST /profile/password`。約 3 小時。

**KI-07 — `/logout` 是 GET 且有副作用**
描述：`@auth_bp.route('/logout')` 只接受 GET 卻執行 `session.clear()`，違反 `rules/flask-blueprint.md` 自己的規範。
影響：可被 `<img src="/logout">` 從外站觸發。危害輕微，但它是規範與實作不一致的明確案例。
修補方向：改 `methods=['POST']`，模板的 `<a>` 改 `<form>`。30 分鐘（本系統有五個模板含登出連結）。

**KI-08 — 無 session fixation 防護**
描述：登入成功時直接 `session['user_id'] = ...`，沒有先 `session.clear()`。
修補方向：登入成功時先 `session.clear()` 再寫入。10 分鐘。

**KI-09 — `debug=True` 且綁定 `0.0.0.0`**
描述：`app.run(host='0.0.0.0', port=4000, debug=True)`，而 `Dockerfile` 的 `CMD` 直接走這條路徑。未使用 gunicorn 等生產級 WSGI 伺服器。
影響：**這是本系統最嚴重的單一問題。** Werkzeug 的互動式 debugger 暴露在網路上，任何能觸發例外的人都可以執行任意 Python 程式碼。
修補方向：以環境變數控制 debug；Dockerfile 改用 `gunicorn`。1 小時。
> **本系統不得部署到公開網際網路。** 若有此需求，KI-09 必須先修補。

**KI-10 — 種子帳號的雜湊強度與明文密碼散布**
描述：`_seed_users_if_empty()` 使用 `bcrypt.gensalt(4)`。這個為了加速測試而降低的 cost 寫在**正式的**種子函式中。四組明文密碼同時出現在 `db/users.py`、`README.md`、`tests/data/users.py`、`CLAUDE.md` 與本文件中。
影響：任何部署此專案的環境都帶有已知帳密，其中包含兩個管理員帳號。
為何接受：種子帳號的目的就是開箱即用，密碼必須公開已知。這一項的本質是「教學便利」與「安全」的直接衝突，無法兩全。
修補方向：抽成 `SEED_COST = 4` 與 `USER_COST = 10` 兩個常數並加註說明。30 分鐘。

**KI-11 — 報修單的個資存取無稽核** ⚠️
描述：系統有資料範圍權限（誰**能**看），但沒有存取紀錄（誰**看過**）。管理員檢視任何住戶的房號與電話都不留痕跡。
影響：本系統的 `repair_requests` 表含有房號與聯絡電話，是明確的個人資料。一個被入侵或濫用的管理員帳號可以把全校住宿生的房號與電話逐頁抄走，事後無從追查。
為何接受：存取稽核需要新增一張表、在每個讀取路徑插入寫入、並處理稽核紀錄本身的保存與清理策略，複雜度接近再做一個子系統。
修補方向：新增 `access_logs` 表，在 `repair.detail` 與 `repair.manage` 記錄 `(user_id, request_id, viewed_at)`。約 4 小時。
> 這一條值得單獨拿出來討論：權限系統回答的是「能不能」，稽核系統回答的是「做過什麼」，兩者不能互相取代。一個只有前者的系統，在出事之後什麼都查不到。

**KI-12 — hub 內嵌登入是 auth 登入的完整複製**
描述：`hub.home()` 中的登入邏輯與 `auth.login_page()` 逐行相同，兩份獨立維護。
影響：任何登入政策的強化都**必須兩處都改**，漏改就能從另一個入口繞過。修補 KI-05 或 KI-08 時最容易踩到。
為何接受：抽出共用函式會讓兩個 Blueprint 產生依賴，違反模組邊界原則。
修補方向：把驗證邏輯抽到 `utils.py` 的 `authenticate(email, password, captcha_input, captcha_answer)`，回傳 `(user_or_None, error_or_None)`。約 1 小時。

### 12.2 正確性與一致性

**KI-13 — 狀態轉移的併發窗口**
描述：轉移函式先以 `SELECT ... WHERE request_status = 'pending'` 確認狀態，再 `UPDATE`。兩個敘述之間仍有窗口。
影響：兩個管理員同時派工同一張單，理論上可能雙雙成功，後者覆蓋前者的 `assigned_to`，且留下兩筆狀態紀錄。SQLite 的寫入鎖讓這個窗口極小，單機使用幾乎觀察不到。
為何接受：目前的寫法已足以示範「條件下推到 `WHERE`」這個核心概念；完整的修補會讓六個函式各多三行，模糊焦點。
修補方向：把條件也放進 `UPDATE ... WHERE id = ? AND request_status = 'pending'`，改以 `cursor.rowcount == 1` 判斷成功。約 1 小時。

**KI-14 — 承辦人被停用或降級後，報修單仍顯示其為承辦人**
描述：`assigned_to` 是派工當下的快照。該管理員之後被停用、軟刪除或降為住宿生，報修單不會有任何變化。
影響：管理清單上的「承辦人」欄位可能指向一個已經不在職的人，而系統不會提示。該員若被降級，他甚至無法再處理自己名下的單。
為何接受：連動處理需要決定「該轉派給誰」，而這是一個沒有標準答案的業務問題。
修補方向：停用或降級時列出其名下未結案的報修單，要求管理員逐一轉派或退回待受理。約 3 小時。
> 這一條與 §4.1「不設維修人員角色」的簡化直接相關：因為所有管理員權限相同，任何管理員都能接手處理，實務上的傷害因此被降低。若未來加入第三種角色，本項的嚴重性會顯著上升。

**KI-15 — `reopen` 後 `assigned_at` 語意含糊**
描述：重新開啟會清空 `started_at` 與 `closed_at`，但保留 `assigned_to` 與 `assigned_at`。狀態回到 `pending`，畫面卻顯示一個過去的派工時間。
影響：時間欄位與狀態不一致。讀者可能誤以為這張單已經派過工。
為何接受：保留承辦人是刻意的（見 §7.3），而清空 `assigned_at` 又會丟失「上次何時派的」這個資訊。
修補方向：新增 `reopen_count` 與 `last_reopened_at` 欄位，或把每一輪的時間戳改存在 `repair_logs` 中而不是主檔。約 2 小時。

**KI-16 — 分頁頁碼超出範圍不報錯**
描述：`?page=999` 會回傳空清單與「第 999 / 3 頁」，不是 404，也不會導回第 1 頁。
修補方向：`page = min(max(1, page), total_pages)`。15 分鐘。

**KI-17 — 搜尋關鍵字未 escape `LIKE` 的萬用字元**
描述：`%` 與 `_` 在 `LIKE` 中是萬用字元，搜尋 `%` 會比對到全部資料。
影響：僅影響搜尋語意；參數化查詢已防止 SQL injection。
修補方向：escape 後加 `ESCAPE` 子句。30 分鐘。

**KI-18 — 狀態紀錄的文字在 db 層以字串串接產生**
描述：`f'已派工給 {display}' + (f'：{note}' if note else '')` 這類中文訊息寫死在 `db/repair.py` 中，與資料一起存入 `content` 欄位。
影響：三個後果。其一，資料層知道了呈現層的事（中文措辭）；其二，訊息一旦寫入就固定，日後改措辭不會影響舊紀錄，新舊混雜；其三，完全無法多語系化。
為何接受：替代方案是存結構化資料（`{"action": "assign", "assignee_id": 4, "note": "..."}`）再由模板組字，這需要 JSON 欄位與模板端的邏輯，複雜度明顯上升。
修補方向：`content` 改存 JSON，新增 `db.LOG_TEMPLATES` 由 Blueprint 或模板負責組字。約 4 小時，含既有資料遷移。

**KI-19 — 狀態語意色硬編碼在子系統 CSS 中**
描述：`common.css` 只定義按鍵色 token。報修的六個狀態、四個優先等級、三種紀錄類型，以及會員的狀態與角色 badge，底色全部硬編碼在 `repair.css` 與 `admin.css`。
影響：改一次配色要動兩個檔案十幾處。
修補方向：在 `common.css` 增加 `--status-*` 系列 token。1 小時。

### 12.3 資料層

**KI-20 — 完全沒有外鍵約束**
描述：`requester_id`、`assigned_to`、`request_id` 全部是裸 INTEGER，且未啟用 `PRAGMA foreign_keys`。
影響：資料庫本身不阻止「指向不存在使用者的報修單」。目前靠應用層維持一致性。
為何接受：SQLite 的外鍵預設關閉，開啟後會讓軟刪除與測試資料的建立順序變得敏感，容易在教學過程中產生難解的錯誤。
修補方向：加 `REFERENCES` 子句並在 `_get_conn()` 中 `PRAGMA foreign_keys=ON`。約 2 小時，含測試調整。

**KI-21 — 級聯刪除在 application 層完成**
描述：`soft_delete_request()` 手動把主檔與所有明細一起標記。若有人直接對資料庫下 `UPDATE repair_requests SET is_deleted=1`，就會留下一批孤兒紀錄。
修補方向：與 KI-20 一併處理，或改用資料庫觸發器。

**KI-22 — 沒有任何索引**
描述：三張表都只有主鍵。`repair_requests.requester_id`、`request_status`、`repair_logs.request_id` 都是高頻查詢條件。
影響：每次查詢全表掃描。數百筆無感，數萬筆會有感。
修補方向：`CREATE INDEX` 三到四條。20 分鐘。
> 這是本章中**投入產出比最高**的一項。

**KI-23 — 每個函式自行開關連線，無連線池**
描述：每個 `db` 函式呼叫 `_get_conn()` 再 `close()`。一次頁面請求可能開關三到四次連線。
為何接受：這個重複讓每個函式都是自足的，讀者不需要理解連線的生命週期。
修補方向：Flask 的 `g` 物件加 `teardown_appcontext`。約 2 小時。

**KI-24 — 軟刪除的報修單無法還原**
描述：`is_deleted = 1` 之後，沒有任何介面可以把它改回 0。`list_all_requests()` 也不提供檢視已刪除的選項。
影響：誤刪等同永久遺失（雖然資料還在）。相對地，會員管理有 `?status=deleted` 可以檢視已刪除的帳號。**同一個系統裡兩張表的軟刪除有不同的可見性，這個不一致本身就是教材。**
修補方向：`list_all_requests` 增加 `status='deleted'` 選項與 `restore_request()`。約 1.5 小時。

**KI-25 — 所有時間為 UTC，畫面直接顯示未轉時區** ⚠️
描述：所有時間戳都由 SQLite 的 `datetime('now')` 產生，它回傳的是 **UTC**。模板直接把字串印出來，沒有任何轉換。
影響：在台灣使用時，畫面上的每一個時間都比實際時間**慢 8 小時**。剛送出的報修單會顯示成早上，使用者會直覺認為系統壞了。這是本章中**唯一一條使用者一眼就會發現**的缺陷。
為何接受：修補涉及一個真實的設計選擇——是在資料庫存本地時間，還是存 UTC 而在呈現層轉換——而這個選擇值得學生自己做一次。
修補方向：兩條路。快解法是把所有 `datetime('now')` 改為 `datetime('now', 'localtime')`，10 分鐘，但資料庫從此綁定伺服器時區，跨時區部署會出錯。正解是保留 UTC 儲存，在 Jinja2 中註冊一個轉換 filter，約 1.5 小時。
> 建議在課堂上先讓學生看到這個現象，再問「這應該在哪一層修」。這是把「資料的表示」與「資料的呈現」分開的最好例子。

**KI-26 — 文字欄位無長度上限**
描述：報修標題、故障情形、回覆內容、退件原因都沒有長度檢查，資料表也沒有約束。
影響：可寫入任意大小的內容，撐爆頁面或耗用磁碟。Jinja2 的自動跳脫已擋住 XSS，但沒有擋住資源耗用。
修補方向：Blueprint 加長度檢查，模板加 `maxlength`。30 分鐘。

### 12.4 使用者體驗與功能缺口

**KI-27 — 報修單無圖片附件**
描述：不能上傳照片。
影響：這是宿舍報修**最常被要求的功能**。「哪裡在漏水」用文字描述往往不如一張照片，維修人員得多跑一趟現場確認。
為何接受：檔案上傳需要處理儲存位置、檔名衝突、大小限制、型別驗證與惡意檔案，複雜度接近再做一個子系統。
修補方向：新增 `repair_attachments` 表 + `werkzeug.utils.secure_filename` + 靜態檔案服務。約 6 小時。

**KI-28 — 無通知機制**
描述：狀態改變不會通知申報人，申報人回覆也不會通知承辦人。所有人都必須自己回來看。
影響：報修單可能在「已完成」狀態放好幾天沒人知道。
修補方向：先做站內未讀標記（`users.last_seen_at` 對比 `requests.updated_at`），再考慮 email。站內約 3 小時。

**KI-29 — 清單無排序切換**
描述：兩個清單都固定 `updated_at DESC`。管理員無法依優先等級或申報時間排序，「最緊急的單」與「等最久的單」都找不出來。
修補方向：`?sort=` 參數搭配白名單對應到 `ORDER BY` 子句（**不可**直接把使用者輸入串進 SQL）。約 1.5 小時。

**KI-30 — 結案後無滿意度回饋**
描述：完成之後申報人只能重新開啟或什麼都不做，沒有「確認修好了」這個動作。系統無法區分「真的修好了」與「住戶懶得再回報」。
修補方向：新增 `satisfaction` 欄位與一條 `POST /repair/<id>/confirm` 路由。約 2 小時。

### 12.5 三項刻意做強的地方

以下三項是很容易寫漏、本系統刻意處理掉的地方。

**一：`POST /profile/update` 必須做帳號有效性檢查。**
理由見 §12.0——房號與電話是維修人員上門的依據，缺陷會外溢到當事人以外的人。
`tests/test_profile.py` 中的 `test_profile_update_rejects_disabled_user` 與 `test_profile_update_rejects_deleted_user_and_clears_session` 是這條檢查的迴歸防線。

**二：訊息字串全數納入測試資料檔。**
55 則訊息全部集中在 `tests/data/users.py`，不散落到各測試檔的斷言中。

**三：狀態轉移集中在資料層並強制寫入稽核紀錄。**
只記 `reviewed_by` 與 `reviewed_at` 兩個欄位的做法，留得住的只有「最後一次審核」，中間的歷程全部遺失。本系統改為每次轉移都寫入一筆 `repair_logs`，主檔只保留關鍵時間戳。

---

## 13. 測試策略

### 13.1 測試層級

只有一層：**以 Flask test client 進行的路由層整合測試**。不做單元測試，也不做瀏覽器端的 E2E 測試。

理由是本系統的每個路由都很薄（權限檢查 + 驗證 + 一次 db 呼叫 + redirect），從路由進入可以同時覆蓋 Blueprint 與 `db` 兩層，而測試本身仍然讀得懂。獨立測 `db` 函式會產生大量重複覆蓋。

例外是狀態機：`test_repair.py` 中有數個測試直接呼叫 `db.assign_request()` 等函式來**佈置前置狀態**（例如「先讓這張單變成 in_progress，再驗證取消會被擋下」）。這是把 db 函式當作測試的建構工具，不是在測它。

### 13.2 隔離機制

- **DB 隔離**：每個測試函式透過 `tmp_path` 建立獨立 SQLite 暫存檔，含完整種子資料，結束後自動清除
- **驗證碼**：透過 `client.session_transaction()` 直接寫入答案，繞過圖形產生
- **身分**：直接注入 `session['user_id']`，不走登入流程（登入流程本身由 `test_auth.py` 覆蓋）

### 13.3 Fixtures（`tests/conftest.py`）

| Fixture | 說明 |
|---|---|
| `app` | function scope；暫存 DB + 種子資料；`TESTING=True` |
| `client` | Flask test client（未登入） |
| `authed_client` | `session['user_id'] = 1`（住宿生 陳小明） |
| `admin_client` | `session['user_id'] = 2`（宿舍管理員） |
| `other_client` | `session['user_id'] = 3`（停用帳號，session 直接注入） |
| `staff_client` | `session['user_id'] = 4`（第二位管理員 王師傅） |

> **陷阱**：`authed_client`、`admin_client`、`other_client`、`staff_client` 都由 `client` 衍生，**同一個測試中同時請求兩個，拿到的是同一個物件**。需要兩個身分同時存在時（例如驗證完整生命週期），請用 `test_repair.py` 中的 `_client_as(app, user_id)` helper 自行建立。

> `other_client` 有三個用途：測「非本人、非管理員」的權限邊界（需先 `db.set_user_active(3, 1)`，否則會被第 2 層先攔下，測不到第 4 層）；測「停用中的管理員」是否被第 2 層攔下；測持有舊 session 的停用帳號在各路由的行為。

### 13.4 測試檔案與案例數

| 檔案 | 案例數 | 覆蓋重點 |
|------|:---:|---------|
| `test_auth.py` | 29 | 登入五種錯誤、申請帳號六種錯誤、住宿欄位的寫入與選填、驗證碼、登出 |
| `test_hub.py` | 15 | 訪客與登入雙模式、卡片可見性、內嵌登入、停用帳號的 session 清除 |
| `test_profile.py` | 12 | 唯讀與編輯模式、五個欄位的寫入、**帳號有效性檢查的迴歸防線**（2 個） |
| `test_admin.py` | 38 | 三層守門、篩選搜尋分頁、R1–R3 自我保護、報修單的保留行為 |
| `test_repair.py` | 94 | 見下 |
| **合計** | **188** | 執行時間約 2.7 秒 |

`test_repair.py` 的 94 個案例分為八組：

| 組 | 案例數 | 內容 |
|---|:---:|------|
| 權限守門 | 18 | 13 條路由的未登入行為（parametrize）、停用帳號、管理清單的角色守門 |
| 資料範圍權限 | 5 | 本人可看、他人不可看、管理員可看全部、不存在、已刪除 |
| 清單 | 12 | 只列自己的、狀態篩選、排序、分頁、管理清單的搜尋與計數 |
| 新增 | 12 | 預填、成功路徑、四個必填欄位（parametrize）、兩個列舉欄位、表單回填 |
| 修改 | 7 | 預填、成功、他人／管理員／非 pending 被擋、驗證 |
| 取消 | 6 | 兩個合法來源狀態、in_progress 被擋、他人與管理員被擋、狀態紀錄 |
| 回覆 | 6 | 本人、管理員、他人被擋、空內容、已結案被擋、updated_at 更新 |
| 狀態機與刪除 | 28 | 六條轉移各自的成功與失敗路徑、稽核軌跡、完整生命週期、級聯刪除 |

### 13.5 覆蓋原則

1. 測試函式命名 `test_<情境描述>`
2. 每個 Blueprint 對應一個測試檔
3. 覆蓋四類情境：正常流程、邊界條件、權限控制（未登入／住宿生／他人／管理員）、狀態機的不合法轉移
4. **被權限或狀態擋下的 POST 必須同時斷言資料庫沒有改變。** 只驗 302 無法區分「被擋下」與「執行成功後 redirect」——這在有狀態機的系統中特別重要，因為 redirect 目標往往相同
5. 斷言數量用**相對式**（`before` / `after`），不寫死絕對值——種子資料有 6 張報修單，測試拿到的不是空資料庫
6. `db.create_user()` 使用 bcrypt cost=10，測試中不應大量建立會員；`db.create_request()` 成本極低，分頁測試可放心建立十幾筆

### 13.6 已知的測試缺口

- **無併發測試**：KI-13 的競態無法用 test client 重現
- **無 CSS 與版面測試**：模板渲染只驗證關鍵字串存在，不驗證視覺
- **無 Docker 測試**：`docker compose up` 的行為未自動化驗證
- **時區未被斷言**：KI-25 的 UTC 顯示問題沒有任何測試會失敗——測試只比對時間欄位「非 NULL」或先後順序

### 13.7 執行測試

```bash
pytest                          # 全部 188 個
pytest tests/test_repair.py -v
pytest -k "lifecycle"           # 完整生命週期那一個
pytest -k "not admin"
```

---

## 14. 未來擴充建議

依「教學價值 ÷ 實作成本」排序：

| # | 擴充項目 | 帶進什麼新概念 | 成本 |
|---|---------|--------------|------|
| 1 | **加入「維修人員」第三種角色** | 角色粒度、權限矩陣從 2×N 變 3×N、「只能處理派給自己的單」這種**同時依賴角色與資料**的權限 | 中（約 6 小時） |
| 2 | 修正 KI-25（時區） | 資料的表示與呈現分離；這是全系統最小、最好講的一課 | 小 |
| 3 | 加入索引（KI-22）並用 `EXPLAIN QUERY PLAN` 觀察 | 查詢計畫、索引如何影響掃描方式 | 小 |
| 4 | 圖片附件（KI-27） | 檔案上傳、儲存策略、安全檢查 | 大 |
| 5 | 存取稽核（KI-11） | 權限與稽核的差別；個資保護的完整樣貌 | 中 |
| 6 | 站內通知（KI-28） | 未讀狀態的資料建模；推 vs 拉 | 中 |
| 7 | 報修統計報表 | 聚合查詢、`GROUP BY`、資料視覺化的入門 | 中 |
| 8 | CSRF 防護（KI-01） | 同源政策、token 的生命週期 | 中 |

第 1 項最值得做。它會逼學生面對一個目前被迴避的問題：`_can_view()` 目前只有兩種答案（本人 or 管理員），加入第三種角色後，「王師傅能不能看 A 棟 301 的單」的答案變成「要看那張單是不是派給他的」——權限第一次同時依賴使用者與資料兩邊。這正是真實系統中最常見、也最容易寫錯的一類權限。

---

## 附錄 A：詞彙表（英中對照）

| English | 中文 | 本系統中的具體所指 |
|---------|------|------------------|
| soft delete | 軟刪除／邏輯刪除 | `is_deleted = 1` |
| master / detail | 主檔／明細 | `repair_requests` / `repair_logs` |
| state machine | 狀態機 | §7 的六個狀態與七條轉移 |
| transition | 轉移 | `db/repair.py` 的六個函式 |
| terminal state | 終態 | `completed`、`rejected`、`cancelled` |
| audit trail | 稽核軌跡 | `log_type = 'status'` 的紀錄 |
| row-level permission | 資料範圍權限 | `_can_view(user, req)` |
| snapshot vs reference | 快照 vs 參照 | 報修單自存 `room_no`，而非 JOIN `users` |
| POST-Redirect-GET | — | 所有成功的 POST 都以 redirect 結束 |
| condition pushdown | 條件下推 | 把狀態判斷寫進 SQL 的 `WHERE` |
| optimistic concurrency | 樂觀併發控制 | KI-13 的修補方向 |
| seed data | 種子資料 | 4 個帳號 + 6 張報修單 |
