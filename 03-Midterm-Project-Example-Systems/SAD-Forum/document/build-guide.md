# 會員管理系統 — 建置流程書

## 0. 文件資訊

| 項目 | 內容 |
|------|------|
| 文件名稱 | 會員管理系統 建置流程書 |
| 版本 | v1.0 |
| 日期 | 2026-08-08 |
| 上位依據 | [`document/system-spec.md`](system-spec.md) |
| 適用對象 | 要把這個系統從無到有建起來的人 |

### 0.1 這份文件是什麼

系統規格書說明「系統是什麼」，這份文件說明「怎麼把它建出來」。

流程分為 **13 個階段**，每個階段都是一個可以獨立完成、獨立驗收的單位。階段之間有明確的相依順序，不建議跳著做——後面的階段預設前面的產出已經存在且驗收通過。

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

`Course-SAD-Sample-System` 是本專案的教學範本，以下所有「從範本複製」的指示，來源都是它。

> **範本已於建置完成後從本 repo 移除。** 若要重跑本流程書，先取得範本：
>
> ```bash
> git clone https://github.com/billy1125/Course-SAD-Sample-System.git
> ```
>
> 並在完成後刪除它——留著會讓 `pytest` 同時收集兩套 `tests/conftest.py`，
> 產生 `ImportPathMismatchError` 而無法執行任何測試。

### 0.3 專案根目錄的現況

開始前，專案根目錄應該有：

```text
sad-user-management/
├── CLAUDE.md                     # 已改寫為只涵蓋本系統的版本
├── requirements.txt              # flask / bcrypt / captcha / pytest / pytest-flask
└── document/
    ├── system-spec.md
    └── build-guide.md            # 本文件
```

### 0.4 階段總覽

| Phase | 名稱 | 主要產出 | 相依 |
|:--:|------|---------|------|
| 0 | 環境準備 | 無（僅檢查） | — |
| 1 | 專案骨架與入口 | `app.py`、`utils.py`、設定檔 | 0 |
| 2 | 資料存取層 | `db/` 套件（三個資料模組） | 1 |
| 3 | 共用樣板與 CSS | `base.html`、三個 CSS | 1 |
| 4 | auth 子系統 | 登入、註冊、驗證碼 | 2、3 |
| 5 | hub 子系統 | 首頁 | 4 |
| 6 | profile 子系統 | 個人資料 | 4、5 |
| 7 | admin 子系統 | 會員管理 | 2、6 |
| **8** | **forum 子系統** | **論壇（主檔／明細）** | **2、5** |
| 9 | CSS 一致性稽核 | 無（僅檢查修正） | 3–8 |
| 10 | 測試 | `tests/` 全套 | 8 |
| 11 | Docker | 容器化設定 | 10 |
| 12 | 文件 | `CLAUDE.md`、`rules/`、`document/` | 10 |
| 13 | 最終整合驗收 | 無（僅檢查） | 全部 |

> Phase 8（forum）排在 admin 之後，是因為論壇的守門修正必須有停用帳號的來源才驗得起來——Phase 7 的會員管理提供了這個能力。若只想先看到論壇跑起來，也可以把 Phase 8 提前到 Phase 6 之後，但守門的驗收要延後。

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
預期：`Python 3.11.15`（或其他 3.11.x）

```bash
python -c "import flask, bcrypt, captcha, pytest; print('ok')"
```
預期：`ok`。若缺套件，執行 `pip install -r requirements.txt`

```bash
pytest --version
```
預期：有版本輸出

```bash
which docker
```
預期：**無輸出**。本機目前未安裝 Docker CLI

```bash
ls /Users/chohsunlu/Documents/GitHub/sad-user-management/
```
預期：至少看到 `CLAUDE.md`、`requirements.txt`、`document/`，以及重新 clone 下來的範本目錄

### 關鍵決策記錄

**Docker CLI 未安裝。** 這代表 Phase 10 只能做靜態檢查（確認設定檔內容正確），無法實際建置映像與啟動容器。這個限制必須在 Phase 10 中明確標示，不能假裝驗收通過。取得 Docker 環境後應回頭補跑該階段的動態驗收。

### 常見錯誤

- 忘記 `conda activate flask`，結果 `pip install` 裝到 base 環境
- 用系統的 `python` 而非 conda 環境中的，導致套件找得到但版本不對

---

## Phase 1 — 專案骨架與入口

### 目的

建立可以被 Python 解析的專案入口，以及跨子系統共用的 helper。

### 產出檔案

| 檔案 | 來源 | 動作 |
|------|------|------|
| `app.py` | 範本 | **修改後複製** |
| `utils.py` | 範本 | 原樣複製 |
| `blueprints/__init__.py` | 範本 | 原樣複製（空檔） |
| `.gitignore` | 範本 | 原樣複製 |
| `.gitattributes` | 範本 | 原樣複製 |
| `.dockerignore` | 範本 | 原樣複製 |
| `.claude/settings.json` | 範本 | 原樣複製 |

### `app.py` 的修改內容

範本的 `app.py` 有 37 行，改後約 25 行。三處修改：

**1. Blueprint import 從 6 個減為 5 個**

刪除這兩行：

```python
from blueprints.equipment import equipment_bp
from blueprints.events import events_bp
```

保留 `auth_bp`、`hub_bp`、`profile_bp`、`forum_bp`，並在 Phase 7 時加入 `admin_bp`。

> 註冊順序不影響行為。但建議依 `admin`、`auth`、`forum`、`hub`、`profile` 的字母序排列，與範本的慣例一致。

**2. `register_blueprint` 同步從 6 條減為 5 條**

刪除 `equipment_bp` 與 `events_bp` 兩行的註冊，保留 `forum_bp`。

**3. 移除 `setup/` 一次性種子機制**

範本的啟動區塊是：

```python
if __name__ == '__main__':
    db.init_db()
    if os.path.isdir('setup'):
        from setup import seed as _setup_seed
        _setup_seed.run()
        shutil.rmtree('setup')
    app.run(host='0.0.0.0', port=4000, debug=True)
```

中間三行連同 `import shutil` 一併刪除。這個機制的用途是植入論壇文章與活動報名的模擬資料，本系統沒有對應的資料表，留著只是死碼。改後：

```python
if __name__ == '__main__':
    db.init_db()
    app.run(host='0.0.0.0', port=4000, debug=True)
```

**保留不動的部分：** `app.secret_key` 那一行、`GET /health` 路由、`app.run` 的參數。這三項都帶有已知技術債（KI-05、KI-16、KI-24），但依「沿用範本技術債」的原則保留。

### 驗收

```bash
python -c "import ast; ast.parse(open('app.py').read()); print('syntax ok')"
```
預期：`syntax ok`

此時 Blueprint 目錄尚未建立，**無法實際 import 或啟動**，只能做語法檢查。

```bash
grep -c "register_blueprint" app.py
```
預期：`4`（admin 在 Phase 7 才加入）

```bash
grep -c "shutil\|setup" app.py
```
預期：`0`

### 常見錯誤

- 刪了 `import shutil` 卻忘記刪 `shutil.rmtree('setup')`，或反過來
- 忘記 `blueprints/__init__.py`，導致 `blueprints` 不被視為套件

---

## Phase 2 — 資料存取層

### 目的

建立唯一的資料表 `users`，以及所有存取它的函式。這是後續所有階段的基礎。

### 產出檔案

| 檔案 | 來源 | 動作 |
|------|------|------|
| `db/__init__.py` | 範本 | **修改後複製** |
| `db/connection.py` | 範本 | 原樣複製 |
| `db/users.py` | 範本 | **修改後複製**（新增三個函式） |
| `db/forum.py` | 範本 | **原樣複製**（整份 172 行不動一個字） |
| `db/CLAUDE.md` | 範本 | **改寫** |

### `db/forum.py` 的修改內容

**主體零修改。** 兩張表的 DDL、十個公開函式、三處 transaction 全部原樣搬移——這個模組對其他子系統零耦合，只 import `_get_conn`，唯一與 `users` 的接觸是查詢時的 `LEFT JOIN users`，那是純 SQL。

**唯一新增的是 `_seed_forum_if_empty(conn)` 與它的 `_SEED_POSTS` 常數。** 結構與 `db/users.py` 的 `_seed_users_if_empty` 完全對稱：數一次 `forum` 表，有資料就 return，空的才植入。

五篇種子文章的設計見規格書 §6.4.1。實作上有兩個要點：

1. **時間戳必須明確指定**，用 `datetime('now', '-N minutes')` 而非欄位預設值。全部在同一秒內建立時 `updated_at` 會相同，列表排序不確定，看不出「有新回覆的文章會浮上來」
2. **不能用 `create_forum_master()` 等公開函式**——它們各自呼叫 `_get_conn()` 開新連線，而種子函式必須共用 `init_db()` 傳進來的 conn。這與 `_seed_users_if_empty` 直接寫 INSERT 的理由相同

### `db/forum.py` 的主體為什麼零修改

這是本次抽取中唯一主體原樣搬移的資料模組。它對其他子系統零耦合——只 import `_get_conn`，兩張表的 DDL 自包含，十個公開函式全部只操作 `forum` 與 `forum_details`。唯一與 `users` 的接觸是查詢時的 `LEFT JOIN users u ON u.id = ...`，那是純 SQL，不需要 import 任何東西。

論壇的缺陷全部在控制層（`blueprints/forum/__init__.py`），資料層是乾淨的。這個對比值得在課堂上指出。

### `db/__init__.py` 的修改內容

**1. 移除兩組 re-export**

刪除 `from .events import (...)` 與 `from .equipment import (...)` 兩整段，**保留 `from .forum import (...)` 那一段十個函式的匯出**。

**2. users 的 import 清單追加三個新函式**

```python
from .users import (           # noqa: E402
    find_user_by_email,
    find_user_by_id,
    create_user,
    update_user_profile,
    update_last_login,
    soft_delete_user,
    hard_delete_user_by_email,
    list_users,          # 新增
    set_user_active,     # 新增
    set_user_role,       # 新增
)
```

**3. `init_db()` 移除兩個建表呼叫、新增一個種子呼叫**

刪除 `from .events import _init_event_tables` 與 `from .equipment import _init_equipment_tables` 兩行 late-import，以及 `_init_event_tables(conn)`、`_init_equipment_tables(conn)` 兩行呼叫。**保留** `from .forum import _init_forum_tables` 與 `_init_forum_tables(conn)`。

同時 import 並呼叫 `_seed_forum_if_empty`。改後的 `init_db()` 依序做：

```
建立 users 表 → commit() → _init_forum_tables(conn)
             → _seed_users_if_empty(conn) → _seed_forum_if_empty(conn) → close()
```

**順序不可調換，有兩個理由：**

- 所有種子必須在所有建表之後。它們與建表共用同一個 `conn`，夾在中間雖然也能跑，但會讓讀者誤以為兩者有依賴關係
- **`_seed_forum_if_empty` 必須在 `_seed_users_if_empty` 之後**——種子文章的 `user_id` 指向那三個帳號。順序反過來不會報錯（沒有外鍵約束），但會產生指向不存在使用者的文章，作者欄一片空白

**users 表的 DDL 原樣保留，一個字都不改。** 完整內容見系統規格書 §6.2；`forum` 與 `forum_details` 的 DDL 見 §6.7，它們在 `db/forum.py` 內，本階段不需要動。

**`DB_PATH` 的定義與其上方的兩行註解也原樣保留。** 那段註解說明了測試如何動態替換路徑，是理解 §10.5 可測試性的關鍵。

### `db/users.py` 新增的三個函式

依 `rules/database.md` 的慣例撰寫：每個函式自行 `_get_conn()` 與 `close()`；查詢用 `?` 參數化；分頁回傳 `(items, total)`；寫入回傳 `None`。

**`list_users(page, page_size, status='all', keyword=None)`**

- SELECT 的欄位清單與 `find_user_by_id` **完全一致**（9 欄，不含 `hash`）
- 依 `status` 組裝條件：
  - `'all'` — 不加狀態條件
  - `'active'` — `is_deleted = 0 AND is_active = 1`
  - `'disabled'` — `is_deleted = 0 AND is_active = 0`
  - `'deleted'` — `is_deleted = 1`
  - 其他值視同 `'all'`
- `keyword` 非空時追加 `AND (email LIKE ? OR name LIKE ? OR display_name LIKE ?)`，三個參數皆為 `f'%{keyword}%'`
- `ORDER BY id`、`LIMIT ? OFFSET ?`，`offset = (page - 1) * page_size`
- `total` 以**相同的 WHERE 條件**另跑一次 `SELECT COUNT(*)`
- 回傳 `(rows, total)`

docstring 必須明確標註「本函式刻意不強制 `is_deleted = 0` 的過濾」及其理由，否則讀者會以為這是漏寫。

**`set_user_active(user_id, is_active)`** — `UPDATE users SET is_active = ? WHERE id = ?`，回傳 `None`

**`set_user_role(user_id, role)`** — `UPDATE users SET role = ? WHERE id = ?`，回傳 `None`

