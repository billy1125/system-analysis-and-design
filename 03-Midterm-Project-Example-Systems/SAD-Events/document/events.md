# 校園活動報名系統文件（events）

## 功能定位

`events` Blueprint 是本系統的主體，提供活動瀏覽、建立、修改、刪除、報名、取消報名、
修改報名資訊與個人報名紀錄查詢。它是專案中資料流最完整的子系統，涵蓋：

- 公開列表與分頁
- 三層權限判斷（登入、帳號有效、發起者或管理員）
- 主表 / 副表（`events` 與 `event_details`）
- 一對多關聯（一場活動多筆報名）
- 兩個狀態機（活動狀態、報名狀態）
- 容量限制與時間條件

檔案位置：

- `blueprints/events/__init__.py`
- `templates/events/index.html`
- `templates/events/event_form.html`
- `templates/events/registration_form.html`
- `templates/events/my_registrations.html`
- `static/events.css`
- `db/events.py`

## 路由

| 方法 | 路徑 | Handler | 說明 |
|------|------|---------|------|
| `GET` | `/events` | `index()` | 活動列表與活動詳情 |
| `GET / POST` | `/events/new` | `new_event()` | 新增活動 |
| `GET / POST` | `/events/edit/<event_id>` | `edit_event()` | 修改活動 |
| `POST` | `/events/delete/<event_id>` | `delete_event()` | 刪除活動 |
| `GET / POST` | `/events/<event_id>/register` | `register()` | 報名活動 |
| `POST` | `/events/<event_id>/cancel` | `cancel()` | 取消自己的報名 |
| `GET / POST` | `/events/<event_id>/edit_registration` | `edit_registration()` | 修改自己的報名資訊 |
| `GET` | `/events/my` | `my_registrations()` | 我的報名紀錄 |

`index` 與 `my_registrations` 宣告 `strict_slashes=False`，
`url_for()` 產生的 URL 帶尾斜線（`/events/`、`/events/my`）。

> 路徑形狀有兩種：`/events/edit/<id>`（動詞在前）與 `/events/<id>/register`（id 在前）。
> 這個不一致是沿用範本的（規格書 KI-25）。可以理解成「動詞在前 = 操作活動本身」、
> 「id 在前 = 操作活動底下的東西」，但範本並未如此宣告。

## 權限規則

| 動作 | 需要的條件 |
|------|-----------|
| 瀏覽活動列表與內容 | 不需登入 |
| 檢視公開報名名單（報名者 + 報名時間） | 不需登入 |
| 新增活動 | 需登入且帳號可用 |
| 報名 / 取消 / 修改報名 | 需登入且帳號可用；僅限自己的報名紀錄 |
| 修改 / 刪除活動 | 活動發起者或管理員 |
| 檢視完整報名名單（含聯絡資訊與已取消紀錄） | 活動發起者或管理員 |

判斷方式：

- 管理員：`user['role'] == 0`
- 活動發起者或管理員：`user['id'] == event['user_id']` 或管理員

### `_current_user()` 已包含帳號有效性檢查

```python
def _current_user():
    if 'user_id' not in session:
        return None
    user = db.find_user_by_id(session['user_id'])
    return user if _is_usable(user) else None
```

**這是相對於教學範本 `Course-SAD-Sample-System` 的修正。**
範本的版本只查 id 不驗狀態，導致被停用或刪除的帳號只要 session 未清，
仍能建立公開活動、報名並佔用別人的名額，讓會員管理的停用功能形同虛設。

修正的判準見規格書 §11.0：缺陷的影響是否會外溢到當事人以外的人。

**連帶影響：七條寫入路由必須各自處理 `user is None`：**

```python
user = _current_user()
if user is None:
    session.clear()
    return redirect(url_for('auth.login_page'))
```

新增第八條寫入路由時務必一併加上，否則會在取用 `user['id']` 時拋 `TypeError`。

`index` 是唯一**不加**這段防護的路由——它必須把 `None` 當成合法的訪客狀態繼續渲染。

