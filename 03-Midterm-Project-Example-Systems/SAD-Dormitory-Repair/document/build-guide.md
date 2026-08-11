# 校園宿舍報修系統 — 建置流程書

## 0. 文件資訊

| 項目 | 內容 |
|------|------|
| 文件名稱 | 校園宿舍報修系統 建置流程書 |
| 版本 | v1.0 |
| 日期 | 2026-08-11 |
| 適用讀者 | 要從零重建此系統的學生、要理解每個決策來歷的開發者 |

### 0.1 這份文件是什麼

這是一份**可執行的建置紀錄**。它把「從一個空目錄，到一個 188 個測試全綠的系統」這段路，拆成 14 個階段。每個階段回答四個問題：

1. **目的**——這個階段結束時，系統多了什麼能力
2. **產出檔案**——具體要建立哪些檔案
3. **關鍵決策**——這個階段做了什麼選擇，為什麼不選另一條路
4. **驗收**——怎麼確認這個階段真的完成了（可直接複製貼上的指令）

每個階段都是**可驗收的**。若某個階段的驗收指令不通過，不要往下一階段走。

這份文件與 `document/system-spec.md` 的分工：規格書說明系統**是什麼**，本文件說明**怎麼一步一步建出來**。兩者衝突時以規格書為準。

### 0.2 撰寫規範

- 所有指令假設在專案根目錄執行，且已 `conda activate flask`
- 每個階段的「產出檔案」表列出該階段要完成的檔案
- 驗收指令若需要資料庫，一律用 `DB_PATH=/tmp/check.db` 避免動到開發用的 `database.db`

### 0.4 階段總覽

| Phase | 主題 | 產出 | 累計可執行？ |
|:---:|------|------|:---:|
| 0 | 環境準備 | — | — |
| 1 | 專案骨架與入口 | `app.py`、`utils.py`、`requirements.txt`、`pytest.ini`、Docker | 否 |
| 2 | 資料存取層（users） | `db/` 三個檔 | 否 |
| 3 | 共用樣板與 CSS | `base.html`、`common.css`、`login.css` | 否 |
| 4 | auth 子系統 | 登入、申請帳號、登出、驗證碼 | **是** |
| 5 | hub 子系統 | 首頁（最小版） | 是 |
| 6 | profile 子系統 | 個人資料（含**修正**） | 是 |
| 7 | admin 子系統 | 會員管理 | 是 |
| 8 | 資料存取層（repair） | `db/repair.py`：兩張表、狀態機、種子 | 是 |
| 9 | repair — 住宿生視角 | 申報、查詢、修改、取消、回覆 | 是 |
| 10 | repair — 管理員視角 | 管理清單、六條狀態轉移、刪除 | 是 |
| 11 | 跨子系統整合 | 首頁卡片、會員明細的報修單區塊 | 是 |
| 12 | 測試 | 五個測試檔，188 個案例 | 是 |
| 13 | Docker、文件與最終驗收 | 文件、CLAUDE.md、rules | 是 |

Phase 4 結束後系統就跑得起來（可以登入登出）。Phase 8 之前的每個階段都只動會員系統，那部分與領域無關；真正屬於報修的工作從 Phase 8 開始。

---

## Phase 0 — 環境準備

### 目的

確認 Python 環境與相依套件就緒。

### 產出檔案

無。

### 驗收

```bash
# 1. Python 版本
python --version                       # 應為 3.11.x

# 2. 相依套件
python -c "import flask, bcrypt, captcha, pytest; print('deps OK')"

```

### 常見錯誤

- **`ModuleNotFoundError: No module named 'captcha'`**——`captcha` 是 PyPI 上的獨立套件，不是標準函式庫。`pip install -r ../SAD-Forum/requirements.txt`
- **在 base 環境執行**——先 `conda activate flask`

---

## Phase 1 — 專案骨架與入口

### 目的

建立可被 import 的專案結構與 Flask 入口。這個階段結束時系統還跑不起來（沒有任何 Blueprint），但目錄骨架已經定型。

### 產出檔案

| 檔案 | 說明 |
|------|------|
| `requirements.txt` | 五個套件 |
| `utils.py` | 三個 helper |
| `Dockerfile` | — |
| `docker-compose.yml` | — |
| `.dockerignore` | 新增排除 `.pytest_cache/` 與資料庫檔 |
| `pytest.ini` | `testpaths = tests` |
| `app.py` | Blueprint 清單改為五個 |
| 空目錄與 `__init__.py` | `blueprints/`、`tests/`、`tests/data/` |

### `app.py` 的修改內容

註冊五個 Blueprint：

```python
from blueprints.repair import repair_bp
...
app.register_blueprint(repair_bp)
```

另有 `/health` 端點與 `if __name__ == '__main__'` 區塊。

> **不要另設一次性的種子植入機制**（例如一個執行後自我刪除的 `setup/` 目錄）。種子資料由 `db/` 內的 `_seed_*_if_empty()` 提供，與種子帳號同一套機制，重置資料庫後照樣拿得回來。

### `pytest.ini` 為什麼是必要的

```ini
[pytest]
testpaths = tests
```

沒有這個檔案，`pytest` 會一路往下走進所有子目錄收集測試。若收到別的專案的 `tests/`，那些 `conftest.py` 的 `from app import app` 會解析到**本系統的** `app.py`，得到一個完全不同的應用程式。錯誤訊息會很難懂（`fixture 'app' not found` 或一堆 404），而根本原因與你正在寫的程式碼無關。

先擋掉，省下未來每次跑測試的困惑。

### 驗收

```bash
# 1. 目錄骨架
ls app.py utils.py requirements.txt pytest.ini Dockerfile docker-compose.yml
ls blueprints/__init__.py tests/__init__.py tests/data/__init__.py

# 2. pytest 只看得到本系統的測試目錄（此時沒有測試，應回報 no tests ran）
pytest -q 2>&1 | tail -2
```

第 2 步的預期輸出是 `no tests ran`，**不是**一堆來自別處的錯誤。若看到其他目錄的測試路徑，代表 `pytest.ini` 沒生效。

### 常見錯誤

- **`app.py` 此時無法執行**——正常。它 import 了五個還不存在的 Blueprint。Phase 4 之後才會第一次跑得起來
- **忘記建立 `blueprints/__init__.py`**——空檔案，但必須存在，否則 `blueprints` 不是套件

---

## Phase 2 — 資料存取層（users）

### 目的

建立 `db/` 套件與 `users` 表。這個階段結束時，資料庫可以建立、種子帳號可以植入。

### 產出檔案

| 檔案 | 說明 |
|------|------|
| `db/connection.py` | `_get_conn()` |
| `db/users.py` | 新增三欄與一個函式 |
| `db/__init__.py` | DDL 新增三欄；匯出清單改動 |

### `db/users.py` 的修改內容

**改動一：`_SEED_USERS` 由三筆變四筆，每筆多三個欄位。**

```python
_SEED_USERS = [
    # (email, password, role, is_active, name, dorm_building, room_no, phone)
    ('user@example.com',     'password123', 1, 1, '陳小明',       'A 棟', '301', '0912-345-678'),
    ('admin@example.com',    'admin1234',   0, 1, '宿舍管理員',    None,   None,  '02-1234-5678'),
    ('disabled@example.com', 'disabled123', 1, 0, None,            'B 棟', '205', None),
    ('staff@example.com',    'staff1234',   0, 1, '維修組 王師傅', None,   None,  '02-1234-5679'),
]
```

第四個帳號是新增的。它存在的理由有二：報修的派工需要一個「不是操作者本人」的承辦人；會員管理的自我保護規則（R1–R3）需要一個「另一個管理員」作為對照，才能驗證限制只針對自己而非所有管理員。

帳號 3 的 `name` 維持 `None`，用來示範 `COALESCE(name, display_name, email)` 的退回顯示——這個行為在報修清單上會再出現一次。

**改動二：三個查詢函式的 `SELECT` 清單加入新欄位。** `find_user_by_email`、`find_user_by_id`、`list_users` 各加 `dorm_building, room_no, phone`。

**改動三：`create_user` 與 `update_user_profile` 的簽章擴充。**

```python
def create_user(email, password, name=None, display_name=None,
                dorm_building=None, room_no=None, phone=None):

def update_user_profile(user_id, name, display_name, dorm_building, room_no, phone):
```

注意兩者的預設值策略不同：`create_user` 的新欄位全部有預設值（註冊時選填），`update_user_profile` **沒有**預設值（更新時五個欄位一律一起送出，避免「只送部分欄位就把其他欄位清空」的意外）。

**改動四：`list_users` 的搜尋條件加入房號。**

```python
where.append('(email LIKE ? OR name LIKE ? OR display_name LIKE ? OR room_no LIKE ?)')
like = f'%{keyword}%'
params.extend([like, like, like, like])
```

管理員找人時，「A 棟 301 是誰住的」跟「陳小明的 email 是什麼」一樣常見。

**改動五：新增 `list_active_admins()`。**

```python
def list_active_admins():
    """列出所有可指派的管理員（role = 0、啟用中、未刪除），供派工下拉選單使用。"""
```

這個函式操作的是 `users` 表，因此放在 `db/users.py`，**不放 `db/repair.py`**。判準是「一張資料表對應一個模組」，不是「哪個子系統會用到」。同樣的判準讓 `list_users`、`set_user_active`、`set_user_role` 留在 `users.py`，而不另建 `db/admin.py`。

### `db/__init__.py` 的修改內容

**改動一：`users` 表 DDL 新增三欄。**

```sql
    dorm_building TEXT,
    room_no       TEXT,
    phone         TEXT,
```

三個欄位全部可為 NULL，插在 `display_name` 與 `is_active` 之間。

**改動二：匯出清單。** `users` 加入 `list_active_admins`；`forum` 那一整段改為 `repair`（Phase 8 才會真的存在，這個階段先只留 users 的部分，等 Phase 8 再補上）。

**改動三：`init_db()` 的呼叫順序。**

```python
    conn.execute("""CREATE TABLE IF NOT EXISTS users (...)""")
    conn.commit()
    _init_repair_tables(conn)      # Phase 8 才加入
    _seed_users_if_empty(conn)
    _seed_repair_if_empty(conn)    # Phase 8 才加入；必須在種子帳號之後
    conn.close()
```

種子報修單的 `requester_id` 與 `assigned_to` 都指向種子帳號，順序不可調換。

### 驗收

```bash
rm -f /tmp/check.db /tmp/check.db-wal /tmp/check.db-shm
DB_PATH=/tmp/check.db python -c "
import db
db.init_db()

# 1. 四個種子帳號
users, total = db.list_users(1, 10)
assert total == 4, total
for u in users:
    print(f\"  #{u['id']} {u['email']:<24} role={u['role']} active={u['is_active']} \"
          f\"name={u['name']} 位置={u['dorm_building']} {u['room_no']}\")

# 2. 新欄位有寫進去
u1 = db.find_user_by_id(1)
assert u1['dorm_building'] == 'A 棟' and u1['room_no'] == '301'
assert u1['phone'] == '0912-345-678'

# 3. 停用帳號的 name 是 NULL（供 COALESCE 示範）
assert db.find_user_by_id(3)['name'] is None

# 4. 房號可被搜尋
items, n = db.list_users(1, 10, 'all', '301')
assert n == 1 and items[0]['email'] == 'user@example.com'

# 5. 可指派的管理員有兩個
admins = db.list_active_admins()
assert [a['id'] for a in admins] == [2, 4], [a['id'] for a in admins]

# 6. 停用的管理員不會出現在可指派清單中
db.set_user_active(4, 0)
assert [a['id'] for a in db.list_active_admins()] == [2]
db.set_user_active(4, 1)

# 7. 更新五個欄位
db.update_user_profile(1, '新名', '新顯示名', 'D 棟', '808', '0900-000-000')
u1 = db.find_user_by_id(1)
assert (u1['name'], u1['room_no'], u1['phone']) == ('新名', '808', '0900-000-000')

# 8. 種子只植入一次
db.init_db()
assert db.list_users(1, 10)[1] == 4

print('Phase 2 驗收通過 ✓')
"
```

