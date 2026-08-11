# 校園訂餐系統 — 建置流程書

## 0. 文件資訊

| 項目 | 內容 |
|------|------|
| 文件名稱 | 校園訂餐系統 建置流程書 |
| 版本 | v1.0 |
| 日期 | 2026-08-11 |
| 上位依據 | [`document/system-spec.md`](system-spec.md) |
| 適用對象 | 要把這個系統從無到有建起來的人 |

### 0.1 這份文件是什麼

系統規格書說明「系統是什麼」，這份文件說明「怎麼把它建出來」。

流程分為 **15 個階段**，每個階段都是一個可以獨立完成、獨立驗收的單位。階段之間有明確
的相依順序，不建議跳著做——後面的階段預設前面的產出已經存在且驗收通過。

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

- [`rules/flask-blueprint.md`](../rules/flask-blueprint.md) — 路由結構、表單處理、
  權限檢查、POST-Redirect-GET、CSS 類別命名
- [`rules/database.md`](../rules/database.md) — `db/` 套件使用方式、transaction 寫法、
  軟刪除模式、回傳值慣例
- [`tests/CLAUDE.md`](../tests/CLAUDE.md) — 測試命名與覆蓋要求

### 0.4 專案根目錄的現況

開始前，專案根目錄應該有：

```text
SAD-Meal-Order/
└── document/
    ├── system-spec.md
    └── build-guide.md            # 本文件
```

### 0.5 階段總覽

| Phase | 名稱 | 主要產出 | 相依 |
|:--:|------|---------|------|
| 0 | 環境準備 | 無（僅檢查） | — |
| 1 | 專案骨架與入口 | `app.py`、`utils.py`、`pytest.ini`、設定檔 | 0 |
| 2 | 會員資料層 | `db/{__init__,connection,users}.py` | 1 |
| 3 | 共用樣板與 CSS | `base.html`、`common.css`、`login.css` | 1 |
| 4 | auth 子系統 | 登入、註冊、驗證碼 | 2、3 |
| 5 | hub 子系統 | 首頁 | 4 |
| 6 | profile 子系統 | 個人資料 | 4、5 |
| 7 | admin 子系統 | 會員管理 | 2、6 |
| **8** | **訂餐資料層** | **`db/meals.py`：三張表、狀態機、庫存規則** | **2** |
| **9** | **meal 子系統** | **Blueprint、六個樣板、`meal.css`** | **5、8** |
| 10 | 首頁整合 | `hub/home.html` 的服務卡片 | 9 |
| 11 | CSS 一致性稽核 | 無（僅檢查修正） | 3–10 |
| 12 | 測試 | `tests/` 全套 152 個案例 | 10 |
| 13 | Docker | 容器化設定 | 12 |
| 14 | 文件與最終驗收 | `CLAUDE.md`、`rules/`、`document/` | 12 |

> **Phase 8 與 9 拆開**是本流程書最重要的結構決策。訂餐子系統的難點不在路由，而在
> 狀態機與庫存的一致性——那些全部在資料層。把資料層先做完並用 Python REPL 直接驗收，
> 可以在還沒有任何畫面的情況下確認「確認扣庫存、取消回補」是對的。等到接上路由才發現
> 庫存算錯，除錯範圍會大兩倍。

---

## Phase 0 — 環境準備

### 目的

確認工具鏈可用，並把已知的環境限制記錄下來。

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
預期：**可能無輸出**。若本機未安裝 Docker CLI，Phase 13 只能做靜態檢查

預期：兩個目錄都存在且有 `app.py`

### 關鍵決策記錄

**Docker CLI 是否可用**要在這裡確認並記錄。若不可用，Phase 13 只能檢查設定檔內容正確，
無法實際建置映像與啟動容器。這個限制必須在該階段明確標示，不能假裝驗收通過。

### 常見錯誤

- 忘記 `conda activate flask`，結果 `pip install` 裝到 base 環境
- 用系統的 `python` 而非 conda 環境中的

---

## Phase 1 — 專案骨架與入口

### 目的

建立可以被 Python 解析的專案入口、跨子系統共用的 helper，以及**測試邊界設定**。

### 產出檔案

| 檔案 | 動作 |
|------|------|
| `app.py` | **建立** |
| `utils.py` | 建立 |
| `blueprints/__init__.py` | 建立（空檔） |
| `requirements.txt` | 建立 |
| `pytest.ini` | **建立** |
| `.gitignore` / `.gitattributes` / `.dockerignore` | 建立 |
| `.claude/settings.json` | 建立 |

### `app.py` 的修改內容

兩處修改：

**1. Blueprint import 中的 `forum` 換成 `meal`**

```python
from blueprints.admin import admin_bp
from blueprints.auth import auth_bp
from blueprints.hub import hub_bp
from blueprints.meal import meal_bp        # 原本是 forum_bp
from blueprints.profile import profile_bp
```

**2. `register_blueprint` 同步替換**

註冊順序不影響行為，但建議維持字母序（admin、auth、hub、meal、profile），與各處
的慣例一致。

**保留不動的部分：** `app.secret_key` 那一行、`GET /health` 路由、`app.run` 的參數。
這三項都帶有已知技術債（KI-05、KI-16、KI-24），依「保留既有技術債作為教材」的原則不動。

> 此時 `blueprints/meal/` 尚未建立，**無法實際 import 或啟動**。可以先把 meal 的兩行
> 註解掉，等 Phase 9 再打開；或直接寫上去，只做語法檢查不做 import 檢查。本流程書
> 採後者。

### `pytest.ini` 的內容

```ini
[pytest]
testpaths = tests
norecursedirs = .git __pycache__
```

**這個檔案不是可選的。** 沒有它的話，`pytest` 會同時收集三套 `tests/conftest.py`，
產生 `ImportPathMismatchError`，導致**一個測試都跑不起來**。

### 驗收

```bash
python -c "import ast; ast.parse(open('app.py').read()); print('syntax ok')"
```
預期：`syntax ok`

```bash
grep -c "register_blueprint" app.py
```
預期：`5`

```bash
grep -c "forum" app.py
```
預期：`0`

```bash
python -c "import utils; print(utils.CAPTCHA_LENGTH)"
```
預期：`5`

```bash
test -f pytest.ini && grep -q "testpaths = tests" pytest.ini && echo "pytest.ini ok"
```
預期：`pytest.ini ok`

### 常見錯誤

- 忘記 `blueprints/__init__.py`，導致 `blueprints` 不被視為套件
- 忘記建立 `pytest.ini`，到 Phase 12 才發現測試完全跑不起來，卻誤以為是自己的測試寫錯
- `pytest.ini` 只寫 `norecursedirs` 而沒寫 `testpaths`——前者對「以 rootdir 為起點的
  收集」有效，但兩者都寫才保險

---

## Phase 2 — 會員資料層

### 目的

建立 `users` 資料表與所有存取它的函式。這是後續所有階段的基礎。

### 產出檔案

| 檔案 | 動作 |
|------|------|
| `db/connection.py` | 建立 |
| `db/users.py` | 建立 |
| `db/__init__.py` | **建立** |

### `db/__init__.py` 的修改內容

**1. `from .forum import (...)` 整段刪除**，Phase 8 再換成 `from .meals import (...)`

**2. `init_db()` 中的訂餐部分暫時留白**

```python
def init_db():
    from .connection import _get_conn
    from .users import _seed_users_if_empty

    conn = _get_conn()
    conn.execute("""CREATE TABLE IF NOT EXISTS users (...)""")
    conn.commit()
    _seed_users_if_empty(conn)
    conn.close()
```

`_init_meal_tables()` 與 `_seed_meals_if_empty()` 在 Phase 8 加入。

### 關鍵決策

**`DB_PATH` 必須定義在 `db/__init__.py` 頂層，且 `_get_conn()` 在呼叫時才讀取它。**
這兩件事合起來讓測試可以用 `db.DB_PATH = str(tmp_path / 'test.db')` 動態替換路徑。
若 `connection.py` 在 import 時就把值抓進區域變數，替換會無效。

### 驗收

```bash
python -c "
import db
db.DB_PATH = '/tmp/t1.db'
db.init_db()
u = db.find_user_by_email('admin@example.com')
print(u['id'], u['role'], u['is_active'])
"
```
預期：`2 0 1`

```bash
python -c "
import db, os
db.DB_PATH = '/tmp/t2.db'
db.init_db()
items, total = db.list_users(1, 10, 'all', None)
print(total, [r['email'] for r in items])
"
```
預期：`3 ['user@example.com', 'admin@example.com', 'disabled@example.com']`

```bash
python -c "
import db
db.DB_PATH = '/tmp/t3.db'
db.init_db()
db.init_db()   # 第二次呼叫不應重複植入
print(db.list_users(1, 10, 'all', None)[1])
"
```
預期：`3`（不是 6——`_seed_users_if_empty` 有 count 檢查）

