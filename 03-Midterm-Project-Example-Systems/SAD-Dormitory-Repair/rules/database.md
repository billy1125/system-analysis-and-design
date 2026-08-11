# `db/` 套件使用規範

本文件規範此專案中資料庫存取層（`db/` 套件）的撰寫方式。

---

## 核心原則

- **所有 SQL 都寫在 `db/` 套件內**，Blueprint 路由只呼叫 `db.*` 函式，不直接執行 SQL
- 新資料表的存取邏輯建立新模組（`db/<name>.py`），並在 `db/__init__.py` 匯出
- **`db/` 不做權限判斷，但做狀態判斷。** 「這個人可不可以」是 Blueprint 的事（看 session）；「這張單現在可不可以」是 `db/` 的事（看資料）

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

### 本系統的實例

判準是「多張表必須同時成功或同時失敗」。全部在 `db/repair.py`：

| 函式 | 為何需要 |
|------|---------|
| `create_request` | 主檔 INSERT 成功但首則描述失敗，會留下一張沒有描述的報修單，維修人員無從判斷要修什麼 |
| `update_request` | 主檔的標題改了但描述沒改，兩邊會對不上 |
| `create_log` | 紀錄寫了但主檔的 `updated_at` 沒更新，這張單不會浮到列表最上面 |
| `soft_delete_request` | 主檔標記刪除但明細沒標記，會留下一批孤兒紀錄 |
| 六個狀態轉移函式 | 狀態變了但沒有稽核紀錄，或有紀錄但狀態沒變 |

`db/users.py` 的所有函式都只動一張表，因此不需要 transaction，直接 `conn.commit()` 即可。

---

## 狀態轉移函式

本系統的報修單有六個狀態、七條轉移。**所有狀態異動都必須經由 `db/repair.py` 的六個轉移函式**，Blueprint 不得直接 `UPDATE request_status`。

### 四條規則

**規則一：前置狀態寫在 `WHERE` 子句裡。**

```python
# ✅ 正確
row = conn.execute(
    "SELECT * FROM repair_requests"
    " WHERE id = ? AND is_deleted = 0 AND request_status = 'pending'",
    (request_id,)
).fetchone()
if not row:
    conn.close()
    return False

# ❌ 錯誤
row = conn.execute('SELECT * FROM repair_requests WHERE id = ?', (request_id,)).fetchone()
if not row or row['request_status'] != 'pending':
    conn.close()
    return False
```

兩者的差別在於**查詢與更新之間有沒有空隙**。錯誤的寫法在兩個管理員同時操作時，兩邊都可能讀到 `pending` 而雙雙通過檢查。把條件放進 `WHERE`，加上 SQLite 的寫入鎖，只有先到的那個會撈到資料。

（嚴格來說仍有殘餘窗口，完整修補見規格書 KI-13。但正確的寫法讓窗口小到實務上不會發生，錯誤的寫法則是必然會撞上。）

**規則二：主檔更新與稽核紀錄在同一個 transaction。**

```python
with conn:
    conn.execute("UPDATE repair_requests SET request_status = 'assigned', ... WHERE id = ?", ...)
    conn.execute("INSERT INTO repair_logs (... 'status' ...) VALUES (...)", ...)
```

不允許「狀態變了但沒有紀錄」，也不允許「有紀錄但狀態沒變」。稽核軌跡一旦可能不完整，就失去全部價值。

**規則三：回傳布林值，不拋例外。**

轉移失敗（狀態不符、單不存在、參數無效）一律 `return False`，由 Blueprint 決定要顯示什麼訊息。理由是這些都是**預期中的**業務狀況，不是程式錯誤。

代價是 Blueprint 拿到 `False` 時無從得知失敗的確切原因，訊息只能寫成「無法…（報修單狀態不符）」。這是分層帶來的資訊損失，可以接受——三種情況對使用者的意義相同：這個操作現在做不了。

**規則四：一個函式一條轉移，不合併。**

六個函式的結構高度重複，**刻意不抽象成單一的 `_transition(from_status, to_status, ...)`**。理由是讀者從任何一個函式就能讀出「這條轉移的前置狀態、後置狀態、附帶欄位、紀錄文字」的完整定義，不需要跳到別處查表。

### 稽核紀錄的型別限制

`repair_logs.log_type` 有三個值，其中 `'status'` **只能由轉移函式建立**。`create_log()` 因此明確拒絕它：

```python
def create_log(request_id, user_id, content, log_type='comment'):
    if log_type not in ('report', 'comment'):
        return None
```

沒有這道防線，就可能出現「有狀態紀錄但主檔狀態沒變」的假歷程。

---

## 邏輯刪除（Soft Delete）

所有刪除操作設定 `is_deleted = 1`，**不執行 `DELETE`**：

```python
def soft_delete_item(item_id):
    conn = _get_conn()
    conn.execute('UPDATE items SET is_deleted = 1 WHERE id = ?', (item_id,))
    conn.commit()
    conn.close()
```

查詢時一律加上 `is_deleted = 0` 過濾。布林值在 SQLite 中用整數表示：`0` = false，`1` = true。

### 例外：不過濾 `is_deleted` 的函式

**例外一：管理端清單。** `list_users()` 依 `status` 參數決定是否過濾，因為管理員的職責就是要能檢視已刪除的紀錄。

