# 校園活動報名系統 — 建置流程書

## 0. 文件資訊

| 項目 | 內容 |
|------|------|
| 文件名稱 | 校園活動報名系統 建置流程書 |
| 版本 | v1.0 |
| 日期 | 2026-08-11 |
| 上位依據 | [`document/system-spec.md`](system-spec.md) |
| 適用對象 | 要把這個系統從無到有建起來的人 |

### 0.1 這份文件是什麼

系統規格書說明「系統是什麼」，這份文件說明「怎麼把它建出來」。

流程分為 **14 個階段（Phase 0 – 13）**，每個階段都是一個可以獨立完成、獨立驗收的單位。
階段之間有明確的相依順序，不建議跳著做——後面的階段預設前面的產出已經存在且驗收通過。

每個階段的格式固定：

| 區塊 | 內容 |
|------|------|
| 目的 | 這個階段要達成什麼 |
| 產出檔案 | 完成後應該存在哪些檔案，以及每個檔案是「原樣複製」「修改後複製」還是「全新建立」 |
| 關鍵決策 | 這個階段中需要注意的判斷與取捨 |
| 驗收 | 具體的指令與預期輸出 |
| 常見錯誤 | 做這個階段時容易踩的坑 |

### 0.2 撰寫規範

實作時必須同時遵守：

- [`rules/flask-blueprint.md`](../rules/flask-blueprint.md) — 路由結構、表單處理、權限檢查、POST-Redirect-GET、CSS 類別命名
- [`rules/database.md`](../rules/database.md) — `db/` 套件使用方式、transaction 寫法、軟刪除模式、回傳值慣例
- [`tests/CLAUDE.md`](../tests/CLAUDE.md) — 測試命名與覆蓋要求

### 0.3 兩個來源專案

本系統由兩個既有專案組合而來，以下所有「從來源複製」的指示，來源都是它們：

| 代稱 | 目錄 | 提供 |
|------|------|------|
| **FORUM** | `sad-forum/` | 骨架、會員登入與管理系統、規範、測試架構、CSS token |
| **SAMPLE** | `Course-SAD-Sample-System/` | 校園活動報名子系統 |

> **兩者皆為唯讀參考資料，全程不得修改其中任何檔案。**
>
> 若已從本 repo 移除，可重新取得：
>
> ```bash
> git clone https://github.com/billy1125/Course-SAD-Sample-System.git
> ```

### 0.4 專案根目錄的現況

開始前，專案根目錄應該有：

```text
sad-events/
├── CLAUDE.md                     # 已改寫為只涵蓋本系統的版本
├── document/
│   ├── system-spec.md
│   └── build-guide.md            # 本文件
├── sad-forum/                    # FORUM（唯讀）
└── Course-SAD-Sample-System/     # SAMPLE（唯讀）
```

### 0.5 階段總覽

| Phase | 名稱 | 主要產出 | 相依 |
|:--:|------|---------|------|
| 0 | 環境準備 | 無（僅檢查） | — |
| 1 | 專案骨架與入口 | `app.py`、`utils.py`、`pytest.ini`、設定檔 | 0 |
| 2 | 資料存取層 | `db/` 套件（三個資料模組） | 1 |
| 3 | 共用樣板與 CSS | `base.html`、六個 CSS | 1 |
| 4 | auth 子系統 | 登入、註冊、驗證碼 | 2、3 |
| 5 | hub 子系統 | 首頁 | 4 |
| 6 | profile 子系統 | 個人資料 | 4、5 |
| 7 | admin 子系統 | 會員管理 | 2、6 |
| **8** | **events 子系統** | **校園活動報名（本系統主體）** | **2、5、7** |
| 9 | CSS 一致性稽核 | 無（僅檢查修正） | 3–8 |
| 10 | 測試 | `tests/` 全套 | 8 |
| 11 | Docker | 容器化設定 | 10 |
| 12 | 文件 | `CLAUDE.md`、`rules/`、`document/`、`README.md` | 10 |
| 13 | 最終整合驗收 | 無（僅檢查） | 全部 |

> **Phase 8（events）排在 admin 之後**，理由與 FORUM 把論壇排在 admin 之後相同：
> events 的守門修正必須有「停用帳號」這個來源才驗得起來，而 Phase 7 的會員管理提供了這個能力。
> 若只想先看到活動報名跑起來，可以把 Phase 8 提前到 Phase 5 之後，但守門的驗收要延後。

---

## Phase 0 — 環境準備

### 目的

確認工具鏈可用，並把已知的環境限制記錄下來，避免在後面的階段才發現。

### 產出檔案

無。這個階段只做檢查。

### 驗收

```bash
conda activate flask
python -V
```
預期：`Python 3.11.x`

```bash
python -c "import flask, bcrypt, captcha, pytest; print('ok')"
```
預期：`ok`。若缺套件，先建立 `requirements.txt`（Phase 1）再 `pip install -r requirements.txt`

```bash
pytest --version
```
預期：有版本輸出

```bash
which docker
```
若無輸出，代表本機未安裝 Docker CLI，Phase 11 只能做靜態檢查

```bash
ls sad-forum/ Course-SAD-Sample-System/
```
預期：兩個來源專案都在，且各自含 `app.py`、`db/`、`blueprints/`、`templates/`

### 關鍵決策記錄

**Docker CLI 是否可用**要在這個階段就確認。若不可用，Phase 11 只能確認設定檔內容正確，
無法實際建置映像與啟動容器。這個限制必須在該階段明確標示，不能假裝驗收通過。

### 常見錯誤

- 忘記 `conda activate flask`，結果 `pip install` 裝到 base 環境
- 用系統的 `python` 而非 conda 環境中的，導致套件找得到但版本不對

---

## Phase 1 — 專案骨架與入口

### 目的

建立可以被 Python 解析的專案入口、跨子系統共用的 helper，以及**測試收集範圍的限制**。

### 產出檔案

| 檔案 | 來源 | 動作 |
|------|------|------|
| `app.py` | FORUM | **修改後複製** |
| `utils.py` | FORUM | 原樣複製 |
| `blueprints/__init__.py` | FORUM | 原樣複製（空檔） |
| `requirements.txt` | FORUM | 原樣複製 |
| `.gitignore`、`.gitattributes` | FORUM | 原樣複製 |
| `.dockerignore` | FORUM | **修改後複製**（加入兩個參考目錄，見 Phase 11） |
| `.claude/settings.json` | FORUM | 原樣複製 |
| `pytest.ini` | — | **全新建立** |

### `app.py` 的修改內容

FORUM 的 `app.py` 註冊五個 Blueprint：`admin`、`auth`、`forum`、`hub`、`profile`。
把 `forum` 換成 `events`：

```python
from blueprints.events import events_bp   # 取代 from blueprints.forum import forum_bp
...
app.register_blueprint(events_bp)          # 取代 app.register_blueprint(forum_bp)
```

其餘完全不動：`app.secret_key`、`GET /health`、`app.run` 的參數。
這三項都帶有已知技術債（KI-05、KI-16、KI-24），依「沿用技術債」的原則保留。

> 註冊順序不影響行為，但建議維持字母序（admin、auth、events、hub、profile）。

### `pytest.ini` 的內容

```ini
[pytest]
testpaths = tests
norecursedirs = sad-forum Course-SAD-Sample-System .git __pycache__
```

**這個檔案是本專案特有的，兩個來源專案都沒有。**
理由是兩個來源目錄各自帶有 `tests/conftest.py`，若被 pytest 一併收集，
會產生 `ImportPathMismatchError`，導致**任何測試都無法執行**——包含本專案自己的測試。

移除那兩個目錄之後，這個設定可以留著（無害），也可以刪掉。

### 驗收

```bash
python -c "import ast; ast.parse(open('app.py').read()); print('syntax ok')"
```
預期：`syntax ok`。此時 Blueprint 目錄尚未建立，**無法實際 import 或啟動**

```bash
grep -c "register_blueprint" app.py
```
預期：`5`

```bash
grep -c "forum" app.py
```
預期：`0`

```bash
python -c "import utils; print(utils._is_usable({'is_active':1,'is_deleted':0}))"
```
預期：`1`（truthy）

### 常見錯誤

- 改了 `import` 卻忘記改 `register_blueprint`，或反過來
- 忘記 `blueprints/__init__.py`，導致 `blueprints` 不被視為套件
- 忘記 `pytest.ini`——這個錯誤要到 Phase 10 才會爆發，而且錯誤訊息完全看不出原因

---

## Phase 2 — 資料存取層

### 目的

建立四張資料表與 24 個存取函式。這是後續所有階段的基礎。

### 產出檔案

