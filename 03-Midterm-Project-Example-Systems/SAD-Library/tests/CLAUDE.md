# tests/ — 測試子系統說明

本目錄包含所有 pytest 測試，對應各 Blueprint 子系統。

---

## 測試架構

- **框架**：pytest + pytest-flask（使用 Flask test client，不啟動實際伺服器）
- **DB 隔離**：每個測試函式透過 `tmp_path` fixture 建立獨立 SQLite 暫存檔，並植入種子資料，測試結束後自動清除
- **驗證碼**：直接透過 `client.session_transaction()` 將答案寫入 session，繞過圖形驗證碼產生流程
- **時間**：逾期情境不等待真實時間，而是直接把 `loans.due_at` 改寫到過去（見 `overdue_loan` fixture）

---

## 目錄結構

```
tests/
├── conftest.py             # Fixtures：app、client、三個身分 client、圖書相關 fixtures
├── data/
│   ├── users.py            # 種子帳號常數（USERS）與 auth／admin 的訊息字串（MESSAGES）
│   └── library.py          # 種子書目常數、借閱政策（POLICY）與圖書三子系統的訊息字串
├── test_admin.py           # admin Blueprint 測試（30 個）
├── test_auth.py            # auth Blueprint 測試（23 個）
├── test_books.py           # books Blueprint 測試（62 個）
├── test_hub.py             # hub Blueprint 測試（13 個）
├── test_loans.py           # loans Blueprint 測試（53 個）
├── test_profile.py         # profile Blueprint 測試（8 個）
└── test_reservations.py    # reservations Blueprint 測試（29 個）
```

合計 218 個測試。

---

## Fixtures（conftest.py）

| Fixture | Scope | 說明 |
|---|---|---|
| `app` | function | 建立暫存 DB + 植入種子資料；`TESTING=True`；每個測試函式獨立 |
| `client` | function | Flask test client（未登入狀態） |
| `authed_client` | function | `session['user_id'] = 1`（user@example.com，讀者） |
| `admin_client` | function | `session['user_id'] = 2`（admin@example.com，館員） |
| `other_client` | function | `session['user_id'] = 3`（disabled@example.com，role=1，停用中） |
| `single_copy_book` | function | 只有一本複本的書目，回傳 `book_id`；借走後即進入可預約狀態 |
| `multi_copy_book` | function | 三本複本的書目，回傳 `book_id`；用於複本維護與多人借閱 |
| `overdue_loan` | function | ID=1 讀者的一筆逾期借閱，回傳 `loan_id` |
| `make_overdue` | function | `make_overdue(loan_id, days=1)`，把任一筆借閱改為逾期 |

> **陷阱**：`authed_client`、`admin_client`、`other_client` 都由 `client` 衍生，
> **同一個測試中同時請求兩個，拿到的是同一個物件**。需要第二個身分時，
> 請求 `app` fixture 後自行 `app.test_client()`——`test_loans.py` 與
> `test_reservations.py` 都提供了 `_client_for(app, user_id)` helper 做這件事。

> **另一個陷阱**：`other_client`（ID=3）的帳號 `is_active = 0`。所有子系統的
> `_current_user()` 都會先做帳號有效性檢查，因此要測「非本人、非館員」這一層權限時，
> 必須先 `db.set_user_active(3, 1)`，否則會被前一層先攔下。反過來說，
> 若要測「持有舊 session 的停用帳號」，就直接使用它、不要啟用。

---

## 種子帳號（`db/users.py` → `_seed_users_if_empty`）

| id | email | 密碼 | role | is_active | name |
|----|-------|------|------|-----------|------|
| 1 | user@example.com | password123 | 1 | 1 | 一般讀者 |
| 2 | admin@example.com | admin1234 | 0 | 1 | 圖書館員 |
| 3 | disabled@example.com | disabled123 | 1 | 0 | None |

> bcrypt cost=4（測試用，加速雜湊）。`db.create_user()` 用的是 cost=10，
> 每筆約 0.1 秒，**測試中不要大量建立帳號**——需要湊分頁筆數時，
> 改用「多建幾本書」而不是「多建幾個人」（見 `test_admin_reservations_pagination`）。

