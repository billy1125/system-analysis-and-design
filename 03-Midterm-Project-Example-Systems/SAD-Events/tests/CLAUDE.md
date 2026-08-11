# tests/ — 測試子系統說明

本目錄包含所有 pytest 測試，對應各 Blueprint 子系統。

---

## 測試架構

- **框架**：pytest + pytest-flask（使用 Flask test client，不啟動實際伺服器）
- **DB 隔離**：每個測試函式透過 `tmp_path` fixture 建立獨立 SQLite 暫存檔，並植入種子資料，測試結束後自動清除
- **驗證碼**：直接透過 `client.session_transaction()` 將答案寫入 session，繞過圖形驗證碼產生流程
- **案例數**：152（auth 23／hub 11／profile 8／admin 30／events 80）

---

## 目錄結構

```
tests/
├── conftest.py         # Fixtures：app、client、authed_client、admin_client、other_client
├── data/
│   └── users.py        # 種子帳號常數（USERS）、種子活動常數（SEED_EVENTS）、訊息字串（MESSAGES）
├── test_auth.py        # auth Blueprint 測試
├── test_hub.py         # hub Blueprint 測試
├── test_profile.py     # profile Blueprint 測試
├── test_admin.py       # admin Blueprint 測試
├── test_events.py      # events Blueprint 測試
└── CLAUDE.md           # 本文件
```

---

## `pytest.ini`

專案根目錄下有兩個參考用的獨立專案（`sad-forum/`、`Course-SAD-Sample-System/`），
各自帶有 `tests/conftest.py`。若一併被收集會產生 `ImportPathMismatchError`，
導致**任何測試都無法執行**。因此根目錄的 `pytest.ini` 限定：

```ini
testpaths = tests
norecursedirs = .git __pycache__
```

---

## Fixtures（conftest.py）

| Fixture | Scope | 說明 |
|---|---|---|
| `app` | function | 建立暫存 DB + 植入種子資料；`TESTING=True`；每個測試函式獨立 |
| `client` | function | Flask test client（未登入狀態） |
| `authed_client` | function | `session['user_id'] = 1`（user@example.com，一般使用者） |
| `admin_client` | function | `session['user_id'] = 2`（admin@example.com，管理員） |
| `other_client` | function | `session['user_id'] = 3`（disabled@example.com，停用帳號但 session 直接注入） |

> `other_client` 在本系統有三個用途：
> 1. 測「非本人、非活動發起者、非管理員」的權限邊界
> 2. 測「停用中的管理員」是否被 admin 的第 2 層守門攔下（先 `db.set_user_role(3, 0)`）
> 3. 測持有舊 session 的停用帳號在各路由的行為（驗證 events 的守門修正與 KI-03）

### 兩個陷阱

**陷阱一：events 的權限測試必須先啟用 user 3。**
`events._current_user()` 會把停用帳號視為 `None`，因此「他人無權限」的測試若直接用
`other_client`，會被更前面的帳號有效性檢查攔下，測不到權限那一層。
`test_events.py` 提供 `_enable_other()` helper 處理這件事：

```python
def test_edit_event_by_other_rejected(other_client, event):
    _enable_other()          # db.set_user_active(3, 1)
    resp = other_client.get(f'/events/edit/{event}')
    assert resp.status_code == 302
```

**陷阱二：三個 authed fixture 是同一個物件。**
`authed_client`、`admin_client`、`other_client` 都由 `client` 衍生，
**同一個測試中同時請求兩個，拿到的是同一個 test client**。
需要第二個乾淨的 client 時，請求 `app` fixture 後自行 `app.test_client()`
（見 `test_admin.py::test_deleted_user_cannot_login`）。

---

## 種子資料

`db.init_db()` 會植入**三個帳號**與**五筆活動**（含七筆報名紀錄），
因此每個測試拿到的資料庫**不是空的**。

### 種子帳號

| id | email | 密碼 | role | is_active | name |
|----|-------|------|------|-----------|------|
| 1 | user@example.com | password123 | 1 | 1 | 一般使用者 |
| 2 | admin@example.com | admin1234 | 0 | 1 | 管理員 |
| 3 | disabled@example.com | disabled123 | 1 | 0 | None |