> 不要把 `session.clear()` 塞進 `_current_user()`：訪客與失效帳號在它眼中都是 `None`，
> 但只有後者需要清 session。要區分兩者，helper 就得回傳多種狀態，複雜度會失控。

### 驗證順序與 admin 相反

events 先查活動是否存在、再查權限；admin 先查權限、再查目標是否存在。

理由是活動本來就公開可讀，隱藏 id 沒有意義；而且要先知道活動存在，
才能決定「無權限」的 redirect 要回到哪一場活動。

## 活動狀態

系統依時間與名額計算活動狀態，**不存在資料庫中**，每次請求重算：

| 順序 | 狀態 | 條件 | badge 標籤 | flash 訊息 |
|:--:|------|------|-----------|-----------|
| 1 | `ended` | 活動時間 < 現在 | 活動已結束 | 活動已結束 |
| 2 | `closed` | 報名截止時間 < 現在 | 報名已截止 | 報名已截止 |
| 3 | `not_open` | 報名開始時間 > 現在 | 尚未開放 | 尚未開放報名 |
| 4 | `full` | `registered_count >= capacity` | 名額已滿 | 活動名額已滿 |
| 5 | `available` | 以上皆不符合 | 可報名 | — |

**五種狀態互斥，判斷順序即優先序，不可調換。**
順序的意義：活動已結束的事實蓋過報名期間，報名期間又蓋過名額。
一場已結束、名額未滿的活動應該顯示「活動已結束」而不是「可報名」。

`_event_status()` 的輸入：`event_datetime`、`registration_start_at`、
`registration_end_at`、`registered_count`、`capacity`。

**只有 `available` 允許報名。**

> badge 標籤與 flash 訊息是兩份不同的中文字串（「名額已滿」vs「活動名額已滿」）。
> badge 要短、flash 要完整，這是刻意的區分，但也代表修改時容易漏掉一邊（KI-32）。

## 核心資料流

### 1. 瀏覽列表與詳情

```text
GET /events?page=n&event_id=x
-> db.list_events(page=page, page_size=5)
-> 對每筆活動計算狀態
-> 若 event_id 存在且未刪除：
     db.get_event(event_id)
     db.list_registrations(event_id)
     若目前使用者是發起者或管理員，再查 db.list_all_registrations(event_id)
     若已登入，再查 db.get_registration(event_id, user_id)
-> render events/index.html
```

分頁大小固定 5 筆，依 `event_datetime` **升冪**排列。

一般訪客看到的是公開資訊；活動發起者或管理員會看到完整報名名單。
**模板不做權限判斷**，只依「拿到 `all_registrations` 還是 `registrations`」決定畫面。

### 2. 新增活動

```text
POST /events/new
-> 檢查登入與帳號可用
-> 驗證表單十二條規則（見下）
-> db.create_event(...)  ── transaction，同時建立 events 與 event_details
-> flash('活動已建立')
-> redirect /events?event_id=<new_id>
```

必填欄位：`event_title`、`event_datetime`、`event_place`、`capacity`、`event_note`。
選填：`registration_start_at`、`registration_end_at`、`event_target`、
`event_contact`、`event_notice`。

**驗證失敗時重新渲染表單並保留使用者輸入，不 redirect**——
十個欄位重填的成本太高。

### 3. 修改活動

```text
POST /events/edit/<event_id>
-> 檢查登入與帳號可用
-> 檢查活動存在且未刪除
-> 檢查是發起者或管理員
-> db.count_registered() 取得目前有效報名人數
-> 驗證表單，其中名額不得小於目前有效報名人數
-> db.update_event(...)  ── transaction，同時更新兩張表
-> flash('活動已更新')
-> redirect /events?event_id=<event_id>
```

GET 時以現有資料預填表單。時間欄位要經 `_fmt_dt_for_input()` 轉回
`datetime-local` 所需的 `YYYY-MM-DDTHH:MM` 格式。