| 檔案 | 來源 | 動作 |
|------|------|------|
| `db/connection.py` | FORUM | 原樣複製 |
| `db/users.py` | FORUM | 原樣複製 |
| `db/events.py` | SAMPLE | **修改後複製** |
| `db/__init__.py` | FORUM | **修改後複製** |
| `db/CLAUDE.md` | — | **全新建立** |

### `db/__init__.py` 的修改內容

三處：

**1. 匯出清單從 forum 改為 events**

```python
from .events import (          # noqa: E402
    list_events, get_event, get_event_for_edit,
    create_event, update_event, soft_delete_event,
    list_registrations, list_all_registrations, get_registration,
    count_registered, create_or_restore_registration,
    cancel_registration, update_registration, list_my_registrations,
)
```

**注意 14 個函式中沒有 `admin_set_registration_status`。**
SAMPLE 定義了它，但沒有任何路由呼叫；搬過來就是死碼。理由記在規格書 §11.5。

**2. `init_db()` 的 import 與呼叫改為 events**

```python
from .events import _init_event_tables, _seed_events_if_empty
...
_init_event_tables(conn)
_seed_users_if_empty(conn)
_seed_events_if_empty(conn)   # 必須在種子帳號之後
```

**3. `users` 表的 DDL 與 `DB_PATH` 完全不動**

### `db/events.py` 的修改內容

SAMPLE 的版本有 370 行，改後約 480 行。四處修改：

**1. 移除 `admin_set_registration_status()`**（死碼，見上）

**2. 新增 `_SEED_EVENTS` 與 `_seed_events_if_empty()`**

這是本階段的主要工作。五筆活動各對應一種活動狀態：

| id | 標題 | 發起者 | 活動時間 | 報名期間 | 名額 | 狀態 |
|:--:|------|--------|---------|---------|:--:|------|
| 1 | 新生入學說明會 | 2 | −30 天 | 未設 | 200 | `ended` |
| 2 | 春季校園路跑 | 2 | +3 天 | −30 ～ −1 天 | 300 | `closed` |
| 3 | 系學會迎新茶會 | 1 | +7 天 | 未設 | 2 | `full` |
| 4 | 生成式 AI 實作工作坊 | 2 | +30 天 | +7 ～ +28 天 | 40 | `not_open` |
| 5 | 期末專題成果發表會 | 1 | +14 天 | 未設 | 40 | `available` |

時間一律用 `datetime('now', '±N days')`，**不寫死絕對日期**——
寫死的話過幾個月後五筆會全部變成 `ended`，五種狀態就看不出差異了。

實作上有一個關鍵技巧：

```python
# datetime('now', NULL) 在 SQLite 中回傳 NULL，
# 因此報名期間留空的活動不需要另外分支處理。
" VALUES (?, datetime('now', ?), ?, ?, datetime('now', ?), datetime('now', ?), ?)"
```

報名紀錄七筆：user 1 三筆 `registered`（活動 1、2、3）+ 一筆 `cancelled`（活動 5）；
user 2 兩筆 `registered`（活動 3、5）；user 3 **零筆**。

> user 3 零筆是刻意的——測試需要一個「沒有任何報名紀錄」的帳號來驗證
> 「我的報名」的空白狀態。若給了 user 3 報名紀錄，那個測試就沒東西可用了。

**3. `list_my_registrations()` 加選 `e.is_deleted`**

```sql
SELECT r.id, ..., e.event_title, e.event_datetime, e.event_place, e.is_deleted
```

活動被撤銷後報名紀錄仍要顯示（KI-12），模板需要這個欄位來加上「活動已撤銷」標記。

**4. 補齊三處 docstring 的例外標註**

`get_event`、`get_event_for_edit`、`list_my_registrations` 三個函式不過濾 `is_deleted`，
依 `rules/database.md` 的要求，**必須在 docstring 中明確標註**，否則讀者會誤以為是漏寫。

`soft_delete_event` 也要補一句說明「不動報名紀錄」是刻意的。

### 關鍵決策

**為什麼報名相關函式放在 `db/events.py` 而不是 `db/registrations.py`？**
模組拆分的依據是資料表群組，而 `list_events()` 必須 JOIN `registrations` 才能算出報名人數——
兩張表在查詢層面本來就分不開。同樣的判準也決定了會員管理的三個函式併入 `db/users.py`，
不建 `db/admin.py`。

### 驗收

```bash
python -c "
import db, tempfile, os
db.DB_PATH = os.path.join(tempfile.mkdtemp(), 't.db')
db.init_db()
print('tables ok')
"
```
預期：`tables ok`

```bash
python -c "
import db, tempfile, os
db.DB_PATH = os.path.join(tempfile.mkdtemp(), 't.db'); db.init_db()
import sqlite3
conn = sqlite3.connect(db.DB_PATH)
print(sorted(r[0] for r in conn.execute(
    \"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'\")))
"
```
預期：`['event_details', 'events', 'registrations', 'users']`

```bash
python -c "
import db, tempfile, os
db.DB_PATH = os.path.join(tempfile.mkdtemp(), 't.db'); db.init_db()
items, total = db.list_events(page=1, page_size=10)
print('total =', total)
for e in items:
    print(f\"  {e['id']} {e['event_title']}  {e['registered_count']}/{e['capacity']}\")
"
```
預期：`total = 5`，五筆依 `event_datetime` 升冪排列，且活動 3 顯示 `2/2`

```bash
python -c "
import db, tempfile, os
db.DB_PATH = os.path.join(tempfile.mkdtemp(), 't.db'); db.init_db()
print('user1 報名數 =', len(db.list_my_registrations(1)))
print('user3 報名數 =', len(db.list_my_registrations(3)))
print('活動3 有效報名 =', db.count_registered(3))
"
```
預期：`4`、`0`、`2`

```bash
python -c "
import db, tempfile, os
db.DB_PATH = os.path.join(tempfile.mkdtemp(), 't.db'); db.init_db()
# 取消後重新報名應恢復同一列
eid = 5
before = db.get_registration(eid, 1)
print('原本狀態 =', before['registration_status'], 'id =', before['id'])
r = db.create_or_restore_registration(eid, 1, 1, None, None, None, None)
after = db.get_registration(eid, 1)
print('回傳 =', r, '狀態 =', after['registration_status'], 'id =', after['id'])
print('同一列 =', before['id'] == after['id'])
print('cancelled_at 已清空 =', after['cancelled_at'] is None)
"
```
預期：`原本狀態 = cancelled`、`回傳 = restored`、`同一列 = True`、`cancelled_at 已清空 = True`

```bash
grep -c "admin_set_registration_status" db/events.py
```
預期：`0`

```bash
grep -c "with conn:" db/events.py
```
預期：`4`（`create_event`、`update_event`、`soft_delete_event`、`create_or_restore_registration`）

### 常見錯誤

- **`_seed_events_if_empty()` 放在 `_seed_users_if_empty()` 之前**——
  活動與報名的 `user_id` 指向種子帳號，順序顛倒不會報錯（沒有外鍵約束），
  但作者欄位會 JOIN 不到人，畫面顯示空白
- 忘記在 `db/__init__.py` 匯出某個函式，Blueprint 會在執行期才拋 `AttributeError`
- 種子活動的報名紀錄漏了 `cancelled_at`，導致活動 5 的已取消紀錄看起來像從未取消
- `list_my_registrations` 忘記加選 `e.is_deleted`，Phase 8 的模板會拋 `KeyError`

---

## Phase 3 — 共用樣板與 CSS

### 目的

建立所有子系統共用的 HTML 骨架與設計 token。

### 產出檔案

| 檔案 | 來源 | 動作 |
|------|------|------|
| `templates/base.html` | FORUM | **修改後複製**（`<title>` 預設值） |
| `static/common.css` | FORUM | 原樣複製 |
| `static/login.css` | FORUM | 原樣複製 |
| `static/hub.css` | FORUM | 原樣複製 |
| `static/profile.css` | FORUM | 原樣複製 |
| `static/admin.css` | FORUM | **修改後複製**（一行註解） |
| `static/events.css` | SAMPLE | **修改後複製** |

### `base.html` 的修改內容

一行：

```html
<title>{% block title %}校園活動報名系統{% endblock %}</title>
```

`common.css` 與 `login.css` 的載入順序不動——`common.css` 必須最先載入，
它定義的 CSS 自訂屬性是後續所有子系統的顏色來源。

### `static/events.css` 的修改內容

一處。`.events-btn` 補上兩個屬性：

```css
.events-btn {
  ...
  line-height: 1.5;
  vertical-align: middle;
}
```