### 常見錯誤

- **`sqlite3.OperationalError: table users has no column named dorm_building`**——`CREATE TABLE IF NOT EXISTS` 對已存在的表**不會**加欄位。改了 DDL 之後必須 `rm database.db` 重建。這是本階段最常見的錯誤，而且錯誤訊息出現的時機往往離改動很遠
- **`list_active_admins()` 回傳三個帳號**——漏了 `is_active = 1` 或 `is_deleted = 0` 的條件
- **種子帳號被重複植入**——`_seed_users_if_empty()` 的 `COUNT(*) > 0` 提前 return 漏寫

---

## Phase 3 — 共用樣板與 CSS

### 目的

建立所有頁面的共用外殼與設計 token。

### 產出檔案

| 檔案 | 說明 |
|------|------|
| `static/common.css` | 設計 token，一個字元都不改 |
| `static/login.css` | — |
| `templates/base.html` | 只改 `<title>` 的預設值 |

### `base.html` 的修改內容

```html
<title>{% block title %}校園宿舍報修系統{% endblock %}</title>
```

`common.css` 先載入，`login.css` 後載入，`{% block head %}` 供各頁追加自己的 CSS。

### 關鍵決策：為什麼 `common.css` 一個字元都不改

`common.css` 只定義按鍵顏色的 CSS 自訂屬性。報修子系統會需要六個狀態色與四個優先等級色，很容易想順手加進去。**不要。**

理由是 `common.css` 的定位是「全站按鍵顏色的單一來源」，這個定位很窄但很清楚。狀態語意色是另一類東西——它們與按鍵無關，而且只有兩個子系統用得到。混在一起之後，`common.css` 會慢慢變成「所有顏色的雜物間」，失去它作為單一來源的價值。

代價是狀態色硬編碼在 `admin.css` 與 `repair.css` 中（規格書的 KI-19）。這是一個有意識的取捨，不是疏忽。若哪天真的要收攏，正確的做法是在 `common.css` 中開一個獨立的 `--status-*` 區塊並明確標註它與 `--btn-*` 的分工，而不是把狀態色塞進既有的按鍵 token。

### 驗收

```bash
diff static/common.css ../SAD-Forum/static/common.css && echo "common.css 逐字相同 ✓"
diff static/login.css  ../SAD-Forum/static/login.css  && echo "login.css 逐字相同 ✓"
grep -c "btn-primary-bg\|btn-secondary-bg\|btn-danger-bg\|btn-action-bg" static/common.css
grep "校園宿舍報修系統" templates/base.html
```

第三個指令應輸出 `4` 以上（四組 token 各至少出現一次）。

### 常見錯誤

- **在 `base.html` 中載入 `repair.css`**——各子系統的 CSS 由各自的樣板在 `{% block head %}` 中載入，不放全域。否則報修的 `body { display: block }` 會污染登入頁的置中版面

---

## Phase 4 — auth 子系統

### 目的

**第一個跑得起來的階段。** 完成後可以申請帳號、登入、登出。

### 產出檔案

| 檔案 | 說明 |
|------|------|
| `blueprints/auth/__init__.py` | `register` 新增三個住宿欄位 |
| `templates/auth/login.html` | 只改標題文字 |
| `templates/auth/register.html` | 新增三個表單欄位 |
| `blueprints/auth/CLAUDE.md` | — |

### `blueprints/auth/__init__.py` 的修改內容

**`login_page()`、`logout()`、`captcha_image()` 三個函式與領域無關。** 登入有五道驗證：驗證碼非空 → 驗證碼正確 → 帳密非空 → 帳號存在且未刪除且密碼正確 → 帳號啟用中。

**`register()` 的修改**：把 `display_name` 換成三個住宿欄位。

```python
        name          = request.form.get('name', '').strip() or None
        dorm_building = request.form.get('dorm_building', '').strip() or None
        room_no       = request.form.get('room_no', '').strip() or None
        phone         = request.form.get('phone', '').strip() or None

        form_data = {
            'email':         email,
            'name':          name or '',
            'dorm_building': dorm_building or '',
            'room_no':       room_no or '',
            'phone':         phone or '',
        }
        ...
                db.create_user(email, password, name, None, dorm_building, room_no, phone)
```

注意 `display_name` 傳 `None`——本系統的註冊表單不收顯示名稱，使用者可以之後在個人資料頁補。這是為了避免註冊表單過長：它已經有七個欄位了。

**四道驗證的順序與訊息完全不變。** 住宿欄位**不加入驗證**，因為它們是選填的。

### 關鍵決策：住宿資料為什麼是選填

直覺上，報修系統的使用者一定住在宿舍，房號應該必填。但實務上有兩個反例：新生在分配房間之前就會拿到帳號；管理員與維修人員根本不住宿舍（種子帳號 2 與 4 的棟別就是 NULL）。

把它設成必填，等於要求所有管理員帳號都編一個假房號。因此改為選填，而在真正需要的地方（報修表單）才必填。這是「**在需要的那一刻才要求**」的原則。

### 驗收

```bash
rm -f /tmp/check.db /tmp/check.db-wal /tmp/check.db-shm
DB_PATH=/tmp/check.db python -c "
import db
from app import app
db.init_db()
app.config['TESTING'] = True
c = app.test_client()

# 1. 三個頁面渲染
assert c.get('/login').status_code == 200
assert c.get('/register').status_code == 200
assert c.get('/captcha.png').content_type == 'image/png'

# 2. 註冊表單有三個新欄位
body = c.get('/register').get_data(as_text=True)
for field in ('dorm_building', 'room_no', 'phone'):
    assert f'name=\"{field}\"' in body, field

# 3. 註冊寫入住宿資料
c.post('/register', data={
    'email': 'new@example.com', 'password': 'password123',
    'confirm_password': 'password123', 'name': '新生',
    'dorm_building': 'C 棟', 'room_no': '512', 'phone': '0988-111-222',
})
u = db.find_user_by_email('new@example.com')
assert (u['dorm_building'], u['room_no'], u['phone']) == ('C 棟', '512', '0988-111-222')
assert u['role'] == 1, '新帳號必須是住宿生'

# 4. 住宿欄位可留空
c.post('/register', data={
    'email': 'nodorm@example.com', 'password': 'password123',
    'confirm_password': 'password123',
})
assert db.find_user_by_email('nodorm@example.com')['room_no'] is None

# 5. 四道驗證仍然有效
for data, expect in [
    ({'email': '', 'password': 'x'},                              '請輸入電子郵件與密碼'),
    ({'email': 'bad', 'password': 'password123', 'confirm_password': 'password123'}, '電子郵件格式不正確'),
    ({'email': 'a@b.co', 'password': 'short', 'confirm_password': 'short'},          '密碼至少需要 8 個字元'),
    ({'email': 'a@b.co', 'password': 'password123', 'confirm_password': 'other12345'}, '兩次密碼輸入不一致'),
]:
    assert expect in c.post('/register', data=data).get_data(as_text=True), expect

# 6. 登入流程（含驗證碼繞過）
with c.session_transaction() as s:
    s['captcha'] = 'ABCDE'
r = c.post('/login', data={'email': 'user@example.com',
                           'password': 'password123', 'captcha': 'ABCDE'})
assert r.status_code == 302
with c.session_transaction() as s:
    assert s['user_id'] == 1

# 7. 停用帳號登不進去
c2 = app.test_client()
with c2.session_transaction() as s:
    s['captcha'] = 'ABCDE'
r = c2.post('/login', data={'email': 'disabled@example.com',
                            'password': 'disabled123', 'captcha': 'ABCDE'})
assert '帳號已停用' in r.get_data(as_text=True)

# 8. 登出清 session
c.get('/logout')
with c.session_transaction() as s:
    assert 'user_id' not in s

print('Phase 4 驗收通過 ✓')
"
```

> 此時 `app.py` 仍然 import 了四個不存在的 Blueprint。要讓上面的驗收跑得起來，暫時把 `app.py` 中 `hub`、`profile`、`admin`、`repair` 的 import 與 `register_blueprint` 註解掉，並把 `auth.login_page()` 中 `redirect(url_for('hub.home'))` 暫時改成 `redirect('/login')`。Phase 5 完成後把它們改回來。
>
> 這種「暫時的鷹架」在分階段建置中無法避免。替代方案是先做一個只回傳 `'OK'` 的 hub stub，但那會讓 Phase 5 多一個「刪掉 stub」的步驟。兩種都可以，重點是**記得改回來**——驗收指令會抓到忘記改回來的情況。

### 常見錯誤

- **`werkzeug.routing.BuildError: Could not build url for endpoint 'hub.home'`**——就是上面說的鷹架問題
- **驗證碼永遠錯誤**——`captcha_input` 忘了 `.upper()`。字元集是大寫，使用者輸入小寫時必須先正規化
- **註冊成功但住宿欄位是空字串而非 NULL**——漏了 `or None`

---

## Phase 5 — hub 子系統（最小版）

### 目的

補上首頁，讓 Phase 4 的鷹架可以拆除。此階段先做**最小版**：卡片只放個人資料，報修的兩張卡片等 Phase 11 再補。

### 產出檔案

| 檔案 | 說明 |
|------|------|
| `blueprints/hub/__init__.py` | 先零修改，Phase 11 再加摘要查詢 |
| `templates/hub/home.html` | 卡片與文案改為宿舍情境 |
| `static/hub.css` | Phase 11 再追加三個 class |
| `blueprints/hub/CLAUDE.md` | — |

### `blueprints/hub/__init__.py` 此階段零修改

`home()` 要做對三件事：訪客與登入雙模式、內嵌登入表單、帳號失效時 `session.clear()` 後以訪客視圖渲染（而不是 redirect）。第三點值得注意——若改成 redirect 到 `/login`，被停用的使用者會陷入「點首頁被踢到登入頁」的體驗，但他其實只是想看看首頁。

### `templates/home.html` 的修改內容

**改動一：標題與文案。** `會員管理系統 v1.0` → `校園宿舍報修系統 v1.0`；訪客的歡迎詞改為說明報修流程。

**改動二：卡片清單。** 本系統的訪客視圖**四張卡片全部鎖定**（`hub-card-locked`），一個子系統都進不去。理由寫在頁面上：

```html
<p class="hub-guest-note">
  報修單載有房號與聯絡電話，屬於個人資料，因此本系統沒有開放訪客瀏覽的頁面。
</p>
```

把理由寫進 UI 而不只是寫進文件，是刻意的：讀原始碼的人與用系統的人會問同一個問題（「為什麼不給看」），答案應該在他們各自看得到的地方。

**改動三：登入後的卡片。** 「我要報修 / 我的報修單 / 個人資料 /（管理員）報修管理 + 會員管理」五張。此階段先只放「個人資料」，其餘的 `url_for('repair.*')` 會在 Phase 11 補上——現在寫會 `BuildError`。

