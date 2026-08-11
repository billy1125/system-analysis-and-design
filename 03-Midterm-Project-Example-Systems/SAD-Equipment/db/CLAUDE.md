# db 套件

## 職責

統一管理所有 SQLite 資料存取邏輯。**所有 SQL 都寫在這個套件內**，Blueprint 只呼叫 `db.*` 函式，不直接執行 SQL（見 `rules/database.md`）。

---

## 套件結構

```
db/
├── __init__.py     # 定義 DB_PATH；匯出所有公開函式；init_db()
├── connection.py   # _get_conn()：建立連線（WAL、row_factory）
├── users.py        # 使用者資料存取 + 種子帳號
└── equipment.py    # 器材與借用單資料存取 + 種子器材
```

---

## `__init__.py`

- `DB_PATH` — 資料庫路徑，預設 `database.db`，可由環境變數 `DB_PATH` 覆寫
- 測試時透過 `db.DB_PATH = str(tmp_path / 'test.db')` 動態替換，無需重啟 app
- `init_db()` — 建立四張資料表（`users`、`equipment`、`borrow_orders`、`borrow_order_items`）並植入種子資料

`init_db()` 的呼叫順序固定：先建 `users` 表，再建器材相關表，然後植入種子帳號、種子器材。
schema 全部以 `CREATE TABLE IF NOT EXISTS` 建立，因此重複呼叫是安全的；本專案沒有 migration 機制，
欄位變更的作法是刪掉 `database.db` 重新啟動。

---

## `connection.py`

```python
def _get_conn() -> sqlite3.Connection
```

- **每次呼叫時才 `from db import DB_PATH`**，確保測試替換立即生效
- 啟用 WAL 模式（`PRAGMA journal_mode=WAL`）
- `row_factory = sqlite3.Row`（欄位可用名稱存取）
- 每個函式自行呼叫 `_get_conn()` 並在結束前 `conn.close()`，不使用 Flask `g` 或 `teardown_appcontext`

---

## `users.py`

### 資料表：`users`

| 欄位            | 型別    | 說明                            |
| --------------- | ------- | ------------------------------- |
| `id`            | INTEGER | 主鍵                            |
| `email`         | TEXT    | UNIQUE，不可為 NULL             |
| `hash`          | TEXT    | bcrypt 雜湊（cost=10）          |
| `role`          | INTEGER | `0`=管理員 / `1`=一般使用者     |
| `name`          | TEXT    | 姓名（可為 NULL）               |
| `display_name`  | TEXT    | 顯示名稱（可為 NULL）           |
| `is_active`     | INTEGER | `1`=啟用 / `0`=停用             |
| `is_deleted`    | INTEGER | 邏輯刪除旗標                    |
| `created_at`    | TEXT    | 建立時間                        |
| `last_login_at` | TEXT    | 最後登入時間（可為 NULL）       |

### 公開函式

| 函式 | 說明 |
|------|------|
| `find_user_by_email(email)` | 以 email 查詢，含 `hash`（供登入驗證）；不過濾 `is_deleted` |
| `find_user_by_id(user_id)` | 以 id 查詢，不含 `hash`；不過濾 `is_deleted` |
| `create_user(email, password, name, display_name)` | 新增使用者，密碼 bcrypt 雜湊（cost=10） |
| `update_user_profile(user_id, name, display_name)` | 更新姓名與顯示名稱 |
| `update_last_login(user_id)` | 更新 `last_login_at` 為現在 |
| `soft_delete_user(user_id)` | 邏輯刪除（`is_deleted = 1`） |
| `list_users(page, page_size, status, keyword)` | 會員清單分頁，回傳 `(items, total)`；依 `status` 決定是否過濾 |
| `set_user_active(user_id, is_active)` | 設定啟用狀態 |
| `set_user_role(user_id, role)` | 設定角色 |
| `hard_delete_user_by_email(email)` | 實體刪除，**僅供測試清理使用** |

`list_users` 與兩個單筆取得函式是 `rules/database.md` 中明列的「不過濾 `is_deleted`」例外，
兩者的 docstring 都有標註。

### 種子帳號（`_seed_users_if_empty`）

| id | email | 密碼 | role | is_active |
|----|-------|------|------|-----------|
| 1 | user@example.com | password123 | 1 | 1 |
| 2 | admin@example.com | admin1234 | 0 | 1 |
| 3 | disabled@example.com | disabled123 | 1 | 0 |

> 種子帳號的 bcrypt cost=4（加速測試），`create_user()` 建立的正式帳號用 cost=10。

---

## `equipment.py`

### 資料表：`equipment`（器材主檔）

| 欄位                    | 型別    | 說明                                        |
| ----------------------- | ------- | ------------------------------------------- |
| `id`                    | INTEGER | 主鍵                                        |
| `equipment_name`        | TEXT    | 器材名稱                                    |
| `equipment_code`        | TEXT    | 器材編號（**未加 UNIQUE 約束**，見 KI-06）  |
| `equipment_description` | TEXT    | 器材說明（可為 NULL）                       |
| `total_quantity`        | INTEGER | 總數量                                      |
| `available_quantity`    | INTEGER | 目前可借數量                                |
| `equipment_status`      | TEXT    | `available` / `unavailable` / `maintenance` |
| `created_at`            | TEXT    | 建立時間                                    |
| `updated_at`            | TEXT    | 最後更新時間                                |
| `is_deleted`            | INTEGER | 邏輯刪除旗標                                |

