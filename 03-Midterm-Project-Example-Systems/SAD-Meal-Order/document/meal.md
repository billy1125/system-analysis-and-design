# 訂餐系統文件（meal）

## 功能定位

`meal` 是本系統的核心業務子系統，提供四件事：

- **菜單瀏覽**：任何人（含訪客）都可以看到今日供應的餐點、價格與剩餘份數
- **餐點管理**：管理員新增、修改、下架餐點
- **線上訂餐**：登入且帳號有效的會員可以送出訂單，並在管理員確認前修改或取消
- **訂單審核**：管理員確認、拒絕、登記取餐，或代為取消

檔案位置：

- `blueprints/meal/__init__.py`
- `db/meals.py`
- `templates/meal/`（六個樣板）
- `static/meal.css`
- `tests/test_meal.py`

---

## 路由

| 方法 | 路徑 | Handler | 權限 | 說明 |
|------|------|---------|------|------|
| `GET` | `/meal/` | `index()` | 開放 | 菜單主頁；`?category=` `?meal_id=` `?page=` 可組合 |
| `GET / POST` | `/meal/new` | `new_meal()` | 管理員 | 新增餐點 |
| `GET / POST` | `/meal/edit/<meal_id>` | `edit_meal()` | 管理員 | 修改餐點 |
| `POST` | `/meal/delete/<meal_id>` | `delete_meal()` | 管理員 | 下架餐點（軟刪除） |
| `GET / POST` | `/meal/order/new` | `new_order()` | 會員 | 訂餐 |
| `GET` | `/meal/my-orders` | `my_orders()` | 會員 | 我的訂單（分頁） |
| `GET` | `/meal/orders/<order_id>` | `order_detail()` | 本人或管理員 | 訂單明細 |
| `GET / POST` | `/meal/orders/<order_id>/edit` | `edit_order()` | 本人、限 pending | 修改訂單 |
| `POST` | `/meal/orders/<order_id>/cancel` | `cancel_order()` | 本人 | 取消訂單 |
| `GET` | `/meal/admin/orders` | `admin_orders()` | 管理員 | 所有訂單；`?status=` `?page=` |
| `POST` | `/meal/admin/orders/<order_id>/confirm` | `admin_confirm()` | 管理員 | 確認並扣減庫存 |
| `POST` | `/meal/admin/orders/<order_id>/reject` | `admin_reject()` | 管理員 | 拒絕 |
| `POST` | `/meal/admin/orders/<order_id>/complete` | `admin_complete()` | 管理員 | 登記取餐 |
| `POST` | `/meal/admin/orders/<order_id>/cancel` | `admin_cancel()` | 管理員 | 代為取消 |

共 14 條，`url_prefix='/meal'`。

---

## 資料模型

三張表，形成兩層主檔／明細關係：

```text
users ──1:N──> meal_orders ──1:N──> meal_order_items ──N:1──> meals
                （訂單主檔）          （訂單明細）              （餐點主檔）
```

`meal_order_items` 同時被 `meal_orders` 與 `meals` 指向——它是一張**關聯表帶屬性**
（quantity、unit_price、subtotal）。這是比論壇的 `forum` / `forum_details` 更完整的
主檔／明細案例：論壇的明細只指向主檔，訂單的明細還要指向被訂購的商品。

欄位字典與 DDL 見 [`db/CLAUDE.md`](../db/CLAUDE.md)。三個值得記住的設計決策：

**價格用 INTEGER。** 以「元」為單位存整數，不用 REAL。金額用浮點數會產生
`0.1 + 0.2 != 0.3` 這類誤差，而訂單總金額是明細的加總，誤差會累積。

**明細存 `unit_price` 快照。** `meals.price` 是「現在多少錢」，`meal_order_items.unit_price`
是「當時多少錢」。不存快照的話，一次調價會讓所有歷史訂單的金額跟著變動。

**`total_amount` 是衍生值。** 由 `db.create_meal_order()` 依明細算出後寫入主檔，
Blueprint 與表單都不參與計算。存下來是為了列表查詢不必每次 JOIN 加總；
唯一寫入點只有資料層，避免兩個地方算出不同答案。

---

## 訂單狀態機

```text
pending ──confirm──> confirmed ──complete──> completed
   │                     │
   ├──reject──> rejected └──cancel──> cancelled
   └──cancel──> cancelled
```

五個狀態、六條轉移。`completed`、`cancelled`、`rejected` 是終端狀態。

| 狀態 | 中文 | 訂購人可做 | 管理員可做 |
|------|------|-----------|-----------|
| `pending` | 待確認 | 修改、取消 | 確認、拒絕、代為取消 |
| `confirmed` | 已確認 | 取消 | 登記取餐、代為取消 |
| `completed` | 已取餐 | — | — |
| `cancelled` | 已取消 | — | — |
| `rejected` | 已拒絕 | — | — |

### 庫存不變量

**`meals.remaining_quantity` 只在 `confirmed` 狀態被佔用。**