```bash
rm -f /tmp/t1.db /tmp/t2.db /tmp/t3.db
```

### 常見錯誤

- 把 `DB_PATH` 寫進 `connection.py`，測試替換失效
- `_seed_users_if_empty` 忘了 count 檢查，每次啟動都重複植入直到 UNIQUE 衝突
- 在 `db/__init__.py` 的 import 區塊沒加 `# noqa: E402`，linter 報錯

---

## Phase 3 — 共用樣板與 CSS

### 目的

建立所有頁面共用的 HTML 骨架與設計 token。

### 產出檔案

| 檔案 | 動作 |
|------|------|
| `templates/base.html` | **建立**（預設 title 改為「校園訂餐系統」） |
| `static/common.css` | 建立 |
| `static/login.css` | 建立 |

### 關鍵決策

**`common.css` 是全站按鍵顏色的單一來源。** 後續每個子系統的 CSS 都必須透過
`var(--btn-*)` 引用，不得寫死色碼。這條規則在 Phase 11 會被稽核。

**`login.css` 的 `button[type="submit"]` 樣式限定在 `.login-form` 選擇器內。**
這是為了避免它污染其他子系統的按鍵。只有三個 `<form>` 需要加這個 class。

### 驗收

```bash
grep -c "^  --btn" static/common.css
```
預期：`15`（五組 token 共 15 個變數）

```bash
grep -c "\.login-form button" static/login.css
```
預期：`3`（normal、hover、disabled）

```bash
grep -o "校園訂餐系統" templates/base.html
```
預期：`校園訂餐系統`

### 常見錯誤

- 把 `login.css` 的 `button[type="submit"]` 選擇器留成全域，導致 `meal` 與 `admin`
  的所有送出按鈕都變成藍色滿版
- `base.html` 忘了 `{% block head %}`，子樣板無法引入自己的 CSS

---

## Phase 4 — auth 子系統

### 目的

建立登入、申請帳號、登出、圖形驗證碼。

### 產出檔案

| 檔案 | 動作 |
|------|------|
| `blueprints/auth/__init__.py` | 建立 |
| `blueprints/auth/CLAUDE.md` | 建立 |
| `templates/auth/login.html` | **建立**（標題改為「校園訂餐系統 v1.0」） |
| `templates/auth/register.html` | 建立 |

### 修改內容

`login.html` 第 7 行：`<h2>會員管理系統 v1.0</h2>` → `<h2>校園訂餐系統 v1.0</h2>`。
其餘零修改。

### 關鍵決策

**驗證順序不可調換**：驗證碼 → 帳密非空 → 帳號存在且密碼正確 → 帳號啟用。
驗證碼排最前面，是因為它擋掉的是自動化嘗試，應該在任何資料庫查詢之前就失敗。

**「帳號已停用」與「帳號或密碼錯誤」是不同訊息**，且已刪除的帳號回傳後者。
停用是可逆的管理動作，告訴使用者有助於申訴；已刪除則不洩漏「這個 email 曾經存在」。

### 驗收

此時 `hub` 尚未建立，`url_for('hub.home')` 會失敗，因此**無法完整啟動**。只做語法與
靜態檢查：

```bash
python -c "import ast; ast.parse(open('blueprints/auth/__init__.py').read()); print('ok')"
```
預期：`ok`

```bash
grep -c "@auth_bp.route" blueprints/auth/__init__.py
```
預期：`4`

```bash
grep -c 'class="login-form"' templates/auth/login.html templates/auth/register.html
```
預期：兩個檔案各 `1`

### 常見錯誤

- 把 `session['captcha']` 的比對寫成大小寫敏感（表單值必須先 `.upper()`）
- `register` 忘了捕捉 `sqlite3.IntegrityError`，email 重複時直接 500

---

## Phase 5 — hub 子系統

### 目的

建立系統入口頁。這是第一個可以實際啟動並用瀏覽器看到的階段。

### 產出檔案

| 檔案 | 動作 |
|------|------|
| `blueprints/hub/__init__.py` | 建立 |
| `blueprints/hub/CLAUDE.md` | **建立**（服務卡片表） |
| `templates/hub/home.html` | **建立**（暫時移除 forum 卡片） |
| `static/hub.css` | 建立 |

### 關鍵決策

**這個階段先不要處理訂餐卡片。** 把 forum 卡片整段刪掉，留下個人資料與會員管理兩張
（都還沒建，但 `url_for` 會在 Phase 6、7 之後才可用——所以這個階段先把它們也註解掉，
只留頂端列與登入表單）。訂餐卡片統一在 **Phase 10** 加入。

理由是 `url_for('meal.index')` 在 `meal` Blueprint 註冊之前會拋
`BuildError`，硬要在這裡寫就得先寫一個空的 Blueprint 佔位，反而更亂。

### 驗收

```bash
python -c "
from app import app
app.config['TESTING'] = True
import db; db.DB_PATH = '/tmp/t5.db'; db.init_db()
c = app.test_client()
r = c.get('/')
print(r.status_code, '歡迎使用' in r.get_data(as_text=True))
"
```
預期：`200 True`

```bash
python -c "
from app import app
import db; db.DB_PATH = '/tmp/t5.db'; db.init_db()
app.config['TESTING'] = True
c = app.test_client()
with c.session_transaction() as s: s['captcha'] = 'ABCDE'
r = c.post('/', data={'email':'admin@example.com','password':'admin1234','captcha':'abcde'})
print(r.status_code, r.headers.get('Location'))
"
```
預期：`302 /`（內嵌登入成功）

```bash
rm -f /tmp/t5.db
```

### 常見錯誤

- 內嵌登入表單的 `<form>` 忘了 `class="login-form"`，按鍵樣式跑掉
- `hub.home` 對失效帳號的處置寫成 `redirect('/login')`。**正確做法是清 session 後
  退回訪客視圖**——首頁是公開頁，把人踢到登入頁沒有道理

---

## Phase 6 — profile 子系統

### 目的

建立個人資料的檢視與編輯。

### 產出檔案

| 檔案 | 動作 |
|------|------|
| `blueprints/profile/__init__.py` | 建立 |
| `blueprints/profile/CLAUDE.md` | 建立 |
| `templates/profile/dashboard.html` | 建立 |
| `static/profile.css` | 建立 |

### 關鍵決策

**`POST /profile/update` 刻意缺少 `_is_usable` 檢查（KI-03）。**

`GET /profile` 有這個檢查，`POST /profile/update` 沒有。這不是疏漏，是核心教材——
它示範「技術債如何跨功能傳染」：admin 的停用功能會因為這三行的缺席而部分失效。

**請勿「順手」補上。** 若你補了，Phase 12 的 `test_profile.py` 會有一個測試失敗，
而那個測試正是用來確認這個缺陷還在的。

### 驗收

```bash
python -c "
from app import app
import db; db.DB_PATH = '/tmp/t6.db'; db.init_db()
app.config['TESTING'] = True
c = app.test_client()
with c.session_transaction() as s: s['user_id'] = 1
print('GET  /profile     ', c.get('/profile').status_code)
c2 = app.test_client()
db.set_user_active(1, 0)
with c2.session_transaction() as s: s['user_id'] = 1
print('停用後 GET  /profile', c2.get('/profile').status_code, '(應 302)')
c3 = app.test_client()
with c3.session_transaction() as s: s['user_id'] = 1
c3.post('/profile/update', data={'name':'KI-03 還在'})
print('停用後 POST 更新結果 ', db.find_user_by_id(1)['name'], '(應為 KI-03 還在)')
"
rm -f /tmp/t6.db
```
預期：

```
GET  /profile      200
停用後 GET  /profile 302 (應 302)
停用後 POST 更新結果  KI-03 還在 (應為 KI-03 還在)
```

> 第三行成功正是 KI-03 的表現。它**必須**成功。

### 常見錯誤

- 補上了 `_is_usable`，破壞教材
- 驗證 KI-03 時重用了同一個 client——`GET /profile` 那一步會 `session.clear()`，
  後續的 POST 就變成未登入。必須另開一個乾淨的 client

---

## Phase 7 — admin 子系統

### 目的

建立會員帳號治理：清單、篩選、搜尋、分頁、啟用／停用、角色調整、軟刪除。

### 產出檔案

| 檔案 | 動作 |
|------|------|
| `blueprints/admin/__init__.py` | 建立 |
| `blueprints/admin/CLAUDE.md` | **建立**（三處 forum 對照改為 meal） |
| `templates/admin/user_list.html` | 建立 |
| `templates/admin/user_detail.html` | 建立 |
| `static/admin.css` | 建立 |

### 關鍵決策

