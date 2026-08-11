# 校園小型圖書借閱系統 — 建置流程書

## 0. 文件資訊

| 項目 | 內容 |
|------|------|
| 文件名稱 | 校園小型圖書借閱系統 建置流程書 |
| 版本 | v1.0 |
| 日期 | 2026-08-11 |
| 上位依據 | [`document/system-spec.md`](system-spec.md) |
| 適用對象 | 要把這個系統從無到有建起來的人 |

### 0.1 這份文件是什麼

系統規格書說明「系統是什麼」，這份文件說明「怎麼把它建出來」。

流程分為 **14 個階段**，每個階段都是一個可以獨立完成、獨立驗收的單位。階段之間有明確的相依順序，不建議跳著做——後面的階段預設前面的產出已經存在且驗收通過。

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
- [`rules/database.md`](../rules/database.md) — `db/` 套件使用方式、transaction 寫法、軟刪除模式、狀態碼回傳慣例
- [`tests/CLAUDE.md`](../tests/CLAUDE.md) — 測試命名、fixtures 的陷阱、覆蓋要求

### 0.4 階段總覽

| Phase | 名稱 | 主要產出 | 相依 |
|:--:|------|---------|------|
| 0 | 環境準備 | 無（僅檢查） | — |
| 1 | 專案骨架與入口 | `app.py`、`utils.py`、設定檔 | 0 |
| 2 | 會員資料存取層 | `db/connection.py`、`db/users.py`、`db/__init__.py` | 1 |
| 3 | 共用樣板與 CSS | `base.html`、五個 CSS | 1 |
| 4 | 會員四子系統 | auth、profile、admin 與其模板 | 2、3 |
| 5 | 書目資料存取層 | `db/books.py` | 2 |
| 6 | books 子系統 | 館藏查詢與維護 | 5、3 |
| 7 | 借閱資料存取層 | `db/loans.py` | 5 |
| 8 | loans 子系統 | 借書、續借、還書、借閱管理 | 7、6 |
| 9 | 預約子系統 | `db/reservations.py` + `blueprints/reservations` | 7、8 |
| 10 | hub 改寫 | 首頁的服務卡片與借閱概況 | 8、9 |
| 11 | CSS 一致性稽核 | 三個新 CSS 的檢查 | 6、8、9 |
| 12 | 測試 | `tests/` 全套 218 個 | 4、6、8、9、10 |
| 13 | 文件與最終驗收 | `document/`、`CLAUDE.md`、`README.md` | 全部 |

---

## Phase 0 — 環境準備

### 目的

確認開發環境具備必要的工具與套件。

### 產出檔案

無。本階段只做檢查。

### 驗收

```bash
python3 --version          # 預期 3.10 以上
pip --version
docker --version           # Phase 11 才需要，先確認有裝
```

安裝套件：

```bash
pip install flask bcrypt captcha pytest pytest-flask
python3 -c "import flask, bcrypt, captcha, pytest; print('deps ok')"
```

預期輸出：

```
deps ok
```

### 關鍵決策記錄

`captcha` 套件會連帶安裝 `Pillow`。若安裝失敗，多半是系統缺少影像處理的編譯相依，
在 macOS 上通常裝了 Xcode command line tools 就能解決。

### 常見錯誤

| 錯誤 | 原因 | 處置 |
|------|------|------|
| `ModuleNotFoundError: No module named 'captcha'` | 只裝了 Flask | 補裝 `captcha` |
| `pip` 指向 Python 2 | 系統的 pip 舊 | 改用 `python3 -m pip` |

---

## Phase 1 — 專案骨架與入口

### 目的

建立目錄結構與可以啟動的最小 Flask 應用。此時還沒有任何 Blueprint，
只有 `/health` 端點。

### 產出檔案

| 檔案 | 處理 |
|------|------|
| `app.py` | 建立（換 Blueprint 清單） |
| `utils.py` | 建立 |
| `requirements.txt` | 建立 |
| `Dockerfile`、`docker-compose.yml`、`.dockerignore` | 建立 |
| `.gitignore`、`.gitattributes` | 建立 |
| `pytest.ini` | **建立** |

建立目錄：

```bash
mkdir -p db blueprints/{auth,hub,profile,admin,books,loans,reservations} \
         templates/{auth,hub,profile,admin,books,loans,reservations} \
         static rules document tests/data
touch blueprints/__init__.py tests/__init__.py tests/data/__init__.py
```

### `app.py` 的修改內容

本系統註冊 7 個 Blueprint。import 與 `register_blueprint`
都按字母順序排列，這樣新增子系統時不必思考該插在哪裡：

```python
from blueprints.admin import admin_bp
from blueprints.auth import auth_bp
from blueprints.books import books_bp
from blueprints.hub import hub_bp
from blueprints.loans import loans_bp
from blueprints.profile import profile_bp
from blueprints.reservations import reservations_bp
```

其餘（`secret_key`、`/health`、`__main__` 區塊）零修改。

### `pytest.ini` 的內容

```ini
[pytest]
testpaths = tests
norecursedirs = .git __pycache__
```

**這個檔案不是可選的。** 它把收集範圍限定在自己的 `tests/`，避免 pytest
一路往下走進不相干的目錄，收到別的 `conftest.py` 而產生 `ImportPathMismatchError`。

### 關鍵決策

`utils.py` 零修改。裡面三個函式（`_gen_captcha`、`_is_usable`、`login_required`）
與領域無關，圖書系統照用。**不要**在這裡加 `_is_admin`——依 `rules/flask-blueprint.md`
的規定，`_is_admin` 由每個 Blueprint 各自定義。

### 驗收

此時 `app.py` 的 import 會失敗（Blueprint 還不存在），所以只驗證檔案存在與語法：

```bash
python3 -c "import ast, pathlib; ast.parse(pathlib.Path('app.py').read_text()); print('app.py 語法正確')"
python3 -c "import utils; print('utils ok:', utils.CAPTCHA_LENGTH)"
ls db blueprints templates static rules document tests
```

預期：

```
app.py 語法正確
utils ok: 5
```

### 常見錯誤

| 錯誤 | 原因 |
|------|------|
| `ModuleNotFoundError: No module named 'blueprints'` | 忘了建 `blueprints/__init__.py` |
| pytest 收集到不該收的測試 | 忘了建 `pytest.ini` |

---

## Phase 2 — 會員資料存取層

### 目的

搬入 `db/` 套件的骨架與 `users` 表的存取，讓帳號相關功能有資料可用。

### 產出檔案

| 檔案 | 處理 |
|------|------|
| `db/connection.py` | 建立 |
| `db/users.py` | 建立（只改種子姓名與一行 docstring） |
| `db/__init__.py` | 建立（改匯出清單與 `init_db`） |

### `db/users.py` 的修改內容

只有兩處：

```python
# 種子姓名改為圖書館的語彙
('user@example.com',     'password123', 1, 1, '一般讀者'),    # 原：一般使用者
('admin@example.com',    'admin1234',   0, 1, '圖書館員'),    # 原：管理員

# set_user_role 的 docstring
"""設定角色（0 館員／管理員 / 1 讀者／一般使用者）。"""
```

**函式主體全部零修改。** `list_users` 的篩選、分頁、關鍵字搜尋邏輯與領域無關。

### `db/__init__.py` 的修改內容

本階段先做一個只有 `users` 的版本，後續階段再逐步加入：

```python
DB_PATH = os.environ.get('DB_PATH', 'database.db')

from .users import (find_user_by_email, find_user_by_id, create_user, ...)

def init_db():
    from .connection import _get_conn
    from .users import _seed_users_if_empty
    conn = _get_conn()
    conn.execute("""CREATE TABLE IF NOT EXISTS users (...)""")
    conn.commit()
    _seed_users_if_empty(conn)
    conn.close()
```

### 關鍵決策

