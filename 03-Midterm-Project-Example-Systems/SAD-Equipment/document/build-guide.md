# 器材借用系統 — 建置流程書

## 0. 文件資訊

| 項目 | 內容 |
|------|------|
| 文件名稱 | 器材借用系統 建置流程書 |
| 版本 | v1.0 |
| 日期 | 2026-08-10 |
| 上位依據 | [`document/system-spec.md`](system-spec.md) |
| 適用對象 | 要把這個系統從無到有建起來的人 |

### 0.1 這份文件是什麼

系統規格書說明「系統是什麼」，這份文件說明「怎麼把它建出來」。

流程分為 **12 個階段**，每個階段都是一個可以獨立完成、獨立驗收的單位。
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

### 0.4 階段總覽

| Phase | 名稱 | 主要產出 | 相依 |
|:--:|------|---------|------|
| 0 | 環境準備 | 無（僅檢查） | — |
| 1 | 專案骨架與入口 | `app.py`、`utils.py`、設定檔 | 0 |
| 2 | 資料存取層（users） | `db/__init__.py`、`connection.py`、`users.py` | 1 |
| 3 | 共用樣板與 CSS | `base.html`、六個 CSS | 1 |
| 4 | auth 子系統 | 登入、註冊、驗證碼 | 2、3 |
| 5 | hub 子系統 | 首頁（先只放個人資料卡片） | 4 |
| 6 | profile 子系統 | 個人資料 | 4、5 |
| 7 | admin 子系統 | 會員管理 | 2、6 |
| **8** | **資料存取層（equipment）** | **`db/equipment.py` + 種子器材** | **2** |
| **9** | **equipment 子系統** | **器材借用全流程** | **7、8** |
| 10 | 測試 | `tests/` 全套、`pytest.ini` | 9 |
| 11 | Docker 與文件 | 容器化設定、`CLAUDE.md`、`rules/`、`document/` | 10 |
| 12 | 最終整合驗收 | 無（僅檢查） | 全部 |

> Phase 9（equipment）排在 admin 之後，是因為器材子系統的守門修正必須有「停用帳號」與
> 「管理員」兩種來源才驗得起來——Phase 7 的會員管理提供了這個能力。

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
預期：`ok`。若缺套件，先建立 `requirements.txt` 再 `pip install -r requirements.txt`

```bash
pytest --version
```
預期：有版本輸出

```bash
which docker
```
若無輸出代表本機未安裝 Docker CLI——**這不影響 Phase 0–10**，
但 Phase 11 只能做靜態檢查（確認設定檔內容正確），無法實際建置映像。
這個限制必須在該階段明確標示，不能假裝驗收通過。

### 常見錯誤

- 忘記 `conda activate flask`，結果 `pip install` 裝到 base 環境
- 用系統的 `python` 而非虛擬環境中的，導致套件找得到但版本不對

---

## Phase 1 — 專案骨架與入口

### 目的

建立可以被 Python 解析的專案入口，以及跨子系統共用的 helper。

### 產出檔案

| 檔案 | 說明 |
|------|------|
| `requirements.txt` | 五行，不釘選版本 |
| `utils.py` | `_gen_captcha`、`_is_usable`、`login_required` |
| `.gitignore`、`.gitattributes` | Python 專案的標準內容 |
| `.dockerignore` | 追加排除 `document/`、`rules/` 與測試 |
| `app.py` | 先只有 `/health`，Blueprint 隨階段逐一加入 |
| `blueprints/__init__.py` | 空檔案 |

`app.py` 的最終形態：

```python
import os

from flask import Flask

import db
from blueprints.admin import admin_bp
from blueprints.auth import auth_bp
from blueprints.equipment import equipment_bp
from blueprints.hub import hub_bp
from blueprints.profile import profile_bp

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')

app.register_blueprint(admin_bp)
app.register_blueprint(auth_bp)
app.register_blueprint(equipment_bp)
app.register_blueprint(hub_bp)
app.register_blueprint(profile_bp)


@app.route('/health')
def health():
    """健康檢查端點，回傳 200 OK。"""
    return 'OK', 200


if __name__ == '__main__':
    db.init_db()
    app.run(host='0.0.0.0', port=4000, debug=True)
```

### 關鍵決策

- **不使用 application factory。** 測試直接 `from app import app`，並以 `db.DB_PATH = ...` 替換資料庫路徑。
  引入 factory 會讓測試多一層 `create_app()`，對初學者是額外負擔。
- **`app.py` 不放 `setup/` 一次性種子機制。** B 專案用它植入示範資料然後刪除自己，
  結果是示範資料只存在於已編譯的 `database.db` 中、無法重現。
  本系統改為在 `db/` 內做可重複執行的種子函式（Phase 8）。