**三層權限檢查在每個路由開頭明碼重複寫出，不抽象成裝飾器。** 六條路由各寫一次，
共 18 行重複。這個重複是刻意的教學設計——讀者從任一路由的第一行就能讀出完整的守門條件。

**檢查順序不可調換**：`login_required` → `_is_usable` → `_is_admin`。若把
`_is_admin` 放前面，已被停用的管理員會收到與事實不符的「權限不足」，且 session
不會被清除。

**R1–R3 自我保護規則**（不可停用／刪除／改角色自己）保證系統中永遠至少有一個可用的
管理員，因此**不實作管理員計數檢查**。

### 驗收

```bash
python - <<'EOF'
from app import app
import db; db.DB_PATH = '/tmp/t7.db'; db.init_db()
app.config['TESTING'] = True

# 一般使用者被擋，且資料未變
c = app.test_client()
with c.session_transaction() as s: s['user_id'] = 1
before = db.find_user_by_id(3)['is_active']
r = c.post('/admin/users/3/activate')
print('一般使用者 activate ->', r.status_code, '資料未變:', db.find_user_by_id(3)['is_active'] == before)

# 管理員可操作
a = app.test_client()
with a.session_transaction() as s: s['user_id'] = 2
a.post('/admin/users/3/activate')
print('管理員 activate ->', db.find_user_by_id(3)['is_active'] == 1)

# R1：不可停用自己
a.post('/admin/users/2/deactivate')
print('R1 自己仍啟用 ->', db.find_user_by_id(2)['is_active'] == 1)

# 停用中的管理員被第 2 層擋下（而非第 3 層）
db.set_user_role(3, 0); db.set_user_active(3, 0)
d = app.test_client()
with d.session_transaction() as s: s['user_id'] = 3
r = d.get('/admin/users')
print('停用管理員 ->', r.status_code, '/login' in r.headers['Location'])
with d.session_transaction() as s: print('session 已清 ->', 'user_id' not in s)
EOF
rm -f /tmp/t7.db
```
預期：

```
一般使用者 activate -> 302 資料未變: True
管理員 activate -> True
R1 自己仍啟用 -> True
停用管理員 -> 302 True
session 已清 -> True
```

### 常見錯誤

- 只驗 302 就以為權限有效。302 無法區分「被擋下」與「執行成功後 redirect」，
  **必須同時斷言資料庫沒有改變**
- 把三層抽成裝飾器（違反本專案的教學設計）
- `list_users()` 加上硬性的 `is_deleted = 0` 過濾，導致「已刪除」篩選永遠是空的

---

## Phase 8 — 訂餐資料層

### 目的

建立 `meals`、`meal_orders`、`meal_order_items` 三張表，以及**狀態機與庫存規則的
全部實作**。這個階段結束時，訂餐的所有業務邏輯都已經可以在沒有畫面的情況下驗收。

### 產出檔案

| 檔案 | 動作 |
|------|------|
| `db/meals.py` | **建立** |
| `db/__init__.py` | **修改**（加入 meals 匯出與 `init_db()` 的兩行） |
| `db/CLAUDE.md` | **建立** |

### 從 `equipment.py` 改寫的六件事

| # | equipment | meals | 為什麼 |
|---|-----------|-------|--------|
| 1 | 三張表 `equipment` / `borrow_orders` / `borrow_order_items` | `meals` / `meal_orders` / `meal_order_items` | 換領域 |
| 2 | 明細無金額欄位 | **加 `unit_price`、`subtotal`**；主檔加 `total_amount` | 借用不涉及金額，訂餐涉及 |
| 3 | 七個訂單狀態（含不可達的 `overdue`） | **五個**，全部可達 | 刪掉死狀態；併掉 `approved` / `borrowed` 的兩段式 |
| 4 | 扣庫存在 `mark_order_borrowed` | 扣庫存在 `confirm_meal_order` | 訂餐沒有「登記借出」這一步 |
| 5 | `mark_order_returned` 回補庫存 | `complete_meal_order` **不回補** | 便當吃掉就沒了，器材會還回來 |
| 6 | 借用起訖時間（兩個 datetime） | 取餐日期 + 時段 + 地點 | 訂餐是一個時間點，不是一段區間 |

### `db/meals.py` 的骨架

```python
ORDER_STATUSES   = ('pending', 'confirmed', 'completed', 'cancelled', 'rejected')
MEAL_STATUSES    = ('available', 'sold_out', 'unavailable')
MEAL_CATEGORIES  = ('main', 'side', 'drink')

def _init_meal_tables(conn): ...
def _seed_meals_if_empty(conn): ...

# 餐點：list_meals / list_orderable_meals / get_meal
#       create_meal / update_meal / soft_delete_meal
# 訂單：create_meal_order / get_meal_order / list_order_items
#       list_my_orders / list_all_orders / update_meal_order
#       cancel_meal_order / confirm_meal_order / reject_meal_order
#       complete_meal_order / admin_cancel_meal_order
# 內部：_set_order_status(conn, order_id, status)
#       _restock(conn, items)
```

### 關鍵決策

**1. 庫存不變量：`remaining_quantity` 只在 `confirmed` 狀態被佔用。**

先把這句話寫成註解放在檔案最上面，再寫程式。五條轉移的庫存行為全部由它推導出來：

| 轉移 | 庫存 |
|------|------|
| pending → confirmed | 扣減 |
| confirmed → cancelled | 回補 |
| pending → cancelled / rejected | 不動 |
| confirmed → completed | 不動 |

**2. 回補以 `MIN(remaining + qty, daily_quantity)` 封頂。** 管理員可能在訂單存續期間
調低 `daily_quantity`，不封頂就會把剩餘份數加到超過當日供應量。

**3. 狀態檢查寫在資料層，不在 Blueprint。** 每個狀態轉移函式開頭都有
`SELECT ... AND order_status = 'pending'`，找不到就回傳 `False`。理由是判斷所依據的
事實（訂單狀態、剩餘份數）可能在使用者看到畫面之後被別人改掉。

**4. `confirm_meal_order` 扣減前重新檢查，任一項不足即整張退回。** 不做部分確認——
訂單是一個語意單位，只確認一半的訂單，取餐時說不清楚該給什麼。

**5. 總金額由資料層計算。** `create_meal_order` 與 `update_meal_order` 內部
`sum(unit_price * qty)` 後寫入 `total_amount`，**不接受呼叫端傳入的金額**。金額是明細
的衍生值，交給兩個地方算就會有不一致的一天。

**6. 七個函式使用 transaction。** 判準是「多張表必須同時成功或同時失敗」：
`create_meal_order`、`update_meal_order`、`confirm_meal_order`、`reject_meal_order`、
`cancel_meal_order`、`admin_cancel_meal_order`、`complete_meal_order`。

**7. 種子訂單 #3（confirmed）必須實際扣減庫存。** 否則系統一啟動就帳實不符，後續的
取消回補會把庫存加到超過供應量。

### `db/__init__.py` 的修改

```python
from .meals import (           # noqa: E402
    ORDER_STATUSES, MEAL_STATUSES, MEAL_CATEGORIES,
    list_meals, list_orderable_meals, get_meal,
    create_meal, update_meal, soft_delete_meal,
    create_meal_order, get_meal_order, list_order_items,
    list_my_orders, list_all_orders, update_meal_order,
    cancel_meal_order, confirm_meal_order, reject_meal_order,
    complete_meal_order, admin_cancel_meal_order,
)
```

`init_db()` 中加入兩行，**順序不可對調**：

```python
    _init_meal_tables(conn)
    _seed_users_if_empty(conn)
    _seed_meals_if_empty(conn)   # 必須在種子帳號之後：訂單的 orderer_id 指向它們
```

### 驗收

這是本流程書中最重要的一段驗收。**全部在資料層完成，不需要任何路由。**

**驗收 1：資料表與種子資料**

```bash
python - <<'EOF'
import db; db.DB_PATH = '/tmp/m1.db'; db.init_db()
meals, total = db.list_meals()
print('餐點數', total)
for m in meals:
    print(f"  {m['meal_code']} {m['meal_name']:<12} NT${m['price']:>3} "
          f"{m['remaining_quantity']:>3}/{m['daily_quantity']:<3} {m['meal_status']}")
orders, ototal = db.list_all_orders()
print('訂單數', ototal)
for o in orders:
    print(f"  #{o['id']} {o['orderer_display']:<22} {o['order_status']:<10} NT${o['total_amount']}")
EOF
```
預期：

```
餐點數 6
  A01 雞腿便當       NT$ 95  60/60  available
  A02 素食便當       NT$ 75  38/40  available      <- 被種子訂單 #3 佔用 2 份
  A03 排骨便當       NT$ 90   0/50  sold_out
  A04 牛肉麵         NT$130  30/30  unavailable
  B01 燙青菜         NT$ 25  79/80  available      <- 被種子訂單 #3 佔用 1 份
  C01 古早味紅茶     NT$ 20 100/100 available
訂單數 4
  #4 一般使用者              pending    NT$240
  #3 disabled@example.com    confirmed  NT$175
  #2 一般使用者              cancelled  NT$75
  #1 一般使用者              completed  NT$115
```

