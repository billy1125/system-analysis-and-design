# meal 子系統（校園訂餐）

## 職責

本系統的核心業務子系統：菜單瀏覽、餐點管理、線上訂餐、訂單審核。
它是「主檔／明細 + 狀態機 + 庫存」三件事的示範場域。

設計模式取自 `billy1125/Course-SAD-Sample-System` 的器材借用（equipment）子系統
——一張申請單、一批明細、一條由管理員推動的狀態流程。訂餐與借用的差異在於：
借用的資源會**還回來**，訂餐的資源**取走就沒了**，因此狀態機的終點不同。

---

## 路由

| 方法 | 路徑 | 端點 | 權限 |
|------|------|------|------|
| `GET` | `/meal/` | `index` | 開放（含訪客） |
| `GET / POST` | `/meal/new` | `new_meal` | 1 + 2 + 3 |
| `GET / POST` | `/meal/edit/<int:meal_id>` | `edit_meal` | 1 + 2 + 3 |
| `POST` | `/meal/delete/<int:meal_id>` | `delete_meal` | 1 + 2 + 3 |
| `GET / POST` | `/meal/order/new` | `new_order` | 1 + 2 |
| `GET` | `/meal/my-orders` | `my_orders` | 1 + 2 |
| `GET` | `/meal/orders/<int:order_id>` | `order_detail` | 1 + 2（本人或管理員） |
| `GET / POST` | `/meal/orders/<int:order_id>/edit` | `edit_order` | 1 + 2（本人、限 pending） |
| `POST` | `/meal/orders/<int:order_id>/cancel` | `cancel_order` | 1 + 2（本人） |
| `GET` | `/meal/admin/orders` | `admin_orders` | 1 + 2 + 3 |
| `POST` | `/meal/admin/orders/<int:order_id>/confirm` | `admin_confirm` | 1 + 2 + 3 |
| `POST` | `/meal/admin/orders/<int:order_id>/reject` | `admin_reject` | 1 + 2 + 3 |
| `POST` | `/meal/admin/orders/<int:order_id>/complete` | `admin_complete` | 1 + 2 + 3 |
| `POST` | `/meal/admin/orders/<int:order_id>/cancel` | `admin_cancel` | 1 + 2 + 3 |

共 14 條，`url_prefix='/meal'`。權限層級的編號見下節。

---

## 三層權限檢查

沿用全站慣例，順序固定不可調換：

```
1. @login_required        無 session   -> redirect auth.login_page
2. _is_usable(user)       帳號失效     -> session.clear() + redirect auth.login_page
3. _is_admin(user)        role != 0    -> flash 無操作權限 + redirect hub.home
```

本子系統的守門分成兩種寫法，**刻意不統一**：

- **管理端路由**（`new_meal`、`edit_meal`、`delete_meal`、`admin_*`）在路由開頭
  明碼寫出三層，與 `blueprints/admin/` 的寫法一致
- **會員端路由**（`new_order`、`my_orders`、`order_detail`、`edit_order`、`cancel_order`）
  把第 1、2 層收斂進 `_current_user()`，收到 `None` 時 `session.clear()` + redirect

差別的原因是 `index` 開放訪客瀏覽，它需要一個「未登入或帳號失效都回傳 `None`」的
helper；有了這個 helper，同一組會員端路由再重複寫兩層就是多餘的。管理端沒有開放
路由，三層各自的處置都不同，收斂反而會遮蔽差異。

> `_current_user()` **必須**做 `_is_usable` 檢查。否則被停用的帳號只要 session 未清，
> 仍能送出訂單、佔用真實的餐點份數，讓 admin 的停用功能形同虛設。這一點與母系統
> `sad-forum` 對 forum 的處置相同（見規格書 §11.5）。

---

## 訂單狀態機

```text
pending ──confirm──> confirmed ──complete──> completed
   │                     │
   ├──reject──> rejected └──cancel──> cancelled
   └──cancel──> cancelled
```

`completed`、`cancelled`、`rejected` 是終端狀態，不可再轉移。

**庫存只在 `confirmed` 狀態被佔用**——這條不變量決定了每個轉移動不動庫存。
規則表與理由見 [`db/CLAUDE.md`](../../db/CLAUDE.md) 的「訂單狀態機」一節。

狀態檢查在**兩個地方**各做一次：

| 位置 | 決定什麼 |
|------|---------|
| 樣板（`{% if order['order_status'] == 'pending' %}`） | 按鈕要不要顯示 |
| 資料層（`db.confirm_meal_order` 等函式開頭的 SELECT） | 資料能不能被改 |

