# tests/ — 測試子系統說明

本目錄包含所有 pytest 測試，對應各 Blueprint 子系統。

---

## 測試架構

- **框架**：pytest + pytest-flask（使用 Flask test client，不啟動實際伺服器）
- **DB 隔離**：每個測試函式透過 `tmp_path` fixture 建立獨立 SQLite 暫存檔，並植入種子資料，測試結束後自動清除
- **驗證碼**：直接透過 `client.session_transaction()` 將答案寫入 session，繞過圖形驗證碼產生流程

---

## 目錄結構

```
tests/
├── conftest.py         # Fixtures 定義：app、client、authed_client、admin_client、other_client
├── data/
│   └── users.py        # 種子帳號常數（USERS）與預期訊息字串（MESSAGES）
├── test_admin.py       # admin Blueprint 測試
├── test_auth.py        # auth Blueprint 測試
├── test_forum.py       # forum Blueprint 測試
├── test_hub.py         # hub Blueprint 測試
└── test_profile.py     # profile Blueprint 測試
```

---

## Fixtures（conftest.py）

| Fixture | Scope | 說明 |
|---|---|---|
| `app` | function | 建立暫存 DB + 植入種子資料；`TESTING=True`；每個測試函式獨立 |
| `client` | function | Flask test client（未登入狀態） |
| `authed_client` | function | `session['user_id'] = 1`（user@example.com，一般使用者） |
| `admin_client` | function | `session['user_id'] = 2`（admin@example.com，管理員） |
| `other_client` | function | `session['user_id'] = 3`（disabled@example.com，role=1，用於他人權限測試） |

> `other_client` 雖帳號停用，但 session 直接注入。在本系統有三種用途：
> 1. 「非本人、非管理員」的權限邊界（論壇的修改權限測試）
> 2. 「停用中的管理員」——先 `db.set_user_role(3, 0)` 再用它，驗證 admin 的守門順序
> 3. 「持有舊 session 的停用帳號」——驗證 forum 的守門修正，以及 KI-03 的刻意缺陷
>
> **注意**：forum 的權限邊界測試（`test_edit_master_by_other_user` 等）需先 `db.set_user_active(3, 1)`，
> 否則會被 `_current_user()` 的帳號有效性檢查先攔下，測不到權限那一層。
>
> **另一個陷阱**：`authed_client`、`admin_client`、`other_client` 都由 `client` 衍生，
> **同一個測試中同時請求兩個，拿到的是同一個物件**。需要第二個乾淨 client 時，
> 請求 `app` fixture 後自行 `app.test_client()`。

---

## 種子帳號（`db/users.py` → `_seed_users_if_empty`）

種子帳號由 `db.init_db()` 自動植入（users table 為空時），不需要測試自行建立：

| id | email | 密碼 | role | is_active | name |
|----|-------|------|------|-----------|------|
| 1 | user@example.com | password123 | 1 | 1 | 一般使用者 |
| 2 | admin@example.com | admin1234 | 0 | 1 | 管理員 |
| 3 | disabled@example.com | disabled123 | 1 | 0 | None |

> bcrypt cost=4（測試用，加速雜湊）。若需在測試中驗證密碼，直接使用上表的明文密碼。

## 種子文章

`init_db()` 除了三個帳號，也會植入**五篇論壇文章**（共 8 則內文與回覆）。因此每個測試拿到的
資料庫**不是空的論壇**——撰寫論壇相關測試時要注意：

- 斷言文章數量請用**相對式**（`before = db.list_forum_masters()[1]` … `assert after == before + 1`），
  不要寫死絕對值
- `list_forum_masters()` 的預設 `page_size=10`，加上五篇種子文章後，建立超過五篇才會翻到第二頁
- 種子文章的 id 是 1–5，local fixture 建立的第一篇會是 id=6

現有 42 個論壇測試都已符合這些條件，種子文章不影響它們。

## 測試資料（tests/data/users.py）

### `USERS` — 種子帳號常數

```python
USERS = {
    'normal':   { 'email': 'user@example.com',     'password': 'password123', 'id': 1 },
    'admin':    { 'email': 'admin@example.com',     'password': 'admin1234',   'id': 2 },
    'disabled': { 'email': 'disabled@example.com',  'password': 'disabled123', 'id': 3 },
}
```

### `MESSAGES` — 預期的回應訊息字串

定義 auth 與 admin 的全部 22 條訊息，供測試斷言使用。**修改 Blueprint 中的訊息字串時，需同步更新此處。**

論壇的 11 條訊息**不在此處**——`test_forum.py` 把字串直接寫在斷言中（KI-29）。
這個不一致記錄為規格書的 KI-29。

---

## 常見測試模式

### 驗證碼繞過

```python
def _set_captcha(client, answer='ABCDE'):
    with client.session_transaction() as sess:
        sess['captcha'] = answer
```

在 POST /login 測試中，先呼叫此 helper 將答案寫入 session，再發送請求。

### 建立測試資料（local fixture）

各測試模組中使用 `@pytest.fixture` + `db.*` 直接建立所需資料，例如：

```python
# 論壇：建立成本極低，分頁測試可放心建立十幾筆
@pytest.fixture
def forum_post(app):
    return db.create_forum_master('測試文章標題', '測試文章內文', 1)

# 會員：create_user 使用 bcrypt cost=10，每筆約 0.1 秒，不要大量建立
@pytest.fixture
def many_users(app):
    for i in range(8):
        db.create_user(f'u{i}@example.com', 'password123', f'測試{i}')
    return 11
```

### 測試 redirect

```python
resp = client.get('/some-protected-route')
assert resp.status_code == 302
assert '/login' in resp.headers['Location']
```

### 測試 session 狀態

```python
with client.session_transaction() as sess:
    assert sess.get('user_id') == 1
```

---

## 新增測試的規範

1. 測試函式命名：`test_<情境描述>`，以動詞或名詞開頭清楚描述意圖
2. 每個 Blueprint 對應一個測試檔案（`test_<blueprint_name>.py`）
3. 新增子系統時，建立對應 `test_<name>.py`
4. 若有共用的種子資料或訊息字串，統一放入 `tests/data/` 下的適當檔案
5. 測試應覆蓋：正常流程、邊界條件、權限控制（未登入、一般使用者、管理員、他人）
6. **被權限擋下的 POST 必須同時斷言資料庫沒有改變**。只驗 302 無法區分「被擋下」與「執行成功後 redirect」

---

## 執行測試

```bash
pytest                              # 執行所有測試
pytest tests/test_auth.py -v        # 執行特定模組
pytest -k "test_login"              # 執行名稱符合的測試
```