> **A02 是 38/40 而不是 40/40**，這就是庫存不變量在種子資料上生效的證據。

**驗收 2：狀態機 — 確認扣庫存**

```bash
python - <<'EOF'
import db; db.DB_PATH = '/tmp/m2.db'; db.init_db()
before = db.get_meal(1)['remaining_quantity']          # A01
print('確認前 A01', before)
ok = db.confirm_meal_order(4, 2, '已通知廚房')          # #4 含 A01×2、B01×2
print('confirm ->', ok, '狀態', db.get_meal_order(4)['order_status'])
print('確認後 A01', db.get_meal(1)['remaining_quantity'], '(應為', before - 2, ')')
print('明細狀態', {i['item_status'] for i in db.list_order_items(4)})
EOF
```
預期：

```
確認前 A01 60
confirm -> True 狀態 confirmed
確認後 A01 58 (應為 58 )
明細狀態 {'confirmed'}
```

**驗收 3：狀態機 — 確認後取消，庫存回到原點**

```bash
python - <<'EOF'
import db; db.DB_PATH = '/tmp/m3.db'; db.init_db()
start = db.get_meal(1)['remaining_quantity']
db.confirm_meal_order(4, 2, None)
mid = db.get_meal(1)['remaining_quantity']
db.cancel_meal_order(4, 1)                              # #4 的訂購人是 id=1
end = db.get_meal(1)['remaining_quantity']
print(f'{start} -> {mid} -> {end}', '| 回到原點:', start == end)
print('狀態', db.get_meal_order(4)['order_status'])
EOF
```
預期：`60 -> 58 -> 60 | 回到原點: True` 與 `狀態 cancelled`

**驗收 4：庫存不足時整張退回，且不得扣減任何一項**

```bash
python - <<'EOF'
import db; db.DB_PATH = '/tmp/m4.db'; db.init_db()
# #4 含 A01×2 與 B01×2。把 A01 調到只剩 1 份
db.update_meal(1, 'A01', '雞腿便當', None, 'main', 95, 60, 1, 'available')
b01_before = db.get_meal(5)['remaining_quantity']
ok = db.confirm_meal_order(4, 2, None)
print('confirm ->', ok, '(應為 False)')
print('訂單狀態', db.get_meal_order(4)['order_status'], '(應為 pending)')
print('A01 未被扣', db.get_meal(1)['remaining_quantity'] == 1)
print('B01 未被扣', db.get_meal(5)['remaining_quantity'] == b01_before)
EOF
```
預期：四行全部為 `False` / `pending` / `True` / `True`

**驗收 5：pending 不佔用庫存**

```bash
python - <<'EOF'
import db; db.DB_PATH = '/tmp/m5.db'; db.init_db()
before = db.get_meal(1)['remaining_quantity']
oid = db.create_meal_order(1, '2026-12-01', 'lunch', '測試地點', None,
                           [(1, 3, 95)])
print('建立訂單', oid, '狀態', db.get_meal_order(oid)['order_status'])
print('庫存未變', db.get_meal(1)['remaining_quantity'] == before)
print('總金額', db.get_meal_order(oid)['total_amount'], '(應為 285)')
# pending 取消也不回補
db.cancel_meal_order(oid, 1)
print('取消後庫存仍未變', db.get_meal(1)['remaining_quantity'] == before)
EOF
```
預期：`狀態 pending`、`庫存未變 True`、`總金額 285`、`取消後庫存仍未變 True`

**驗收 6：取餐不回補**

```bash
python - <<'EOF'
import db; db.DB_PATH = '/tmp/m6.db'; db.init_db()
a02 = db.get_meal(2)['remaining_quantity']              # #3 已佔用 2 份
print('complete ->', db.complete_meal_order(3))
print('狀態', db.get_meal_order(3)['order_status'])
print('A02 未回補', db.get_meal(2)['remaining_quantity'] == a02)
EOF
```
預期：`True` / `completed` / `True`

**驗收 7：終端狀態不可再轉移**

```bash
python - <<'EOF'
import db; db.DB_PATH = '/tmp/m7.db'; db.init_db()
print('completed 再 confirm ->', db.confirm_meal_order(1, 2, None), '(應 False)')
print('completed 再 cancel  ->', db.cancel_meal_order(1, 1),        '(應 False)')
print('cancelled 再 confirm ->', db.confirm_meal_order(2, 2, None), '(應 False)')
print('confirmed 再 confirm ->', db.confirm_meal_order(3, 2, None), '(應 False)')
print('pending   再 complete->', db.complete_meal_order(4),         '(應 False)')
EOF
```
預期：五行全部 `False`

**驗收 8：價格快照**

```bash
python - <<'EOF'
import db; db.DB_PATH = '/tmp/m8.db'; db.init_db()
oid = db.create_meal_order(1, '2026-12-01', 'lunch', 'X', None, [(1, 1, 95)])
db.update_meal(1, 'A01', '雞腿便當', None, 'main', 999, 60, 60, 'available')
print('明細 unit_price', db.list_order_items(oid)[0]['unit_price'], '(應為 95)')
print('訂單 total     ', db.get_meal_order(oid)['total_amount'],    '(應為 95)')
print('菜單現價       ', db.get_meal(1)['price'],                   '(應為 999)')
EOF
```
預期：`95` / `95` / `999`

**驗收 9：下架餐點不影響既有訂單明細**

```bash
python - <<'EOF'
import db; db.DB_PATH = '/tmp/m9.db'; db.init_db()
db.soft_delete_meal(1)                                   # A01 下架
items = db.list_order_items(4)                           # #4 含 A01
print('明細筆數', len(items), '(應為 2)')
print('名稱', [i['meal_name'] for i in items])
print('金額仍正確', db.get_meal_order(4)['total_amount'] == 240)
print('菜單已看不到', 1 not in [m['id'] for m in db.list_meals()[0]])
print('訂餐表單也看不到', 1 not in [m['id'] for m in db.list_orderable_meals()])
EOF
```
預期：

```
明細筆數 2 (應為 2)
名稱 ['雞腿便當', '燙青菜']
金額仍正確 True
菜單已看不到 True
訂餐表單也看不到 True
```

> **名稱仍然顯示得出來**，因為 `list_order_items` 的 `LEFT JOIN meals` **不加**
> `m.is_deleted = 0` 條件。這正是想要的行為：訂單記錄的是「當時訂了什麼」，
> 餐點後來下架不改變這個事實。
>
> 那為什麼還要用 `LEFT JOIN` 而不是 `JOIN`？因為系統沒有外鍵約束（KI-13），
> `meal_id` 有可能指向一列根本不存在的資料。`JOIN` 會讓那筆明細整列消失，
> 訂單的品項加總對不上 `total_amount`；`LEFT JOIN` 則保留明細、只讓名稱為 `NULL`，
> 由樣板顯示「（餐點已下架）」。

```bash
rm -f /tmp/m?.db
```

### 常見錯誤

- **`complete_meal_order` 順手寫成回補份數**。便當吃掉就沒了，這是最容易犯的錯，
  而且驗收 6 之外的測試都抓不到
- `confirm_meal_order` 先扣減再檢查，導致部分確認
- 回補沒有以 `daily_quantity` 封頂
- 種子訂單忘了扣庫存，導致驗收 1 顯示 A02 是 40/40
- `_seed_meals_if_empty` 排在 `_seed_users_if_empty` 之前
- `list_order_items` 的 JOIN 加上 `AND m.is_deleted = 0`，導致下架後訂單明細的名稱
  全變成空的。過濾條件應該只出現在**列表類**函式，不出現在歷史資料的關聯查詢

---

## Phase 9 — meal 子系統

### 目的

把 Phase 8 的資料層接上路由與畫面。

### 產出檔案

| 檔案 | 動作 |
|------|------|
| `blueprints/meal/__init__.py` | **建立** |
| `blueprints/meal/CLAUDE.md` | **建立** |
| `templates/meal/index.html` | **建立** |
| `templates/meal/meal_form.html` | **建立** |
| `templates/meal/order_form.html` | **改寫並合併** |
| `templates/meal/my_orders.html` | **建立** |
| `templates/meal/order_detail.html` | **建立** |
| `templates/meal/admin_orders.html` | **建立** |
| `static/meal.css` | **建立**（改前綴、加狀態 badge） |

### 建議的實作順序