`DB_PATH` 定義在 `db/__init__.py` 而不是 `connection.py`，而 `_get_conn()`
在**呼叫時**才 `from db import DB_PATH`。這個看似繞路的寫法是為了讓測試可以
`db.DB_PATH = '...'` 動態替換而立即生效——若在 `connection.py` 頂部 import，
替換就不會反映到已經 import 過的模組。

### 驗收

```bash
python3 - << 'EOF'
import os, tempfile, db
db.DB_PATH = os.path.join(tempfile.mkdtemp(), 't.db')
db.init_db()
u = db.find_user_by_email('admin@example.com')
print('種子帳號:', u['email'], u['name'], 'role =', u['role'])
items, total = db.list_users(1, 10)
print('帳號總數:', total)
EOF
```

預期：

```
種子帳號: admin@example.com 圖書館員 role = 0
帳號總數: 3
```

### 常見錯誤

| 錯誤 | 原因 |
|------|------|
| `ImportError: cannot import name 'DB_PATH'` | `connection.py` 在檔案頂部 import 了 `DB_PATH` |
| 測試換了路徑卻還是寫到 `database.db` | 同上 |
| 種子帳號重複 | `_seed_users_if_empty` 的 `COUNT(*)` 檢查被拿掉 |

---

## Phase 3 — 共用樣板與 CSS

### 目的

建立所有頁面的基礎：`base.html` 與設計 token。

### 產出檔案

| 檔案 | 處理 |
|------|------|
| `templates/base.html` | 建立（只改預設標題） |
| `static/common.css` | 建立 |
| `static/login.css` | 建立 |
| `static/hub.css` | 建立（Phase 10 再追加） |
| `static/profile.css` | 建立 |
| `static/admin.css` | 建立 |

`base.html` 的唯一修改：

```jinja
<title>{% block title %}校園圖書借閱系統{% endblock %}</title>
```

### 關鍵決策

`base.html` 一律載入 `common.css` 與 `login.css`，各頁的專屬 CSS 在
`{% block head %}` 中追加。這表示 `login.css` 的 body 樣式（置中）會影響所有頁面，
因此 `hub.css` 開頭有一段 `body { display: block; ... }` 覆寫回來。
新增的三個子系統 CSS 也需要同樣的覆寫——由 `equipment.css` 衍生時會一併帶過來。

`common.css` 只有一個 `:root` 區塊，定義五組按鍵顏色變數。**這是全站唯一
可以出現色碼的地方**（狀態徽章除外，它們是語意色而非按鍵色）。

### 驗收

```bash
grep -c "var(--btn" static/*.css       # common.css 為 0（它是定義端），其餘引用
head -3 templates/base.html
grep "block title" templates/base.html
```

預期 `base.html` 的標題行含「校園圖書借閱系統」。

### 常見錯誤

| 錯誤 | 原因 |
|------|------|
| 頁面內容全部置中且擠成一欄 | 子系統 CSS 沒有覆寫 `login.css` 的 body 樣式 |
| 送出按鈕沒有樣式 | 表單缺少 `class="login-form"`（僅登入／申請／內嵌登入需要） |

---

## Phase 4 — 會員四子系統

### 目的

讓登入、申請、個人資料、會員管理四件事可以運作。此時 hub 用一個最小版本，
Phase 10 再改寫。

### 產出檔案

| 檔案 | 處理 |
|------|------|
| `blueprints/auth/__init__.py` | 建立 |
| `blueprints/profile/__init__.py` | 建立 |
| `blueprints/admin/__init__.py` | 建立（只改 `ROLE_LABELS`） |
| `blueprints/hub/__init__.py` | 暫時建立 |
| `templates/auth/login.html` | 建立（改品牌字樣） |
| `templates/auth/register.html` | 建立 |
| `templates/profile/dashboard.html` | 建立（改身分字樣） |
| `templates/admin/user_list.html` | 建立 |
| `templates/admin/user_detail.html` | 建立（改下拉選項字樣） |
| 各 Blueprint 的 `CLAUDE.md` | 建立 |

### 修改內容一覽

```python
# blueprints/admin/__init__.py
ROLE_LABELS = {0: '館員（管理員）', 1: '讀者'}     # 原：{0: '管理員', 1: '一般使用者'}
```

```html
<!-- templates/auth/login.html -->
<h2>校園圖書借閱系統 v1.0</h2>                    <!-- 原：會員管理系統 v1.0 -->

<!-- templates/admin/user_detail.html 的角色下拉 -->
<option value="1" ...>讀者</option>
<option value="0" ...>館員（管理員）</option>

<!-- templates/profile/dashboard.html（兩處，檢視與編輯模式各一） -->
{{ '館員（管理員）' if user['role'] == 0 else '讀者' }}
```

`blueprints/auth` 與 `blueprints/profile` 的程式碼**一個字都不用改**。
它們只處理身分與個人欄位，與領域無關。

### 為什麼 `admin` 的程式主體零修改

`admin` 做的四件事（啟用、停用、角色、軟刪除）操作的都是 `users` 表，
三條自我保護規則（R1～R3）也與領域無關。唯一與領域有關的是「管理員」這個詞，
而它只出現在 `ROLE_LABELS` 這一個常數裡——這正是把顯示字串抽成常數的價值。

### 驗收

此時 `app.py` 仍會因為缺少三個 Blueprint 而 import 失敗。暫時把
`books`／`loans`／`reservations` 的 import 與註冊註解掉，然後：

```bash
python3 - << 'EOF'
import os, tempfile, db
db.DB_PATH = os.path.join(tempfile.mkdtemp(), 't.db')
from app import app
app.config['TESTING'] = True
db.init_db()
c = app.test_client()
print('GET /login    ', c.get('/login').status_code)
print('GET /register ', c.get('/register').status_code)
print('GET /profile  ', c.get('/profile').status_code, '(未登入應為 302)')

with c.session_transaction() as s: s['user_id'] = 2
print('GET /admin/users (館員)', c.get('/admin/users').status_code)
body = c.get('/admin/users').get_data(as_text=True)
print('角色標籤已改:', '館員（管理員）' in body)

with c.session_transaction() as s: s['user_id'] = 1
print('GET /admin/users (讀者)', c.get('/admin/users').status_code, '(應為 302)')
EOF
```

預期：

```
GET /login     200
GET /register  200
GET /profile   302 (未登入應為 302)
GET /admin/users (館員) 200
角色標籤已改: True
GET /admin/users (讀者) 302 (應為 302)
```

### 常見錯誤

| 錯誤 | 原因 |
|------|------|
| 讀者也能進 `/admin/users` | `_is_admin` 寫成 `role == 1` |
| 登入後 redirect 到 404 | `url_for('hub.home')` 但 hub 還沒註冊 |
| 角色下拉沒改到 | `user_detail.html` 有兩個 `<option>`，只改了一個 |

---

## Phase 5 — 書目資料存取層

### 目的

建立 `books` 與 `book_copies` 兩張表及其存取函式。這是本系統第一個全新模組。

### 產出檔案

| 檔案 | 處理 |
|------|------|
| `db/books.py` | **建立** |
| `db/__init__.py` | 修改（加入 books 的匯出與建表） |

### 實作順序建議

1. `_init_book_tables(conn)` — 兩個 `CREATE TABLE IF NOT EXISTS`
2. `_BOOK_COLUMNS` 常數 — 主檔欄位 + 兩個彙總子查詢
3. `list_books` / `get_book` / `find_book_by_isbn` — 查詢
4. `_format_barcode` / `create_book` / `update_book` — 寫入
5. `list_copies` / `get_copy` / `add_copy` / `set_copy_status` / `soft_delete_copy` — 複本
6. `soft_delete_book` — 最後做，因為它會用到 `loans` 與 `reservations` 表
7. `_SEED_BOOKS` 與 `_seed_books_if_empty`

### 關鍵決策

#### 可借數量不存欄位

```python
_BOOK_COLUMNS = """
    b.id, b.isbn, b.title, ...,
    (SELECT COUNT(*) FROM book_copies c
      WHERE c.book_id = b.id AND c.is_deleted = 0) AS total_copies,
    (SELECT COUNT(*) FROM book_copies c
      WHERE c.book_id = b.id AND c.is_deleted = 0 AND c.copy_status = 'available')
      AS available_copies
"""
```