> 注意 `list_all_requests()` **不屬於**這個例外——它硬性過濾 `is_deleted = 0`。報修單沒有「檢視已刪除紀錄」的業務需求：刪除在這裡的語意是「這張單根本不該存在」（重複申報、誤送、測試資料），不是「已結束的歷史」。已結束的歷史用的是 `completed` / `rejected` / `cancelled` 三個終態，它們仍然看得到。
>
> 同一個系統裡兩張表的軟刪除有不同的可見性，這個不一致是刻意的，記錄為 KI-24。

**例外二：單筆取得函式。** `find_user_by_email`、`find_user_by_id`、`get_request` 一律不過濾，過濾責任交給呼叫端（`utils._is_usable(user)` 或 Blueprint 中的 `if not req or req['is_deleted']`）。這讓「不存在」與「已刪除」在資料層可區分。

兩類例外的函式**都必須在 docstring 中明確標註**，否則讀者會誤以為是漏寫。

反過來，**列表類函式一律過濾，沒有例外參數**：`list_my_requests` 與 `list_logs` 都硬性帶 `is_deleted = 0`。

---

## JOIN 的注意事項

報修單有兩個指向 `users` 的欄位，它們的 JOIN 型別**不同**：

```sql
FROM repair_requests r
JOIN users req ON req.id = r.requester_id        -- 申報人一定存在
LEFT JOIN users asg ON asg.id = r.assigned_to    -- 承辦人可能是 NULL
```

第二個寫成 `JOIN` 的話，所有還沒派工的報修單會從清單中消失——而那正是管理員最需要看到的一批。這是本系統最容易犯、也最難自己發現的 SQL 錯誤：畫面不會報錯，只是少了幾筆。

顯示名稱一律用三段退回：

```sql
COALESCE(u.name, u.display_name, u.email) AS requester_display
```

種子帳號 3 的 `name` 刻意留 NULL，就是為了讓這個行為在畫面上看得到。

---

## 排序的次要鍵

依時間排序時，必須加上 `id` 作為次要排序鍵：

```sql
ORDER BY r.updated_at DESC, r.id DESC      -- 列表
ORDER BY l.created_at ASC, l.id ASC        -- 時間軸
```

理由是種子資料與測試中經常在同一秒內建立多筆紀錄，SQLite 的 `datetime('now')` 只精確到秒。只用時間排序，順序會不確定，測試會間歇性失敗。

---

## 分頁查詢的回傳慣例

列表查詢函式回傳 `(items, total)` tuple：

```python
def list_items(page, page_size):
    conn = _get_conn()
    offset = (page - 1) * page_size
    total = conn.execute('SELECT COUNT(*) FROM items WHERE is_deleted = 0').fetchone()[0]
    items = conn.execute(
        'SELECT ... FROM items WHERE is_deleted = 0 ORDER BY ... LIMIT ? OFFSET ?',
        (page_size, offset)
    ).fetchall()
    conn.close()
    return items, total
```

呼叫端要注意解包順序。只需要總數時可以寫 `_, total = db.list_my_requests(uid, 1, 1, 'all')`——這會浪費一次索引查詢，但省下再寫一個 count 函式。

---

## 其他回傳值慣例

| 情境 | 回傳值 |
|---|---|
| 查詢單筆（找不到時） | `None` |
| 新增成功 | 新增的 `id`（`lastrowid`） |
| 新增失敗（參數無效） | `None` |
| 狀態轉移 | `True` / `False` |
| 分頁查詢 | `(items, total)` |
| 統計查詢 | dict（缺漏的鍵補 0，如 `count_by_status()`） |

---

## 新增 db 模組流程

1. 建立 `db/<name>.py`，實作 `_init_<name>_tables(conn)` 與所有資料存取函式
2. 在 `db/__init__.py` 加入 `from .<name> import ...`
3. 在 `init_db()` 中呼叫 `_init_<name>_tables(conn)` 與 `_seed_<name>_if_empty(conn)`
4. Blueprint 透過 `import db` → `db.func()` 呼叫

### 判斷準則：新資料表，不是新子系統

- `db/repair.py` 獨立成模組 → 因為 `repair_requests` 與 `repair_logs` 是新資料表
- `list_active_admins()` 雖然只有 repair 用得到，但它操作 `users` 表，因此放在 `db/users.py`
- 會員管理的 `list_users`、`set_user_active`、`set_user_role` 同理留在 `users.py`，**不建 `db/admin.py`**

維持「一張資料表對應一個 `db/` 模組」的原則。一個模組可以管多張表（`repair.py` 管兩張），但一張表不應該被兩個模組操作。

---

## 種子資料

每個模組提供 `_seed_<name>_if_empty(conn)`，在對應資料表**為空時**才植入：

```python
def _seed_repair_if_empty(conn):
    count = conn.execute('SELECT COUNT(*) FROM repair_requests').fetchone()[0]
    if count > 0:
        return
    ...
```

**有依賴關係的種子必須排序。** `_seed_repair_if_empty()` 排在 `_seed_users_if_empty()` 之後，因為報修單的 `requester_id` 與 `assigned_to` 指向那四個帳號。

**時間戳要明確指定**，不用預設值：

```python
created = f"datetime('now', '-{minutes_ago} minutes')"
```

若全部在同一秒內建立，`updated_at` 會完全相同，列表排序變得不確定，看不出「最近有異動的單會浮上來」這個行為。

---

## 測試時的 DB 替換

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