1. `_current_user()` / `_is_admin()` / 四個 LABELS 字典
2. `index`（菜單）+ `templates/meal/index.html` + `static/meal.css` — 先讓畫面出來
3. 餐點管理三條（`new_meal` / `edit_meal` / `delete_meal`）+ `meal_form.html`
4. `_collect_items()` 與 `_validate_order_form()` — 兩個驗證 helper
5. `new_order` + `order_form.html`
6. `my_orders` / `order_detail` + 兩個樣板
7. `edit_order`（重用 `order_form.html`）/ `cancel_order`
8. 管理端五條 + `admin_orders.html`

### 關鍵決策

**1. 守門分成兩種寫法，刻意不統一。**

- 會員端路由（`new_order`、`my_orders`、`order_detail`、`edit_order`、`cancel_order`）
  把第 1、2 層收斂進 `_current_user()`
- 管理端路由（`new_meal`、`edit_meal`、`delete_meal`、`admin_*`）明碼寫出三層

差別的原因是 `index` 開放訪客瀏覽，需要一個「未登入或帳號失效都回傳 `None`」的 helper；
有了它，會員端路由再重複寫兩層就是多餘的。管理端沒有開放路由。

**2. `_current_user()` 必須做 `_is_usable` 檢查。**

這個檢查不可省略——被停用的帳號若能
下單，會佔用真實的餐點份數，讓別人訂不到。判準是「缺陷的影響是否外溢到當事人以外的人」。

**3. 價格一律從資料庫重新查。**

`_collect_items()` 只從表單取 `meal_id[]` 與 `quantity[]`。畫面上的價格是給人看的，
不參與計算。否則使用者竄改隱藏欄位就能用 1 元訂便當。

**4. Blueprint 不重複檢查訂單狀態。**

`admin_confirm()` 直接呼叫 `db.confirm_meal_order()` 並把 `True` / `False` 翻成 flash。
狀態檢查在資料層（Phase 8 已完成）。

**5. `order_form.html` 由訂餐與修改共用**，靠 `form_title`、`back_url`、`quantities`
三個變數區分。「新增」與「修改」不拆成兩個檔案，本系統
合併——兩者的欄位與驗證完全相同，共用不會產生分支地獄。

**6. `edit_order` 列出的餐點是「目前可訂」聯集「這張訂單已點」。**

只列前者的話，一道餐點在下單後被停售，使用者一進修改頁就看不到它，按下儲存就把它
無聲刪掉了。

**7. 審核動作拆成四條路由**（`confirm` / `reject` / `complete` / `cancel`），
不合併成一條帶 `?to=` 參數的。理由：前置狀態不同、副作用不同、URL 本身就是文件。

### 驗收

> ⚠️ 以下所有經過 `/meal/order/new` 的驗收都用 `TOMORROW`（今天 + 1 天）作為取餐日期。
> 寫死一個遠期日期（如 `2026-12-01`）會先被「最多只能預訂 7 天內」這條規則擋下，
> 於是每個驗收看起來都「通過」了，但通過的原因不是你想測的那一條。**這是撰寫這類
> 驗收腳本時最常見的假陽性。**

**驗收 1：路由數**

```bash
python -c "
from app import app
rules = [r for r in app.url_map.iter_rules() if r.endpoint != 'static']
from collections import Counter
c = Counter(r.endpoint.split('.')[0] if '.' in r.endpoint else '-' for r in rules)
print('total', len(rules)); print(dict(c))
"
```
預期：`total 28` 與 `{'meal': 14, 'admin': 6, 'auth': 4, 'profile': 2, 'hub': 1, '-': 1}`

**驗收 2：所有頁面回 200**

```bash
python - <<'EOF'
from app import app
import db; db.DB_PATH = '/tmp/p9.db'; db.init_db()
app.config['TESTING'] = True
c = app.test_client()
guest = ['/health', '/', '/meal/', '/meal/?meal_id=1', '/meal/?category=main',
         '/login', '/register']
for p in guest: print(c.get(p).status_code, p)
with c.session_transaction() as s: s['user_id'] = 2
admin = ['/meal/new', '/meal/edit/1', '/meal/order/new', '/meal/my-orders',
         '/meal/orders/3', '/meal/admin/orders', '/meal/admin/orders?status=pending']
for p in admin: print(c.get(p).status_code, p)
with c.session_transaction() as s: s['user_id'] = 1
for p in ['/meal/orders/4', '/meal/orders/4/edit']: print(c.get(p).status_code, p)
EOF
rm -f /tmp/p9.db
```
預期：**全部 200**

**驗收 3：訪客看不到訂餐入口**

```bash
python - <<'EOF'
from app import app
import db; db.DB_PATH = '/tmp/p9b.db'; db.init_db()
app.config['TESTING'] = True
body = app.test_client().get('/meal/').get_data(as_text=True)
print('訪客無訂餐入口', '/meal/order/new' not in body)
print('訪客無管理入口', '/meal/new' not in body)
c = app.test_client()
with c.session_transaction() as s: s['user_id'] = 1
b2 = c.get('/meal/').get_data(as_text=True)
print('會員有訂餐入口', '/meal/order/new' in b2)
print('會員無管理入口', '/meal/new' not in b2)
EOF
rm -f /tmp/p9b.db
```
預期：四行全部 `True`

**驗收 4：停用帳號不得下單（守門修正）**

```bash
python - <<'EOF'
from datetime import date, timedelta
TOMORROW = (date.today() + timedelta(days=1)).isoformat()
from app import app
import db; db.DB_PATH = '/tmp/p9c.db'; db.init_db()
app.config['TESTING'] = True
c = app.test_client()
with c.session_transaction() as s: s['user_id'] = 3    # 停用帳號
before = db.list_my_orders(3)[1]
r = c.post('/meal/order/new', data={
    'pickup_date': TOMORROW, 'pickup_slot': 'lunch',
    'pickup_location': 'X', 'meal_id[]': ['1'], 'quantity[]': ['1']})
print('狀態', r.status_code, '導向', r.headers.get('Location'))
print('訂單未建立', db.list_my_orders(3)[1] == before)
with c.session_transaction() as s: print('session 已清', 'user_id' not in s)
print('但仍可瀏覽菜單', app.test_client().get('/meal/').status_code)
EOF
rm -f /tmp/p9c.db
```
預期：`302 /login`、`True`、`True`、`200`

**驗收 5：價格竄改無效**

```bash
python - <<'EOF'
from datetime import date, timedelta
TOMORROW = (date.today() + timedelta(days=1)).isoformat()
from app import app
import db; db.DB_PATH = '/tmp/p9d.db'; db.init_db()
app.config['TESTING'] = True
c = app.test_client()
with c.session_transaction() as s: s['user_id'] = 1
c.post('/meal/order/new', data={
    'pickup_date': TOMORROW, 'pickup_slot': 'lunch', 'pickup_location': 'X',
    'meal_id[]': ['1'], 'quantity[]': ['1'],
    'price': '1', 'unit_price[]': ['1'], 'total_amount': '1'})
o = db.list_my_orders(1)[0][0]
print('總金額', o['total_amount'], '(應為 95，不是 1)')
EOF
rm -f /tmp/p9d.db
```
預期：`總金額 95 (應為 95，不是 1)`

**驗收 6：份數竄改無效**

```bash
python - <<'EOF'
from datetime import date, timedelta
TOMORROW = (date.today() + timedelta(days=1)).isoformat()
from app import app
import db; db.DB_PATH = '/tmp/p9e.db'; db.init_db()
app.config['TESTING'] = True
c = app.test_client()
with c.session_transaction() as s: s['user_id'] = 1
before = db.list_my_orders(1)[1]
r = c.post('/meal/order/new', data={
    'pickup_date': TOMORROW, 'pickup_slot': 'lunch', 'pickup_location': 'X',
    'meal_id[]': ['1'], 'quantity[]': ['9999']})      # 遠超剩餘份數
print('狀態', r.status_code, '(應 200，退回表單)')
print('含錯誤訊息', '剩餘份數不足' in r.get_data(as_text=True))
print('訂單未建立', db.list_my_orders(1)[1] == before)
# 停售的餐點（A04）也擋得下來
r2 = c.post('/meal/order/new', data={
    'pickup_date': TOMORROW, 'pickup_slot': 'lunch', 'pickup_location': 'X',
    'meal_id[]': ['4'], 'quantity[]': ['1']})
print('停售擋下', '目前無法訂購' in r2.get_data(as_text=True))
EOF
rm -f /tmp/p9e.db
```
預期：`200`、`True`、`True`、`True`

**驗收 7：越權存取訂單**

```bash
python - <<'EOF'
from app import app
import db; db.DB_PATH = '/tmp/p9f.db'; db.init_db()
app.config['TESTING'] = True
c = app.test_client()
with c.session_transaction() as s: s['user_id'] = 1   # #3 是 id=3 的訂單
r = c.get('/meal/orders/3', follow_redirects=True)
print('他人訂單被擋', '無權限查看此訂單' in r.get_data(as_text=True))
a = app.test_client()
with a.session_transaction() as s: s['user_id'] = 2
print('管理員可看', a.get('/meal/orders/3').status_code)
EOF
rm -f /tmp/p9f.db
```
預期：`True`、`200`