**改動四：`.login-form` class 必須保留。** 內嵌登入表單的 `<form>` 一定要有這個 class，否則送出按鈕會失去樣式（見規格書 §9.5）。

### 驗收

```bash
# 先把 app.py 的 hub 恢復註冊，auth 的 redirect 改回 url_for('hub.home')
rm -f /tmp/check.db /tmp/check.db-wal /tmp/check.db-shm
DB_PATH=/tmp/check.db python -c "
import db
from app import app
db.init_db()
app.config['TESTING'] = True
c = app.test_client()

# 1. 訪客首頁
body = c.get('/').get_data(as_text=True)
assert '歡迎使用' in body
assert 'hub-card-locked' in body
assert 'href=\"/repair/' not in body, '訪客不應有任何可進入的子系統連結'
assert 'class=\"login-form\"' in body, '內嵌登入表單必須有 login-form class'

# 2. 內嵌登入
with c.session_transaction() as s:
    s['captcha'] = 'ABCDE'
r = c.post('/', data={'email': 'user@example.com',
                      'password': 'password123', 'captcha': 'ABCDE'})
assert r.status_code == 302
with c.session_transaction() as s:
    assert s['user_id'] == 1

# 3. 登入後首頁
body = c.get('/').get_data(as_text=True)
assert '歡迎回來' in body and '陳小明' in body

# 4. 停用帳號持有舊 session → 清除並以訪客視圖渲染（不是 redirect）
c2 = app.test_client()
with c2.session_transaction() as s:
    s['user_id'] = 3
r = c2.get('/')
assert r.status_code == 200 and '歡迎使用' in r.get_data(as_text=True)
with c2.session_transaction() as s:
    assert 'user_id' not in s

print('Phase 5 驗收通過 ✓')
"
```

### 常見錯誤

- **`BuildError: Could not build url for endpoint 'repair.index'`**——首頁的報修卡片寫太早了。Phase 11 再補
- **停用帳號被 redirect 到登入頁**——把 `session.clear()` 之後的 `user = None` 寫成了 `return redirect(...)`。首頁應該容許訪客

---

## Phase 6 — profile 子系統

### 目的

個人資料的查看與編輯。**本階段有一處守門檢查絕不能省，是整份建置流程中最需要注意的一處。**

### 產出檔案

| 檔案 | 說明 |
|------|------|
| `blueprints/profile/__init__.py` | 新增三欄；**補上 `_is_usable` 檢查** |
| `templates/profile/dashboard.html` | 新增三個欄位（唯讀與編輯兩處） |
| `static/profile.css` | 新增 `.profile-hint` |
| `blueprints/profile/CLAUDE.md` | — |

### ⚠️ 關鍵修正：`dashboard_update()` 補上帳號有效性檢查

`dashboard_update()` 若只有 `@login_required` 而**沒有** `_is_usable` 檢查，停用中的帳號只要 session 未清就能改自己的資料。

**本系統必須補上。** 完整的程式碼是：

```python
@profile_bp.route('/profile/update', methods=['POST'])
@login_required
def dashboard_update():
    user = db.find_user_by_id(session['user_id'])
    if not _is_usable(user):
        session.clear()
        return redirect(url_for('auth.login_page'))

    name          = request.form.get('name', '').strip() or None
    display_name  = request.form.get('display_name', '').strip() or None
    dorm_building = request.form.get('dorm_building', '').strip() or None
    room_no       = request.form.get('room_no', '').strip() or None
    phone         = request.form.get('phone', '').strip() or None

    db.update_user_profile(session['user_id'], name, display_name,
                           dorm_building, room_no, phone)
    return redirect(url_for('profile.dashboard'))
```

**為什麼這一層不能省。** 判準只有一條：

> 缺陷的影響是否會外溢到當事人以外的人？

如果個人資料頁只能改**姓名與顯示名稱**，那兩個欄位不出現在任何公開頁面，影響只有他自己，這個缺口還可以當教材留著。

在本系統中，同一個路由改的是**房號與聯絡電話**，而這兩個欄位會被帶進報修單、印在管理清單上、成為維修人員上門的依據。一個已經退宿、帳號被停用的人，可以把房號改成別人的房間，然後維修人員照著跑一趟。影響外溢了，判準的結論就反了。

這是整個專案最值得在課堂上講的一件事：**技術債的嚴重性不是程式碼的屬性，是脈絡的屬性。** 同一行程式碼、同一條判準、不同的領域，得到相反的答案。

> 從別的系統逐檔搬 `profile` 過來時，這三行**極容易漏掉**——少了它們，檔案看起來完全正常。Phase 12 的 `test_profile.py` 有兩個測試專門防守這一點。

### `templates/profile/dashboard.html` 的修改內容

唯讀與編輯兩個模式**各要加三列**（棟別、房號、電話），共六處。編輯模式另加一句說明：

```html
<p class="profile-hint">棟別、房號與聯絡電話會作為報修單的預設值，並提供維修人員聯繫使用。</p>
```

底部的導覽連結新增一個「我的報修單」（Phase 11 才能生效，此時先不加）。「身份」欄的文字由「管理者／一般使用者」改為「管理員／住宿生」。

### 驗收

```bash
rm -f /tmp/check.db /tmp/check.db-wal /tmp/check.db-shm
DB_PATH=/tmp/check.db python -c "
import db
from app import app
db.init_db()
app.config['TESTING'] = True

def client_as(uid):
    c = app.test_client()
    with c.session_transaction() as s:
        s['user_id'] = uid
    return c

# 1. 唯讀模式顯示三個新欄位
body = client_as(1).get('/profile').get_data(as_text=True)
for label in ('宿舍棟別', '房號', '聯絡電話'):
    assert label in body, label
assert 'A 棟' in body and '301' in body

# 2. 編輯模式有三個 input
body = client_as(1).get('/profile?edit=1').get_data(as_text=True)
for f in ('dorm_building', 'room_no', 'phone'):
    assert f'name=\"{f}\"' in body, f

# 3. 更新五個欄位
client_as(1).post('/profile/update', data={
    'name': '陳大明', 'display_name': 'Ming', 'dorm_building': 'D 棟',
    'room_no': '808', 'phone': '0900-000-000',
})
u = db.find_user_by_id(1)
assert (u['name'], u['dorm_building'], u['room_no'], u['phone']) == \
       ('陳大明', 'D 棟', '808', '0900-000-000')

# 4. 空字串轉 NULL
client_as(1).post('/profile/update', data={
    'name': '', 'display_name': '', 'dorm_building': '', 'room_no': '', 'phone': '',
})
assert db.find_user_by_id(1)['room_no'] is None

# ── 5. 關鍵修正的驗收：停用帳號的 POST 必須被擋下 ──
before = db.find_user_by_id(3)['room_no']
c = client_as(3)
r = c.post('/profile/update', data={
    'name': '不該寫入', 'display_name': '', 'dorm_building': 'Z 棟',
    'room_no': '999', 'phone': '',
})
assert r.status_code == 302 and '/login' in r.headers['Location']
after = db.find_user_by_id(3)
assert after['room_no'] == before, '停用帳號竟然改掉了房號——_is_usable 檢查漏了'
assert after['name'] != '不該寫入'
with c.session_transaction() as s:
    assert 'user_id' not in s, 'session 應被清除'

print('Phase 6 驗收通過 ✓（含關鍵修正）')
"
```

第 5 步是整個 Phase 6 的重點。**如果它通過了，代表那三行檢查確實補上了。**

### 常見錯誤

- **第 5 步失敗**——`dashboard_update()` 少了那三行。回頭補上
- **只在 GET 補檢查，POST 忘了**——GET 有檢查容易讓人誤以為兩邊都有
- **更新後其他欄位被清空**——表單只送了部分欄位。`update_user_profile` 沒有預設值就是為了讓這個錯誤在開發階段就炸出來（`TypeError`），而不是靜默地寫入 `None`

---

## Phase 7 — admin 子系統

### 目的

會員管理。此階段幾乎不受領域影響——六條路由、三層檢查、R1–R3 自我保護規則，換成任何一個領域都長一樣。

### 產出檔案

| 檔案 | 說明 |
|------|------|
| `blueprints/admin/__init__.py` | `ROLE_LABELS` 改字；明細頁的報修單區塊留到 Phase 11 |
| `templates/admin/user_list.html` | 新增兩欄 |
| `templates/admin/user_detail.html` | 新增三列 |
| `static/admin.css` | 新增兩個欄寬 class |
| `blueprints/admin/CLAUDE.md` | — |

### 修改內容

**`ROLE_LABELS = {0: '管理員', 1: '住宿生'}`**。

**清單新增「住宿位置」與「聯絡電話」兩欄**，`colspan` 由 9 改為 10：

```html
<td>
  {% if u['dorm_building'] or u['room_no'] %}
    {{ u['dorm_building'] or '' }} {{ u['room_no'] or '' }}
  {% else %}—{% endif %}
</td>
```

**搜尋框的 placeholder** 加上「或房號」。

**明細頁新增三列**（棟別、房號、電話）。角色下拉的 `<option>` 文字同步改為「住宿生」。

**三層檢查、R1–R3、六條路由的訊息字串全部零修改。** 這個子系統是「會員管理直接沿用」這件事最好的證據——它幾乎沒有被領域影響。

### 驗收

```bash
rm -f /tmp/check.db /tmp/check.db-wal /tmp/check.db-shm
DB_PATH=/tmp/check.db python -c "
import db
from app import app
db.init_db()
app.config['TESTING'] = True

def client_as(uid):
    c = app.test_client()
    with c.session_transaction() as s:
        s['user_id'] = uid
    return c

# 1. 三層守門（順序驗證）
assert '/login' in app.test_client().get('/admin/users').headers['Location']
assert client_as(1).get('/admin/users').headers['Location'] == '/'
db.set_user_role(3, 0)                                   # 停用中的管理員
assert '/login' in client_as(3).get('/admin/users').headers['Location'], \
       '停用中的管理員應被第 2 層攔下（登出），而非第 3 層（權限不足）'
db.set_user_role(3, 1)

# 2. 清單顯示新欄位
body = client_as(2).get('/admin/users').get_data(as_text=True)
assert '住宿位置' in body and 'A 棟' in body and '301' in body
assert '住宿生' in body and '管理員' in body

# 3. 房號可搜尋
body = client_as(2).get('/admin/users?q=301').get_data(as_text=True)
assert 'user@example.com' in body and 'admin@example.com' not in body

# 4. R1–R3 自我保護
a = client_as(2)
assert '不可停用自己的帳號' in a.post('/admin/users/2/deactivate', follow_redirects=True).get_data(as_text=True)
assert '不可刪除自己的帳號' in a.post('/admin/users/2/delete',     follow_redirects=True).get_data(as_text=True)
assert '不可修改自己的角色' in a.post('/admin/users/2/role', data={'role': '1'}, follow_redirects=True).get_data(as_text=True)
assert db.find_user_by_id(2)['is_active'] == 1 and db.find_user_by_id(2)['role'] == 0

# 5. 對「另一個管理員」不受限（自我保護只針對自己）
a.post('/admin/users/4/deactivate')
assert db.find_user_by_id(4)['is_active'] == 0
a.post('/admin/users/4/activate')

# 6. 住宿生的 POST 被擋且資料不變
u = client_as(1)
u.post('/admin/users/4/deactivate')
assert db.find_user_by_id(4)['is_active'] == 1, '被擋下的 POST 竟然改了資料'

print('Phase 7 驗收通過 ✓')
"
```