- `db.init_db()` **只在 `__main__` 分支呼叫**。import `app` 不應有副作用，否則測試會在 fixture 之外建立資料庫。

### 驗收

```bash
python -c "from app import app; print(app.name)"
```
預期：`app`（此時 Blueprint import 尚未存在，先只保留 `/health` 與 `Flask(__name__)`）

### 常見錯誤

- 在模組層級呼叫 `db.init_db()`，導致 import 就在專案根目錄產生 `database.db`
- `blueprints/__init__.py` 忘記建立，`from blueprints.auth import ...` 會失敗

---

## Phase 2 — 資料存取層（users）

### 目的

建立 `db/` 套件與使用者資料表，讓後續所有子系統都有可用的身分來源。

### 產出檔案

| 檔案 | 說明 |
|------|------|
| `db/connection.py` | `_get_conn()` |
| `db/users.py` | 十個公開函式 + `_seed_users_if_empty` |
| `db/__init__.py` | 移除 forum 的匯出，`init_db()` 先只建 `users` |

### 關鍵決策

**`_get_conn()` 內的延遲 import 不可改成模組層級的 import。**

```python
def _get_conn():
    from db import DB_PATH          # ← 必須留在函式內
```

若改成檔頭的 `from db import DB_PATH`，`DB_PATH` 會在 import 時綁定成當時的值，
測試替換 `db.DB_PATH` 就不會生效。整個測試隔離機制建立在這一行上。

**`list_users()` 與兩個單筆取得函式不過濾 `is_deleted`。**
這是 `rules/database.md` 明列的例外，docstring 必須標註，否則讀者會誤以為漏寫。

### 驗收

```bash
python -c "
import db
db.DB_PATH = '/tmp/t.db'
db.init_db()
print(db.find_user_by_email('admin@example.com')['role'])
print(db.list_users(1, 10)[1])
"
```
預期：`0` 與 `3`

```bash
python -c "
import bcrypt, db
db.DB_PATH = '/tmp/t.db'
u = db.find_user_by_email('user@example.com')
print(bcrypt.checkpw(b'password123', u['hash'].encode()))
"
```
預期：`True`

### 常見錯誤

- `db/__init__.py` 的 `from .users import ...` 放在 `DB_PATH = ...` 之前，
  造成循環 import。順序必須是先定義 `DB_PATH`，再 import 子模組（配 `# noqa: E402`）
- 忘記 `conn.close()`，WAL 檔會一直長大

---

## Phase 3 — 共用樣板與 CSS

### 目的

建立所有頁面共用的 HTML 骨架與顏色 token。

### 產出檔案

| 檔案 | 說明 |
|------|------|
| `templates/base.html` | 只改預設 `<title>` |
| `static/common.css` | 只有一個 `:root` token 區塊 |
| `static/login.css` | `button[type=submit]` 限定在 `.login-form` 內 |
| `static/hub.css`、`profile.css`、`admin.css` | |
| `static/equipment.css` | `eq-*` 前綴 |

### 關鍵決策

**`base.html` 無條件載入 `login.css`。**
這代表每個子系統的 CSS 都必須在開頭覆寫 `body` 的 flex 置中：

```css
body { display: block; background-color: #f0f2f5; font-family: Arial, sans-serif; }
```

看起來像重複，但它是 `base.html` 只有 14 行所付出的代價——
換取的是「任何一頁的 `<head>` 都可以只看那一頁就讀懂」。

**`base.html` 不放 nav 與 flash 區塊**，每一頁自行渲染（KI-11、KI-24）。

### 驗收

```bash
grep -c ":root" static/common.css      # 預期 1
grep -c "login-form" static/login.css  # 預期 > 0
ls static/                             # 預期六個 .css
```

### 常見錯誤

- 在子系統 CSS 中寫死按鍵色碼，而不是 `var(--btn-primary-bg)`
- 忘記在頁面的 `{% block head %}` 載入子系統 CSS，畫面會退化成純文字

---

## Phase 4 — auth 子系統

### 目的

建立身分驗證入口：登入、申請帳號、登出、圖形驗證碼。

### 產出檔案

| 檔案 |
|------|
| `blueprints/auth/__init__.py`、`CLAUDE.md` |
| `templates/auth/login.html` |
| `templates/auth/register.html` |

同時在 `app.py` 加入 `register_blueprint(auth_bp)`。

### 關鍵決策

**登入的驗證順序固定，不可調換**（規格書 §9.1）：
驗證碼空白 → 驗證碼錯誤 → 帳密空白 → 帳號或密碼錯誤 → 帳號已停用。

