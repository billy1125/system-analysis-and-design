# equipment Blueprint

## 職責

器材借用系統的核心子系統：器材瀏覽、借用申請、借用紀錄查詢，以及管理員的器材維護、借用單審核、登記借出與歸還。

---

## 路由

| 方法         | 路徑                                         | 函式               | 說明                          |
| ------------ | -------------------------------------------- | ------------------ | ----------------------------- |
| `GET`        | `/equipment/`                                | `index`            | 器材主頁；左側清單 + 右側詳細（訪客可瀏覽） |
| `GET / POST` | `/equipment/new`                             | `new_equipment`    | 管理員新增器材                |
| `GET / POST` | `/equipment/edit/<equipment_id>`             | `edit_equipment`   | 管理員修改器材                |
| `POST`       | `/equipment/delete/<equipment_id>`           | `delete_equipment` | 管理員刪除器材（邏輯刪除）    |
| `GET / POST` | `/equipment/<equipment_id>/borrow`           | `borrow`           | 送出借用申請（單項器材）      |
| `GET`        | `/equipment/my-orders`                       | `my_orders`        | 我的借用紀錄                  |
| `GET`        | `/equipment/orders/<order_id>`               | `order_detail`     | 借用單詳細（本人或管理員）    |
| `GET / POST` | `/equipment/orders/<order_id>/edit`          | `edit_order`       | 修改借用申請（限本人、限 pending） |
| `POST`       | `/equipment/orders/<order_id>/cancel`        | `cancel_order`     | 取消借用申請                  |
| `GET`        | `/equipment/admin/orders`                    | `admin_orders`     | 管理員查看所有借用單          |
| `POST`       | `/equipment/admin/orders/<order_id>/approve` | `admin_approve`    | 核准借用單                    |
| `POST`       | `/equipment/admin/orders/<order_id>/reject`  | `admin_reject`     | 拒絕借用單                    |
| `POST`       | `/equipment/admin/orders/<order_id>/borrow`  | `admin_borrow`     | 登記借出（扣減可借數量）      |
| `POST`       | `/equipment/admin/orders/<order_id>/return`  | `admin_return`     | 登記歸還（恢復可借數量）      |

`index` 與 `my_orders`、`admin_orders` 宣告 `strict_slashes=False`，`/equipment` 與 `/equipment/` 皆可存取。

---

## 權限

本子系統有開放訪客瀏覽的頁面，因此權限檢查的第 1、2 層收斂進 `_current_user()`
（見 `rules/flask-blueprint.md`「開放瀏覽的子系統」）：

```python
def _current_user():
    if 'user_id' not in session:
        return None
    user = db.find_user_by_id(session['user_id'])
    return user if _is_usable(user) else None
```

寫入類路由仍各自處理 `user is None`（`session.clear()` + redirect 登入頁），因為接下來會取用 `user['id']`。
`_is_admin(user)` 為本 Blueprint 的局部 helper，**不放入 `utils.py`**。

| 操作 | 需要條件 |
|------|---------|
| 瀏覽器材清單與詳細 | 無（訪客可看） |
| 器材新增 / 修改 / 刪除 | 登入 + 帳號有效 + `role == 0` |
| 送出借用申請 | 登入 + 帳號有效 |
| 檢視借用單 | 借用者本人 或 管理員 |
| 修改 / 取消借用申請 | 借用者本人 |
| 審核 / 登記借出 / 登記歸還 | 登入 + 帳號有效 + `role == 0` |

---

## 業務邏輯

### 分頁

`_PAGE_SIZE = 10`，以 `?page=N` 控制器材清單分頁；`?id=N` 指定右側顯示的器材。
「我的借用紀錄」與「借用單管理」兩頁**不分頁**（見 KI-13）。

### 器材狀態（`equipment_status`）

| 狀態值        | 顯示     | 是否可借 |
|--------------|----------|---------|
| `available`  | 可借用   | 是（且需 `available_quantity > 0`） |
| `unavailable`| 暫停借用 | 否 |
| `maintenance`| 維修中   | 否 |

「狀態」與「數量」是兩個獨立條件：`available` 但 `available_quantity = 0` 的器材，
狀態檢查會通過、數量檢查會擋下（錯誤訊息為「借用數量不可大於可借數量」）。

### 借用單狀態機（`order_status`）

```
pending ──approve──> approved ──登記借出──> borrowed ──登記歸還──> returned
   │                    │                      │
   │                    │                      └──（逾期）──> overdue ──登記歸還──> returned
   ├──reject──> rejected
   └──cancel──> cancelled  <──cancel── approved
```

