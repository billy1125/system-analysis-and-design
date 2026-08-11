# db 套件

## 職責

統一管理所有 SQLite 資料存取邏輯，以模組拆分降低各 Blueprint 間的耦合。

---

## 套件結構

```
db/
├── __init__.py     # 定義 DB_PATH；匯出所有公開函式；init_db()
├── connection.py   # _get_conn()：建立連線
├── users.py        # 使用者資料存取（users 表）
└── meals.py        # 訂餐資料存取（meals、meal_orders、meal_order_items 三表）
```

模組拆分的依據是**資料表**，不是子系統。會員管理的 `list_users`、`set_user_active`、`set_user_role`
操作的仍是 `users` 表，因此併入 `users.py`，**不另建 `admin.py`**。

---

## `__init__.py`

- `DB_PATH` — 資料庫路徑，預設 `database.db`，可由環境變數 `DB_PATH` 覆寫
- 測試時透過 `db.DB_PATH = str(tmp_path / 'test.db')` 動態替換，無需重啟 app
- `init_db()` — 建立四張資料表（`users`、`meals`、`meal_orders`、`meal_order_items`）並植入種子資料。順序：建 users 表 → commit → `_init_meal_tables()` → `_seed_users_if_empty()` → `_seed_meals_if_empty()`
- 兩個植入函式的順序**不可對調**：種子訂單的 `orderer_id` 指向種子帳號

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
| `find_user_by_email(email)` | 以 email 查詢，含 hash（供登入驗證） |
| `find_user_by_id(user_id)` | 以 id 查詢，不含 hash |
| `create_user(email, password, name, display_name)` | 新增使用者，密碼 bcrypt 雜湊 |
| `update_user_profile(user_id, name, display_name)` | 更新姓名與顯示名稱 |
| `update_last_login(user_id)` | 更新 last_login_at 為現在 |
| `soft_delete_user(user_id)` | 邏輯刪除（is_deleted=1） |
| `list_users(page, page_size, status, keyword)` | 會員清單（分頁），回傳 `(items, total)`。**刻意不強制過濾 `is_deleted`** |
| `set_user_active(user_id, is_active)` | 設定啟用狀態 |
| `set_user_role(user_id, role)` | 設定角色 |
| `hard_delete_user_by_email(email)` | 實體刪除，**僅供測試清理使用** |

### 種子帳號（`_seed_if_empty`）

| email | 密碼 | role | is_active |
|-------|------|------|-----------|
| user@example.com | password123 | 1 | 1 |
| admin@example.com | admin1234 | 0 | 1 |
| disabled@example.com | disabled123 | 1 | 0 |

---

## `meals.py`

三張表由同一個模組管理，因為它們構成一個完整的訂單語意單位：離開 `meal_orders`
單獨看 `meal_order_items` 沒有意義。模組拆分的依據仍是資料表——這三張都是新表。

### 資料表：`meals`（餐點主檔）

| 欄位                 | 型別    | 說明                                        |
| -------------------- | ------- | ------------------------------------------- |
| `id`                 | INTEGER | 主鍵                                        |
| `meal_code`          | TEXT    | 餐點編號（如 A01）。**未加 UNIQUE**，見 KI-M2 |
| `meal_name`          | TEXT    | 餐點名稱                                    |
| `meal_description`   | TEXT    | 說明（可為 NULL）                           |
| `category`           | TEXT    | `main` / `side` / `drink`                   |
| `price`              | INTEGER | 單價，**整數新台幣元**（不用浮點數）        |
| `daily_quantity`     | INTEGER | 每日供應份數                                |
| `remaining_quantity` | INTEGER | 目前剩餘份數                                |
| `meal_status`        | TEXT    | `available` / `sold_out` / `unavailable`    |
| `created_at`         | TEXT    | 建立時間                                    |
| `updated_at`         | TEXT    | 最後更新時間                                |
| `is_deleted`         | INTEGER | 邏輯刪除旗標                                |

> `price` 用 INTEGER 而非 REAL：金額用浮點數會產生 `0.1 + 0.2 != 0.3` 這類誤差，
> 訂單總金額是明細的加總，誤差會累積。以「元」為單位存整數，加總永遠精確。

### 資料表：`meal_orders`（訂單主檔）

