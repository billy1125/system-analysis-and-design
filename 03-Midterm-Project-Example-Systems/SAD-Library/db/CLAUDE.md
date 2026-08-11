# db 套件

## 職責

統一管理所有 SQLite 資料存取邏輯，以模組拆分降低各 Blueprint 間的耦合。
**借閱業務規則（借期、冊數上限、續借次數、預約遞補）也在這一層**，Blueprint 不重複判斷。

---

## 套件結構

```
db/
├── __init__.py       # 定義 DB_PATH；匯出所有公開函式；init_db()
├── connection.py     # _get_conn()：建立連線
├── users.py          # 使用者資料存取（users 表）
├── books.py          # 書目與複本（books、book_copies 兩表）
├── loans.py          # 借閱單與借閱政策常數（loans 表）
└── reservations.py   # 預約（reservations 表）
```

模組拆分的依據是**資料表群組**，不是子系統。會員管理的 `list_users`、`set_user_active`
操作的仍是 `users` 表，因此併入 `users.py`，**不另建 `admin.py`**；
`books.py` 同時管 `books` 與 `book_copies`，因為兩者是主檔與明細，永遠一起變動。

---

## `__init__.py`

- `DB_PATH` — 資料庫路徑，預設 `database.db`，可由環境變數 `DB_PATH` 覆寫
- 測試時透過 `db.DB_PATH = str(tmp_path / 'test.db')` 動態替換，無需重啟 app
- `init_db()` — 建立五張資料表並植入種子資料

建表順序有相依性：

```
users → books/book_copies → loans → reservations → 種子帳號 → 種子書目
```

`loans` 的查詢會 JOIN `books` 與 `book_copies`，`books.soft_delete_book()` 會寫
`reservations`，因此表必須先全部建好再開始用。

---

## `connection.py`

```python
def _get_conn() -> sqlite3.Connection
```

- 每次呼叫時重新讀取 `db.DB_PATH`（確保測試替換即時生效）
- 啟用 WAL 模式（`PRAGMA journal_mode=WAL`）
- `row_factory = sqlite3.Row`（欄位可用名稱存取）
- 每個函式自行呼叫 `_get_conn()` 並在結束前 `conn.close()`

---

## 資料表

### `users`

欄位在建立之後未再變更。`role` 0 = 館員（管理員），1 = 讀者。

### `books` — 書目主檔

| 欄位           | 型別    | 說明                                  |
| -------------- | ------- | ------------------------------------- |
| `id`           | INTEGER | PK                                    |
| `isbn`         | TEXT    | 已移除連字號的 10 或 13 碼            |
| `title`        | TEXT    | 書名                                  |
| `author`       | TEXT    | 作者                                  |
| `publisher`    | TEXT    | 出版者，可空                          |
| `publish_year` | INTEGER | 出版年，可空                          |
| `category`     | TEXT    | 分類代碼                              |
| `description`  | TEXT    | 內容簡介，可空                        |
| `book_status`  | TEXT    | `available` / `unavailable`           |
| `is_deleted`   | INTEGER | 邏輯刪除                              |

### `book_copies` — 館藏複本明細

| 欄位           | 型別    | 說明                                              |
| -------------- | ------- | ------------------------------------------------- |
| `book_id`      | INTEGER | 對應 `books.id`                                   |
| `copy_barcode` | TEXT    | `{book_id:04d}-{seq:03d}`，例如 `0007-002`        |
| `copy_status`  | TEXT    | `available` / `borrowed` / `maintenance` / `lost` |

### `loans` — 借閱單

`borrowed_at`、`due_at`、`returned_at`、`renew_count`、`loan_status`。
`loan_status` 只有 `borrowed` 與 `returned`；**逾期不存欄位**。

### `reservations` — 預約

`reserved_at`、`ready_at`、`reservation_status`（`waiting` / `ready` / `fulfilled` / `cancelled`）。

---

## 兩個刻意不存的欄位

### 可借數量

`books` 沒有 `available_copies` 欄位，一律由 `book_copies` 即時彙總：

