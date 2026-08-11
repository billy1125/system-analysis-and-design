# db/ 套件使用規範

本文件規範此專案中資料庫存取層（`db/` 套件）的撰寫方式。

---

## 核心原則

- **所有 SQL 都寫在 `db/` 套件內**，Blueprint 路由只呼叫 `db.*` 函式，不直接執行 SQL
- 新子系統的資料存取邏輯建立新模組（`db/<name>.py`），並在 `db/__init__.py` 匯出

---

## 連線模式

每個函式自行取得連線，結束前關閉：

```python
from db.connection import _get_conn

def get_something(id):
    conn = _get_conn()
    row = conn.execute('SELECT * FROM table WHERE id = ?', (id,)).fetchone()
    conn.close()
    return row
```

- `_get_conn()` 每次呼叫都重新讀取 `db.DB_PATH`，測試時動態替換路徑即可生效
- 回傳的 Row 物件支援欄位名稱存取：`row['column_name']`

---

## Transaction

多張資料表需同時更新時，使用 `with conn:` 包住所有操作（自動 commit / rollback）：

```python
def create_with_detail(title, content, user_id):
    conn = _get_conn()
    with conn:
        master_id = conn.execute(
            'INSERT INTO masters (title, user_id) VALUES (?, ?)',
            (title, user_id)
        ).lastrowid
        conn.execute(
            'INSERT INTO details (master_id, content) VALUES (?, ?)',
            (master_id, content)
        )
    conn.close()
    return master_id
```

---

### 本系統的三個實例

判準是「多張表必須同時成功或同時失敗」。全部在 `db/events.py`：

| 函式 | 為何需要 |
|------|---------|
| `create_event` | 主表 INSERT 成功但副表失敗，會留下一場沒有活動內容的活動 |
| `update_event` | 主表更新成功但副表失敗，畫面上的基本資訊與活動說明會互相矛盾 |
| `soft_delete_event` | 主表標記刪除但副表沒標記，會留下一筆孤兒的 `event_details` |
| `create_or_restore_registration` | 先 SELECT 判斷有無舊紀錄、再決定 INSERT 或 UPDATE，兩步之間必須是一個原子操作 |

`db/users.py` 的所有函式都只動一張表，因此不需要 transaction，直接 `conn.commit()` 即可。
`db/events.py` 中只動 `registrations` 一張表的函式（`cancel_registration`、`update_registration`）同理。


## 邏輯刪除（Soft Delete）

所有刪除操作設定 `is_deleted = 1`，**不執行 `DELETE`**：

```python
def soft_delete_item(item_id):
    conn = _get_conn()
    conn.execute('UPDATE items SET is_deleted = 1 WHERE id = ?', (item_id,))
    conn.commit()
    conn.close()
```

查詢時一律加上 `is_deleted = 0` 過濾條件：

```python
WHERE is_deleted = 0
```

布林值在 SQLite 中用整數表示：`0` = false，`1` = true。

---

### 例外：不過濾 `is_deleted` 的函式

**例外一：管理端清單。** `list_users()` 為了讓管理員檢視已刪除的紀錄，依 `status` 參數決定是否過濾。

**例外二：單筆取得函式。** `find_user_by_email`、`find_user_by_id`、`get_event`、`get_event_for_edit`
一律不過濾，過濾責任交給呼叫端——`utils._is_usable(user)` 或 Blueprint 中的 `if not ev or ev['is_deleted']`。
這讓「不存在」與「已刪除」在資料層可區分，呼叫端才能給出不同的錯誤訊息與 redirect 目標。

**例外三：`list_my_registrations()`。** 它 JOIN `events` 但刻意**不**過濾 `events.is_deleted`——
活動被撤銷之後，報名者仍應該在自己的紀錄中看得到這筆資料。它同時把 `e.is_deleted` 一併選出來，
讓模板能加上「活動已撤銷」的標記。

三類例外的函式**都必須在 docstring 中明確標註**，否則讀者會誤以為是漏寫。

反過來，**其餘列表類函式一律過濾，沒有例外參數**：`list_events`、`list_registrations`、
`list_all_registrations` 都硬性帶 `is_deleted = 0`。



## 分頁查詢的回傳慣例

列表查詢函式回傳 `(items, total)` tuple：

```python
def list_items(page, page_size):
    conn = _get_conn()
    offset = (page - 1) * page_size
    items = conn.execute(
        'SELECT ... FROM items WHERE is_deleted = 0 ORDER BY ... LIMIT ? OFFSET ?',
        (page_size, offset)
    ).fetchall()
    total = conn.execute(
        'SELECT COUNT(*) FROM items WHERE is_deleted = 0'
    ).fetchone()[0]
    conn.close()
    return items, total
```

---

## 其他回傳值慣例

| 情境 | 回傳值 |
|---|---|
| 查詢單筆（找不到時） | `None` |
| 新增成功 | 新增的 `id`（`lastrowid`） |
| 狀態判斷型操作（如 restore） | 字串常數（如 `'created'`、`'restored'`、`'duplicate'`） |

---

## 新增 db 模組流程

1. 建立 `db/<name>.py`，實作所有資料存取函式
2. 在 `db/__init__.py` 加入 `from db.<name> import func1, func2, ...`
3. Blueprint 透過 `import db` → `db.func1()` 呼叫

---

### 判斷準則：新資料表，不是新子系統

- `db/events.py` 獨立成模組 → 因為 `events`、`event_details`、`registrations` 是新資料表
- 會員管理的 `list_users`、`set_user_active`、`set_user_role` 併入 `db/users.py`
  → 因為操作的仍是 `users` 表，**不建 `db/admin.py`**
- 報名相關的函式併入 `db/events.py` → 因為 `registrations` 與活動是同一組資料表，
  且 `list_events()` 必須 JOIN 它才能算出報名人數，**不建 `db/registrations.py`**

維持「一張資料表對應一個 `db/` 模組」的原則。一個模組可以管多張表（如 `events.py` 管三張），
但一張表不應該被兩個模組操作。


## 測試時的 DB 替換

測試中直接覆寫 `db.DB_PATH`，不需要重啟 app：

```python
# tests/conftest.py
import db

@pytest.fixture
def app(tmp_path):
    db.DB_PATH = str(tmp_path / 'test.db')
    db.init_db()
    ...
```

`hard_delete_user_by_email` 等以 `hard_delete_` 為前綴的函式**僅供測試清理使用**，不在正式業務邏輯中呼叫。
