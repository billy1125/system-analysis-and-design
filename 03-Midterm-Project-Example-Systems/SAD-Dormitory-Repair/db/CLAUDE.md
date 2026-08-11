# db 套件

## 職責

統一管理所有 SQLite 資料存取邏輯，以模組拆分降低各 Blueprint 間的耦合。

**`db/` 不做權限判斷，但做狀態判斷。** 「這個人可不可以」是 Blueprint 的事（看 session）；「這張單現在可不可以轉到那個狀態」是 `db/` 的事（只看資料）。

---

## 套件結構

```
db/
├── __init__.py     # 定義 DB_PATH；匯出所有公開函式；init_db()
├── connection.py   # _get_conn()：建立連線
├── users.py        # users 表
└── repair.py       # repair_requests 與 repair_logs 兩表；狀態機；種子報修單
```

模組拆分的依據是**資料表**，不是子系統。`list_active_admins()` 只有 repair 用得到，但它操作 `users` 表，因此放在 `users.py`。同理，會員管理的三個函式也留在 `users.py`，**不另建 `admin.py`**。

---

## `__init__.py`

- `DB_PATH` — 預設 `database.db`，可由環境變數覆寫。測試時以 `db.DB_PATH = str(tmp_path / 'test.db')` 動態替換
- `init_db()` — 建立三張表並植入種子資料。順序：

```python
conn.execute("CREATE TABLE IF NOT EXISTS users (...)")
conn.commit()
_init_repair_tables(conn)
_seed_users_if_empty(conn)
_seed_repair_if_empty(conn)   # 必須在種子帳號之後
```

最後兩行的順序不可調換——報修單的 `requester_id` 與 `assigned_to` 指向那四個帳號。

> ⚠️ `CREATE TABLE IF NOT EXISTS` 對已存在的表**不會**加欄位。改了 DDL 之後必須 `rm database.db` 重建。

---

## `connection.py`

```python
def _get_conn() -> sqlite3.Connection
```

- 每次呼叫時重新讀取 `db.DB_PATH`（確保測試替換即時生效）
- 啟用 WAL 模式；`row_factory = sqlite3.Row`
- 每個函式自行呼叫並在結束前 `conn.close()`

---

## `users.py`

### 資料表：`users`

| 欄位 | 型別 | 說明 |
|------|------|------|
| `id` | INTEGER | 主鍵 |
| `email` | TEXT | UNIQUE，不可為 NULL |
| `hash` | TEXT | bcrypt 雜湊（註冊 cost=10，種子 cost=4） |
| `role` | INTEGER | `0`=管理員 / `1`=住宿生 |
| `name` / `display_name` | TEXT | 可為 NULL |
| `dorm_building` / `room_no` / `phone` | TEXT | **本系統新增**，可為 NULL |
| `is_active` / `is_deleted` | INTEGER | 狀態旗標 |
| `created_at` / `last_login_at` | TEXT | 時間 |

### 公開函式

| 函式 | 說明 |
|------|------|
| `find_user_by_email(email)` | 含 hash（供登入驗證）。**不過濾 `is_deleted`** |
| `find_user_by_id(user_id)` | 不含 hash。**不過濾 `is_deleted`** |
| `create_user(email, password, name, display_name, dorm_building, room_no, phone)` | 新欄位皆有預設值（註冊選填） |
| `update_user_profile(user_id, name, display_name, dorm_building, room_no, phone)` | **無預設值**：五個欄位一律一起送出，避免只送部分欄位就把其他欄位清空 |
| `update_last_login(user_id)` | — |
| `soft_delete_user(user_id)` | `is_deleted = 1` |
| `list_users(page, page_size, status, keyword)` | 回傳 `(items, total)`。**刻意不強制過濾 `is_deleted`**。搜尋涵蓋 email、姓名、顯示名稱、**房號** |
| `list_active_admins()` | `role = 0 AND is_active = 1 AND is_deleted = 0`，供派工下拉 |
| `set_user_active` / `set_user_role` | — |
| `hard_delete_user_by_email(email)` | **僅供測試清理** |

### 種子帳號（`_seed_users_if_empty`）

| id | email | 密碼 | role | is_active | name |
|----|-------|------|:----:|:---------:|------|
| 1 | user@example.com | password123 | 1 | 1 | 陳小明（A 棟 301） |
| 2 | admin@example.com | admin1234 | 0 | 1 | 宿舍管理員 |
| 3 | disabled@example.com | disabled123 | 1 | 0 | *(NULL)* |
| 4 | staff@example.com | staff1234 | 0 | 1 | 維修組 王師傅 |

帳號 4 的存在有兩個理由：報修派工需要「不是操作者本人」的承辦人，會員管理的自我保護規則需要「另一個管理員」作為對照。
帳號 3 的 `name` 刻意留 NULL，用來示範 `COALESCE(name, display_name, email)` 的退回顯示。

---

## `repair.py`

### 資料表：`repair_requests`（報修單主檔）

