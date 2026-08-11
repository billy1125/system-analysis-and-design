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

### 本系統的七個實例

判準是「多張表必須同時成功或同時失敗」。全部在 `db/meals.py`：

| 函式 | 為何需要 |
|------|---------|
| `create_meal_order` | 主檔 INSERT 成功但明細失敗，會留下一張沒有品項的空訂單 |
| `update_meal_order` | 舊明細已軟刪除但新明細寫入失敗，訂單會變成空的 |
| `confirm_meal_order` | 訂單狀態改成 confirmed 但庫存沒扣，系統會超賣 |
| `cancel_meal_order` | 訂單狀態改成 cancelled 但庫存沒回補，那些份數永久少掉 |
| `admin_cancel_meal_order` | 同上 |
| `reject_meal_order` | 主檔改成 rejected 但明細還停在 pending，兩張表的狀態不一致 |
| `complete_meal_order` | 主檔與明細的狀態必須一致 |

`db/users.py` 的所有函式都只動一張表，因此不需要 transaction，直接 `conn.commit()` 即可。
`db/meals.py` 中只動 `meals` 一張表的函式（`create_meal`、`update_meal`、
`soft_delete_meal`）同理。

> 涉及庫存的三個函式（confirm、cancel、admin_cancel）是最容易被忽略的一類：
> 它們表面上「只是改個狀態」，但狀態與庫存是同一件事實的兩個面向，分開寫就會有
> 狀態說已取消、份數卻沒還回來的中間狀態。


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

**例外二：單筆取得函式。** `find_user_by_email`、`find_user_by_id`、`get_meal`、`get_meal_order`
一律不過濾，過濾責任交給呼叫端——`utils._is_usable(user)` 或 Blueprint 中的
`if not m or m['is_deleted']`。這讓「不存在」與「已刪除」在資料層可區分，呼叫端才能
給出不同的錯誤訊息與 redirect 目標。

兩類例外的函式**都必須在 docstring 中明確標註**，否則讀者會誤以為是漏寫。

反過來，**列表類函式一律過濾，沒有例外參數**：`list_meals`、`list_orderable_meals`、
`list_order_items`、`list_my_orders`、`list_all_orders` 都硬性帶 `is_deleted = 0`。

**例外三：歷史資料的關聯查詢。** `list_order_items()` 的
`LEFT JOIN meals ON m.id = i.meal_id` **不帶** `AND m.is_deleted = 0`。

餐點被下架後，既有訂單明細仍須顯示得出**完整的名稱**——訂單記錄的是「當時訂了什麼」，
這個事實不因餐點後來下架而改變。若把過濾條件塞進 JOIN，下架後所有歷史訂單的品項名稱
會一起變成空白。

那為什麼是 `LEFT JOIN` 而不是 `JOIN`？因為系統沒有外鍵約束（KI-13），`meal_id` 有可能
指向一列根本不存在的資料。`JOIN` 會讓那筆明細整列消失，訂單的品項加總對不上
`total_amount`；`LEFT JOIN` 保留明細、只讓名稱為 `NULL`，由樣板顯示「（餐點已下架）」。

一般化的規則：**`is_deleted` 的過濾條件只出現在「查詢目前有效資料」的列表函式中，
不出現在「還原歷史事實」的關聯查詢中。**



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

- `db/meals.py` 獨立成模組 → 因為 `meals`、`meal_orders`、`meal_order_items` 是新資料表
- 會員管理的 `list_users`、`set_user_active`、`set_user_role` 併入 `db/users.py`
  → 因為操作的仍是 `users` 表，**不建 `db/admin.py`**
- 訂餐的管理端函式（`confirm_meal_order`、`list_all_orders` 等）併入 `db/meals.py`
  → 同理，操作的仍是那三張表，**不建 `db/meal_admin.py`**

維持「一張資料表對應一個 `db/` 模組」的原則。一個模組可以管多張表（如 `meals.py` 管三張），
但一張表不應該被兩個模組操作。

三張表放在同一個模組，是因為它們構成一個完整的語意單位：離開 `meal_orders` 單獨看
`meal_order_items` 沒有意義，而扣減庫存的動作同時觸及 `meals` 與 `meal_orders`。


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