抽成模組常數，讓 `list_books` 與 `get_book` 共用同一份定義——兩者的欄位若不一致，
模板在清單頁與詳細頁就會拿到不同結構的 Row。

**不要把「可借數量」存成欄位。** 理由見規格書 §6.6。

#### 條碼流水號以「歷來總數」推算

```python
used = conn.execute('SELECT COUNT(*) FROM book_copies WHERE book_id = ?', (book_id,)).fetchone()[0]
# 注意：這裡沒有 is_deleted = 0
```

**故意不過濾已刪除的複本。** 若過濾，刪掉 `-003` 之後新增的複本又會拿到 `-003`，
而舊條碼可能還貼在某本已下架的書上或出現在歷史紀錄裡。條碼一旦發出就不重用。

#### `soft_delete_book` 為什麼要檢查借閱

```python
active = conn.execute(
    "SELECT COUNT(*) FROM loans WHERE book_id = ? AND is_deleted = 0 AND returned_at IS NULL",
    (book_id,)).fetchone()[0]
if active > 0:
    return 'on_loan'
```

書還在讀者手上時下架書目，會讓那筆借閱指向一本查不到的書。擋下來，
並回傳狀態碼讓 Blueprint 顯示可行動的訊息。

### 驗收

```bash
python3 - << 'EOF'
import os, tempfile, db
db.DB_PATH = os.path.join(tempfile.mkdtemp(), 't.db')
db.init_db()

items, total = db.list_books(1, 20)
print('種子書目:', total, '筆')
print('複本總數:', sum(b['total_copies'] for b in items))

b = db.get_book(4)
print('書目 4:', b['title'], '| 館藏', b['total_copies'], '| 在架', b['available_copies'])

print('搜尋「學」:', [r['title'] for r in db.list_books(1, 10, keyword='學')[0]])
print('分類 science:', [r['title'] for r in db.list_books(1, 10, category='science')[0]])
print('ISBN 查詢:', db.find_book_by_isbn('9789861371234')['title'])

new_id = db.create_book('9781234567897', '測試書', '測試作者', '出版社', 2024,
                        'other', '簡介', 2)
print('新增書目 id:', new_id, '| 複本:', [c['copy_barcode'] for c in db.list_copies(new_id)])
db.add_copy(new_id)
print('加一本後:', [c['copy_barcode'] for c in db.list_copies(new_id)])

first = db.list_copies(new_id)[0]
print('設為整理中:', db.set_copy_status(first['id'], 'maintenance'))
print('在架剩:', db.get_book(new_id)['available_copies'])
print('刪除複本:', db.soft_delete_copy(first['id']))
print('再新增一本（條碼不重用）:', end=' ')
db.add_copy(new_id)
print([c['copy_barcode'] for c in db.list_copies(new_id)])
print('下架書目:', db.soft_delete_book(new_id))
print('下架後查得到嗎:', db.get_book(new_id))
EOF
```

預期：

```
種子書目: 10 筆
複本總數: 18
書目 4: 台灣通史新編 | 館藏 1 | 在架 1
搜尋「學」: ['普通物理學', '有機化學導論', '經濟學原理']
分類 science: ['普通物理學', '有機化學導論']
ISBN 查詢: 系統分析與設計
新增書目 id: 11 | 複本: ['0011-001', '0011-002']
加一本後: ['0011-001', '0011-002', '0011-003']
設為整理中: updated
在架剩: 2
刪除複本: deleted
再新增一本（條碼不重用）: ['0011-002', '0011-003', '0011-004']
下架書目: deleted
下架後查得到嗎: None
```

### 常見錯誤

| 錯誤 | 原因 |
|------|------|
| `no such table: loans` | `soft_delete_book` 在 `loans` 表建立前被呼叫；檢查 `init_db()` 的建表順序 |
| 在架數永遠等於館藏數 | 彙總子查詢漏了 `copy_status = 'available'` |
| 條碼重複 | 流水號的 `COUNT(*)` 加了 `is_deleted = 0` |
| `list_books` 的 `WHERE` 拼接後語法錯誤 | 忘了 `is_deleted = 0` 一定存在，所以 `clause` 恆為非空，不需要三元判斷 |

---

## Phase 6 — books 子系統

### 目的

讓館藏可以被查詢與維護。這是第一個有「開放瀏覽 + 館員專用」混合權限的子系統。

### 產出檔案

| 檔案 | 處理 |
|------|------|
| `blueprints/books/__init__.py` | **建立** |
| `blueprints/books/CLAUDE.md` | **建立** |
| `templates/books/index.html` | 參考 `equipment/index.html` 重寫 |
| `templates/books/book_form.html` | 參考 `equipment/equipment_form.html` 重寫 |
| `static/books.css` | **建立** |

### `static/books.css` 的重點

類別一律用 `book-` 前綴，兩件事要自己寫：

1. **五個狀態徽章**：`available`、`unavailable`（書目狀態）與
   `borrowed`、`maintenance`、`lost`（複本狀態）
2. **篩選列與搜尋框樣式**：`.book-search-form`、`.book-search-input`、
   `.book-search-select`、`.book-status-select`，顏色參照 `admin.css` 的對應樣式

### `blueprints/books/__init__.py` 的結構

```python
_PAGE_SIZE = 10
_MAX_COPY_COUNT = 50
CATEGORY_LABELS = {...}          # 六個分類
BOOK_STATUS_LABELS = {...}       # 兩個書目狀態
COPY_STATUS_LABELS = {...}       # 四個複本狀態
_ASSIGNABLE_COPY_STATUS = ('available', 'maintenance', 'lost')   # borrowed 不在其中
_ISBN_REGEX = re.compile(r'^(?:\d{9}[\dX]|\d{13})$')

def _current_user(): ...         # 允許回傳 None（開放瀏覽）
def _is_admin(user): ...
def _require_admin(): ...        # 回傳 (user, response) tuple
```

### 關鍵決策

#### `_require_admin()` 為什麼回傳 tuple

```python
user, response = _require_admin()
if response:
    return response
```

比裝飾器多兩行，但換來兩個好處：一是「未登入 → 登入頁」與「非館員 → 館藏頁 + flash」
兩種處置都在同一個函式裡看得見；二是不必處理裝飾器要怎麼把 `user` 傳給被裝飾的函式。

#### 新增與修改共用一個模板

`book_form.html` 以 `mode` 參數區分：`new` 顯示複本數量欄位，`edit` 顯示書目狀態欄位。
兩者不會同時出現——新增時書目狀態一律 `available`，修改時複本在館藏主頁維護。

因此 `_validate_book_form(form, require_copy_count)` 也用同一個旗標分岔。

#### ISBN 重複性檢查要排除自己

```python
existing = db.find_book_by_isbn(isbn)
if existing and existing['id'] != book_id:      # book_id 在新增時為 None
    return '此 ISBN 已有相同書目'
```

新增時 `book_id` 是 `None`，永遠不等於任何既有 id，所以同一段程式可以服務兩種模式。

### 驗收