> bcrypt cost=4（測試用，加速雜湊）。若需在測試中驗證密碼，直接使用上表的明文密碼。

### 種子活動

| id | 標題 | 發起者 | 狀態 | 報名 |
|:--:|------|--------|------|------|
| 1 | 新生入學說明會 | 2 | `ended` | user 1 |
| 2 | 春季校園路跑 | 2 | `closed` | user 1 |
| 3 | 系學會迎新茶會 | 1 | `full`（2/2） | user 1、user 2 |
| 4 | 生成式 AI 實作工作坊 | 2 | `not_open` | 無 |
| 5 | 期末專題成果發表會 | 1 | `available` | user 2；user 1 已取消 |

`tests/data/users.py` 的 `SEED_EVENTS` 提供 id 與標題常數，測試可直接引用，
不必自行建立處於特定狀態的活動：

```python
def test_register_full_event_rejected(other_client):
    _enable_other()
    eid = SEED_EVENTS['full']['id']
    resp = other_client.post(f'/events/{eid}/register', data={'meal_type': '0'},
                             follow_redirects=True)
    assert MESSAGES['statusFull'] in resp.get_data(as_text=True)
```

### 種子資料對測試的三個影響

1. **不要寫死絕對數量。** 斷言活動數量請用相對式
   （`before = db.list_events()[1]` … `assert after == before + 1`）
2. **`list_events()` 的 `page_size` 預設是 5**，五筆種子活動剛好佔滿第一頁。
   fixture 建立的第一筆活動 id 是 6，且會出現在第二頁
3. **user 1 已有四筆報名紀錄**（三筆 registered、一筆 cancelled）。
   測「我的報名為空」要用 user 3

---

## 測試資料（tests/data/users.py）

| 常數 | 內容 |
|------|------|
| `USERS` | 三個種子帳號的 email、密碼、id |
| `SEED_EVENTS` | 五筆種子活動的 id、標題、名額，以狀態為 key |
| `MESSAGES` | 全部 **50 條**訊息字串（auth 11、admin 11、events 28） |

**修改 Blueprint 中的訊息字串時，必須同步更新 `MESSAGES`。**

> 這一點相對於參考範本 `sad-forum` 是個修正：那裡的論壇訊息散落在 `test_forum.py`
> 的斷言中，與集中在 `MESSAGES` 的 auth／admin 訊息不一致（其 KI-29）。
> 本系統把 events 的訊息全部集中，不留這個不一致。

---

## 常見測試模式

### 驗證碼繞過

```python
def _set_captcha(client, answer='ABCDE'):
    with client.session_transaction() as sess:
        sess['captcha'] = answer
```

### 建立測試資料（local fixture）

```python
# 活動：建立成本極低，分頁測試可放心建立十幾筆
@pytest.fixture
def event(app):
    return db.create_event(event_title='測試活動', ..., user_id=1)

@pytest.fixture
def registered(app, event):
    db.create_or_restore_registration(event_id=event, user_id=1, ...)
    return event

# 會員：create_user 使用 bcrypt cost=10，每筆約 0.1 秒，不要大量建立
@pytest.fixture
def many_users(app):
    for i in range(8):
        db.create_user(f'u{i}@example.com', 'password123', f'測試{i}')
    return 11
```

### 表單資料工廠

活動表單有十個欄位，每個測試都寫一遍會淹沒重點。`test_events.py` 用 `_event_form(**overrides)`
產生完整表單，只覆寫要測的那一欄：

```python
def test_new_event_capacity_zero(authed_client):
    resp = authed_client.post('/events/new', data=_event_form(capacity='0'))
    assert MESSAGES['eventCapacityNotPositive'].encode() in resp.data
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
4. 共用的種子資料或訊息字串，統一放入 `tests/data/` 下的適當檔案
5. 測試應覆蓋：正常流程、邊界條件、權限控制（未登入、一般使用者、活動發起者、管理員、他人）
6. **被權限擋下的 POST 必須同時斷言資料庫沒有改變**

---

## 執行測試

```bash
pytest                              # 執行所有測試（152 個）
pytest tests/test_events.py -v      # 執行特定模組
pytest -k "register"                # 執行名稱符合的測試
```