| 欄位              | 型別    | 說明                                                    |
| ----------------- | ------- | ------------------------------------------------------- |
| `id`              | INTEGER | 主鍵                                                    |
| `orderer_id`      | INTEGER | 訂購人（對應 users.id）                                 |
| `pickup_date`     | TEXT    | 取餐日期 `YYYY-MM-DD`                                   |
| `pickup_slot`     | TEXT    | `lunch` / `dinner`                                      |
| `pickup_location` | TEXT    | 取餐地點                                                |
| `order_note`      | TEXT    | 訂單備註（可為 NULL）                                   |
| `total_amount`    | INTEGER | 總金額。**衍生值**，由資料層依明細計算後寫入            |
| `order_status`    | TEXT    | `pending` / `confirmed` / `completed` / `cancelled` / `rejected` |
| `reviewed_by`     | INTEGER | 審核的管理員（可為 NULL）                               |
| `reviewed_at`     | TEXT    | 審核時間（可為 NULL）                                   |
| `review_note`     | TEXT    | 審核備註（可為 NULL）                                   |
| `created_at`      | TEXT    | 建立時間                                                |
| `updated_at`      | TEXT    | 最後更新時間                                            |
| `is_deleted`      | INTEGER | 邏輯刪除旗標                                            |

### 資料表：`meal_order_items`（訂單明細）

| 欄位            | 型別    | 說明                                            |
| --------------- | ------- | ----------------------------------------------- |
| `id`            | INTEGER | 主鍵                                            |
| `meal_order_id` | INTEGER | 對應 meal_orders.id                             |
| `meal_id`       | INTEGER | 對應 meals.id                                   |
| `quantity`      | INTEGER | 訂購份數                                        |
| `unit_price`    | INTEGER | **下單當下的價格快照**                          |
| `subtotal`      | INTEGER | `unit_price × quantity`                         |
| `item_status`   | TEXT    | 跟隨主檔的 order_status                         |
| `created_at`    | TEXT    | 建立時間                                        |
| `updated_at`    | TEXT    | 最後更新時間                                    |
| `is_deleted`    | INTEGER | 邏輯刪除旗標                                    |

> `unit_price` 為什麼要存：菜單會調價，`meals.price` 是「現在多少錢」，
> 訂單要記錄的是「當時多少錢」。不存快照的話，一次調價會讓所有歷史訂單的金額
> 跟著變動，帳目對不起來。

### 訂單狀態機

```text
pending ──confirm──> confirmed ──complete──> completed
   │                     │
   ├──reject──> rejected └──cancel──> cancelled
   └──cancel──> cancelled
```

**庫存不變量：`meals.remaining_quantity` 只在 `confirmed` 狀態被佔用。**
由此推得四條規則，全部寫在 `meals.py` 的函式中：

| 轉移 | 庫存 | 理由 |
|------|------|------|
| confirm（pending → confirmed） | **扣減** | 開始佔用 |
| cancel（confirmed → cancelled） | **回補** | 停止佔用 |
| cancel（pending → cancelled） | 不動 | 本來就沒佔用 |
| reject（pending → rejected） | 不動 | 同上 |
| complete（confirmed → completed） | 不動 | 餐點已被取走，額度真的消耗掉了 |

回補以 `MIN(remaining + qty, daily_quantity)` 封頂——管理員可能在訂單存續期間
調低 `daily_quantity`，不封頂就會把剩餘份數加到超過當日供應量。

### 公開函式

**餐點**

| 函式 | 說明 |
|------|------|
| `list_meals(page, page_size, category)` | 回傳 `(items, total)`，依 meal_code 升冪，支援分類篩選 |
| `list_orderable_meals()` | 供應中且剩餘份數大於 0 的餐點，供訂餐表單使用 |
| `get_meal(meal_id)` | 取得單一餐點（**不過濾刪除**） |
| `create_meal(...)` | 新增餐點，回傳 id |
| `update_meal(...)` | 更新餐點與 updated_at |
| `soft_delete_meal(meal_id)` | 邏輯刪除。**不連動既有訂單明細** |

**訂單**

