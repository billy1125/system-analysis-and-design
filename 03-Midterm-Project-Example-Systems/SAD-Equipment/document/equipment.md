# 器材借用系統文件（equipment）

## 功能定位

`equipment` 是本系統的核心子系統，負責器材的登錄與借出流程。它同時服務三種角色：

- **訪客**：瀏覽器材清單與詳細資料，但不能申請借用
- **一般使用者**：送出借用申請、修改與取消自己的申請、查詢自己的借用紀錄
- **管理員**：維護器材主檔、審核借用申請、登記實際借出與歸還

流程的核心是一張**借用單**（`borrow_orders`），它從送出到結案會經過一系列狀態；
器材的可借數量（`equipment.available_quantity`）在「登記借出」與「登記歸還」兩個時點被改寫。

檔案位置：

- `blueprints/equipment/__init__.py`
- `db/equipment.py`
- `templates/equipment/`（7 個模板）
- `static/equipment.css`

## 路由

| 方法 | 路徑 | Handler | 說明 |
|------|------|---------|------|
| `GET` | `/equipment/` | `index()` | 器材主頁；左側清單（分頁）+ 右側詳細 |
| `GET / POST` | `/equipment/new` | `new_equipment()` | 新增器材 |
| `GET / POST` | `/equipment/edit/<equipment_id>` | `edit_equipment()` | 修改器材 |
| `POST` | `/equipment/delete/<equipment_id>` | `delete_equipment()` | 刪除器材（邏輯刪除） |
| `GET / POST` | `/equipment/<equipment_id>/borrow` | `borrow()` | 送出借用申請 |
| `GET` | `/equipment/my-orders` | `my_orders()` | 我的借用紀錄 |
| `GET` | `/equipment/orders/<order_id>` | `order_detail()` | 借用單詳細 |
| `GET / POST` | `/equipment/orders/<order_id>/edit` | `edit_order()` | 修改借用申請 |
| `POST` | `/equipment/orders/<order_id>/cancel` | `cancel_order()` | 取消借用申請 |
| `GET` | `/equipment/admin/orders` | `admin_orders()` | 借用單管理 |
| `POST` | `/equipment/admin/orders/<order_id>/approve` | `admin_approve()` | 核准 |
| `POST` | `/equipment/admin/orders/<order_id>/reject` | `admin_reject()` | 拒絕 |
| `POST` | `/equipment/admin/orders/<order_id>/borrow` | `admin_borrow()` | 登記借出 |
| `POST` | `/equipment/admin/orders/<order_id>/return` | `admin_return()` | 登記歸還 |

`index`、`my_orders`、`admin_orders` 宣告 `strict_slashes=False`，`/equipment` 與 `/equipment/` 都能存取。

## 權限規則

因為 `GET /equipment/` 開放訪客瀏覽，權限檢查的第 1、2 層收斂進 `_current_user()`：

```python
def _current_user():
    if 'user_id' not in session:
        return None
    user = db.find_user_by_id(session['user_id'])
    return user if _is_usable(user) else None
```

`_current_user()` 刻意**不呼叫 `session.clear()`**——訪客與失效帳號在它眼中都是 `None`，
但只有後者需要清 session。要區分兩者，helper 就得回傳多種狀態，複雜度會失控。
因此每個寫入類路由自行處理：

```python
user = _current_user()
if user is None:
    session.clear()
    return redirect(url_for('auth.login_page'))
```

| 操作 | 訪客 | 一般使用者 | 管理員 |
|------|------|-----------|--------|
| 瀏覽器材清單與詳細 | ✅ | ✅ | ✅ |
| 新增／修改／刪除器材 | ❌ | ❌ | ✅ |
| 送出借用申請 | ❌ | ✅ | ✅ |
| 檢視借用單 | ❌ | 僅自己的 | 全部 |
| 修改／取消借用申請 | ❌ | 僅自己的 | 僅自己的 |
| 審核／登記借出／登記歸還 | ❌ | ❌ | ✅ |

注意管理員**沒有**代替他人修改或取消借用單的權限——那兩個操作只認 `borrower_id`。
管理員要否決一張單，用的是「拒絕」而不是「取消」。

## 器材狀態

| `equipment_status` | 顯示 | 可否借用 |
|--------------------|------|---------|
| `available` | 可借用 | 是（且需 `available_quantity > 0`） |
| `unavailable` | 暫停借用 | 否 |
| `maintenance` | 維修中 | 否 |

