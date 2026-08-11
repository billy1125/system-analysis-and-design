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
└── events.py       # 活動與報名資料存取（events、event_details、registrations 三表）
```

模組拆分的依據是**資料表**，不是子系統。會員管理的 `list_users`、`set_user_active`、`set_user_role`
操作的仍是 `users` 表，因此併入 `users.py`，**不另建 `admin.py`**。同理，報名相關的函式操作的是
`registrations` 表，而 `list_events()` 必須 JOIN 它才能算出報名人數，因此併入 `events.py`，
**不另建 `registrations.py`**。

---

## `__init__.py`

- `DB_PATH` — 資料庫路徑，預設 `database.db`，可由環境變數 `DB_PATH` 覆寫
- 測試時透過 `db.DB_PATH = str(tmp_path / 'test.db')` 動態替換，無需重啟 app
- `init_db()` — 建立四張資料表並植入種子資料。順序：
  建 `users` 表 → `commit` → `_init_event_tables()` → `_seed_users_if_empty()` → `_seed_events_if_empty()`

> `_seed_events_if_empty()` **必須排在 `_seed_users_if_empty()` 之後**——活動的 `user_id`
> 與報名紀錄的 `user_id` 都指向種子帳號。

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

### 種子帳號（`_seed_users_if_empty`）

| id | email | 密碼 | role | is_active | name |
|----|-------|------|------|-----------|------|
| 1 | user@example.com | password123 | 1 | 1 | 一般使用者 |
| 2 | admin@example.com | admin1234 | 0 | 1 | 管理員 |
| 3 | disabled@example.com | disabled123 | 1 | 0 | None |

種子帳號使用 bcrypt cost=4（加速測試），註冊路徑使用 cost=10。

---

## `events.py`

### 資料表：`events`（活動主表）

| 欄位                    | 型別    | 說明                       |
| ----------------------- | ------- | -------------------------- |
| `id`                    | INTEGER | 主鍵                       |
| `event_title`           | TEXT    | 活動標題                   |
| `event_datetime`        | TEXT    | 活動時間                   |
| `event_place`           | TEXT    | 活動地點（≤ 100 字）       |
| `capacity`              | INTEGER | 名額上限                   |
| `registration_start_at` | TEXT    | 報名開始時間（可為 NULL）  |
| `registration_end_at`   | TEXT    | 報名截止時間（可為 NULL）  |
| `created_at`            | TEXT    | 建立時間                   |
| `updated_at`            | TEXT    | 最後更新時間               |
| `user_id`               | INTEGER | 活動發起者                 |
| `is_deleted`            | INTEGER | 邏輯刪除旗標               |

### 資料表：`event_details`（活動副表）

| 欄位            | 型別    | 說明                  |
| --------------- | ------- | --------------------- |
| `id`            | INTEGER | 主鍵                  |
| `event_id`      | INTEGER | 對應 `events.id`      |
| `event_note`    | TEXT    | 活動內容（必填）      |
| `event_target`  | TEXT    | 活動對象（可為 NULL） |
| `event_contact` | TEXT    | 聯絡資訊（可為 NULL） |
| `event_notice`  | TEXT    | 注意事項（可為 NULL） |
| `created_at`    | TEXT    | 建立時間              |
| `updated_at`    | TEXT    | 最後更新時間          |
| `is_deleted`    | INTEGER | 邏輯刪除旗標          |

### 資料表：`registrations`（報名）

| 欄位                  | 型別    | 說明                                                  |
| --------------------- | ------- | ----------------------------------------------------- |
| `id`                  | INTEGER | 主鍵                                                  |
| `event_id`            | INTEGER | 對應 `events.id`                                      |
| `user_id`             | INTEGER | 報名者                                                |
| `registration_status` | TEXT    | `registered` / `cancelled` / `waiting` / `rejected`   |
| `meal_type`           | INTEGER | `0`=不用餐 / `1`=葷食 / `2`=素食                      |
| `participant_name`    | TEXT    | 真實姓名（可為 NULL）                                 |
| `participant_phone`   | TEXT    | 聯絡電話（可為 NULL）                                 |
| `participant_email`   | TEXT    | 聯絡 Email（可為 NULL）                               |
| `registration_note`   | TEXT    | 備註（可為 NULL）                                     |
| `created_at`          | TEXT    | 報名時間                                              |
| `updated_at`          | TEXT    | 最後更新時間                                          |
| `cancelled_at`        | TEXT    | 取消時間（可為 NULL）                                 |
| `is_deleted`          | INTEGER | 邏輯刪除旗標                                          |

> **一人一活動的唯一性由 application 層控制，DB 不加 UNIQUE 約束。**
> 理由是要支援「取消後重新報名」——加了 UNIQUE 之後，重新報名只能刪掉舊列再新增，
> 取消的歷史就不見了。`create_or_restore_registration()` 改以 UPDATE 恢復同一列。

### 公開函式

| 函式 | 說明 |
|------|------|
| `list_events(page, page_size)` | 回傳 `(items, total)`，依 `event_datetime` 升冪，含 `registered_count` |
| `get_event(event_id)` | 活動完整資料（JOIN 副表），含 `registered_count`。**不過濾 `is_deleted`** |
| `get_event_for_edit(event_id)` | 回傳 `(event_row, detail_row)`，供修改表單預填。**不過濾 `is_deleted`** |
| `create_event(...)` | 新增 `events` + `event_details`（transaction），回傳 `event_id` |
| `update_event(...)` | 更新 `events` + `event_details`（transaction） |
| `soft_delete_event(event_id)` | 邏輯刪除活動及副表（transaction）；**不動報名紀錄** |
| `list_registrations(event_id)` | 有效報名者（`registered`），供公開顯示 |
| `list_all_registrations(event_id)` | 全部報名紀錄（含已取消），供發起者或管理員使用 |
| `get_registration(event_id, user_id)` | 指定使用者的報名紀錄，找不到回傳 `None` |
| `count_registered(event_id)` | 目前有效報名人數 |
| `create_or_restore_registration(...)` | 回傳 `'created'`、`'restored'` 或 `'duplicate'` |
| `cancel_registration(event_id, user_id)` | status → `cancelled`，填入 `cancelled_at` |
| `update_registration(...)` | 報名者修改自己的報名資訊（不含 status） |
| `list_my_registrations(user_id)` | 使用者所有報名紀錄，依活動時間降冪。**不過濾 `events.is_deleted`** |

### 為什麼活動要拆成主表與副表

`events` 存的是**列表與狀態判斷需要的欄位**（標題、時間、地點、名額、報名期間）；
`event_details` 存的是**只有進到詳情頁才需要的長文字**（活動內容、對象、聯絡方式、注意事項）。

活動列表一次要撈 5 筆並算出每筆的報名人數，如果四段長文字也塞在同一張表裡，
每次列表查詢都會把它們一併讀出來卻完全用不到。拆表之後 `list_events()` 不必碰副表。

這也是「主檔／明細」在教學上的標準示範：兩張表以 `event_id` 一對一關聯，
建立、更新、刪除都必須成對進行，因此三個函式都用 `with conn:` 包成 transaction。

### 種子活動（`_seed_events_if_empty`）

與 `_seed_users_if_empty` 對稱：`events` 表為空時才植入，由 `init_db()` 呼叫並共用同一個 conn。

`_SEED_EVENTS` 共五筆，每一筆刻意對應 `_event_status()` 的一種回傳值，
讓活動列表一開啟就能同時看到五種狀態的 badge：

| id | 標題 | 發起者 | 狀態 | 示範什麼 |
|:--:|------|--------|------|---------|
| 1 | 新生入學說明會 | 管理員 | `ended` | 活動時間已過；名額還有空位也不能報名 |
| 2 | 春季校園路跑 | 管理員 | `closed` | 活動未到但報名已截止——兩個時間點是獨立的 |
| 3 | 系學會迎新茶會 | 一般使用者 | `full` | 名額 2 人已滿；名額只算 `registered` 的紀錄 |
| 4 | 生成式 AI 實作工作坊 | 管理員 | `not_open` | 唯一會隨時間自動變成可報名的狀態 |
| 5 | 期末專題成果發表會 | 一般使用者 | `available` | 未設報名期間；另含一筆已取消的報名紀錄 |

時間欄位一律以 `datetime('now', '±N days')` 換算，**不寫死絕對日期**。
理由與種子文章使用相對時間戳相同：寫死日期的種子資料過幾個月後會全部變成
「活動已結束」，五種狀態就看不出差異了。

`datetime('now', NULL)` 在 SQLite 中回傳 `NULL`，因此報名期間留空的活動不需要另外分支處理。