第 1 步的第三個斷言是三層檢查順序的關鍵驗證：一個 `role=0` 但 `is_active=0` 的帳號，必須被第 2 層攔下（處置是登出），而不是第 3 層（處置是導回首頁）。順序寫反的話這個斷言會失敗。

第 5 步是第四個種子帳號存在的理由之一——沒有第二個管理員就測不出「限制只針對自己」。

### 常見錯誤

- **第 1 步第三個斷言失敗**——`_is_admin` 檢查寫在 `_is_usable` 之前
- **`colspan` 忘了改**——新增兩欄之後「查無資料」那一列會對不齊
- **在 `utils.py` 中定義 `_is_admin`**——它必須是各 Blueprint 的內部 helper。理由見 `rules/flask-blueprint.md`

---

## Phase 8 — 資料存取層（repair）

### 目的

**真正的新工作從這裡開始。** 建立兩張新資料表、十個資料存取函式、六個狀態轉移函式與六張種子報修單。這個階段沒有任何畫面，但系統的核心邏輯全部在此完成。

### 產出檔案

| 檔案 | 說明 |
|------|------|
| `db/repair.py` | 約 680 行 |
| `db/__init__.py` | 補上 repair 的匯出與 `init_db()` 的兩行呼叫 |
| `db/CLAUDE.md` | — |

### 從 `equipment.py` 沿用了什麼、改了什麼

報修的資料層有三個結構性的決定：

| 面向 | `equipment.py` | `repair.py` | 為什麼改 |
|------|---------------|------------|---------|
| 明細表的角色 | `borrow_order_items`：借了哪幾樣器材、各幾個 | `repair_logs`：**處理歷程** | 報修沒有「品項」的概念，一張單就是一個問題。明細改為承載時間軸 |
| 狀態異動的紀錄 | `reviewed_by`、`reviewed_at`、`review_note` 三個欄位 | 每次轉移寫入一筆 `log_type='status'` | 三個欄位只留得住**最後一次**審核，中間的歷程全部遺失。改為明細之後，完整歷程都在 |
| 轉移函式的結構 | `approve_order`、`reject_order`、`mark_order_borrowed`… | 同樣是一函式一轉移 | **沿用**。這個結構是對的 |
| 數量的一致性 | 核准時要再確認庫存足夠 | 無此概念 | 報修沒有數量 |

第二點最重要，值得展開。只存現況的做法在「只需要知道現在怎麼樣」時完全夠用；但報修系統的使用者會問「這台冷氣今年修過幾次」「上次是誰處理的」「當初申報時說的症狀跟現在一樣嗎」——這些問題只有歷程答得出來。把稽核軌跡放進明細表，是這個系統存在的理由之一。

### 建議的實作順序

`db/repair.py` 有 680 行，一次寫完很難驗。建議分五步，每步都可獨立驗收：

1. **常數與 DDL**（`REQUEST_STATUSES`、`CLOSED_STATUSES`、`CATEGORIES`、`PRIORITIES`、`LOG_TYPES`、`_init_repair_tables`）
2. **查詢函式**（`list_my_requests`、`list_all_requests`、`get_request`、`list_logs`、`get_report_log`、`count_by_status`）
3. **寫入函式**（`create_request`、`update_request`、`create_log`、`soft_delete_request`）
4. **六個狀態轉移函式**
5. **種子資料**（`_SEED_REQUESTS`、`_seed_repair_if_empty`）

### 步驟 1：常數與 DDL

兩張表的 DDL 見規格書 §6.3。三個細節值得注意：

**`dorm_building` 與 `room_no` 在報修單上是 `NOT NULL`，在 `users` 上是可空的。** 因為報修一定要知道地點，但帳號不一定住宿舍。

**報修單自己存地點，不 JOIN `users` 取。** 理由有二：報修地點不必然是申報人的房間（走廊、交誼廳、洗衣間都會被申報）；報修單記錄的是**申報當下**的地點，住戶換房之後舊單仍應指向舊房號。這是「快照 vs 參照」的取捨。

**`log_type` 的三個值不是等價的。** `report` 一張單恰有一筆（與主檔同時建立）；`comment` 由使用者建立；`status` **只能由轉移函式建立**。`create_log()` 因此明確拒絕 `'status'`：

```python
    if log_type not in ('report', 'comment'):
        return None
```

沒有這道防線，就可能出現「有狀態紀錄但主檔狀態沒變」的假歷程，而稽核軌跡一旦可以偽造就失去全部價值。

### 步驟 2：查詢函式

兩個列表函式共用 `_LIST_COLUMNS` 與 `_LIST_JOINS` 兩個字串常數，避免十幾個欄位名寫兩遍。JOIN 的寫法要注意：

```sql
    FROM repair_requests r
    JOIN users req ON req.id = r.requester_id
    LEFT JOIN users asg ON asg.id = r.assigned_to
```

申報人用 `JOIN`（一定存在），承辦人用 **`LEFT JOIN`**（可能是 NULL）。寫成 `JOIN` 的話，所有還沒派工的報修單會從清單中消失——而那正是管理員最需要看到的一批。

顯示名稱用 `COALESCE(req.name, req.display_name, req.email)` 三段退回，種子帳號 3 的 `name` 是 NULL 就是為了讓這個行為在畫面上看得到。

`list_logs()` 依 `created_at ASC, id ASC` 排序。第二個排序鍵是必要的：種子資料與測試中經常在同一秒內建立多筆紀錄，只用 `created_at` 排序會不確定。

**`get_request()` 不過濾 `is_deleted`**，呼叫端才能區分「不存在」與「已刪除」（雖然本系統對兩者給出同一則訊息，但保留這個區分的能力）。這一點必須寫進 docstring，否則讀者會以為是漏寫。

### 步驟 3：寫入函式

四個函式中有三個需要 transaction，判準是「多張表必須同時成功或同時失敗」：

| 函式 | 為何需要 transaction |
|------|---------------------|
| `create_request` | 主檔 INSERT 成功但首則描述失敗，會留下一張沒有描述的報修單，維修人員無從判斷要修什麼 |
| `update_request` | 主檔的標題改了但描述沒改，兩邊會對不上 |
| `create_log` | 紀錄寫了但主檔的 `updated_at` 沒更新，這張單不會浮到列表最上面 |
| `soft_delete_request` | 主檔標記刪除但明細沒標記，會留下一批孤兒紀錄 |

`update_request()` 另有一個設計決定：**它在資料層重做一次「限本人、限 pending」的檢查**，即使 Blueprint 已經檢查過。

```python
    row = conn.execute(
        "SELECT * FROM repair_requests"
        " WHERE id = ? AND is_deleted = 0 AND request_status = 'pending'",
        (request_id,)
    ).fetchone()
    if not row or row['requester_id'] != user_id:
        conn.close()
        return False
```

理由是這個函式會直接改寫維修人員將要依據的內容。讓不變條件在資料層有一個無法繞過的執行點，未來新增的任何呼叫端（批次匯入、管理指令、另一條路由）都自動受到保護。

### 步驟 4：六個狀態轉移函式

這是本階段的核心。六個函式涵蓋七條轉移（`cancel` 吃兩個來源狀態），完整的轉移表見規格書 §7.2。

**每個函式的結構完全相同：**

```python
def assign_request(request_id, admin_id, assignee_id, note=None):
    conn = _get_conn()
    row  = conn.execute(
        "SELECT * FROM repair_requests"
        " WHERE id = ? AND is_deleted = 0 AND request_status = 'pending'",   # ① 前置狀態
        (request_id,)
    ).fetchone()
    if not row:
        conn.close()
        return False
    ...                                                                       # ② 額外檢查
    with conn:                                                                # ③ transaction
        conn.execute("UPDATE repair_requests SET request_status = 'assigned', ...")
        conn.execute("INSERT INTO repair_logs (... 'status' ...)")
    conn.close()
    return True
```

**① 前置狀態寫在 `WHERE` 子句裡，不是先讀出來再用 Python 比對。** 這是本階段最重要的技巧。兩種寫法的差別在於**查詢與更新之間有沒有空隙**：若寫成「先 `SELECT *`，再 `if row['request_status'] != 'pending': return False`」，兩個管理員同時按下派工按鈕時，兩邊都可能讀到 `pending` 而雙雙通過檢查。把條件放進 `WHERE`，只有先到的那個會撈到資料。

（嚴格來說 `SELECT` 與 `UPDATE` 之間仍有窗口，完整的解法是把條件也放進 `UPDATE ... WHERE` 並檢查 `rowcount`。本系統選擇目前的寫法是因為它足以示範「條件下推」這個概念，完整修補列為規格書的 KI-13。）

**② 只有 `assign` 有額外檢查**——承辦人必須是啟用中的管理員：

```python
    assignee = conn.execute(
        'SELECT id, email, name, display_name FROM users'
        ' WHERE id = ? AND role = 0 AND is_active = 1 AND is_deleted = 0',
        (assignee_id,)
    ).fetchone()
    if not assignee:
        conn.close()
        return False
```

派給住宿生沒有意義（他沒有處理的權限），派給已停用的管理員也沒有意義。

**③ 主檔更新與狀態紀錄必須在同一個 transaction。** 這是稽核軌跡的完整性保證：不允許「狀態變了但沒有紀錄」，也不允許「有紀錄但狀態沒變」。

**六個函式高度重複，刻意不抽象成單一的 `_transition()`。** 這與 Blueprint 中三層權限檢查明碼重複是同一個取捨：讀者從任何一個函式就能讀出「這條轉移的前置狀態、後置狀態、附帶欄位、紀錄文字」的完整定義，不需要跳到別處查表。

**`reopen` 的三個細節**：清空 `closed_at` 與 `started_at`（不再是結案狀態），但**保留 `assigned_to`**（同一個問題重複發生時，上次是誰處理的是有用的線索）。代價是 `assigned_at` 停留在上一輪的時間，語意略顯含糊（KI-15）。

**`reject` 與 `reopen` 的 `reason` 是必填**，函式開頭就 `if not reason: return False`。判準是「這個決定會不會讓對方需要解釋」——退件是拒絕受理，重新開啟是推翻先前的完工判斷，兩者都欠對方一個交代；派工、開始、完成、取消四條則不需要，狀態本身就說明了一切。

### 步驟 5：種子資料

六張報修單涵蓋六個狀態，各自示範一個值得觀察的行為，清單見規格書 §6.5。

**時間戳以 `datetime('now', '-N minutes')` 明確指定**，不用預設值。理由是全部在同一秒內建立時 `updated_at` 會完全相同，列表排序變得不確定，看不出「最近有異動的單會浮上來」這個行為。

`_seed_repair_if_empty()` 內部依每張單的紀錄推算三個時間欄位：

```python
        last_min = logs[-1][3] if logs else minutes_ago    # updated_at 取最後一則紀錄的時間
        closed   = updated if status in CLOSED_STATUSES else 'NULL'
```

**必須排在 `_seed_users_if_empty()` 之後**——報修單的 `requester_id` 與 `assigned_to` 都指向那四個帳號。

### 驗收