理由：Phase 8 會把刪除與取消的按鍵從 `<a href="#" onclick>` 改為 `<button type="submit">`，
而 `<a>` 與 `<button>` 的預設 `line-height` 不同。同一列中兩者混用時，
按鈕會比連結高幾個像素。

### `static/admin.css` 的修改內容

一行註解：`骨架取自 forum.css 後改前綴` → `骨架取自 events.css 後改前綴`。

### 關鍵決策

**六個 CSS 之間沒有 import 關係。** `base.html` 載入 `common.css` 與 `login.css`，
其餘四個由各自的模板在 `{% block head %}` 中載入。
`hub.css`、`admin.css`、`events.css` 都以 `body { display: block }` 覆寫
`login.css` 的 flex 置中——這個覆寫是必要的，因為 `login.css` 是全域載入的。

### 驗收

```bash
grep -c "url_for('static'" templates/base.html
```
預期：`2`（common.css 與 login.css）

```bash
grep -o "\-\-btn-[a-z-]*" static/common.css | sort -u | wc -l
```
預期：`12`（五組按鍵 token）

```bash
grep -c "line-height" static/events.css
```
預期：≥ 2

```bash
# 各子系統 CSS 不得寫死按鍵色碼
grep -n "background-color: #" static/events.css | grep -v badge
```
預期：**無輸出**（按鍵顏色一律 `var(--btn-*)`）

### 常見錯誤

- 忘記複製 `common.css`，所有 `var(--btn-*)` 解析失敗，按鍵變成透明背景
- `base.html` 的 `{% block head %}` 放在 `<link>` 之前，導致子系統 CSS 被 `login.css` 覆蓋

---

## Phase 4 — auth 子系統

### 目的

建立身分驗證的完整流程：登入、申請帳號、登出、圖形驗證碼。

### 產出檔案

| 檔案 | 來源 | 動作 |
|------|------|------|
| `blueprints/auth/__init__.py` | FORUM | 原樣複製 |
| `blueprints/auth/CLAUDE.md` | FORUM | 原樣複製 |
| `templates/auth/login.html` | FORUM | **修改後複製**（標題文字） |
| `templates/auth/register.html` | FORUM | 原樣複製 |
| `document/auth.md` | FORUM | 原樣複製 |

### 修改內容

`login.html` 的第二個 `<h2>`：`會員管理系統 v1.0` → `校園活動報名系統 v1.0`。

其餘完全不動。auth 子系統與活動報名沒有任何耦合——
它只認識 `session['user_id']` 與 `hub.home` 這個 endpoint。

### 關鍵決策

**`login.html` 與 `register.html` 的 `<form>` 必須保留 `class="login-form"`。**
`login.css` 的 `button[type="submit"]` 樣式限定在這個選擇器內；缺少的話送出按鈕會沒有樣式。
全系統恰有三處需要這個 class，第三處是 Phase 5 的 `hub/home.html`。

### 驗收

```bash
python -c "from blueprints.auth import auth_bp; print([str(r) for r in auth_bp.deferred_functions and []] or 'ok')"
```
預期：`ok`（能 import 即可）

```bash
grep -c 'class="login-form"' templates/auth/login.html templates/auth/register.html
```
預期：各 `1`

```bash
grep -c "校園活動報名系統" templates/auth/login.html
```
預期：`1`

此時 `hub` 尚未建立，**無法啟動 app**（`url_for('hub.home')` 會失敗）。
完整驗收要等 Phase 5。

### 常見錯誤

- 漏掉 `class="login-form"`，按鈕變成瀏覽器預設樣式
- 以為要改 `auth/__init__.py` 中的 `redirect(url_for('hub.home'))`——不用，hub 的 endpoint 名稱沒變

---

## Phase 5 — hub 子系統

### 目的

建立服務入口首頁，把活動報名掛上去。

### 產出檔案

| 檔案 | 來源 | 動作 |
|------|------|------|
| `blueprints/hub/__init__.py` | FORUM | 原樣複製 |
| `blueprints/hub/CLAUDE.md` | — | **全新建立** |
| `templates/hub/home.html` | FORUM | **修改後複製** |
| `document/hub.md` | — | **全新建立** |

### `blueprints/hub/__init__.py` 為什麼零修改

它完全不認識任何子系統——只做三件事：查使用者、處理內嵌登入、渲染模板。
服務卡片的內容全部在模板中決定。這是「Blueprint 不互相 import」原則的直接好處。

### `templates/hub/home.html` 的修改內容

服務卡片從三張（個人資料、論壇、會員管理）改為四張：

**已登入視圖：**

```html
<a href="{{ url_for('events.index') }}" class="hub-card">
  <div class="hub-card-icon">&#128197;</div>          <!-- 📅 -->
  <div class="hub-card-title">校園活動報名</div>
  <div class="hub-card-desc">瀏覽活動、報名、辦理活動</div>
</a>

<a href="{{ url_for('events.my_registrations') }}" class="hub-card">
  <div class="hub-card-icon">&#128203;</div>          <!-- 📋 -->
  <div class="hub-card-title">我的報名</div>
  <div class="hub-card-desc">查詢自己的報名紀錄</div>
</a>
```

加上原本的「個人資料」與條件顯示的「會員管理」，共四張。

**訪客視圖：** 四張卡片中只有「校園活動報名」是可點的 `<a>`，
其餘三張是 `hub-card-locked` 的 `<div>`：

| 卡片 | 鎖定標籤 |
|------|---------|
| 我的報名 | `🔒 需登入` |
| 個人資料 | `🔒 需登入` |
| 會員管理 | `🔒 需管理員權限` |

**「我的報名」對訪客上鎖，但「校園活動報名」不上鎖**——
因為 `GET /events` 本身不需登入，而 `/events/my` 套用了 `@login_required`。
卡片的鎖定狀態必須忠實反映後端的守門，否則使用者點下去只會被踢回登入頁。

其餘（topbar 標題、內嵌登入表單、驗證碼刷新的兩個 `onclick`）除了把
「會員管理系統 v1.0」改成「校園活動報名系統 v1.0」、
「歡迎使用會員管理系統」改成「歡迎使用校園活動報名系統」之外完全不動。

### 驗收

此時 `events` 尚未建立，`url_for('events.index')` 會失敗。
**先在 `app.py` 中暫時註解掉 events 的註冊與 import，並把 `home.html` 的兩張活動卡片
暫時改為 `#`，即可驗收 hub 的其餘部分**；或直接把 Phase 5 的驗收延後到 Phase 8 之後。

延後驗收的話，先做語法檢查：

```bash
python -c "import ast; ast.parse(open('blueprints/hub/__init__.py').read()); print('ok')"
```

```bash
grep -c 'class="login-form"' templates/hub/home.html
```
預期：`1`

```bash
grep -c "hub-card-locked" templates/hub/home.html
```
預期：`3`

```bash
grep -c "url_for('events" templates/hub/home.html
```
預期：`3`（已登入的兩張 + 訪客的一張）

### 常見錯誤

- 訪客視圖的「我的報名」做成可點的 `<a>`，使用者點下去被踢回登入頁
- 忘記 `hub/home.html` 的內嵌登入表單也要 `class="login-form"`
- 卡片數量改了，但 `hub.css` 的 `.hub-grid` 的 `minmax(180px, 1fr)` 不用改——它是自適應的

---

## Phase 6 — profile 子系統

### 目的

建立個人資料的查看與編輯。

### 產出檔案

| 檔案 | 來源 | 動作 |
|------|------|------|
| `blueprints/profile/__init__.py` | FORUM | 原樣複製 |
| `blueprints/profile/CLAUDE.md` | FORUM | 原樣複製 |
| `templates/profile/dashboard.html` | FORUM | 原樣複製 |
| `document/profile.md` | FORUM | **修改後複製**（一段對照文字） |

### 全部零修改的理由

profile 只操作 `users` 表的兩個欄位（`name`、`display_name`），與活動報名毫無關係。

### `document/profile.md` 的修改內容

一段。原文把 KI-03 與 forum 的守門做對照，改為與 events 對照：

```markdown
> 值得對照的是：`events` 對同一個問題做了**相反**的處置（修補了守門）。
> 兩者的判準見規格書 §11.0——缺陷的影響是否會外溢到當事人以外的人。
> profile 只能改自己的姓名，events 能產生公開內容（活動與報名名單），還會佔用別人的名額。
```

### 關鍵決策

**`POST /profile/update` 缺少 `_is_usable` 檢查（KI-03）是刻意保留的。請勿順手補上。**

它是「技術債如何跨功能傳染」的核心教材：admin 的停用功能被這三行的缺席直接架空。
Phase 13 的最終驗收會實際觸發這個缺陷，確認它仍然存在。

### 驗收