驗證碼放在最前面，是為了讓自動化嘗試在接觸資料庫之前就被擋下。
`is_deleted` 與「密碼錯誤」共用同一條訊息，避免洩漏 email 是否註冊過。

**表單錯誤用 `error` 樣板變數而非 `flash()`**，因為使用者需要看到自己剛才填的內容。
只有註冊成功（會 redirect 到另一頁）才用 `flash()`。

### 驗收

```bash
python -c "
import db; db.DB_PATH='/tmp/t4.db'; db.init_db()
from app import app
c = app.test_client()
print(c.get('/login').status_code)          # 200
with c.session_transaction() as s: s['captcha'] = 'ABCDE'
r = c.post('/login', data={'email':'admin@example.com','password':'admin1234','captcha':'abcde'})
print(r.status_code, r.headers.get('Location'))   # 302 /
"
```

驗證碼比對不分大小寫，因此小寫的 `abcde` 應該通過。

### 常見錯誤

- `<form>` 忘記 `class="login-form"`，送出按鈕沒有樣式
- 驗證碼比對忘記 `.strip().upper()`

---

## Phase 5 — hub 子系統

### 目的

建立服務入口首頁，同時提供訪客與已登入兩種模式。

### 產出檔案

| 檔案 |
|------|
| `blueprints/hub/__init__.py` |
| `blueprints/hub/CLAUDE.md` |
| `templates/hub/home.html` |

此階段先只放「個人資料」卡片；器材與管理卡片在 Phase 7、9 補上。

### 關鍵決策

**失效帳號在首頁不 redirect。** 清除 session 後以訪客視圖呈現：

```python
if not _is_usable(user):
    session.clear()
    user = None          # 不 redirect
```

首頁是唯一採取這種處置的頁面。理由是首頁本身沒有任何需要保護的內容，
把使用者踢到登入頁反而讓他無從理解發生了什麼事。

**內嵌登入是 `auth.login_page` 的完整複製**（KI-02）。這是刻意保留的技術債，
但必須在 `blueprints/hub/CLAUDE.md` 與規格書中明白標示。

### 驗收

```bash
python -c "
import db; db.DB_PATH='/tmp/t5.db'; db.init_db()
from app import app
c = app.test_client()
print('歡迎使用' in c.get('/').get_data(as_text=True))    # True
with c.session_transaction() as s: s['user_id']=1
print('歡迎回來' in c.get('/').get_data(as_text=True))    # True
db.soft_delete_user(1)
print('歡迎使用' in c.get('/').get_data(as_text=True))    # True（退回訪客視圖）
"
```

### 常見錯誤

- 把失效帳號改成 redirect，會造成登入頁與首頁互相導向的迴圈
- 卡片用 `<div onclick>` 而非 `<a href>`，鍵盤無法操作

---

## Phase 6 — profile 子系統

### 目的

讓使用者檢視與修改自己的姓名與顯示名稱。

### 產出檔案

| 檔案 |
|------|
| `blueprints/profile/__init__.py`、`CLAUDE.md` |
| `templates/profile/dashboard.html` |

### 關鍵決策

**`POST /profile/update` 刻意不加 `_is_usable` 檢查（KI-03）。**
`GET /profile` 有，`POST /profile/update` 沒有。這不是疏漏，是保留的教材。

實作時請務必抵抗「順手補上」的衝動——若補了，規格書第 11 章、
`document/profile.md`、`tests/test_profile.py` 三處都要同步更新，
而這個系統就少了一個很好的討論素材。

判準見規格書 §11.0：缺陷的影響是否外溢到當事人以外的人。
profile 只能改自己的姓名，因此保留；equipment 會扣減共用器材，因此修補（Phase 9）。

### 驗收

```bash
python -c "
import db; db.DB_PATH='/tmp/t6.db'; db.init_db()
from app import app
c = app.test_client()
with c.session_transaction() as s: s['user_id']=1
c.post('/profile/update', data={'name':'新名字','display_name':''})
u = db.find_user_by_id(1)
print(u['name'], u['display_name'])       # 新名字 None
"
```

空字串必須存成 `NULL`，不是空字串。

### 常見錯誤

- 忘記 `.strip() or None`，資料庫留下空字串
- 更新後直接 `render_template` 而非 redirect，重整會重複送出

---

## Phase 7 — admin 子系統

### 目的

建立會員管理，同時提供後續階段驗收所需的「停用帳號」能力。

### 產出檔案

| 檔案 |
|------|
| `blueprints/admin/__init__.py`、`CLAUDE.md` |
| `templates/admin/user_list.html`、`user_detail.html` |