```bash
rm -f /tmp/check.db /tmp/check.db-wal /tmp/check.db-shm
DB_PATH=/tmp/check.db python -c "
import db
db.init_db()

# ── 1. 種子資料 ──
items, total = db.list_all_requests(1, 10)
assert total == 6, total
for r in items:
    print(f\"  #{r['id']} [{r['request_status']:>11}] {r['title'][:16]:<18} \"
          f\"申報={r['requester_display']:<20} 承辦={r['assignee_display']}\")

# 2. 六個狀態各一張
counts = db.count_by_status()
assert all(n == 1 for n in counts.values()), counts

# 3. 停用帳號的申報人退回顯示 email（COALESCE）
r5 = db.get_request(5)
assert r5['requester_display'] == 'disabled@example.com'

# 4. 未派工的單不會從清單消失（LEFT JOIN）
assert any(r['assigned_to'] is None for r in items), 'LEFT JOIN 寫成 JOIN 了'

# 5. 依 updated_at 降冪
assert [r['id'] for r in items][0] == 1

# ── 6. 狀態機 ──
rid = db.create_request(1, '測試單', 'water', 'normal', 'A 棟', '301', '0912', '描述')
assert db.get_request(rid)['request_status'] == 'pending'

assert db.start_request(rid, 2) is False,       'pending 不可直接開始處理'
assert db.assign_request(rid, 2, 1) is False,   '不可派給住宿生'
db.set_user_active(4, 0)
assert db.assign_request(rid, 2, 4) is False,   '不可派給停用中的管理員'
db.set_user_active(4, 1)

assert db.assign_request(rid, 2, 4, '請帶零件') is True
assert db.get_request(rid)['assigned_to'] == 4
assert db.assign_request(rid, 2, 2) is False,   '已派工不可再派'
assert db.cancel_request(rid, 3) is False,      '他人不可取消'

assert db.start_request(rid, 4) is True
assert db.cancel_request(rid, 1) is False,      '處理中不可取消'
assert db.complete_request(rid, 4, '已更換') is True
assert db.get_request(rid)['closed_at'] is not None
assert db.reject_request(rid, 2, '理由') is False, '已完成不可退件'

assert db.reopen_request(rid, 2, '') is False,  'reopen 必須填原因'
assert db.reopen_request(rid, 2, '仍在漏水') is True
req = db.get_request(rid)
assert req['request_status'] == 'pending'
assert req['closed_at'] is None
assert req['assigned_to'] == 4, 'reopen 應保留承辦人'

# ── 7. 稽核軌跡 ──
logs = db.list_logs(rid)
assert [l['log_type'] for l in logs] == ['report', 'status', 'status', 'status', 'status'], \
       [l['log_type'] for l in logs]
assert logs[1]['user_id'] == 2 and logs[2]['user_id'] == 4
assert '請帶零件' in logs[1]['content']
print()
print('  時間軸：')
for l in logs:
    print(f\"    [{l['log_type']:>7}] {l['author_display']}: {l['content']}\")

# 8. status 型別不可由 create_log 建立
assert db.create_log(rid, 1, '偽造的狀態', 'status') is None

# 9. 級聯軟刪除
db.create_log(rid, 1, '一則回覆', 'comment')
db.soft_delete_request(rid)
assert db.list_logs(rid) == [], '明細沒有一起標記刪除'
assert db.get_request(rid)['is_deleted'] == 1

# 10. transaction：主檔與首則描述同生共死
rid2 = db.create_request(1, 'X', 'other', 'low', 'A', '1', None, '描述')
assert len(db.list_logs(rid2)) == 1
assert db.get_report_log(rid2)['content'] == '描述'

print()
print('Phase 8 驗收通過 ✓')
"
```

這份驗收是整份建置流程中最長的一段，因為狀態機的每一條邊都要試走一次。**建議逐行讀完它再開始寫程式**——它其實就是規格書 §7.2 那張轉移表的可執行版本。

### 常見錯誤

- **`assign_request` 派給住宿生也成功**——漏了 `role = 0` 的條件
- **已派工的單可以再派一次**——前置狀態沒寫進 `WHERE`，或寫成了 `WHERE id = ?` 之後才用 Python 比對
- **`reopen` 之後 `assigned_to` 變成 NULL**——多寫了 `assigned_to = NULL`
- **未派工的報修單在管理清單中消失**——`LEFT JOIN` 寫成 `JOIN`
- **`list_logs` 的順序不穩定**——漏了 `id ASC` 這個次要排序鍵
- **種子報修單的 `requester_id` 指向不存在的使用者**——`_seed_repair_if_empty` 排在 `_seed_users_if_empty` 之前

---

## Phase 9 — repair 子系統（住宿生視角）

### 目的

讓住宿生可以申報、查詢、修改、取消與回覆報修單。**本階段引入第四層權限檢查（資料範圍權限），是整個系統最重要的新概念。**

### 產出檔案

| 檔案 | 說明 |
|------|------|
| `blueprints/repair/__init__.py` | 常數、四個 helper、六條路由（管理端留到 Phase 10） |
| `templates/repair/index.html` | 我的報修單 |
| `templates/repair/request_form.html` | 新增／修改共用表單 |
| `templates/repair/detail.html` | 詳細頁（管理操作區留到 Phase 10） |
| `static/repair.css` | **建立**（前綴 `repair-`） |
| `blueprints/repair/CLAUDE.md` | — |

### 四個 helper

```python
def _current_user():
    return db.find_user_by_id(session['user_id'])

def _is_admin(user):
    return user is not None and user['role'] == 0

def _can_view(user, req):
    return user is not None and req is not None and (
        req['requester_id'] == user['id'] or _is_admin(user)
    )

def _validate_request_form(form):
    ...  # 回傳第一個錯誤訊息或 None
```

**`_can_view()` 與前三層的性質不同。** 前三層問的是「你是誰」，只看 session 與 `users` 表；第四層問的是「這筆資料是不是你的」，**必須把資料先讀出來才能判斷**。這也決定了它在路由中的位置——一定在 `db.get_request()` 之後，而前三層都在之前：

```python
    user = _current_user()
    if not _is_usable(user):                    # 層 2
        session.clear()
        return redirect(url_for('auth.login_page'))

    req = db.get_request(request_id)            # ← 資料在這裡才被讀出來
    if not req or req['is_deleted']:
        flash('報修單不存在或已刪除', 'error')
        return redirect(url_for('repair.index'))
    if not _can_view(user, req):                # 層 4
        flash('無權限檢視此報修單', 'error')
        return redirect(url_for('repair.index'))
```

內容公開的系統只需要分「能不能寫」；報修單帶著房號與電話，因此還要再分「能不能看」。

**`edit` 與 `cancel` 比 `_can_view` 更嚴：只限申報人本人，管理員也不行。** 理由見規格書 §4.3——申報內容是住戶對故障的原始證言，管理員若能改，歷程就失真了；取消是申報人的權利，管理員該用的是退件。

### 六條路由

| 路由 | 守門 | 重點 |
|------|------|------|
| `GET /repair/` | 1+2 | 只列自己的；`?status=` `?page=` |
| `GET/POST /repair/new` | 1+2 | 表單以個人資料預填地點 |
| `GET /repair/<id>` | 1+2+4 | 詳細與時間軸 |
| `GET/POST /repair/<id>/edit` | 1+2+本人 | 限 `pending` |
| `POST /repair/<id>/comment` | 1+2+4 | 已結案不可回覆 |
| `POST /repair/<id>/cancel` | 1+2+本人 | 狀態合法性交給 db 層 |

**`/repair/` 用 `strict_slashes=False`**，讓 `/repair` 與 `/repair/` 都能進。

**管理員在 `/repair/` 看到的一樣只有自己申報的單。** 要看全部請到 `/repair/manage`（Phase 10）。兩個視角刻意分成兩條路由，而不是在同一頁用一個開關切換——它們的欄位、操作與心智模型都不同，混在一起會讓管理員分不清自己現在是住戶還是管理者。

**新增表單以個人資料預填：**

```python
    form = {
        'dorm_building': user['dorm_building'] or '',
        'room_no':       user['room_no'] or '',
        'contact_phone': user['phone'] or '',
        ...
    }
```

這是 Phase 2 那三個欄位真正發揮作用的地方——也是 Phase 6 必須補上 `_is_usable` 檢查的理由（見規格書 §12.0）。

### 三個樣板

**`request_form.html` 新增與修改共用**，以 `mode` 區分標題與送出目標。兩者的欄位完全相同——修改就是把同一張表單重新填一次。修改模式多一則提示：「報修單一經派工便無法修改。若要補充資訊，請回到報修單頁面新增回覆。」

**`detail.html` 是全系統最複雜的畫面**，左右兩欄，版面見規格書 §9.3。時間軸的三種 `log_type` 以不同顏色的圓點與標籤區分：申報內容（藍）、狀態異動（紫）、回覆（灰）。這個視覺區分是刻意的——讀者要能一眼分辨「這句話是人寫的」還是「這是系統記錄的事實」。

**已結案時，回覆表單替換成一句說明。** 畫面本身就把狀態機的規則表達出來，使用者不需要按下去才知道不行。

### `static/repair.css`

類別一律用 `repair-` 前綴，四組樣式要自己寫：狀態與優先等級的 badge、處理歷程時間軸、詳細頁的左右兩欄配置、狀態流程指示器。

第一行的 `body { display: block; ... }` **必須保留**——它覆蓋 `login.css` 的 flex 置中，否則整個頁面會被塞到畫面中央。

### 驗收