**驗收 8：一般使用者無法執行審核動作**

```bash
python - <<'EOF'
from app import app
import db; db.DB_PATH = '/tmp/p9g.db'; db.init_db()
app.config['TESTING'] = True
c = app.test_client()
with c.session_transaction() as s: s['user_id'] = 1
for act in ('confirm', 'reject', 'complete', 'cancel'):
    r = c.post(f'/meal/admin/orders/4/{act}', data={})
    print(act, r.status_code, end='  ')
print()
print('訂單狀態未變', db.get_meal_order(4)['order_status'] == 'pending')
print('庫存未變', db.get_meal(1)['remaining_quantity'] == 60)
EOF
rm -f /tmp/p9g.db
```
預期：四個 `302`，然後兩行 `True`

### 常見錯誤

- `_current_user()` 忘了加 `_is_usable`（驗收 4 會抓到）
- 把價格從表單讀進來（驗收 5 會抓到）
- 在 Blueprint 中重複寫狀態檢查，與資料層的檢查不一致
- `edit_order` 只列 `list_orderable_meals()`，導致已停售的品項被無聲刪除
- `order_form.html` 加了 `class="login-form"`，套到登入頁的按鍵樣式
- `index` 的分頁連結沒有保留 `?category=` 與 `?meal_id=`，翻頁後篩選與選取都消失
- 忘記 `strict_slashes=False`，`/meal` 與 `/meal/` 行為不一致

---

## Phase 10 — 首頁整合

### 目的

把訂餐子系統接進首頁的服務卡片。

### 產出檔案

| 檔案 | 動作 |
|------|------|
| `templates/hub/home.html` | **修改** |
| `blueprints/hub/CLAUDE.md` | **修改**（服務卡片表） |
| `document/hub.md` | **建立** |

### 修改內容

已登入視圖的卡片（依序）：

| 卡片 | 連向 | 條件 |
|------|------|------|
| 今日菜單 | `meal.index` | 全部 |
| 我的訂單 | `meal.my_orders` | 全部 |
| 個人資料 | `profile.dashboard` | 全部 |
| 訂單管理 | `meal.admin_orders` | `user['role'] == 0` |
| 會員管理 | `admin.user_list` | `user['role'] == 0` |

訪客視圖：今日菜單為可點的 `<a>`，其餘四張為 `hub-card-locked` 的 `<div>`，
分別標示 `🔒 需登入` 或 `🔒 需管理員權限`。

**Blueprint 本身不做角色判斷**——`user` 物件（含 `role`）已完整傳給樣板，
判斷在 Jinja 中以 `{% if user['role'] == 0 %}` 完成。

### 驗收

```bash
python - <<'EOF'
from app import app
import db; db.DB_PATH = '/tmp/p10.db'; db.init_db()
app.config['TESTING'] = True

g = app.test_client().get('/').get_data(as_text=True)
print('訪客：菜單可點     ', 'href="/meal/"' in g)
print('訪客：有 locked 卡片', 'hub-card-locked' in g)
print('訪客：無管理連結   ', '/meal/admin/orders' not in g and '/admin/users' not in g)

u = app.test_client()
with u.session_transaction() as s: s['user_id'] = 1
b = u.get('/').get_data(as_text=True)
print('會員：有我的訂單   ', '/meal/my-orders' in b)
print('會員：無管理卡片   ', '/meal/admin/orders' not in b and '/admin/users' not in b)

a = app.test_client()
with a.session_transaction() as s: s['user_id'] = 2
b2 = a.get('/').get_data(as_text=True)
print('管理員：有訂單管理 ', '/meal/admin/orders' in b2)
print('管理員：有會員管理 ', '/admin/users' in b2)
EOF
rm -f /tmp/p10.db
```
預期：七行全部 `True`

### 常見錯誤

- 訪客視圖忘了把管理員卡片也做成 locked，導致 `url_for('admin.user_list')` 出現在
  訪客的 HTML 中（驗收第三行會抓到）
- 已登入視圖的管理員卡片忘了 `{% if user['role'] == 0 %}`

---

## Phase 11 — CSS 一致性稽核

### 目的

確認所有子系統的按鍵顏色都引用 `common.css` 的 token，沒有寫死色碼。

### 產出檔案

無。這個階段只做檢查與修正。

### 驗收

**稽核 1：按鍵類別不得寫死色碼**

```bash
grep -nE "^\.(meal|admin|profile)-btn[^{]*\{[^}]*#[0-9a-fA-F]{3,6}" static/*.css \
  | grep -v "#fff"
```
預期：**無輸出**。`#fff`（按鍵上的白色文字）是允許的例外

**稽核 2：token 有被引用**

```bash
grep -c "var(--btn-" static/meal.css static/admin.css static/profile.css
```
預期：三個檔案都 > 0

**稽核 3：`.login-form` 恰好三處**

```bash
grep -rl 'class="login-form"' templates/
```
預期：恰好三個檔案——`auth/login.html`、`auth/register.html`、`hub/home.html`

**稽核 4：inline event handler 數量**

```bash
grep -ro "onclick" templates/ | wc -l
```
預期：`10`（驗證碼刷新 4 + 刪除／取消確認 6）

**稽核 5：無 `<a href="#">` 假按鍵**

```bash
grep -rn 'href="#"' templates/
```
預期：**無輸出**

**稽核 6：狀態 badge 的硬編碼色碼有被記錄**

```bash
grep -c "KI-19" static/admin.css static/meal.css
```
預期：兩個檔案各 `2`（檔頭的說明註解 + badge 區塊上方的註解）

### 已知例外（不需修正）

| 位置 | 內容 | 記錄 |
|------|------|------|
| `admin.css`、`meal.css` | 狀態 badge 的底色 | KI-19（`common.css` 未定義狀態語意色） |
| `hub.css` | `.hub-register-link`、`.hub-logout` | KI-31（類別名稱不含 `btn`，稽核抓不到） |
| 各 CSS | `.meal-page-btn` / `.admin-page-btn` 的中性灰 | 分頁按鍵不屬於動作按鍵的語意體系 |

### 常見錯誤

- 直接把 `forum.css` 複製成 `meal.css` 卻忘了改前綴，兩套類別名稱衝突
- 新增按鍵時圖方便寫死色碼，之後改主題色時漏改

---

## Phase 12 — 測試

### 目的

建立完整的自動化測試，共 152 個案例。

### 產出檔案

| 檔案 | 動作 |
|------|------|
| `tests/__init__.py` | 建立 |
| `tests/conftest.py` | 建立 |
| `tests/data/__init__.py` | 建立 |
| `tests/data/users.py` | **建立**（加 `MEALS`、`ORDERS`、36 條 meal 訊息） |
| `tests/test_auth.py` | 建立 |
| `tests/test_profile.py` | **建立**（新增兩個保護 KI-03 的測試） |
| `tests/test_admin.py` | 建立 |
| `tests/test_hub.py` | **建立**（卡片斷言改為訂餐） |
| `tests/test_meal.py` | **全新撰寫**（78 個案例） |
| `tests/CLAUDE.md` | **建立** |

### `tests/conftest.py` 為什麼零修改

四個 fixture（`app`、`client`、`authed_client`、`admin_client`、`other_client`）與
會員系統完全對應，訂餐子系統沒有引入新的身分。`clean_client` 這個「第二個乾淨 client」
的需求只出現在 `test_meal.py` 中一個測試，因此寫成該檔案的 local fixture，不進 conftest。

### `tests/data/users.py` 的新增內容

```python
MEALS  = {...}    # 六道種子餐點的 id、code、price、daily、status
ORDERS = {...}    # 四張種子訂單的 id 與 orderer_id
MESSAGES = {
    ...,          # auth 11 條、admin 11 條（沿用）
    # meal：餐點管理 13 條、訂單 17 條、管理端審核 6 條
}
```

**不在測試中寫死 id。** 種子資料的順序若日後調整，只需要改這兩個字典。

### `test_meal.py` 的撰寫要點

**1. 一律用相對式斷言。** 資料庫從來不是空的（六道餐點、四張訂單）：

```python
before = db.list_meals()[1]
...
assert db.list_meals()[1] == before + 1
```

**2. 被權限擋下的 POST 必須同時斷言資料庫沒有改變。**

```python
resp = authed_client.post('/meal/new', data={...})
assert resp.status_code == 302
assert db.list_meals()[1] == before        # <- 這一行才是重點
```

