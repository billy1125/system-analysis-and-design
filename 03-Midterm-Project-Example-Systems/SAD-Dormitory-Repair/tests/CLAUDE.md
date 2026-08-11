# tests/ — 測試子系統說明

188 個測試案例，執行時間約 2.7 秒。

---

## 測試架構

- **框架**：pytest + pytest-flask（Flask test client，不啟動實際伺服器）
- **層級**：只有一層——**路由層整合測試**。不做單元測試，也不做瀏覽器端 E2E
- **DB 隔離**：每個測試函式透過 `tmp_path` 建立獨立 SQLite 暫存檔，含完整種子資料
- **驗證碼**：透過 `client.session_transaction()` 直接寫入答案，繞過圖形產生
- **身分**：直接注入 `session['user_id']`，不走登入流程（登入流程本身由 `test_auth.py` 覆蓋）

只做一層的理由是本系統的每個路由都很薄（權限檢查 + 驗證 + 一次 db 呼叫 + redirect），從路由進入可以同時覆蓋 Blueprint 與 `db` 兩層，而測試本身仍然讀得懂。

**例外是狀態機**：`test_repair.py` 中有數個測試直接呼叫 `db.assign_request()` 等函式來**佈置前置狀態**。這是把 db 函式當作測試的建構工具，不是在測它——走 HTTP 佈置前置狀態會讓測試變成三倍長，而且失敗時分不清是佈置壞了還是待測行為壞了。

---

## 目錄結構

```
tests/
├── conftest.py         # 6 個 fixtures
├── data/users.py       # USERS、SEED_REQUESTS、MESSAGES（55 則）
├── test_auth.py    (29)
├── test_hub.py     (15)
├── test_profile.py (12)
├── test_admin.py   (38)
├── test_repair.py  (94)
└── CLAUDE.md
```

專案根目錄的 `pytest.ini` 設定 `testpaths = tests`，確保 pytest 只收集本系統的測試，不會走進不相干的目錄。

---

## Fixtures（`conftest.py`）

| Fixture | Scope | 說明 |
|---|---|---|
| `app` | function | 暫存 DB + 種子資料；`TESTING=True` |
| `client` | function | Flask test client（未登入） |
| `authed_client` | function | `user_id = 1`（住宿生 陳小明） |
| `admin_client` | function | `user_id = 2`（宿舍管理員） |
| `other_client` | function | `user_id = 3`（停用帳號，session 直接注入） |
| `staff_client` | function | `user_id = 4`（第二位管理員 王師傅） |

### ⚠️ 最容易踩的陷阱

**五個 client fixture 都由 `client` 衍生，同一個測試中同時請求兩個，拿到的是同一個物件。**

需要兩個以上的身分同時存在時（例如驗證住戶 + 管理員 + 維修人員的完整協作），用 `test_repair.py` 中的 helper：

```python
def _client_as(app, user_id):
    c = app.test_client()
    with c.session_transaction() as sess:
        sess['user_id'] = user_id
    return c
```

報修的許多測試本質上就是三方互動，因此特別容易踩到這個陷阱。

### `other_client` 的三個用途

1. **「非本人、非管理員」的權限邊界**——需先 `db.set_user_active(3, 1)`，否則會被第 2 層守門先攔下，測不到第 4 層
2. **「停用中的管理員」**——先 `db.set_user_role(3, 0)` 再用它，驗證守門的順序
3. **「持有舊 session 的停用帳號」**——驗證各路由的行為，包含 `profile` 的關鍵修正

---

## 種子資料

測試拿到的**不是空資料庫**。`db.init_db()` 會植入四個帳號與六張報修單。

### 四個種子帳號

| id | email | 密碼 | role | is_active | name |
|----|-------|------|:----:|:---------:|------|
| 1 | user@example.com | password123 | 1 | 1 | 陳小明（A 棟 301） |
| 2 | admin@example.com | admin1234 | 0 | 1 | 宿舍管理員 |
| 3 | disabled@example.com | disabled123 | 1 | 0 | *(NULL)* |
| 4 | staff@example.com | staff1234 | 0 | 1 | 維修組 王師傅 |

bcrypt cost=4（測試用，加速雜湊）。要在測試中驗證密碼，直接用上表的明文。

### 六張種子報修單

`tests/data/users.py` 的 `SEED_REQUESTS` 常數提供 id 與申報人，測試不必寫死數字：

```python
SEED_REQUESTS = {
    'pending':     {'id': 1, 'requester_id': 1},
    'assigned':    {'id': 2, 'requester_id': 1},
    'in_progress': {'id': 3, 'requester_id': 1},
    'completed':   {'id': 4, 'requester_id': 1},
    'rejected':    {'id': 5, 'requester_id': 3},   # 由停用帳號申報
    'cancelled':   {'id': 6, 'requester_id': 1},
}
```

六張涵蓋六個狀態，因此 `db.count_by_status()` 在初始狀態下六個數字都是 1。
`user_id=1` 有 5 張，`user_id=3` 有 1 張——這是資料範圍權限測試的基礎。

**撰寫測試時要注意：**