「狀態」與「數量」是兩個獨立條件，分別由兩段程式碼把關：

- 狀態：`borrow()` 路由開頭 `if eq['equipment_status'] != 'available'` → flash「此器材目前無法借用」→ redirect
- 數量：`_validate_borrow_form()` 的 `qty > available_quantity` → 回傳「借用數量不可大於可借數量」→ 停留在表單頁

因此一台 `available` 但 `available_quantity = 0` 的器材，使用者能進入借用表單，
但送出時會被數量檢查擋下。模板端 `index.html` 已同時檢查兩個條件才顯示借用按鈕，
但按鈕的隱藏只是介面提示，真正的把關在伺服器端。

## 借用單狀態機

```text
                  ┌──── reject ────> rejected
                  │
pending ──────────┼──── approve ───> approved ──── 登記借出 ───> borrowed
   │              │                     │                          │
   └── cancel ────┴──── cancel ─────────┘                          │
                  │                                                │
             cancelled                                    ┌────────┴────────┐
                                                          │                 │
                                                    登記歸還          （逾期，未實作）
                                                          │                 │
                                                       returned <──登記歸還── overdue
```

| 目標狀態 | 允許的來源狀態 | 觸發者 |
|---------|--------------|--------|
| `approved` | `pending` | 管理員 |
| `rejected` | `pending` | 管理員 |
| `cancelled` | `pending`、`approved` | 借用者本人 |
| `borrowed` | `approved` | 管理員 |
| `returned` | `borrowed`、`overdue` | 管理員 |
| `overdue` | `borrowed` | **無——尚未實作** |

`borrow_order_items.item_status` 與 `order_status` 永遠同步更新，不獨立轉移。

> **`overdue` 的現況**：`ORDER_STATUS_LABELS` 有它的中文標籤（逾期未還），
> `admin_orders.html` 會為它顯示「登記歸還」按鈕，`mark_order_returned` 也接受它作為來源狀態——
> 但**沒有任何程式碼會把借用單設成 `overdue`**。既沒有排程作業，也沒有請求時的延遲判定。
> 這是規格書 KI-01 記錄的功能缺口，也是本系統最適合作為課堂練習的擴充題。

## 數量一致性

| 時間點 | 對 `available_quantity` 的影響 |
|--------|-------------------------------|
| 送出申請 | 無 |
| 核准 | 無（**核准不保留庫存**） |
| 拒絕／取消 | 無 |
| 登記借出 | `- quantity` |
| 登記歸還 | `MIN(+ quantity, total_quantity)` |

可借數量共檢查三次：

1. 送出申請時（`_validate_borrow_form`）
2. 核准時（`approve_order` 的預檢迴圈）
3. 登記借出時（`mark_order_borrowed` 的預檢迴圈）

因為核准不保留庫存，**兩張申請可以同時被核准**；先登記借出的成功，後一張在 `mark_order_borrowed`
被預檢迴圈擋下並回傳 `False`，借用單維持在 `approved`，管理員會看到「登記借出失敗」。

扣減 SQL 另外帶 `AND available_quantity >= ?` 作為最後防線：

```sql
UPDATE equipment
   SET available_quantity = available_quantity - ?, updated_at = datetime('now')
 WHERE id = ? AND available_quantity >= ?
```

歸還則以 `MIN(available_quantity + ?, total_quantity)` 夾住上限，避免重複登記歸還把庫存灌大。

## 核心資料流

### 1. 瀏覽器材

```text
GET /equipment/?page=N&id=M
-> _current_user()（訪客為 None）
-> db.list_equipment(page, 10) -> (items, total)
-> total_pages = ceil(total / 10)
-> 若有 id：db.get_equipment(id) -> selected
-> render equipment/index.html
```

### 2. 送出借用申請

```text
GET  /equipment/<equipment_id>/borrow  -> 顯示表單
POST /equipment/<equipment_id>/borrow
-> @login_required；user is None -> session.clear() + redirect /login
-> db.get_equipment(equipment_id)；不存在 -> flash + redirect
-> equipment_status != 'available' -> flash + redirect
-> _validate_borrow_form(form, eq['available_quantity'])
   1. 開始時間必填
   2. 歸還時間必填
   3. 時間格式（datetime.fromisoformat）
   4. end > start
   5. 借用用途必填
   6. 數量為正整數且不大於可借數量
-> _normalize_dt() 轉為 'YYYY-MM-DD HH:MM:SS'
-> db.create_borrow_order(...)（transaction：主檔 + 一筆明細）
-> flash「借用申請已送出」-> redirect 借用單詳細
```