```bash
python3 - << 'EOF'
import os, tempfile, db
db.DB_PATH = os.path.join(tempfile.mkdtemp(), 't.db')
from app import app
app.config['TESTING'] = True
db.init_db()

guest = app.test_client()
print('訪客 GET /books/       ', guest.get('/books/').status_code)
print('訪客 GET /books/?id=1  ', guest.get('/books/?id=1').status_code)
body = guest.get('/books/?id=1').get_data(as_text=True)
print('訪客看到借閱按鈕嗎:', '借閱這本書' in body, '(應為 False)')
print('訪客看到複本清單嗎:', '館藏複本' in body, '(應為 True)')

reader = app.test_client()
with reader.session_transaction() as s: s['user_id'] = 1
body = reader.get('/books/?id=1').get_data(as_text=True)
print('讀者看到借閱按鈕嗎:', '借閱這本書' in body, '(應為 True)')
print('讀者看到新增複本嗎:', '新增複本' in body, '(應為 False)')

lib = app.test_client()
with lib.session_transaction() as s: s['user_id'] = 2
body = lib.get('/books/?id=1').get_data(as_text=True)
print('館員看到新增複本嗎:', '新增複本' in body, '(應為 True)')

# 搜尋與分類
print('搜尋「資料庫」筆數:', guest.get('/books/?q=資料庫').get_data(as_text=True).count('book-title-link'))
print('分類 art 筆數     :', guest.get('/books/?category=art').get_data(as_text=True).count('book-title-link'))

# 權限：讀者不可新增
before = db.list_books(1, 100)[1]
reader.post('/books/new', data={'isbn':'9781111111111','title':'x','author':'y',
                                'category':'other','copy_count':'1'})
print('讀者新增書目後總數不變:', db.list_books(1, 100)[1] == before)

# 館員新增（含連字號的 ISBN）
r = lib.post('/books/new', data={'isbn':'978-957-11-1234-5','title':'軟體工程','author':'周雅雯',
                                 'publisher':'碁峰','publish_year':'2024','category':'technology',
                                 'description':'','copy_count':'2'})
print('館員新增 →', r.status_code, r.headers.get('Location'))
print('ISBN 已去連字號:', db.find_book_by_isbn('9789571112345') is not None)

# 驗證失敗會回 200 並帶訊息
r = lib.post('/books/new', data={'isbn':'abc','title':'x','author':'y',
                                 'category':'other','copy_count':'1'})
print('壞 ISBN →', r.status_code, 'ISBN 格式不正確' in r.get_data(as_text=True))
EOF
```

預期：

```
訪客 GET /books/        200
訪客 GET /books/?id=1   200
訪客看到借閱按鈕嗎: False (應為 False)
訪客看到複本清單嗎: True (應為 True)
讀者看到借閱按鈕嗎: True (應為 True)
讀者看到新增複本嗎: False (應為 False)
館員看到新增複本嗎: True (應為 True)
搜尋「資料庫」筆數: 1
分類 art 筆數     : 1
讀者新增書目後總數不變: True
館員新增 → 302 /books/?id=11
ISBN 已去連字號: True
壞 ISBN → 200 True
```

### 常見錯誤

| 錯誤 | 原因 |
|------|------|
| 翻頁後搜尋條件消失 | 分頁連結的 `url_for` 沒帶 `q`、`category`、`id` |
| 訪客看到「無操作權限」而不是館藏頁 | `index` 誤用了 `_require_admin()` |
| 修改書目時說 ISBN 重複 | 忘了排除自己（`existing['id'] != book_id`） |
| 複本狀態下拉出現「借出中」 | 用了 `COPY_STATUS_LABELS` 而非 `_ASSIGNABLE_COPY_STATUS` |

---

## Phase 7 — 借閱資料存取層

### 目的

建立 `loans` 表與全部借閱業務規則。**這是整個系統的核心階段**，
之後的 Blueprint 只是把這裡的狀態碼翻成中文。

### 產出檔案

| 檔案 | 處理 |
|------|------|
| `db/loans.py` | **建立** |
| `db/__init__.py` | 修改（加入 loans 的匯出與建表） |

### 實作順序建議

1. 四個政策常數
2. `_IS_OVERDUE`、`_LOAN_COLUMNS`、`_LOAN_JOINS` 三個 SQL 片段常數
3. `_init_loan_tables`
4. `count_active_loans` / `has_overdue_loans` / `find_active_loan` — 借書規則要用的三個查詢
5. `borrow_book` — 六道檢查 + 三段更新
6. `return_loan` + `_promote_next_reservation`
7. `renew_loan`
8. 其餘查詢函式

### 關鍵決策

#### 政策常數是唯一的數字來源

```python
LOAN_PERIOD_DAYS  = 14
RENEW_PERIOD_DAYS = 14
MAX_ACTIVE_LOANS  = 5
MAX_RENEW_COUNT   = 1
```

SQL 中以 f-string 帶入：

```python
f"""INSERT INTO loans (..., due_at, ...)
    VALUES (..., datetime('now', '+{LOAN_PERIOD_DAYS} days'), ...)"""
```

> **這是本專案唯一允許用 f-string 組 SQL 的地方**，因為代入的是模組內定義的
> 整數常數，不是使用者輸入。所有來自請求的值一律走 `?` 參數化。
> 若把常數改成從資料庫或設定檔讀取，這裡就必須改寫。

#### 逾期用推導而非欄位

```python
_IS_OVERDUE = (
    "CASE WHEN l.returned_at IS NULL AND l.due_at < datetime('now')"
    ' THEN 1 ELSE 0 END AS is_overdue'
)
```

放進 `_LOAN_COLUMNS`，所有借閱查詢都會帶這個欄位。**不要**改用一個
`order_status = 'overdue'` 的狀態值——那種欄位需要外力去寫入，
而真實系統裡往往沒有任何程式真的會去寫它。

#### `_promote_next_reservation` 為什麼收 `conn`

```python
def _promote_next_reservation(conn, book_id):
    ...   # 不 commit
```

它必須與還書寫在同一個 transaction 內：若還書成功而遞補失敗，
書回架了卻沒人被通知，佇列就卡住。收外部 `conn` 是表達這個約束最簡單的方式。

它定義在 `loans.py` 而不是 `reservations.py`，因為 `return_loan` 是主要呼叫端；
`reservations.cancel_reservation` 在函式內 import 它，避免循環相依。

#### 檢查順序：逾期在冊數上限之前

```python
if overdue > 0:        return 'has_overdue', None
if active >= MAX_ACTIVE_LOANS:  return 'limit_reached', None
```

順序決定使用者看到哪一句話。逾期的人該被告知「請先歸還」，
那是他能採取的行動；「已達上限」只是陳述事實。

### 驗收

```bash
PYTHONPATH=. python3 - << 'EOF'
import os, tempfile, db
db.DB_PATH = os.path.join(tempfile.mkdtemp(), 't.db')
db.init_db()
from db.connection import _get_conn

print('政策常數:', db.LOAN_PERIOD_DAYS, db.RENEW_PERIOD_DAYS, db.MAX_ACTIVE_LOANS, db.MAX_RENEW_COUNT)
print('借書（書目 4，唯一複本）:', db.borrow_book(4, 1))
print('在架數:', db.get_book(4)['available_copies'])
print('複本狀態:', db.list_copies(4)[0]['copy_status'])
print('同書再借:', db.borrow_book(4, 1)[0])
print('他人借（無複本）:', db.borrow_book(4, 2)[0])

loan = db.list_my_loans(1)[0]
print('借期天數:', loan['due_at'][:10], '←', loan['borrowed_at'][:10])
print('續借:', db.renew_loan(loan['id'], 1), '| 次數', db.get_loan(loan['id'])['renew_count'])
print('再續借:', db.renew_loan(loan['id'], 1))
print('他人續借:', db.renew_loan(loan['id'], 2))

conn = _get_conn()
conn.execute("UPDATE loans SET due_at = datetime('now', '-1 day') WHERE id = ?", (loan['id'],))
conn.commit(); conn.close()
print('改為逾期後 is_overdue:', db.get_loan(loan['id'])['is_overdue'])
print('逾期時借別本:', db.borrow_book(1, 1)[0])
print('有逾期嗎:', db.has_overdue_loans(1), '| 全館逾期數:', db.count_overdue_loans())

print('歸還:', db.return_loan(loan['id'], 1))
print('重複歸還:', db.return_loan(loan['id'], 1))
print('歸還後在架:', db.get_book(4)['available_copies'], '| 還有逾期嗎:', db.has_overdue_loans(1))

for bid in (1, 2, 3, 5, 6):
    db.borrow_book(bid, 1)
print('借滿 5 本後再借:', db.borrow_book(9, 1)[0], '| 目前', db.count_active_loans(1), '本')
print('全部借閱:', db.list_all_loans(1, 50)[1], '| 借閱中:', db.list_all_loans(1, 50, 'active')[1],
      '| 已歸還:', db.list_all_loans(1, 50, 'returned')[1])
EOF
```