```bash
rm -f /tmp/check.db /tmp/check.db-wal /tmp/check.db-shm
DB_PATH=/tmp/check.db python -c "
import db
from app import app
db.init_db()
app.config['TESTING'] = True

def client_as(uid):
    c = app.test_client()
    with c.session_transaction() as s:
        s['user_id'] = uid
    return c

# ── 1. 資料範圍權限（本階段的核心）──
assert client_as(1).get('/repair/1').status_code == 200,   '本人應看得到自己的單'
r = client_as(1).get('/repair/5', follow_redirects=True)   # #5 屬於 user 3
assert '無權限檢視此報修單' in r.get_data(as_text=True),   '住宿生竟然看得到別人的報修單'
assert client_as(2).get('/repair/5').status_code == 200,   '管理員應看得到全部'

# 2. 清單只列自己的
body = client_as(1).get('/repair/').get_data(as_text=True)
assert '浴室水龍頭持續漏水' in body
assert '想在房間加裝個人洗衣機' not in body

# 3. 狀態篩選與排序
body = client_as(1).get('/repair/?status=completed').get_data(as_text=True)
assert '衣櫃門把鬆脫' in body and '浴室水龍頭持續漏水' not in body

# 4. 表單以個人資料預填
body = client_as(1).get('/repair/new').get_data(as_text=True)
assert 'value=\"A 棟\"' in body and 'value=\"301\"' in body

# 5. 六項驗證
c = client_as(1)
form = {'title': '插座沒電', 'description': '完全沒電', 'dorm_building': 'A 棟',
        'room_no': '301', 'contact_phone': '', 'category': 'electric', 'priority': 'high'}
for field, msg in [('title', '請輸入報修標題'), ('description', '請描述故障情形'),
                   ('dorm_building', '請輸入宿舍棟別'), ('room_no', '請輸入房號')]:
    bad = dict(form, **{field: '  '})
    assert msg in c.post('/repair/new', data=bad).get_data(as_text=True), field
assert '維修類別不正確' in c.post('/repair/new', data=dict(form, category='rocket')).get_data(as_text=True)
assert '優先等級不正確' in c.post('/repair/new', data=dict(form, priority='asap')).get_data(as_text=True)

# 6. 新增成功
_, before = db.list_my_requests(1, 1, 1, 'all')
assert c.post('/repair/new', data=form).status_code == 302
_, after = db.list_my_requests(1, 1, 1, 'all')
assert after == before + 1
items, _ = db.list_my_requests(1, 1, 1, 'all')
rid = items[0]['id']
assert items[0]['request_status'] == 'pending'
assert len(db.list_logs(rid)) == 1 and db.list_logs(rid)[0]['log_type'] == 'report'

# 7. 修改：本人可、管理員不可
c.post(f'/repair/{rid}/edit', data=dict(form, title='改過的標題'))
assert db.get_request(rid)['title'] == '改過的標題'
r = client_as(2).post(f'/repair/{rid}/edit', data=dict(form, title='管理員改的'), follow_redirects=True)
assert '無權限修改此報修單' in r.get_data(as_text=True)
assert db.get_request(rid)['title'] == '改過的標題', '管理員竟然改掉了申報內容'

# 8. 派工後不可修改
db.assign_request(rid, 2, 4)
r = c.post(f'/repair/{rid}/edit', data=dict(form, title='太晚了'), follow_redirects=True)
assert '只有待受理的報修單可以修改' in r.get_data(as_text=True)
assert db.get_request(rid)['title'] == '改過的標題'

# 9. 回覆：本人與管理員可，他人不可
c.post(f'/repair/{rid}/comment', data={'content': '我下午都在'})
assert db.list_logs(rid)[-1]['content'] == '我下午都在'
client_as(2).post(f'/repair/{rid}/comment', data={'content': '已排入工單'})
assert db.list_logs(rid)[-1]['log_type'] == 'comment'
n = len(db.list_logs(rid))
db.set_user_active(3, 1)
client_as(3).post(f'/repair/{rid}/comment', data={'content': '不該出現'})
assert len(db.list_logs(rid)) == n, '他人竟然可以回覆'
db.set_user_active(3, 0)

# 10. 取消：本人可（assigned 狀態），管理員不可
r = client_as(2).post(f'/repair/{rid}/cancel', follow_redirects=True)
assert '無權限取消此報修單' in r.get_data(as_text=True)
c.post(f'/repair/{rid}/cancel')
assert db.get_request(rid)['request_status'] == 'cancelled'

# 11. 已結案不可回覆，且畫面上沒有回覆表單
r = c.post(f'/repair/{rid}/comment', data={'content': 'x'}, follow_redirects=True)
assert '此報修單已結案，無法新增回覆' in r.get_data(as_text=True)
body = c.get(f'/repair/{rid}').get_data(as_text=True)
assert 'name=\"content\"' not in body

print('Phase 9 驗收通過 ✓（含資料範圍權限）')
"
```

### 常見錯誤

- **第 1 步失敗**——`_can_view` 忘了呼叫，或寫在 `db.get_request()` 之前（此時 `req` 還是 `None`）
- **`/repair/` 列出所有人的單**——用了 `list_all_requests` 而不是 `list_my_requests`
- **管理員可以修改申報內容**——`edit` 用了 `_can_view` 而不是 `req['requester_id'] != user['id']`
- **報修頁面被塞到畫面正中央**——`repair.css` 開頭忘了覆蓋 `body { display: block }`
- **`BuildError: repair.manage`**——詳細頁的管理操作區寫太早了，Phase 10 再補

---

## Phase 10 — repair 子系統（管理員視角與狀態機）

### 目的

補上管理清單與六條狀態轉移路由。完成後報修流程可以完整走完。

### 產出檔案

| 檔案 | 說明 |
|------|------|
| `blueprints/repair/__init__.py` | 追加七條路由（manage + 六條轉移 + delete） |
| `templates/repair/manage.html` | 管理清單 |
| `templates/repair/detail.html` | 追加右欄的管理操作區與狀態流程指示器 |
| `static/repair.css` | 追加摘要方塊與操作區樣式 |

### 七條路由

全部以同一組三層檢查開頭，**明碼重複寫出**：

```python
    user = _current_user()
    if not _is_usable(user):
        session.clear()
        return redirect(url_for('auth.login_page'))
    if not _is_admin(user):
        flash('無操作權限', 'error')
        return redirect(url_for('repair.index'))
```

六條轉移路由的主體則極短——取表單參數、呼叫 db 函式、依布林值 flash：

```python
    note = request.form.get('note', '').strip() or None
    if db.start_request(request_id, user['id'], note):
        flash('已開始處理', 'success')
    else:
        flash('無法開始處理（報修單狀態不符）', 'error')
    return redirect(url_for('repair.detail', request_id=request_id))
```

**狀態合法性完全交給 db 層**，Blueprint 不重複判斷。這是分層的體現：「這個人可不可以」是 Blueprint 的事（看 session），「這張單現在可不可以」是 db 的事（看資料）。

失敗訊息一律是「無法…（報修單狀態不符）」，因為 Blueprint 拿到的只是一個 `False`，它無從得知是狀態不對、單不存在、還是承辦人無效。這是分層帶來的資訊損失，是可接受的代價——三種情況對使用者的意義相同：這個操作現在做不了。

**`reject` 與 `reopen` 的原因在 Blueprint 就先擋一次**（db 層也會擋），因為要給出比「狀態不符」更精確的訊息：

```python
    reason = request.form.get('note', '').strip()
    if not reason:
        flash('請填寫退件原因', 'error')
        return redirect(url_for('repair.detail', request_id=request_id))
```

**`/repair/manage` 與 `/repair/<int:request_id>` 不會衝突**——`<int:...>` 不會匹配 `manage` 這個字串。若當初把單號路由寫成 `<request_id>`（不限型別），就會撞在一起。

### 為什麼是六條路由，不是一條 `/transition`

可以設計成 `POST /repair/<id>/transition` 用表單欄位 `action` 分派。刻意不這樣做的三個理由見規格書 §8.2：各條轉移的必填參數不同、URL 本身就是文件、權限若未來要分化需要掛載點。

### `manage.html` 的三個區塊

**狀態摘要方塊**（六個可點擊的計數方塊，資料來自 `db.count_by_status()`）、**篩選與搜尋列**、**表格**（比「我的報修單」多了申報人與操作兩欄）。

摘要方塊與篩選連結功能重複（兩者都是篩選），保留兩者是因為它們回答不同的問題：摘要回答「現在整體狀況如何」，篩選回答「我要看哪一批」。管理員進入頁面的第一眼需要前者。

### `detail.html` 右欄的管理操作區

**依狀態渲染不同的表單**，這是狀態機在畫面上的直接映射：

| 狀態 | 顯示的表單 |
|------|-----------|
| `pending` | 派工（承辦人下拉 + 備註）、退件（原因必填） |
| `assigned` | 開始處理（備註選填） |
| `in_progress` | 登記完成（完工說明選填） |
| `completed` | 重新開啟（原因必填） |
| `rejected` / `cancelled` | 無（只剩刪除） |

承辦人下拉的選項來自 `db.list_active_admins()`，只在 `_is_admin(user)` 時才查詢：

```python
    assignees = db.list_active_admins() if _is_admin(user) else []
```

另外加一個**狀態流程指示器**（① 待受理 → ② 已派工 → ③ 處理中 → ④ 已完成），以 CSS class 標示已完成、目前、未達三種狀態。它下面一句話說明退件與取消是離開流程的兩條分支——線性的四步圖沒辦法表達分支，用文字補上比畫一張複雜的圖有效。

### 驗收

```bash
rm -f /tmp/check.db /tmp/check.db-wal /tmp/check.db-shm
DB_PATH=/tmp/check.db python -c "
import db
from app import app
db.init_db()
app.config['TESTING'] = True

def client_as(uid):
    c = app.test_client()
    with c.session_transaction() as s:
        s['user_id'] = uid
    return c

resident, manager, worker = client_as(1), client_as(2), client_as(4)

# 1. 管理清單的角色守門
assert '/repair/' in resident.get('/repair/manage').headers['Location']
assert manager.get('/repair/manage').status_code == 200

# 2. 管理清單看得到全部
body = manager.get('/repair/manage').get_data(as_text=True)
assert '浴室水龍頭持續漏水' in body and '想在房間加裝個人洗衣機' in body

# 3. 篩選與搜尋
assert '衣櫃門把鬆脫' not in manager.get('/repair/manage?status=pending').get_data(as_text=True)
b = manager.get('/repair/manage?q=205').get_data(as_text=True)
assert '想在房間加裝個人洗衣機' in b and '浴室水龍頭持續漏水' not in b

# ── 4. 完整生命週期 ──
form = {'title': '插座沒電', 'description': '靠窗那組沒電', 'dorm_building': 'A 棟',
        'room_no': '301', 'contact_phone': '', 'category': 'electric', 'priority': 'high'}
resident.post('/repair/new', data=form)
rid = db.list_my_requests(1, 1, 1, 'all')[0][0]['id']

assert '請選擇承辦人' in manager.post(f'/repair/{rid}/assign', data={}, follow_redirects=True).get_data(as_text=True)
assert '派工失敗' in manager.post(f'/repair/{rid}/assign', data={'assignee_id': 1}, follow_redirects=True).get_data(as_text=True)
assert '已完成派工' in manager.post(f'/repair/{rid}/assign', data={'assignee_id': 4}, follow_redirects=True).get_data(as_text=True)

resident.post(f'/repair/{rid}/comment', data={'content': '我下午都在房間'})

assert '已開始處理' in worker.post(f'/repair/{rid}/start', data={'note': '已到場'}, follow_redirects=True).get_data(as_text=True)
assert '已登記完成' in worker.post(f'/repair/{rid}/complete', data={'note': '更換插座'}, follow_redirects=True).get_data(as_text=True)

req = db.get_request(rid)
assert req['request_status'] == 'completed'
assert req['assigned_at'] and req['started_at'] and req['closed_at']

# 5. 稽核軌跡：1 申報 + 3 狀態 + 1 回覆
logs = db.list_logs(rid)
assert [l['log_type'] for l in logs] == ['report', 'status', 'comment', 'status', 'status'], \
       [l['log_type'] for l in logs]
assert logs[1]['user_id'] == 2 and logs[3]['user_id'] == 4

# 6. 不合法的轉移被擋，且資料不變
assert '無法退件' in manager.post(f'/repair/{rid}/reject', data={'note': 'x'}, follow_redirects=True).get_data(as_text=True)
assert db.get_request(rid)['request_status'] == 'completed'

# 7. 重新開啟
assert '請填寫重新開啟的原因' in manager.post(f'/repair/{rid}/reopen', data={'note': ''}, follow_redirects=True).get_data(as_text=True)
assert '報修單已重新開啟' in manager.post(f'/repair/{rid}/reopen', data={'note': '仍然沒電'}, follow_redirects=True).get_data(as_text=True)
req = db.get_request(rid)
assert req['request_status'] == 'pending' and req['closed_at'] is None
assert req['assigned_to'] == 4, 'reopen 應保留承辦人'

# 8. 住宿生執行任何管理動作都被擋，且資料不變
for path, data in [('assign', {'assignee_id': 4}), ('start', {}), ('complete', {}),
                   ('reject', {'note': 'x'}), ('reopen', {'note': 'x'}), ('delete', {})]:
    resident.post(f'/repair/{rid}/{path}', data=data)
assert db.get_request(rid)['request_status'] == 'pending', '住宿生竟然改動了狀態'
assert db.get_request(rid)['is_deleted'] == 0

# 9. 刪除級聯
manager.post(f'/repair/{rid}/delete')
assert db.get_request(rid)['is_deleted'] == 1
assert db.list_logs(rid) == []

# 10. 詳細頁依狀態渲染不同的操作
body = manager.get('/repair/1').get_data(as_text=True)     # pending
assert '派工' in body and '退件' in body
body = manager.get('/repair/3').get_data(as_text=True)     # in_progress
assert '登記完成' in body and '派工給' not in body

print('Phase 10 驗收通過 ✓')
"
```

