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
└── forum.py        # 論壇資料存取（forum 與 forum_details 兩表）
```

模組拆分的依據是**資料表**，不是子系統。會員管理的 `list_users`、`set_user_active`、`set_user_role`
操作的仍是 `users` 表，因此併入 `users.py`，**不另建 `admin.py`**。

---

## `__init__.py`

- `DB_PATH` — 資料庫路徑，預設 `database.db`，可由環境變數 `DB_PATH` 覆寫
- 測試時透過 `db.DB_PATH = str(tmp_path / 'test.db')` 動態替換，無需重啟 app
- `init_db()` — 建立三張資料表（`users`、`forum`、`forum_details`）並植入種子資料。順序：建 users 表 → commit → `_init_forum_tables()` → `_seed_users_if_empty()`

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

## `forum.py`

### 資料表：`forum`（文章主表）

| 欄位         | 型別    | 說明             |
| ------------ | ------- | ---------------- |
| `id`         | INTEGER | 主鍵             |
| `title`      | TEXT    | 文章標題         |
| `user_id`    | INTEGER | 發文者           |
| `created_at` | TEXT    | 建立時間         |
| `updated_at` | TEXT    | 最後更新時間     |
| `is_deleted` | INTEGER | 邏輯刪除旗標     |

### 資料表：`forum_details`（內文與回覆）

| 欄位               | 型別    | 說明                               |
| ------------------ | ------- | ---------------------------------- |
| `id`               | INTEGER | 主鍵                               |
| `master_id`        | INTEGER | 對應 forum.id                      |
| `content`          | TEXT    | 內容                               |
| `user_id`          | INTEGER | 作者                               |
| `is_original_post` | INTEGER | `1`=首篇內文（與文章同時建立）     |
| `created_at`       | TEXT    | 建立時間                           |
| `updated_at`       | TEXT    | 最後更新時間                       |
| `is_deleted`       | INTEGER | 邏輯刪除旗標                       |

### 公開函式

| 函式 | 說明 |
|------|------|
| `list_forum_masters(page, page_size)` | 回傳 `(items, total)`，依 updated_at 降冪，含 user_display |
| `get_forum_master(master_id)` | 取得單一文章（不過濾刪除） |
| `create_forum_master(title, content, user_id)` | 新增文章與首篇內文（transaction），回傳 master_id |
| `update_forum_master_title(master_id, title)` | 更新標題與 updated_at |
| `soft_delete_forum_master(master_id)` | 邏輯刪除文章及所有回覆（transaction） |
| `list_forum_details(master_id)` | 回傳未刪除的內文與回覆，依 created_at 降冪 |
| `get_forum_detail(detail_id)` | 取得單一內文或回覆（不過濾刪除） |
| `create_forum_detail(master_id, content, user_id)` | 新增回覆並更新 master.updated_at（transaction） |
| `update_forum_detail_content(detail_id, content)` | 更新內容與 updated_at |
| `soft_delete_forum_detail(detail_id)` | 邏輯刪除單一內文或回覆 |

### 種子文章（`_seed_forum_if_empty`）

與 `_seed_users_if_empty` 對稱：`forum` 表為空時才植入，由 `init_db()` 呼叫並共用同一個 conn。
**必須排在 `_seed_users_if_empty` 之後**——文章的 `user_id` 指向那三個種子帳號。

`_SEED_POSTS` 共五篇，每一篇對應一個值得觀察的系統行為：

| # | 標題 | 作者 | 內容數 | 示範什麼 |
|---|------|------|:--:|---------|
| 1 | 【公告】討論區使用說明 | 管理員 | 1 | 最小案例：只有內文、沒有回覆 |
| 2 | 主檔與明細是怎麼分工的？ | 一般使用者 | 1 | 同上 |
| 3 | 被停用的帳號，發過的文章會怎麼樣？ | 停用帳號 | 1 | 帳號狀態不影響既有內容；`COALESCE(u.name, u.email)` 退回顯示 email |
| 4 | 軟刪除和真的刪掉，差在哪裡？ | 一般使用者 | 3 | 一對多：一篇內文加兩則不同作者的回覆 |
| 5 | 期末專題可以自己選題目嗎？ | 一般使用者 | 2 | 最後有活動，因此排在列表最上面 |

時間戳以 `datetime('now', '-N minutes')` 明確指定，不用預設值。理由是全部在同一秒內建立時，
`updated_at` 會完全相同，列表排序變得不確定，看不出「有新回覆的文章會浮上來」這個行為。

---