同時在 `templates/hub/home.html` 補上「會員管理」卡片（`{% if user['role'] == 0 %}`）。

### 關鍵決策

**六個路由開頭的八行守門是明碼重複的，不抽象成裝飾器。**

```python
user = _current_user()
if not _is_usable(user):
    session.clear()
    return redirect(url_for('auth.login_page'))
if not _is_admin(user):
    flash('無操作權限', 'error')
    return redirect(url_for('hub.home'))
```

這個重複是刻意的：讀者從任一路由的第一行就能讀出完整的守門條件，
不需要跳到別的檔案去看裝飾器做了什麼。**請勿重構掉它。**

**存在性檢查排在權限檢查之後。** 若順序相反，非管理員可以藉由
「找不到該使用者」與「無操作權限」兩種訊息的差異，探測哪些 user_id 存在。

**自我保護規則 R1–R3**（不可停用／刪除自己、不可改自己的角色）保證系統中永遠至少有一個可用的管理員，
因此不實作管理員計數檢查。放寬任一條時必須立刻補上計數檢查。

### 驗收

```bash
python -c "
import db; db.DB_PATH='/tmp/t7.db'; db.init_db()
from app import app
c = app.test_client()
with c.session_transaction() as s: s['user_id']=2
# 一般使用者被擋
c2 = app.test_client()
with c2.session_transaction() as s: s['user_id']=1
r = c2.post('/admin/users/2/deactivate')
print(r.status_code, db.find_user_by_id(2)['is_active'])    # 302 1 ← DB 未變才算真的被擋
# 管理員不可停用自己
r = c.post('/admin/users/2/deactivate', follow_redirects=True)
print('不可停用自己的帳號' in r.get_data(as_text=True))       # True
# 管理員可停用他人
c.post('/admin/users/1/deactivate')
print(db.find_user_by_id(1)['is_active'])                    # 0
"
```

**被擋下的 POST 必須同時驗資料庫沒有改變。** 只驗 302 無法區分「被擋下」與「執行成功後 redirect」。

### 常見錯誤

- 把 `_is_admin` 放進 `utils.py`（規範明文禁止）
- 把三層檢查抽成裝飾器
- 操作成功後 redirect 帶回查詢字串——目前刻意不帶（KI-25），若要改需一併更新規格書

---

## Phase 8 — 資料存取層（equipment）

### 目的

建立器材與借用單的三張資料表，以及全部的狀態轉移與庫存邏輯。

### 產出檔案

| 檔案 | 說明 |
|------|------|
| `db/equipment.py` | 改為相對 import、補 docstring、新增種子函式 |
| `db/__init__.py` | 匯出 16 個 equipment 函式；`init_db()` 加入建表與種子 |
| `db/CLAUDE.md` | 完整欄位字典 |

三個容易漏掉的地方：

1. import 一律用相對形式：`from .connection import _get_conn`
2. 每個公開函式都要有 docstring
3. 種子器材由 `_SEED_EQUIPMENT` 與 `_seed_equipment_if_empty(conn)` 提供

### 關鍵決策

**四個函式使用 `with conn:` transaction，三個不用。**

| 需要 transaction | 理由 |
|-----------------|------|
| `create_borrow_order` | 主檔 INSERT 成功但明細失敗 → 沒有項目的借用單 |
| `update_borrow_order` | 舊明細標記刪除後、新明細寫入前失敗 → 同上 |
| `mark_order_borrowed` | 狀態改了但庫存沒扣 → 庫存與實況不符 |
| `mark_order_returned` | 狀態改了但庫存沒還 → 器材永久少一份 |

`cancel_order` / `approve_order` / `reject_order` 只更新兩張狀態表、不觸碰庫存，
沿用 B 的 `conn.commit()` 寫法（KI-05）。這個對照本身就是教材：
讓學生思考「什麼時候真的需要 transaction」。

**庫存的三道防線**（缺一不可）：

```python
# 1. 預檢迴圈——真正決定成敗的地方
for item in items:
    if item['quantity'] > item['available_quantity']:
        conn.close()
        return False

# 2. UPDATE 的 WHERE 條件——最後一道保險
"UPDATE equipment SET available_quantity = available_quantity - ? "
"WHERE id = ? AND available_quantity >= ?"

# 3. 歸還時的上限夾制——避免重複歸還把庫存灌大
"SET available_quantity = MIN(available_quantity + ?, total_quantity)"
```

注意第 2 道防線單獨存在時是不夠的：若它擋下 UPDATE，借用單仍會被改成 `borrowed`，
造成「狀態說借出了、庫存卻沒動」。真正防止這個組合的是第 1 道預檢。