**3. 涉及庫存的操作必須斷言庫存。** 只驗 `order_status` 抓不到「狀態改對了但庫存沒
跟上」——那正是本系統最容易出現的錯。

**4. 需要兩個不同身分時，用 local fixture。**

`authed_client`、`admin_client`、`other_client` 都由 `client` 衍生，同一個測試中同時
請求兩個會拿到同一個物件。`test_confirm_then_cancel_restores_stock` 需要「管理員確認 →
訂購人取消」，因此用 `clean_client`。

**5. 測「本人但狀態不符」時，先 `db.set_user_active(3, 1)`。**

種子訂單 #3 的訂購人是停用帳號 id=3。不先啟用的話，會被 `_current_user()` 的帳號有效性
檢查先攔下，測不到後面那一層。

**6. `test_profile.py` 新增兩個保護 KI-03 的測試。** 它們斷言「被停用／已刪除的會員
**仍然可以**更新自己的資料」。函式名稱帶 `ki03` 後綴，並在註解中寫明「這是缺陷不是功能」，
否則下一個讀者只會覺得測試寫錯了。

**7. 售完與停售是兩條不同的驗證路徑。**

A03（`sold_out`）會撞到狀態檢查，訊息是「目前無法訂購」；要測「份數不足」，必須用
`available` 但剩餘為 0 的餐點。這兩條路徑各有一個測試。

### `tests/test_hub.py` 的修改內容

四處：`論壇` → `今日菜單`、`/forum` → `/meal`、新增「我的訂單」與「訂單管理」卡片的
斷言、`href="/forum/"` → `href="/meal/"`。

新增一個測試 `test_hub_shows_order_admin_card_for_admin`。

### 驗收

```bash
pytest -q
```
預期：`152 passed`

```bash
pytest --collect-only -q 2>/dev/null | tail -1
```
預期：`152 tests collected`

```bash
for f in tests/test_*.py; do
  echo -n "$f: "
  pytest "$f" --collect-only -q 2>/dev/null | tail -1
done
```
預期：

```
tests/test_admin.py: 30 tests collected in ...
tests/test_auth.py: 23 tests collected in ...
tests/test_hub.py: 11 tests collected in ...
tests/test_meal.py: 78 tests collected in ...
tests/test_profile.py: 10 tests collected in ...
```

**驗收：KI-03 的保護測試存在且通過**

```bash
pytest -k "ki03" -v
```
預期：兩個測試皆 `PASSED`——

```
test_profile_update_succeeds_for_disabled_user_ki03 PASSED
test_profile_update_succeeds_for_deleted_user_ki03 PASSED
```

> 這兩個測試保護的是一個**缺陷**。若有人補上了那三行 `_is_usable` 檢查，它們會失敗
> ——那正是它們存在的目的：讓修補一個刻意保留的缺陷變成需要明確決定的動作。

**驗收：庫存不變量的兩個測試**

```bash
pytest tests/test_meal.py -k "restock or restore" -v
```
預期：三個測試全部 `PASSED`

### 常見錯誤

- 忘了 `pytest.ini`，`pytest` 走進不相干的目錄收集到別的 `conftest.py`，報
  `ImportPathMismatchError`。症狀是**一個測試都跑不起來**，而不是某幾個失敗
- 在同一個測試中同時請求 `authed_client` 與 `admin_client`，得到同一個物件，
  於是 session 被後者覆蓋。症狀是「明明用一般使用者測，卻得到管理員的結果」
- 斷言寫死數量（`assert total == 1`），忽略種子資料
- 測「他人的訂單」時忘了種子訂單 #3 的訂購人是停用帳號

---

## Phase 13 — Docker

### 目的

建立容器化部署設定。

### 產出檔案

| 檔案 | 動作 |
|------|------|
| `Dockerfile` | 建立 |
| `docker-compose.yml` | 建立 |
| `.dockerignore` | **建立** |

### `.dockerignore` 的內容

排除快取、資料庫檔與測試，避免映像膨脹並把開發用資料庫打包進去：

```
__pycache__/
*.pyc
*.pyo
*.db
.git/
tests/
.pytest_cache/
```

### 靜態驗收（無 Docker CLI 時也能做）

```bash
grep -E "^(FROM|EXPOSE|CMD)" Dockerfile
```
預期：`FROM python:3.11-slim`、`EXPOSE 4000`、`CMD ["python", "app.py"]`

```bash
grep -E "DB_PATH|4000|db_data" docker-compose.yml
```
預期：`DB_PATH=/app/data/database.db`、`"4000:4000"`、`db_data:/app/data`

**關鍵一致性檢查**：`docker-compose.yml` 的 `DB_PATH` 必須指向 volume 掛載點之內，
否則容器重建時資料會遺失。

```bash
python -c "
import re
compose = open('docker-compose.yml').read()
db_path = re.search(r'DB_PATH=(\S+)', compose).group(1)
mount   = re.search(r'db_data:(\S+)', compose).group(1)
print(db_path, mount, '-> 一致:', db_path.startswith(mount))
"
```
預期：`/app/data/database.db /app/data -> 一致: True`

### 動態驗收（需要 Docker CLI）

```bash
docker compose up -d --build
curl -s localhost:4000/health          # 預期：OK
curl -s localhost:4000/meal/ | head -5 # 預期：HTML
```

**持久化驗收**：

```bash
# 在瀏覽器中申請一個新帳號，或直接送出一張訂單
docker compose restart
# 該帳號與訂單應仍然存在
docker compose down && docker compose up -d
# 仍然存在（named volume 未被刪除）
docker compose down -v && docker compose up -d
# 資料已重置，回到種子狀態
```

### 常見錯誤

- 忘了在 `.dockerignore` 排除 `tests/` 與資料庫檔，映像比需要的大上許多
- `DB_PATH` 指向 `/app/database.db`（不在 volume 內），容器重建就掉資料
- `Dockerfile` 忘了 `RUN mkdir -p /app/data`

---

## Phase 14 — 文件與最終驗收

### 目的

補齊所有文件，並做一次橫跨全系統的整合驗收。

### 產出檔案

| 檔案 | 動作 |
|------|------|
| 根目錄 `CLAUDE.md` | **全新撰寫** |
| `README.md` | **全新撰寫** |
| `db/CLAUDE.md` | 改寫（Phase 8 已做） |
| `blueprints/meal/CLAUDE.md` | 全新建立（Phase 9 已做） |
| `blueprints/{auth,hub,profile,admin}/CLAUDE.md` | 修改後複製 |
| `tests/CLAUDE.md` | 改寫（Phase 12 已做） |
| `rules/{flask-blueprint,database}.md` | **修改後複製** |
| `document/{auth,hub,profile,admin}.md` | 修改後複製 |
| `document/meal.md` | **全新撰寫** |
| `document/system-spec.md` | **全新撰寫** |
| `document/build-guide.md` | **全新撰寫**（本文件） |

### `rules/database.md` 的修改內容

三處：

1. 「本系統的三個實例」→「本系統的**七個**實例」，表格改為 `db/meals.py` 的七個
   transaction 函式
2. 「例外二：單筆取得函式」的清單改為 `get_meal`、`get_meal_order`
3. 新增「**例外三：歷史資料的關聯查詢**」——`list_order_items()` 用 `LEFT JOIN` 而非
   `JOIN`，讓已下架餐點的明細仍顯示得出來
4. 「判斷準則：新資料表，不是新子系統」的例子改為 `db/meals.py` 管三張表

### `rules/flask-blueprint.md` 的修改內容

一處：「若子系統有開放給訪客的頁面（如 `GET /forum`）」→「（如 `GET /meal/`）」。

### 最終整合驗收

**驗收 1：全套測試**

```bash
pytest -q
```
預期：`152 passed`

**驗收 2：實際啟動**

```bash
rm -f database.db database.db-wal database.db-shm
python app.py &
sleep 2
curl -s localhost:4000/health
curl -s -o /dev/null -w "%{http_code}\n" localhost:4000/
curl -s -o /dev/null -w "%{http_code}\n" localhost:4000/meal/
kill %1
```
預期：`OK`、`200`、`200`

**驗收 3：完整訂餐旅程**