- `cancelled` 只接受來源狀態 `pending` 或 `approved`
- `borrowed` 只接受來源狀態 `approved`
- `returned` 接受來源狀態 `borrowed` 或 `overdue`
- **`overdue` 目前沒有任何程式碼會寫入**——只有讀取端（狀態標籤、歸還按鈕）支援它。
  逾期偵測未實作，見 `document/system-spec.md` 第 11 章 KI-01。

`borrow_order_items.item_status` 與 `order_status` 永遠同步更新，不獨立轉移。

### 數量與資料一致性

| 時間點 | 對 `equipment.available_quantity` 的影響 |
|--------|------------------------------------------|
| 送出申請 | 無 |
| 核准 | 無（**核准不保留庫存**） |
| 登記借出 | `available_quantity - quantity` |
| 取消 | 無（因為核准時沒有扣減） |
| 登記歸還 | `MIN(available_quantity + quantity, total_quantity)` |

可借數量共檢查三次：送出申請時、核准時、登記借出時。因為核准不保留庫存，
兩張單可以同時被核准；先登記借出的那張成功，後一張在 `mark_order_borrowed` 被擋下並回傳 `False`。
這是刻意保留的行為，`tests/test_equipment.py::test_available_quantity_not_below_zero` 鎖住它。

扣減 SQL 帶 `AND available_quantity >= ?` 作為最後防線，配合函式開頭的預檢迴圈，
確保 `available_quantity` 不會變成負數；歸還則以 `MIN(..., total_quantity)` 夾住上限，
避免重複登記歸還把庫存灌大。

### 日期驗證

`_validate_borrow_form` / `_validate_order_form` 只檢查 `end > start` 與格式，
**沒有**最長借用期限、開始時間須在未來、期間重疊檢查、每人同時借用上限（見 KI-08、KI-09）。

`_normalize_dt` 把表單的 `YYYY-MM-DDTHH:MM` 轉為 DB 的 `YYYY-MM-DD HH:MM:SS`；
`_fmt_dt_for_input` 做反向轉換供 `<input type="datetime-local">` 預填。

---

## 資料模型

三張表的完整 DDL 見 `db/CLAUDE.md`；欄位字典見 `document/system-spec.md` 第 6 章。

- `equipment` — 器材主檔（名稱、編號、總數量、可借數量、狀態）
- `borrow_orders` — 借用單主檔（借用者、預計起訖、實際借出/歸還、用途、狀態、審核資訊）
- `borrow_order_items` — 借用單明細（器材、數量、明細狀態）

`borrow_orders` / `borrow_order_items` 是典型的主檔／明細結構。明細表支援多筆，
但 `borrow` 路由一次只能建立一筆（單項借用）；`edit_order` 已能處理 `equipment_id[]` / `quantity[]`
多列表單，購物車式的多項借用介面尚未提供（見 KI-04）。

---

## Templates

- `templates/equipment/index.html` — 器材主頁：左側清單（分頁）+ 右側詳細與借用入口
- `templates/equipment/equipment_form.html` — 管理員新增／修改器材（`mode='new'|'edit'`）
- `templates/equipment/borrow_form.html` — 借用申請表單
- `templates/equipment/my_orders.html` — 我的借用紀錄
- `templates/equipment/order_detail.html` — 借用單詳細（表頭 + 明細表 + 操作按鈕）
- `templates/equipment/edit_order_form.html` — 修改借用申請
- `templates/equipment/admin_orders.html` — 管理員借用單列表，按狀態顯示不同操作按鈕

狀態徽章的 CSS class 由原始狀態值組成（`eq-badge-order-{{ order['order_status'] }}`），
中文標籤則來自 Blueprint 傳入的 `order_status_labels` 字典——顯示文字與 CSS 不共用同一份字串。

七個模板各自重複一份 topbar，沒有抽成 partial 或 macro，屬刻意保留（見 KI-11）。

---

## CSS

- `static/equipment.css` — 器材頁面專用樣式，按鍵前綴 `eq-btn-*`、`eq-btn-action-*`

---

## 測試

`tests/test_equipment.py`，涵蓋：
- 器材清單瀏覽（訪客／已登入／指定 id／已刪除不顯示／停用帳號視為訪客）
- 種子器材植入
- 器材管理（新增／修改／刪除 × 管理員／一般使用者／訪客／停用帳號）
- 器材表單驗證（名稱必填、可借數量不可大於總數量、狀態值不合法）
- 借用申請（正常、用途空白、結束早於開始、數量超過可借、器材非可借狀態、送出不扣庫存）
- 我的借用紀錄
- 借用單詳細（本人／他人／管理員）
- 修改借用申請（本人 pending 可改、他人不可、已核准不可）
- 取消（本人／他人／已借出不可）
- 審核（核准、拒絕、重複核准失敗、核准不保留庫存、一般使用者被擋）
- 登記借出與歸還（數量扣減與恢復、重複歸還不灌大庫存、可借數量不為負）
