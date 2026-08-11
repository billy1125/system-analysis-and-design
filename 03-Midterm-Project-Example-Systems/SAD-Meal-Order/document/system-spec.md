# 校園訂餐系統 — 系統規格書

## 0. 文件資訊

| 項目 | 內容 |
|------|------|
| 文件名稱 | 校園訂餐系統 系統規格書 |
| 版本 | v1.0 |
| 日期 | 2026-08-11 |
| 適用讀者 | 修習系統分析與設計課程的學生、後續維護此專案的開發者 |
| 系統版本 | 校園訂餐系統 v1.0 |

### 0.1 文件定位

本專案的文件分為四層，各自回答不同的問題。撰寫或閱讀時請先確認自己需要的是哪一層：

| 文件 | 回答的問題 |
|------|-----------|
| `document/system-spec.md`（本文件） | 這個系統**是什麼**：功能、資料、規則、限制 |
| `document/build-guide.md` | 這個系統**怎麼建**：從空目錄到可執行的分階段步驟與驗收方式 |
| `CLAUDE.md`、各子目錄的 `CLAUDE.md` | AI 助理與開發者**怎麼協作**：專案速查、模組職責 |
| `rules/flask-blueprint.md`、`rules/database.md` | 寫程式時**要遵守什麼**：路由、表單、SQL、CSS 的具體慣例 |
| `document/auth.md`、`hub.md`、`profile.md`、`admin.md`、`meal.md` | 單一子系統的**細部行為**：資料流、錯誤情境、畫面欄位 |

本文件是其他文件的上位依據。當本文件與其他文件衝突時，以本文件為準，並回頭修正衝突的那一份。

---

## 1. 專案定位與範圍

### 1.1 系統目的

本系統是一套以**學習與可理解性為優先**的校園訂餐系統，用於系統分析與設計課程的教學。
它刻意維持小規模、不做過度抽象，讓學生能在一到兩小時內讀完全部程式碼，並看清楚
「使用者在瀏覽器上的一個動作」如何一路走到資料庫、再走回畫面。

系統提供五件事：讓訪客申請帳號並登入、讓會員查看與修改自己的資料、讓管理員治理所有
會員帳號、讓任何人瀏覽今日菜單、讓會員線上訂餐並由管理員審核。

前三件構成一條完整的**帳號生命週期**；後兩件是本系統的核心，示範一個真正的**交易型業務子系統**——它有主檔／明細、
有狀態機、有需要維持一致的庫存。

會員系統與業務子系統的組合，讓「帳號狀態變化的後果」變得可以觀察：一個被停用的帳號
能不能繼續下單？這個問題只有在有業務子系統時才問得出來，而它的答案會直接影響到別人
（被佔用的份數就是別人訂不到的份數）。

### 1.2 範圍

**範圍內：**

- Hub 首頁（訪客瀏覽 + 內嵌登入表單；登入後的服務入口）
- 身分驗證（登入、申請帳號、登出、圖形驗證碼）
- 個人資料（本人查看與編輯姓名、顯示名稱）
- 會員管理（管理員專用：會員清單、篩選、搜尋、分頁、啟用／停用、角色調整、軟刪除）
- 訂餐（菜單瀏覽、餐點管理、線上訂餐、訂單審核、庫存扣減與回補）
- 健康檢查端點
- 上述功能的自動化測試
- Docker 容器化部署設定

**範圍外（明確不包含）：**

- 帳號生命週期與訂餐以外的業務子系統
- 線上金流與付款（訂單只記錄金額，不處理收付）
- 每日庫存自動重設（`remaining_quantity` 由管理員手動調整，見 KI-M7）
- 通知（email、簡訊、站內信）

### 1.4 名詞定義

| 名詞 | 定義 |
|------|------|
| 會員（user） | `users` 表中的一筆紀錄。訪客申請帳號後即成為會員 |
| 訪客（guest） | 沒有有效 session 的瀏覽者。可瀏覽首頁與菜單、可申請帳號，不能訂餐 |
| 角色（role） | 整數欄位。`0` = 管理員，`1` = 一般使用者 |
| 啟用／停用（`is_active`） | `1` = 啟用，`0` = 停用。停用帳號無法登入，也無法下單 |
| 軟刪除（`is_deleted`） | `1` = 已刪除。系統**不執行實體 DELETE**，刪除只是把旗標設為 1 |
| 帳號可用（usable） | `utils._is_usable(user)`：使用者存在、`is_active` 為真、`is_deleted` 為假 |
| 餐點（meal） | `meals` 表中的一筆紀錄。菜單上的一道菜 |
| 訂單（order） | `meal_orders` 表中的一筆紀錄。一次訂餐行為的抬頭 |
| 訂單明細（order item） | `meal_order_items` 表中的一筆紀錄。一張訂單中的一道餐點與份數 |
| 每日供應份數（`daily_quantity`） | 一道餐點當日可供應的總份數 |
| 剩餘份數（`remaining_quantity`） | 扣掉已確認訂單後還能訂的份數 |
| 價格快照（`unit_price`） | 明細記錄的下單當下單價，不隨菜單調價變動 |
| 庫存佔用 | `remaining_quantity` 被扣減的狀態。**只發生在 `confirmed` 訂單** |
| 主檔／明細（master / detail） | 一對多的資料表配對。本系統有 `meal_orders` / `meal_order_items` 一組 |
| 種子帳號（seed user） | 資料庫初次建立時自動植入的三個示範帳號 |

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

**不用 ORM（如 SQLAlchemy）。** 所有資料存取都是手寫的參數化 SQL，集中在 `db/` 套件內。
理由是讓學生直接看到 SQL 語句本身，理解「一次查詢對應一次資料庫往返」。訂餐子系統
特別受益於此——`confirm_meal_order()` 的「重新查份數 → 檢查 → 扣減」三步全部攤在眼前，
換成 ORM 的話這段邏輯會被物件的髒資料追蹤機制遮掉一半。代價是重複的
`_get_conn()` / `close()` 樣板，記錄於 KI-10。

**不用前端框架（如 React、Vue）。** 全部採伺服器端渲染。訂餐表單刻意不做「購物車」
的前端狀態——所有份數都在同一張表單上，一次 POST 送出。理由是讓「表單送出 → 路由處理
→ 重新渲染」這條迴圈完整可見。代價是無法即時顯示小計，記錄於 KI-M8。

**不用 Flask-Login。** 身分狀態就是 `session['user_id']` 一個整數。權限檢查是
`utils.login_required` 這個 12 行的裝飾器加上兩個 helper 函式。

**不用資料庫外鍵約束（FOREIGN KEY）。** 四張表之間的關聯全靠應用層維持。SQLite 預設
不啟用外鍵檢查，本系統也不啟用。理由是軟刪除與外鍵約束的語意會打架——`meals` 被軟刪除
後，指向它的訂單明細應該繼續存在。代價是可以寫入指向不存在 id 的資料，記錄於 KI-13。

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
app.py                         建立 Flask app、註冊 5 個 Blueprint、設定 secret_key
  │
  ▼
blueprints/<name>/__init__.py  路由、表單處理、權限檢查、表單驗證
  │                            （不寫任何 SQL）
  ├──▶ utils.py                跨子系統共用：login_required、_is_usable、_gen_captcha
  │
  ▼
db/                            資料存取層。所有 SQL 集中於此，狀態機與庫存規則也在這裡
  │  db/__init__.py            DB_PATH、公開函式匯出、init_db()
  │  db/connection.py          _get_conn()
  │  db/users.py               users 表的所有存取函式
  │  db/meals.py               meals / meal_orders / meal_order_items 三表
  ▼