### 3. 修改借用申請

```text
POST /equipment/orders/<order_id>/edit
-> 借用單存在？否 -> redirect my-orders
-> borrower_id == user['id']？否 -> flash「無權限修改此借用單」
-> order_status == 'pending'？否 -> flash「只有待審核的借用單可以修改」
-> _validate_order_form()（表頭欄位）
-> 逐項檢查 equipment_id[] / quantity[]：器材存在、數量為正、不超過可借數量
-> 至少一項器材
-> db.update_borrow_order(...)（transaction：舊明細標記刪除，重建新明細）
```

`edit_order` 是唯一支援多列明細的入口（`equipment_id[]` / `quantity[]`），
但目前的模板只渲染原有的項目，沒有「新增一列」的介面（規格書 KI-04）。

### 4. 取消借用申請

```text
POST /equipment/orders/<order_id>/cancel
-> db.cancel_order(order_id, user['id'])
   -> 借用單存在且 borrower_id 相符？否 -> False
   -> order_status in ('pending', 'approved')？否 -> False
   -> 主檔與明細狀態改為 cancelled
-> True  -> flash「借用申請已取消」
   False -> flash「無法取消此借用單」
-> redirect 借用單詳細
```

取消**不恢復庫存**，因為核准時本來就沒有扣減。

### 5. 管理員審核

```text
POST /equipment/admin/orders/<order_id>/approve
-> 三層權限檢查
-> review_note 為空字串時轉為 None
-> db.approve_order(order_id, admin_id, note)
   -> 限 order_status = 'pending'
   -> 逐項比對 quantity 與 available_quantity；不足 -> False
   -> 寫入 reviewed_by / reviewed_at / review_note，狀態改為 approved
-> flash 結果 -> redirect 借用單管理
```

`reject` 同流程但不檢查數量。備註由模板的 `prompt()` 收集後寫入隱藏欄位送出。

### 6. 登記借出與歸還

```text
POST /equipment/admin/orders/<order_id>/borrow
-> db.mark_order_borrowed(order_id)
   -> 限 order_status = 'approved'
   -> 預檢：每一項 quantity <= available_quantity，否則 False
   -> with conn:（transaction）
        borrow_orders  -> borrowed，填 actual_borrowed_at
        borrow_order_items -> borrowed
        equipment      -> available_quantity - quantity（帶 >= 防線）

POST /equipment/admin/orders/<order_id>/return
-> db.mark_order_returned(order_id)
   -> 限 order_status in ('borrowed', 'overdue')
   -> with conn:（transaction）
        borrow_orders  -> returned，填 actual_returned_at
        borrow_order_items -> returned
        equipment      -> MIN(available_quantity + quantity, total_quantity)
```

## 資料表

### `equipment`

| 欄位 | 型別 | 說明 |
|------|------|------|
| `id` | INTEGER | 主鍵 |
| `equipment_name` | TEXT | 器材名稱 |
| `equipment_code` | TEXT | 器材編號（未加 UNIQUE 約束） |
| `equipment_description` | TEXT | 器材說明（可為 NULL） |
| `total_quantity` | INTEGER | 總數量 |
| `available_quantity` | INTEGER | 目前可借數量 |
| `equipment_status` | TEXT | `available` / `unavailable` / `maintenance` |
| `created_at` / `updated_at` | TEXT | 時間戳記 |
| `is_deleted` | INTEGER | 邏輯刪除旗標 |

### `borrow_orders`

| 欄位 | 型別 | 說明 |
|------|------|------|
| `id` | INTEGER | 主鍵 |
| `borrower_id` | INTEGER | 借用者，對應 `users.id` |
| `borrow_start_at` / `borrow_end_at` | TEXT | 預計借用起訖 |
| `actual_borrowed_at` / `actual_returned_at` | TEXT | 實際借出／歸還時間 |
| `borrow_reason` | TEXT | 借用用途 |
| `order_status` | TEXT | 七種狀態值 |
| `reviewed_by` / `reviewed_at` / `review_note` | — | 審核資訊（可為 NULL） |
| `created_at` / `updated_at` | TEXT | 時間戳記 |
| `is_deleted` | INTEGER | 邏輯刪除旗標 |

### `borrow_order_items`

