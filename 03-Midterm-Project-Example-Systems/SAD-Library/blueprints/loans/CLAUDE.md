# loans Blueprint

## 職責

借書、續借、還書，以及讀者端的「我的借閱」與館員端的全館借閱管理。

---

## 路由

| 方法   | 路徑                        | 函式          | 權限          | 說明                     |
| ------ | --------------------------- | ------------- | ------------- | ------------------------ |
| `POST` | `/loans/borrow/<book_id>`   | `borrow`      | 登入          | 借出一本書               |
| `GET`  | `/loans/my-loans`           | `my_loans`    | 登入          | 自己的借閱紀錄           |
| `GET`  | `/loans/<loan_id>`          | `loan_detail` | 本人或館員    | 借閱明細                 |
| `POST` | `/loans/<loan_id>/renew`    | `renew`       | 本人          | 續借                     |
| `POST` | `/loans/<loan_id>/return`   | `return_book` | 本人或館員    | 歸還／還書登記           |
| `GET`  | `/loans/admin/loans`        | `admin_loans` | 館員          | 全館借閱紀錄             |

---

## 業務規則寫在哪裡

**借閱規則全部在 `db/loans.py`，本 Blueprint 不重複判斷。**

```python
LOAN_PERIOD_DAYS  = 14   # 借期
RENEW_PERIOD_DAYS = 14   # 每次續借延長
MAX_ACTIVE_LOANS  = 5    # 每人同時可借冊數
MAX_RENEW_COUNT   = 1    # 每筆可續借次數
```

路由只做三件事：確認身分、呼叫 `db` 函式、把回傳的狀態碼翻成訊息。

```python
result, loan_id = db.borrow_book(book_id, user['id'])
if result == 'ok':
    ...
flash(BORROW_MESSAGES.get(result, '借閱失敗'), 'error')
```

`BORROW_MESSAGES` 與 `RENEW_MESSAGES` 兩個字典就是狀態碼與訊息的對照表。
新增規則時，`db` 層加狀態碼、這裡加一行訊息，其餘不動。

### 借書的規則順序（由 `db.borrow_book()` 判定）

1. 書目存在且未下架 → `missing`
2. 書目狀態為可借閱 → `book_unavailable`
3. 讀者無逾期未還 → `has_overdue`
4. 未達同時借閱上限 → `limit_reached`
5. 未借過同一書目且尚未歸還 → `already_borrowed`
6. 尚有可借複本 → `no_copy`

順序有意義：逾期檢查排在冊數上限之前，逾期的人看到的應該是「請先歸還」
而不是「已達上限」。

### 續借的規則順序（由 `db.renew_loan()` 判定）

存在 → 本人 → 未歸還 → 未達續借上限 → 未逾期 → 無他人預約。

**館員也不能替讀者續借**，這是刻意的：續借是讀者對自己借閱的展期意思表示。
還書則相反，館員可代為登記。

### 逾期怎麼算

不用排程更新狀態，一律在查詢當下由 SQL 推導：

```sql
CASE WHEN l.returned_at IS NULL AND l.due_at < datetime('now')
     THEN 1 ELSE 0 END AS is_overdue
```

因此 `loans.loan_status` 只有 `'borrowed'` 與 `'returned'` 兩個值，
畫面上的「逾期未還」是 `is_overdue` 推導出來的第三種顯示狀態。

### 還書後的連鎖效果

`db.return_loan()` 在同一個 transaction 內：更新借閱單 → 複本回架 →
把該書目排隊最久的 `waiting` 預約升級為 `ready`。

### `?from=admin` 的用途

還書的 redirect 目的地依來源決定：館員從借閱管理頁按「還書登記」時，
表單帶 `<input type="hidden" name="from" value="admin">`，導回管理頁；
其餘情況導回借閱明細。

---

## Templates

- `templates/loans/my_loans.html` — 讀者的借閱清單（含狀態篩選）
- `templates/loans/loan_detail.html` — 單筆明細與續借／歸還按鈕
- `templates/loans/admin_loans.html` — 全館借閱（篩選、搜尋、分頁、還書登記）

---

## CSS

`static/loans.css`，前綴 `loan-`。三個徽章 `loan-badge-borrowed`／`-returned`／`-overdue`
對應畫面上的三種顯示狀態。

---

## 測試

`tests/test_loans.py`（53 個），涵蓋：
- 借書成功後的資料變化（借閱單、複本狀態、可借數量、到期日）
- 六種借書失敗情境各一個測試
- 續借的六種失敗情境
- 還書的權限（本人、館員、他人）與重複歸還
- 逾期借閱：封鎖借書、封鎖續借、歸還後解除封鎖
- 還書自動遞補預約
- 借閱管理的篩選、搜尋、分頁與逾期計數