**種子器材必須涵蓋三種狀態與 `available_quantity = 0` 的情形**，
否則後續階段沒有辦法在瀏覽器上驗到「狀態」與「數量」是兩個獨立條件。

**借用單不植入種子資料**：借用流程涉及狀態轉移與庫存扣減，
硬塞一批單會與 `available_quantity` 不一致，反而製造出一個從一開始就對不上帳的資料庫。

### 驗收

```bash
python -c "
import db; db.DB_PATH='/tmp/t8.db'; db.init_db()
items, total = db.list_equipment(1, 50)
print(total)                                   # 8
eq = db.get_equipment(1)
print(eq['equipment_name'], eq['available_quantity'])
o = db.create_borrow_order(1, '2099-01-01 09:00:00', '2099-01-02 18:00:00', '測試', [(1, 2)])
print(db.get_borrow_order(o)['order_status'])  # pending
print(db.get_equipment(1)['available_quantity'])  # 5 ← 送出申請不扣庫存
print(db.approve_order(o, 2, None))            # True
print(db.get_equipment(1)['available_quantity'])  # 5 ← 核准也不扣
print(db.mark_order_borrowed(o))               # True
print(db.get_equipment(1)['available_quantity'])  # 3 ← 登記借出才扣
print(db.mark_order_returned(o))               # True
print(db.get_equipment(1)['available_quantity'])  # 5
print(db.mark_order_returned(o))               # False ← 狀態不符，不會重複加回
"
```

庫存不為負的驗收：

```bash
python -c "
import db; db.DB_PATH='/tmp/t8b.db'; db.init_db()
e = db.create_equipment('限量', 'LTD-001', None, 1, 1, 'available')
a = db.create_borrow_order(1,'2099-01-01 09:00:00','2099-01-02 18:00:00','A',[(e,1)])
b = db.create_borrow_order(1,'2099-01-01 09:00:00','2099-01-02 18:00:00','B',[(e,1)])
print(db.approve_order(a,2,None), db.approve_order(b,2,None))   # True True ← 核准不保留庫存
print(db.mark_order_borrowed(a), db.mark_order_borrowed(b))     # True False
print(db.get_equipment(e)['available_quantity'])                # 0，不是 -1
"
```

這段輸出就是 KI-10 的完整示範，值得在課堂上逐行走一次。

### 常見錯誤

- 忘記把 `from db.connection` 改成 `from .connection`，在某些執行方式下會 import 失敗
- 在 `db/__init__.py` 中把 `_seed_equipment_if_empty` 放在 `_seed_users_if_empty` 之前——
  目前器材不參照使用者，順序無妨，但若日後加入種子借用單就會出錯，維持既有順序較安全
- 只加第 2 道防線（`WHERE available_quantity >= ?`）而省略預檢迴圈

---

## Phase 9 — equipment 子系統

### 目的

建立器材借用的完整流程：瀏覽、申請、修改、取消、審核、登記借出與歸還。

### 產出檔案

| 檔案 | 說明 |
|------|------|
| `blueprints/equipment/__init__.py` | 守門邏輯調整（見下） |
| `blueprints/equipment/CLAUDE.md` | |
| `templates/equipment/*.html`（7 個） | topbar 加「返回首頁」 |

同時：

- `app.py` 加入 `register_blueprint(equipment_bp)`
- `templates/hub/home.html` 補上「器材借用」「我的借用紀錄」「借用單管理」三張卡片

### 關鍵決策

**守門邏輯不可只查資料庫。** 下面這種只查 id、不檢查帳號有效性的寫法是錯的：

```python
# 不要這樣寫
def _current_user():
    if 'user_id' in session:
        return db.find_user_by_id(session['user_id'])
    return None
```

這代表被停用的帳號只要 session 未清，仍可送出借用申請並佔用審核流程，最終扣減共用器材，
使 admin 的停用功能形同虛設。本系統改為：

```python
def _current_user():
    if 'user_id' not in session:
        return None
    user = db.find_user_by_id(session['user_id'])
    return user if _is_usable(user) else None
```

並在每個寫入類路由開頭補上：

```python
user = _current_user()
if user is None:
    session.clear()
    return redirect(url_for('auth.login_page'))
```

**`session.clear()` 不放進 `_current_user()`。** 訪客與失效帳號在它眼中都是 `None`，
但只有後者需要清 session。要區分兩者，helper 就得回傳多種狀態，複雜度會失控。

**`borrow()` 移除 B 版本的「帳號已停用」flash 分支**，改由第 2 層統一處理。
理由是規格書 §4.3：身分失效的處置是登出，而不是留在原頁看提示。