```bash
python - <<'EOF'
from datetime import date, timedelta
TOMORROW = (date.today() + timedelta(days=1)).isoformat()
from app import app
import db; db.DB_PATH = '/tmp/final.db'; db.init_db()
app.config['TESTING'] = True

member = app.test_client()
with member.session_transaction() as s: s['user_id'] = 1
admin = app.test_client()
with admin.session_transaction() as s: s['user_id'] = 2

a01 = db.get_meal(1)['remaining_quantity']
print(f'起始 A01 剩餘 {a01}')

# 1. 訂餐
member.post('/meal/order/new', data={
    'pickup_date': TOMORROW, 'pickup_slot': 'lunch',
    'pickup_location': '行政大樓一樓服務台', 'order_note': '不要辣',
    'meal_id[]': ['1', '5'], 'quantity[]': ['2', '1']})
oid = db.list_my_orders(1)[0][0]['id']
o = db.get_meal_order(oid)
print(f'1. 建立訂單 #{oid}  狀態 {o["order_status"]}  金額 {o["total_amount"]} (應 215)')
print(f'   庫存未變 {db.get_meal(1)["remaining_quantity"] == a01}')

# 2. 修改
member.post(f'/meal/orders/{oid}/edit', data={
    'pickup_date': TOMORROW, 'pickup_slot': 'dinner',
    'pickup_location': '圖書館一樓大廳',
    'meal_id[]': ['1', '5'], 'quantity[]': ['1', '0']})
print(f'2. 修改後金額 {db.get_meal_order(oid)["total_amount"]} (應 95)'
      f'  品項數 {len(db.list_order_items(oid))} (應 1)')

# 3. 管理員確認
admin.post(f'/meal/admin/orders/{oid}/confirm', data={'review_note': '已通知廚房'})
o = db.get_meal_order(oid)
print(f'3. 確認 -> {o["order_status"]}  審核人 {o["reviewed_by"]}'
      f'  A01 剩餘 {db.get_meal(1)["remaining_quantity"]} (應 {a01-1})')

# 4. 確認後不可修改
r = member.post(f'/meal/orders/{oid}/edit', data={
    'pickup_date': TOMORROW, 'pickup_slot': 'lunch', 'pickup_location': 'X',
    'meal_id[]': ['1'], 'quantity[]': ['5']}, follow_redirects=True)
print(f'4. 確認後修改被擋 {"只有待確認的訂單可以修改" in r.get_data(as_text=True)}')

# 5. 登記取餐
admin.post(f'/meal/admin/orders/{oid}/complete')
print(f'5. 取餐 -> {db.get_meal_order(oid)["order_status"]}'
      f'  A01 不回補 {db.get_meal(1)["remaining_quantity"] == a01 - 1}')

# 6. 已結案不可取消
member.post(f'/meal/orders/{oid}/cancel')
print(f'6. 結案後取消無效 {db.get_meal_order(oid)["order_status"] == "completed"}')
EOF
rm -f /tmp/final.db
```
預期：

```
起始 A01 剩餘 60
1. 建立訂單 #5  狀態 pending  金額 215 (應 215)
   庫存未變 True
2. 修改後金額 95 (應 95)  品項數 1 (應 1)
3. 確認 -> confirmed  審核人 2  A01 剩餘 59 (應 59)
4. 確認後修改被擋 True
5. 取餐 -> completed  A01 不回補 True
6. 結案後取消無效 True
```

**驗收 4：帳號停用對各子系統的影響（跨子系統一致性）**

```bash
python - <<'EOF'
from datetime import date, timedelta
TOMORROW = (date.today() + timedelta(days=1)).isoformat()
from app import app
import db; db.DB_PATH = '/tmp/final2.db'; db.init_db()
app.config['TESTING'] = True

admin = app.test_client()
with admin.session_transaction() as s: s['user_id'] = 2
admin.post('/admin/users/1/deactivate')
print('id=1 已停用', db.find_user_by_id(1)['is_active'] == 0)

# meal 寫入：應被擋下
c1 = app.test_client()
with c1.session_transaction() as s: s['user_id'] = 1
before = db.list_my_orders(1)[1]
r = c1.post('/meal/order/new', data={
    'pickup_date': TOMORROW, 'pickup_slot': 'lunch', 'pickup_location': 'X',
    'meal_id[]': ['1'], 'quantity[]': ['1']})
print('meal 下單被擋  ', r.status_code == 302 and db.list_my_orders(1)[1] == before)

# meal 瀏覽：仍可讀，但以訪客身分
body = app.test_client().get('/meal/').get_data(as_text=True)
print('meal 菜單仍可讀', '/meal/order/new' not in body)

# profile GET：應被擋下（這一步會 session.clear()）
c2 = app.test_client()
with c2.session_transaction() as s: s['user_id'] = 1
print('profile GET 被擋', c2.get('/profile').status_code == 302)

# profile POST：應**成功**（KI-03，刻意保留）
c3 = app.test_client()
with c3.session_transaction() as s: s['user_id'] = 1
c3.post('/profile/update', data={'name': 'KI-03'})
print('profile POST 成功', db.find_user_by_id(1)['name'] == 'KI-03', '<- KI-03 刻意保留')
EOF
rm -f /tmp/final2.db
```
預期：五行全部 `True`

> 最後一行**必須是 `True`**。它是 KI-03 的表現，也是本系統「有些債修、有些不修」
> 判準的具體證據：`meal` 修了（影響外溢到別人），`profile` 沒修（只影響自己）。

**驗收 5：文件完整性**

```bash
ls document/
```
預期：`admin.md auth.md build-guide.md hub.md meal.md profile.md system-spec.md`

```bash
find . -name CLAUDE.md | sort
```
預期：8 個——根目錄、`db/`、`tests/`、五個 Blueprint

```bash
grep -rn "forum\|論壇" --include="*.py" --include="*.html" --include="*.css" .
```
預期：**無輸出**。程式碼、樣板與 CSS 中不得有任何 forum 的殘留

```bash
grep -rn "forum\|論壇" --include="*.md" . | wc -l
```
預期：**0**。文件中也不應該出現與本系統無關的子系統名稱。

### 完工檢查清單

- [ ] `pytest -q` → 152 passed
- [ ] `python app.py` 可啟動，`/`、`/meal/`、`/health` 皆回 200
- [ ] 訪客可瀏覽菜單但看不到訂餐入口
- [ ] 一般使用者可訂餐但看不到管理入口
- [ ] 管理員可確認訂單且庫存正確扣減
- [ ] 確認後取消，庫存回到原點
- [ ] 登記取餐後庫存不回補
- [ ] 停用帳號無法下單，但仍可瀏覽菜單
- [ ] KI-03 仍然存在（停用帳號仍可改自己的姓名）
- [ ] CSS 稽核六項全部通過
- [ ] 八份 `CLAUDE.md` 齊備
- [ ] `document/` 七份文件齊備
- [ ] `.dockerignore` 排除測試、快取與資料庫檔

---

## 附錄 A：完整檔案清單

### A. 各檔案建立於哪個階段

| 檔案 | Phase |
|------|:--:|
| `app.py`、`utils.py`、`blueprints/__init__.py`、`requirements.txt`、`pytest.ini` | 1 |
| `.gitignore`、`.gitattributes`、`.dockerignore`、`.claude/settings.json` | 1 |
| `db/{__init__,connection,users}.py`、`db/CLAUDE.md` | 2 |
| `templates/base.html`、`static/{common,login}.css` | 3 |
| `blueprints/auth/`、`templates/auth/{login,register}.html` | 4 |
| `blueprints/hub/`、`templates/hub/home.html`、`static/hub.css` | 5 |
| `blueprints/profile/`、`templates/profile/dashboard.html`、`static/profile.css` | 6 |
| `blueprints/admin/`、`templates/admin/{user_list,user_detail}.html`、`static/admin.css` | 7 |
| `db/meals.py`（三張表、狀態機、種子餐點） | 8 |
| `blueprints/meal/`、`templates/meal/*.html`（六個）、`static/meal.css` | 9 |
| `tests/`（`conftest.py`、`data/users.py`、五個測試檔、`CLAUDE.md`） | 12 |
| `Dockerfile`、`docker-compose.yml` | 13 |
| `rules/*.md`、`document/*.md`、`README.md`、`CLAUDE.md` | 各階段 |


## 附錄 B：訂餐子系統的跨階段速查

| 主題 | Phase | 位置 |
|------|:--:|------|
| 三張表的 DDL | 8 | `db/meals.py` `_init_meal_tables()` |
| 狀態機的實作 | 8 | `db/meals.py` 的六個狀態轉移函式 |
| 庫存扣減 | 8 | `confirm_meal_order()` |
| 庫存回補 | 8 | `_restock()`，由 `cancel_meal_order` 與 `admin_cancel_meal_order` 呼叫 |
| 種子資料 | 8 | `_seed_meals_if_empty()` |
| 守門修正（`_is_usable`） | 9 | `blueprints/meal/__init__.py` `_current_user()` |
| 價格重新查詢 | 9 | `_collect_items()` |
| 表單驗證 | 9 | `_validate_meal_form()`、`_validate_order_form()` |
| 多品項傳遞 | 9 | `order_form.html` 的 `meal_id[]` / `quantity[]` |
| 服務卡片 | 10 | `templates/hub/home.html` |
| 庫存不變量的測試 | 12 | `test_confirm_then_cancel_restores_stock`、`test_restock_capped_by_daily_quantity` |