## 種子書目

`init_db()` 除了三個帳號，也會植入 **10 筆書目、共 18 本複本**。因此每個測試拿到的
資料庫**不是空的館藏**——撰寫測試時要注意：

- 書目數量的斷言請用**相對式**（`before = db.list_books(1, 100)[1]` … `assert after == before + 1`）
- `books.index` 的 `_PAGE_SIZE = 10`，剛好等於種子書目數，第二頁預設為空
- 種子書目的 id 是 1–10，fixture 建立的第一本會是 id=11
- 複本數量各書不同（見 `tests/data/library.py` 的 `SEED_BOOKS`）；需要「只有一本」
  或「有多本」的情境時，請用 `single_copy_book` / `multi_copy_book` fixture，
  不要依賴特定種子書目的複本數

## 測試資料（tests/data/）

### `users.py`

`USERS` 為三個種子帳號常數；`MESSAGES` 為 auth 與 admin 的 22 條訊息字串。

### `library.py`

- `SEED_BOOKS` — 測試會用到的種子書目（id、書名、複本數、分類）
- `SEED_BOOK_COUNT` — 種子書目總數（10）
- `POLICY` — 借閱政策數值，需與 `db/loans.py` 的常數一致
- `MESSAGES` — books、loans、reservations 三個子系統的全部訊息字串

> `MESSAGES` 刻意寫成字面值而不是 import Blueprint 的字典。訊息被改動時測試就會失敗，
> 用意是提醒同步更新規格書 9.5 節的訊息字串總表。

---

## 常見測試模式

### 驗證碼繞過

```python
def _set_captcha(client, answer='ABCDE'):
    with client.session_transaction() as sess:
        sess['captcha'] = answer
```

### 製造逾期

```python
def test_borrow_blocked_when_overdue(authed_client, overdue_loan):
    resp = authed_client.post('/loans/borrow/4', follow_redirects=True)
    assert '您有逾期未還的書，請先歸還後再借閱'.encode() in resp.data
```

### 製造「無可借複本」

兩種寫法，依情境選擇：

```python
db.borrow_book(single_copy_book, 2)                              # 被別人借走
db.set_copy_status(db.list_copies(book_id)[0]['id'], 'maintenance')  # 複本整理中
```

後者不佔用借閱額度，湊大量資料時較方便。

### 測試 redirect

```python
resp = client.get('/loans/my-loans')
assert resp.status_code == 302
assert '/login' in resp.headers['Location']
```

### 測試 flash 訊息

flash 要在 redirect 後的頁面才看得到，用 `follow_redirects=True`：

```python
resp = admin_client.post('/books/delete/1', follow_redirects=True)
assert '尚有未歸還的借閱，無法下架此書目'.encode() in resp.data
```

---

## 新增測試的規範

1. 測試函式命名：`test_<情境描述>`，以動詞或名詞開頭清楚描述意圖
2. 每個 Blueprint 對應一個測試檔案（`test_<blueprint_name>.py`）
3. 新增子系統時，建立對應 `test_<name>.py`
4. 若有共用的種子資料或訊息字串，統一放入 `tests/data/` 下的適當檔案
5. 測試應覆蓋：正常流程、邊界條件、權限控制（未登入、讀者、館員、他人、停用帳號）
6. **被權限擋下的 POST 必須同時斷言資料庫沒有改變**。只驗 302 無法區分「被擋下」與「執行成功後 redirect」
7. 業務規則（借閱上限、續借次數、逾期封鎖、預約遞補）每一條都要有對應測試

---

## 執行測試

```bash
pytest                                  # 執行所有測試
pytest tests/test_loans.py -v           # 執行特定模組
pytest -k "renew"                       # 執行名稱符合的測試
```

> `pytest.ini` 已將 `testpaths` 限定為 `tests`，確保只收集本系統的測試。
> 少了這個設定，pytest 走進不相干的目錄時會因為
> 同時收集到多份 `conftest.py` 而產生 `ImportPathMismatchError`。