第 8 步是最重要的一步：**被權限擋下的 POST 必須同時斷言資料庫沒有改變。** 只驗 302 無法區分「被擋下」與「執行成功後 redirect」——在有狀態機的系統中，兩者的 redirect 目標往往完全相同。

### 常見錯誤

- **`/repair/manage` 回傳 404 或被當成單號**——路由寫成了 `<request_id>` 而非 `<int:request_id>`，或 `manage` 註冊在單號路由之後且型別未限定
- **住宿生可以派工**——`_is_admin` 檢查漏了，或寫在 `db.assign_request()` 之後
- **承辦人下拉是空的**——`assignees` 只在 `_is_admin` 時查詢，若條件寫反就會是空的
- **每個狀態都顯示全部按鈕**——`detail.html` 的 `{% if %}` 分支寫成了平行的四個 `{% if %}` 而不是 `{% elif %}`

---

## Phase 11 — 跨子系統整合

### 目的

把報修接回首頁與會員管理。這個階段的每一處改動都很小，但它們是「五個子系統變成一個系統」的關鍵。

### 產出檔案

| 檔案 | 改動 |
|------|------|
| `blueprints/hub/__init__.py` | 新增摘要查詢 |
| `templates/hub/home.html` | 補上報修的兩張卡片與管理員的兩張卡片 |
| `static/hub.css` | 新增三個 class |
| `blueprints/admin/__init__.py` | 明細頁查詢該會員的報修單 |
| `templates/admin/user_detail.html` | 新增報修單區塊 |
| `templates/profile/dashboard.html` | 底部新增「我的報修單」連結 |
| `templates/repair/*.html`、`templates/admin/*.html` | topbar 互相加連結 |

### `hub` 的摘要查詢

```python
    my_summary = None
    pending_count = 0
    if user is not None:
        _, my_summary = db.list_my_requests(user['id'], 1, 1, 'all')
        if user['role'] == 0:
            pending_count = db.count_by_status()['pending']
```

`list_my_requests(..., page_size=1, ...)` 只是為了取 `total`——回傳的 tuple 第二個元素。這樣做浪費了一次索引查詢（撈出一筆用不到的資料），但省下再寫一個 `count_my_requests()` 函式。在這個規模下是划算的取捨；若首頁成為效能瓶頸，這是第一個該改的地方。

`pending_count` 只在管理員時查詢——住宿生看不到那張卡片，查了也沒用。

### 首頁卡片

登入後從一張變五張（住宿生三張、管理員五張）：

| 卡片 | 對象 | 附帶資訊 |
|------|------|---------|
| 我要報修 | 全部 | — |
| 我的報修單 | 全部 | 「共 N 筆」 |
| 個人資料 | 全部 | — |
| 報修管理 | 管理員 | 「N 筆待受理」（僅 N > 0 時顯示） |
| 會員管理 | 管理員 | — |

歡迎詞加上住宿位置：

```html
{% if user['dorm_building'] and user['room_no'] %}
  住宿位置：{{ user['dorm_building'] }} {{ user['room_no'] }}　|
{% endif %}
```

管理員沒有房號，條件式會讓那一段整個消失，不會出現「住宿位置：　|」這種殘骸。

### `admin` 明細頁的報修單區塊

```python
    requests, request_total = db.list_my_requests(user_id, 1, 5, 'all')
```

**為什麼要加這個區塊：** 管理員在停用或刪除一個帳號之前，應該先看到會受影響的紀錄。而本系統的行為是**不連動刪除**（規格書 §6.6），這個決定必須在管理員動手的那個畫面上說清楚：

```html
<p class="admin-self-note">
  停用或刪除帳號<strong>不會</strong>連動刪除這些報修單——設施的維護歷程屬於宿舍，不屬於個人。
</p>
```

**這個區塊刻意不顯示狀態欄。** 報修狀態的中文標籤（`STATUS_LABELS`）定義在 `repair` Blueprint 內，`admin` 若要顯示就得跨 Blueprint 取用，或自行複製一份標籤表——兩者都會弄髒模組邊界。而這個區塊真正要回答的問題是「有沒有紀錄」，單號與標題就夠了。

這是一個很小的取捨，但它示範了模組邊界如何實際影響功能設計：**當一個功能需要跨越邊界時，先問這個功能是不是真的需要那個資訊。** 多數時候不需要。

### 驗收

```bash
rm -f /tmp/check.db /tmp/check.db-wal /tmp/check.db-shm
DB_PATH=/tmp/check.db python -c "
import db
from app import app
db.init_db()
app.config['TESTING'] = True

def client_as(uid):
    c = app.test_client()
    with c.session_transaction() as s:
        s['user_id'] = uid
    return c

# 1. 住宿生首頁：三張卡片、單數、住宿位置
body = client_as(1).get('/').get_data(as_text=True)
assert 'href=\"/repair/new\"' in body and 'href=\"/repair/\"' in body
assert '共 5 筆' in body, '我的報修單卡片應顯示單數'
assert '住宿位置' in body and 'A 棟' in body
assert '/admin/users' not in body and '/repair/manage' not in body

# 2. 管理員首頁：五張卡片、待受理筆數
body = client_as(2).get('/').get_data(as_text=True)
assert '/admin/users' in body and '/repair/manage' in body
assert '筆待受理' in body

# 3. 管理員沒有房號時不出現殘缺的住宿位置
assert '住宿位置' not in body

# 4. 訪客首頁仍然沒有任何可進入的連結
body = app.test_client().get('/').get_data(as_text=True)
assert 'href=\"/repair/' not in body and 'hub-card-locked' in body

# 5. 會員明細顯示報修單，且說明不連動刪除
body = client_as(2).get('/admin/users/1').get_data(as_text=True)
assert '此會員的報修單' in body and '浴室水龍頭持續漏水' in body
assert '不會' in body

# 6. 刪除帳號不影響報修單
_, before = db.list_my_requests(1, 1, 1, 'all')
client_as(2).post('/admin/users/1/delete')
_, after = db.list_my_requests(1, 1, 1, 'all')
assert after == before and before > 0, '刪除帳號竟然連動刪除了報修單'

# 7. 沒有報修單的會員顯示替代文字
assert '尚未申報過任何報修單' in client_as(2).get('/admin/users/2').get_data(as_text=True)

# 8. 全部路由都掛上了
paths = sorted(str(r) for r in app.url_map.iter_rules() if r.endpoint != 'static')
assert len(paths) == 27, f'{len(paths)} 條路由，應為 27 條'
print(f'  路由共 {len(paths)} 條 ✓')

print('Phase 11 驗收通過 ✓')
"
```

### 常見錯誤

- **首頁顯示「共 None 筆」**——`_, my_summary = db.list_my_requests(...)` 的解包順序寫反了（函式回傳 `(items, total)`）
- **管理員首頁出現「住宿位置：　|」**——條件式只檢查了 `dorm_building` 沒檢查 `room_no`，或用了 `or` 而非 `and`
- **在 `admin` 中 `from blueprints.repair import STATUS_LABELS`**——違反「Blueprint 之間不互相 import」。正確做法是不顯示狀態

---

## Phase 12 — 測試

### 目的

補上 188 個自動化測試。前面每個階段的驗收指令都是一次性的手動檢查，這個階段把它們變成可重複執行的迴歸防線。

### 產出檔案

| 檔案 | 案例數 |
|------|:---:|
| `tests/conftest.py` | — |
| `tests/data/users.py` | — |
| `tests/test_auth.py` | 29 |
| `tests/test_hub.py` | 15 |
| `tests/test_profile.py` | 12 |
| `tests/test_admin.py` | 38 |
| `tests/test_repair.py` | 94 |
| `tests/CLAUDE.md` | — |

### `conftest.py` 的修改：新增 `staff_client`

本系統有五個 client fixture：

```python
@pytest.fixture
def staff_client(client):
    """第四個使用者 session（staff@example.com，ID=4，role=0，第二位管理員）。"""
    with client.session_transaction() as sess:
        sess['user_id'] = 4
    return client
```

> **陷阱**：五個 client fixture 都由 `client` 衍生，**同一個測試中同時請求兩個，拿到的是同一個物件**。需要兩個身分同時存在時（例如驗證完整生命週期），必須用 `test_repair.py` 中的 `_client_as(app, user_id)` helper 自行建立。本系統有「住戶 + 管理員 + 維修人員」三方互動的測試，特別容易踩到這個陷阱。

### `tests/data/users.py` 的擴充

三處：`USERS` 加第四個帳號；新增 `SEED_REQUESTS` 常數（六張種子單的 id 與申報人，讓測試不必寫死數字）；`MESSAGES` 由 22 則擴充到 **55 則**（新增 repair 的 33 則）。

**訊息字串一律集中在 `MESSAGES`**，不散落到各測試檔的斷言中——55 則訊息全部集中，改 Blueprint 的訊息時只要跑一次測試就知道漏改了哪裡。

### `test_repair.py` 的結構

94 個案例分八組，對應規格書 §13.4。三個寫法值得說明：

**用 `parametrize` 覆蓋重複的守門測試：**

```python
@pytest.mark.parametrize('path', [
    '/repair/1/comment', '/repair/1/cancel', '/repair/1/assign',
    '/repair/1/start', '/repair/1/complete', '/repair/1/reject',
    '/repair/1/reopen', '/repair/1/delete',
])
def test_post_routes_require_login(client, path):
    resp = client.post(path, data={})
    assert resp.status_code == 302
    assert '/login' in resp.headers['Location']
    assert db.get_request(1)['request_status'] == 'pending'   # ← 關鍵
```

最後一行是重點：**被擋下的 POST 必須同時斷言資料庫沒有改變。**

**用 db 函式佈置前置狀態：**

```python
def test_cancel_in_progress_request_rejected(app, new_request):
    db.assign_request(new_request, 2, 4)
    db.start_request(new_request, 4)
    c = _client_as(app, 1)
    resp = c.post(f'/repair/{new_request}/cancel', follow_redirects=True)
    assert MESSAGES['repairCancelFailed'] in resp.get_data(as_text=True)
    assert db.get_request(new_request)['request_status'] == 'in_progress'
```

這是把 db 函式當作測試的建構工具，不是在測它。走 HTTP 佈置前置狀態會讓測試變成三倍長，而且失敗時分不清是佈置壞了還是待測行為壞了。

**一個測試走完完整生命週期，驗證稽核軌跡：**

```python
    logs = db.list_logs(rid)
    assert [log['log_type'] for log in logs] == [
        'report', 'status', 'comment', 'status', 'status',
    ]
    assert logs[0]['user_id'] == 1     # 申報人
    assert logs[1]['user_id'] == 2     # 派工的管理員
    assert logs[3]['user_id'] == 4     # 動工的維修人員
```

這是全套測試中最有價值的一個。它一次驗證了狀態機、稽核軌跡、三方協作與時間軸順序——任何一環壞掉它都會失敗。

### 相對式斷言

種子資料有 6 張報修單，測試拿到的**不是空資料庫**。所有數量斷言都要用相對式：

