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

### 本系統的四個實例

判準是「多張表必須同時成功或同時失敗」。全部在 `db/equipment.py`：

| 函式 | 為何需要 |
|------|---------|
| `create_borrow_order` | 主檔 INSERT 成功但明細失敗，會留下一張沒有借用項目的借用單 |
| `update_borrow_order` | 舊明細標記刪除後、新明細寫入前失敗，會留下一張沒有項目的待審核單 |
| `mark_order_borrowed` | 借用單改為 `borrowed` 但 `equipment.available_quantity` 沒扣，庫存與實況不符 |
| `mark_order_returned` | 借用單改為 `returned` 但庫存沒還原，器材會永久少一份 |

`db/users.py` 的所有函式都只動一張表，因此不需要 transaction，直接 `conn.commit()` 即可。
`cancel_order`、`approve_order`、`reject_order` 只更新 `borrow_orders` 與 `borrow_order_items`
兩張狀態表、不觸碰庫存，沿用原始碼的 `conn.commit()` 寫法（見 `document/system-spec.md` 第 11 章 KI-05）。


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

**例外二：單筆取得函式。** `find_user_by_email`、`find_user_by_id` 一律不過濾，
過濾責任交給呼叫端——`utils._is_usable(user)`。
這讓「不存在」與「已刪除」在資料層可區分，呼叫端才能給出不同的錯誤訊息與 redirect 目標。

兩類例外的函式**都必須在 docstring 中明確標註**，否則讀者會誤以為是漏寫。

反過來，**列表類函式一律過濾，沒有例外參數**：`list_equipment`、`list_my_orders`、
`list_all_orders`、`list_order_items` 都硬性帶 `is_deleted = 0`。
`get_equipment` 也帶 `is_deleted = 0`——器材被刪除後就不該再出現在任何借用流程裡，
與 users 的「保留可區分性」需求不同。



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

- `db/equipment.py` 獨立成模組 → 因為 `equipment`、`borrow_orders`、`borrow_order_items` 是新資料表
- 會員管理的 `list_users`、`set_user_active`、`set_user_role` 併入 `db/users.py`
  → 因為操作的仍是 `users` 表，**不建 `db/admin.py`**

維持「一張資料表對應一個 `db/` 模組」的原則。一個模組可以管多張表（如 `equipment.py` 管三張），
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
