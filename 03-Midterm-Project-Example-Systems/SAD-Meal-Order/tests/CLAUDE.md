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
├── test_meal.py        # meal Blueprint 測試
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
> 1. 「非本人、非管理員」的權限邊界（訂單的檢視與修改權限測試）
> 2. 「停用中的管理員」——先 `db.set_user_role(3, 0)` 再用它，驗證 admin 與 meal 的守門順序
> 3. 「持有舊 session 的停用帳號」——驗證 meal 的守門修正，以及 KI-03 的刻意缺陷
>
> **注意**：meal 的「本人但狀態不符」測試（`test_edit_confirmed_order_rejected`、
> `test_cancel_confirmed_order_restocks`）需先 `db.set_user_active(3, 1)`，否則會被
> `_current_user()` 的帳號有效性檢查先攔下，測不到後面那一層。
>
> 種子訂單 #3 的訂購人刻意選了 id=3（停用帳號），就是為了讓「本人」與「帳號有效性」
> 這兩個條件可以分開驗證。
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

## 種子餐點與種子訂單

`init_db()` 除了三個帳號，也會植入**六道餐點**（id 1–6）與**四張訂單**（id 1–4）。
因此每個測試拿到的資料庫**不是空的**——撰寫訂餐相關測試時要注意：

- 斷言數量請用**相對式**（`before = db.list_meals()[1]` … `assert after == before + 1`），
  不要寫死絕對值
- 庫存斷言同樣用相對式：種子訂單 #3 是 confirmed，已經佔用了 A02 兩份與 B01 一份，
  所以 A02 的初始剩餘是 38 而不是 40
- 常數集中在 `tests/data/users.py` 的 `MEALS` 與 `ORDERS` 兩個字典，不在測試中寫死 id

四張種子訂單各自對應狀態機的一個可達狀態，讓「已結案的訂單不可取消」「已確認的訂單
不可修改」這類邊界不需要先建資料就能測：

| id | 訂購人 | 狀態 | 用途 |
|:--:|-------|------|------|
| 1 | id=1 | completed | 終端狀態，取消應失敗 |
| 2 | id=1 | cancelled | 終端狀態 |
| 3 | id=3 | confirmed | 唯一佔用庫存者；回補測試的主角 |
| 4 | id=1 | pending | 可修改、可取消、可確認、可拒絕 |

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

`MEALS` 與 `ORDERS` 兩個字典對應種子餐點與種子訂單的 id 與屬性，避免在測試中寫死。

> meal 的全部訊息都納入 `MESSAGES`，不散落到各測試檔的斷言裡（理由見規格書 §11.5）。

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
# 餐點與訂單：建立成本極低，分頁測試可放心建立十幾筆
@pytest.fixture
def extra_meal(app):
    return db.create_meal('Z01', '測試餐點', None, 'main', 50, 10, 10, 'available')

# 會員：create_user 使用 bcrypt cost=10，每筆約 0.1 秒，不要大量建立
@pytest.fixture
def many_users(app):
    for i in range(8):
        db.create_user(f'u{i}@example.com', 'password123', f'測試{i}')
    return 11
```

### 需要第二個 session 時

`authed_client`、`admin_client`、`other_client` 都由 `client` 衍生，**同一個測試中
同時請求兩個，拿到的是同一個物件**——後請求的那個會蓋掉前一個的 session。需要
兩個不同身分同時操作（例如管理員確認訂單、再由訂購人取消）時，請用 local fixture：

```python
@pytest.fixture
def clean_client(app):
    return app.test_client()
```

`tests/test_meal.py` 的 `test_confirm_then_cancel_restores_stock` 是這個模式的實例。

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

## 保護「刻意的缺陷」的測試

`tests/test_profile.py` 最後兩個測試（`test_profile_update_succeeds_for_disabled_user_ki03`、
`test_profile_update_succeeds_for_deleted_user_ki03`）保護的是一個**缺陷**，不是功能。

`POST /profile/update` 刻意缺少 `_is_usable` 檢查（KI-03），因此被停用或已刪除的會員
仍可修改自己的姓名。這兩個測試斷言「它確實可以」。

若有人「順手」補上那三行，這兩個測試會失敗——那正是它們存在的目的：**讓修補一個刻意
保留的缺陷變成一個需要明確決定的動作，而不是無聲發生的。**

撰寫這類測試時，函式名稱要帶上 KI 編號，並在註解中說明「這是缺陷不是功能」，
否則下一個讀者只會覺得這個測試寫錯了。

---

## 新增測試的規範

1. 測試函式命名：`test_<情境描述>`，以動詞或名詞開頭清楚描述意圖
2. 每個 Blueprint 對應一個測試檔案（`test_<blueprint_name>.py`）
3. 新增子系統時，建立對應 `test_<name>.py`
4. 若有共用的種子資料或訊息字串，統一放入 `tests/data/` 下的適當檔案
5. 測試應覆蓋：正常流程、邊界條件、權限控制（未登入、一般使用者、管理員、他人）
6. **被權限擋下的 POST 必須同時斷言資料庫沒有改變**。只驗 302 無法區分「被擋下」與「執行成功後 redirect」
7. **涉及庫存的操作必須斷言庫存**。狀態改對了但庫存沒跟上，是本系統最容易出現的錯，
   只驗 `order_status` 抓不到

---

## 執行測試

```bash
pytest                              # 執行所有測試
pytest tests/test_auth.py -v        # 執行特定模組
pytest -k "test_login"              # 執行名稱符合的測試
```