**狀態機同時存在於三個地方**，改任何一處都要檢查另外兩處：

1. 資料欄位 `order_status`（規格書 §6.4 的允許轉移表）
2. `db/equipment.py` 各函式開頭的 `WHERE ... AND order_status = ...`
3. `admin_orders.html` 的 `{% if order['order_status'] == ... %}` 按鈕分支

**`overdue` 保留但不實作寫入**（KI-01）。標籤、按鈕、`mark_order_returned` 的來源狀態都支援它，
就是沒有任何程式碼會寫入。這是刻意留下的練習題。

### 驗收

瀏覽與權限：

```bash
python -c "
import db; db.DB_PATH='/tmp/t9.db'; db.init_db()
from app import app
c = app.test_client()
print(c.get('/equipment/').status_code)              # 200（訪客可瀏覽）
print(c.get('/equipment/new').status_code)           # 302（未登入）
with c.session_transaction() as s: s['user_id']=1
r = c.get('/equipment/new'); print(r.status_code)    # 302（非管理員）
"
```

守門修正的驗收（這是本階段最重要的一項）：

```bash
python -c "
import db; db.DB_PATH='/tmp/t9b.db'; db.init_db()
from app import app
c = app.test_client()
with c.session_transaction() as s: s['user_id']=1

# 先確認正常狀態可以借
r = c.post('/equipment/1/borrow', data={'quantity':'1',
    'borrow_start_at':'2099-06-01T09:00','borrow_end_at':'2099-06-02T18:00',
    'borrow_reason':'正常'})
print(len(db.list_my_orders(1)))            # 1

# 管理員停用 id=1
db.set_user_active(1, 0)

# 同一個 client（session 未清）再次嘗試借用：應被擋下且導回登入
r = c.post('/equipment/1/borrow', data={'quantity':'1',
    'borrow_start_at':'2099-06-01T09:00','borrow_end_at':'2099-06-02T18:00',
    'borrow_reason':'停用後'})
print(r.status_code, '/login' in r.headers['Location'])   # 302 True
print(len(db.list_my_orders(1)))            # 仍是 1 ← DB 未變才算真的被擋

# 但瀏覽仍然可以，且以訪客身分呈現
c2 = app.test_client()
with c2.session_transaction() as s: s['user_id']=1
print(c2.get('/equipment/').status_code)    # 200
"
```

完整借用流程（在瀏覽器中執行一次）：

1. 以 `user@example.com` 登入 → 首頁 → 器材借用 → 點「單槍投影機」
2. 申請借用，數量 2，用途隨意 → 應導向借用單詳細，狀態「待審核」
3. 登出，以 `admin@example.com` 登入 → 首頁 → 借用單管理
4. 按「核准」，輸入備註 → 狀態變「已核准」；**回到器材頁確認可借數量仍是 5**
5. 按「登記借出」→ 狀態變「已借出」；**可借數量變 3**
6. 按「登記歸還」→ 狀態變「已歸還」；**可借數量回到 5**

第 4 步的「可借數量仍是 5」是最容易被誤解的一步，請務必實際確認。

### 常見錯誤

- `_current_user()` 漏了 `_is_usable` 檢查
- `borrow()` 用「帳號已停用」flash 草草擋下失效帳號，與第 2 層守門形成兩套處置
- 模板新增狀態時只加了中文標籤、忘了加 CSS class（兩者不共用同一份字串）
- `strict_slashes=False` 漏掉，`/equipment` 會 308 到 `/equipment/`

---

## Phase 10 — 測試

### 目的

以 pytest 覆蓋全部五個子系統，並建立測試收集範圍的設定。

### 產出檔案

| 檔案 | 說明 |
|------|------|
| `tests/__init__.py`、`data/__init__.py` | 空檔案 |
| `tests/conftest.py` | 五個 fixture |
| `tests/data/users.py` | `MESSAGES` 增加 equipment 區塊 |
| `tests/test_auth.py`、`test_profile.py`、`test_admin.py` | |
| `tests/test_hub.py` | 論壇斷言改為器材斷言 |
| `tests/test_equipment.py` | 30 → 52 個 |
| `tests/CLAUDE.md` | |
| `pytest.ini` | 限定 `testpaths` |

`pytest.ini`：

```ini
[pytest]
testpaths = tests
norecursedirs = .git __pycache__
```

**這個檔案限定收集範圍**：pytest 只走進本系統的 `tests/`，不會誤收其他目錄下
同名的 `conftest.py` 而產生 `ImportPathMismatchError`。

### 關鍵決策