**「名額 ≥ 目前有效報名人數」是唯一需要查詢其他資料表才能完成的驗證。**
邊界值是允許的：名額調到剛好等於報名人數會通過，活動隨即變成 `full`。

### 4. 刪除活動

```text
POST /events/delete/<event_id>
-> 檢查登入與帳號可用
-> 檢查活動存在且未刪除
-> 檢查是發起者或管理員
-> db.soft_delete_event(event_id)  ── transaction
-> events 與 event_details 標記 is_deleted = 1
-> flash('活動已刪除')
-> redirect /events
```

**報名紀錄不一併標記。** 這是刻意的（規格書 KI-12）——
報名紀錄是報名者自己的資料，活動被撤銷不代表報名紀錄應該消失。
`list_my_registrations()` 因此仍查得到，模板以「活動已撤銷」標記。

## 報名資料流

### 1. 報名活動

```text
POST /events/<event_id>/register
-> 檢查登入與帳號可用
-> 檢查活動存在且未刪除
-> 檢查是否已有有效報名        → 有 → flash('您已報名此活動')
-> 計算活動狀態                → ≠ available → flash 對應訊息
-> 【重新查活動、重算狀態】     → ≠ available → flash 對應訊息
-> 驗證 meal_type
-> db.create_or_restore_registration(...)
-> flash('報名成功')
-> redirect /events?event_id=<event_id>
```

用餐選項：`0` 不用餐、`1` 葷食、`2` 素食。報名者的姓名、電話、Email、備註皆為選填。

**第二次狀態判定是必要的**：使用者停留在報名表單頁的期間，
名額可能已被別人填滿、報名期間可能已經截止。

> 這仍不是完整的並行防護（規格書 KI-11）。兩個請求同時通過狀態檢查、
> 同時寫入時，名額仍可能超收一人。真正的修法是把「檢查名額」與「INSERT」
> 放進同一個 transaction 並加上鎖。

**「已報名」的檢查排在「狀態」之前**：已經報名的人看到「您已報名此活動」
比看到「名額已滿」更合理。

### 2. 取消後重新報名

`create_or_restore_registration()` 的三種行為：

| 既有紀錄 | 行為 | 回傳 |
|---------|------|------|
| 無 | INSERT | `'created'` |
| `cancelled` | UPDATE 恢復為 `registered`，清空 `cancelled_at` | `'restored'` |
| `registered` / `waiting` | 不處理 | `'duplicate'` |

**恢復的是同一列，不是新增第二筆。** 這是為什麼 `registrations` 表
刻意不加 `UNIQUE(event_id, user_id)` 約束——加了之後重新報名只能刪掉舊列再新增，
取消的歷史就不見了。唯一性改由 application 層維持。

### 3. 取消報名

```text
POST /events/<event_id>/cancel
-> 檢查登入與帳號可用
-> 檢查活動存在且未刪除
-> 檢查自己是否有 registered / waiting 狀態的報名
-> db.cancel_registration(event_id, user_id)
-> registration_status 改為 cancelled，填入 cancelled_at
-> flash('已取消報名')
```

取消後名額**立即釋出**——`count_registered()` 只算 `registered` 狀態的紀錄。

### 4. 修改報名資訊

```text
POST /events/<event_id>/edit_registration
-> 檢查登入與帳號可用
-> 檢查活動存在且未刪除
-> 檢查自己是否有有效報名
-> 驗證 meal_type
-> db.update_registration(...)   ── 不改動 registration_status
-> flash('報名資訊已更新')
```

### 5. 我的報名紀錄

```text
GET /events/my
-> login_required + 帳號可用檢查
-> db.list_my_registrations(user_id)   ── 依活動時間降冪，不過濾 events.is_deleted
-> render my_registrations.html
```

### 為什麼三條報名路由不需要「是不是自己的」這一步

它們的查詢條件本身就是 `WHERE event_id = ? AND user_id = ?`，
而 `user_id` 來自 `session`。別人的報名根本不會被查到，
「沒有有效的報名紀錄」那一步就攔下了。