### 關鍵決策

**不建立 `db/admin.py`。** `rules/database.md` 規定「新子系統的資料存取邏輯建立新模組」，但該規則的前提是新子系統有自己的資料表。會員管理操作的對象仍是 `users` 表，因此三個新函式放進 `db/users.py`，維持「一張表對應一個 `db/` 模組」這個更根本的原則。

這個例外必須在 Phase 11 同步寫進 `rules/database.md`，否則規範與實作會互相矛盾。

### 驗收

```bash
python -c "
import db
db.DB_PATH = '/tmp/sadchk.db'
db.init_db()
rows, total = db.list_users(1, 10, 'all')
print(total, [r['email'] for r in rows])
print(db.list_users(1, 10, 'active')[1], db.list_users(1, 10, 'disabled')[1])
"
```
預期：
```text
3 ['user@example.com', 'admin@example.com', 'disabled@example.com']
2 1
```

```bash
python -c "
import db
db.DB_PATH = '/tmp/sadchk2.db'
db.init_db()
db.set_user_active(1, 0)
print('disabled after set:', db.list_users(1, 10, 'disabled')[1])
db.set_user_role(1, 0)
print('role of id=1:', db.find_user_by_id(1)['role'])
db.soft_delete_user(1)
print('deleted:', db.list_users(1, 10, 'deleted')[1])
print('active:', db.list_users(1, 10, 'active')[1])
"
```
預期：
```text
disabled after set: 2
role of id=1: 0
deleted: 1
active: 1
```

最後一行說明：id=1 被軟刪除後，`active` 篩選只剩 admin 一人（id=3 是停用狀態，不算 active）。

```bash
python -c "
import db
db.DB_PATH = '/tmp/sadchk3.db'
db.init_db()
print(db.list_users(1, 10, 'all', 'admin')[1])
print(db.list_users(1, 10, 'all', '一般')[1])
"
```
預期：`1` 與 `1`（第一個以 email 命中，第二個以 name 命中）

**論壇資料層驗收**——這一組同時驗證兩張表都建起來了、transaction 正確、級聯正確：

```bash
python -c "
import db
db.DB_PATH = '/tmp/sadchk4.db'
db.init_db()

mid = db.create_forum_master('第一篇', '這是內文', 1)
print('master_id       :', mid)
print('list total      :', db.list_forum_masters(1, 10)[1])
print('details count   :', len(db.list_forum_details(mid)))
print('is_original_post:', db.list_forum_details(mid)[0]['is_original_post'])
print('user_display    :', db.list_forum_details(mid)[0]['user_display'])

db.create_forum_detail(mid, '這是回覆', 2)
print('after reply     :', len(db.list_forum_details(mid)))

db.soft_delete_forum_master(mid)
print('after delete    :', db.list_forum_masters(1, 10)[1], len(db.list_forum_details(mid)))
"
```
預期：
```text
master_id       : 1
list total      : 1
details count   : 1
is_original_post: 1
user_display    : 一般使用者
after reply     : 2
after delete    : 0 0
```

最後一行是**級聯的關鍵驗證**：刪除主檔之後，主檔列表為 0 筆，該篇的明細也是 0 筆。若明細仍是 2，代表 `soft_delete_forum_master()` 的第二個 UPDATE 沒有執行——transaction 寫錯了。

再驗一次 transaction 的原子性與排序行為：

```bash
python -c "
import db
db.DB_PATH = '/tmp/sadchk5.db'
db.init_db()
a = db.create_forum_master('A 文', '內文 A', 1)
b = db.create_forum_master('B 文', '內文 B', 1)
print('order before reply:', [m['title'] for m in db.list_forum_masters(1, 10)[0]])
db.create_forum_detail(a, '推 A', 2)
print('order after  reply:', [m['title'] for m in db.list_forum_masters(1, 10)[0]])
"
```
預期：
```text
order before reply: ['B 文', 'A 文']
order after  reply: ['A 文', 'B 文']
```

A 文因為有了新回覆而浮到最上面，證明 `create_forum_detail()` 確實在同一個 transaction 中更新了主檔的 `updated_at`。

> 若兩行輸出相同，多半是兩篇文章在同一秒內建立，`datetime('now')` 的精度只到秒，排序因此不穩定。在兩個 `create_forum_master` 之間加一行 `import time; time.sleep(1.1)` 再試。

**種子文章驗收**——確認五篇文章、排序、以及冪等性：

```bash
python -c "
import db
db.DB_PATH = '/tmp/sadchk6.db'
db.init_db()
items, total = db.list_forum_masters(1, 10)
print('種子文章:', total)
for m in items:
    print(f\"  [{m['id']}] {m['title'][:18]:20} {m['user_display']:22} {len(db.list_forum_details(m['id']))} 則\")
db.init_db()
print('再跑一次 init_db() 後:', db.list_forum_masters(1, 10)[1])
"
```

預期：
```text
種子文章: 5
  [5] 期末專題可以自己選題目嗎？   一般使用者                 2 則
  [4] 軟刪除和真的刪掉，差在哪裡？ 一般使用者                 3 則
  [3] 被停用的帳號，發過的文章會怎麼樣？ disabled@example.com   1 則
  [2] 主檔與明細是怎麼分工的？     一般使用者                 1 則
  [1] 【公告】討論區使用說明       管理員                     1 則
```
以及最後一行 `再跑一次 init_db() 後: 5`。

三件事要一起看：**id 由大到小**代表 `updated_at` 降冪排序生效；**第 3 篇的作者顯示 email**
代表 `COALESCE(u.name, u.email)` 在 `name` 為 NULL 時正確退回；**第二次 init_db() 沒有重複植入**
代表冪等。

驗收完成後清理：`rm -f /tmp/sadchk*.db*`

### 常見錯誤

- `COUNT(*)` 忘記套用與主查詢相同的 WHERE 條件，導致分頁列顯示的總數不對
- `offset` 算成 `page * page_size`（少了 `- 1`），第 1 頁就跳過了前 10 筆
- 忘記在 `db/__init__.py` 匯出新函式，導致 `db.list_users` 在 Blueprint 中 `AttributeError`
- 直接複製 `find_user_by_email` 的 SELECT（含 `hash`），把密碼雜湊帶進清單頁
- 清理 `db/__init__.py` 時**連 forum 那一段 re-export 一起刪掉**。這是本階段最容易犯的錯——前一版的系統確實要刪它，但現在論壇留下了
- 忘記保留 `_init_forum_tables(conn)` 的呼叫。症狀是啟動不報錯，但第一次進論壇就 `no such table: forum`
- **`_seed_forum_if_empty` 排在 `_seed_users_if_empty` 之前**。不會報錯（沒有外鍵），但五篇文章的作者欄會全部空白
- 種子文章用 `create_forum_master()` 等公開函式寫入。那些函式各自 `_get_conn()` 開新連線，在 `init_db()` 的交易中途開第二條連線，WAL 模式下雖然不會鎖死，但語意混亂且無法與 `_seed_users_if_empty` 對稱

---

## Phase 3 — 共用樣板與 CSS

### 目的

建立所有頁面共用的 HTML 骨架與設計 token。

### 產出檔案

| 檔案 | 來源 | 動作 |
|------|------|------|
| `templates/base.html` | 範本 | 原樣複製 |
| `static/common.css` | 範本 | 原樣複製 |
| `static/login.css` | 範本 | 原樣複製 |
| `static/hub.css` | 範本 | 原樣複製 |

四個檔案**都不需要修改**。`hub.css` 雖然是首頁專用，但裡面全部是 `hub-` 前綴的通用類別，沒有任何子系統的專屬樣式，可以整份帶走。

### 關鍵決策

`common.css` 是全站顏色的**單一來源**，由 `base.html` 最先載入。後續 Phase 6 與 Phase 7 新增 CSS 時，顏色一律以 `var(--...)` 引用這裡的 token，不得寫死色碼。

### 驗收

```bash
grep -c "^  --btn" static/common.css
```
預期：`15`（五組按鍵 token 的總數：primary 2、secondary 3、danger 2、action 4、action-danger 4）

```bash
grep -c "login-form" static/login.css
```
預期：≥ `1`。這確認 `button[type="submit"]` 的樣式確實被限定在 `.login-form` 內

```bash
grep -cE "forum|events|equipment" static/hub.css
```
預期：`2`。這兩筆是 CSS 屬性 `pointer-events: none`，不是子系統名稱——`hub.css` 中沒有任何 `.forum-*` 樣式。用 `grep -nE "forum|events|equipment" static/hub.css` 逐筆確認

```bash
grep -c "common.css\|login.css" templates/base.html
```
預期：`2`

### 常見錯誤

- 看到 `hub.css` 裡有 `events` 就以為要刪——那是 `pointer-events`，刪了會破壞 locked 卡片的樣式

---

## Phase 4 — auth 子系統

### 目的

建立登入、申請帳號、登出、圖形驗證碼四條路由。這是使用者進入系統的唯一入口。

### 產出檔案

| 檔案 | 來源 | 動作 |
|------|------|------|
| `blueprints/auth/__init__.py` | 範本 | **修改後複製**（刪 1 行） |
| `blueprints/auth/CLAUDE.md` | 範本 | 原樣複製（檢查後微調） |
| `templates/auth/login.html` | 範本 | **修改後複製**（修 1 行） |
| `templates/auth/register.html` | 範本 | 原樣複製 |

### 修改內容

**`blueprints/auth/__init__.py`** — 刪除第 11 行的 `login_required`：

```python
from utils import _gen_captcha, login_required   # 改為
from utils import _gen_captcha
```

`login_required` 在整個檔案中沒有被使用過，是範本遺留的無效 import。

**其餘一律不動。** 特別是這四項雖然帶有已知技術債，都必須原樣保留：

- 驗證碼在登入成功後未 `session.pop`（KI-07）
- 登入成功前未 `session.clear()` 重生 session（KI-15）
- `/logout` 是 GET（KI-14）
- `/login` 不驗 email 格式（KI-22）

**`templates/auth/login.html`** — 修正第 7 行的標籤不匹配：

```html
<h2>範例系統 v1.0</h1>    <!-- 改為 -->
<h2>會員管理系統 v1.0</h2>
```

順便把系統名稱改成本系統的名稱。

### 關鍵決策

**循環依賴的處理。** `auth` 的三個路由都會 `redirect(url_for('hub.home'))`，但 `hub` 要到 Phase 5 才建立。因此本階段的 `app.py` **只註冊 `auth_bp`**，驗收也只走未登入路徑（未登入時不會觸發 `url_for('hub.home')`）。Phase 5 完成後再一併驗證已登入的 redirect 行為。

### 驗收

先在背景啟動伺服器：

```bash
python app.py &
sleep 2
```

```bash
curl -s -o /dev/null -w "%{http_code}\n" localhost:4000/login
curl -s -o /dev/null -w "%{http_code}\n" localhost:4000/register
```
預期：兩個都是 `200`

```bash
curl -sI localhost:4000/captcha.png | grep -i "content-type"
```
預期：`Content-Type: image/png`

```bash
curl -s localhost:4000/health
```
預期：`OK`

```bash
curl -s localhost:4000/login | grep -c 'class="login-form"'
curl -s localhost:4000/register | grep -c 'class="login-form"'
```
預期：兩個都是 `1`。**這是本階段最重要的一條驗收**——缺了這個 class，送出按鈕不會有任何樣式

```bash
curl -s localhost:4000/login | grep -c "</h1>"
```
預期：`0`（標籤不匹配已修正）

驗收完成後停止伺服器：`kill %1`

### 常見錯誤

- 忘記在 Phase 1 的 `app.py` 中保留 `auth_bp` 的註冊
- 修 `login.html` 的 `</h1>` 時把 `<h2>` 也一起刪了
- 沒有先啟動伺服器就跑 `curl`，得到 connection refused

---

## Phase 5 — hub 子系統

### 目的

建立首頁。這是全系統唯一與被移除的子系統有耦合的地方，也是本次抽取工作的核心。

### 產出檔案

| 檔案 | 來源 | 動作 |
|------|------|------|
| `blueprints/hub/__init__.py` | 範本 | 原樣複製 |
| `blueprints/hub/CLAUDE.md` | 範本 | **改寫**（修正過時描述） |
| `templates/hub/home.html` | 範本 | **修改後複製**（本階段的主要工作） |

同時在 `app.py` 中加入 `hub_bp` 的註冊。

### `blueprints/hub/__init__.py` 為什麼零修改

首頁的角色判斷完全在 Jinja 中完成——Blueprint 已經把整個 `user` 物件（含 `role` 欄位）傳給 template，因此新增「管理員才看得到的卡片」不需要動任何 Python 程式碼。

### `templates/hub/home.html` 的修改內容

範本有 166 行，改後約 150 行。四處修改：

**1. 刪除已登入區的兩張跨系統卡片**

原檔第 37–53 行是三個 `<a class="hub-card">`，分別連向 `url_for('forum.index')`（第 37 行）、`url_for('events.index')`（第 43 行）、`url_for('equipment.index')`（第 49 行）。