**`other_client`（id=3，停用帳號）在器材測試中的兩種用法必須分清楚：**

```python
# 用法一：測「他人」的權限邊界 → 必須先啟用，否則會被第 2 層先攔下
def test_order_detail_other_user_redirect(other_client, borrow_order):
    db.set_user_active(3, 1)
    ...

# 用法二：測「停用帳號」的守門 → 直接使用，不啟用
def test_borrow_disabled_user_redirects_to_login(other_client, equipment):
    ...
```

漏掉 `set_user_active(3, 1)` 時測試仍會通過（都是 302），但測到的是完全不同的那一層。

**庫存不足的測試要拆成兩條。** 「先讓第一張單借出、再核准第二張」這種寫法，
實際上 `approve_order` 會重新檢查庫存而回傳 `False`；若沒有斷言回傳值就看不出來。
本系統拆成兩個測試：

- `test_approve_rechecks_stock_after_borrowed` — 庫存借光後核准失敗
- `test_available_quantity_not_below_zero` — 兩張都先核准，第二張在登記借出時才失敗

**三條硬性規則**（見 `tests/CLAUDE.md`）：

1. 被權限擋下的 POST 必須同時斷言資料庫沒有改變
2. 涉及庫存的操作必須同時斷言 `available_quantity`
3. 數量斷言一律用相對式，不寫死絕對值

### 驗收

```bash
pytest -q
```
預期：`125 passed`

```bash
pytest --collect-only -q | grep "::" | sed 's/::.*//' | sort | uniq -c
```
預期：

```
  30 tests/test_admin.py
  23 tests/test_auth.py
  52 tests/test_equipment.py
  12 tests/test_hub.py
   8 tests/test_profile.py
```

### 常見錯誤

- 忘記建立 `pytest.ini`，收集階段直接失敗
- 在同一個測試中同時請求 `authed_client` 與 `admin_client`——它們都由 `client` 衍生，
  拿到的是**同一個物件**。需要第二個乾淨 client 時，請求 `app` fixture 後自行 `app.test_client()`
- 借用時間用當年的日期，日後加入「開始時間須在未來」的規則時會全部失效（一律用 2099）

---

## Phase 11 — Docker 與文件

### 目的

容器化設定與全套文件。

### 產出檔案

| 檔案 |
|------|
| `Dockerfile`、`docker-compose.yml` |
| `CLAUDE.md` |
| `README.md` |
| `rules/flask-blueprint.md`、`database.md` |
| `document/system-spec.md`、`build-guide.md` |
| `document/auth.md`、`profile.md`、`admin.md` |
| `document/hub.md`、`equipment.md` |
| `blueprints/*/CLAUDE.md`、`db/CLAUDE.md`、`tests/CLAUDE.md` |

### 關鍵決策

**資料庫放在 named volume。** `docker-compose.yml` 以 `DB_PATH=/app/data/database.db`
搭配 `db_data:/app/data`，讓 `docker compose down` 不會清掉資料，`down -v` 才會。

**`.dockerignore` 必須排除 `tests/`、`document/`、`rules/` 與 `database.db`**，
否則映像會膨脹，而且會把開發用的資料庫一起打包進去。

### 驗收

無 Docker 環境時只能做靜態檢查：

```bash
grep -n "DB_PATH" docker-compose.yml       # 應指向 /app/data/database.db
grep -n "db_data" docker-compose.yml       # 應同時出現在 volumes 與 services
cat .dockerignore                          # 應含 tests/、document/、rules/
```

有 Docker 環境時：

```bash
docker compose up -d --build
curl -s localhost:4000/health              # OK
# 在瀏覽器申請一個新帳號
docker compose down && docker compose up -d
# 該帳號應仍然存在（named volume 有保住資料）
docker compose down -v && docker compose up -d
# 該帳號應消失（資料被清除）
```

文件的驗收方式是**交叉檢查**：

```bash
# 路由總表的數量要與實際一致
python -c "
from app import app
n = len([r for r in app.url_map.iter_rules() if r.endpoint != 'static'])
print(n)     # 應為 28，與 CLAUDE.md 及規格書 §7 相符
"
```

### 常見錯誤

- `CLAUDE.md` 的路由總表與實際路由不同步（新增路由時最常漏的一份文件）
- 技術債編號在多份文件間對不上——KI 編號一旦發布就不再變動，
  作廢的項目保留編號並註記，不重新編排

---

## Phase 12 — 最終整合驗收

### 目的

確認整個系統在真實操作下的一致性。

### 驗收清單

**1. 全套測試**

```bash
pytest -q                      # 125 passed
```

**2. 全新資料庫可啟動**