| 欄位 | 說明 |
|------|------|
| `requester_id` | 申報人。無外鍵約束（KI-20） |
| `title` / `category` / `priority` | 標題、七種類別、四級優先 |
| `dorm_building` / `room_no` / `contact_phone` | **申報當下的快照**，不 JOIN `users` 取 |
| `request_status` | 六個狀態之一 |
| `assigned_to` / `assigned_at` / `started_at` / `closed_at` | 承辦人與三個時間戳 |
| `created_at` / `updated_at` / `is_deleted` | 列表依 `updated_at` 降冪 |

**為何自存地點：** 報修地點不必然是申報人的房間（走廊、交誼廳、洗衣間都會被申報），而且報修單記錄的是申報當下的地點——住戶換房之後舊單仍應指向舊房號。

### 資料表：`repair_logs`（處理紀錄明細）

| 欄位 | 說明 |
|------|------|
| `request_id` / `user_id` | 所屬報修單與作者 |
| `log_type` | `report` 申報內容（一張單恰一筆）/ `comment` 回覆 / `status` 狀態異動 |
| `content` | 內容。`status` 的內容由本模組以字串串接產生（KI-18） |

**`log_type='status'` 只能由六個轉移函式建立。** `create_log()` 明確拒絕它，否則會出現「有狀態紀錄但主檔狀態沒變」的假歷程。

### 查詢函式

| 函式 | 說明 |
|------|------|
| `list_my_requests(user_id, page, page_size, status)` | `(items, total)`，依 `updated_at DESC, id DESC` |
| `list_all_requests(page, page_size, status, keyword)` | 同上，供管理員。搜尋涵蓋標題、棟別、房號、申報人 email 與姓名 |
| `get_request(request_id)` | 單筆，含申報人與承辦人顯示名稱。**不過濾 `is_deleted`** |
| `list_logs(request_id)` | 未刪除紀錄，依 `created_at ASC, id ASC`（時間軸由舊到新） |
| `get_report_log(request_id)` | 首則申報內容，供修改表單預填 |
| `count_by_status()` | 六個狀態的計數 dict |

兩個列表函式共用 `_LIST_COLUMNS` 與 `_LIST_JOINS`。JOIN 的型別**不同**：

```sql
JOIN users req ON req.id = r.requester_id        -- 申報人一定存在
LEFT JOIN users asg ON asg.id = r.assigned_to    -- 承辦人可能是 NULL
```

第二個寫成 `JOIN` 會讓所有未派工的報修單從清單消失——而那正是管理員最需要看到的一批。

### 寫入函式（皆為 transaction）

| 函式 | 為何需要 transaction |
|------|---------------------|
| `create_request` | 沒有描述的報修單是無效狀態 |
| `update_request` | 標題改了但描述沒改會對不上。**內部再確認本人與 `pending`** |
| `create_log` | 紀錄寫了但主檔 `updated_at` 沒更新，這張單不會浮上來 |
| `soft_delete_request` | 主檔標記但明細沒標記會留下孤兒紀錄 |

### 六個狀態轉移函式

| 函式 | 前置 → 後置 | 必填 | 副作用 |
|------|------------|------|--------|
| `assign_request` | pending → assigned | `assignee_id`（須為啟用中的管理員） | `assigned_to`、`assigned_at` |
| `start_request` | assigned → in_progress | — | `started_at` |
| `complete_request` | in_progress → completed | — | `closed_at` |
| `reject_request` | pending → rejected | **`reason`** | `closed_at` |
| `cancel_request` | pending/assigned → cancelled | — | `closed_at`；限申報人本人 |
| `reopen_request` | completed → pending | **`reason`** | 清空 `closed_at`、`started_at`；**保留 `assigned_to`** |

**四條規則**（詳見 `rules/database.md`）：

1. 前置狀態寫在 `WHERE` 子句裡，不是先讀出來再用 Python 比對
2. 主檔更新與稽核紀錄在同一個 transaction
3. 回傳布林值，不拋例外
4. 一個函式一條轉移，**不抽象成單一的 `_transition()`**

### 種子報修單（`_seed_repair_if_empty`）

六張單涵蓋六個狀態各一張：

| # | 標題 | 申報人 | 狀態 | 示範什麼 |
|---|------|--------|------|---------|
| 1 | 浴室水龍頭持續漏水 | 1 | pending | 最小案例：只有申報內容 |
| 2 | 房間日光燈管閃爍 | 1 | assigned | 狀態紀錄帶備註 |
| 3 | 冷氣不冷且有異音 | 1 | in_progress | 三種 `log_type` 並存的時間軸 |
| 4 | 衣櫃門把鬆脫 | 1 | completed | 走完全程，雙方來回討論 |
| 5 | 想在房間加裝個人洗衣機 | **3** | rejected | 停用帳號的資料不受影響；申報人退回顯示 email；退件附原因 |
| 6 | 走廊燈泡不亮 | 1 | cancelled | 申報人自行取消；`room_no` 可以是「3 樓走廊」 |

時間戳以 `datetime('now', '-N minutes')` 明確指定。若全用預設值，同一秒內建立的單 `updated_at` 完全相同，列表排序會不確定。