**刪除 events 與 equipment 兩張（第 43–53 行），保留 forum 那一張（第 37–41 行）。**

這兩張是必須刪除的，不是可選的：對應的 Blueprint 不會被註冊，Jinja 在渲染 `url_for()` 時會直接拋出 `werkzeug.routing.BuildError`，首頁完全打不開。

刪除後，已登入區有第 31–35 行的「個人資料」與第 37–41 行的「論壇」兩張卡片。

**2. 新增管理員專屬卡片**

在已登入區的「個人資料」卡片之後加入：

```html
{% if user['role'] == 0 %}
  <a href="{{ url_for('admin.user_list') }}" class="hub-card">
    <div class="hub-card-icon">&#128100;&#65039;</div>
    <div class="hub-card-title">會員管理</div>
    <div class="hub-card-desc">管理所有會員帳號</div>
  </a>
{% endif %}
```

`url_for('admin.user_list')` 指向的 endpoint 要到 Phase 7 才存在。因此**本階段的驗收只能走一般使用者與訪客路徑**，管理員視圖的驗收延後到 Phase 7。

若想在本階段就能完整驗收，可以先建立一個只有 `user_list` 路由的 `admin` Blueprint 骨架。

**3. 刪除訪客區的兩張跨系統卡片**

原檔第 66–82 行是同樣的三個 `url_for`。**刪除 events（第 72–76 行）與 equipment（第 78–82 行），保留 forum（第 66–70 行）。**

論壇卡片在訪客區必須保留為可點擊的 `<a>`——`GET /forum` 沒有守門，訪客本來就能瀏覽。這是訪客視圖中唯一可點的服務卡片。

**4. 訪客區新增管理員的 locked 卡片**

刪除後，訪客區有「論壇」（可點）與第 84–89 行 locked 的「個人資料」兩張卡片。新增第三張 locked 卡片讓格線平衡：

```html
<div class="hub-card hub-card-locked">
  <div class="hub-card-icon">&#128100;&#65039;</div>
  <div class="hub-card-title">會員管理</div>
  <div class="hub-card-desc">管理所有會員帳號</div>
  <div class="hub-badge-lock">&#128274; 需管理員權限</div>
</div>
```

注意這是 `<div>` 不是 `<a>`——訪客沒有可以連過去的目標。`.hub-card-locked` 與 `.hub-badge-lock` 兩個 class 在 `hub.css` 中已經存在，不需要新增樣式。

訪客區最終是三張卡：論壇（可點）、個人資料（🔒 需登入）、會員管理（🔒 需管理員權限）。

**保留不動的部分：** topbar、歡迎語、內嵌登入表單整段（含 `class="login-form"`、驗證碼圖片的兩個 `onclick`、底部的申請帳號連結）。

### `blueprints/hub/CLAUDE.md` 的改寫

範本的這份文件與程式碼**矛盾**。它寫著：

> 未登入（無 `session['user_id']`）→ redirect `auth.login_page`

但 `blueprints/hub/__init__.py` 的實際行為是：未登入可以瀏覽，並在頁面右側顯示內嵌登入表單；`_is_usable` 為假時是 `session.clear()` 後**退回訪客視圖**，不 redirect。

改寫為正確的雙模式描述，並補上管理員卡片的條件顯示說明。

### 驗收

```bash
grep -cE "events|equipment" templates/hub/home.html
```
預期：`0`。**這是本階段最關鍵的一條驗收**

```bash
grep -c "url_for('forum.index')" templates/hub/home.html
```
預期：`2`（已登入區與訪客區各一）

```bash
python app.py &
sleep 2
curl -s localhost:4000/ | grep -c "個人資料"
curl -s localhost:4000/ | grep -c "論壇"
curl -s localhost:4000/ | grep -c 'class="login-form"'
curl -s localhost:4000/ | grep -c "會員管理"
kill %1
```
預期：分別是 `1`、`1`、`1`、`1`（訪客視圖：locked 個人資料卡、可點的論壇卡、登入表單、locked 會員管理卡）

已登入視圖以 Flask test client 驗證（此時 `tests/` 尚未建立，可用一次性腳本）：

```bash
python -c "
import db
from app import app
db.DB_PATH = '/tmp/sadchk6.db'
db.init_db()
app.config['TESTING'] = True
c = app.test_client()
with c.session_transaction() as s:
    s['user_id'] = 1
t = c.get('/').get_data(as_text=True)
print('normal user:', '歡迎回來' in t, '論壇' in t, '會員管理' in t)
"
```
預期：`normal user: True True False`——一般使用者看得到歡迎語與論壇卡片，看不到會員管理卡片

管理員視圖（`user_id = 2`）的驗收延後到 Phase 7。

> 本階段的 `url_for('forum.index')` 之所以不會 `BuildError`，是因為 Phase 1 保留了 `forum_bp` 的註冊，而 `blueprints/forum/` 是從範本原樣複製過來的。若你把 Phase 8 往後排並暫時移除了 `forum_bp`，這裡就會炸——那就先把論壇卡片註解掉，Phase 8 完成後再放回來。

### 常見錯誤

- **把論壇卡片也一起刪了。** 前一版的系統確實要刪它，現在論壇留下了。刪之前先確認 `url_for` 裡的 Blueprint 名稱
- 只刪了已登入區的卡片，忘了訪客區也有一組。訪客一開首頁就 `BuildError`
- 刪卡片時多刪了外層的 `<div class="hub-grid">`，版面整個垮掉
- 新增管理員卡片時忘記包 `{% if user['role'] == 0 %}`，一般使用者也看得到
- 訪客區的新卡片誤用 `<a>` 並加上 `url_for('admin.user_list')`——訪客的 `user` 是 `None`，而且這會讓未登入者看到一個點了就被踢走的連結

---

## Phase 6 — profile 子系統

### 目的

建立個人資料的查看與編輯功能，並把內嵌樣式外提成獨立的 CSS 檔。

### 產出檔案

| 檔案 | 來源 | 動作 |
|------|------|------|
| `blueprints/profile/__init__.py` | 範本 | 原樣複製 |
| `blueprints/profile/CLAUDE.md` | 範本 | **修改後複製**（CSS 段落） |
| `templates/profile/dashboard.html` | 範本 | **修改後複製**（抽出樣式） |
| `static/profile.css` | — | **全新建立**（從內嵌樣式外提） |

同時在 `app.py` 中加入 `profile_bp` 的註冊。

### `blueprints/profile/__init__.py` 為什麼零修改

這個檔案只有 29 行，是全專案最好讀的教材。**行為邏輯一個字都不改**，包括：

- `POST /profile/update` **沒有** `_is_usable` 檢查（KI-03）
- `POST /profile/update` 對輸入沒有任何驗證，成功後沒有 flash（KI-04）

這兩項是經過裁決保留的技術債。KI-03 尤其重要——它在 Phase 7 加入停用功能後會產生可實際觸發的行為矛盾，是系統規格書 §11.2 的核心教材。**實作時不要「順手」補上那三行。**

### `templates/profile/dashboard.html` 的修改內容

原檔第 5–76 行是一整段內嵌 `<style>`（72 行樣式），色碼全部硬編碼，沒有使用 `common.css` 的 token。三步處理：

**1. 剪下整段 `<style>` 內容，貼進 `static/profile.css`**

**2. 所有 class 加上 `profile-` 前綴**

例如 `.dashboard-card` → `.profile-dashboard-card`、`.profile-row` 維持（已有前綴）、`.btn-edit` → `.profile-btn-edit`、`.back-btn` → `.profile-back-btn`。HTML 中的 class 名稱同步更新。

**3. 按鈕的顏色屬性改用 token**

| 原本 | 改為 |
|------|------|
| 「修改資料」「儲存」的底色 | `var(--btn-primary-bg)`、hover 用 `var(--btn-primary-hover)` |
| 「放棄」「返回首頁」的底色 | `var(--btn-secondary-bg)`、文字色 `var(--btn-secondary-color)`、hover `var(--btn-secondary-hover)` |
| 「登出」的底色 | `var(--btn-danger-bg)`、hover `var(--btn-danger-hover)` |

非按鈕的顏色（卡片背景、分隔線、文字色）可以維持硬編碼，`common.css` 目前只定義按鍵 token。

**4. `{% block head %}` 中加入連結**

```html
{% block head %}
<link rel="stylesheet" href="{{ url_for('static', filename='profile.css') }}">
{% endblock %}
```

### 關鍵決策

**為什麼外提樣式不算「強行強化技術債」。** `rules/flask-blueprint.md` 的「新增子系統七項清單」明訂每個子系統要有自己的 `static/<name>.css`。範本的 profile 沒有遵守這條，是**結構上的不一致**，不是安全或行為上的技術債。本次抽取順手補齊，屬於「與範本的差異」而非「修補技術債」。

profile 的**行為邏輯**（KI-03、KI-04）則完全不動。這兩件事的界線要分清楚。

### 驗收

```bash
python -c "
import db
from app import app
db.DB_PATH = '/tmp/sadchk5.db'
db.init_db()
app.config['TESTING'] = True
c = app.test_client()
with c.session_transaction() as s:
    s['user_id'] = 1
t = c.get('/profile').get_data(as_text=True)
print('view:', all(k in t for k in ['姓名', '顯示名稱', '最後登入']))
e = c.get('/profile?edit=1').get_data(as_text=True)
print('edit:', 'name=\"name\"' in e and 'name=\"display_name\"' in e)
print('css linked:', 'profile.css' in t)
anon = app.test_client().get('/profile')
print('anon:', anon.status_code, anon.headers['Location'])
"
```
預期：
```text
view: True
edit: True
css linked: True
anon: 302 /login
```

```bash
grep -c "<style>" templates/profile/dashboard.html
```
預期：`0`

按鈕區段不應出現硬編碼色碼：

```bash
grep -nE "#[0-9a-fA-F]{3,6}" static/profile.css | grep -iE "btn"
```
預期：**無輸出**

```bash
grep -c "login-form" templates/profile/dashboard.html
```
預期：`0`。profile 的表單**不能**加這個 class，否則會誤套登入頁的按鈕樣式

### 常見錯誤

- 「順手」在 `dashboard_update()` 補上 `_is_usable` 檢查——這會讓 KI-03 這個核心教材消失
- CSS 加了前綴但忘記同步改 HTML 中的 class 名稱，畫面完全失去樣式
- 忘記加 `{% block head %}` 的 `<link>`，外提後樣式根本沒被載入

---

## Phase 7 — admin 子系統

### 目的

建立管理員的會員管理功能。這是本系統唯一的全新子系統，也是工作量最大的一個階段。

### 產出檔案

| 檔案 | 動作 |
|------|------|
| `blueprints/admin/__init__.py` | **全新建立**（約 130 行） |
| `blueprints/admin/CLAUDE.md` | **全新建立** |
| `templates/admin/user_list.html` | **全新建立** |
| `templates/admin/user_detail.html` | **全新建立** |
| `static/admin.css` | **全新建立** |

同時在 `app.py` 中加入 `admin_bp` 的註冊。

### 建議的實作順序

1. `static/admin.css` — 從 `static/forum.css` 複製骨架後改前綴。論壇是本系統中唯一有表格、分頁與 flash 區的子系統，版面需求最接近
2. `templates/admin/user_list.html` — 先做出畫面，再接路由
3. `blueprints/admin/__init__.py` 的路由 1（`user_list`）與路由 2（`user_detail`）
4. 路由 3–6 的四個 POST 動作
5. `templates/admin/user_detail.html`
6. `blueprints/admin/CLAUDE.md`

### `blueprints/admin/__init__.py`

Blueprint 宣告：

```python
admin_bp = Blueprint('admin', __name__, url_prefix='/admin')
_PAGE_SIZE = 10
ROLE_LABELS = {0: '管理員', 1: '一般使用者'}
```

**內部 helper**（依 `rules/flask-blueprint.md`，`_is_admin` 不得放進 `utils.py`）：

```python
def _current_user():
    return db.find_user_by_id(session['user_id'])

def _is_admin(user):
    return user['role'] == 0
```

**每個路由開頭都明寫這四行守門**，不抽象成裝飾器：

```python
user = _current_user()
if not _is_usable(user):
    session.clear()
    return redirect(url_for('auth.login_page'))
if not _is_admin(user):
    flash('無操作權限', 'error')
    return redirect(url_for('hub.home'))
```

六條路由的完整規格見系統規格書 §5.4 與 §7.1。實作時的重點：

| 路由 | 重點 |
|------|------|
| `GET /admin/users` | 讀 `status`（預設 `all`）、`q`、`page`（`request.args.get('page', 1, type=int)`）→ `db.list_users()` → 算 `total_pages` |
| `GET /admin/users/<int:user_id>` | 查無此人 → flash `找不到該使用者` + redirect 清單。傳給 template 的變數名是 **`target`**，不是 `user` |
| `POST .../activate` | 檢查順序：存在 → 未刪除 → `set_user_active(id, 1)`。**不檢查是否為自己** |
| `POST .../deactivate` | 存在 → **非自己（R1）** → 未刪除 → `set_user_active(id, 0)` |
| `POST .../role` | 存在 → **非自己（R3）** → 未刪除 → `role` 為 `'0'` 或 `'1'` → `set_user_role(id, int(role))` |
| `POST .../delete` | 存在 → **非自己（R2）** → 未刪除 → `soft_delete_user(id)` |