這也是為什麼本系統目前**沒有 IDOR（不安全的直接物件參照）漏洞**——
沒有任何路由接受「報名紀錄 id」作為參數。若未來加入「管理者強制取消」功能
（規格書 §13.2），就必須額外驗證該報名確實屬於該活動。

## 資料表

### `events`

| 欄位 | 說明 |
|------|------|
| `id` | 活動 ID |
| `event_title` | 活動標題（前端 `maxlength="200"`，後端未驗長度，KI-27） |
| `event_datetime` | 活動時間 |
| `event_place` | 活動地點（後端驗證 ≤ 100 字元） |
| `capacity` | 名額上限（必須 > 0） |
| `registration_start_at` | 報名開始時間（`NULL` = 建立後即可） |
| `registration_end_at` | 報名截止時間（`NULL` = 活動開始前皆可） |
| `created_at` / `updated_at` | 建立與更新時間 |
| `user_id` | **活動發起者**，決定誰能修改與刪除 |
| `is_deleted` | 邏輯刪除旗標 |

### `event_details`

| 欄位 | 說明 |
|------|------|
| `id` | 明細 ID |
| `event_id` | 對應 `events.id`（一對一） |
| `event_note` | 活動內容（必填） |
| `event_target` | 活動對象 |
| `event_contact` | 聯絡資訊 |
| `event_notice` | 注意事項 |
| `created_at` / `updated_at` | 建立與更新時間 |
| `is_deleted` | 邏輯刪除旗標 |

**拆成兩張表的理由是冷熱欄位分離**：`events` 存列表與狀態判斷需要的欄位，
`event_details` 存只有進到詳情頁才需要的四段長文字。
`list_events()` 因此完全不碰副表。

四段長文字皆無長度上限（KI-28）。Jinja2 的自動跳脫已擋住 XSS，但沒有擋住資源耗用。

### `registrations`

| 欄位 | 說明 |
|------|------|
| `id` | 報名紀錄 ID |
| `event_id` | 活動 ID |
| `user_id` | 報名者 |
| `registration_status` | `registered`、`cancelled`、`waiting`、`rejected` |
| `meal_type` | `0` 不用餐、`1` 葷食、`2` 素食 |
| `participant_name` | 真實姓名（與 `users.name` 分開存） |
| `participant_phone` | 聯絡電話（無格式驗證，KI-26） |
| `participant_email` | 聯絡 Email（同上） |
| `registration_note` | 備註 |
| `created_at` / `updated_at` | 建立與更新時間 |
| `cancelled_at` | 取消時間（恢復報名時清為 `NULL`） |
| `is_deleted` | 邏輯刪除旗標（**目前沒有任何路由會設為 1**，KI-22） |

`waiting`（候補）與 `rejected`（管理者取消）存在於 DDL 與模板標籤中，
但**沒有任何路由會產生它們**——是不可達狀態（KI-14）。
`cancel_registration()` 的 WHERE 條件寫了 `IN ('registered', 'waiting')`，
那個 `'waiting'` 是為未來的候補機制預留的。

## 種子活動

`db.init_db()` 會植入五筆活動與七筆報名紀錄，**必須排在種子帳號之後**。
五筆刻意各自對應一種活動狀態，讓活動列表一開啟就能同時看到五種 badge：

| id | 標題 | 發起者 | 狀態 | 示範什麼 |
|:--:|------|--------|------|---------|
| 1 | 新生入學說明會 | 管理員 | `ended` | 活動已結束；名額還有空位也不能報名 |
| 2 | 春季校園路跑 | 管理員 | `closed` | 活動未到但報名已截止——兩個時間點是獨立的 |
| 3 | 系學會迎新茶會 | 一般使用者 | `full` | 名額 2 人已滿；名額只算 `registered` 的紀錄 |
| 4 | 生成式 AI 實作工作坊 | 管理員 | `not_open` | 唯一會隨時間自動變成可報名的狀態 |
| 5 | 期末專題成果發表會 | 一般使用者 | `available` | 未設報名期間；另含一筆已取消的報名紀錄 |