```python
    _, before = db.list_my_requests(1, 1, 1, 'all')
    authed_client.post('/repair/new', data=_VALID_FORM)
    _, after = db.list_my_requests(1, 1, 1, 'all')
    assert after == before + 1
```

例外是分頁測試，它需要知道確切的總數，因此明確算出「種子 5 張 + 新增 8 張 = 13 張」並在註解中寫明來源。

### 驗收

```bash
# 1. 全部通過
pytest -q

# 2. 各模組的案例數
for f in tests/test_*.py; do
  echo -n "$f: "
  pytest "$f" -q 2>&1 | tail -1
done

# 3. 關鍵測試：帳號有效性檢查的迴歸防線（Phase 6 的修正）
pytest -k "rejects_disabled_user or rejects_deleted_user" -v

# 4. 關鍵測試：完整生命週期
pytest -k "full_lifecycle" -v

# 5. 確認只收集到本系統的測試
pytest --collect-only -q 2>&1 | tail -3
```

預期輸出：188 passed；auth 29、hub 15、profile 12、admin 38、repair 94；第 5 步只應出現 `tests/` 底下的路徑。

### 常見錯誤

- **`fixture 'app' not found`**——不在專案根目錄執行 pytest，或 `pytest.ini` 遺失
- **測試互相污染**——某個測試改了種子資料且沒有還原。`tmp_path` 的隔離是 function scope，理論上不會發生；若發生，檢查是否誤用了 module scope 的 fixture
- **`test_index_pagination` 數字對不上**——種子資料的張數變了。這類寫死的數字要在註解中寫明來源
- **同一個測試中 `authed_client` 與 `admin_client` 行為詭異**——踩到 fixture 共用同一個 client 的陷阱，改用 `_client_as()`

---

## Phase 13 — Docker、文件與最終驗收

### 目的

補齊文件，做一次端到端的完整驗收。

### 產出檔案

| 檔案 | 說明 |
|------|------|
| `CLAUDE.md`（根目錄） | 專案速查：技術棧、路由總表、權限、種子資料、開發原則 |
| `db/CLAUDE.md`、五個 `blueprints/*/CLAUDE.md`、`tests/CLAUDE.md` | 各模組職責 |
| `rules/flask-blueprint.md` | 含狀態機路由與資料範圍權限的規範 |
| `rules/database.md` | 含狀態轉移函式的撰寫規範 |
| `document/system-spec.md` | 系統規格書 |
| `document/build-guide.md` | 本文件 |
| `document/auth.md` 等五份 | 各子系統文件 |
| `README.md` | 快速開始 |
| `.gitignore` | — |

### `rules/` 的兩處補充

這兩份規範各需要一節與報修有關的內容。

**`rules/database.md` 新增「狀態轉移函式」一節**，規定四件事：前置狀態寫在 `WHERE` 子句、主檔更新與狀態紀錄同 transaction、回傳布林值、一個函式一條轉移不合併。

**`rules/flask-blueprint.md` 新增「資料範圍權限」一節**，規定第四層檢查必須在資料讀取之後，且不可與前三層合併成一個 helper（因為它們的失敗處置不同：前者 flash + redirect，後者 `session.clear()`）。

### Docker 驗收（受限）

```bash
docker compose up -d --build
curl --retry 15 --retry-delay 1 --retry-connrefused http://localhost:4000/health
docker compose logs --tail 20
docker compose down            # 保留 volume
docker compose up -d           # 重新啟動
# 此時先前建立的資料應該還在（named volume 持久化）
docker compose down -v         # 停止並刪除資料
```

`.dockerignore` 必須排除 `tests/`、`.pytest_cache/` 與資料庫檔，否則映像會平白變大。

### 最終整合驗收

這是整份建置流程的終點。它模擬一次完整的真實使用，跨越全部五個子系統：

```bash
rm -f /tmp/final.db /tmp/final.db-wal /tmp/final.db-shm
DB_PATH=/tmp/final.db python -c "
import db
from app import app
db.init_db()
app.config['TESTING'] = True

def client_as(uid):
    c = app.test_client()
    with c.session_transaction() as s:
        s['user_id'] = uid
    return c

print('=== 1. 訪客 ===')
body = app.test_client().get('/').get_data(as_text=True)
assert 'hub-card-locked' in body and 'href=\"/repair/' not in body
print('  訪客看得到首頁，但沒有任何可進入的子系統 ✓')

print('=== 2. 新住宿生註冊並登入 ===')
c = app.test_client()
c.post('/register', data={
    'email': 'freshman@example.com', 'password': 'password123',
    'confirm_password': 'password123', 'name': '林新生',
    'dorm_building': 'C 棟', 'room_no': '512', 'phone': '0988-111-222',
})
with c.session_transaction() as s:
    s['captcha'] = 'ABCDE'
c.post('/login', data={'email': 'freshman@example.com',
                       'password': 'password123', 'captcha': 'ABCDE'})
uid = db.find_user_by_email('freshman@example.com')['id']
print(f'  新帳號 id={uid}，role={db.find_user_by_id(uid)[\"role\"]} ✓')

print('=== 3. 申報報修（表單以個人資料預填）===')
body = c.get('/repair/new').get_data(as_text=True)
assert 'value=\"C 棟\"' in body and 'value=\"512\"' in body
c.post('/repair/new', data={
    'title': '窗戶關不緊', 'description': '窗戶軌道卡住，颱風天會漏水',
    'dorm_building': 'C 棟', 'room_no': '512', 'contact_phone': '0988-111-222',
    'category': 'door', 'priority': 'high',
})
rid = db.list_my_requests(uid, 1, 1, 'all')[0][0]['id']
print(f'  報修單 #{rid} 已建立，狀態 {db.get_request(rid)[\"request_status\"]} ✓')

print('=== 4. 權限邊界 ===')
r = client_as(1).get(f'/repair/{rid}', follow_redirects=True)
assert '無權限檢視此報修單' in r.get_data(as_text=True)
assert '/repair/' in c.get('/repair/manage').headers['Location']
print('  他人看不到、住宿生進不了管理清單 ✓')

print('=== 5. 管理員派工 → 維修人員完工 ===')
m, w = client_as(2), client_as(4)
assert m.get(f'/repair/{rid}').status_code == 200
m.post(f'/repair/{rid}/assign', data={'assignee_id': 4, 'note': '颱風季前處理'})
c.post(f'/repair/{rid}/comment', data={'content': '我週末都在'})
w.post(f'/repair/{rid}/start', data={'note': '已到場檢查'})
w.post(f'/repair/{rid}/complete', data={'note': '更換軌道滑輪並上油'})
req = db.get_request(rid)
assert req['request_status'] == 'completed'
print(f'  狀態 {req[\"request_status\"]}，承辦 {req[\"assignee_display\"]} ✓')

print('=== 6. 稽核軌跡 ===')
logs = db.list_logs(rid)
assert [l['log_type'] for l in logs] == ['report','status','comment','status','status']
for l in logs:
    print(f'    [{l[\"log_type\"]:>7}] {l[\"author_display\"]}: {l[\"content\"][:32]}')

print('=== 7. 重新開啟 ===')
m.post(f'/repair/{rid}/reopen', data={'note': '住戶回報仍會滲水'})
req = db.get_request(rid)
assert req['request_status'] == 'pending' and req['assigned_to'] == 4
print('  回到待受理，承辦人保留 ✓')

print('=== 8. 停用帳號的完整行為 ===')
m.post(f'/admin/users/{uid}/deactivate')
# 8a. 報修單仍在
_, n = db.list_my_requests(uid, 1, 1, 'all')
assert n == 1, '停用帳號不應影響其報修單'
# 8b. 舊 session 被清除
r = c.get('/repair/')
assert r.status_code == 302 and '/login' in r.headers['Location']
with c.session_transaction() as s:
    assert 'user_id' not in s
# 8c. profile 的 POST 也被擋（Phase 6 的修正）
c2 = client_as(uid)
before = db.find_user_by_id(uid)['room_no']
c2.post('/profile/update', data={'name': 'X', 'display_name': '',
                                 'dorm_building': 'Z', 'room_no': '999', 'phone': ''})
assert db.find_user_by_id(uid)['room_no'] == before, 'KI-03 的修正漏了！'
print('  報修單保留、session 清除、profile POST 被擋 ✓')

print()
print('最終整合驗收通過 ✓')
"

# 最後跑一次完整測試
pytest -q
```

### 完工檢查清單

- [ ] `pytest -q` → 188 passed
- [ ] `python app.py` 可啟動，`curl localhost:4000/health` → OK
- [ ] 路由總數為 27
- [ ] 四個種子帳號、六張種子報修單，六個狀態各一
- [ ] 訪客首頁沒有任何可進入的子系統連結
- [ ] 住宿生看不到他人的報修單
- [ ] `POST /profile/update` 會擋下停用帳號（**最容易漏的一項**）
- [ ] 六條狀態轉移的不合法路徑都被擋下且資料不變
- [ ] 每次狀態異動都留下一筆 `log_type='status'` 的紀錄
- [ ] 停用會員不影響其報修單
- [ ] `docker compose up -d --build` 可啟動
- [ ] `document/` 下有 system-spec.md 與 build-guide.md

---

## 附錄 A：完整檔案清單

### A. 各檔案建立於哪個階段

| 檔案 | Phase |
|------|:--:|
| `app.py`、`utils.py`、`requirements.txt`、`pytest.ini`、`blueprints/__init__.py` | 1 |
| `db/{__init__,connection,users}.py` | 2 |
| `templates/base.html`、`static/{common,login}.css` | 3 |
| `blueprints/auth/`、`templates/auth/{login,register}.html` | 4 |
| `blueprints/hub/`、`templates/hub/home.html`、`static/hub.css` | 5 |
| `blueprints/profile/`、`templates/profile/dashboard.html`、`static/profile.css` | 6 |
| `blueprints/admin/`、`templates/admin/{user_list,user_detail}.html`、`static/admin.css` | 7 |
| `db/repair.py`（兩張表、狀態機、種子報修單） | 8 |
| `blueprints/repair/`、`templates/repair/` 四個樣板、`static/repair.css` | 9–10 |
| `tests/`（`conftest.py`、`data/users.py`、五個測試檔） | 12 |
| `Dockerfile`、`docker-compose.yml`、`rules/*.md`、`document/*.md`、`CLAUDE.md` | 13 |


## 附錄 B：階段與規格書章節對照

| Phase | 對應規格書章節 |
|:---:|---------------|
| 1 | §3.3 目錄結構、§2.3 執行方式 |
| 2 | §6.2 users DDL、§6.5 種子資料 |
| 3 | §9.5 CSS 架構 |
| 4 | §5.2 身分驗證 |
| 5 | §5.1 首頁、§4.3 權限矩陣 |
| 6 | §5.3 個人資料、**§12.0 判準**、§12.5 修正 |
| 7 | §5.5 會員管理、§4.4 權限檢查、§4.5 自我保護 |
| 8 | §6.3 repair DDL、**§7 狀態機**、§6.7 函式總表 |
| 9 | §5.4 報修（01–06）、§4.4 第四層、§9.3 詳細頁版面 |
| 10 | §5.4 報修（07–13）、§7.2 轉移表、§8.2 路由設計 |
| 11 | §6.6 資料保留規則、§9.2 導覽關係 |
| 12 | §13 測試策略 |
| 13 | §11.6 部署、§12 已知技術債 |