四個 POST 路由成功後一律 `flash(成功訊息, 'success')` 並 `redirect(url_for('admin.user_list'))`，不帶 query string（KI-17）。

十一條訊息字串必須與系統規格書 §9.5 的表格**逐字一致**，包含全形逗號與標點。

### `templates/admin/user_list.html`

變數：`user`（當前登入的管理員）、`users`、`total`、`page`、`total_pages`、`status`、`keyword`、`ROLE_LABELS`。

版面由上而下：topbar → flash 區 → 篩選列 → 表格 → 分頁列。

**篩選列**：四個 `<a>` 連向 `?status=all|active|disabled|deleted`（當前狀態加上 `.admin-filter-active`），右側一個 `<form method="get">` 含 `q` 輸入框與送出按鈕。搜尋表單要以 hidden 欄位帶上當前的 `status`，否則搜尋會把篩選重設。

**表格欄位**：ID｜Email｜姓名｜顯示名稱｜角色｜狀態｜建立時間｜最後登入｜操作。姓名與顯示名稱為空時顯示 `—`。

**「操作」欄的三種情況：**

```text
自己（u['id'] == user['id']）  → 「（目前登入帳號）」+「詳細」連結
已刪除（u['is_deleted']）      → 只有「詳細」連結
其餘                           → 「啟用」或「停用」（依 is_active 二選一）+「刪除」+「詳細」
```

三個動作各自是一個獨立的 inline `<form method="post">`，「刪除」的表單加上 `onsubmit="return confirm('確定要刪除這個帳號嗎？此操作無法復原。')"`。「詳細」是 `<a>`。

> 前端隱藏只是提示。**後端的 R1/R2/R3 檢查才是權威**，Phase 9 的測試必須直接對後端 POST 來驗證。

**分頁列**：上一頁／下一頁連結要保留當前的 `status` 與 `q`。

### `templates/admin/user_detail.html`

變數：`user`（當前管理員）、`target`（被檢視者）、`ROLE_LABELS`。

`target` **刻意不叫 `user`**，避免與 topbar 使用的當前登入者在 Jinja 中混淆——兩者同名會導致 topbar 顯示被檢視者的名字，而且極難察覺。

版面：topbar → flash 區 → 資訊卡（雙欄格線，顯示 `users` 表的九個欄位，不含 `hash`）→ 操作區 → 返回清單連結。

操作區包含角色調整表單（`<select name="role">` 兩個選項 + 送出按鈕）、啟用或停用按鈕、刪除按鈕。若 `target['id'] == user['id']`，整個操作區換成提示文字。

### `static/admin.css`

前綴一律 `admin-`。按鈕類別依 `rules/flask-blueprint.md` 的命名表：

| Class | 使用的 token |
|-------|-------------|
| `.admin-btn` | 基底（尺寸、圓角、border），不含顏色 |
| `.admin-btn-primary` / `:hover` | `var(--btn-primary-bg)` / `var(--btn-primary-hover)` |
| `.admin-btn-secondary` / `:hover` | `var(--btn-secondary-bg)`、`var(--btn-secondary-color)` / `var(--btn-secondary-hover)` |
| `.admin-btn-danger` / `:hover` | `var(--btn-danger-bg)` / `var(--btn-danger-hover)` |
| `.admin-btn-sm` | 尺寸變體 |
| `.admin-btn-action` / `:hover` | `var(--btn-action-bg)`、`var(--btn-action-border)`、`var(--btn-action-color)` / `var(--btn-action-hover)` |
| `.admin-btn-action-danger` / `:hover` | `var(--btn-action-danger-*)` 四個 |

其他類別：`.admin-layout`、`.admin-topbar`、`.admin-topbar-title`、`.admin-topbar-nav`、`.admin-nav-link`、`.admin-flash` 與 `-error` / `-success`、`.admin-filter-bar`、`.admin-filter-link`、`.admin-filter-active`、`.admin-table-wrap`、`.admin-table`、`.admin-empty`、`.admin-total`、`.admin-inline-form`、`.admin-actions-cell`、`.admin-badge` 與 `-active` / `-disabled` / `-deleted` / `-role-admin` / `-role-user`、`.admin-info-grid`、`.admin-info-row`、`.admin-info-label`、`.admin-info-value`、`.admin-pagination`、`.admin-page-btn`、`.admin-page-disabled`、`.admin-page-info`。

**狀態 badge 的底色可以硬編碼**（`common.css` 沒有定義狀態語意色），這與範本各子系統的做法一致，記錄為 KI-19。**按鈕的顏色不可硬編碼。**

admin 的表單**一律不加** `.login-form` class。

### `blueprints/admin/CLAUDE.md`

除了標準的職責／路由／業務邏輯／Templates／CSS／測試六節之外，必須額外記錄兩件事：

1. **「請勿重構掉重複的守門三行。」** 說明這個重複是刻意的教學設計，讓讀者從任一路由的第一行就能讀出完整的守門條件
2. **自我保護規則 R1–R3 與「最後一個管理員」的論證**，以及放寬規則時必須補上計數檢查的警語

### 驗收

```bash
python -c "
import db
from app import app
db.DB_PATH = '/tmp/sadchk6.db'
db.init_db()
app.config['TESTING'] = True

def cli(uid=None):
    c = app.test_client()
    if uid:
        with c.session_transaction() as s:
            s['user_id'] = uid
    return c

adm, usr, anon = cli(2), cli(1), cli()

r = adm.get('/admin/users'); t = r.get_data(as_text=True)
print('admin list:', r.status_code, all(e in t for e in ['user@example.com','admin@example.com','disabled@example.com']))
print('normal ->', usr.get('/admin/users').status_code, usr.get('/admin/users').headers['Location'])
print('anon   ->', anon.get('/admin/users').status_code, anon.get('/admin/users').headers['Location'])
print('filter active:', 'disabled@example.com' not in adm.get('/admin/users?status=active').get_data(as_text=True))

adm.post('/admin/users/1/deactivate')
print('deactivate other:', db.find_user_by_id(1)['is_active'])
adm.post('/admin/users/2/deactivate')
print('deactivate self :', db.find_user_by_id(2)['is_active'])
adm.post('/admin/users/1/activate')
print('activate  other:', db.find_user_by_id(1)['is_active'])
adm.post('/admin/users/1/role', data={'role':'0'})
print('role      other:', db.find_user_by_id(1)['role'])
adm.post('/admin/users/2/role', data={'role':'1'})
print('role      self :', db.find_user_by_id(2)['role'])
adm.post('/admin/users/1/delete')
print('delete    other:', db.find_user_by_id(1)['is_deleted'])
adm.post('/admin/users/2/delete')
print('delete    self :', db.find_user_by_id(2)['is_deleted'])
usr2 = cli(1)
print('normal post blocked:', usr2.post('/admin/users/3/deactivate').status_code, db.find_user_by_id(3)['is_active'])
"
```

預期：
```text
admin list: 200 True
normal -> 302 /
anon   -> 302 /login
filter active: True
deactivate other: 0
deactivate self : 1
activate  other: 1
role      other: 0
role      self : 0
delete    other: 1
delete    self : 0
normal post blocked: 302 0
```

逐條說明：`deactivate self : 1` 代表 R1 生效（管理員仍是啟用狀態）；`role self : 0` 代表 R3 生效（管理員仍是 role=0）；`delete self : 0` 代表 R2 生效；最後一行的 `0` 是 id=3 的原始 `is_active` 值（種子資料本來就是停用），代表一般使用者的 POST 沒有改到任何東西。

管理員的首頁卡片（Phase 5 延後的部分）：

```bash
python -c "
import db
from app import app
db.DB_PATH = '/tmp/sadchk7.db'
db.init_db()
app.config['TESTING'] = True
for uid, label in [(2,'admin'), (1,'normal')]:
    c = app.test_client()
    with c.session_transaction() as s:
        s['user_id'] = uid
    print(label, '會員管理' in c.get('/').get_data(as_text=True))
"
```
預期：`admin True` 與 `normal False`

清理：`rm -f /tmp/sadchk*.db*`

### 常見錯誤

- 守門的三層順序寫反（先判 `_is_admin` 再判 `_is_usable`），導致停用中的管理員收到「權限不足」而非被登出
- 忘記自我保護規則，或只加在其中一兩條路由上
- `activate` 也加了自我保護——沒必要，而且會讓行為不一致
- 明細頁的變數用 `user` 而非 `target`，導致 topbar 顯示被檢視者的名字
- 搜尋表單忘記帶上當前的 `status`，一搜尋就把篩選重設成 `all`
- 訊息字串與規格書不一致（例如用半形逗號），Phase 9 的測試會全數失敗

---

## Phase 8 — forum 子系統

### 目的

建立論壇。這是本系統唯一有**主檔／明細關聯**與 **transaction** 的子系統，也是唯一開放訪客讀取的內容區。

### 產出檔案

| 檔案 | 來源 | 動作 |
|------|------|------|
| `blueprints/forum/__init__.py` | 範本 | **修改後複製**（守門修正） |
| `blueprints/forum/CLAUDE.md` | 範本 | **修改後複製**（表名更正 + 守門說明） |
| `templates/forum/index.html` | 範本 | 原樣複製 |
| `templates/forum/post_form.html` | 範本 | 原樣複製 |
| `static/forum.css` | 範本 | 原樣複製 |

`app.py` 的 `forum_bp` 註冊在 Phase 1 已保留，本階段不需再動。`db/forum.py` 在 Phase 2 已原樣複製。

### 模板與 CSS 為什麼零修改

`templates/forum/index.html`（191 行）與 `post_form.html`（61 行）只引用 `hub.home`、`auth.logout`、`auth.login_page` 與 `forum.*` 自己的 endpoint，對 events 與 equipment 零耦合。`static/forum.css`（401 行）全部是 `forum-` 前綴加上一組 `col-*` 欄寬工具類，也不需要動。

這一點值得對照 Phase 5：同樣是範本的模板，`hub/home.html` 因為是「服務入口」而必然耦合所有子系統，`forum/index.html` 因為是「葉節點」而完全獨立。**耦合集中在入口，不散佈在葉節點**——這是模組化做對了的表現。

### `blueprints/forum/__init__.py` 的修改內容

範本有 248 行，改後約 262 行。這是本階段唯一需要動腦的地方。

**1. 第 4 行的 import 加上 `_is_usable`**

```python
from utils import login_required                  # 改為
from utils import _is_usable, login_required
```

**2. `_current_user()` 加入帳號有效性判斷**

範本第 11–15 行：

```python
def _current_user():
    """從 session 取得目前登入的使用者，未登入回傳 None。"""
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

**3. 六條寫入類路由加上 `None` 防護**

因為 `_current_user()` 現在會在帳號失效時回傳 `None`，而 `new_post`、`reply`、`edit_master`、`edit_detail`、`delete_master`、`delete_detail` 六條路由都在 `@login_required` 之後立刻取用 `user['id']` 或把 `user` 傳給 `_is_admin()`，不處理會拋 `TypeError`。

在每條路由取得 `user` 之後、做任何其他事之前插入：

```python
if user is None:
    session.clear()
    return redirect(url_for('auth.login_page'))
```

這與 `blueprints/profile/__init__.py` 第 14–16 行的處置完全一致，刻意保持一樣的寫法。

**`forum.index` 是唯一不加這段的路由。** 它必須把 `None` 當成合法的訪客狀態繼續渲染——加了就等於把論壇變成需要登入才能看，那是另一套產品決策。

> **為什麼不把 `session.clear()` 也塞進 `_current_user()`？** 因為 `index` 也會呼叫它。一個訪客（從未登入）與一個帳號剛被停用的人，在 `_current_user()` 眼中都是 `None`，但只有後者需要清 session。要區分兩者，helper 就得回傳兩種以上的狀態，複雜度立刻上升。把 redirect 與 `session.clear()` 留在路由裡，是用一點重複換取每條路由都看得懂。

**4. 其餘一律不動**

包含 `_PAGE_SIZE = 10`、`_is_admin()`、十一條錯誤訊息字串、所有 redirect 目標、`strict_slashes=False`。特別是這三項技術債要原樣保留：

- 標題與內容無長度上限（KI-28）
- 可以刪除首篇內文，留下沒有內文的文章（KI-30）
- 訊息字串硬編碼、未納入 `MESSAGES`（KI-29）

### `blueprints/forum/CLAUDE.md` 的修改內容

範本這份文件有一處**與程式碼矛盾**：「資料模型」一節寫著資料表叫 `forum_masters`，但 `db/forum.py` 建的表是 `forum`。更正它。

另外補上兩段：`_current_user()` 已包含 `_is_usable` 檢查，以及「六條寫入路由必須各自處理 `user is None`」的說明——後者若不寫清楚，日後有人新增第七條路由時很容易漏掉。

### 驗收

**1. 基本瀏覽（訪客）**

```bash
python app.py &
sleep 2
curl -s -o /dev/null -w "%{http_code}\n" localhost:4000/forum
curl -s -o /dev/null -w "%{http_code}\n" localhost:4000/forum/
curl -s localhost:4000/forum | grep -c "登入"
curl -s localhost:4000/forum | grep -c "發表文章"
kill %1
```
預期：`200`、`200`（`strict_slashes=False` 生效）、`1`（topbar 顯示登入）、`0`（訪客看不到發表按鈕）

**2. 完整流程與守門**

```bash
python -c "
import db
from app import app
db.DB_PATH = '/tmp/sadchk7.db'
db.init_db()
app.config['TESTING'] = True