- 數量斷言用**相對式**（`before` / `after`），不寫死絕對值
- 需要一張乾淨的 pending 單時，用 `new_request` fixture 而不是動種子單
- 若必須寫死數字（如分頁測試），在註解中寫明來源（「種子 5 張 + 新增 8 張」）

---

## `tests/data/users.py`

`MESSAGES` 定義**全部 55 則訊息字串**（auth 11、admin 11、repair 33），供測試斷言使用。

**修改 Blueprint 中的訊息字串時，必須同步更新此處。**

> 訊息字串一律集中在 `MESSAGES`，不散落到各測試檔的斷言中。集中之後，改訊息時只要跑一次測試就知道漏改了哪裡。

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
@pytest.fixture
def new_request(app):
    """建立一張屬於 user_id=1 的全新 pending 報修單，回傳 request_id。"""
    return db.create_request(
        requester_id=1, title='測試用報修單', category='water', priority='normal',
        dorm_building='A 棟', room_no='301', contact_phone='0912-345-678',
        description='測試用的故障描述',
    )
```

`db.create_request()` 成本極低，分頁測試可放心建立十幾筆。
`db.create_user()` 使用 bcrypt cost=10（每筆約 0.1 秒），**不要大量建立會員**。

### 用 db 函式佈置狀態

```python
def test_cancel_in_progress_request_rejected(app, new_request):
    db.assign_request(new_request, 2, 4)
    db.start_request(new_request, 4)
    c = _client_as(app, 1)
    resp = c.post(f'/repair/{new_request}/cancel', follow_redirects=True)
    assert MESSAGES['repairCancelFailed'] in resp.get_data(as_text=True)
    assert db.get_request(new_request)['request_status'] == 'in_progress'
```

### 用 parametrize 覆蓋重複的守門測試

```python
@pytest.mark.parametrize('path', [
    '/repair/1/comment', '/repair/1/cancel', '/repair/1/assign', ...
])
def test_post_routes_require_login(client, path):
    resp = client.post(path, data={})
    assert resp.status_code == 302
    assert '/login' in resp.headers['Location']
    assert db.get_request(1)['request_status'] == 'pending'   # ← 關鍵
```

---

## 測試原則

1. 測試函式命名 `test_<情境描述>`
2. 每個 Blueprint 對應一個測試檔
3. 覆蓋四類情境：正常流程、邊界條件、權限控制（未登入／住宿生／他人／管理員）、**狀態機的不合法轉移**
4. **被權限或狀態擋下的 POST 必須同時斷言資料庫沒有改變。** 只驗 302 無法區分「被擋下」與「執行成功後 redirect」——在有狀態機的系統中特別重要，因為兩者的 redirect 目標往往完全相同
5. 若有共用的種子常數或訊息字串，統一放入 `tests/data/`

---

## `test_repair.py` 的八組

| 組 | 案例數 | 內容 |
|---|:---:|------|
| 權限守門 | 18 | 13 條路由的未登入行為、停用帳號、管理清單的角色守門 |
| 資料範圍權限 | 5 | 本人可看、他人不可看、管理員可看全部、不存在、已刪除 |
| 清單 | 12 | 只列自己的、狀態篩選、排序、分頁、管理清單的搜尋與計數 |
| 新增 | 12 | 預填、成功路徑、四個必填欄位、兩個列舉欄位、表單回填 |
| 修改 | 7 | 預填、成功、他人／管理員／非 pending 被擋、驗證 |
| 取消 | 6 | 兩個合法來源狀態、in_progress 被擋、他人與管理員被擋、狀態紀錄 |
| 回覆 | 6 | 本人、管理員、他人被擋、空內容、已結案被擋、updated_at 更新 |
| 狀態機與刪除 | 28 | 六條轉移的成功與失敗路徑、稽核軌跡、完整生命週期、級聯刪除 |

### 最有價值的一個測試

`test_full_lifecycle_with_audit_trail` 一次驗證了狀態機、稽核軌跡、三方協作與時間軸順序：

```python
    logs = db.list_logs(rid)
    assert [log['log_type'] for log in logs] == [
        'report', 'status', 'comment', 'status', 'status',
    ]
    assert logs[0]['user_id'] == 1     # 申報人
    assert logs[1]['user_id'] == 2     # 派工的管理員
    assert logs[3]['user_id'] == 4     # 動工的維修人員
```

任何一環壞掉它都會失敗。

---

## 已知的測試缺口

- **無併發測試**：KI-13 的競態無法用 test client 重現
- **無 CSS 與版面測試**：模板渲染只驗證關鍵字串存在
- **無 Docker 測試**：`docker compose up` 的行為未自動化驗證
- **時區未被斷言**：KI-25 的 UTC 顯示問題沒有任何測試會失敗——測試只比對時間欄位「非 NULL」或先後順序

---

## 執行測試

```bash
pytest                          # 全部 188 個
pytest tests/test_repair.py -v
pytest -k "full_lifecycle" -v
pytest -k "rejects_disabled_user or rejects_deleted_user" -v   # profile 的關鍵修正
```