預期（借期那一行的日期依執行當天而異，重點是兩個日期相差 14 天）：

```
政策常數: 14 14 5 1
借書（書目 4，唯一複本）: ('ok', 1)
在架數: 0
複本狀態: borrowed
同書再借: already_borrowed
他人借（無複本）: no_copy
借期天數: 2026-08-25 ← 2026-08-11
續借: ok | 次數 1
再續借: limit_reached
他人續借: forbidden
改為逾期後 is_overdue: 1
逾期時借別本: has_overdue
有逾期嗎: True | 全館逾期數: 1
歸還: ok
重複歸還: returned
歸還後在架: 1 | 還有逾期嗎: False
借滿 5 本後再借: limit_reached | 目前 5 本
全部借閱: 6 | 借閱中: 5 | 已歸還: 1
```

### 常見錯誤

| 錯誤 | 原因 |
|------|------|
| `no such table: reservations` | `borrow_book` 會更新 `reservations`；檢查 `init_db()` 的建表順序 |
| 逾期永遠是 0 | `_IS_OVERDUE` 忘了加進 `_LOAN_COLUMNS`，或比較寫成 `>` |
| 續借後到期日只延長到「今天 + 14 天」 | 應該是 `datetime(due_at, '+14 days')`，不是 `datetime('now', ...)` |
| 還書後在架數沒回來 | 忘了更新 `book_copies.copy_status` |
| 借書成功但 `book_id` 是 `None` | `INSERT` 的欄位順序與 `VALUES` 對不上 |

---

## Phase 8 — loans 子系統

### 目的

把 Phase 7 的規則接上網頁介面：借書、續借、還書、我的借閱、借閱管理。

### 產出檔案

| 檔案 | 處理 |
|------|------|
| `blueprints/loans/__init__.py` | **建立** |
| `blueprints/loans/CLAUDE.md` | **建立** |
| `templates/loans/my_loans.html` | 參考 `equipment/my_orders.html` 重寫 |
| `templates/loans/loan_detail.html` | 參考 `equipment/order_detail.html` 重寫 |
| `templates/loans/admin_loans.html` | 參考 `equipment/admin_orders.html` 重寫 |
| `static/loans.css` | 由 `equipment.css` 衍生（前綴 `loan-`） |

### 關鍵決策

#### Blueprint 只做三件事

```python
result, loan_id = db.borrow_book(book_id, user['id'])
if result == 'ok':
    flash(f'借閱成功，請於 {db.LOAN_PERIOD_DAYS} 天內歸還', 'success')
    return redirect(url_for('loans.loan_detail', loan_id=loan_id))
flash(BORROW_MESSAGES.get(result, '借閱失敗'), 'error')
```

確認身分、呼叫 `db`、翻譯狀態碼。**這個函式裡沒有任何一個 `if` 在判斷業務規則。**

`.get(result, '借閱失敗')` 一定要給預設值：`db` 層日後新增狀態碼卻忘了補訊息時，
使用者看到的是「借閱失敗」而不是空白的 flash。

#### 還書的 redirect 依來源決定

館員從借閱管理頁按「還書登記」時，表單帶一個 hidden input：

```html
<input type="hidden" name="from" value="admin">
```

```python
if _is_admin(user) and request.form.get('from') == 'admin':
    return redirect(url_for('loans.admin_loans'))
return redirect(url_for('loans.loan_detail', loan_id=loan_id))
```

不用 `request.referrer`——那是使用者可控的標頭，而且瀏覽器不保證會送。

#### 續借按鈕的顯示條件

模板中：

```jinja
{% if not l['is_overdue'] and l['renew_count'] < max_renew_count %}
```

**這只是體驗優化，不是安全機制。** 伺服器端的 `db.renew_loan()` 仍然會檢查全部六個條件。
兩邊都要有：只有前端會被繞過，只有後端則使用者要按了才知道不行。

### 驗收

```bash
PYTHONPATH=. python3 - << 'EOF'
import os, tempfile, db
db.DB_PATH = os.path.join(tempfile.mkdtemp(), 't.db')
from app import app
app.config['TESTING'] = True
db.init_db()

reader = app.test_client()
with reader.session_transaction() as s: s['user_id'] = 1
lib = app.test_client()
with lib.session_transaction() as s: s['user_id'] = 2
guest = app.test_client()

print('訪客借書 →', guest.post('/loans/borrow/1').headers.get('Location'), '| 借閱數',
      db.list_all_loans(1, 10)[1])
r = reader.post('/loans/borrow/1')
print('讀者借書 →', r.status_code, r.headers.get('Location'))
r = reader.post('/loans/borrow/1', follow_redirects=True)
print('重複借同書:', '您已借閱此書且尚未歸還' in r.get_data(as_text=True))

print('GET /loans/my-loans   ', reader.get('/loans/my-loans').status_code)
print('GET /loans/1 (本人)   ', reader.get('/loans/1').status_code)
print('GET /loans/1 (館員)   ', lib.get('/loans/1').status_code)
db.set_user_active(3, 1)
other = app.test_client()
with other.session_transaction() as s: s['user_id'] = 3
r = other.get('/loans/1', follow_redirects=True)
print('GET /loans/1 (他人)   ', '無權限查看此借閱紀錄' in r.get_data(as_text=True))

r = lib.post('/loans/1/renew', follow_redirects=True)
print('館員代續借被擋:', '無權限操作他人的借閱紀錄' in r.get_data(as_text=True))
r = reader.post('/loans/1/renew', follow_redirects=True)
print('本人續借成功:', '續借成功' in r.get_data(as_text=True))

print('GET /loans/admin/loans (讀者)', reader.get('/loans/admin/loans').headers.get('Location'))
print('GET /loans/admin/loans (館員)', lib.get('/loans/admin/loans').status_code)
r = lib.post('/loans/1/return', data={'from': 'admin'})
print('館員還書登記 →', r.headers.get('Location'))
print('已歸還:', db.get_loan(1)['returned_at'] is not None)
EOF
```

預期：

```
訪客借書 → /login | 借閱數 0
讀者借書 → 302 /loans/1
重複借同書: True
GET /loans/my-loans    200
GET /loans/1 (本人)    200
GET /loans/1 (館員)    200
GET /loans/1 (他人)    True
館員代續借被擋: True
本人續借成功: True
GET /loans/admin/loans (讀者) /
GET /loans/admin/loans (館員) 200
館員還書登記 → /loans/admin/loans
已歸還: True
```

> 注意倒數第三行：讀者被擋下時 redirect 到 `/`，flash 訊息要到 Phase 10
> 改寫 hub 之後才看得到。此時測「無操作權限」這句話會失敗，這是正常的。

### 常見錯誤

| 錯誤 | 原因 |
|------|------|
| 訪客 POST 借書後得到 500 | `login_required` 之後忘了再取 `_current_user()`，`user` 為 `None` |
| 館員可以幫讀者續借 | 續借路由誤加了 `or _is_admin(user)` |
| 還書後停在明細頁 | `from=admin` 的 hidden input 沒放進表單 |
| 借閱清單的排序每次不同 | `ORDER BY` 只有 `due_at`，同日期的順序不定；需再加 `id` |

---

## Phase 9 — 預約子系統

### 目的

補上最後一塊：書被借光時的候補排隊，以及還書時的自動遞補。

### 產出檔案

| 檔案 | 處理 |
|------|------|
| `db/reservations.py` | **建立** |
| `blueprints/reservations/__init__.py` | **建立** |
| `blueprints/reservations/CLAUDE.md` | **建立** |
| `templates/reservations/my_reservations.html` | **建立** |
| `templates/reservations/admin_reservations.html` | **建立** |
| `static/reservations.css` | 由 `equipment.css` 衍生（前綴 `res-`） |
| `db/__init__.py` | 修改（加入 reservations 的匯出與建表） |