```bash
rm -f database.db database.db-wal database.db-shm
python app.py &
sleep 2
curl -s localhost:4000/health  # OK
```

**3. 所有頁面可渲染**

```bash
python -c "
import db; db.DB_PATH='/tmp/t12.db'; db.init_db()
from app import app
c = app.test_client()
for u in ['/', '/login', '/register', '/equipment/', '/equipment/?id=1', '/health']:
    print(u, c.get(u).status_code)
with c.session_transaction() as s: s['user_id']=2
for u in ['/', '/profile', '/admin/users', '/equipment/new',
          '/equipment/admin/orders', '/equipment/my-orders', '/equipment/1/borrow']:
    print(u, c.get(u).status_code)
"
```
預期：全部 200

**4. 停用帳號的跨子系統一致性**（本系統最重要的整合驗收）

```bash
python -c "
import db; db.DB_PATH='/tmp/t12b.db'; db.init_db()
from app import app

# 停用 id=1，然後用一個 session 未清的 client 逐一嘗試
db.set_user_active(1, 0)

def fresh():
    c = app.test_client()
    with c.session_transaction() as s: s['user_id']=1
    return c

# equipment 寫入：應被擋下
r = fresh().post('/equipment/1/borrow', data={'quantity':'1',
    'borrow_start_at':'2099-06-01T09:00','borrow_end_at':'2099-06-02T18:00',
    'borrow_reason':'x'})
print('equipment borrow:', r.status_code, '/login' in r.headers['Location'])

# equipment 瀏覽：應仍可讀，且以訪客身分
print('equipment index:', fresh().get('/equipment/').status_code)

# profile GET：應被擋下
r = fresh().get('/profile')
print('profile GET:', r.status_code, '/login' in r.headers['Location'])

# profile POST：應**成功**（KI-03，刻意保留）
fresh().post('/profile/update', data={'name':'停用後仍可改'})
print('profile POST:', db.find_user_by_id(1)['name'])
"
```

最後一行印出 `停用後仍可改` **才是正確的**——它證明 KI-03 仍如規格書所述地存在。
若印出別的值，代表有人「順手修好了」，必須同步更新規格書第 11 章與 `document/profile.md`。

**5. 借用流程的庫存一致性**

在瀏覽器中完整走一次 Phase 9 驗收的六個步驟，特別確認第 4 步（核准後庫存不變）。

**6. 文件一致性**

- `CLAUDE.md` 的路由總表 = 實際路由（28 條）
- `CLAUDE.md` 與 `tests/CLAUDE.md` 的測試數量 = `pytest --collect-only` 的結果
- 規格書 §9 的訊息字串 = Blueprint 中的字串 = `tests/data/users.py` 的 `MESSAGES`
- 規格書 §11 的 KI 編號 = `CLAUDE.md` 與各 `CLAUDE.md` 中引用的編號

### 完成標準

以上六項全部通過，且 `git status` 中沒有未追蹤的必要檔案。

---

## 附錄：完整檔案清單

```
SAD-Equipment/
├── .dockerignore            .gitattributes         .gitignore
├── CLAUDE.md                README.md
├── Dockerfile               docker-compose.yml
├── app.py                   utils.py               requirements.txt
├── pytest.ini
├── .claude/settings.json
├── blueprints/
│   ├── __init__.py
│   ├── admin/{__init__.py, CLAUDE.md}
│   ├── auth/{__init__.py, CLAUDE.md}
│   ├── equipment/{__init__.py, CLAUDE.md}
│   ├── hub/{__init__.py, CLAUDE.md}
│   └── profile/{__init__.py, CLAUDE.md}
├── db/
│   └── {__init__.py, connection.py, users.py, equipment.py, CLAUDE.md}
├── templates/
│   ├── base.html
│   ├── admin/{user_list.html, user_detail.html}
│   ├── auth/{login.html, register.html}
│   ├── equipment/{index.html, equipment_form.html, borrow_form.html,
│   │              my_orders.html, order_detail.html, edit_order_form.html,
│   │              admin_orders.html}
│   ├── hub/home.html
│   └── profile/dashboard.html
├── static/
│   └── {common.css, login.css, hub.css, profile.css, admin.css, equipment.css}
├── rules/
│   └── {flask-blueprint.md, database.md}
├── document/
│   └── {system-spec.md, build-guide.md, auth.md, hub.md, profile.md,
│         admin.md, equipment.md}
└── tests/
    ├── {__init__.py, conftest.py, CLAUDE.md}
    ├── data/{__init__.py, users.py}
    └── {test_auth.py, test_hub.py, test_profile.py, test_admin.py,
          test_equipment.py}
```