def cli(uid=None):
    c = app.test_client()
    if uid:
        with c.session_transaction() as s:
            s['user_id'] = uid
    return c

usr, adm, anon = cli(1), cli(2), cli()

# 發文
r = usr.post('/forum/new', data={'title': '測試文', 'content': '內文'})
mid = db.list_forum_masters(1, 10)[0][0]['id']
print('new_post        :', r.status_code, db.list_forum_masters(1, 10)[1], len(db.list_forum_details(mid)))

# 空值驗證
r = usr.post('/forum/new', data={'title': '', 'content': 'x'})
print('empty title     :', '請輸入文章標題' in r.get_data(as_text=True))

# 回覆
adm.post(f'/forum/reply/{mid}', data={'content': '回覆內容'})
print('reply           :', len(db.list_forum_details(mid)))

# 修改：作者可、他人不可
usr.post(f'/forum/edit/master/{mid}', data={'title': '改過的標題'})
print('edit by author  :', db.get_forum_master(mid)['title'])
r = adm.post(f'/forum/edit/master/{mid}', data={'title': '管理員改的'})
print('edit by admin   :', db.get_forum_master(mid)['title'])

# 刪除：一般使用者被拒
usr.post(f'/forum/delete/master/{mid}')
print('delete by user  :', db.get_forum_master(mid)['is_deleted'])

# 刪除：管理員可，且級聯
adm.post(f'/forum/delete/master/{mid}')
print('delete by admin :', db.get_forum_master(mid)['is_deleted'], len(db.list_forum_details(mid)))

# 未登入
print('anon new_post   :', anon.get('/forum/new').status_code, anon.get('/forum/new').headers['Location'])
"
```

預期：
```text
new_post        : 302 1 1
empty title     : True
reply           : 2
edit by author  : 改過的標題
edit by admin   : 管理員改的
delete by user  : 0
delete by admin : 1 0
anon new_post   : 302 /login
```

`delete by user  : 0` 代表一般使用者的刪除被擋下，文章的 `is_deleted` 仍是 0。
`delete by admin : 1 0` 代表刪除成功且級聯到明細。

**3. 守門修正（本階段的核心驗收）**

```bash
python -c "
import db
from app import app
db.DB_PATH = '/tmp/sadchk8.db'
db.init_db()
app.config['TESTING'] = True

c = app.test_client()
with c.session_transaction() as s:
    s['user_id'] = 1

# 先確認正常狀態可以發文
c.post('/forum/new', data={'title': '停用前', 'content': 'x'})
print('before disable  :', db.list_forum_masters(1, 10)[1])

# 管理員停用 id=1
adm = app.test_client()
with adm.session_transaction() as s:
    s['user_id'] = 2
adm.post('/admin/users/1/deactivate')
print('is_active       :', db.find_user_by_id(1)['is_active'])

# 同一個 client（session 未清）再次嘗試發文
r = c.post('/forum/new', data={'title': '停用後', 'content': 'y'})
print('after disable   :', r.status_code, r.headers.get('Location'), db.list_forum_masters(1, 10)[1])

# 但瀏覽仍然可以，且以訪客身分呈現
c2 = app.test_client()
with c2.session_transaction() as s:
    s['user_id'] = 1
r2 = c2.get('/forum')
print('browse          :', r2.status_code, '發表文章' in r2.get_data(as_text=True))

# 對照組：profile 仍可修改（KI-03，刻意保留）
c3 = app.test_client()
with c3.session_transaction() as s:
    s['user_id'] = 1
c3.post('/profile/update', data={'name': '停用後改的', 'display_name': ''})
print('KI-03 profile   :', db.find_user_by_id(1)['name'])
"
```

預期：
```text
before disable  : 1
is_active       : 0
after disable   : 302 /login 1
browse          : 200 False
KI-03 profile   : 停用後改的
```

逐條說明：

- `after disable : 302 /login 1` —— 被停用後發文被擋，文章總數仍是 1（沒有新增）。**守門修正生效**
- `browse : 200 False` —— 瀏覽仍然可以，但看不到發表按鈕。訪客視圖正確
- `KI-03 profile : 停用後改的` —— profile 仍可修改。**這是刻意保留的缺陷，不是失敗**

最後兩行的對比就是系統規格書 §11.0 那條判準的具體呈現。若你在這裡看到 profile 也被擋下，代表有人「順手」修了 KI-03，請還原。

清理：`rm -f /tmp/sadchk*.db*`

### 常見錯誤

- **`_current_user()` 改了，但六條路由沒加 `None` 防護。** 症狀是停用帳號一發文就 `TypeError: 'NoneType' object is not subscriptable`，而不是乾淨的 302
- **`forum.index` 也加了 `None` 防護。** 症狀是訪客連論壇都進不去，整個開放瀏覽的設計消失
- 把 `session.clear()` 寫進 `_current_user()`，導致單純的訪客瀏覽也會不斷清 session
- 順手修了 KI-28（加長度上限）或 KI-30（禁止刪首篇），讓規格書的 known issues 與實作對不上
- `blueprints/forum/CLAUDE.md` 忘記更正 `forum_masters` 這個錯誤表名

---

## Phase 9 — CSS 一致性稽核

### 目的

確認全站的樣式遵守設計規範。這個階段不產生新檔案，只做檢查與修正。

### 產出檔案

無。發現問題時回頭修 Phase 3、6、7 的檔案。

### 驗收

**1. `static/` 恰有六個 CSS 檔**

```bash
ls static/
```
預期：`admin.css  common.css  forum.css  hub.css  login.css  profile.css`

**2. `.login-form` 恰出現在三個地方**

```bash
grep -rln 'class="login-form"' templates/
```
預期恰三個檔案：
```text
templates/auth/login.html
templates/auth/register.html
templates/hub/home.html
```

多了會讓 admin 或 profile 誤套登入頁樣式，少了會讓對應的送出按鈕失去樣式。

**3. 沒有假按鈕**

```bash
grep -rn 'href="#"' templates/
```
預期：**無輸出**

**4. `onclick` 只用在允許的地方**

```bash
grep -rn 'onclick\|onsubmit' templates/
```
預期恰八筆，逐筆檢視：

| 位置 | 用途 | 是否允許 |
|------|------|:---:|
| `auth/login.html` 的驗證碼 `<img>` | `onclick` 刷新 | 是 |
| `auth/login.html` 的 `↻` 按鈕 | `onclick` 刷新 | 是 |
| `hub/home.html` 的驗證碼 `<img>` | `onclick` 刷新 | 是 |
| `hub/home.html` 的 `↻` 按鈕 | `onclick` 刷新 | 是 |
| `forum/index.html` 的刪除文章按鈕 | `onclick="return confirm(...)"` | 是 |
| `forum/index.html` 的刪除回覆按鈕 | `onclick="return confirm(...)"` | 是 |
| `admin/user_list.html` 的刪除帳號按鈕 | `onclick="return confirm(...)"` | 是 |
| `admin/user_detail.html` 的刪除帳號按鈕 | `onclick="return confirm(...)"` | 是 |

**刪除確認一律寫在 `<button>` 的 `onclick` 上**，不寫在 `<form>` 的 `onsubmit` 上——這是對齊論壇的既有寫法。若 Phase 7 的 admin 用了 `onsubmit`，本階段改成 `onclick` 以維持一致。

其他任何 `onclick` 都應該改成 `<a>` 或 `<form>`。

**5. 按鈕顏色一律走 token**

```bash
grep -o 'var(--btn-[a-z-]*)' static/admin.css | sort -u
grep -o 'var(--btn-[a-z-]*)' static/forum.css | sort -u
```
預期：兩者都涵蓋 primary、secondary、danger、action 四族

```bash
for f in admin profile forum; do
  printf "%-8s " $f
  grep -A6 -iE "^\.[a-z-]*-btn[a-z-]*[ ,{]" static/$f.css \
    | grep -cE "background-color: *#[0-9a-fA-F]{3,6}"
done
```
預期：三個都是 `0`——**按鍵規則的 `background-color` 一律走 token**。

三點說明：

**檢查的是 `background-color`，不是「任何色碼」。** `.forum-btn-primary` 與 `.admin-btn-primary` 都寫了 `color: #fff`（白色文字），這是範本既有的做法，也無法用現有的 token 表達——`common.css` 只定義底色，沒有定義文字色。硬性要求「零色碼」會把這個合理的寫法誤判為違規。

**檢查範圍限定在按鍵規則內。** 直接對整個檔案 grep `background-color: #` 會抓到 `body` 的頁面底色與 `.profile-check-icon` 的圓形底色，那些不是按鍵，本來就不該套 token。

**`hub.css` 不在檢查清單中。** 它的 `.hub-register-link` 與 `.hub-logout` 在視覺與語意上都是按鍵，卻寫死了色碼——這是範本的既有技術債（KI-31），且因為類別名稱不含 `btn`，上面那條 grep 也抓不到。`hub.css` 依規定逐字複製，不修改。要確認它確實只有這兩處：

```bash
grep -nE "background-color: *#[0-9a-fA-F]{3,6}" static/hub.css
```
預期五筆：`body` 的底色，以及 `.hub-register-link`、`.hub-logout` 及其兩個 `:hover`。

**6. 各子系統的類別前綴不互相污染**

```bash
grep -c "^\.hub-" static/hub.css
grep -c "^\.profile-" static/profile.css
grep -c "^\.admin-" static/admin.css
grep -c "^\.forum-" static/forum.css
```
預期：四個都是正整數，且每個檔案中不應出現其他子系統的前綴。

唯一的例外是欄寬工具類 `.col-id`、`.col-title`、`.col-uid`、`.col-time`、`.col-content`、`.col-action`——它們同時出現在 `forum.css` 與 `admin.css`，因為只管欄寬不管顏色，跨子系統重複定義是可接受的：

```bash
grep -c "^\.col-" static/forum.css static/admin.css
```
預期：兩者都是正整數。

### 常見錯誤

- 從 `equipment.css` 複製骨架時漏改了幾個 `eq-` 前綴
- 按鈕 hover 狀態忘記改用 token，只改了預設狀態

---

## Phase 10 — 測試

### 目的

建立完整的測試套件。這是系統可維護性的保證，也是後續任何修改的安全網。

### 產出檔案

| 檔案 | 來源 | 動作 |
|------|------|------|
| `tests/__init__.py` | 範本 | 原樣複製（空檔） |
| `tests/conftest.py` | 範本 | 原樣複製 |
| `tests/data/__init__.py` | 範本 | 原樣複製（空檔） |
| `tests/data/users.py` | 範本 | **修改後複製** |
| `tests/test_auth.py` | 範本 | 原樣複製（23 案例） |
| `tests/test_profile.py` | 範本 | 原樣複製（8 案例） |
| `tests/test_hub.py` | 範本 | **修改後複製**（6 → 9 案例） |
| `tests/test_forum.py` | 範本 | **修改後複製**（39 → 42 案例） |
| `tests/test_admin.py` | — | **全新建立**（約 30 案例） |
| `tests/CLAUDE.md` | 範本 | **改寫** |

### `tests/conftest.py` 為什麼零修改

範本的 conftest 只依賴 `db_module.DB_PATH` 與 `db.init_db()`，沒有任何對特定子系統的耦合。五個 fixture（`app`、`client`、`authed_client`、`admin_client`、`other_client`）在本系統中全部沿用。

`other_client`（id=3，停用帳號但 session 直接注入）在本系統中的用途擴大了三倍：

1. 原本的「非本人、非管理員」權限邊界（論壇的修改權限測試靠它）
2. 「停用中的管理員」——先 `db.set_user_role(3, 0)` 再用它，驗證 admin 的守門順序
3. 「持有舊 session 的停用帳號」——驗證 forum 的守門修正，以及 KI-03 的刻意缺陷

### `tests/data/users.py` 的修改內容

**1. 修正第 1 行的過時註解**

```python
# 對應 db._seed_if_empty() 的種子帳號，ID 依 AUTOINCREMENT 順序   # 改為
# 對應 db.users._seed_users_if_empty() 的種子帳號，ID 依 AUTOINCREMENT 順序
```