```bash
grep -c "_is_usable" blueprints/profile/__init__.py
```
預期：`2`（import 一次 + `dashboard` 中用一次；`dashboard_update` 中**沒有**）

```bash
grep -c "login-form" templates/profile/dashboard.html
```
預期：`0`（profile 的表單不加此 class）

```bash
grep -c "events" document/profile.md
```
預期：≥ 2

### 常見錯誤

- 「順手」補上 `dashboard_update` 的 `_is_usable` 檢查——這會讓 Phase 13 的驗收失敗
- 給 profile 的 `<form>` 加上 `class="login-form"`，輸入框與按鈕都會套錯樣式

---

## Phase 7 — admin 子系統

### 目的

建立管理員的會員治理功能。這個階段的產出是 Phase 8 守門驗收的前提。

### 產出檔案

| 檔案 | 來源 | 動作 |
|------|------|------|
| `blueprints/admin/__init__.py` | FORUM | 原樣複製 |
| `blueprints/admin/CLAUDE.md` | FORUM | **修改後複製**（三處 forum → events） |
| `templates/admin/user_list.html` | FORUM | **修改後複製**（加一條導覽連結） |
| `templates/admin/user_detail.html` | FORUM | 原樣複製 |
| `document/admin.md` | FORUM | 原樣複製 |

### `templates/admin/user_list.html` 的修改內容

topbar 加一條連結：

```html
<a href="{{ url_for('events.index') }}" class="admin-nav-link">活動列表</a>
```

### `blueprints/admin/CLAUDE.md` 的修改內容

三處把 `forum` 的對照改為 `events`：守門收斂的理由、驗證順序相反的理由、
`.col-*` 欄寬工具類的共用對象。這三段的**論點完全沒變**，只是對照的子系統換了。

### 關鍵決策

**三層權限檢查在每個路由開頭明碼重複寫出，不抽象成裝飾器。**
這個重複是刻意的教學設計：讀者從任一路由的第一行就能讀出完整的守門條件。
`rules/flask-blueprint.md` 明文規定，請勿重構。

**`_is_admin(user)` 定義在 Blueprint 內部，不放進 `utils.py`。**
Phase 8 的 events 會定義自己的 `_is_admin`，內容一模一樣——這也是刻意的。

### 驗收

```bash
grep -c "無操作權限" blueprints/admin/__init__.py
```
預期：`6`（六條路由各一次）

```bash
grep -c "session.clear()" blueprints/admin/__init__.py
```
預期：`6`

```bash
grep -n "_is_usable\|_is_admin" blueprints/admin/__init__.py | head -4
```
預期：可看到 `_is_usable` 出現在 `_is_admin` **之前**（順序不可調換）

```bash
grep -c "url_for('events" templates/admin/user_list.html
```
預期：`1`

### 常見錯誤

- 把 `_is_admin` 檢查放在 `_is_usable` 之前——停用中的管理員會收到「權限不足」而非被登出
- 把三層檢查抽成裝飾器「讓程式碼更乾淨」
- 放寬三條自我保護規則（R1–R3）中的任何一條，卻沒有補上管理員計數檢查

---

## Phase 8 — events 子系統

### 目的

建立本系統的主體：校園活動報名。

### 產出檔案

| 檔案 | 來源 | 動作 |
|------|------|------|
| `blueprints/events/__init__.py` | SAMPLE | **修改後複製** |
| `blueprints/events/CLAUDE.md` | — | **全新建立** |
| `templates/events/index.html` | SAMPLE | **修改後複製** |
| `templates/events/event_form.html` | SAMPLE | **修改後複製** |
| `templates/events/registration_form.html` | SAMPLE | **修改後複製** |
| `templates/events/my_registrations.html` | SAMPLE | **修改後複製** |
| `document/events.md` | SAMPLE | **修改後複製** |

### `blueprints/events/__init__.py` 的修改內容

SAMPLE 的版本有 483 行。六處修改：

**1.（關鍵）`_current_user()` 加上帳號有效性檢查**

SAMPLE 的版本：

```python
def _current_user():
    if 'user_id' in session:
        return db.find_user_by_id(session['user_id'])
    return None
```

改為：

```python
def _current_user():
    """從 session 取得目前登入且帳號有效的使用者，否則回傳 None。"""
    if 'user_id' not in session:
        return None
    user = db.find_user_by_id(session['user_id'])
    return user if _is_usable(user) else None
```

**這是本階段最重要的一行修改。** 沒有它，被停用的帳號只要 session 未清，
仍能建立公開活動、報名並佔用別人的名額，讓 Phase 7 的停用功能形同虛設。
理由與判準見規格書 §11.0 與 §11.5。

**2.（連帶）七條寫入路由各自處理 `user is None`**

`_current_user()` 現在會回傳 `None`，因此每條寫入路由開頭都要：

```python
user = _current_user()
if user is None:
    session.clear()
    return redirect(url_for('auth.login_page'))
```

SAMPLE 原本在 `new_event` 與 `register` 用的是
`if not _is_usable(user): flash('帳號已停用...'); redirect(events.index)`，
**這兩段要整段換掉**。其餘五條路由原本完全沒有這層檢查，要新增。

> 不要把 `session.clear()` 塞進 `_current_user()`：訪客與失效帳號在它眼中都是 `None`，
> 但只有後者需要清 session。

**`index` 是唯一不加這段的路由**——它必須把 `None` 當成合法的訪客狀態繼續渲染。

**3. 標籤 dict 從模板搬到 Blueprint，並拆成兩份**

SAMPLE 在三個模板中各自用 `{% set status_labels = {...} %}` 定義中文標籤，
且把活動狀態與報名狀態混在一起。改為在 Blueprint 中定義兩個模組層級常數：

```python
STATUS_LABELS     = {'available': '可報名', 'full': '名額已滿', ...}      # 活動狀態
REG_STATUS_LABELS = {'registered': '已報名', 'cancelled': '已取消', ...}  # 報名狀態
MEAL_LABELS       = {0: '不用餐', 1: '葷食', 2: '素食'}
```

並在 `render_template()` 中傳入。**兩者刻意不合併**——活動狀態與報名狀態是兩組
完全不同的字彙，合併會讓讀者以為它們是同一個東西。

**4. 表單欄位常數化**

SAMPLE 在 `new_event` 與 `edit_event` 中各自把十個欄位名稱列了一遍（共三處）。
抽成模組層級常數：

```python
_EVENT_FIELDS = ('event_title', 'event_datetime', ..., 'event_notice')
_REGISTRATION_FIELDS = ('participant_name', ..., 'registration_note')
```

**5. 抽出 `_parse_dt()`**

SAMPLE 在 `_event_status()` 內部定義了一個巢狀的 `_parse()`，
而 `_normalize_dt()` 與 `_validate_event_form()` 又各自重寫了一次 try/except。
統一為模組層級的 `_parse_dt(s)`，回傳 `datetime` 或 `None`。

**6. 錯誤訊息統一為「活動不存在或已刪除」**

SAMPLE 分成 `活動不存在` 與 `活動已刪除` 兩則。合併為一則，
與 FORUM 的 `文章不存在或已刪除` 一致。理由是兩者對使用者而言沒有差別，
而分開會洩漏「這個 id 曾經存在」這個資訊。

**保留不動的部分：** `_PAGE_SIZE = 5`、八條路由的路徑與方法、
`_event_status()` 的五段判斷與順序、報名的二次狀態判定、
`_validate_event_form()` 的十二條驗證與順序、所有 `db.*` 的呼叫方式。

### 模板的修改內容

**1.（關鍵）`<a href="#" onclick>` 全部改為 `<button type="submit">`**

SAMPLE 的寫法：

```html
<a href="#" class="events-btn-action events-btn-action-danger"
   onclick="if(confirm('確定刪除此活動？')){this.closest('form').submit()}; return false;">刪除</a>
```

改為：

```html
<button type="submit" class="events-btn-action events-btn-action-danger"
        onclick="return confirm('確定刪除此活動？')">刪除</button>
```

共六處：`index.html` 三處（清單刪除、細節刪除、取消報名）、
`my_registrations.html` 一處（取消報名），以及對應的兩個 confirm 文案調整。

理由：`<a>` 的語意是導航，這裡是有副作用的 POST。而且原寫法的鍵盤操作與
螢幕閱讀器行為不正確。FORUM 已採用 `<button>` 寫法，本系統沿用其慣例。

**2. 標籤 dict 改由 Blueprint 傳入**

刪掉三個模板頂端的 `{% set status_labels = {...} %}`，
改用 `STATUS_LABELS`、`REG_STATUS_LABELS`、`MEAL_LABELS`。