| 函式 | 說明 |
|------|------|
| `create_meal_order(orderer_id, ..., items)` | 建立主檔 + 明細（transaction），回傳 order_id |
| `get_meal_order(order_id)` | 取得單一訂單，含訂購人與審核人顯示名稱（**不過濾刪除**） |
| `list_order_items(order_id)` | 訂單的未刪除明細。`LEFT JOIN meals` **不帶** `is_deleted` 過濾，讓已下架餐點的名稱仍顯示得出來 |
| `list_my_orders(user_id, page, page_size)` | 回傳 `(items, total)`，依 created_at 降冪 |
| `list_all_orders(page, page_size, status)` | 管理端清單，支援狀態篩選 |
| `update_meal_order(...)` | 修改訂單（限本人、限 pending），回傳 `True` / `False`（transaction） |
| `cancel_meal_order(order_id, user_id)` | 本人取消，必要時回補庫存（transaction） |
| `confirm_meal_order(order_id, admin_id, note)` | 確認並扣減庫存（transaction） |
| `reject_meal_order(order_id, admin_id, note)` | 拒絕，不動庫存 |
| `complete_meal_order(order_id)` | 登記取餐，不回補庫存 |
| `admin_cancel_meal_order(order_id)` | 管理員代為取消，庫存規則同 `cancel_meal_order` |

狀態轉移類函式一律回傳 `True` / `False`，把「狀態不符」與「執行成功」的區分留給
Blueprint 決定要 flash 什麼訊息。它們**在函式內部自行檢查前置狀態**，不信任呼叫端
——同一個檢查在路由與資料層各做一次是刻意的，路由的檢查決定畫面上要不要顯示按鈕，
資料層的檢查決定資料能不能被改。

### 使用 transaction 的七個函式

判準是「多張表必須同時成功或同時失敗」：

| 函式 | 為何需要 |
|------|---------|
| `create_meal_order` | 主檔 INSERT 成功但明細失敗，會留下一張沒有品項的空訂單 |
| `update_meal_order` | 舊明細已軟刪除但新明細寫入失敗，訂單會變成空的 |
| `cancel_meal_order` | 狀態改了但庫存沒回補，份數就永久少掉 |
| `reject_meal_order` | 主檔與明細的狀態必須一致 |
| `admin_cancel_meal_order` | 同上 |
| `confirm_meal_order` | 狀態改了但庫存沒扣，會超賣 |
| `complete_meal_order` | 主檔與明細的狀態必須一致 |

`db/users.py` 的所有函式都只動一張表，因此不需要 transaction。

### 種子資料（`_seed_meals_if_empty`）

與 `_seed_users_if_empty` 對稱：`meals` 表為空時才植入，由 `init_db()` 呼叫並共用同一個 conn。
**必須排在 `_seed_users_if_empty` 之後**——訂單的 `orderer_id` 指向那三個種子帳號。

**六道餐點**，每一道對應一個值得觀察的狀態：

| id | 編號 | 名稱 | 價格 | 狀態 | 示範什麼 |
|:--:|------|------|-----:|------|---------|
| 1 | A01 | 雞腿便當 | 95 | available | 正常可訂 |
| 2 | A02 | 素食便當 | 75 | available | 被種子訂單 #3 佔用 2 份 |
| 3 | A03 | 排骨便當 | 90 | sold_out | 售完：**狀態**檢查先於份數檢查 |
| 4 | A04 | 牛肉麵 | 130 | unavailable | 停售但仍有剩餘份數，擋下它的是狀態而非份數 |
| 5 | B01 | 燙青菜 | 25 | available | 附餐分類 |
| 6 | C01 | 古早味紅茶 | 20 | available | 飲料分類 |

**四張訂單**，覆蓋狀態機的四個可達狀態：

| id | 訂購人 | 狀態 | 品項 | 示範什麼 |
|:--:|-------|------|------|---------|
| 1 | user（id=1） | completed | A01×1、C01×1 | 已結案，不可修改或取消 |
| 2 | user（id=1） | cancelled | A02×1 | 已取消 |
| 3 | disabled（id=3） | confirmed | A02×2、B01×1 | **唯一佔用庫存的訂單**；作者欄退回顯示 email |
| 4 | user（id=1） | pending | A01×2、B01×2 | 可修改、可取消，管理端可確認／拒絕 |

種子訂單 #3 在植入時實際扣減了 A02 與 B01 的 `remaining_quantity`，維持庫存不變量。
若只寫訂單而不扣庫存，系統一啟動就帳實不符，後續的取消回補會把庫存加到超過供應量。

時間戳以 `datetime('now', '-N minutes')` 明確指定，不用預設值。理由是全部在同一秒內
建立時 `created_at` 完全相同，訂單列表的排序會變得不確定。

---