SQLite（database.db，WAL 模式）
```

回傳路徑：Blueprint 取得資料後呼叫 `render_template()`，Jinja2 以
`templates/<blueprint>/*.html` 渲染出完整 HTML 回傳瀏覽器。

### 3.2 模組邊界三原則

1. **SQL 只寫在 `db/` 套件內。** Blueprint 一律透過 `db.<函式名>()` 存取資料，
   不得出現 `sqlite3` 或 SQL 字串
2. **Blueprint 不互相 import。** 子系統之間只透過 `url_for('<blueprint>.<endpoint>')` 建立關聯
3. **`utils.py` 只放與任何子系統都無關的 helper。** 特別是 `_is_admin()` **不得**放進
   `utils.py`，各 Blueprint 自行定義

### 3.3 業務規則放在哪一層

本系統有兩類規則，放的位置不同，這個劃分是訂餐子系統最重要的架構決策：

| 類型 | 例子 | 放在哪 | 為什麼 |
|------|------|--------|--------|
| **輸入驗證** | 日期格式、取餐地點非空、總份數上限 20 | Blueprint（`_validate_*`） | 只跟這一次表單提交有關，失敗時要把使用者填的內容原樣退回畫面 |
| **資料完整性 / 狀態不變量** | 訂單狀態轉移是否合法、庫存夠不夠、扣減與回補 | **資料層**（`db/meals.py`） | 判斷所依據的事實（訂單狀態、剩餘份數）可能在使用者看到畫面之後被別人改掉 |

具體表現：Blueprint 的 `admin_confirm()` **不檢查**訂單是不是 `pending`，它只呼叫
`db.confirm_meal_order()` 並把回傳的 `True` / `False` 翻成 flash 訊息。狀態檢查寫在
資料層函式開頭的 `SELECT ... AND order_status = 'pending'` 裡。

樣板則做**第三次**檢查——但那是為了決定按鈕要不要顯示，不是安全邊界。三個位置的職責：

| 位置 | 職責 | 被繞過的後果 |
|------|------|-------------|
| 樣板 `{% if %}` | 按鈕顯不顯示 | 無（使用者看到不能按的按鈕） |
| Blueprint `_validate_*` | 輸入合不合法 | 髒資料寫入 |
| 資料層 `SELECT ... AND status = ?` | 資料能不能改 | **狀態機被破壞、庫存超賣** |

### 3.4 目錄結構

```text
sad-meal-order/
├── app.py                        # 主程式：組裝 Blueprint、啟動伺服器
├── utils.py                      # 跨 Blueprint 共用 helpers
├── pytest.ini                    # 限定 testpaths
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
│   ├── meals.py                  # 三張訂餐資料表的存取、狀態機、庫存規則
│   └── CLAUDE.md
│
├── blueprints/
│   ├── __init__.py
│   ├── auth/{__init__.py, CLAUDE.md}
│   ├── hub/{__init__.py, CLAUDE.md}
│   ├── profile/{__init__.py, CLAUDE.md}
│   ├── admin/{__init__.py, CLAUDE.md}
│   └── meal/{__init__.py, CLAUDE.md}
│
├── templates/
│   ├── base.html
│   ├── auth/{login.html, register.html}
│   ├── hub/home.html
│   ├── profile/dashboard.html
│   ├── admin/{user_list.html, user_detail.html}
│   └── meal/{index.html, meal_form.html, order_form.html,
│             my_orders.html, order_detail.html, admin_orders.html}
│
├── static/{common.css, login.css, hub.css, profile.css, admin.css, meal.css}
│
├── tests/
│   ├── conftest.py, CLAUDE.md
│   ├── data/{__init__.py, users.py}
│   └── test_{auth,hub,profile,admin,meal}.py
│
├── rules/{flask-blueprint.md, database.md}
│
├── document/
│   ├── system-spec.md            # 本文件
│   ├── build-guide.md
    └── {auth,hub,profile,admin,meal}.md
```

### 3.5 Blueprint 職責

| Blueprint | url_prefix | 職責 | 路由數 |
|-----------|-----------|------|:--:|
| `hub` | — | 服務入口頁；訪客可瀏覽並內嵌登入 | 1 |
| `auth` | — | 登入、申請帳號、登出、驗證碼圖片 | 4 |
| `profile` | — | 本人的個人資料檢視與編輯 | 2 |
| `admin` | `/admin` | 會員帳號治理 | 6 |
| `meal` | `/meal` | 菜單、餐點管理、訂餐、訂單審核 | 14 |

### 3.6 請求生命週期與 session

1. 瀏覽器送出 request，附上簽章過的 session cookie
2. Flask 解出 `session`，其中可能有 `user_id`
3. `@login_required` 檢查 `user_id` 是否存在
4. 路由或 `_current_user()` 以 `db.find_user_by_id()` 取回完整使用者
5. `_is_usable(user)` 判斷帳號是否仍然有效——**每個 request 都重新判斷**，不快取
6. 路由處理業務邏輯，呼叫 `db.*`
7. `render_template()` 或 `redirect()`

第 5 步是關鍵：session 只存 `user_id`，不存角色或啟用狀態。管理員停用一個帳號後，
該帳號的**下一個 request** 就會被擋下，不需要等 session 過期。

---

## 4. 角色與權限

### 4.1 角色

| `role` | 身份 | 權限 |
|:--:|------|------|
| `0` | 管理員 | 一般使用者的全部權限，加上：會員管理（檢視所有會員含已刪除、啟用／停用、調整角色、軟刪除）、餐點管理（新增、修改、下架）、訂單審核（確認、拒絕、登記取餐、代為取消所有人的訂單） |
| `1` | 一般使用者 | 查看與編輯自己的個人資料；瀏覽菜單；訂餐；檢視、修改、取消**自己的**訂單 |

新申請的帳號一律為 `role = 1`。系統沒有「申請成為管理員」的途徑，只能由既有管理員指定。

### 4.2 帳號狀態矩陣

| `is_active` | `is_deleted` | 可登入 | 可瀏覽菜單 | 可訂餐 | 管理員可見 |
|:--:|:--:|:--:|:--:|:--:|:--:|
| 1 | 0 | ✅ | ✅ | ✅ | ✅ |
| 0 | 0 | ❌ 帳號已停用 | ✅（以訪客身分） | ❌ | ✅ |
| 1 | 1 | ❌ 帳號或密碼錯誤 | ✅（以訪客身分） | ❌ | ✅（篩選「已刪除」） |
| 0 | 1 | ❌ 帳號或密碼錯誤 | ✅（以訪客身分） | ❌ | ✅ |

> 停用與已刪除給出**不同的登入錯誤訊息**是刻意的：停用是可逆的管理動作，告訴使用者
> 「你的帳號被停用了」有助於他去申訴；已刪除則退回通用的「帳號或密碼錯誤」，
> 不洩漏「這個 email 曾經存在」。

### 4.3 權限矩陣

| 操作 | 訪客 | 一般使用者 | 管理員 |
|------|:--:|:--:|:--:|
| 瀏覽首頁 | ✅ | ✅ | ✅ |
| 申請帳號 | ✅ | — | — |
| 瀏覽菜單與價格 | ✅ | ✅ | ✅ |
| 檢視個人資料 | ❌ | ✅（自己） | ✅（自己） |
| 訂餐 | ❌ | ✅ | ✅ |
| 檢視訂單 | ❌ | ✅（自己的） | ✅（所有人的） |
| 修改訂單 | ❌ | ✅（自己的、限 pending） | ❌（管理員不代改內容） |
| 取消訂單 | ❌ | ✅（自己的、限 pending/confirmed） | ✅（所有人的） |
| 確認／拒絕訂單 | ❌ | ❌ | ✅ |
| 登記取餐 | ❌ | ❌ | ✅ |
| 新增／修改／下架餐點 | ❌ | ❌ | ✅ |
| 會員管理 | ❌ | ❌ | ✅ |

> **管理員可以取消別人的訂單，但不能修改別人的訂單內容。** 這個不對稱是刻意的：
> 取消是「不做這筆生意」，語意明確且對訂購人無害（庫存會回補）；修改內容則是
> 「替他決定要吃什麼」，那不是管理員該做的事。若廚房需要調整，正確做法是取消
> 並請訂購人重訂。

### 4.4 三層檢查機制

需要登入的路由，檢查分三層，**順序固定不可調換**：

```
1. @login_required        無 session   -> redirect auth.login_page
2. _is_usable(user)       帳號失效     -> session.clear() + redirect auth.login_page
3. _is_admin(user)        role != 0    -> flash 無操作權限 + redirect hub.home
```

第 2 層失敗代表**身分本身失效**，處置是登出；第 3 層失敗代表**身分有效但權限不足**，
處置是導回首頁。若把第 3 層放前面，已被停用的管理員會收到與事實不符的「權限不足」，
且 session 不會被清除。

`_is_admin(user)` 為各 Blueprint 內部 helper（**非 `utils.py`**），判斷邏輯統一為
`user['role'] == 0`。這三層在每個需要管理員權限的路由開頭**明碼重複寫出**，
不抽象成裝飾器——這個重複是刻意的教學設計，讀者從任一路由的第一行就能讀出完整的
守門條件。

#### 開放瀏覽的子系統

`meal` 有開放給訪客的路由（`GET /meal/`），因此它把第 1、2 層收斂進 `_current_user()`：

```python
def _current_user():
    if 'user_id' not in session:
        return None
    user = db.find_user_by_id(session['user_id'])
    return user if _is_usable(user) else None
```

`index` 把 `None` 當成合法的訪客狀態繼續渲染；其餘會員端路由收到 `None` 時
`session.clear()` + redirect。**不把 `session.clear()` 塞進 helper**——訪客與失效帳號
在它眼中都是 `None`，但只有後者需要清 session。

`meal` 的管理端路由（`new_meal`、`edit_meal`、`delete_meal`、`admin_*`）**不**使用
`_current_user()`，而是與 `admin` 一樣明碼寫出三層。這個不一致是刻意的，理由見
[`blueprints/meal/CLAUDE.md`](../blueprints/meal/CLAUDE.md)。

#### 各路由需要的層級

| 路由群 | 需要的層級 |
|--------|-----------|
| `GET /`、`GET /meal/`、`/login`、`/register`、`/captcha.png`、`/health` | 無 |
| `/profile` | 1 + 2 |
| `/profile/update` | 1（**缺 2，見 KI-03**） |
| `/meal/order/new`、`/meal/my-orders`、`/meal/orders/*` | 1 + 2 |
| `/admin/*`、`/meal/new`、`/meal/edit/*`、`/meal/delete/*`、`/meal/admin/*` | 1 + 2 + 3 |

### 4.5 自我保護規則與「最後一個管理員」

管理員對自己的帳號受三條規則限制：

| 規則 | 內容 | 訊息 |
|------|------|------|
| R1 | 不可停用自己 | `不可停用自己的帳號` |
| R2 | 不可刪除自己 | `不可刪除自己的帳號` |
| R3 | 不可修改自己的角色 | `不可修改自己的角色` |

由這三條可推得：任何管理動作完成後，執行者仍是一個啟用、未刪除、`role=0` 的帳號，
因此系統中永遠至少有一個可用的管理員，「最後一個管理員被鎖死」的狀態不可達。
系統因此**不實作管理員計數檢查**。

> ⚠️ 若未來放寬 R1–R3 任何一條，必須立即補上「操作後啟用中管理員數 ≥ 1」的檢查，
> 否則系統可被鎖死且無法從介面復原。

---

## 5. 功能需求

編號規則：`FR-<子系統>-<序號>`。

### 5.1 首頁（FR-HUB）

| ID | 需求 |
|----|------|
| FR-HUB-01 | 訪客進入 `/` 時，顯示可瀏覽的服務卡片與右側登入表單 |
| FR-HUB-02 | 訪客視圖中「今日菜單」為可點擊的 `<a>`；「我的訂單」「個人資料」「訂單管理」「會員管理」為 locked `<div>` |
| FR-HUB-03 | 訪客可在首頁直接登入（驗證順序與訊息與 `/login` 完全相同） |
| FR-HUB-04 | 已登入者顯示歡迎訊息與服務卡片；管理員多出「訂單管理」與「會員管理」兩張 |
| FR-HUB-05 | 持有失效帳號 session 者，清除 session 後退回訪客視圖，**不 redirect** |
| FR-HUB-06 | 使用者名稱顯示優先順序：`name` → `display_name` → `email` |

### 5.2 身分驗證（FR-AUTH）

| ID | 需求 |
|----|------|
| FR-AUTH-01 | `GET /login` 顯示登入表單，含圖形驗證碼 |
| FR-AUTH-02 | `POST /login` 依序驗證：驗證碼非空 → 驗證碼正確 → 帳密非空 → 帳號存在且未刪除且密碼正確 → 帳號啟用 |
| FR-AUTH-03 | 登入成功後更新 `last_login_at`、寫入 `session['user_id']`、redirect `/` |
| FR-AUTH-04 | 已登入者存取 `/login` 或 `/register` 一律 redirect `/` |
| FR-AUTH-05 | `POST /register` 依序驗證：email 與密碼非空 → email 格式 → 密碼至少 8 字元 → 兩次密碼一致 → email 未被使用 |
| FR-AUTH-06 | 申請成功後 flash `申請成功，請登入` 並 redirect `/login`；新帳號 `role = 1`、`is_active = 1` |
| FR-AUTH-07 | `GET /captcha.png` 產生 5 位大寫字母數字圖片，答案寫入 `session['captcha']` |
| FR-AUTH-08 | `GET /logout` 清除整個 session 並 redirect `/login` |

### 5.3 個人資料（FR-PROFILE）

| ID | 需求 |
|----|------|
| FR-PROFILE-01 | `GET /profile` 顯示本人的 email、姓名、顯示名稱、身份、建立日期、最後登入 |
| FR-PROFILE-02 | `?edit=1` 進入編輯模式，可修改姓名與顯示名稱 |
| FR-PROFILE-03 | `POST /profile/update` 更新後 redirect `/profile` |
| FR-PROFILE-04 | email、角色、建立日期、最後登入**不可**由本人修改 |

### 5.4 會員管理（FR-ADMIN）

| ID | 需求 |
|----|------|
| FR-ADMIN-01 | `GET /admin/users` 分頁列出會員；`?status=` `?q=` `?page=` 三者可組合 |
| FR-ADMIN-02 | `status` 支援 `all` / `active` / `disabled` / `deleted`，非法值視同 `all` |
| FR-ADMIN-03 | `q` 對 email、姓名、顯示名稱做 LIKE 模糊搜尋 |
| FR-ADMIN-04 | `GET /admin/users/<id>` 顯示單一會員明細與可執行的操作 |
| FR-ADMIN-05 | 啟用／停用／調整角色／軟刪除四個動作皆為 `POST`，完成後 redirect 清單頁並 flash |
| FR-ADMIN-06 | 對已刪除的帳號執行任何動作皆拒絕，flash `該帳號已刪除，無法操作` |
| FR-ADMIN-07 | 遵守 R1–R3 自我保護規則 |

### 5.5 訂餐（FR-MEAL）

**菜單與餐點管理**

| ID | 需求 |
|----|------|
| FR-MEAL-01 | `GET /meal/` 開放所有人瀏覽；左欄分頁列出未下架的餐點，右欄依 `?meal_id=` 顯示詳細 |
| FR-MEAL-02 | 支援 `?category=` 篩選（`main` / `side` / `drink`），非法值視同不篩選 |
| FR-MEAL-03 | 清單顯示編號、名稱、分類、單價、剩餘／供應份數、供應狀態 |
| FR-MEAL-04 | 訪客看不到「我要訂餐」入口；一般使用者看不到餐點管理按鈕 |
| FR-MEAL-05 | 管理員可新增餐點，欄位：編號、名稱、說明、分類、單價、每日供應份數、剩餘份數、供應狀態 |
| FR-MEAL-06 | 管理員可修改餐點的所有欄位 |
| FR-MEAL-07 | 管理員可下架餐點（軟刪除）。已下架的餐點消失於菜單與訂餐表單，但**既有訂單明細保留** |

**訂餐**

| ID | 需求 |
|----|------|
| FR-MEAL-08 | `GET /meal/order/new` 列出所有可訂餐點（供應中且剩餘份數 > 0）與份數輸入欄 |
| FR-MEAL-09 | 訂單抬頭欄位：取餐日期、取餐時段（午餐／晚餐）、取餐地點、訂單備註 |
| FR-MEAL-10 | 可預訂範圍為今天起算 7 天內（含今天） |
| FR-MEAL-11 | 至少須訂購一項；單張訂單總份數上限 20 |
| FR-MEAL-12 | 每項份數不得超過該餐點的剩餘份數；餐點須為供應中 |
| FR-MEAL-13 | 單價一律由伺服器從資料庫重新查詢，**不採用表單傳來的任何價格** |
| FR-MEAL-14 | 明細記錄 `unit_price` 快照與 `subtotal`；主檔的 `total_amount` 由資料層依明細算出 |
| FR-MEAL-15 | 新建訂單狀態為 `pending`，**不扣減庫存** |
| FR-MEAL-16 | 建立成功後 flash 並 redirect 該訂單的明細頁 |
| FR-MEAL-17 | 沒有任何可訂餐點時，表單顯示說明訊息而非空白表格 |

**我的訂單**

| ID | 需求 |
|----|------|
| FR-MEAL-18 | `GET /meal/my-orders` 分頁列出本人訂單，依建立時間降冪 |
| FR-MEAL-19 | `GET /meal/orders/<id>` 顯示訂單抬頭、明細、總金額；**僅本人或管理員**可看 |
| FR-MEAL-20 | 明細中已下架的餐點仍顯示其名稱與金額；僅在 `meal_id` 指向不存在的資料時顯示「（餐點已下架）」 |
| FR-MEAL-21 | `pending` 訂單可修改：欄位與訂餐表單相同，明細採全部軟刪除後重新寫入 |
| FR-MEAL-22 | 修改表單列出「目前可訂的餐點」聯集「這張訂單已經點的餐點」，後者若已不可訂則標示提示 |
| FR-MEAL-23 | `pending` 或 `confirmed` 訂單可由本人取消；`confirmed` 取消時回補庫存 |
| FR-MEAL-24 | 終端狀態（`completed` / `cancelled` / `rejected`）不可修改或取消 |

**訂單審核**

| ID | 需求 |
|----|------|
| FR-MEAL-25 | `GET /meal/admin/orders` 分頁列出所有訂單；`?status=` 可篩選 |
| FR-MEAL-26 | 確認訂單（限 `pending`）：重新檢查每項餐點未下架、狀態為供應中、份數足夠，全部通過才扣減庫存並轉為 `confirmed` |
| FR-MEAL-27 | 任一項不足即**整張退回**，不做部分確認，且不得扣減任何一項 |
| FR-MEAL-28 | 拒絕訂單（限 `pending`）：轉為 `rejected`，不動庫存 |
| FR-MEAL-29 | 登記取餐（限 `confirmed`）：轉為 `completed`，**不回補庫存** |
| FR-MEAL-30 | 管理員可代為取消 `pending` 或 `confirmed` 訂單，庫存規則同 FR-MEAL-23 |
| FR-MEAL-31 | 確認與拒絕可附審核備註，記錄 `reviewed_by` 與 `reviewed_at` |

### 5.6 其他

| ID | 需求 |
|----|------|
| FR-SYS-01 | `GET /health` 回傳 `200 OK` |
| FR-SYS-02 | `db.init_db()` 在資料表為空時植入三個種子帳號、六道種子餐點、四張種子訂單 |

---

## 6. 資料模型

### 6.1 概觀

四張表：

```text
users ──1:N──> meal_orders ──1:N──> meal_order_items ──N:1──> meals
  │              (orderer_id)         (meal_order_id)          (meal_id)
  └──0:1──────────┘
     (reviewed_by)
```

`meal_order_items` 是一張**帶屬性的關聯表**：它同時指向訂單與餐點，並額外攜帶
`quantity`、`unit_price`、`subtotal` 三個只屬於「這張訂單訂了這道餐點」這件事的欄位。

**沒有任何 FOREIGN KEY 約束。** 關聯全靠應用層維持，理由見 §2.2，代價見 KI-13。

### 6.2 為何訂單要拆成兩張表

一張訂單可以有多個品項，品項數不固定。若把品項塞進 `meal_orders` 的單一欄位
（例如 JSON 字串或逗號分隔），會失去三件事：

1. **無法用 SQL 查詢**「A01 這道菜今天總共被訂了幾份」
2. **無法逐項記錄狀態與價格**（`unit_price` 是每一項各自的快照）
3. **無法 JOIN 回 `meals`** 取得名稱與分類，只能在應用層拼裝

這是主檔／明細的典型判準：**當「一筆記錄可以有 N 個子項目，且 N 不固定、子項目本身
有屬性」時，就要拆表。**

### 6.3 `users` 表 DDL

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

### 6.4 `meals` 表 DDL

```sql
CREATE TABLE IF NOT EXISTS meals (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    meal_name          TEXT    NOT NULL,
    meal_code          TEXT    NOT NULL,
    meal_description   TEXT,
    category           TEXT    NOT NULL DEFAULT 'main',
    price              INTEGER NOT NULL DEFAULT 0,
    daily_quantity     INTEGER NOT NULL DEFAULT 0,
    remaining_quantity INTEGER NOT NULL DEFAULT 0,
    meal_status        TEXT    NOT NULL DEFAULT 'available',
    created_at         TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at         TEXT    NOT NULL DEFAULT (datetime('now')),
    is_deleted         INTEGER NOT NULL DEFAULT 0
);
```

### 6.5 `meal_orders` 表 DDL

```sql
CREATE TABLE IF NOT EXISTS meal_orders (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    orderer_id      INTEGER NOT NULL,
    pickup_date     TEXT    NOT NULL,
    pickup_slot     TEXT    NOT NULL,
    pickup_location TEXT    NOT NULL,
    order_note      TEXT,
    total_amount    INTEGER NOT NULL DEFAULT 0,
    order_status    TEXT    NOT NULL DEFAULT 'pending',
    reviewed_by     INTEGER,
    reviewed_at     TEXT,
    review_note     TEXT,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    is_deleted      INTEGER NOT NULL DEFAULT 0
);
```

### 6.6 `meal_order_items` 表 DDL

```sql
CREATE TABLE IF NOT EXISTS meal_order_items (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    meal_order_id INTEGER NOT NULL,
    meal_id       INTEGER NOT NULL,
    quantity      INTEGER NOT NULL,
    unit_price    INTEGER NOT NULL,
    subtotal      INTEGER NOT NULL,
    item_status   TEXT    NOT NULL DEFAULT 'pending',
    created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    is_deleted    INTEGER NOT NULL DEFAULT 0
);
```

### 6.7 欄位字典（訂餐相關）

**`meals`**

| 欄位 | 型別 | 允許 NULL | 說明 |
|------|------|:--:|------|
| `id` | INTEGER | ❌ | 主鍵 |
| `meal_code` | TEXT | ❌ | 餐點編號（A01、B01…）。**未加 UNIQUE**，見 KI-M2 |
| `meal_name` | TEXT | ❌ | 餐點名稱 |
| `meal_description` | TEXT | ✅ | 說明 |
| `category` | TEXT | ❌ | `main` / `side` / `drink` |
| `price` | INTEGER | ❌ | 單價，整數新台幣元 |
| `daily_quantity` | INTEGER | ❌ | 每日供應總份數 |
| `remaining_quantity` | INTEGER | ❌ | 目前剩餘份數，恆 ≤ `daily_quantity` |
| `meal_status` | TEXT | ❌ | `available` / `sold_out` / `unavailable` |
| `created_at` / `updated_at` | TEXT | ❌ | 時間戳 |
| `is_deleted` | INTEGER | ❌ | 軟刪除旗標 |

**`meal_orders`**

| 欄位 | 型別 | 允許 NULL | 說明 |
|------|------|:--:|------|
| `id` | INTEGER | ❌ | 主鍵 |
| `orderer_id` | INTEGER | ❌ | 訂購人，對應 `users.id` |
| `pickup_date` | TEXT | ❌ | `YYYY-MM-DD` |
| `pickup_slot` | TEXT | ❌ | `lunch` / `dinner` |
| `pickup_location` | TEXT | ❌ | 取餐地點，自由文字 |
| `order_note` | TEXT | ✅ | 訂單備註 |
| `total_amount` | INTEGER | ❌ | 總金額，衍生自明細 |
| `order_status` | TEXT | ❌ | 五個狀態之一 |
| `reviewed_by` | INTEGER | ✅ | 審核的管理員，對應 `users.id` |
| `reviewed_at` | TEXT | ✅ | 審核時間 |
| `review_note` | TEXT | ✅ | 審核備註 |
| `created_at` / `updated_at` | TEXT | ❌ | 時間戳 |
| `is_deleted` | INTEGER | ❌ | 軟刪除旗標。**目前沒有任何路由會把它設為 1**，見 KI-M9 |

**`meal_order_items`**

| 欄位 | 型別 | 允許 NULL | 說明 |
|------|------|:--:|------|
| `id` | INTEGER | ❌ | 主鍵 |
| `meal_order_id` | INTEGER | ❌ | 對應 `meal_orders.id` |
| `meal_id` | INTEGER | ❌ | 對應 `meals.id` |
| `quantity` | INTEGER | ❌ | 份數，恆 > 0（份數 0 者不寫入） |
| `unit_price` | INTEGER | ❌ | 下單當下的單價快照 |
| `subtotal` | INTEGER | ❌ | `unit_price × quantity` |
| `item_status` | TEXT | ❌ | 跟隨主檔的 `order_status` |
| `created_at` / `updated_at` | TEXT | ❌ | 時間戳 |
| `is_deleted` | INTEGER | ❌ | 軟刪除旗標。修改訂單時舊明細會被設為 1 |

### 6.8 為什麼價格用 INTEGER

以「元」為單位存整數，不用 `REAL`。金額用浮點數會產生 `0.1 + 0.2 != 0.3` 這類誤差，
而 `total_amount` 是明細 `subtotal` 的加總，誤差會累積——一張十個品項的訂單就可能
差到一塊錢，而且無法解釋。

代價：無法表示「95.5 元」。若未來需要，正確做法是改存「分」（乘以 100），而不是
改成浮點數。

### 6.9 為什麼明細要存 `unit_price`

| 欄位 | 語意 |
|------|------|
| `meals.price` | 這道菜**現在**多少錢 |
| `meal_order_items.unit_price` | 這張訂單下單**當時**多少錢 |

兩者是不同的事實。不存快照的話，管理員一次調價會讓所有歷史訂單的金額跟著變動，
昨天的帳今天對不起來。

`subtotal` 同理——它是 `unit_price × quantity`，理論上可以即時算出，但存下來讓
「訂單當時的計算結果」成為一個不可變的事實，而不是每次查詢重新推導。

這條規則的一般化：**跨時間有效的交易紀錄，要存下當時的值，不要只存指向主檔的參照。**

### 6.10 狀態機與庫存不變量

```text
pending ──confirm──> confirmed ──complete──> completed
   │                     │
   ├──reject──> rejected └──cancel──> cancelled
   └──cancel──> cancelled
```

**核心不變量：`meals.remaining_quantity` 只在 `confirmed` 狀態被佔用。**

| 轉移 | 觸發者 | 庫存 |
|------|--------|------|
| `pending` → `confirmed` | 管理員 | **扣減** |
| `pending` → `rejected` | 管理員 | 不動 |
| `pending` → `cancelled` | 訂購人或管理員 | 不動 |
| `confirmed` → `completed` | 管理員 | 不動 |
| `confirmed` → `cancelled` | 訂購人或管理員 | **回補** |

回補以 `MIN(remaining + qty, daily_quantity)` 封頂。

由不變量可推得的三個性質：

1. **不會超賣。** 扣減前重新檢查份數，不足則整張退回
2. **取消一定還原。** `confirmed → cancelled` 必然回補，且只回補一次（終端狀態不可再轉移）
3. **`remaining_quantity` 恆為 `daily_quantity` 減去所有 `confirmed` 訂單的份數總和**
   （除非管理員手動改過，見 KI-M7）

### 6.11 軟刪除策略與查詢過濾約定

所有刪除都是 `UPDATE ... SET is_deleted = 1`，**不執行 `DELETE`**（唯一例外
`hard_delete_user_by_email` 僅供測試清理）。

| 函式類別 | 是否過濾 `is_deleted` |
|----------|---------------------|
| 列表類（`list_meals`、`list_my_orders`、`list_all_orders`、`list_order_items`、`list_orderable_meals`） | ✅ 硬性過濾，無例外參數 |
| 單筆取得（`get_meal`、`get_meal_order`、`find_user_by_id`、`find_user_by_email`） | ❌ 不過濾，責任交給呼叫端 |
| 管理端清單（`list_users`） | 依 `status` 參數決定 |

單筆取得不過濾，是為了讓「不存在」與「已刪除」在資料層可區分，呼叫端才能給出不同的
錯誤訊息與 redirect 目標。所有例外都在 docstring 中明確標註。

**`list_order_items()` 的 `LEFT JOIN meals` 不帶 `is_deleted` 過濾。** 餐點被下架後，
既有訂單明細仍須顯示得出完整的名稱——訂單記錄的是「當時訂了什麼」。若把過濾條件塞進
JOIN，下架後所有歷史訂單的品項名稱會一起變成空白。

用 `LEFT JOIN` 而非 `JOIN`，則是為了防禦「沒有外鍵約束」（KI-13）的情況：`meal_id`
有可能指向一列根本不存在的資料，`JOIN` 會讓那筆明細整列消失，品項加總對不上
`total_amount`。樣板需自行處理 `meal_name` 為 `NULL` 的情況。

一般化的規則：**`is_deleted` 的過濾只出現在「查詢目前有效資料」的列表函式中，
不出現在「還原歷史事實」的關聯查詢中。**

### 6.12 種子資料

**種子帳號**（`db/users.py`，`users` 表為空時植入）

| id | email | 密碼 | role | is_active | name |
|:--:|-------|------|:--:|:--:|------|
| 1 | user@example.com | password123 | 1 | 1 | 一般使用者 |
| 2 | admin@example.com | admin1234 | 0 | 1 | 管理員 |
| 3 | disabled@example.com | disabled123 | 1 | 0 | （NULL） |

種子帳號使用 bcrypt cost=4（加速測試），註冊路徑使用 cost=10。

**種子餐點**（`db/meals.py`，`meals` 表為空時植入，**排在種子帳號之後**）

| id | 編號 | 名稱 | 分類 | 單價 | 供應 | 狀態 | 示範什麼 |
|:--:|------|------|------|-----:|-----:|------|---------|
| 1 | A01 | 雞腿便當 | main | 95 | 60 | available | 正常可訂 |
| 2 | A02 | 素食便當 | main | 75 | 40 | available | 被種子訂單 #3 佔用 2 份 |
| 3 | A03 | 排骨便當 | main | 90 | 50 | sold_out | 售完：**狀態檢查先於份數檢查** |
| 4 | A04 | 牛肉麵 | main | 130 | 30 | unavailable | 停售但仍有份數，擋下它的是狀態 |
| 5 | B01 | 燙青菜 | side | 25 | 80 | available | 附餐分類 |
| 6 | C01 | 古早味紅茶 | drink | 20 | 100 | available | 飲料分類 |

**種子訂單**（同上，覆蓋狀態機的四個可達狀態）

| id | 訂購人 | 狀態 | 品項 | 金額 | 示範什麼 |
|:--:|-------|------|------|-----:|---------|
| 1 | id=1 | completed | A01×1、C01×1 | 115 | 已結案，不可修改或取消 |
| 2 | id=1 | cancelled | A02×1 | 75 | 已取消 |
| 3 | id=3 | confirmed | A02×2、B01×1 | 175 | **唯一佔用庫存者**；作者欄退回顯示 email |
| 4 | id=1 | pending | A01×2、B01×2 | 240 | 可修改、可取消、可審核 |

> 種子訂單 #3 在植入時實際扣減了 A02 與 B01 的 `remaining_quantity`（因此 A02 的初始
> 剩餘是 38 而非 40）。若只寫訂單而不扣庫存，系統一啟動就帳實不符，後續的取消回補會
> 把庫存加到超過供應量。
>
> #3 的訂購人刻意選了停用帳號（id=3），讓「本人」與「帳號有效性」這兩個測試條件
> 可以分開驗證。

時間戳以 `datetime('now', '-N minutes')` 明確指定——全部用預設值的話，同一秒內建立的
訂單排序會不確定。

### 6.13 `db/meals.py` 函式總表

見 [`db/CLAUDE.md`](../db/CLAUDE.md)。**七個**使用 transaction 的函式：
`create_meal_order`、`update_meal_order`、`confirm_meal_order`、`reject_meal_order`、
`cancel_meal_order`、`admin_cancel_meal_order`、`complete_meal_order`。
判準是「多張表必須同時成功或同時失敗」——後五個都同時更新 `meal_orders` 與
`meal_order_items` 的狀態，其中三個還要動 `meals` 的份數。

---

## 7. 路由總表

### 7.1 全站路由

| Blueprint | 方法 | 路徑 | 端點 | 權限 |
|-----------|------|------|------|------|
| hub | `GET / POST` | `/` | `hub.home` | 開放 |
| auth | `GET / POST` | `/login` | `auth.login_page` | 開放 |
| auth | `GET / POST` | `/register` | `auth.register` | 開放 |
| auth | `GET` | `/captcha.png` | `auth.captcha_image` | 開放 |
| auth | `GET` | `/logout` | `auth.logout` | 開放 |
| profile | `GET` | `/profile` | `profile.dashboard` | 1+2 |
| profile | `POST` | `/profile/update` | `profile.dashboard_update` | 1（**缺 2**） |
| admin | `GET` | `/admin/users` | `admin.user_list` | 1+2+3 |
| admin | `GET` | `/admin/users/<id>` | `admin.user_detail` | 1+2+3 |
| admin | `POST` | `/admin/users/<id>/activate` | `admin.activate_user` | 1+2+3 |
| admin | `POST` | `/admin/users/<id>/deactivate` | `admin.deactivate_user` | 1+2+3 |
| admin | `POST` | `/admin/users/<id>/role` | `admin.update_role` | 1+2+3 |
| admin | `POST` | `/admin/users/<id>/delete` | `admin.delete_user` | 1+2+3 |
| meal | `GET` | `/meal/` | `meal.index` | 開放 |
| meal | `GET / POST` | `/meal/new` | `meal.new_meal` | 1+2+3 |
| meal | `GET / POST` | `/meal/edit/<id>` | `meal.edit_meal` | 1+2+3 |
| meal | `POST` | `/meal/delete/<id>` | `meal.delete_meal` | 1+2+3 |
| meal | `GET / POST` | `/meal/order/new` | `meal.new_order` | 1+2 |
| meal | `GET` | `/meal/my-orders` | `meal.my_orders` | 1+2 |
| meal | `GET` | `/meal/orders/<id>` | `meal.order_detail` | 1+2（本人或管理員） |
| meal | `GET / POST` | `/meal/orders/<id>/edit` | `meal.edit_order` | 1+2（本人、限 pending） |
| meal | `POST` | `/meal/orders/<id>/cancel` | `meal.cancel_order` | 1+2（本人） |
| meal | `GET` | `/meal/admin/orders` | `meal.admin_orders` | 1+2+3 |
| meal | `POST` | `/meal/admin/orders/<id>/confirm` | `meal.admin_confirm` | 1+2+3 |
| meal | `POST` | `/meal/admin/orders/<id>/reject` | `meal.admin_reject` | 1+2+3 |
| meal | `POST` | `/meal/admin/orders/<id>/complete` | `meal.admin_complete` | 1+2+3 |
| meal | `POST` | `/meal/admin/orders/<id>/cancel` | `meal.admin_cancel` | 1+2+3 |
| — | `GET` | `/health` | `health` | 開放 |

共 **28 條**（hub 1、auth 4、profile 2、admin 6、meal 14、health 1）。

### 7.2 命名慣例

- URL 使用小寫加連字號（`/my-orders`），路由函式名稱使用底線（`my_orders`）
- 刪除與狀態變更一律用 `POST`，不用 `GET`
- 管理端路由集中在 `/meal/admin/` 之下，與會員端路由在 URL 上就分得開
- 主頁的選取項目以 `?meal_id=N` 傳遞；資源本身的操作用 path parameter（`/meal/edit/1`）

### 7.3 POST-Redirect-GET 與元素語意

所有 `POST` 成功後一律 `redirect()`，避免重新整理時重複送出。

| 元素 | 使用時機 |
|------|---------|
| `<a href="...">` | GET 導航（跳頁、返回、篩選、分頁、進入表單頁） |
| `<button type="submit">` | POST 動作（送出、確認、拒絕、取消、下架） |

不用 `<a href="#">` 搭配 `onclick` 假裝按鍵。

全站僅十處允許使用 inline event handler：

| 位置 | 數量 | 用途 |
|------|:--:|------|
| `auth/login.html` | 2 | 驗證碼刷新（圖片本身、`↻` 按鈕） |
| `hub/home.html` | 2 | 同上 |
| `admin/user_list.html` | 1 | 刪除帳號的 `confirm` |
| `admin/user_detail.html` | 1 | 同上 |
| `meal/index.html` | 1 | 下架餐點的 `confirm` |
| `meal/order_detail.html` | 1 | 取消訂單的 `confirm` |
| `meal/admin_orders.html` | 2 | 拒絕訂單、代為取消的 `confirm` |

稽核指令：`grep -ro "onclick" templates/ | wc -l` 應為 `10`。

確認對話框一律寫在 `<button>` 的 `onclick` 上，不寫在 `<form>` 的 `onsubmit` 上。

### 7.4 為什麼審核動作拆成四條路由

`confirm` / `reject` / `complete` / `cancel` 各自一條 `POST`，而不是一條
`POST /meal/admin/orders/<id>/status` 帶 `?to=confirmed`。

理由有三：**每個動作的前置狀態不同**（confirm 要 pending、complete 要 confirmed），
合併成一條就要在路由內寫一個大的 dispatch；**每個動作的副作用不同**（只有 confirm 扣
庫存、只有 cancel 回補）；**URL 本身就是文件**——`/confirm` 一看就知道要做什麼，
`/status?to=confirmed` 還要去查合法值有哪些。

同樣的理由適用於 `admin` 的 `activate` 與 `deactivate` 拆成兩條。

---

## 8. 畫面設計與流程

### 8.1 畫面清單

| # | 畫面 | 樣板 | CSS | 進入方式 |
|:--:|------|------|-----|---------|
| 1 | 首頁（訪客） | `hub/home.html` | `hub.css` + `login.css` | `GET /` |
| 2 | 首頁（已登入） | 同上 | 同上 | `GET /` |
| 3 | 登入 | `auth/login.html` | `login.css` | `GET /login` |
| 4 | 申請帳號 | `auth/register.html` | `login.css` | `GET /register` |
| 5 | 個人資料 | `profile/dashboard.html` | `profile.css` | 首頁卡片 |
| 6 | 會員清單 | `admin/user_list.html` | `admin.css` | 首頁卡片（管理員） |
| 7 | 會員明細 | `admin/user_detail.html` | `admin.css` | 清單的「詳細」 |
| 8 | 今日菜單 | `meal/index.html` | `meal.css` | 首頁卡片 |
| 9 | 餐點表單 | `meal/meal_form.html` | `meal.css` | 菜單的「新增／修改」（管理員） |
| 10 | 訂餐表單 | `meal/order_form.html` | `meal.css` | 菜單的「我要訂餐」 |
| 11 | 我的訂單 | `meal/my_orders.html` | `meal.css` | 首頁卡片 |
| 12 | 訂單明細 | `meal/order_detail.html` | `meal.css` | 訂單清單的「詳細」 |
| 13 | 所有訂單 | `meal/admin_orders.html` | `meal.css` | 首頁卡片（管理員） |

畫面 10 由訂餐與修改訂單共用，靠 `form_title`、`back_url`、`quantities` 三個變數區分。

### 8.2 導覽關係

```text
                    ┌─────────────┐
              ┌────>│  / (hub)    │<────┐
              │     └──────┬──────┘     │
              │            │            │
        /login│      ┌─────┼─────┬──────┴──────┬────────────┐
              │      ▼     ▼     ▼             ▼            ▼
        ┌─────┴──┐ /meal/ /meal/ /profile  /meal/admin/  /admin/
        │ /login │        my-orders         orders        users
        └────┬───┘  │        │                 │            │
             │      ▼        ▼                 ▼            ▼
        /register  /meal/  /meal/          （確認／拒絕   /admin/
                   order/   orders/<id>     ／取餐／取消） users/<id>
                   new         │
                               ▼
                          /meal/orders/<id>/edit
```

首頁是唯一的樞紐。每個子系統的頂端列都有「返回首頁」，不需要靠瀏覽器的上一頁。

### 8.3 各頁線框說明

**今日菜單（`meal/index.html`）**——左右兩欄：

```text
┌──────────────────────────────────────────────────────────────┐
│ 校園訂餐系統        返回首頁 我的訂單 訂單管理 <user> [登出]  │
├─────────────────────────────────┬────────────────────────────┤
│ 今日菜單    共 N 道 [我要訂餐]  │  雞腿便當                  │
│ [全部][主餐][附餐][飲料]        │  A01                       │
│ ┌─────────────────────────────┐ │                            │
│ │編號 名稱 分類 單價 剩餘 狀態│ │  古早味炸雞腿，附三樣配菜  │
│ │A01  雞腿 主餐  95  60/60 供應│ │  與白飯。                  │
│ │A02  素食 主餐  75  38/40 供應│ │  ┌──────────────────────┐  │
│ │A03  排骨 主餐  90   0/50 售完│ │  │分類      主餐        │  │
│ │...                          │ │  │單價      NT$ 95      │  │
│ └─────────────────────────────┘ │  │每日供應  60 份       │  │
│      « 上一頁  第 1/1 頁  下一頁 »│  │目前剩餘  60 份       │  │
│                                 │  └──────────────────────┘  │
│                                 │  [我要訂餐] [修改餐點]     │
└─────────────────────────────────┴────────────────────────────┘
```

左欄的分類篩選與分頁可組合；點餐點名稱後右欄顯示詳細，`?meal_id=` 保留在分頁連結中。
管理員多出「操作」欄（修改／下架）與「+ 新增餐點」。

**訂餐表單（`meal/order_form.html`）**——單欄，分兩區：

```text
┌────────────────────────────────────────────┐
│ 我要訂餐                                   │
│ ── 取餐資訊 ─────────────────────────────  │
│ 取餐日期 [2026-08-11 ▾]  取餐時段 [午餐 ▾] │
│   可預訂範圍：2026-08-11 至 2026-08-17     │
│ 取餐地點 [_________________________]       │
│ 訂單備註 [                        ]       │
│ ── 訂購項目 ─────────────────────────────  │
│ ┌────────────────────────────────────────┐ │
│ │編號 名稱  分類 單價 剩餘 訂購份數      │ │
│ │A01  雞腿  主餐   95   60  [  0]        │ │
│ │A02  素食  主餐   75   38  [  0]        │ │
│ │B01  燙青菜 附餐  25   80  [  0]        │ │
│ └────────────────────────────────────────┘ │
│ 份數填 0 表示不訂購該項。單張訂單最多 20 份│
│ [送出訂單] [取消]                          │
└────────────────────────────────────────────┘
```

清單只列出可訂的餐點（`list_orderable_meals()`）。修改訂單時額外列出這張訂單已點、
但目前已不可訂的餐點，並標示「請將份數改為 0」。

**所有訂單（`meal/admin_orders.html`）**——單欄表格，操作欄依狀態變化：

| 訂單狀態 | 操作欄顯示 |
|----------|-----------|
| `pending` | 詳細、[審核備註輸入框] 確認、拒絕、取消 |
| `confirmed` | 詳細、登記取餐、取消 |
| 終端狀態 | 詳細 |

審核備註是一個 inline 的 `<input>`，與「確認」按鈕在同一個 `<form>` 中。拒絕另有
自己的 `<form>`（不帶備註輸入框，備註為選填）。

### 8.4 使用者旅程

**旅程 A：訪客瀏覽菜單後決定註冊**

```
GET /            訪客首頁，看到「今日菜單」卡片可點
GET /meal/       瀏覽菜單，點「雞腿便當」看詳細
                 右欄顯示「登入後訂餐」按鈕
GET /login       -> 點「申請帳號」
GET /register    填 email、密碼、姓名
POST /register   成功 -> flash「申請成功，請登入」-> redirect /login
POST /login      登入成功 -> redirect /
GET /            已登入首頁，五張卡片（一般使用者三張）
```

**旅程 B：會員訂餐到取餐**

```
GET  /meal/order/new     填取餐日期、時段、地點，A01 填 2、B01 填 2
POST /meal/order/new     驗證通過 -> 建立訂單（pending，不扣庫存）
                         -> redirect /meal/orders/5
GET  /meal/orders/5      看到明細、總金額 240、狀態「待確認」
                         有「修改訂單」與「取消訂單」兩個按鈕
（管理員端）
GET  /meal/admin/orders  看到 #5 待確認
POST .../5/confirm       重新檢查份數 -> 扣減 A01 兩份、B01 兩份
                         -> 狀態轉 confirmed
（訂購人端）
GET  /meal/orders/5      狀態變「已確認」，「修改訂單」按鈕消失
                         「取消訂單」仍在
（取餐當日，管理員端）
POST .../5/complete      狀態轉 completed，庫存不回補
（訂購人端）
GET  /meal/orders/5      狀態「已取餐」，操作區顯示「此訂單已結案」
```

**旅程 C：確認後取消，庫存回到原點**

```
初始         A01 remaining = 60
POST confirm A01 remaining = 58   （扣 2）
POST cancel  A01 remaining = 60   （回補 2）
```

這條旅程有對應的自動化測試（`test_confirm_then_cancel_restores_stock`）。

**旅程 D：管理員停用一個帳號**

```
POST /admin/users/1/deactivate   id=1 的帳號被停用
（該使用者的下一個 request）
GET  /meal/order/new             _current_user() 回傳 None
                                 -> session.clear() -> redirect /login
GET  /meal/                      仍可瀏覽，但以訪客身分呈現（無訂餐入口）
POST /profile/update             **仍然成功**——KI-03 的刻意缺陷
（該使用者的既有訂單）
                                 保留不動。#3 若為 confirmed，仍佔用庫存
```

> 最後一項是個值得討論的設計問題：帳號被停用後，他已確認的訂單該不該自動取消？
> 本系統選擇**不自動處理**——訂單是一筆已成立的交易，帳號狀態不應該追溯改變它。
> 需要處理時由管理員代為取消（庫存會回補）。

### 8.5 CSS 架構

`static/common.css` 是全站按鍵**顏色的單一來源**（CSS 自訂屬性），`base.html` 最先載入。
各子系統 CSS 使用自己的 prefixed 類別，顏色值透過 `var(--...)` 引用，**不寫死色碼**。

| CSS 檔案 | 按鍵前綴 | 適用頁面 |
|---------|---------|---------|
| `common.css` | — | 全站共用 token |
| `login.css` | `.login-form button` | auth 登入／申請頁、hub 內嵌登入表單 |
| `hub.css` | `hub-*` | 首頁 |
| `profile.css` | `profile-*` | 個人資料頁 |
| `admin.css` | `admin-btn-*`、`admin-btn-action-*` | 會員管理 |
| `meal.css` | `meal-btn-*`、`meal-btn-action-*` | 訂餐所有頁面 |

**共用設計 Token（`common.css`）**

| 變數族 | 說明 |
|--------|------|
| `--btn-primary-bg / -hover` | 主要動作（藍） |
| `--btn-secondary-bg / -color / -hover` | 次要動作（灰） |
| `--btn-danger-bg / -hover` | 危險操作（紅） |
| `--btn-action-*` | 行內小按鍵 |
| `--btn-action-danger-*` | 行內小按鍵 danger 變體 |

**兩處已知例外**（顏色硬編碼）：

- 狀態 badge 的底色寫在 `admin.css` 與 `meal.css` 中（`common.css` 未定義狀態語意色，KI-19）
- `hub.css` 的 `.hub-register-link` 與 `.hub-logout` 是按鍵卻寫死色碼（KI-31）

**`.login-form` class 的限制**：`login.css` 的 `button[type="submit"]` 樣式限定在
`.login-form` 選擇器內，不會全域污染。全系統恰有三處使用：`auth/login.html`、
`auth/register.html`、`hub/home.html`。`profile`、`admin`、`meal` 的表單**不加**此 class。

**欄寬工具類 `.col-*`** 在 `admin.css` 與 `meal.css` 中重複定義。這是唯一允許跨子系統
共用的類別族——它們只管欄寬、不管顏色。

---

## 9. 驗證規則與訊息字串

### 9.1 輸入欄位規格

| 畫面 | 欄位 | 必填 | 限制 |
|------|------|:--:|------|
| 申請帳號 | email | ✅ | 符合 `^[^\s@]+@[^\s@]+\.[^\s@]+$`；UNIQUE |
| 申請帳號 | 密碼 | ✅ | 至少 8 字元 |
| 申請帳號 | 姓名 / 顯示名稱 | ❌ | 空字串轉 NULL |
| 餐點表單 | 餐點編號 | ✅ | 最長 20 字（HTML 限制，後端未驗，見 KI-M2） |
| 餐點表單 | 餐點名稱 | ✅ | 最長 60 字（同上） |
| 餐點表單 | 分類 | ✅ | `main` / `side` / `drink` |
| 餐點表單 | 單價 | ✅ | 整數，≥ 0 |
| 餐點表單 | 每日供應份數 | ✅ | 整數，≥ 0 |
| 餐點表單 | 剩餘份數 | ✅ | 整數，≥ 0，且 ≤ 每日供應份數 |
| 餐點表單 | 供應狀態 | ✅ | `available` / `sold_out` / `unavailable` |
| 訂餐表單 | 取餐日期 | ✅ | `YYYY-MM-DD`；今天 ≤ 日期 ≤ 今天 + 6 天 |
| 訂餐表單 | 取餐時段 | ✅ | `lunch` / `dinner` |
| 訂餐表單 | 取餐地點 | ✅ | 最長 80 字（HTML 限制） |
| 訂餐表單 | 訂單備註 | ❌ | 空字串轉 NULL；無長度上限（KI-28） |
| 訂餐表單 | 各項份數 | — | 整數，≥ 0；> 0 者須 ≤ 剩餘份數；總和 ≤ 20 |

### 9.2 登入驗證順序

1. 驗證碼非空 → `請輸入驗證碼`
2. 驗證碼正確 → `驗證碼錯誤，請重新輸入`
3. email 與密碼非空 → `請輸入帳號與密碼`
4. 帳號存在、未刪除、密碼正確 → `帳號或密碼錯誤`
5. 帳號啟用 → `帳號已停用`

> 驗證碼排在最前面是刻意的：它擋掉的是自動化嘗試，應該在任何資料庫查詢之前就失敗。

### 9.3 申請帳號驗證順序

1. email 與密碼非空 → `請輸入電子郵件與密碼`
2. email 格式 → `電子郵件格式不正確`
3. 密碼長度 ≥ 8 → `密碼至少需要 8 個字元`
4. 兩次密碼一致 → `兩次密碼輸入不一致`
5. email 未被使用（`sqlite3.IntegrityError`）→ `此電子郵件已被使用`

### 9.4 會員管理操作驗證順序

1. 三層權限檢查
2. 目標存在 → `找不到該使用者`
3. 非自己（deactivate / role / delete）→ R1 / R2 / R3 訊息
4. 目標未刪除 → `該帳號已刪除，無法操作`
5. 參數合法（role）→ `角色值不正確`

### 9.5 餐點表單驗證順序

1. 編號非空 → `請輸入餐點編號`
2. 名稱非空 → `請輸入餐點名稱`
3. 分類合法 → `餐點分類不正確`
4. 狀態合法 → `餐點狀態不正確`
5. 單價可解析 → `價格格式不正確`
6. 單價 ≥ 0 → `價格不可小於 0`
7. 每日供應份數可解析 → `每日供應份數格式不正確`
8. 每日供應份數 ≥ 0 → `每日供應份數不可小於 0`
9. 剩餘份數可解析 → `剩餘份數格式不正確`
10. 剩餘份數 ≥ 0 → `剩餘份數不可小於 0`
11. 剩餘份數 ≤ 每日供應份數 → `剩餘份數不可大於每日供應份數`

### 9.6 訂餐驗證順序

**階段一：收集項目（`_collect_items`）**——逐項檢查，任一失敗即整張退回：

1. `meal_id[]` 與 `quantity[]` 等長 → `表單資料不完整，請重新送出`
2. `meal_id` 可解析 → `餐點編號格式不正確`
3. 份數可解析 → `訂購份數格式不正確`
4. 份數 ≥ 0 → `訂購份數不可小於 0`
5. （份數 > 0 者）餐點存在且未下架 → `所選餐點不存在或已下架`
6. 餐點狀態為 `available` → `「<名稱>」目前無法訂購`
7. 份數 ≤ 剩餘份數 → `「<名稱>」剩餘份數不足（目前剩餘 N 份）`

**階段二：抬頭與總量（`_validate_order_form`）**

8. 取餐日期非空 → `請選擇取餐日期`
9. 日期格式 → `取餐日期格式不正確`
10. 不早於今天 → `取餐日期不可早於今天`
11. 不超過 7 天 → `最多只能預訂 7 天內的餐點`
12. 時段合法 → `取餐時段不正確`
13. 取餐地點非空 → `請輸入取餐地點`
14. 至少一項 → `請至少訂購一項餐點`
15. 總份數 ≤ 20 → `單張訂單最多 20 份，目前為 N 份`

> **第 6 與第 7 的順序有實質差異**：已售完的餐點（`sold_out` 且剩餘為 0）會先撞到
> 第 6 條，收到「目前無法訂購」而非「份數不足」。要看到第 7 條的訊息，餐點必須是
> `available` 但剩餘不足。`tests/test_meal.py` 分成兩個測試分別涵蓋這兩條路徑。
>
> **階段一排在階段二之前**，因此「什麼都沒填」的表單會先收到日期或地點的錯誤嗎？
> 不會——階段一在份數全為 0 時不會產生任何錯誤（0 份是合法的），錯誤要到第 14 條
> 才出現。這個順序讓「餐點層級的問題」永遠優先於「訂單層級的問題」被回報。

### 9.7 訊息字串總表

全部 55 條訊息集中於 `tests/data/users.py` 的 `MESSAGES`。修改 Blueprint 中的字串時
**必須同步更新此處**。

**auth（11 條）**

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

**admin（11 條）**

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

**meal — 餐點管理（13 條）**

| Key | 字串 |
|-----|------|
| `mealCreated` | 餐點已新增 |
| `mealUpdated` | 餐點已更新 |
| `mealDeleted` | 餐點已下架 |
| `mealNotFound` | 餐點不存在或已下架 |
| `mealCodeRequired` | 請輸入餐點編號 |
| `mealNameRequired` | 請輸入餐點名稱 |
| `mealBadCategory` | 餐點分類不正確 |
| `mealBadStatus` | 餐點狀態不正確 |
| `mealBadPrice` | 價格格式不正確 |
| `mealNegativePrice` | 價格不可小於 0 |
| `mealBadDaily` | 每日供應份數格式不正確 |
| `mealBadRemaining` | 剩餘份數格式不正確 |
| `mealRemainingTooBig` | 剩餘份數不可大於每日供應份數 |

**meal — 訂單（17 條）**

| Key | 字串 |
|-----|------|
| `orderCreated` | 訂單已送出，等待管理員確認 |
| `orderUpdated` | 訂單已更新 |
| `orderCancelled` | 訂單已取消 |
| `orderCancelFailed` | 無法取消此訂單 |
| `orderNotFound` | 訂單不存在 |
| `orderNoPermission` | 無權限查看此訂單 |
| `orderNoEditRight` | 無權限修改此訂單 |
| `orderNotPending` | 只有待確認的訂單可以修改 |
| `orderDateRequired` | 請選擇取餐日期 |
| `orderDateFormat` | 取餐日期格式不正確 |
| `orderDatePast` | 取餐日期不可早於今天 |
| `orderBadSlot` | 取餐時段不正確 |
| `orderLocationBlank` | 請輸入取餐地點 |
| `orderNoItems` | 請至少訂購一項餐點 |
| `orderItemNotFound` | 所選餐點不存在或已下架 |
| `orderBadQuantity` | 訂購份數格式不正確 |
| `orderNegativeQty` | 訂購份數不可小於 0 |

**meal — 管理端審核（6 條）**

| Key | 字串 |
|-----|------|
| `orderConfirmed` | 訂單已確認 |
| `orderConfirmFailed` | 確認失敗（餐點份數不足、已停售，或訂單狀態不符） |
| `orderRejected` | 訂單已拒絕 |
| `orderRejectFailed` | 拒絕失敗（訂單狀態不符） |
| `orderCompleted` | 已登記取餐 |
| `orderCompleteFailed` | 登記取餐失敗（訂單狀態不符） |

**未納入 `MESSAGES` 的三條**（含變數插值，測試以子字串斷言）：

- `「<名稱>」目前無法訂購`
- `「<名稱>」剩餘份數不足（目前剩餘 N 份）`
- `單張訂單最多 20 份，目前為 N 份`
- `最多只能預訂 7 天內的餐點`

### 9.8 flash 與 render 的使用慣例

| 情境 | 做法 |
|------|------|
| 表單驗證失敗 | `render_template(...)` 直接回傳，**不 flash**，錯誤以 `error` 變數傳入樣板，使用者填的內容原樣保留 |
| 權限或狀態不符 | `flash(msg, 'error')` + `redirect(...)` |
| 操作成功 | `flash(msg, 'success')` + `redirect(...)` |

分界線是「使用者填的資料還在不在」：驗證失敗時內容還在，要留在原頁；權限失敗時
沒有內容要保留，直接 redirect。

> ⚠️ 一個例外情境：flash 後 redirect 到 `hub.home` 的訊息**不會顯示**，因為
> `hub/home.html` 沒有渲染 flash 區塊。這影響所有第 3 層權限失敗的「無操作權限」。
> 記錄為 KI-M6。

---

## 10. 非功能需求

### 10.1 效能

- 目標使用規模：單機、數十位同時使用者的教學環境
- 每個資料存取函式各自建立與關閉連線；不使用連線池（KI-10）
- SQLite 啟用 WAL 模式，讀寫可並行
- 分頁大小固定 10 筆，避免一次載入全表
- **沒有任何索引**（除了 PRIMARY KEY 的隱含索引）。`meal_order_items.meal_order_id`
  與 `meal_orders.orderer_id` 是最常被查詢的外鍵欄位，資料量大時應建索引（KI-M10）

### 10.2 安全性

| 面向 | 現況 |
|------|------|
| 密碼儲存 | bcrypt，註冊 cost=10 |
| SQL Injection | 全部使用參數化查詢，無字串拼接 |
| XSS | Jinja2 自動跳脫；無 `\|safe` 過濾器 |
| Session | Flask 簽章 cookie，`HttpOnly` |
| CSRF | **無防護**（KI-01） |
| 價格竄改 | 已防護：單價一律從資料庫重新查詢 |
| 份數竄改 | 已防護：伺服器端驗證 ≤ 剩餘份數 |
| 越權存取訂單 | 已防護：`order_detail` 檢查 `orderer_id == user['id'] or _is_admin` |
| 登入嘗試次數 | **無限制**（KI-02） |
| 驗證碼重放 | 登入成功後未 `session.pop`（KI-07） |

### 10.3 可用性與相容性

- 支援桌面瀏覽器；`meal.css` 與 `hub.css` 有基本的 RWD 斷點（900px / 760px）
- 不支援 IE
- 所有頁面 `lang="zh-TW"`，UTF-8

### 10.4 可維護性

- 每個 Blueprint 對應一個 `templates/` 子目錄、一個 `static/*.css`、一個 `tests/test_*.py`、一份 `CLAUDE.md`
- 訊息字串集中於 `tests/data/users.py`
- 狀態與分類的合法值集中於 `db/meals.py` 的三個 tuple
- 顯示用的中文對照集中於 `blueprints/meal/__init__.py` 的四個字典

### 10.5 可測試性

- 資料庫路徑由 `db.DB_PATH` 控制，測試中動態替換為 `tmp_path` 下的暫存檔
- 驗證碼可透過 `client.session_transaction()` 繞過
- 每個測試函式獨立的資料庫與種子資料
- 種子資料涵蓋狀態機的所有可達狀態，多數邊界不需要先建資料就能測

### 10.6 部署

- Docker 映像基於 `python:3.11-slim`
- `docker-compose.yml` 使用 named volume `db_data` 持久化 `/app/data`
- `DB_PATH` 指向 volume 內的路徑，容器重建不會遺失資料
- port 4000

---

## 11. 已知技術債 / Known Issues

### 11.0 為何有些債修、有些不修

本系統的技術債分兩類：**會員系統的**（`KI-` 開頭，15 條），以及**訂餐子系統的**
（`KI-M` 開頭，10 條），全系統共 **25 條**。

處理原則不同：

- **會員系統的債保留不修**。它們本身就是教材
- **訂餐子系統的債必須是刻意的取捨並記錄**。不接受「忘了寫」

> `KI-` 的編號**刻意不連續**（有 KI-01、KI-03、KI-05… 卻沒有 KI-04、KI-06）。
> 編號一經指定就不再重用，避免既有的交叉引用失效。

判準只有一條：**缺陷的影響是否會外溢到當事人以外的人。**

- `profile` 的 KI-03（停用帳號仍可改自己的姓名）：只影響自己 → **保留**
- `meal` 的守門（停用帳號若能下單，會佔用別人訂不到的份數）：影響別人 → **修補**

### 11.1 安全性（沿用）

| ID | 內容 | 影響 | 修補方向 |
|----|------|------|---------|
| KI-01 | 全站無 CSRF token | 惡意站點可誘導已登入使用者送出 POST（下單、取消、確認訂單） | 導入 Flask-WTF 或手寫 token；所有 `<form>` 加隱藏欄位 |
| KI-02 | 登入無嘗試次數限制 | 可暴力破解 | 記錄失敗次數，超過門檻鎖定或延遲 |
| KI-05 | `SECRET_KEY` 有預設值 | 生產環境忘記設定則 session 可被偽造 | 未設定時直接拒絕啟動 |
| KI-07 | 驗證碼在登入成功後未 `session.pop` | 驗證碼可重放 | 驗證通過後立即 `session.pop('captcha', None)`。**修補成本最低、安全效益最高的一項** |
| KI-15 | 無 session fixation 防護 | 登入前後 session id 相同 | 登入成功後重新產生 session |
| KI-16 | `app.run(debug=True)` 寫死 | 生產環境會暴露 Werkzeug debugger | 由環境變數控制 |
| KI-24 | 無 HTTPS 強制、無 `Secure` cookie flag | 明文傳輸 | 反向代理層處理 |

### 11.2 正確性與一致性（沿用）

| ID | 內容 | 影響 | 為何不修 |
|----|------|------|---------|
| **KI-03** | `POST /profile/update` **缺少 `_is_usable` 檢查** | 被停用或刪除的會員仍可修改自己資料 | **核心教材**：技術債如何跨功能傳染。它與 admin 的停用功能直接衝突。**請勿「順手」補上這三行** |
| KI-23 | hub 內嵌登入是 auth 登入的完整複製，五條錯誤訊息各硬編碼兩份 | 任何登入政策的強化都必須兩處都改 | 示範重複程式碼的真實代價 |
| KI-29 | 部分含變數插值的訊息未納入 `MESSAGES` | 測試以子字串斷言，改字串時可能漏掉 | 插值訊息本來就不適合當常數；改法是抽成 format template |

### 11.3 資料層（沿用）

| ID | 內容 | 影響 |
|----|------|------|
| KI-10 | 每個函式各自 `_get_conn()` / `close()` | 大量樣板；高併發下連線建立成本可觀 |
| KI-13 | 無 FOREIGN KEY 約束 | 可寫入指向不存在 id 的資料；孤兒紀錄不會被資料庫擋下 |
| KI-19 | `common.css` 未定義狀態語意色 | 狀態 badge 的底色硬編碼在 `admin.css` 與 `meal.css` |
| KI-28 | 文字欄位無長度上限 | 可寫入任意大小的內容。Jinja2 已擋住 XSS，但沒擋住資源耗用 |
| KI-31 | `hub.css` 的 `.hub-register-link` 與 `.hub-logout` 寫死色碼 | 類別名稱不含 `btn`，以「btn」為關鍵字的稽核抓不到 |

### 11.4 訂餐子系統（新增，全部為刻意取捨）

| ID | 內容 | 影響 | 接受理由 | 修補方向 |
|----|------|------|---------|---------|
| **KI-M1** | `pending` 不佔用庫存，可超額登記 | 十個人各訂最後一份便當都會成功，直到管理員確認第一張，其餘九張才在確認時失敗 | 若下單即扣減，使用者隨手送一張放著不管就把份數卡住了。這是「先登記、由管理員決定是否成立」的語意 | 加入 pending 的軟性保留與逾時釋放；或在下單時警告「目前已有 N 張待確認訂單」 |
| **KI-M2** | `meals.meal_code` 無 UNIQUE 約束，後端也不驗重複 | 可建立兩道編號都是 A01 的餐點，菜單上分不出來 | 加 UNIQUE 會需要處理 `IntegrityError` 與軟刪除的交互（下架後編號能不能重用？），複雜度超出教學需要 | 加 `UNIQUE(meal_code) WHERE is_deleted = 0` 的部分索引，並在 `_validate_meal_form` 中查重 |
| **KI-M3** | 多品項以 `meal_id[]` / `quantity[]` 兩組平行欄位傳遞 | 依賴瀏覽器保證兩列表等長且同序 | 這是常見的多品項表單寫法，改掉要連同模板與解析一起動 | 改用 `quantity_<meal_id>` 的自描述欄位名 |
| **KI-M4** | 修改訂單時明細全部軟刪除後重新寫入，不做逐筆 diff | 明細 id 每次修改都跳號；`meal_order_items` 累積軟刪除紀錄 | 明細沒有需要保留的身分（沒有外部引用它的 id），重寫比比對簡單得多 | 逐筆比對後只 UPDATE 有變動的列 |
| **KI-M5** | 取餐時段的合法值只存在於 `SLOT_LABELS` 字典，無對應的資料層常數 | 與 `MEAL_STATUSES` 等三個 tuple 的做法不一致 | 時段目前只有顯示用途，沒有資料層邏輯依賴它 | 在 `db/meals.py` 加 `PICKUP_SLOTS` tuple，驗證改為比對它 |
| **KI-M6** | `hub/home.html` 未渲染 flash 區塊 | 所有 redirect 到首頁的 flash 訊息被靜默丟棄，包含第 3 層權限失敗的「無操作權限」 | 刻意保留為教材 | 在 `.hub-main` 開頭加上與其他子系統相同的 `get_flashed_messages` 迴圈（約五行） |
| **KI-M7** | `remaining_quantity` 不會每日自動重設 | 管理員必須每天手動把每道餐點的剩餘份數改回 `daily_quantity` | 自動重設需要排程機制（cron 或背景執行緒），超出單檔 Flask 應用的範圍 | 加一條 `POST /meal/admin/reset-daily` 手動觸發；或引入 APScheduler |
| **KI-M8** | 訂餐表單無即時小計 | 使用者要送出後才知道總金額 | 全站不用 JavaScript 前端框架，即時小計需要前端狀態 | 加一段約 15 行的原生 JS 監聽 `input` 事件 |
| **KI-M9** | `meal_orders.is_deleted` 有欄位但無任何路由會設為 1 | 死欄位，讀者會誤以為有刪除訂單的功能 | 保留欄位讓四張表的結構一致；訂單的「刪除」在業務上就是取消 | 移除欄位，或補上管理員的軟刪除路由 |
| **KI-M10** | 無任何索引 | `meal_order_items.meal_order_id` 與 `meal_orders.orderer_id` 每次查詢都全表掃描 | 教學資料量（數十筆）下感受不到差異 | `CREATE INDEX idx_items_order ON meal_order_items(meal_order_id)` 等三條 |

### 11.5 幾項刻意做強的地方

以下三項是本系統刻意不便宜行事的地方，每一項都必須在此列出理由：

| # | 項目 | 常見做法 | 本系統 | 理由 |
|---|------|---------|--------|------|
| 1 | 業務子系統的 `_current_user()` | 只查 id，**不驗** `_is_usable` | **驗** | 被停用的帳號若能下單，會佔用真實的餐點份數，讓別人訂不到。缺陷的影響外溢到當事人以外的人（判準見 §11.0） |
| 2 | 訊息字串集中管理 | 散落在各測試檔的斷言字面量中 | **全部納入 `MESSAGES`** | 訂餐的訊息有 36 條，散在斷言中無法維護 |
| 3 | 訂單狀態數 | `equipment` 有 7 個狀態，其中 `overdue` 不可達 | **5 個**，全部可達 | 不可達的狀態是死碼。訂餐沒有「逾期未取」的偵測邏輯，不該留一個沒人會設定的狀態 |

另有一項是**刻意不修正**的：`profile` 的 KI-03。它與第 1 項形成對照——同一個缺陷，
一個修一個不修，判準是影響範圍。這個不對稱本身就是教材。

---

## 12. 測試策略

### 12.1 測試層級

只有一層：**以 Flask test client 進行的路由層整合測試**。不寫單元測試，不啟動實際
伺服器，不使用瀏覽器自動化。

理由是這個系統的邏輯幾乎全部在「請求進來到回應出去」這條路徑上，路由層測試同時
涵蓋了權限、驗證、資料層與樣板渲染。

### 12.2 隔離機制

每個測試函式透過 `tmp_path` fixture 建立獨立的 SQLite 暫存檔：

```python
@pytest.fixture(scope='function')
def app(tmp_path):
    flask_app.config['TESTING'] = True
    db_module.DB_PATH = str(tmp_path / 'test.db')
    db_module.init_db()
    yield flask_app
```

`db.DB_PATH` 是模組層變數，`_get_conn()` 每次呼叫時才讀取，因此替換立即生效。
測試結束後 `tmp_path` 由 pytest 自動清除。

驗證碼透過 `client.session_transaction()` 直接寫入答案，繞過圖片產生。

### 12.3 Fixtures

| Fixture | 說明 |
|---------|------|
| `app` | function scope；暫存 DB + 種子資料；`TESTING=True` |
| `client` | Flask test client（未登入） |
| `authed_client` | `session['user_id'] = 1`（user@example.com，一般使用者） |
| `admin_client` | `session['user_id'] = 2`（admin@example.com，管理員） |
| `other_client` | `session['user_id'] = 3`（disabled@example.com，停用帳號但 session 直接注入） |
| `clean_client` | `tests/test_meal.py` 的 local fixture；獨立的第二個 client |

> ⚠️ `authed_client`、`admin_client`、`other_client` 都由 `client` 衍生，**同一個測試中
> 同時請求兩個，拿到的是同一個物件**——後請求的會蓋掉前一個的 session。需要兩個不同
> 身分同時操作時，用 `clean_client` 這種 local fixture。

`other_client` 在本系統有三個用途：

1. 「非本人、非管理員」的權限邊界
2. 「停用中的管理員」——先 `db.set_user_role(3, 0)` 再用它，驗證守門順序
3. 「持有舊 session 的停用帳號」——驗證 meal 的守門修正，以及 KI-03 的刻意缺陷

種子訂單 #3 的訂購人刻意選了 id=3，讓「本人」與「帳號有效性」這兩個條件可以分開驗證
——測「本人但狀態不符」時需先 `db.set_user_active(3, 1)`，否則會被 `_current_user()`
先攔下。

### 12.4 測試檔案與案例數

| 檔案 | 案例數 | 涵蓋 |
|------|:--:|------|
| `test_auth.py` | 23 | 登入、註冊、驗證碼、登出 |
| `test_hub.py` | 11 | 訪客／已登入視圖、卡片可見性、失效 session |
| `test_profile.py` | 10 | 檢視、編輯、**KI-03 的兩個保護測試** |
| `test_admin.py` | 30 | 清單、篩選、搜尋、分頁、四個動作、R1–R3 |
| `test_meal.py` | 78 | 見下表 |
| **合計** | **152** | |

`test_meal.py` 的分區：

| 分區 | 案例數 | 重點 |
|------|:--:|------|
| 菜單瀏覽 | 10 | 訪客可讀、訂餐入口可見性、分類篩選、無效分類回退、已下架消失 |
| 餐點管理：權限 | 5 | 未登入、一般使用者、停用中的管理員（守門順序） |
| 餐點管理：流程與驗證 | 13 | CRUD、8 條驗證規則的參數化測試、剩餘份數上限 |
| 訂餐：權限 | 3 | 未登入、停用帳號、只列可訂餐點 |
| 訂餐：正常流程 | 4 | 建立、金額計算、價格快照、pending 不扣庫存 |
| 訂餐：驗證 | 13 | 空品項、日期範圍、時段、地點、售完、停售、已下架、超量、負數、竄改價格 |
| 訂單明細 | 5 | 本人、管理員、他人、不存在、只列自己的 |
| 修改訂單 | 4 | 正常、狀態不符、他人、已不可訂品項仍列出 |
| 取消訂單 | 5 | pending 不回補、confirmed 回補、已結案失敗、他人失敗 |
| 管理端：清單與權限 | 4 | 權限、全部、狀態篩選、無效狀態 |
| 管理端：審核動作 | 10 | 確認扣庫存、份數不足整張退回、停售、拒絕、取餐、代為取消、一般使用者被擋 |
| 庫存不變量 | 2 | 確認後取消回到原點、回補以 `daily_quantity` 封頂 |
| **合計** | **78** | |

### 12.5 覆蓋原則

1. 每個 Blueprint 對應一個測試檔案
2. 覆蓋：正常流程、邊界條件、權限控制（未登入、一般使用者、管理員、他人）
3. **被權限擋下的 POST 必須同時斷言資料庫沒有改變。** 只驗 302 無法區分「被擋下」與
   「執行成功後 redirect」
4. **涉及庫存的操作必須斷言庫存。** 狀態改對了但庫存沒跟上，是本系統最容易出現的錯，
   只驗 `order_status` 抓不到
5. 斷言數量一律用**相對式**（`before` / `after`），不寫死絕對值——種子資料的存在使得
   資料庫從來不是空的
6. `db.create_user()` 使用 bcrypt cost=10，測試中不應大量建立會員；餐點與訂單的建立
   成本極低，分頁測試可放心建立十幾筆

### 12.6 已知的測試缺口

| 缺口 | 影響 |
|------|------|
| 未測試並行情境 | 兩個管理員同時確認同一張訂單、兩人同時訂最後一份的 race condition 都沒有測試 |
| 未測試 Docker 部署 | 本機無 Docker CLI，只做設定檔的靜態檢查 |
| 未測試樣板的完整渲染正確性 | 斷言以子字串為主，樣板結構錯誤（如表格欄數不符）不會被抓到 |
| 未測試 CSS | 沒有視覺回歸測試 |

### 12.7 執行測試

```bash
pytest                          # 執行全部 152 個測試
pytest tests/test_meal.py -v    # 只跑訂餐
pytest -k "restock"             # 只跑名稱含 restock 的
pytest -q                       # 精簡輸出
```

`pytest.ini` 限定 `testpaths = tests`，確保 pytest 只收集本系統的測試，
不會走進不相干的目錄而收到同名的 `tests` 套件。

---

## 13. 未來擴充建議

依「與現有結構的契合度」排序，前三項是最適合作為課程作業的：

| # | 主題 | 新增資料表 | 工作量 | 重點學習 |
|---|------|-----------|--------|---------|
| 1 | **每日庫存重設**（解 KI-M7） | 無 | 小 | 批次操作、冪等性；一條 `POST /meal/admin/reset-daily` |
| 2 | **訂單統計報表** | 無 | 中 | `GROUP BY` 聚合查詢：今日各餐點訂購份數、各時段訂單數、營收 |
| 3 | **餐廳／供應商** | `vendors`（1 張） | 中 | 一對多關聯的第二個實例；`meals` 加 `vendor_id`；權限延伸出「供應商管理員」第三種角色 |
| 4 | **站內通知** | `notifications`（1 張） | 中 | 訂單狀態變更時寫入通知；未讀計數；與現有狀態機掛鉤 |
| 5 | **稽核紀錄** | `audit_logs`（1 張） | 中 | 記錄所有管理動作（誰在什麼時候把哪張訂單改成什麼）；示範橫切關注點 |
| 6 | **每日菜單排程** | `daily_menus`（1 張） | 大 | 餐點與「哪一天供應」解耦；`remaining_quantity` 移到 `daily_menus`，解掉 KI-M7 |
| 7 | **付款紀錄** | `payments`（1 張） | 大 | 訂單與付款的一對一或一對多；金額對帳；狀態機的第二個實例 |
| 8 | **CSRF 防護**（解 KI-01） | 無 | 中 | 跨所有子系統的橫切修改；體會 KI-23 的代價（要改的地方比想像中多） |

> 第 6 項會改變核心資料模型，適合作為期末專題；第 1、2 項適合作為單週作業。

---

## 附錄 A：路由與訊息字串對照

| 路由 | 可能的訊息 |
|------|-----------|
| `POST /login` | captchaRequired、captchaInvalid、missingCredentials、loginError、accountDisabled |
| `POST /register` | missingEmailOrPassword、invalidEmailFormat、passwordTooShort、passwordMismatch、emailTaken、registerSuccess |
| `POST /admin/users/<id>/*` | adminForbidden、adminUserNotFound、adminDeletedUser、adminSelfDeactivate / SelfDelete / SelfRole、adminInvalidRole、adminActivated / Deactivated / RoleUpdated / UserDeleted |
| `POST /meal/new`、`/meal/edit/<id>` | adminForbidden、mealNotFound、mealCodeRequired ~ mealRemainingTooBig（11 條）、mealCreated / mealUpdated |
| `POST /meal/delete/<id>` | adminForbidden、mealNotFound、mealDeleted |
| `POST /meal/order/new` | orderBadQuantity、orderNegativeQty、orderItemNotFound、「無法訂購」、「份數不足」、orderDateRequired ~ orderNoItems、「最多 N 份」、orderCreated |
| `GET /meal/orders/<id>` | orderNotFound、orderNoPermission |
| `POST /meal/orders/<id>/edit` | orderNotFound、orderNoEditRight、orderNotPending、（同訂餐的驗證訊息）、orderUpdated |
| `POST /meal/orders/<id>/cancel` | orderCancelled、orderCancelFailed |
| `POST /meal/admin/orders/<id>/confirm` | adminForbidden、orderConfirmed、orderConfirmFailed |
| `POST /meal/admin/orders/<id>/reject` | adminForbidden、orderRejected、orderRejectFailed |
| `POST /meal/admin/orders/<id>/complete` | adminForbidden、orderCompleted、orderCompleteFailed |
| `POST /meal/admin/orders/<id>/cancel` | adminForbidden、orderCancelled、orderCancelFailed |

## 附錄 B：詞彙表

| 中文 | 英文 / 識別字 | 說明 |
|------|--------------|------|
| 主檔／明細 | master / detail | 一對多的資料表配對 |
| 軟刪除 | soft delete | `is_deleted = 1`，不執行 `DELETE` |
| 價格快照 | price snapshot | `meal_order_items.unit_price` |
| 庫存佔用 | stock reservation | `remaining_quantity` 被扣減 |
| 回補 | restock | 取消已確認訂單時把份數加回 |
| 狀態機 | state machine | 訂單的五個狀態與六條轉移 |
| 不變量 | invariant | 系統在任何時刻都必須成立的性質 |
| 終端狀態 | terminal state | 不可再轉移的狀態（completed / cancelled / rejected） |
| 三層檢查 | three-layer guard | login → usable → admin |
| 衍生值 | derived value | 可由其他欄位算出但仍存下來的值（`total_amount`） |