Blueprint 本身**不**重複檢查狀態，只負責把資料層回傳的 `True` / `False` 翻成
flash 訊息。把最終判斷放在資料層，是因為「訂單狀態」與「餐點剩餘份數」都可能在
使用者看到畫面之後、按下按鈕之前被別人改掉。

---

## 為什麼價格要在資料層重新查

`_collect_items()` 從表單只取 `meal_id[]` 與 `quantity[]`，**價格一律用
`db.get_meal()` 重新查詢**。表單上顯示的價格純粹是給人看的，不參與計算。

不這樣做的話，使用者只要竄改隱藏欄位，就能用 1 元訂到便當。這是伺服器端渲染
系統最容易犯的錯：因為畫面是自己產生的，很容易誤以為送回來的東西也是自己的。

同理，`total_amount` 由 `db.create_meal_order()` 依明細計算後寫入，**不由表單或
Blueprint 傳入**——金額是明細的衍生值，交給兩個地方算就會有不一致的一天。

---

## 訂單表單的多品項傳遞

表單以 `meal_id[]` 與 `quantity[]` 兩組平行欄位傳遞，順序對應：

```html
<input type="hidden" name="meal_id[]"  value="{{ m['id'] }}">
<input type="number" name="quantity[]" value="{{ quantities.get(m['id'], 0) }}">
```

後端以 `zip(request.form.getlist('meal_id[]'), request.form.getlist('quantity[]'))`
配對。這個做法沿用範本器材借用的既有慣例，弱點是依賴瀏覽器保證兩個列表等長且同序
（記錄為 KI-M3）。長度不等時會回傳「表單資料不完整」而非默默配錯。

份數填 `0` 表示不訂購該項，不會寫入明細。

---

## 修改訂單時的「已不可訂」品項

`edit_order` 列出的餐點是**「目前可訂的餐點」聯集「這張訂單已經點的餐點」**。

只列前者的話，一道餐點在下單後被管理員停售，使用者一進修改頁就看不到它，按下
儲存就把它從訂單裡無聲刪掉了。列出來之後，樣板會標示「此餐點目前無法訂購，請將
份數改為 0」，使用者必須自己做這個決定。

---

## 樣板

| 檔案 | 用途 |
|------|------|
| `templates/meal/index.html` | 菜單主頁（左側清單 + 右側詳細） |
| `templates/meal/meal_form.html` | 新增／修改餐點（管理員） |
| `templates/meal/order_form.html` | 訂餐／修改訂單（共用） |
| `templates/meal/my_orders.html` | 我的訂單 |
| `templates/meal/order_detail.html` | 訂單明細 |
| `templates/meal/admin_orders.html` | 所有訂單（管理員） |

`order_form.html` 由 `new_order` 與 `edit_order` 共用，靠 `form_title`、`back_url`、
`quantities` 三個變數區分。兩者的欄位與驗證完全相同，共用不會產生分支地獄。

---

## CSS

`static/meal.css`，前綴一律 `meal-`。按鍵顏色引用 `common.css` 的 token，不寫死色碼。

| 類別族 | 用途 |
|--------|------|
| `meal-btn`、`meal-btn-primary/secondary/danger`、`meal-btn-sm` | 一般按鍵 |
| `meal-btn-action`、`meal-btn-action-danger` | 表格行內小按鍵 |
| `meal-badge-{available,sold_out,unavailable}` | 餐點狀態 |
| `meal-badge-{pending,confirmed,completed,cancelled,rejected}` | 訂單狀態 |

狀態 badge 的底色硬編碼於 `meal.css`（`common.css` 未定義狀態語意色，KI-19）。

本子系統的表單**不加** `.login-form` class，否則會誤套 `login.css` 的登入頁樣式。

---

## 常數

| 常數 | 值 | 說明 |
|------|---|------|
| `_PAGE_SIZE` | 10 | 菜單、我的訂單、管理端清單共用 |
| `_MAX_ITEMS_PER_ORDER` | 20 | 單張訂單的總份數上限（業務政策） |
| `_ADVANCE_DAYS` | 7 | 可預訂範圍：今天起算 7 天內（含今天） |

`CATEGORY_LABELS`、`MEAL_STATUS_LABELS`、`ORDER_STATUS_LABELS`、`SLOT_LABELS`
四個字典是資料庫值到中文的對照，同時作為樣板的下拉選單來源——新增一個狀態只需要
改字典，表單與篩選列會一起跟上。

> 合法值的**權威定義**在 `db/meals.py` 的 `MEAL_STATUSES`、`MEAL_CATEGORIES`、
> `ORDER_STATUSES`，驗證一律比對那三個 tuple。Blueprint 的四個字典只負責顯示。
> 例外是 `SLOT_LABELS`——取餐時段沒有對應的資料層常數，驗證直接比對這個字典（KI-M5）。