### 關鍵決策

#### 順位用 SQL 算，不存欄位

```sql
(SELECT COUNT(*) FROM reservations q
  WHERE q.book_id = r.book_id AND q.is_deleted = 0
    AND q.reservation_status = 'waiting'
    AND (q.reserved_at < r.reserved_at
         OR (q.reserved_at = r.reserved_at AND q.id < r.id))
) + 1 AS queue_position
```

若把順位存成欄位，每次有人取消都要把後面所有人的順位減一——一個 N 筆的
`UPDATE`，而且漏掉任何一條取消路徑就永久錯亂。用 `COUNT` 算，
前面的人一消失順位自動往前。

`reserved_at` 相同時以 `id` 決勝負：SQLite 的 `datetime('now')` 只精確到秒，
同一秒內建立的兩筆預約需要一個穩定的排序依據，否則同一筆預約在不同次查詢
可能拿到不同順位。

#### 「有書就不給預約」

```python
if available > 0:
    return 'available', None
```

這條規則讓預約的語意單純：預約只存在於「想借但借不到」的情況。
若允許有書時也能預約，就得回答「預約中的人和現場的人誰優先」，
而那需要保留架機制（KI-21 說明為何不做）。

#### 取消 `ready` 要遞補

```python
was_ready = res['reservation_status'] == 'ready'
with conn:
    conn.execute("UPDATE reservations SET reservation_status = 'cancelled' ...")
    if was_ready:
        from .loans import _promote_next_reservation
        _promote_next_reservation(conn, res['book_id'])
```

漏了這段，佇列會在第一個人取消後永遠卡住——後面的人一直是 `waiting`，
而書明明在架上。這是實作預約時最容易漏的一條路徑。

### 驗收

```bash
PYTHONPATH=. python3 - << 'EOF'
import os, tempfile, db
db.DB_PATH = os.path.join(tempfile.mkdtemp(), 't.db')
from app import app
app.config['TESTING'] = True
db.init_db()
db.set_user_active(3, 1)

reader1 = app.test_client()
with reader1.session_transaction() as s: s['user_id'] = 1
reader3 = app.test_client()
with reader3.session_transaction() as s: s['user_id'] = 3

db.borrow_book(4, 2)                      # 館員借走唯一複本
print('有可借複本時預約:', db.create_reservation(1, 1)[0])
r = reader1.post('/reservations/new/4', follow_redirects=True)
print('讀者 1 預約 →', r.status_code, '預約成功' in r.get_data(as_text=True))
print('重複預約:', db.create_reservation(4, 1)[0])
reader3.post('/reservations/new/4')
print('順位: 讀者1 =', db.list_my_reservations(1)[0]['queue_position'],
      '讀者3 =', db.list_my_reservations(3)[0]['queue_position'])

loan_id = db.list_my_loans(2)[0]['id']
db.return_loan(loan_id, 2)
print('還書後 讀者1 狀態:', db.list_my_reservations(1)[0]['reservation_status'])
print('         讀者3 狀態:', db.list_my_reservations(3)[0]['reservation_status'],
      '順位', db.list_my_reservations(3)[0]['queue_position'])

res1 = db.list_my_reservations(1)[0]['id']
reader1.post(f'/reservations/{res1}/cancel')
print('取消 ready 後 讀者3 狀態:', db.list_my_reservations(3)[0]['reservation_status'])

res3 = db.list_my_reservations(3)[0]['id']
print('讀者1 取消他人預約:', db.cancel_reservation(res3, 1))
print('館員取消他人預約:', db.cancel_reservation(res3, 2, True))
print('已取消的再取消:', db.cancel_reservation(res3, 2, True))
EOF
```

預期：

```
有可借複本時預約: available
讀者 1 預約 → 200 True
重複預約: duplicate
順位: 讀者1 = 1 讀者3 = 2
還書後 讀者1 狀態: ready
         讀者3 狀態: waiting 順位 1
取消 ready 後 讀者3 狀態: ready
讀者1 取消他人預約: forbidden
館員取消他人預約: ok
已取消的再取消: closed
```

### 常見錯誤

| 錯誤 | 原因 |
|------|------|
| `ImportError: cannot import name '_promote_next_reservation'` | 在 `reservations.py` 檔案頂部 import 造成循環相依；要放在函式內 |
| 取消第一位後佇列卡住 | 漏了 `was_ready` 的遞補分支 |
| 順位每次查詢都不同 | 子查詢的 tie-break 漏了 `q.id < r.id` |
| 借到書後預約還停在 `ready` | `borrow_book` 裡漏了把預約標成 `fulfilled` 的 `UPDATE` |
| 已完成的預約也能取消 | 狀態檢查寫成只擋 `cancelled`，漏了 `fulfilled` |

---

## Phase 10 — hub 改寫

### 目的

把首頁從會員管理系統的樣子換成圖書館的樣子：服務卡片、借閱概況、flash 顯示。

### 產出檔案

| 檔案 | 處理 |
|------|------|
| `blueprints/hub/__init__.py` | 修改（加入 `stats` 計算） |
| `templates/hub/home.html` | 改寫（卡片、概況、flash 區塊） |
| `static/hub.css` | 追加 `.hub-stats`、`.hub-notice` 樣式 |
| `blueprints/hub/CLAUDE.md` | 改寫 |

### 修改內容

登入表單那一段（POST 分支）**零修改**——它與領域無關。新增的只有：

```python
stats = None
if user is not None:
    active_loans = db.list_my_loans(user['id'], 'active')
    stats = {
        'active_count':      len(active_loans),
        'overdue_count':     sum(1 for row in active_loans if row['is_overdue']),
        'max_active_loans':  db.MAX_ACTIVE_LOANS,
        'reservation_count': sum(1 for row in db.list_my_reservations(user['id'])
                                 if row['reservation_status'] in ('waiting', 'ready')),
    }
```

`stats` 在未登入時是 `None`，模板的訪客分支不會用到它，因此**訪客的首頁不查資料庫**。

### 關鍵決策

#### 首頁必須顯示 flash

```jinja
{% with messages = get_flashed_messages(with_categories=true) %}
  {% for category, message in messages %}
    <div class="hub-notice hub-notice-{{ 'alert' if category == 'error' else 'success' }}">
      {{ message }}
    </div>
  {% endfor %}
{% endwith %}
```

**首頁一定要有這段。** 少了它，讀者誤觸 `/loans/admin/loans` 被擋下、
redirect 回首頁之後**什麼訊息都沒有**——畫面看起來就像連結壞掉（規格書 §11.5）。

#### 逾期用警示色而不是只列數字

概況列的逾期方塊在 `overdue_count > 0` 時套 `.hub-stat-alert`，
下方另外出現一整條說明「逾期期間無法再借新書」。理由是：
數字本身不告訴使用者「所以呢」，而借書被擋是逾期最直接的後果。

### 驗收

```bash
PYTHONPATH=. python3 - << 'EOF'
import os, tempfile, db
db.DB_PATH = os.path.join(tempfile.mkdtemp(), 't.db')
from app import app
app.config['TESTING'] = True
db.init_db()
from db.connection import _get_conn

guest = app.test_client()
body = guest.get('/').get_data(as_text=True)
print('訪客：館藏連結', 'href="/books/"' in body, '| 鎖定卡片', 'hub-card-locked' in body,
      '| 內嵌登入', 'login-form' in body)

reader = app.test_client()
with reader.session_transaction() as s: s['user_id'] = 1
body = reader.get('/').get_data(as_text=True)
print('讀者：概況 0/5', '0 / 5' in body, '| 館員卡片隱藏', '/admin/users' not in body)

db.borrow_book(1, 1); db.borrow_book(2, 1)
print('借兩本後：', '2 / 5' in reader.get('/').get_data(as_text=True))

conn = _get_conn()
conn.execute("UPDATE loans SET due_at = datetime('now','-1 day') WHERE id = 1")
conn.commit(); conn.close()
print('逾期警示條:', 'hub-notice-alert' in reader.get('/').get_data(as_text=True))

lib = app.test_client()
with lib.session_transaction() as s: s['user_id'] = 2
body = lib.get('/').get_data(as_text=True)
print('館員三張管理卡片:', all(x in body for x in
      ['/admin/users', '/loans/admin/loans', '/reservations/admin/reservations']))

r = reader.get('/loans/admin/loans', follow_redirects=True)
print('權限 flash 顯示於首頁:', '無操作權限' in r.get_data(as_text=True))

db.soft_delete_user(1)
print('已刪除帳號回落訪客視圖:', '歡迎使用' in reader.get('/').get_data(as_text=True))
EOF
```