**2. `MESSAGES` 追加 admin 區段（11 條）**

key 沿用既有的 camelCase 命名，字串必須與系統規格書 §9.5 逐字一致：

```python
    # ── admin ──
    'adminForbidden':      '無操作權限',
    'adminSelfDeactivate': '不可停用自己的帳號',
    'adminSelfDelete':     '不可刪除自己的帳號',
    'adminSelfRole':       '不可修改自己的角色',
    'adminUserNotFound':   '找不到該使用者',
    'adminDeletedUser':    '該帳號已刪除，無法操作',
    'adminInvalidRole':    '角色值不正確',
    'adminActivated':      '帳號已啟用',
    'adminDeactivated':    '帳號已停用',
    'adminRoleUpdated':    '角色已更新',
    'adminUserDeleted':    '帳號已刪除',
```

> `adminDeactivated` 的字串「帳號已停用」與既有的 `accountDisabled` 完全相同，但語意不同：前者是管理操作成功的 flash，後者是登入被拒的錯誤。兩個 key 必須分開，斷言時要注意上下文。

**論壇的 11 條訊息不加入 `MESSAGES`。** `tests/test_forum.py` 沿用範本原樣搬移，它把字串直接寫在斷言中，沒有 import `MESSAGES`。強行改寫會讓測試檔與範本產生無謂的差異，不利對照學習。這個不一致列為 KI-29，修補方向見規格書。

`USERS` 不需修改。

### `tests/test_hub.py` 的修改內容

範本有 6 個案例，改後 9 個。兩處變動：

**1. `test_hub_renders_for_guest`（第 9–10 行）**

原本斷言頁面含 `'論壇'`、`'校園活動報名'`、`'歡迎使用'` 三個字串。**刪除 `'校園活動報名'` 那一行，保留另外兩行**——論壇卡片在訪客區仍然存在。

**2. `test_hub_shows_forum_link`（第 26–30 行）零修改**

這個案例斷言 `'論壇'` 與 `'/forum'` 出現在已登入視圖中。論壇卡片保留了，因此**整個案例原樣沿用**。

> 前一版的系統要把這條改寫成 `test_hub_shows_profile_link`。現在不用改了——這是納入論壇後最容易搞混的一處。

**3. 新增三個案例**

```python
def test_hub_shows_admin_card_for_admin(admin_client):
    # 管理員看得到「會員管理」卡片，且連向 /admin/users

def test_hub_hides_admin_card_for_normal_user(authed_client):
    # 一般使用者看不到「會員管理」卡片

def test_hub_guest_can_reach_forum(client):
    # 訪客視圖的論壇卡片是可點擊的 <a>，含 href="/forum"
    # 對照組：個人資料卡片是 <div class="hub-card-locked">，不含 href
```

第三條驗證的是「開放內容 vs 需登入功能」的視覺區分，這是首頁設計的核心意圖，值得用測試釘住。

### `tests/test_admin.py`

約 30 個案例，分五組。完整清單見系統規格書 §12.4。

**權限守門（10 條）** — 這一組最重要的原則是：**被擋下的 POST 必須同時斷言資料庫沒有改變**。只驗 302 無法區分「被權限擋下」與「執行成功後 redirect」。

```python
def test_deactivate_normal_user_forbidden_and_db_unchanged(authed_client):
    resp = authed_client.post('/admin/users/3/deactivate')
    assert resp.status_code == 302
    assert db.find_user_by_id(3)['is_active'] == 0   # 種子值，未被改動
```

其中一條專門守住 §4.4 提到的範本缺陷：

```python
def test_user_list_disabled_admin_redirects_to_login(other_client):
    """role=0 但 is_active=0 的帳號應被第 2 層守門攔下，而非第 3 層。"""
    db.set_user_role(3, 0)          # 讓 id=3 成為管理員（但仍是停用狀態）
    resp = other_client.get('/admin/users')
    assert resp.status_code == 302
    assert '/login' in resp.headers['Location']   # 不是 '/'
```

斷言 Location 是 `/login` 而非 `/` 是這條測試的重點——它區分了「被登出」與「權限不足」兩種處置。

**清單、篩選、搜尋、分頁（7 條）** — 分頁測試需要 local fixture：

```python
@pytest.fixture
def many_users(app):
    for i in range(8):
        db.create_user(f'u{i}@example.com', 'password123', f'測試{i}')
    return 11   # 3 個種子 + 8 個
```

> **效能提醒**：`db.create_user()` 使用 bcrypt cost=10，建立 8 筆約需 0.8 秒。不要為了測分頁而建 50 筆。

**啟用與停用（6 條）**、**角色調整（4 條）**、**刪除（3 條）** — 各組都包含正常流程、自我保護、目標不存在、目標已刪除四種情況。

刪除組的最後一條是整合案例：

```python
def test_deleted_user_cannot_login(admin_client, client):
    admin_client.post('/admin/users/1/delete')
    _set_captcha(client)
    resp = client.post('/login', data={
        'email': USERS['normal']['email'],
        'password': USERS['normal']['password'],
        'captcha': 'ABCDE',
    })
    assert MESSAGES['loginError'] in resp.get_data(as_text=True)
```

注意斷言的是 `loginError`（帳號或密碼錯誤）而非 `accountDisabled`——軟刪除的帳號與不存在的帳號共用同一則訊息，這是系統規格書 §4.2 的刻意設計。

### `tests/test_forum.py` 的修改內容

範本有 39 個案例，全部原樣沿用，**新增 3 條**驗證 Phase 8 的守門修正：

```python
def test_new_post_disabled_user_redirects_to_login(other_client):
    """停用帳號持有舊 session 仍無法發文。"""
    before = db.list_forum_masters(1, 10)[1]
    resp = other_client.post('/forum/new',
                             data={'title': '不該成功', 'content': 'x'})
    assert resp.status_code == 302
    assert '/login' in resp.headers['Location']
    assert db.list_forum_masters(1, 10)[1] == before   # 沒有新增

def test_reply_disabled_user_redirects_to_login(other_client, forum_post):
    """停用帳號持有舊 session 仍無法回覆。"""
    before = len(db.list_forum_details(forum_post))
    resp = other_client.post(f'/forum/reply/{forum_post}',
                             data={'content': '不該成功'})
    assert resp.status_code == 302
    assert '/login' in resp.headers['Location']
    assert len(db.list_forum_details(forum_post)) == before

def test_index_disabled_user_sees_guest_view(other_client):
    """停用帳號仍可瀏覽，但以訪客身分呈現。"""
    resp = other_client.get('/forum')
    assert resp.status_code == 200
    assert '發表文章'.encode() not in resp.data
```

三條都同時斷言 HTTP 回應與資料庫狀態。第三條特別重要——它確保守門修正**沒有**過度攔截，論壇的開放瀏覽仍然成立。

其餘 39 條為什麼零修改：它們測的是論壇自己的行為（瀏覽、發文、回覆、修改、刪除、權限），與被移除的 events、equipment 無關；`forum_post` fixture 也只用 `db.create_forum_master()`，不碰其他子系統。

### `tests/CLAUDE.md` 的改寫

- 目錄結構移除 `test_events.py`、`test_equipment.py`，加入 `test_admin.py`，**保留 `test_forum.py`**
- 更新 `other_client` 的用途說明（新增「停用中的管理員」、forum 守門驗證、KI-03 驗證三項）
- 「常見測試模式」中的 local fixture 範例從 events 改為 forum 的 `forum_post` 與 admin 的 `many_users`，並註明兩者的成本差異（forum 極快、admin 每筆約 0.1 秒）
- 補上「被權限擋下的 POST 必須同時斷言 DB 未改變」這條原則
- 補上「論壇訊息字串不在 `MESSAGES` 中」的說明與 KI-29 的交叉引用

### 驗收

```bash
pytest -q
```
預期：約 `112 passed`，`0 failed`

```bash
pytest tests/test_admin.py -v
```
預期：約 30 個案例全數通過。逐條核對案例名稱與規格書 §12.4 的清單一致

```bash
pytest -q --durations=5
```
預期：最慢的案例不超過 2 秒。若某條明顯超時，通常是在 local fixture 中建立了太多會員（bcrypt cost=10）

```bash
pytest tests/test_forum.py -v
```
預期：42 個案例全數通過

```bash
pytest -k "self" -v
```
預期：三條自我保護案例（deactivate / delete / role）全數通過

```bash
pytest -k "disabled" -v
```
預期：涵蓋 forum 的兩條守門案例、hub 的訪客視圖案例、admin 的停用管理員案例。這一組是「帳號狀態」這條主線的完整覆蓋

### 常見錯誤

- 訊息字串在 Blueprint 與 `tests/data/users.py` 中不一致（多半是半形／全形標點的差異），測試以「找不到預期字串」失敗
- 只斷言 302 不斷言資料庫狀態，讓一個沒有真正生效的權限檢查通過測試
- 忘記 `test_hub.py` 的兩處舊斷言，測試找不到「論壇」而失敗
- 在分頁 fixture 中建立太多會員，整套測試變慢

---

## Phase 11 — Docker

### 目的

建立容器化部署設定。

### 產出檔案

| 檔案 | 來源 | 動作 |
|------|------|------|
| `Dockerfile` | 範本 | 原樣複製 |
| `docker-compose.yml` | 範本 | 原樣複製（volume 名稱可選改） |
| `.dockerignore` | 範本 | Phase 1 已建立 |

三個檔案與子系統無關，可以整份帶走。`docker-compose.yml` 的 named volume 名稱 `db_data` 可以改成語意更明確的 `user_data`，但改了之後既有容器的資料會對不上，**若已有執行中的容器就不要改**。

### 驗收（受限）

本機的 Docker CLI 未安裝（Phase 0 已確認），本階段**只能做靜態檢查**：

```bash
grep -E "EXPOSE|CMD|WORKDIR|FROM" Dockerfile
```
預期：
```text
FROM python:3.11-slim
WORKDIR /app
EXPOSE 4000
CMD ["python", "app.py"]
```

```bash
grep -E "DB_PATH|SECRET_KEY|4000|volumes" docker-compose.yml
```
預期看到 `DB_PATH=/app/data/database.db`、`4000:4000`、volume 掛載設定

```bash
cat .dockerignore
```
預期包含 `__pycache__/`、`*.pyc`、`.git/`、`tests/`

### 待補的動態驗收

取得 Docker 環境後，回頭執行：

```bash
docker compose up -d --build
sleep 5
curl -s localhost:4000/health          # 預期：OK
curl -s -o /dev/null -w "%{http_code}\n" localhost:4000/   # 預期：200
docker compose down
```

驗證資料持久化：

```bash
docker compose up -d --build
# 在瀏覽器中申請一個新帳號
docker compose down          # 注意：不加 -v
docker compose up -d
# 該帳號應仍然存在
docker compose down -v       # 這才會刪除資料
```

### 常見錯誤

- 誤以為靜態檢查通過就等於容器可以跑起來。**這個階段的驗收是不完整的**，文件中必須明確標示
- `docker compose down -v` 與 `docker compose down` 混用，導致資料被意外刪除

---

## Phase 12 — 文件

### 目的

讓所有文件與實際的程式碼一致。這個階段的價值在於：文件漂移是最容易累積、也最難察覺的技術債。

### 產出檔案

| 檔案 | 動作 |
|------|------|
| `CLAUDE.md`（根） | **改寫**（本次已完成，此處僅複查） |
| `README.md` | **修改後複製** |
| `rules/flask-blueprint.md` | **修改後複製** |
| `rules/database.md` | **修改後複製** |
| `document/hub.md` | **修改後複製** |
| `document/profile.md` | **修改後複製** |
| `document/auth.md` | 原樣複製（複查是否有跨系統敘述） |
| `document/forum.md` | **修改後複製**（表名更正 + 守門說明） |
| `document/admin.md` | **全新建立** |
| `document/system-spec.md` | 已完成 |
| `document/build-guide.md` | 本文件，已完成 |

### 根目錄 `CLAUDE.md`

已於本次交付改寫完成。此階段只需複查以下九處是否都已處理：

| 章節 | 應有的狀態 |
|------|-----------|
| 專案說明 | 定位為「會員管理與討論區系統」，明列不含 events／equipment |
| 專案結構 | 無 events／equipment 節點；有 `blueprints/{admin,forum}/`、`db/forum.py`、`static/{admin,profile,forum}.css`、`tests/test_{admin,forum}.py`、六份 `document/` |
| 路由總表 | 21 條（hub 1、auth 4、profile 2、admin 6、forum 7、health 1）；hub 那一列描述為「訪客可瀏覽 + 內嵌登入」而非「redirect /login」 |
| db 套件 | `users.py` 與 `forum.py` 兩個資料模組；users 的函式清單含 `list_users`、`set_user_active`、`set_user_role` |
| `setup/` 章節 | 已整節刪除 |
| 角色與權限 | role=0 含會員管理與論壇刪除權；含自我保護規則 R1–R3；含 forum 的分級守門表 |
| Fixtures 表 | `other_client` 的用途說明已更新為三種 |
| CSS 表 | 六列（common／login／hub／profile／admin／forum） |
| 開發規範文件表 | 含 `document/system-spec.md` 與 `document/build-guide.md` |