時間欄位一律以 `datetime('now', '±N days')` 換算，**不寫死絕對日期**——
寫死的話過幾個月後五筆會全部變成「活動已結束」，狀態差異就消失了。

## 畫面結構

### `templates/events/index.html`

活動首頁採雙欄式：

- 左側：活動清單、狀態 badge、分頁、管理按鈕
- 右側：活動細節、報名操作、報名名單

依身份不同顯示不同內容：

| 身份 | 看得到 |
|------|--------|
| 訪客 | 五欄表格（無「操作」欄）、無「+ 新增活動」、報名區顯示「請先登入以報名活動」 |
| 一般登入者 | 六欄表格、可新增活動、可報名／取消／修改自己的報名 |
| 發起者 / 管理員 | 額外看到該活動的「修改」「刪除」按鈕，以及九欄完整報名名單 |

**前端隱藏只是提示，後端的權限檢查才是權威。**

### `templates/events/event_form.html`

共用於新增活動與修改活動，以 `mode='new'` / `mode='edit'` 切換標題與按鈕文字。
修改模式且已有報名時，額外顯示一則提示：目前有效報名人數，以及「調降名額不可低於此數」。

### `templates/events/registration_form.html`

共用於新增報名與修改報名資訊，以 `mode='register'` / `mode='edit'` 切換。
頂部有一張活動摘要卡（標題、時間、地點、名額），讓使用者確認自己報的是哪一場。

### `templates/events/my_registrations.html`

顯示目前登入使用者的全部報名紀錄。活動已撤銷時，活動名稱不再是連結，
並加上「活動已撤銷」標記；操作欄顯示 `—`。

### 元素語意

刪除活動與取消報名一律使用 `<button type="submit">` 搭配
`onclick="return confirm(...)"`，**不使用 `<a href="#" onclick>`**。

> 這是相對於教學範本的修正（規格書 §11.5 第 2 項）。
> 範本用 `<a href="#" onclick="...this.closest('form').submit()">` 送出 POST，
> 語意錯誤且鍵盤操作與螢幕閱讀器行為不正確。

## CSS

`static/events.css`，前綴 `events-`，按鍵顏色一律 `var(--btn-*)`。

九個狀態 badge（五個活動狀態 + 四個報名狀態）的底色硬編碼於此，
因為 `common.css` 未定義狀態語意色（KI-19）。

欄寬工具類 `.col-*` 與 `admin.css` 重複定義——它們只管欄寬、不管顏色，
是唯一允許跨子系統共用的類別族。

events 的表單**不加** `class="login-form"`，否則會誤套登入頁的按鈕樣式。

## 測試對應

`tests/test_events.py`，80 個案例，涵蓋：

- 種子資料：五種狀態齊備、名額計算正確
- 匿名瀏覽、活動分頁、已刪除活動不顯示
- 公開名單與完整名單的分界（訪客 / 他人 / 發起者 / 管理員）
- 新增活動：成功、雙表寫入、九條表單驗證
- 修改活動：發起者 / 管理員 / 他人、預填、名額下限與邊界值
- 刪除活動：軟刪除、級聯副表、他人被拒且資料庫無變化
- 報名：成功、欄位儲存、五種狀態各自擋下、重複報名
- 取消後重新報名恢復同一列
- 取消報名：軟取消、釋出名額、重複取消
- 修改報名資訊：不改動狀態、他人被拒
- 我的報名：種子紀錄、已取消、活動撤銷後保留
- 停用帳號持有舊 session 時，寫入路由一律導回登入頁且資料庫無變化

> **測試陷阱**：`other_client`（user_id=3）是停用帳號。要測「非本人、非發起者、
> 非管理員」的權限邊界，必須先 `db.set_user_active(3, 1)`（測試中的 `_enable_other()`），
> 否則會被 `_current_user()` 的帳號有效性檢查先攔下，測不到權限那一層。