預期：

```
訪客：館藏連結 True | 鎖定卡片 True | 內嵌登入 True
讀者：概況 0/5 True | 館員卡片隱藏 True
借兩本後： True
逾期警示條: True
館員三張管理卡片: True
權限 flash 顯示於首頁: True
已刪除帳號回落訪客視圖: True
```

### 常見錯誤

| 錯誤 | 原因 |
|------|------|
| 訪客首頁 500 | 模板的訪客分支引用了 `stats['xxx']`，而 `stats` 是 `None` |
| 已刪除的帳號被踢到登入頁 | 首頁應該回落為訪客視圖，不 redirect |
| 讀者也看得到管理卡片 | `{% if user['role'] == 0 %}` 寫在錯誤的巢狀層級 |
| flash 出現兩次 | `get_flashed_messages()` 被呼叫兩次（它會消耗訊息，但同一次請求中重複呼叫仍會重複渲染既有的 list） |

---

## Phase 11 — CSS 一致性稽核

### 目的

三個新 CSS 都是由 `equipment.css` 機械衍生而來，這個階段負責確認衍生沒有留下
斷裂：類別前綴、設計 token、模板引用的類別是否都有定義。

### 產出檔案

無新檔案，只有修正。

### 驗收

**檢查 1：按鍵背景色是否都走 token**

```bash
grep -nE "^\s*\.(book|loan|res)-btn[a-z-]*(:hover)?\s*\{[^}]*background-color:\s*#" \
     static/books.css static/loans.css static/reservations.css | wc -l
```

預期輸出 `0`。

> 注意只檢查 `background-color`。`color: #fff`（按鍵文字白色）是允許的，
> `rules/flask-blueprint.md` 的範例本身就是這樣寫。

**檢查 2：token 確實有被引用**

```bash
for f in books loans reservations; do echo -n "$f.css: "; grep -c "var(--btn" static/$f.css; done
```

預期三個檔案都是 `16`。

**檢查 3：前綴沒有殘留**

```bash
grep -l "eq-" static/books.css static/loans.css static/reservations.css
```

預期**無輸出**。有輸出表示 `sed` 換前綴時漏了。

**檢查 4：模板引用的類別都有定義**

```bash
PYTHONPATH=. python3 - << 'EOF'
import re, pathlib
for name, prefix in (('books','book-'), ('loans','loan-'), ('reservations','res-')):
    css = pathlib.Path(f'static/{name}.css').read_text()
    defined = set(re.findall(r'\.(' + prefix + r'[a-z0-9-]+)', css))
    used = set()
    for tpl in pathlib.Path(f'templates/{name}').glob('*.html'):
        for attr in re.findall(r'class="([^"]+)"', tpl.read_text()):
            used |= {c for c in attr.split() if c.startswith(prefix) and '{' not in c}
    missing = sorted(used - defined)
    print(f'{name:14} 使用 {len(used):2} 類別，未定義: {missing if missing else "無"}')
EOF
```

預期：

```
books          使用 63 類別，未定義: 無
loans          使用 43 類別，未定義: 無
reservations   使用 30 類別，未定義: 無
```

> 過濾掉含 `{` 的字串是必要的——模板中有
> `class="book-badge book-badge-{{ b['book_status'] }}"` 這種 Jinja 內插，
> 靜態掃描無法展開，會產生假陽性。

### 常見錯誤

| 錯誤 | 原因 |
|------|------|
| `badge-lg` 被回報未定義 | 衍生 CSS 時用 `^\.<prefix>badge-[a-z-]+\{...\}` 清除狀態徽章，
把尺寸修飾詞 `.book-badge-lg` 一起刪掉了。它不是狀態色，要補回來 |
| 徽章沒有顏色 | 狀態代碼與 CSS 類別名不一致（例如 DB 存 `maintenance`，CSS 寫 `maintain`） |
| 檢查 1 抓到 6 筆 | grep 沒有限定 `background-color`，把 `color: #fff` 也算進去了 |

---

## Phase 12 — 測試

### 目的

補齊 218 個測試，並確認全部通過。

### 產出檔案

| 檔案 | 處理 |
|------|------|
| `tests/conftest.py` | 修改（追加四個圖書 fixture） |
| `tests/data/users.py` | 建立 |
| `tests/data/library.py` | **建立** |
| `tests/test_auth.py`、`test_profile.py` | 建立 |
| `tests/test_admin.py` | 修改（一個搜尋關鍵字） |
| `tests/test_hub.py` | 改寫 |
| `tests/test_books.py`、`test_loans.py`、`test_reservations.py` | **建立** |
| `tests/CLAUDE.md` | 改寫 |

### `tests/conftest.py` 追加的 fixtures

```python
@pytest.fixture
def single_copy_book(app):      # 只有一本複本 → 借走後可測預約
@pytest.fixture
def multi_copy_book(app):       # 三本複本 → 測複本維護
@pytest.fixture
def overdue_loan(app):          # 直接改寫 due_at 製造逾期
@pytest.fixture
def make_overdue(app):          # 把任一筆借閱改為逾期的 helper
```

逾期用改寫 `due_at` 製造，不凍結時間也不等待——這是「逾期用推導而非欄位」
這個設計帶來的額外好處：測試只要動一個欄位就能造出任意時點的狀態。

### `tests/test_admin.py` 的唯一修改

```python
# 原：q=管理員   本系統的種子帳號 name 已改為「圖書館員」
body = admin_client.get('/admin/users?q=圖書館員').get_data(as_text=True)
```

其餘 29 個測試零修改——這是 `admin` 子系統與領域無關的最好證明。

### 覆蓋要求

除了規格書 §12.5 的五條原則，本階段特別要確認這六個交互作用有測試：

| 交互作用 | 測試 |
|---------|------|
| 逾期擋借書 | `test_borrow_blocked_when_overdue` |
| 逾期擋續借 | `test_renew_overdue_loan_rejected` |
| 預約擋續借 | `test_renew_blocked_when_others_reserved` |
| 還書解除逾期封鎖 | `test_borrow_allowed_again_after_returning_overdue` |
| 還書遞補預約 | `test_return_promotes_waiting_reservation` |
| 借書完成預約 | `test_borrowing_ready_book_fulfills_reservation` |

### 驗收

```bash
pytest -q
```

預期：

```
218 passed
```

分模組確認：

```bash
for f in auth hub profile admin books loans reservations; do
  echo -n "test_$f.py: "; pytest tests/test_$f.py -q 2>&1 | tail -1
done
```

預期各為 23、13、8、30、62、53、29 個 passed。

### 常見錯誤

| 錯誤 | 原因 |
|------|------|
| `ImportPathMismatchError` | 缺 `pytest.ini`，pytest 收集到其他目錄的 `conftest.py` |
| 「他人權限」的測試被前一層擋下 | `other_client`（ID=3）的帳號是停用的，要先 `db.set_user_active(3, 1)` |
| 同一測試中兩個身分互相覆蓋 | 三個身分 client 都由同一個 `client` 衍生；需要第二個時請自行 `app.test_client()` |
| 分頁測試湊不到第二頁 | 借書受複本數與每人 5 冊上限雙重限制；改用「多建幾本書」而非「多建幾個人」 |
| 測試很慢 | 大量呼叫 `db.create_user()`（bcrypt cost=10，每筆約 0.1 秒） |