### `document/forum.md` 的修改內容

範本這份文件（180 行）大部分可以原樣沿用，但有兩處必須改：

**1. 「資料表」一節的表名。** 範本在 `blueprints/forum/CLAUDE.md` 中誤寫為 `forum_masters`，`document/forum.md` 需複查是否有同樣的錯誤，一併更正為 `forum`。

**2. 「權限規則」一節補上帳號有效性。** 範本只描述了登入與角色兩層，需補上第二層：

> 所有寫入類路由的 `_current_user()` 會在帳號被停用或刪除時回傳 `None`，路由隨即 `session.clear()` 並導向登入頁。因此被管理員停用的帳號無法發文、回覆或修改，即使瀏覽器中的 session 尚未過期。
>
> `GET /forum` 是唯一例外——它把 `None` 當成合法的訪客狀態，繼續以訪客視圖渲染。

### `rules/database.md` 的補充

在「邏輯刪除」一節之後補上例外條款：

> **例外一：管理端查詢。** 供管理員使用的清單函式（如 `list_users`）為了讓管理員能檢視已刪除的紀錄，允許不加 `is_deleted = 0` 的過濾。
>
> **例外二：單筆取得函式。** `find_user_by_email`、`find_user_by_id`、`get_forum_master`、`get_forum_detail` 都不過濾 `is_deleted`，過濾責任交給呼叫端——`utils._is_usable(user)` 或 Blueprint 中的 `if not m or m['is_deleted']`。這讓「不存在」與「已刪除」在資料層可區分，呼叫端才能給出不同的錯誤訊息與 redirect 目標。
>
> 兩類例外的函式**都必須在 docstring 中明確標註**，否則讀者會誤以為是漏寫。
>
> **反過來，列表類函式一律過濾，沒有例外參數。** `list_forum_masters` 與 `list_forum_details` 都硬性帶 `is_deleted = 0`。

同時在「新增 db 模組流程」一節補上：

> **判斷準則：** 新模組的依據是**新資料表**，而非新子系統。
>
> - `db/forum.py` 獨立成模組 → 因為 `forum` 與 `forum_details` 是新資料表
> - 會員管理的 `list_users`、`set_user_active`、`set_user_role` 併入 `db/users.py` → 因為操作的仍是 `users` 表，**不建 `db/admin.py`**
>
> 維持「一張資料表對應一個 `db/` 模組」的原則。一個模組可以管多張表（如 `forum.py` 管兩張），但一張表不應該被兩個模組操作。

在「Transaction」一節補上本系統的三個實例：

> 需要 transaction 的判準是「多張表必須同時成功或同時失敗」。本系統有三處，全部在 `db/forum.py`：
>
> | 函式 | 為何需要 |
> |------|---------|
> | `create_forum_master` | 主檔 INSERT 成功但明細失敗，會留下一篇沒有內文的文章 |
> | `create_forum_detail` | 明細 INSERT 成功但主檔 `updated_at` 沒更新，文章不會浮到列表最上面 |
> | `soft_delete_forum_master` | 主檔標記刪除但明細沒標記，會留下一批孤兒回覆 |
>
> `db/users.py` 的所有函式都只動一張表，因此不需要 transaction，直接 `conn.commit()` 即可。

### `rules/flask-blueprint.md` 的補充

**1. CSS 前綴表更新** — 移除 events／equipment 兩列，**保留 `forum-*`**，加入 `profile-*` 與 `admin-btn-*` 兩列

**2. 「管理員權限」一節補上三段式檢查順序：**

> 權限檢查分三層，順序固定：`@login_required` → `_is_usable(user)` → `_is_admin(user)`。
>
> 順序不可調換的理由：第 2 層失敗代表**身分本身失效**，處置是 `session.clear()` 並導向登入頁；第 3 層失敗代表**身分有效但權限不足**，處置是導回首頁並 flash 說明。若把第 3 層放前面，已被停用的管理員會收到與事實不符的「權限不足」，且 session 不會被清除。
>
> 這三層在每個需要管理員權限的路由開頭**明碼重複寫出**，不抽象成裝飾器。這個重複是刻意的：讀者從任一路由的第一行就能讀出完整的守門條件。

**3. 新增一節「開放瀏覽的子系統」：**

> 若子系統有開放給訪客的頁面（如 `GET /forum`），第 1、2 層可以收斂進 `_current_user()`，讓它在未登入或帳號失效時一律回傳 `None`：
>
> ```python
> def _current_user():
>     if 'user_id' not in session:
>         return None
>     user = db.find_user_by_id(session['user_id'])
>     return user if _is_usable(user) else None
> ```
>
> 但**寫入類路由仍須各自處理 `user is None`**（`session.clear()` + redirect），因為它們接下來會取用 `user['id']`。開放瀏覽的路由則把 `None` 當成合法的訪客狀態繼續渲染。
>
> 不要把 `session.clear()` 塞進 `_current_user()`——訪客與失效帳號在它眼中都是 `None`，但只有後者需要清 session。要區分兩者，helper 就得回傳多種狀態，複雜度會失控。

### `document/admin.md`

格式對齊既有的 `document/profile.md`，章節依序為：

1. `# 會員管理系統文件（admin）`
2. `## 功能定位` — 散文說明 + 檔案位置條列
3. `## 路由` — 方法／路徑／Handler／說明四欄表
4. `## 核心資料流` — 每條路由一個 ```text 區塊的箭頭式 pipeline
5. `## 權限檢查` — 三層機制與順序，以及為何不抽象成裝飾器
6. `## 自我保護規則` — R1–R3 與「最後一個管理員」的論證
7. `## 主要錯誤情境` — 「條件：`錯誤訊息原文`」的條列
8. `## 前端頁面` — `user_list.html` 與 `user_detail.html` 各一個 `###` 子標題
9. `## 使用到的資料層函式`
10. `## 測試對應`

### `document/hub.md` 的修改

- 移除活動報名與器材借用兩張卡片的描述，**保留論壇卡片**
- 補上管理員專屬的「會員管理」卡片，說明其 `{% if user['role'] == 0 %}` 條件
- 補上訪客區的 locked「會員管理」卡片
- 說明訪客區的三張卡片中只有論壇是可點擊的 `<a>`，另兩張是 locked 的 `<div>`
- 「與其他子系統的關係」一節改為列 `forum.index`、`profile.dashboard`、`admin.user_list`、`auth.*`

### `document/profile.md` 的修改

- CSS 段落補上新增的 `static/profile.css`
- 「更新資料」一節補上交叉引用：此路由缺少 `_is_usable` 檢查，詳見系統規格書 KI-03。**並註明 forum 做了相反的處置**，兩者的判準見規格書 §11.0

### `README.md` 的修改

- 系統文件表改為五列（hub／auth／profile／admin／forum）加上兩份新文件的連結
- 技術棧一節修正「bcrypt cost factor 10」的描述——註冊是 cost=10，種子帳號是 cost=4，兩者不同（KI-21）
- 「同學請注意」的觀察重點表可以保留；把「活動報名」的例子換成會員管理，**論壇的例子保留**
- 「資料庫內容注意事項」一節說明本系統沒有預先植入的論壇模擬資料（`setup/` 機制已移除），文章需自行發表

### 驗收

**最關鍵的一條** — 全專案不應殘留任何把 events／equipment 當成本系統組成部分的引用：

```bash
grep -rn "events\|equipment" \
  CLAUDE.md README.md app.py utils.py \
  rules/ document/ blueprints/ templates/ static/ tests/ db/ \
  | grep -v "pointer-events"
```

預期：程式碼與 `CLAUDE.md` 應完全無命中；`document/` 與 `rules/` 下只剩**刻意說明範本血緣的段落**。逐筆檢視每一個命中，確認它的語境是「範圍外」「不搬移」或「與範本對照」，而不是「本系統的組成部分」。

> 注意這條與前一版不同：**`forum` 已不在掃描清單中**，因為論壇現在是本系統的一部分。把 `forum` 加回 grep 會產生上百筆合法的命中，反而讓真正的殘留藏不住。

反過來也要確認論壇**確實被納入**：

```bash
test -f db/forum.py && test -f blueprints/forum/__init__.py && \
test -f templates/forum/index.html && test -f static/forum.css && \
test -f tests/test_forum.py && echo "forum OK"
```
預期：`forum OK`

```bash
grep -c "forum_bp" app.py
```
預期：`2`（import 一次、register 一次）

其他檢查：

```bash
grep -c "setup" CLAUDE.md
```
預期：`0`

```bash
grep -c "list_users\|set_user_active\|set_user_role" CLAUDE.md
```
預期：≥ `1`

```bash
grep -c "db/forum.py\|list_forum_masters" CLAUDE.md
```
預期：≥ `1`

```bash
ls document/
```
預期：`admin.md  auth.md  build-guide.md  forum.md  hub.md  profile.md  system-spec.md`

```bash
grep -rn "forum_masters" blueprints/ document/ db/
```
預期：**無輸出**（表名是 `forum`，範本的誤植已全數更正）

```bash
grep -c "redirect \`/login\`" CLAUDE.md
```
預期：hub 那一列不應再有這個描述

### 常見錯誤

- 改了程式碼卻忘記改對應的 `CLAUDE.md`，文件漂移從第一天就開始累積
- `rules/` 的補充忘記寫，導致後續開發者看到 `list_users` 或 `get_forum_master` 不過濾 `is_deleted` 時以為是 bug
- 殘留掃描時把 `forum` 一起 grep 進去，上百筆合法命中淹沒了真正的問題
- `document/admin.md` 的章節架構與其他四份不一致，破壞了文件系列的可讀性
- 忘記更正 `forum_masters` 這個錯誤表名，文件與 DDL 對不上

---

## Phase 13 — 最終整合驗收

### 目的

確認整個系統可以執行，且行為與系統規格書一致。

### 產出檔案

無。

### 驗收

**1. 測試全綠**

```bash
pytest -q
```
預期：約 `112 passed`

**2. 路由清單與規格書逐條對照**

```bash
python -c "
from app import app
for r in sorted(app.url_map.iter_rules(), key=str):
    print(f'{sorted(r.methods - {\"HEAD\", \"OPTIONS\"})}  {r.rule}  ->  {r.endpoint}')
"
```

預期輸出應與系統規格書 §7.1 的路由總表**逐條對得上**（除了 Flask 自動產生的 `static` 路由）：

```text
['GET', 'POST']  /                                        -> hub.home
['GET']          /admin/users                             -> admin.user_list
['GET']          /admin/users/<int:user_id>               -> admin.user_detail
['POST']         /admin/users/<int:user_id>/activate      -> admin.activate_user
['POST']         /admin/users/<int:user_id>/deactivate    -> admin.deactivate_user
['POST']         /admin/users/<int:user_id>/delete        -> admin.delete_user
['POST']         /admin/users/<int:user_id>/role          -> admin.update_role
['GET']          /captcha.png                             -> auth.captcha_image
['GET']          /forum/                                  -> forum.index
['POST']         /forum/delete/detail/<int:detail_id>     -> forum.delete_detail
['POST']         /forum/delete/master/<int:master_id>     -> forum.delete_master
['GET', 'POST']  /forum/edit/detail/<int:detail_id>       -> forum.edit_detail
['GET', 'POST']  /forum/edit/master/<int:master_id>       -> forum.edit_master
['GET', 'POST']  /forum/new                               -> forum.new_post
['GET', 'POST']  /forum/reply/<int:master_id>             -> forum.reply
['GET']          /health                                  -> health
['GET', 'POST']  /login                                   -> auth.login_page
['GET']          /logout                                  -> auth.logout
['GET']          /profile                                 -> profile.dashboard
['POST']         /profile/update                          -> profile.dashboard_update
['GET', 'POST']  /register                                -> auth.register
```

共 21 條，與規格書 §7.1 的 21 列一一對應。兩點說明：

- `/`、`/login`、`/register` 與論壇的四條各自是**單一 rule 同時接受 GET 與 POST**，不是兩條分開的 rule
- `forum.index` 的 rule 顯示為 `/forum/`（帶尾斜線），但因為宣告時帶了 `strict_slashes=False`，`/forum` 與 `/forum/` 都能命中且不會產生 308 轉址

**3. 手動走完七條旅程**

```bash
rm -f database.db
python app.py
```
開啟 `http://localhost:4000`：