| 轉移 | 庫存 | 理由 |
|------|------|------|
| pending → confirmed | **扣減** | 開始佔用 |
| confirmed → cancelled | **回補** | 停止佔用 |
| pending → cancelled | 不動 | 本來就沒佔用 |
| pending → rejected | 不動 | 同上 |
| confirmed → completed | 不動 | 餐點已被取走，額度真的消耗掉了 |

由這條不變量可推得：**任何一張訂單經過任意合法的轉移序列後，庫存都會回到
一致狀態**——要嘛被永久消耗（completed），要嘛完整還原（cancelled）。

回補以 `MIN(remaining + qty, daily_quantity)` 封頂。管理員可能在訂單存續期間調低
`daily_quantity`（例如發現食材不夠），不封頂就會把剩餘份數加到超過當日供應量。

> **為什麼扣減不放在下單當下？** 那會讓「送出訂單」變成一個佔用實體資源的動作，
> 使用者隨手送一張再放著不管，就把份數卡住了。放在確認時扣減，代表這個系統的
> 語意是「先登記、由管理員決定是否成立」，與器材借用範本的 approve → borrow
> 兩段式一致，只是訂餐把兩段併成一段。
>
> 代價是：`pending` 階段可以超額登記——十個人各訂最後一份便當都會成功，直到
> 管理員確認第一張之後，其餘九張才會在確認時失敗。這個取捨記錄為 KI-M1。

### 確認時的重新檢查

`db.confirm_meal_order()` 在扣減前重新查一次每一項的 `remaining_quantity` 與
`meal_status`：使用者下單到管理員確認之間，其他人的訂單可能已經把份數吃掉，
或管理員自己把餐點停售了。

任何一項不足就**整張退回 `False`**，不做部分確認。理由是訂單是一個語意單位——
只確認一半的訂單，取餐時說不清楚該給什麼。

---

## 資料流

### GET `/meal/`

```text
GET /meal/?category=main&meal_id=1&page=1
-> _current_user()：未登入或帳號失效皆回傳 None（訪客視圖）
-> category 不在 MEAL_CATEGORIES 中則視同未篩選
-> db.list_meals(page, page_size=10, category)
-> meal_id 有值時 db.get_meal(meal_id)，已刪除者視同未選取
-> render meal/index.html
```

### POST `/meal/order/new`

```text
POST /meal/order/new
-> @login_required
-> _current_user() is None -> session.clear() + redirect /login
-> _collect_items(request.form)
     讀 meal_id[] 與 quantity[]，逐項以 db.get_meal() 重新查價與驗證
     份數 0 者跳過；餐點不存在／已下架／非供應中／份數不足 -> 錯誤
-> _validate_order_form(form, items)
     日期必填、格式正確、不早於今天、不超過 7 天
     時段合法、地點必填、至少一項、總份數 <= 20
-> db.create_meal_order(...)  transaction：主檔 + 明細，狀態 pending，不動庫存
-> redirect /meal/orders/<new_id>
```

### POST `/meal/admin/orders/<id>/confirm`

```text
POST /meal/admin/orders/3/confirm
-> @login_required
-> _is_usable  -> 否則 session.clear() + redirect /login
-> _is_admin   -> 否則 flash 無操作權限 + redirect /
-> db.confirm_meal_order(order_id, admin_id, note)
     訂單須存在、未刪除、狀態為 pending
     逐項檢查餐點未下架、狀態為 available、份數足夠
     transaction：主檔改 confirmed + 寫審核欄位、明細改 confirmed、扣減庫存
-> True  -> flash 訂單已確認
   False -> flash 確認失敗（餐點份數不足、已停售，或訂單狀態不符）
-> redirect /meal/admin/orders
```

---

## 驗證規則

### 餐點表單（`_validate_meal_form`）

檢查順序即失敗時回報的優先順序：

| # | 條件 | 訊息 |
|---|------|------|
| 1 | 編號非空 | `請輸入餐點編號` |
| 2 | 名稱非空 | `請輸入餐點名稱` |
| 3 | 分類屬於 `main` / `side` / `drink` | `餐點分類不正確` |
| 4 | 狀態屬於 `available` / `sold_out` / `unavailable` | `餐點狀態不正確` |
| 5 | 價格可解析為整數 | `價格格式不正確` |
| 6 | 價格 ≥ 0 | `價格不可小於 0` |
| 7 | 每日供應份數可解析為整數 | `每日供應份數格式不正確` |
| 8 | 每日供應份數 ≥ 0 | `每日供應份數不可小於 0` |
| 9 | 剩餘份數可解析為整數 | `剩餘份數格式不正確` |
| 10 | 剩餘份數 ≥ 0 | `剩餘份數不可小於 0` |
| 11 | 剩餘份數 ≤ 每日供應份數 | `剩餘份數不可大於每日供應份數` |

### 訂購項目（`_collect_items`）

逐項檢查，任一項失敗即整張退回：