### 資料表：`borrow_orders`（借用單主檔）

| 欄位                 | 型別    | 說明                                      |
| -------------------- | ------- | ----------------------------------------- |
| `id`                 | INTEGER | 主鍵                                      |
| `borrower_id`        | INTEGER | 借用者，對應 `users.id`                   |
| `borrow_start_at`    | TEXT    | 預計借用開始時間                          |
| `borrow_end_at`      | TEXT    | 預計歸還時間                              |
| `actual_borrowed_at` | TEXT    | 實際借出時間（登記借出時填入）            |
| `actual_returned_at` | TEXT    | 實際歸還時間（登記歸還時填入）            |
| `borrow_reason`      | TEXT    | 借用用途                                  |
| `order_status`       | TEXT    | `pending` / `approved` / `rejected` / `borrowed` / `returned` / `cancelled` / `overdue` |
| `reviewed_by`        | INTEGER | 審核者，對應 `users.id`（可為 NULL）      |
| `reviewed_at`        | TEXT    | 審核時間（可為 NULL）                     |
| `review_note`        | TEXT    | 審核備註（可為 NULL）                     |
| `created_at`         | TEXT    | 建立時間                                  |
| `updated_at`         | TEXT    | 最後更新時間                              |
| `is_deleted`         | INTEGER | 邏輯刪除旗標                              |

### 資料表：`borrow_order_items`（借用單明細）

| 欄位              | 型別    | 說明                          |
| ----------------- | ------- | ----------------------------- |
| `id`              | INTEGER | 主鍵                          |
| `borrow_order_id` | INTEGER | 對應 `borrow_orders.id`       |
| `equipment_id`    | INTEGER | 對應 `equipment.id`           |
| `quantity`        | INTEGER | 借用數量                      |
| `item_status`     | TEXT    | 與 `order_status` 同步更新    |
| `created_at`      | TEXT    | 建立時間                      |
| `updated_at`      | TEXT    | 最後更新時間                  |
| `is_deleted`      | INTEGER | 邏輯刪除旗標                  |

> 四張表都**沒有宣告外鍵約束、CHECK 約束或額外索引**，關聯與狀態值的正確性由 Python 端負責。
> 這是沿用參考專案的設計，見 `document/system-spec.md` 第 11 章 KI-06。

### 公開函式

| 函式 | 說明 |
|------|------|
| `list_equipment(page, page_size)` | 器材清單分頁，回傳 `(items, total)`，依名稱升冪 |
| `get_equipment(equipment_id)` | 取得單一器材；已刪除者視為不存在 |
| `create_equipment(name, code, description, total_qty, available_qty, status)` | 新增器材，回傳 id |
| `update_equipment(...)` | 更新器材欄位 |
| `soft_delete_equipment(equipment_id)` | 邏輯刪除器材 |
| `create_borrow_order(borrower_id, start_at, end_at, reason, items)` | **transaction**：主檔 + 明細，回傳 order_id |
| `get_borrow_order(order_id)` | 取得單一借用單，JOIN `users` 取借用者顯示名稱 |
| `list_order_items(order_id)` | 取得明細，JOIN `equipment` 取器材名稱與編號 |
| `list_my_orders(user_id)` | 指定使用者的借用單，依建立時間降冪 |
| `list_all_orders()` | 全部借用單（管理員用），依建立時間降冪 |
| `cancel_order(order_id, user_id)` | 取消；驗證身份與狀態（限 `pending` / `approved`），回傳 `bool` |
| `approve_order(order_id, admin_id, note)` | 核准；限 `pending`，並重新檢查可借數量，回傳 `bool` |
| `reject_order(order_id, admin_id, note)` | 拒絕；限 `pending`，回傳 `bool` |
| `mark_order_borrowed(order_id)` | **transaction**：限 `approved`，扣減可借數量，回傳 `bool` |
| `mark_order_returned(order_id)` | **transaction**：限 `borrowed` / `overdue`，恢復可借數量（上限為總數量），回傳 `bool` |
| `update_borrow_order(order_id, user_id, start_at, end_at, reason, items)` | **transaction**：限本人且 `pending`，重建明細，回傳 `bool` |

`items` 參數的格式一律是 `[(equipment_id, quantity), ...]`。
四個標註 transaction 的函式使用 `with conn:`，理由見 `rules/database.md`。

### 種子器材（`_seed_equipment_if_empty`）

`equipment` 表為空時植入 8 筆器材，涵蓋三種狀態與 `available_quantity = 0` 的情形，
讓借用流程的每個分支都有可用的測試對象。**借用單不植入種子資料**——借用流程涉及狀態轉移
與數量扣減，由實際操作產生的資料才會與 `available_quantity` 一致。