```sql
(SELECT COUNT(*) FROM book_copies c
  WHERE c.book_id = b.id AND c.is_deleted = 0 AND c.copy_status = 'available')
  AS available_copies
```

另一種常見寫法是把「可借數量」存成欄位，
每次借還都要記得同步。改成彙總後，主檔與明細不可能不一致——代價是每次查詢多一個子查詢，
在本系統的資料量下可以忽略。

### 逾期狀態

同理，`loans` 沒有 `overdue` 狀態，由查詢當下推導：

```sql
CASE WHEN l.returned_at IS NULL AND l.due_at < datetime('now')
     THEN 1 ELSE 0 END AS is_overdue
```

存成欄位就需要排程更新，而這個系統沒有排程器。

---

## 回傳值慣例

| 情境                     | 回傳值                                          |
| ------------------------ | ----------------------------------------------- |
| 查詢單筆（找不到時）     | `None`                                          |
| 列表查詢（分頁）         | `(items, total)` tuple                          |
| 新增成功                 | 新增的 `id`（`lastrowid`）                      |
| 狀態判斷型操作           | 字串狀態碼                                      |
| 狀態判斷型操作 + 新 id   | `(狀態碼, id)` tuple，失敗時 id 為 `None`       |

字串狀態碼一覽（Blueprint 以字典把它們翻成使用者訊息）：

| 函式                    | 可能的狀態碼                                                                     |
| ----------------------- | -------------------------------------------------------------------------------- |
| `borrow_book`           | `ok` `missing` `book_unavailable` `has_overdue` `limit_reached` `already_borrowed` `no_copy` |
| `renew_loan`            | `ok` `missing` `forbidden` `returned` `overdue` `limit_reached` `reserved`        |
| `return_loan`           | `ok` `missing` `returned`                                                         |
| `create_reservation`    | `ok` `missing` `book_unavailable` `available` `already_borrowed` `duplicate`       |
| `cancel_reservation`    | `ok` `missing` `forbidden` `closed`                                               |
| `soft_delete_book`      | `deleted` `on_loan` `missing`                                                     |
| `soft_delete_copy`      | `deleted` `on_loan` `missing`                                                     |
| `set_copy_status`       | `updated` `on_loan` `missing`                                                     |

---

## Transaction

跨表更新一律用 `with conn:`：

- `create_book()` — 主檔 + N 筆複本
- `borrow_book()` — 借閱單 + 複本狀態 + 預約完成
- `return_loan()` — 借閱單 + 複本狀態 + 預約遞補
- `soft_delete_book()` — 書目 + 複本 + 取消等待中的預約
- `cancel_reservation()` — 預約 + 可能的遞補

`_promote_next_reservation(conn, book_id)` 是唯一接受外部 `conn` 的函式，
因為它必須跑在呼叫端已開啟的 transaction 內，所以自己不 commit。
它定義在 `loans.py`，`reservations.py` 在函式內 import 以避免循環相依。

---

## 邏輯刪除

所有刪除都是 `is_deleted = 1`，查詢一律加 `is_deleted = 0`。
唯一的例外是 `list_users()`：館員的職責就是要能檢視已刪除的帳號，
該函式以 `status='deleted'` 參數明確表達這個意圖。

---

## 借閱政策常數（`loans.py`）

```python
LOAN_PERIOD_DAYS  = 14
RENEW_PERIOD_DAYS = 14
MAX_ACTIVE_LOANS  = 5
MAX_RENEW_COUNT   = 1
```

由 `db/__init__.py` 匯出，Blueprint 與模板都直接引用 `db.MAX_ACTIVE_LOANS`，
**不在別處寫死數字**。改政策只需要動這四行；訊息字串中的數字也用 f-string 帶入。

---

## 種子資料

- 3 個帳號（`users.py`）
- 10 筆書目、18 本複本（`books.py`）

種子只在對應資料表為空時植入。**不植入借閱與預約**，讓測試從乾淨的交易狀態開始。