| 欄位 | 型別 | 說明 |
|------|------|------|
| `id` | INTEGER | 主鍵 |
| `borrow_order_id` | INTEGER | 對應 `borrow_orders.id` |
| `equipment_id` | INTEGER | 對應 `equipment.id` |
| `quantity` | INTEGER | 借用數量 |
| `item_status` | TEXT | 與 `order_status` 同步 |
| `created_at` / `updated_at` | TEXT | 時間戳記 |
| `is_deleted` | INTEGER | 邏輯刪除旗標 |

三張表都沒有宣告外鍵、CHECK 約束或索引，關聯與狀態值的正確性由 Python 端負責（規格書 KI-06）。

`borrow_orders` / `borrow_order_items` 是典型的主檔／明細結構：一張借用單可以借多種器材，
每種器材各佔一列明細。`create_borrow_order` 與 `update_borrow_order` 都以 `with conn:`
把主檔與明細包在同一個 transaction 裡，避免出現「有單頭沒項目」的孤兒資料。

## 使用到的資料層函式

| 路由 | 呼叫的 `db.*` |
|------|--------------|
| `index` | `list_equipment`、`get_equipment` |
| `new_equipment` / `edit_equipment` | `get_equipment`、`create_equipment`、`update_equipment` |
| `delete_equipment` | `get_equipment`、`soft_delete_equipment` |
| `borrow` | `get_equipment`、`create_borrow_order` |
| `my_orders` | `list_my_orders` |
| `order_detail` | `get_borrow_order`、`list_order_items` |
| `edit_order` | `get_borrow_order`、`list_order_items`、`get_equipment`、`update_borrow_order` |
| `cancel_order` | `cancel_order` |
| `admin_orders` | `list_all_orders` |
| `admin_approve` / `admin_reject` | `approve_order` / `reject_order` |
| `admin_borrow` / `admin_return` | `mark_order_borrowed` / `mark_order_returned` |

## 畫面結構

| 模板 | 用途 | 重點 |
|------|------|------|
| `index.html` | 器材主頁 | 左側清單（`?id=N&page=N`）+ 右側詳細；選取列加 `eq-row-selected` |
| `equipment_form.html` | 新增／修改器材 | 由 `mode='new'` / `mode='edit'` 決定標題與送出目標 |
| `borrow_form.html` | 借用申請 | `<input type="datetime-local">`；顯示目前可借數量 |
| `my_orders.html` | 我的借用紀錄 | 狀態徽章 + 依狀態顯示可用操作 |
| `order_detail.html` | 借用單詳細 | 表頭 + 明細表 + 審核資訊 + 操作按鈕 |
| `edit_order_form.html` | 修改借用申請 | `equipment_id[]` / `quantity[]` 多列表單 |
| `admin_orders.html` | 借用單管理 | 依 `order_status` 顯示核准／拒絕／登記借出／登記歸還 |

狀態徽章的 CSS class 由原始狀態值組成（`eq-badge-order-{{ order['order_status'] }}`），
中文標籤則來自 Blueprint 傳入的 `order_status_labels` 字典——顯示文字與 CSS 不共用同一份字串，
新增狀態時兩邊都要補。

七個模板各自重複一份 topbar，沒有抽成 partial 或 macro（規格書 KI-11）。

## 測試對應

`tests/test_equipment.py`（52 個測試）涵蓋：

| 區塊 | 內容 |
|------|------|
| 器材清單瀏覽 | 訪客／已登入／指定 id／已刪除不顯示／停用帳號視為訪客／種子器材存在 |
| 器材管理 | 新增／修改／刪除 × 管理員／一般使用者／訪客／停用帳號 |
| 器材表單驗證 | 名稱必填、可借數量不可大於總數量、狀態值不合法 |
| 借用申請 | 正常流程、用途空白、結束早於開始、數量超過可借、器材非可借狀態、送出不扣庫存 |
| 我的借用紀錄 | 未登入 redirect、已登入可見自己的單 |
| 借用單詳細 | 本人可看、他人被擋、管理員可看 |
| 修改借用申請 | 本人 pending 可改、他人不可、已核准不可 |
| 取消 | 本人可取消、他人不可、已借出不可 |
| 管理員審核 | 核准、拒絕、重複核准失敗、核准不保留庫存、庫存已借光時核准失敗、一般使用者被擋 |
| 登記借出／歸還 | 數量扣減與恢復、重複歸還不灌大庫存、可借數量不為負 |

所有被權限擋下的 POST 都同時斷言資料庫沒有改變；所有涉及庫存的操作都同時斷言 `available_quantity`。