---

## Phase 13 — 文件與最終整合驗收

### 目的

補齊文件，並以一次端對端的流程確認整個系統可用。

### 產出檔案

| 檔案 | 處理 |
|------|------|
| `document/system-spec.md` | **全新建立** |
| `document/build-guide.md` | **全新建立**（本文件） |
| `CLAUDE.md`（根目錄） | **全新建立** |
| `README.md` | **全新建立** |
| `db/CLAUDE.md` | 改寫 |
| `rules/database.md`、`rules/flask-blueprint.md` | 追加「本專案的補充規範」一節 |
| 七個 `blueprints/*/CLAUDE.md` | **建立** |

### 文件之間的一致性檢查

以下三處必須一致，改任何一處都要回頭改另外兩處：

| 內容 | 出現位置 |
|------|---------|
| 訊息字串 | Blueprint 的字典、`tests/data/library.py`、規格書 §9.8 |
| 借閱政策數值 | `db/loans.py` 的常數、規格書 §6.10、`tests/data/library.py` 的 `POLICY` |
| 路由清單 | `app.py` 的註冊、規格書 §7.1、各 `blueprints/*/CLAUDE.md` |

### 驗收

**A. 路由總數與清單**

```bash
PYTHONPATH=. python3 - << 'EOF'
import os, tempfile, db
db.DB_PATH = os.path.join(tempfile.mkdtemp(), 't.db')
from app import app
rules = [r for r in app.url_map.iter_rules() if r.endpoint != 'static']
print('路由總數:', len(rules))
print('Blueprint:', sorted({r.endpoint.split('.')[0] for r in rules if '.' in r.endpoint}))
EOF
```

預期：

```
路由總數: 31
Blueprint: ['admin', 'auth', 'books', 'hub', 'loans', 'profile', 'reservations']
```

**B. 端對端流程**

```bash
PYTHONPATH=. python3 - << 'EOF'
import os, tempfile, db
db.DB_PATH = os.path.join(tempfile.mkdtemp(), 't.db')
from app import app
app.config['TESTING'] = True
db.init_db()

c = app.test_client()
# 1. 申請帳號
c.post('/register', data={'email':'new@example.com','password':'password123',
                          'confirm_password':'password123','name':'新讀者'})
print('1 申請帳號:', db.find_user_by_email('new@example.com') is not None)

# 2. 登入（繞過驗證碼）
with c.session_transaction() as s: s['captcha'] = 'ABCDE'
r = c.post('/login', data={'email':'new@example.com','password':'password123','captcha':'ABCDE'})
print('2 登入:', r.status_code == 302 and r.headers['Location'] == '/')

# 3. 查館藏並借書
uid = db.find_user_by_email('new@example.com')['id']
r = c.post('/loans/borrow/4', follow_redirects=True)
print('3 借書:', '借閱成功' in r.get_data(as_text=True))

# 4. 另一位讀者預約
c2 = app.test_client()
with c2.session_transaction() as s: s['user_id'] = 1
r = c2.post('/reservations/new/4', follow_redirects=True)
print('4 預約:', '預約成功' in r.get_data(as_text=True))

# 5. 續借被預約擋下
loan_id = db.list_my_loans(uid)[0]['id']
r = c.post(f'/loans/{loan_id}/renew', follow_redirects=True)
print('5 續借被擋:', '此書已有其他讀者預約' in r.get_data(as_text=True))

# 6. 還書並遞補
r = c.post(f'/loans/{loan_id}/return', follow_redirects=True)
print('6 還書:', '歸還完成' in r.get_data(as_text=True))
print('  預約已遞補:', db.list_my_reservations(1)[0]['reservation_status'] == 'ready')

# 7. 預約者借走
c2.post('/loans/borrow/4')
print('7 預約者借到:', db.list_my_reservations(1)[0]['reservation_status'] == 'fulfilled')

# 8. 館員停用該帳號後，舊 session 不能再借
db.set_user_active(1, 0)
before = db.count_active_loans(1)
r = c2.post('/loans/borrow/9')
print('8 停用帳號被擋:', r.headers.get('Location') == '/login',
      '| 借閱數未變:', db.count_active_loans(1) == before)

# 9. 館員不能下架仍有借閱的書
lib = app.test_client()
with lib.session_transaction() as s: s['user_id'] = 2
r = lib.post('/books/delete/4', follow_redirects=True)
print('9 下架被擋:', '尚有未歸還的借閱' in r.get_data(as_text=True))
print('  書目仍在:', db.get_book(4) is not None)
EOF
```

預期：

```
1 申請帳號: True
2 登入: True
3 借書: True
4 預約: True
5 續借被擋: True
6 還書: True
  預約已遞補: True
7 預約者借到: True
8 停用帳號被擋: True | 借閱數未變: True
9 下架被擋: True
  書目仍在: True
```

**C. 全部測試**

```bash
pytest -q
```

預期 `218 passed`。

**D. 容器啟動**

```bash
docker compose up --build -d
sleep 5
curl -s localhost:4000/health          # 預期 OK
curl -s -o /dev/null -w "%{http_code}\n" localhost:4000/books/   # 預期 200
docker compose down
```

### 完工檢查清單

- [ ] `pytest -q` → 218 passed
- [ ] 路由總數 31、七個 Blueprint 全部註冊
- [ ] Phase 13 的端對端流程九步全為 True
- [ ] `grep -rn "eq-" static/` 無輸出
- [ ] 子系統 CSS 的按鍵背景色全部走 `var(--btn-*)`
- [ ] 每個子系統都有 `CLAUDE.md`
- [ ] `document/system-spec.md` 的訊息字串總表與程式碼一致
- [ ] `db/loans.py` 的四個政策常數在別處沒有被寫死
- [ ] `docker compose up` 後 `/health` 回 `OK`
- [ ] `README.md` 的快速開始步驟實際可執行

---

## 附錄：完整檔案清單

### A. 各檔案建立於哪個階段

| 檔案 | Phase |
|------|:--:|
| `app.py`、`utils.py`、`requirements.txt`、`pytest.ini` | 1 |
| `.gitignore`、`.gitattributes`、`.dockerignore`、`Dockerfile`、`docker-compose.yml` | 1、14 |
| `db/{__init__,connection,users}.py`、`db/CLAUDE.md` | 2 |
| `templates/base.html`、`static/{common,login}.css` | 3 |
| `blueprints/{auth,profile}/`、`templates/auth/*`、`templates/profile/*`、`static/profile.css` | 4–5 |
| `blueprints/admin/`、`templates/admin/*`、`static/admin.css` | 6 |
| `db/books.py`、`blueprints/books/`、`templates/books/*`、`static/books.css` | 7–8 |
| `db/loans.py`、`blueprints/loans/`、`templates/loans/*`、`static/loans.css` | 9–10 |
| `db/reservations.py`、`blueprints/reservations/`、`templates/reservations/*`、`static/reservations.css` | 11 |
| `blueprints/hub/`、`templates/hub/home.html`、`static/hub.css` | 12 |
| `tests/`（`conftest.py`、`data/{users,library}.py`、七個測試檔、`CLAUDE.md`） | 13 |
| `rules/*.md`、`document/*.md`、`README.md`、`CLAUDE.md`、七個 `blueprints/*/CLAUDE.md` | 各階段 |

### B. 圖書三子系統的檔案速查


| 子系統 | Blueprint | db 模組 | 模板 | CSS | 測試 |
|--------|-----------|---------|------|-----|------|
| books | `blueprints/books/__init__.py` | `db/books.py` | 2 個 | `books.css` | 62 個 |
| loans | `blueprints/loans/__init__.py` | `db/loans.py` | 3 個 | `loans.css` | 53 個 |
| reservations | `blueprints/reservations/__init__.py` | `db/reservations.py` | 2 個 | `reservations.css` | 29 個 |