**3. `my_registrations.html` 加上「活動已撤銷」處理**

活動被軟刪除後，報名紀錄仍要顯示（KI-12），但活動名稱不該再是連結：

```html
{% if reg['is_deleted'] %}
  {{ reg['event_title'] }}
  <span class="events-badge events-badge-ended">活動已撤銷</span>
{% else %}
  <a href="{{ url_for('events.index', event_id=reg['event_id']) }}"
     class="events-title-link">{{ reg['event_title'] }}</a>
{% endif %}
```

操作欄的條件也要加上 `and not reg['is_deleted']`。

**4. `index.html` 的報名操作區簡化**

SAMPLE 用四個 `{% elif %}` 分別列出 ended / closed / not_open / full 的提示文字。
改為一個 `{% else %}` 搭配 `STATUS_LABELS[selected_status]`：

```html
{% else %}
  <span class="events-reg-hint">{{ STATUS_LABELS[selected_status] }}，目前無法報名</span>
{% endif %}
```

**5. 表單欄位加上 `id` 與 `<label for>` 的配對**

SAMPLE 的 `<label>` 沒有 `for` 屬性。補上，讓點擊標籤能聚焦到對應欄位。

**6. flash 分類統一**

改為 `{{ 'error' if category == 'error' else 'success' }}`，與 admin 的模板一致。

### 驗收

```bash
python -c "from app import app; print(len([r for r in app.url_map.iter_rules() if r.endpoint.startswith('events.')]))"
```
預期：`8`

```bash
python -c "
from app import app
for r in sorted(app.url_map.iter_rules(), key=lambda x: x.rule):
    if r.endpoint.startswith('events.'):
        print(f\"{sorted(r.methods - {'HEAD','OPTIONS'})}  {r.rule}\")
"
```
預期：八條路由，方法與規格書 §7.1 第 14–21 列一致

**訪客瀏覽：**

```bash
python - <<'PY'
import os, tempfile
os.environ['DB_PATH'] = os.path.join(tempfile.mkdtemp(), 'p8.db')
import db; db.DB_PATH = os.environ['DB_PATH']; db.init_db()
from app import app; app.config['TESTING'] = True
c = app.test_client()
body = c.get('/events').get_data(as_text=True)
for s in ('available', 'full', 'closed', 'not_open', 'ended'):
    print(s, '->', f'events-badge-{s}' in body)
print('訪客看不到新增按鈕 ->', '+ 新增活動' not in body)
PY
```
預期：五種 badge 皆 `True`，最後一行 `True`

**五種狀態的計算：**

```bash
python - <<'PY'
import os, tempfile
os.environ['DB_PATH'] = os.path.join(tempfile.mkdtemp(), 'p8b.db')
import db; db.DB_PATH = os.environ['DB_PATH']; db.init_db()
from blueprints.events import _event_status
from datetime import datetime
now = datetime.now()
for eid in range(1, 6):
    ev = db.get_event(eid)
    print(eid, ev['event_title'], '->', _event_status(ev, now))
PY
```
預期：依序為 `ended`、`closed`、`full`、`not_open`、`available`

**守門修正（本階段的重點驗收）：**

```bash
python - <<'PY'
import os, tempfile
os.environ['DB_PATH'] = os.path.join(tempfile.mkdtemp(), 'p8c.db')
import db; db.DB_PATH = os.environ['DB_PATH']; db.init_db()
from app import app; app.config['TESTING'] = True

# 先確認啟用中的帳號可以建立活動
c = app.test_client()
with c.session_transaction() as s: s['user_id'] = 1
before = db.list_events(page=1, page_size=99)[1]
c.post('/events/new', data={
    'event_title': '正常建立', 'event_datetime': '2030-01-01T10:00',
    'event_place': '地點', 'capacity': '10', 'event_note': '內容',
    'registration_start_at': '', 'registration_end_at': '',
    'event_target': '', 'event_contact': '', 'event_notice': '',
})
print('啟用帳號可建立 ->', db.list_events(page=1, page_size=99)[1] == before + 1)

# 管理員停用 user 1
a = app.test_client()
with a.session_transaction() as s: s['user_id'] = 2
a.post('/admin/users/1/deactivate')
print('已停用 ->', db.find_user_by_id(1)['is_active'] == 0)

# 同一個 client（session 未清）再次嘗試建立活動
before = db.list_events(page=1, page_size=99)[1]
resp = c.post('/events/new', data={
    'event_title': '停用後建立', 'event_datetime': '2030-01-01T10:00',
    'event_place': '地點', 'capacity': '10', 'event_note': '內容',
    'registration_start_at': '', 'registration_end_at': '',
    'event_target': '', 'event_contact': '', 'event_notice': '',
})
print('被擋下 ->', resp.status_code == 302 and '/login' in resp.headers['Location'])
print('資料庫無變化 ->', db.list_events(page=1, page_size=99)[1] == before)

# 但瀏覽仍然可以，且以訪客身分呈現
g = app.test_client()
with g.session_transaction() as s: s['user_id'] = 1
body = g.get('/events').get_data(as_text=True)
print('仍可瀏覽 ->', '活動清單' in body)
print('以訪客身分 ->', '+ 新增活動' not in body)
PY
```
預期：全部 `True`

**報名的三個核心行為：**

```bash
python - <<'PY'
import os, tempfile
os.environ['DB_PATH'] = os.path.join(tempfile.mkdtemp(), 'p8d.db')
import db; db.DB_PATH = os.environ['DB_PATH']; db.init_db()
from app import app; app.config['TESTING'] = True
c = app.test_client()
with c.session_transaction() as s: s['user_id'] = 1

# 1. 額滿的活動（id=3）不能報名 —— 換用 user 3（先啟用）
db.set_user_active(3, 1)
c3 = app.test_client()
with c3.session_transaction() as s: s['user_id'] = 3
r = c3.post('/events/3/register', data={'meal_type': '0'}, follow_redirects=True)
print('額滿被擋 ->', '活動名額已滿' in r.get_data(as_text=True))

# 2. 可報名的活動（id=5），user 1 曾取消，重新報名應恢復同一列
old = db.get_registration(5, 1)
c.post('/events/5/register', data={'meal_type': '1'})
new = db.get_registration(5, 1)
print('恢復同一列 ->', old['id'] == new['id'] and new['registration_status'] == 'registered')
print('報名紀錄仍只有一筆 ->',
      len([r for r in db.list_all_registrations(5) if r['user_id'] == 1]) == 1)

# 3. 重複報名被擋
r = c.post('/events/5/register', data={'meal_type': '0'}, follow_redirects=True)
print('重複被擋 ->', '您已報名此活動' in r.get_data(as_text=True))
PY
```
預期：全部 `True`

**元素語意檢查：**

```bash
grep -rn 'href="#"' templates/events/
```
預期：**無輸出**

```bash
grep -rc "button type=\"submit\"" templates/events/index.html
```
預期：`3`

### 常見錯誤

- **`_current_user()` 改了，但七條寫入路由忘記處理 `None`**——
  執行期會在 `user['id']` 拋 `TypeError: 'NoneType' object is not subscriptable`
- **在 `index` 也加上 `if user is None: redirect`**——訪客就進不去活動列表了
- 把 `session.clear()` 塞進 `_current_user()`——訪客的 session 也會被清（雖然本來就是空的，
  但語意錯誤，且未來加入其他 session 內容時會出事）
- 報名的 POST 忘記重新查活動與重算狀態，直接沿用 GET 時算好的 `status`
- `STATUS_LABELS` 與 `REG_STATUS_LABELS` 合併成一個 dict——
  `'cancelled'` 與 `'closed'` 的中文都跟「取消／截止」有關，混用時很難察覺錯誤
- 模板改用 `<button>` 之後忘記 `events.css` 的 `line-height` 修正（Phase 3），
  按鈕與旁邊的 `<a>` 高度不齊

---

## Phase 9 — CSS 一致性稽核

### 目的

確認六個 CSS 檔案遵守同一套設計 token 體系，並記錄所有例外。

### 產出檔案

無新檔案，只做檢查與必要的修正。

### 驗收

**1. 按鍵顏色一律用 token，不寫死色碼**

```bash
grep -n "btn" static/*.css | grep "#[0-9a-fA-F]\{3,6\}"
```
預期：**無輸出**

**2. 已知的兩處例外**

```bash
grep -n "hub-register-link\|hub-logout" static/hub.css | head
```
預期：可看到寫死的 `#4a90e2` 與 `#e53935`。
**這是 KI-31，刻意保留。** 它們的類別名稱不含 `btn`，因此上一條稽核抓不到