| # | 條件 | 訊息 |
|---|------|------|
| 1 | 兩組欄位等長 | `表單資料不完整，請重新送出` |
| 2 | `meal_id` 可解析為整數 | `餐點編號格式不正確` |
| 3 | 份數可解析為整數 | `訂購份數格式不正確` |
| 4 | 份數 ≥ 0 | `訂購份數不可小於 0` |
| 5 | 餐點存在且未下架 | `所選餐點不存在或已下架` |
| 6 | `meal_status == 'available'` | `「<名稱>」目前無法訂購` |
| 7 | 份數 ≤ 剩餘份數 | `「<名稱>」剩餘份數不足（目前剩餘 N 份）` |

> 第 6 與第 7 的順序有意義：已售完的餐點（`sold_out` 且剩餘為 0）會先撞到第 6 條，
> 收到「目前無法訂購」而非「份數不足」。要看到第 7 條的訊息，餐點必須是
> `available` 但剩餘不足。`tests/test_meal.py` 分成兩個測試分別涵蓋這兩條路徑。

### 訂單抬頭（`_validate_order_form`）

| # | 條件 | 訊息 |
|---|------|------|
| 1 | 取餐日期非空 | `請選擇取餐日期` |
| 2 | 日期格式為 `YYYY-MM-DD` | `取餐日期格式不正確` |
| 3 | 不早於今天 | `取餐日期不可早於今天` |
| 4 | 不超過 7 天 | `最多只能預訂 7 天內的餐點` |
| 5 | 時段屬於 `lunch` / `dinner` | `取餐時段不正確` |
| 6 | 取餐地點非空 | `請輸入取餐地點` |
| 7 | 至少一項份數大於 0 | `請至少訂購一項餐點` |
| 8 | 總份數 ≤ 20 | `單張訂單最多 20 份，目前為 N 份` |

---

## 安全性重點

**價格一律從資料庫重新查。** `_collect_items()` 只從表單取 `meal_id[]` 與 `quantity[]`。
畫面上的價格是給人看的，不參與計算。否則使用者竄改隱藏欄位就能用 1 元訂便當。

**份數上限在伺服器端驗。** `<input max="...">` 只是給瀏覽器的提示，繞過它只需要一個
`curl`。第 7 條檢查是真正的防線。

**`_current_user()` 做 `_is_usable` 檢查。** 被停用的帳號只要 session 未清，若不檢查
就仍能送出訂單、佔用真實的餐點份數。這與母系統對 `profile` 的處置（KI-03，刻意保留
缺陷）不同——判準是「缺陷的影響會不會外溢到當事人以外的人」。

---

## 畫面

| 樣板 | 說明 |
|------|------|
| `index.html` | 左欄餐點清單（分頁 + 分類篩選）、右欄餐點詳細。管理員多出「新增／修改／下架」 |
| `meal_form.html` | 餐點新增與修改共用 |
| `order_form.html` | 訂餐與修改訂單共用，靠 `form_title`、`back_url`、`quantities` 區分 |
| `my_orders.html` | 本人訂單清單，pending 者顯示「修改」 |
| `order_detail.html` | 訂單資訊 + 訂購項目 + 總金額；本人可修改／取消 |
| `admin_orders.html` | 所有訂單，依狀態顯示不同的審核按鈕 |

`order_form.html` 的多品項以 `meal_id[]` / `quantity[]` 平行欄位傳遞（沿用器材借用
範本的慣例）。修改訂單時，表單列出「目前可訂的餐點」聯集「這張訂單已經點的餐點」
——只列前者的話，一道餐點在下單後被停售，使用者按下儲存就把它無聲刪掉了。

---

## 與其他子系統的關係

- **auth**：`_current_user()` 依賴 `session['user_id']`；未登入時 redirect `auth.login_page`
- **hub**：首頁的「今日菜單」「我的訂單」「訂單管理」三張卡片連向本子系統
- **admin**：停用或刪除帳號後，該帳號無法再下單（`_is_usable` 生效），但既有訂單保留
- **profile**：無直接關聯

Blueprint 之間不互相 import，只透過 `url_for()` 建立關聯。

---

## 測試對應

`tests/test_meal.py`，約 55 個案例，涵蓋：

- 菜單瀏覽：訪客可讀、分類篩選、無效分類回退、已下架餐點消失
- 餐點管理權限：未登入、一般使用者、停用中的管理員（驗證守門順序）
- 餐點表單驗證：11 條規則的參數化測試
- 訂餐：正常流程、金額計算、價格快照、pending 不扣庫存
- 訂餐驗證：空品項、過去日期、過遠日期、非法時段、空地點、售完、停售、已下架、超量、負數、竄改價格
- 訂單檢視與修改：本人、管理員、他人、狀態不符
- 取消：pending 不回補、confirmed 回補、已結案失敗
- 管理端審核：確認扣庫存、份數不足整張退回、拒絕不動庫存、取餐不回補
- 庫存不變量：確認後取消，庫存回到原點；回補以 `daily_quantity` 封頂
