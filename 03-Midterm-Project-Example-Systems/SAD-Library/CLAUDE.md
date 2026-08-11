# 校園小型圖書借閱系統 — 專案速查

給 AI 助理與開發者的專案地圖。詳細規格見 [`document/system-spec.md`](document/system-spec.md)，
建置步驟見 [`document/build-guide.md`](document/build-guide.md)。

---

## 一句話說明

Flask + SQLite 的教學用圖書借閱系統：讀者可查館藏、借書、續借、還書、預約候補；
館員可維護館藏與治理帳號。刻意維持小規模，全部程式碼兩小時內可讀完。

---

## 快速啟動

```bash
pip install -r requirements.txt
python app.py            # http://localhost:4000
pytest                   # 218 個測試
```

種子帳號：

| 身分 | 帳號 | 密碼 |
|------|------|------|
| 讀者 | user@example.com | password123 |
| 館員 | admin@example.com | admin1234 |
| 停用中 | disabled@example.com | disabled123 |

---

## 目錄地圖

```
app.py              註冊 7 個 Blueprint、/health
utils.py            _gen_captcha、_is_usable、login_required

db/                 全部 SQL 與借閱業務規則
  ├── connection.py     _get_conn()
  ├── users.py          users 表
  ├── books.py          books + book_copies
  ├── loans.py          loans + 四個政策常數
  └── reservations.py   reservations

blueprints/         7 個子系統（每個都有自己的 CLAUDE.md）
  auth hub profile admin books loans reservations

templates/ static/ rules/ document/ tests/
```

---

## 七個子系統

| Blueprint | 前綴 | 做什麼 | 誰能用 |
|-----------|------|--------|--------|
| `auth` | — | 登入、申請借閱證、登出、驗證碼 | 訪客 |
| `hub` | — | 首頁、借閱概況 | 全部 |
| `profile` | — | 本人的資料 | 登入者 |
| `admin` | `/admin` | 帳號治理 | 館員 |
| `books` | `/books` | 館藏查詢（公開）與維護（館員） | 全部／館員 |
| `loans` | `/loans` | 借書、續借、還書、借閱管理 | 登入者／館員 |
| `reservations` | `/reservations` | 預約、取消、預約管理 | 登入者／館員 |

---

## 五張資料表

```
users ──┬─→ loans ──→ book_copies ──→ books
        └─→ reservations ──────────────→ books
```

- `books`（書目主檔，一個 ISBN 一筆）／ `book_copies`（複本明細，一本實體書一筆）
- **借閱的對象是複本，不是書目**
- 兩個刻意不存的欄位：在架冊數（由複本彙總）、逾期狀態（由 `due_at` 推導）

---

## 動手前先知道的五件事

### 1. SQL 只出現在 `db/`

Blueprint 透過 `import db` → `db.func()` 呼叫，不寫 SQL；`db/` 不碰 `session` 與 `flash`。

### 2. 借閱規則在 `db/loans.py`

```python
LOAN_PERIOD_DAYS  = 14   # 借期
RENEW_PERIOD_DAYS = 14   # 每次續借延長
MAX_ACTIVE_LOANS  = 5    # 每人同時可借
MAX_RENEW_COUNT   = 1    # 每筆可續借次數
```

**任何地方都不要寫死這四個數字**，包含訊息字串（用 f-string 帶入）與模板（由路由傳入）。

### 3. `db` 回傳狀態碼，Blueprint 負責翻譯

```python
result, loan_id = db.borrow_book(book_id, user['id'])
flash(BORROW_MESSAGES.get(result, '借閱失敗'), 'error')
```

新增規則時：`db` 加狀態碼 → Blueprint 的字典加一行 → `tests/data/library.py` 加一行
→ 規格書 §9.8 加一行。四處要同步。

### 4. 權限有三層，順序固定

```
@login_required → _is_usable(user) → _is_admin(user)
```

第二層不能省：session 是簽章 cookie，帳號被停用時舊 cookie 仍然有效。

### 5. 刪除一律是軟刪除

`is_deleted = 1`，查詢一律加 `is_deleted = 0`。唯一例外是 `db.list_users()`——
館員需要看得到已刪除的帳號。

---

## 常用指令

```bash
pytest                            # 全部測試
pytest tests/test_loans.py -v     # 單一子系統
pytest -k "overdue"               # 逾期相關

python3 -c "import db; db.init_db()"   # 手動建表與植入種子

docker compose up --build         # 容器啟動
curl localhost:4000/health        # 健康檢查
```

---

## 改東西時該讀哪一份

| 你要做的事 | 先讀 |
|-----------|------|
| 新增一個子系統 | `rules/flask-blueprint.md` 的「新增子系統清單」 |
| 寫 SQL 或改資料表 | `rules/database.md` |
| 寫測試 | `tests/CLAUDE.md`（特別是 fixtures 的兩個陷阱） |
| 改某個子系統 | `blueprints/<name>/CLAUDE.md` |
| 弄清楚某條規則為什麼這樣設計 | `document/system-spec.md` |
| 從頭重建這個系統 | `document/build-guide.md` |

---

## 已知限制

系統有 20 多項刻意保留或明確記錄的技術債，完整清單見規格書 §11。
最需要注意的三項：

- **無 CSRF 保護**（KI-03）——所有 POST 可被跨站偽造
- **預約不保留書本**（KI-21）——`ready` 只代表輪到你了，取書仍是先到先得
- **`debug=True` 寫死在 `app.py`**（KI-01）——正式部署前必須關掉