```bash
grep -c "badge" static/events.css static/admin.css
```
預期：兩者皆 > 0。狀態 badge 的底色硬編碼是 KI-19，刻意保留

**3. 各子系統的按鍵前綴不互相污染**

```bash
grep -c "events-btn" static/admin.css; grep -c "admin-btn" static/events.css
```
預期：兩者皆 `0`

**4. `.login-form` 恰好三處**

```bash
grep -rlc 'class="login-form"' templates/
```
預期：`templates/auth/login.html`、`templates/auth/register.html`、`templates/hub/home.html`
三個檔案，其他都沒有

**5. 唯一允許的跨子系統重複：欄寬工具類**

```bash
grep -c "^\.col-" static/admin.css static/events.css
```
預期：兩者皆 > 0。它們只管欄寬、不管顏色，是唯一允許的重複

**6. inline event handler 的總數與位置**

```bash
grep -rc "onclick" templates/ | grep -v ":0"
```
預期：恰好六個檔案，總數 10 —— `auth/login.html` 2、`hub/home.html` 2、
`events/index.html` 3、`events/my_registrations.html` 1、
`admin/user_list.html` 1、`admin/user_detail.html` 1

### 常見錯誤

- 看到 `hub.css` 的寫死色碼就「順手修掉」——它是 KI-31，修掉會讓文件與程式碼不一致
- 為了消除 `.col-*` 的重複而把它搬到 `common.css`——各子系統的表格欄位本來就不一樣

---

## Phase 10 — 測試

### 目的

建立 152 個自動化測試案例。

### 產出檔案

| 檔案 | 來源 | 動作 |
|------|------|------|
| `tests/__init__.py` | FORUM | 原樣複製（空檔） |
| `tests/conftest.py` | FORUM | 原樣複製 |
| `tests/data/__init__.py` | FORUM | 原樣複製（空檔） |
| `tests/data/users.py` | FORUM | **修改後複製** |
| `tests/test_auth.py` | FORUM | 原樣複製（23 個） |
| `tests/test_profile.py` | FORUM | 原樣複製（8 個） |
| `tests/test_admin.py` | FORUM | 原樣複製（30 個） |
| `tests/test_hub.py` | FORUM | **改寫**（11 個） |
| `tests/test_events.py` | SAMPLE | **大幅改寫**（36 → 80 個） |
| `tests/CLAUDE.md` | — | **全新建立** |

### `tests/conftest.py` 為什麼零修改

五個 fixture 完全不涉及子系統：建暫存 DB、建 test client、注入三種 session。
`db.init_db()` 會自動植入種子活動，不需要額外設定。

### `tests/data/users.py` 的修改內容

**1. 新增 `SEED_EVENTS` 常數**

```python
SEED_EVENTS = {
    'ended':     {'id': 1, 'title': '新生入學說明會',       'capacity': 200},
    'closed':    {'id': 2, 'title': '春季校園路跑',         'capacity': 300},
    'full':      {'id': 3, 'title': '系學會迎新茶會',       'capacity': 2},
    'not_open':  {'id': 4, 'title': '生成式 AI 實作工作坊', 'capacity': 40},
    'available': {'id': 5, 'title': '期末專題成果發表會',   'capacity': 40},
}
```

**以狀態為 key**，測試就能直接寫 `SEED_EVENTS['full']['id']`，
不必自行建構一個處於特定時間條件的活動。

**2. `MESSAGES` 新增 28 條 events 訊息**

FORUM 的 `MESSAGES` 有 22 條（auth 11 + admin 11），加上 events 的 28 條共 **50 條**。

> **這裡修正了 FORUM 的一個不一致（其 KI-29）。** FORUM 的論壇訊息散落在
> `test_forum.py` 的斷言字面量中，與集中管理的 auth／admin 訊息不一致。
> 本系統把 events 的訊息全部集中，不繼承這個問題。

### `tests/test_hub.py` 的改寫內容

11 個案例。原本斷言「論壇」的三個改為斷言活動相關，並新增三個：

| 新增的案例 | 驗什麼 |
|-----------|--------|
| `test_hub_shows_my_registrations_link_when_logged_in` | 登入後「我的報名」是可點的連結 |
| `test_hub_hides_my_registrations_link_for_guest` | 訪客看不到 `/events/my`，且有 locked 卡片 |
| `test_hub_guest_can_reach_events` | 訪客的活動卡片 `href="/events/"`（注意尾斜線） |

尾斜線那一點值得注意：`events.index` 宣告 `strict_slashes=False`，
`url_for()` 產生的是 `/events/` 而非 `/events`。斷言時要寫對。

### `tests/test_events.py` 的改寫內容

SAMPLE 有 36 個案例，改寫後 **80 個**。主要工作有五項：

**1. 新增三個種子資料測試**

驗證五筆種子活動確實涵蓋五種狀態、名額計算正確。
這是「測試種子資料本身」的少數合理情境——因為後續 20 幾個測試都依賴它。

**2. 新增 `_event_form(**overrides)` 表單工廠**

活動表單有十個欄位，每個驗證測試都寫一遍會淹沒重點：

```python
def test_new_event_capacity_zero(authed_client):
    resp = authed_client.post('/events/new', data=_event_form(capacity='0'))
    assert MESSAGES['eventCapacityNotPositive'].encode() in resp.data
```

**3. 新增 `_enable_other()` helper**

`events._current_user()` 現在會把停用帳號視為 `None`，因此「他人無權限」的測試
若直接用 `other_client`（user 3，停用中），會被更前面的守門攔下，測不到權限那一層：

```python
def _enable_other(user_id=3):
    db.set_user_active(user_id, 1)
```

**這是 Phase 8 的守門修正帶來的連鎖影響**，SAMPLE 的測試沒有這個問題（因為它沒修）。

**4. 補齊「資料庫沒有改變」的斷言**

SAMPLE 的 `test_edit_event_non_creator_rejected` 只驗 302。補上：

```python
def test_edit_event_post_by_other_changes_nothing(other_client, event):
    _enable_other()
    other_client.post(f'/events/{event}/edit', data=_event_form(event_title='被竄改的標題'))
    assert db.get_event(event)['event_title'] == '測試活動'
```

**5. 新增停用帳號、恢復報名、活動撤銷等案例**

| 新增的案例 | 驗什麼 |
|-----------|--------|
| `test_new_event_disabled_user_redirected_to_login` | Phase 8 的守門修正 |
| `test_register_after_cancel_restores_same_row` | 恢復的是同一列，不是第二筆 |
| `test_my_registrations_keeps_record_of_deleted_event` | KI-12 的刻意行為 |
| `test_cancel_frees_a_slot` | 取消後名額立即釋出 |
| `test_edit_event_capacity_equal_to_registered_allowed` | 邊界值（等於是允許的） |

### 驗收

```bash
pytest -q
```
預期：`152 passed`

```bash
for f in tests/test_*.py; do echo -n "$f: "; pytest "$f" --collect-only -q 2>/dev/null | grep -c "::"; done
```
預期：`admin 30`、`auth 23`、`events 80`、`hub 11`、`profile 8`

```bash
python -c "from tests.data.users import MESSAGES, SEED_EVENTS; print(len(MESSAGES), len(SEED_EVENTS))"
```
預期：`50 5`

```bash
# 確認參考專案沒有被收集
pytest --collect-only -q 2>/dev/null | grep -c "sad-forum\|Course-SAD"
```
預期：`0`

### 常見錯誤

- **忘記 `pytest.ini`**——`pytest` 會收集三份 `conftest.py` 並拋
  `ImportPathMismatchError`，訊息完全看不出真正的原因
- 「他人無權限」的測試忘記 `_enable_other()`，測到的是帳號有效性那一層而非權限層
- 同一個測試中同時請求 `authed_client` 與 `admin_client`——它們是同一個物件
- 活動數量寫死絕對值（`assert total == 6`），種子資料一改就全面崩潰

---

## Phase 11 — Docker

### 目的

提供可重現的容器化執行環境。

### 產出檔案

| 檔案 | 來源 | 動作 |
|------|------|------|
| `Dockerfile` | FORUM | 原樣複製 |
| `docker-compose.yml` | FORUM | 原樣複製 |
| `.dockerignore` | FORUM | **修改後複製**（加入兩個參考目錄） |

### 為什麼 `Dockerfile` 與 `docker-compose.yml` 零修改

兩個檔案完全不認識子系統。`Dockerfile` 只做「裝套件、複製程式碼、跑 `app.py`」，
`docker-compose.yml` 只設定 port、volume 與兩個環境變數。

### 靜態驗收

```bash
grep "python:" Dockerfile
```
預期：`FROM python:3.11-slim`

