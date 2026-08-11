# events Blueprint

## 職責

校園活動報名系統。提供活動瀏覽、新增／修改／刪除活動、報名、取消報名、修改報名資訊，
以及查詢個人報名紀錄。

`url_prefix='/events'`，`_PAGE_SIZE = 5`。

---

## 路由

| 方法         | 路徑                                   | 函式                | 說明                                         |
| ------------ | -------------------------------------- | ------------------- | -------------------------------------------- |
| `GET`        | `/events`                              | `index`             | 活動主頁；左側活動清單（分頁）+ 右側 `?event_id` 細節 |
| `GET / POST` | `/events/new`                          | `new_event`         | 新增活動（需登入且帳號有效）                 |
| `GET / POST` | `/events/edit/<event_id>`              | `edit_event`        | 修改活動（活動發起者或管理員）               |
| `POST`       | `/events/delete/<event_id>`            | `delete_event`      | 刪除活動（活動發起者或管理員）               |
| `GET / POST` | `/events/<event_id>/register`          | `register`          | 報名活動（需登入且帳號有效）                 |
| `POST`       | `/events/<event_id>/cancel`            | `cancel`            | 取消自己的報名                               |
| `GET / POST` | `/events/<event_id>/edit_registration` | `edit_registration` | 修改自己的報名資訊                           |
| `GET`        | `/events/my`                           | `my_registrations`  | 我的報名紀錄                                 |

`index` 以外的七條路由皆套用 `@login_required`。

---

## 權限

### `_current_user()` 已包含 `_is_usable` 檢查

停用或已刪除的帳號一律回傳 `None`。**只查 id 不驗狀態是不夠的**——那會讓被停用的
帳號只要 session 未清，仍能建立活動、報名並佔用名額，使 admin 的停用功能形同虛設。

因此**七條寫入路由必須各自處理 `user is None`**：

```python
user = _current_user()
if user is None:
    session.clear()
    return redirect(url_for('auth.login_page'))
```

新增第八條寫入路由時務必一併加上，否則會在取用 `user['id']` 時拋 `TypeError`。

`events.index` 是唯一**不加**這段防護的路由——它必須把 `None` 當成合法的訪客狀態繼續渲染。

> 不要把 `session.clear()` 塞進 `_current_user()`：訪客與失效帳號在它眼中都是 `None`，
> 但只有後者需要清 session。要區分兩者，helper 就得回傳多種狀態，複雜度會失控。

### 權限層級

| 動作 | 需要的條件 |
|------|-----------|
| 瀏覽活動列表與細節 | 無（訪客可看） |
| 檢視公開報名名單（報名者 + 報名時間） | 無 |
| 新增活動 | 已登入 + 帳號有效 |
| 報名／取消／修改自己的報名 | 已登入 + 帳號有效 |
| 修改／刪除活動 | 已登入 + 帳號有效 + **活動發起者或管理員** |
| 檢視完整報名名單（含聯絡資訊與已取消紀錄） | **活動發起者或管理員** |

- `_is_admin(user)`：`user['role'] == 0`
- `_is_organizer_or_admin(user, event)`：`user['id'] == event['user_id']` 或管理員

> **與 admin 的守門順序刻意相反。** events 先查活動是否存在、再查權限；admin 先查權限、
> 再查目標是否存在。理由是活動本來就公開可讀，隱藏 id 沒有意義；而且先確認活動存在，
> 才能決定「無權限」的 redirect 要回到哪一場活動。

---

## 業務邏輯

### 活動狀態（`_event_status`）

五種狀態互斥，**判斷順序即優先序，不可調換**：

| 順序 | 狀態        | 條件                             | 標籤       |
| :--: | ----------- | -------------------------------- | ---------- |
| 1 | `ended`     | 活動時間 < 現在                  | 活動已結束 |
| 2 | `closed`    | 報名截止時間 < 現在              | 報名已截止 |
| 3 | `not_open`  | 報名開始時間 > 現在              | 尚未開放   |
| 4 | `full`      | `registered_count >= capacity`   | 名額已滿   |
| 5 | `available` | 以上皆不符合                     | 可報名     |

順序的意義：活動已結束的事實蓋過報名期間，報名期間又蓋過名額。
一場已經結束、且名額未滿的活動應該顯示「活動已結束」而不是「可報名」。

**只有 `available` 允許報名。**

### 報名的二次判定

`POST /events/<id>/register` 在**寫入前重新查一次活動並重算狀態**。理由是使用者停留在
報名表單頁的期間，名額可能已被別人填滿、報名期間可能已經截止。只在 GET 時判斷一次是不夠的。

> 這仍不是完整的並行防護。兩個請求同時通過狀態檢查、同時寫入時，名額仍可能超收一人。
> 真正的修法是把「檢查名額」與「INSERT」放進同一個 transaction 並加上鎖。
> 本系統刻意不做，記錄為規格書的 KI-11。