| # | 旅程 | 應觀察到 |
|:--:|------|---------|
| 1 | 訪客首頁 → 點「論壇」卡片 → 返回首頁 → 右側內嵌登入（`user@example.com` / `password123`） | 訪客視圖有三張卡片（論壇可點、個人資料與會員管理 locked）；論壇頁可正常瀏覽，topbar 顯示「登入」，沒有「發表文章」按鈕；登入後看到「歡迎回來，一般使用者！」與「個人資料」「論壇」兩張卡片，**沒有**「會員管理」 |
| 2 | 登出 → 申請帳號 → 填表送出 | 導回 `/login`，頁面頂端顯示「申請成功，請登入」 |
| 3 | 以新帳號登入 → 個人資料 → 修改資料 → 儲存 | 唯讀頁顯示新的姓名；空欄位顯示 `—` |
| 4 | 論壇 → 發表文章 → 送出 → 點自己的文章 → 回覆 | 發文後自動選定該篇；標題留空會顯示「請輸入文章標題」；回覆後該篇浮到列表最上面；內文標示與回覆有視覺區別 |
| 5 | 以另一個帳號登入 → 論壇 → 嘗試修改別人的文章 | 別人的文章列上**沒有「修改」按鈕**；直接輸入 `/forum/edit/master/1` 會被導回並顯示「無權限修改此文章標題」；任何人的文章列上都**沒有「刪除」按鈕** |
| 6 | 登出 → 以 `admin@example.com` / `admin1234` 登入 → 會員管理 | 首頁多出「會員管理」卡片；清單顯示全部會員；四個狀態篩選都能正常切換；搜尋 `admin` 只剩一筆；**自己那一列沒有操作按鈕**；對其他會員可以停用、啟用、調整角色、刪除，每次操作後都有 flash |
| 7 | 管理員 → 論壇 → 刪除一篇有回覆的文章 → 登出 → 以一般使用者登入 → 網址列直接輸入 `/admin/users` | 管理員在每篇文章與每則回覆上都看得到「刪除」；刪除文章時跳出 confirm；確認後整篇連同所有回覆一併消失；一般使用者存取 `/admin/users` 被導回首頁並顯示「無操作權限」 |

**4. 驗證「刻意不對稱」的守門（教材確認）**

這一組同時驗證兩件相反的事：forum 的守門**修好了**，profile 的守門**仍然是壞的**。兩者都必須符合預期，缺一不可。

```bash
python -c "
import db
from app import app
db.DB_PATH = '/tmp/sadchk_asym.db'
db.init_db()
app.config['TESTING'] = True

adm = app.test_client()
with adm.session_transaction() as s: s['user_id'] = 2
usr = app.test_client()
with usr.session_transaction() as s: s['user_id'] = 1

# 停用前先發一篇文，確認正常狀態可用
usr.post('/forum/new', data={'title': '停用前', 'content': 'x'})
print('posts before      :', db.list_forum_masters(1, 10)[1])

adm.post('/admin/users/1/deactivate')
print('is_active         :', db.find_user_by_id(1)['is_active'])

# forum：應被擋下
r = usr.post('/forum/new', data={'title': '停用後', 'content': 'y'})
print('forum  new_post   :', r.status_code, r.headers.get('Location'), db.list_forum_masters(1, 10)[1])

# forum 瀏覽：應仍可讀，但以訪客身分
r2 = usr.get('/forum')
print('forum  browse     :', r2.status_code, '發表文章' in r2.get_data(as_text=True))

# profile GET：應被擋下。注意這一步會 session.clear()，
# 因此必須另開一個乾淨的 client 才能驗 POST。
print('profile GET       :', usr.get('/profile').status_code)

# profile POST：應**成功**（KI-03，刻意保留）
usr2 = app.test_client()
with usr2.session_transaction() as s: s['user_id'] = 1
r3 = usr2.post('/profile/update', data={'name': '停用後改的名字', 'display_name': ''})
print('profile POST      :', r3.status_code, r3.headers.get('Location'))
print('profile POST name :', db.find_user_by_id(1)['name'])
"
```

預期：
```text
posts before      : 1
is_active         : 0
forum  new_post   : 302 /login 1
forum  browse     : 200 False
profile GET       : 302
profile POST      : 302 /profile
profile POST name : 停用後改的名字
```

> **這個 client 必須是全新的，不能重用剛做過 GET 的那一個。** `GET /profile` 的 `_is_usable` 檢查失敗時會執行 `session.clear()`，之後同一個 client 的 POST 會被 `@login_required` 攔下——結果看起來像是 KI-03 已經修好了，其實只是 session 被前一個請求清掉。這個順序陷阱在手動驗證時很容易誤判。

逐行對照：

| 行 | 意義 |
|---|------|
| `forum new_post : 302 /login 1` | 停用後發文被擋，文章總數仍是 1。**守門修正生效** |
| `forum browse : 200 False` | 瀏覽仍可，但看不到發表按鈕。開放閱讀的設計沒有被誤傷 |
| `profile GET : 302` | GET 有做檢查 |
| `profile POST name : 停用後改的名字` | **POST 沒做檢查，資料真的被改了**。這是 KI-03，是刻意保留的缺陷，不是失敗 |

若最後一行顯示的是原本的「一般使用者」，代表有人「順手」修了 KI-03——請還原，並回頭讀規格書 §11.0 的判準。

若 `forum new_post` 那一行顯示的不是 302 而是 `TypeError`，代表 Phase 8 的第 3 步（六條路由的 `None` 防護）沒做完。

清理：`rm -f /tmp/sadchk_asym.db*`

### 完工檢查清單

- [ ] `pytest -q` 全綠，約 112 個案例
- [ ] 路由清單 21 條，與規格書 §7.1 逐條相符
- [ ] 七條手動旅程全部走通
- [ ] **forum 的守門修正生效**（停用帳號無法發文）
- [ ] **KI-03 的缺陷仍在**（停用帳號仍可改自己資料），與規格書 §11.2 一致
- [ ] `grep -rn "events\|equipment"`（排除範本目錄與 `pointer-events`）只剩刻意的對照說明
- [ ] 論壇的六個檔案齊全（`db/forum.py`、blueprint、兩個 template、CSS、測試）
- [ ] `static/` 恰六個 CSS，`.login-form` 恰三處，inline handler 恰八處
- [ ] `document/` 七份文件齊全
- [ ] `grep -rn "forum_masters"` 無輸出
- [ ] 所有 `CLAUDE.md` 與實際程式碼一致

---

## 附錄：完整檔案清單

### A. 原樣複製（25 個）

| 來源（範本相對路徑） | 目的地 | 建立於 |
|---------------------|--------|:--:|
| `utils.py` | `utils.py` | Phase 1 |
| `blueprints/__init__.py` | 同 | Phase 1 |
| `.gitignore` `.gitattributes` `.dockerignore` | 同名 | Phase 1 |
| `.claude/settings.json` | 同 | Phase 1 |
| `db/connection.py` | 同 | Phase 2 |
| **`db/forum.py`** | 同 | **Phase 2** |
| `templates/base.html` | 同 | Phase 3 |
| `static/common.css` `login.css` `hub.css` | 同 | Phase 3 |
| `templates/auth/register.html` | 同 | Phase 4 |
| `blueprints/auth/CLAUDE.md` | 同 | Phase 4 |
| `blueprints/hub/__init__.py` | 同 | Phase 5 |
| `blueprints/profile/__init__.py` | 同 | Phase 6 |
| **`templates/forum/index.html`** | 同 | **Phase 8** |
| **`templates/forum/post_form.html`** | 同 | **Phase 8** |
| **`static/forum.css`** | 同 | **Phase 8** |
| `tests/__init__.py` `tests/data/__init__.py` | 同 | Phase 10 |
| `tests/conftest.py` | 同 | Phase 10 |
| `tests/test_auth.py` `tests/test_profile.py` | 同 | Phase 10 |
| `Dockerfile` `docker-compose.yml` | 同 | Phase 11 |
| `document/auth.md` | 同 | Phase 12 |

`requirements.txt` 已存在於專案根目錄，不需搬移。

### B. 修改後複製（20 個）

| 檔案 | 修改內容 | Phase |
|------|---------|:--:|
| `app.py` | Blueprint 6→5（保留 `forum_bp`）；移除 `setup/` 機制與 `import shutil` | 1、4–7 |
| `db/__init__.py` | 移除 events／equipment 兩組 re-export 與兩個 `_init_*_tables`（**保留 forum**）；users import 加三個新函式 | 2 |
| `db/users.py` | 新增 `list_users`、`set_user_active`、`set_user_role` | 2 |
| `db/CLAUDE.md` | 移除 events／equipment；保留並複查 forum；補三個新函式 | 2 |
| `blueprints/auth/__init__.py` | 刪除 unused 的 `login_required` import | 4 |
| `templates/auth/login.html` | 修正 `</h1>` → `</h2>`；系統名稱 | 4 |
| `templates/hub/home.html` | 刪 4 張跨系統卡片（events／equipment 各兩處，**保留 forum**）；加管理員卡片；訪客區補 locked 卡片 | 5 |
| `blueprints/hub/CLAUDE.md` | 修正「未登入 → redirect /login」的過時描述 | 5 |
| `templates/profile/dashboard.html` | 抽出內嵌 `<style>`；class 加前綴；加 `<link>` | 6 |
| `blueprints/profile/CLAUDE.md` | CSS 段落補上 `profile.css` | 6 |
| **`blueprints/forum/__init__.py`** | **`_current_user()` 加 `_is_usable`；六條寫入路由加 `None` 防護** | **8** |
| **`blueprints/forum/CLAUDE.md`** | **表名 `forum_masters` → `forum`；補守門說明** | **8** |
| `tests/data/users.py` | 修正首行註解；`MESSAGES` 加 admin 11 條 | 10 |
| `tests/test_hub.py` | 刪 1 處舊斷言（保留論壇的）；新增 3 個案例（6→9） | 10 |
| **`tests/test_forum.py`** | **新增 3 條守門案例（39→42）** | **10** |
| `tests/CLAUDE.md` | 目錄結構；`other_client` 三種用途；測試原則 | 10 |
| `rules/flask-blueprint.md` | CSS 前綴表；三段式檢查順序；開放瀏覽子系統一節 | 12 |
| `rules/database.md` | 兩類 `is_deleted` 例外；新模組判斷準則；transaction 三實例 | 12 |
| `README.md` | 文件表五列；bcrypt cost 描述；模擬資料說明 | 12 |
| `document/hub.md` `document/profile.md` **`document/forum.md`** | 見 Phase 12 | 12 |
| `CLAUDE.md`（根） | 九處逐節改寫 | 已完成 |

### C. 全新建立（10 個）

| 檔案 | 說明 | Phase |
|------|------|:--:|
| `static/profile.css` | 從 dashboard.html 內嵌樣式外提，`profile-` 前綴 | 6 |
| `blueprints/admin/__init__.py` | 6 條路由，約 130 行 | 7 |
| `blueprints/admin/CLAUDE.md` | 含「請勿重構守門三行」與自我保護論證 | 7 |
| `templates/admin/user_list.html` | 清單頁 | 7 |
| `templates/admin/user_detail.html` | 明細頁 | 7 |
| `static/admin.css` | `admin-` 前綴，按鈕顏色走 token | 7 |
| `tests/test_admin.py` | 約 30 個案例 | 10 |
| `document/admin.md` | 子系統文件 | 12 |
| `document/system-spec.md` | 系統規格書 | 已完成 |
| `document/build-guide.md` | 本文件 | 已完成 |

### D. 明確不搬移

`db/events.py`、`db/equipment.py`、`blueprints/events/`、`blueprints/equipment/`、`templates/events/`、`templates/equipment/`、`static/events.css`、`static/equipment.css`、`tests/test_events.py`、`tests/test_equipment.py`、`document/events.md`、`database.db`（範本已產生的資料庫檔）、`.claude/settings.local.json`（本機個人設定）、`setup/` 機制（範本中已不存在該目錄，機制隨 `app.py` 一併移除）。

> `document/equipment.md` 不在清單中——範本本來就沒有這份文件（器材借用是最新加入的子系統，文件尚未補上）。這是範本自身的文件缺口，與本次抽取無關。

### E. 論壇相關檔案總覽（跨階段速查）

| 檔案 | 動作 | Phase | 行數 |
|------|------|:--:|:--:|
| `db/forum.py` | 原樣複製 | 2 | 172 |
| `blueprints/forum/__init__.py` | **修改**（守門） | 8 | 248 → 約 262 |
| `blueprints/forum/CLAUDE.md` | **修改**（表名 + 守門） | 8 | — |
| `templates/forum/index.html` | 原樣複製 | 8 | 191 |
| `templates/forum/post_form.html` | 原樣複製 | 8 | 61 |
| `static/forum.css` | 原樣複製 | 8 | 401 |
| `tests/test_forum.py` | **修改**（+3 案例） | 10 | 39 → 42 案例 |
| `document/forum.md` | **修改**（表名 + 守門） | 12 | — |
| `app.py` 的 `forum_bp` | 保留註冊 | 1 | 2 行 |
| `db/__init__.py` 的 forum re-export | 保留 | 2 | 12 行 |
| `templates/hub/home.html` 的論壇卡片 | 保留兩處 | 5 | 10 行 |

論壇共八個檔案，其中**五個原樣複製、三個需要修改**。三個要改的檔案中，只有 `blueprints/forum/__init__.py` 涉及邏輯（守門修正），另兩個是文件與測試的補強。