```bash
grep -A2 "environment" docker-compose.yml
```
預期：`SECRET_KEY` 與 `DB_PATH=/app/data/database.db`

```bash
grep "4000" Dockerfile docker-compose.yml
```
預期：`EXPOSE 4000` 與 `"4000:4000"`

```bash
cat .dockerignore
```
預期：排除 `__pycache__/`、`*.pyc`、`.git/`、`tests/`，
**以及 `sad-forum/` 與 `Course-SAD-Sample-System/`**

> 最後兩行是本專案相對於 FORUM 新增的。少了它們，`COPY . .` 會把兩個參考目錄
> （含各自的 `.git`）一併打包進映像，映像會肥大許多。
> 若已移除那兩個目錄，這兩行留著無害。

### 動態驗收（需要 Docker CLI）

```bash
docker compose up -d --build
curl -s localhost:4000/health          # 預期：OK
curl -s localhost:4000/events | head -5 # 預期：HTML
docker compose down
```

持久化驗證：

```bash
docker compose up -d
# 在瀏覽器中建立一場新活動
docker compose restart
# 該活動應仍然存在
docker compose down -v   # 這一步才會真的刪掉資料
```

若本機沒有 Docker CLI，**必須在此明確標示動態驗收未執行**，不能假裝通過。

### 常見錯誤

- 忘記在 `docker-compose.yml` 設定 `DB_PATH`，資料庫會寫在容器內的 `/app/database.db`，
  容器重建後資料全失
- 用 `docker compose down -v` 當成一般的停止指令——`-v` 會刪掉 named volume

---

## Phase 12 — 文件

### 目的

補齊所有說明文件，讓下一個接手的人（或 AI 助理）能理解系統。

### 產出檔案

| 檔案 | 動作 |
|------|------|
| `CLAUDE.md`（根目錄） | **全新建立** |
| `README.md` | **全新建立** |
| `db/CLAUDE.md` | **全新建立** |
| `blueprints/events/CLAUDE.md` | **全新建立** |
| `blueprints/hub/CLAUDE.md` | **全新建立** |
| `blueprints/{auth,profile}/CLAUDE.md` | 原樣複製自 FORUM |
| `blueprints/admin/CLAUDE.md` | **修改後複製**（Phase 7 已完成） |
| `tests/CLAUDE.md` | **全新建立** |
| `rules/flask-blueprint.md` | **修改後複製** |
| `rules/database.md` | **修改後複製** |
| `document/events.md` | **修改後複製**（Phase 8 已完成） |
| `document/hub.md` | **全新建立** |
| `document/{auth,profile,admin}.md` | 原樣或小改（Phase 4/6/7 已完成） |
| `document/system-spec.md` | **全新建立** |
| `document/build-guide.md` | **全新建立**（本文件） |

### `rules/database.md` 的修改內容

三處把 forum 的例子換成 events：

**1. transaction 的四個實例**

| 函式 | 為何需要 |
|------|---------|
| `create_event` | 主表 INSERT 成功但副表失敗，會留下一場沒有活動內容的活動 |
| `update_event` | 主表更新成功但副表失敗，基本資訊與活動說明會互相矛盾 |
| `soft_delete_event` | 主表標記刪除但副表沒標記，會留下孤兒的 `event_details` |
| `create_or_restore_registration` | 先 SELECT 再決定 INSERT 或 UPDATE，兩步之間必須是原子操作 |

**注意第四個是 FORUM 沒有的形態**——前三個是「多張表同時寫」，
第四個是「同一張表的讀寫必須原子」。

**2. 不過濾 `is_deleted` 的例外從兩類變成三類**

新增「例外三：`list_my_registrations()`」——它 JOIN `events` 但刻意不過濾
`events.is_deleted`（KI-12）。

**3. 模組拆分準則新增一條**

「報名相關的函式併入 `db/events.py`，不建 `db/registrations.py`」，
理由是 `list_events()` 必須 JOIN `registrations` 才能算出報名人數。

### `rules/flask-blueprint.md` 的修改內容

一處：「開放瀏覽的子系統」章節中的 `GET /forum` 改為 `GET /events`。
**該章節的論述完全不用改**——它描述的正是 events 採用的做法。

### `document/events.md` 的修改內容

SAMPLE 的版本描述的是未修正的實作。三處要更新：

1. 權限規則加上「`_current_user()` 已包含帳號有效性檢查」與其後果
2. 錯誤訊息從 `活動不存在` / `活動已刪除` 改為 `活動不存在或已刪除`
3. 移除 `admin_set_registration_status` 的相關描述

### 驗收

```bash
ls CLAUDE.md README.md db/CLAUDE.md tests/CLAUDE.md \
   blueprints/*/CLAUDE.md rules/*.md document/*.md | wc -l
```
預期：`18`（根 2 + `db/` 1 + `tests/` 1 + 五個 Blueprint 各 1 + `rules/` 2 + `document/` 7）

```bash
# 程式碼與樣板中不應有任何 forum 殘留
grep -rn "forum\|論壇" --include="*.py" --include="*.html" --include="*.css" . \
  --exclude-dir=sad-forum --exclude-dir=Course-SAD-Sample-System
```
預期：**無輸出**

```bash
# Markdown 中的 forum 應只出現在「說明遷移或範圍」的脈絡
grep -rln "forum\|論壇" --include="*.md" . \
  --exclude-dir=sad-forum --exclude-dir=Course-SAD-Sample-System
```
預期：六個檔案——`README.md`、`CLAUDE.md`（宣告範圍外與血緣）、
`tests/CLAUDE.md`（引述 FORUM 的 KI-29）、`document/system-spec.md`（血緣與範圍）、
`document/build-guide.md`（本文件，描述改哪幾行）、`document/hub.md`（一句對照）。
其他檔案若出現 forum，代表複製時漏改

```bash
# 路由總表的條數與實際一致
python -c "from app import app; print(len([r for r in app.url_map.iter_rules() if r.endpoint != 'static']))"
grep -c "^| [0-9]" document/system-spec.md   # §7.1 的列數
```
預期：兩者皆為 `22`

```bash
# CLAUDE.md 宣稱的測試數與實際一致
grep -o "152" CLAUDE.md README.md tests/CLAUDE.md document/system-spec.md | wc -l
pytest -q 2>&1 | tail -1
```
預期：文件中多處提到 `152`，且 `pytest` 實際回報 `152 passed`

### 常見錯誤

- 從 FORUM 複製 `rules/` 卻忘記把 forum 的例子換成 events，
  讀者會去找一個不存在的 `db/forum.py`
- 文件中的路由數、測試數、訊息條數與實際不符——這些數字要從程式碼實際數出來
- 忘記寫 `document/hub.md`，`CLAUDE.md` 的連結會 404

---

## Phase 13 — 最終整合驗收

### 目的

確認整個系統可執行、可測試，且所有刻意保留的技術債仍然存在。

### 產出檔案

無。這個階段只做檢查。

### 驗收

**1. 全套測試通過**

```bash
pytest -q
```
預期：`152 passed`

**2. 所有頁面可渲染**

```bash
python - <<'PY'
import os, tempfile
os.environ['DB_PATH'] = os.path.join(tempfile.mkdtemp(), 'final.db')
import db; db.DB_PATH = os.environ['DB_PATH']; db.init_db()
from app import app; app.config['TESTING'] = True
c = app.test_client()

guest = ['/', '/login', '/register', '/health', '/events/', '/events/?event_id=5']
for r in guest:
    print(f'{c.get(r).status_code}  guest  {r}')

with c.session_transaction() as s: s['user_id'] = 2   # admin
admin = ['/', '/profile', '/profile?edit=1', '/admin/users', '/admin/users/1',
         '/events/', '/events/?event_id=5', '/events/my', '/events/new', '/events/edit/5']
for r in admin:
    print(f'{c.get(r).status_code}  admin  {r}')
PY
```
預期：全部 `200`

**3. 五種活動狀態同時可見**

```bash
python - <<'PY'
import os, tempfile
os.environ['DB_PATH'] = os.path.join(tempfile.mkdtemp(), 'final2.db')
import db; db.DB_PATH = os.environ['DB_PATH']; db.init_db()
from app import app; app.config['TESTING'] = True
body = app.test_client().get('/events').get_data(as_text=True)
for s in ('available','full','closed','not_open','ended'):
    print(s, '->', f'events-badge-{s}' in body)
PY
```
預期：全部 `True`

**4. 停用帳號的完整行為（含刻意保留的 KI-03）**