### 報名唯一性

資料庫不加 UNIQUE 約束，由 application 層的 `create_or_restore_registration()` 控制：

| 既有紀錄 | 行為 | 回傳 |
|---------|------|------|
| 無 | INSERT | `'created'` |
| `cancelled` | UPDATE 恢復為 `registered`，清空 `cancelled_at` | `'restored'` |
| `registered` / `waiting` | 不處理 | `'duplicate'` |

取消後重新報名會**恢復同一列**，不會產生第二筆紀錄。

### 時間欄位的三種格式

| 場景 | 格式 | 轉換函式 |
|------|------|---------|
| 表單送出（`datetime-local`） | `YYYY-MM-DDTHH:MM` | — |
| 存入資料庫 | `YYYY-MM-DD HH:MM:SS` | `_normalize_dt()` |
| 表單預填 | `YYYY-MM-DDTHH:MM` | `_fmt_dt_for_input()` |

三者都不帶時區。`_event_status()` 以 `datetime.now()`（本機時間）比較，而
`created_at` 等預設值由 SQLite 的 `datetime('now')` 產生（UTC）。這個混用記錄為 KI-13。

### 活動表單驗證順序

1. 標題非空
2. 活動日期時間非空
3. 地點非空、且不超過 100 字元
4. 活動內容非空
5. 名額可轉為整數、且 > 0
6. （修改時）名額 ≥ 目前有效報名人數
7. 活動日期時間格式正確
8. 報名開始／截止時間格式正確
9. 報名截止 ≤ 活動開始
10. 報名開始 ≤ 報名截止

驗證失敗時**重新渲染表單並保留使用者輸入**（不 redirect），成功才 `flash` + `redirect`。

---

## Templates

| 檔案 | 說明 |
|------|------|
| `templates/events/index.html` | 活動主頁：左側清單 + 右側細節、報名操作、報名名單 |
| `templates/events/event_form.html` | 共用活動表單（`mode='new'` / `mode='edit'`） |
| `templates/events/registration_form.html` | 共用報名表單（`mode='register'` / `mode='edit'`） |
| `templates/events/my_registrations.html` | 個人報名紀錄列表 |

`index.html` 的報名名單有兩種檢視，由 Blueprint 決定傳哪一份資料：

- `all_registrations` 非空（發起者或管理員）→ 九欄完整表格，含聯絡資訊與已取消紀錄
- 否則用 `registrations` → 兩欄公開表格，只有報名者與報名時間

**權威在後端**：模板不做權限判斷，只依「拿到哪一份資料」決定畫面。

四個模板的表單**都不加** `class="login-form"`，否則會誤套登入頁的按鈕樣式。

---

## CSS

`static/events.css`，前綴 `events-`，按鍵顏色一律 `var(--btn-*)`。

狀態 badge（`events-badge-available` 等九個）的底色硬編碼於此，
因為 `common.css` 未定義狀態語意色（KI-19，與 `admin.css` 的情況相同）。

欄寬工具類 `.col-*` 與 `admin.css` 重複定義——它們只管欄寬、不管顏色，
是唯一允許跨子系統共用的類別族。

---

## 使用到的資料層函式

`db.list_events`、`db.get_event`、`db.get_event_for_edit`、`db.create_event`、
`db.update_event`、`db.soft_delete_event`、`db.list_registrations`、
`db.list_all_registrations`、`db.get_registration`、`db.count_registered`、
`db.create_or_restore_registration`、`db.cancel_registration`、
`db.update_registration`、`db.list_my_registrations`

全部集中在 `db/events.py`，**不另建 `db/registrations.py`**——依據見 `rules/database.md`。

---

## 測試

`tests/test_events.py`，80 個案例，涵蓋：

- 種子活動：五種狀態齊備、名額計算正確
- 瀏覽：匿名列表與細節、公開／完整報名名單的分界、已刪除活動不顯示、分頁
- 活動管理：新增（含 10 條驗證）、修改（發起者／管理員／他人）、刪除（軟刪除、級聯副表）
- 報名：成功、重複、五種狀態擋下、取消後重新報名恢復同一列
- 取消：軟取消、釋出名額、重複取消、他人無法取消
- 報名資訊修改：預填、更新、不改動狀態、他人被拒
- 我的報名：種子紀錄、已取消、活動撤銷後仍保留
- 停用帳號持有舊 session 時，六條寫入路由一律導回登入頁且資料庫無變化

被權限擋下的 POST **必須同時斷言資料庫沒有改變**。只驗 302 無法區分「被擋下」與「執行成功後 redirect」。

> **測試陷阱**：`other_client`（user_id=3）是停用帳號。要測「非本人、非管理員」的權限邊界，
> 必須先 `db.set_user_active(3, 1)`（測試中的 `_enable_other()` helper），
> 否則會被 `_current_user()` 的帳號有效性檢查先攔下，測不到權限那一層。