```bash
python - <<'PY'
import os, tempfile
os.environ['DB_PATH'] = os.path.join(tempfile.mkdtemp(), 'final3.db')
import db; db.DB_PATH = os.environ['DB_PATH']; db.init_db()
from app import app; app.config['TESTING'] = True

def fresh(uid):
    c = app.test_client()
    with c.session_transaction() as s: s['user_id'] = uid
    return c

# 管理員停用 user 1
a = fresh(2); a.post('/admin/users/1/deactivate')
print('已停用 ->', db.find_user_by_id(1)['is_active'] == 0)

# events 寫入：應被擋下
r = fresh(1).post('/events/5/register', data={'meal_type': '0'})
print('events 報名被擋 ->', r.status_code == 302 and '/login' in r.headers['Location'])

r = fresh(1).get('/events/my')
print('events 我的報名被擋 ->', r.status_code == 302 and '/login' in r.headers['Location'])

# events 瀏覽：應仍可讀，但以訪客身分
body = fresh(1).get('/events').get_data(as_text=True)
print('events 仍可瀏覽 ->', '活動清單' in body)
print('  且以訪客身分 ->', '+ 新增活動' not in body)

# profile GET：應被擋下（這一步會 session.clear()，所以下面要另開 client）
r = fresh(1).get('/profile')
print('profile GET 被擋 ->', r.status_code == 302 and '/login' in r.headers['Location'])

# profile POST：應**成功** —— KI-03，刻意保留的缺陷
fresh(1).post('/profile/update', data={'name': 'KI-03 仍然存在', 'display_name': ''})
print('profile POST 仍成功（KI-03）->', db.find_user_by_id(1)['name'] == 'KI-03 仍然存在')
PY
```
預期：全部 `True`。**最後一行必須是 `True`**——若變成 `False`，
代表有人「順手」補上了 KI-03，違反規格書 §11.0 的判準

**5. 元素語意檢查**

```bash
grep -rn 'href="#"' templates/
```
預期：**無輸出**

```bash
grep -rc "onclick" templates/ | grep -v ":0" | wc -l
```
預期：`6`（六個檔案，共 10 處）

**6. 模組邊界檢查**

```bash
# Blueprint 中不得出現 SQL 語句
grep -rn --include="*.py" "SELECT \|INSERT INTO\|UPDATE .* SET\|DELETE FROM" blueprints/
```
預期：**無輸出**

```bash
# Blueprint 中的 sqlite3 參照
grep -rn --include="*.py" "sqlite3" blueprints/
```
預期：**只有 `blueprints/auth/__init__.py` 兩行**（`import sqlite3` 與
`except sqlite3.IntegrityError`）。這是沿用 FORUM 的既有洩漏——auth 因此知道
資料庫是 SQLite。記錄為規格書 KI-36，刻意保留。其他 Blueprint 應為零

```bash
# Blueprint 之間不得互相 import
grep -rn "from blueprints" blueprints/
```
預期：**無輸出**

```bash
# _is_admin 不得出現在 utils.py
grep -c "_is_admin" utils.py
```
預期：`0`

**7. 兩個參考目錄未被修改**

```bash
cd sad-forum && git status --porcelain && cd ..
cd Course-SAD-Sample-System && git status --porcelain && cd ..
```
預期：**無輸出**（兩個 repo 都是乾淨的）

### 完工檢查清單

- [ ] `pytest -q` 回報 152 passed
- [ ] `python app.py` 可啟動，瀏覽器能開啟 <http://localhost:4000>
- [ ] 首頁訪客視圖有四張卡片，只有「校園活動報名」可點
- [ ] 活動列表同時顯示五種狀態的 badge
- [ ] 可用種子帳號登入，能建立活動、報名、取消、修改報名
- [ ] 額滿的活動（系學會迎新茶會）無法報名
- [ ] 管理員可在 `/admin/users` 停用帳號，該帳號隨即無法建立活動或報名
- [ ] KI-03 仍然存在（停用帳號仍可 POST `/profile/update`）
- [ ] 16 份文件齊備，數字（22 條路由、152 個測試、50 條訊息）與實際一致
- [ ] `sad-forum/` 與 `Course-SAD-Sample-System/` 未被修改

---

## 附錄：完整檔案清單

### A. 原樣複製（22 個）

**來自 FORUM：**

```
utils.py
blueprints/__init__.py
requirements.txt
.gitignore  .gitattributes
.claude/settings.json
Dockerfile  docker-compose.yml
db/connection.py  db/users.py
blueprints/auth/__init__.py      blueprints/auth/CLAUDE.md
blueprints/hub/__init__.py
blueprints/profile/__init__.py   blueprints/profile/CLAUDE.md
blueprints/admin/__init__.py
templates/auth/register.html
templates/profile/dashboard.html
templates/admin/user_detail.html
static/common.css  static/login.css  static/hub.css  static/profile.css
tests/__init__.py  tests/conftest.py  tests/data/__init__.py
tests/test_auth.py  tests/test_profile.py  tests/test_admin.py
document/auth.md  document/admin.md
```

### B. 修改後複製（16 個）

| 檔案 | 來源 | 修改幅度 |
|------|------|---------|
| `app.py` | FORUM | 兩行（forum → events） |
| `.dockerignore` | FORUM | 兩行（排除兩個參考目錄） |
| `db/__init__.py` | FORUM | 匯出清單 + `init_db()` 三行 |
| `db/events.py` | SAMPLE | 四處（種子活動、移除死碼、加選欄位、docstring） |
| `templates/base.html` | FORUM | 一行（`<title>`） |
| `templates/auth/login.html` | FORUM | 一行（標題文字） |
| `templates/hub/home.html` | FORUM | 服務卡片全改 |
| `templates/admin/user_list.html` | FORUM | 一行（導覽連結） |
| `templates/events/index.html` | SAMPLE | 六處 |
| `templates/events/event_form.html` | SAMPLE | 三處 |
| `templates/events/registration_form.html` | SAMPLE | 三處 |
| `templates/events/my_registrations.html` | SAMPLE | 四處 |
| `static/admin.css` | FORUM | 一行註解 |
| `static/events.css` | SAMPLE | 兩個 CSS 屬性 |
| `blueprints/events/__init__.py` | SAMPLE | 六處（含守門修正） |
| `blueprints/admin/CLAUDE.md` | FORUM | 三處對照 |
| `tests/data/users.py` | FORUM | 加 `SEED_EVENTS` + 28 條訊息 |
| `tests/test_hub.py` | FORUM | 改寫 11 個案例 |
| `tests/test_events.py` | SAMPLE | 大幅改寫（36 → 80） |
| `rules/database.md` | FORUM | 三處例子 |
| `rules/flask-blueprint.md` | FORUM | 一處例子 |
| `document/profile.md` | FORUM | 一段對照 |
| `document/events.md` | SAMPLE | 三處 |

### C. 全新建立（10 個）

```
pytest.ini
CLAUDE.md
README.md
db/CLAUDE.md
blueprints/events/CLAUDE.md
blueprints/hub/CLAUDE.md
tests/CLAUDE.md
document/system-spec.md
document/build-guide.md
document/hub.md
```

### D. 明確不搬移

| 項目 | 來源 | 為什麼不搬 |
|------|------|-----------|
| `blueprints/forum/`、`templates/forum/`、`static/forum.css`、`db/forum.py`、`tests/test_forum.py` | FORUM | 討論區不在範圍內 |
| `blueprints/equipment/` 及相關檔案 | SAMPLE | 器材借用不在範圍內 |
| `db.admin_set_registration_status()` | SAMPLE | 沒有任何路由呼叫，搬過來就是死碼 |
| `setup/` 一次性種子機制 | SAMPLE | 改用與種子帳號同一套的 `_seed_events_if_empty()` |
| `document/web-system-spec.md`、`web-build-guide.md` | FORUM | 純前端平行實作，本專案沒有對應版本 |

### E. events 相關檔案總覽（跨階段速查）

| 檔案 | 階段 | 動作 |
|------|:--:|------|
| `db/events.py` | 2 | 修改後複製（SAMPLE） |
| `db/__init__.py` | 2 | 修改後複製（FORUM） |
| `static/events.css` | 3 | 修改後複製（SAMPLE） |
| `templates/hub/home.html` | 5 | 修改後複製（FORUM）——掛上活動卡片 |
| `blueprints/events/__init__.py` | 8 | 修改後複製（SAMPLE）——含守門修正 |
| `templates/events/*.html` × 4 | 8 | 修改後複製（SAMPLE） |
| `blueprints/events/CLAUDE.md` | 8 | 全新建立 |
| `document/events.md` | 8 | 修改後複製（SAMPLE） |
| `tests/test_events.py` | 10 | 大幅改寫（SAMPLE） |
| `tests/data/users.py` | 10 | 修改後複製（FORUM）——加 `SEED_EVENTS` |
