# repair 子系統

報修申報、查詢、狀態流轉與管理。**本系統的主體。**

`url_prefix='/repair'`，共 13 條路由。**沒有任何開放給訪客的路由**——報修單載有房號與聯絡電話。

---

## 路由

### 住宿生視角

| 方法 | 路徑 | 守門 | 說明 |
|------|------|------|------|
| `GET` | `/repair/` | 1+2 | 我的報修單；`?status=` `?page=` |
| `GET POST` | `/repair/new` | 1+2 | 申報；表單以個人資料預填地點 |
| `GET` | `/repair/<id>` | 1+2+4 | 詳細與處理歷程 |
| `GET POST` | `/repair/<id>/edit` | 1+2+**本人** | 修改；限 `pending` |
| `POST` | `/repair/<id>/comment` | 1+2+4 | 回覆；已結案不可 |
| `POST` | `/repair/<id>/cancel` | 1+2+**本人** | 取消；限 `pending`/`assigned` |

### 管理員視角

| 方法 | 路徑 | 說明 |
|------|------|------|
| `GET` | `/repair/manage` | 全部報修單；`?status=` `?q=` `?page=` |
| `POST` | `/repair/<id>/assign` | 派工（需 `assignee_id`） |
| `POST` | `/repair/<id>/start` | 開始處理 |
| `POST` | `/repair/<id>/complete` | 登記完成 |
| `POST` | `/repair/<id>/reject` | 退件（**需原因**） |
| `POST` | `/repair/<id>/reopen` | 重新開啟（**需原因**） |
| `POST` | `/repair/<id>/delete` | 軟刪除（連同所有紀錄） |

七條管理路由全部套用 1+2+3 三層檢查，**明碼重複寫出**。

---

## 四個 helper

```python
_current_user()          # db.find_user_by_id(session['user_id'])
_is_admin(user)          # user['role'] == 0
_can_view(user, req)     # req['requester_id'] == user['id'] or _is_admin(user)
_validate_request_form(form)   # 回傳第一個錯誤訊息或 None
```

### `_can_view()` 是本子系統的核心

**它與前三層檢查的性質不同。** 前三層問「你是誰」，只看 session；第 4 層問「這筆資料是不是你的」，**必須把資料先讀出來才能判斷**。因此它的位置固定在 `db.get_request()` **之後**。

這是內容公開的系統不會有的東西——那種系統的權限只分「能不能寫」。

### 比 `_can_view()` 更嚴的兩處

`edit` 與 `cancel` **只限申報人本人，管理員也不行**：

- **修改**：申報內容是住戶對故障的原始證言。管理員若能改，歷程就失真了——事後無從分辨「當初申報的就是這樣」與「有人後來改成這樣」。管理員要補充資訊，用的是回覆
- **取消**：取消是申報人的權利（「我自己修好了」）。管理員認為不該受理時，該用的是**退件**，而退件強制填寫原因。兩者的差別不只是誰按按鈕，而是誰對這個決定負責

---

## 兩個清單刻意分成兩條路由

`/repair/` 顯示自己申報的單（**管理員也一樣**），`/repair/manage` 顯示全部。

不在同一頁用一個開關切換，因為兩者的欄位、操作與心智模型都不同，混在一起會讓管理員分不清自己現在是住戶還是管理者。

---

## 狀態轉移路由的結構

主體極短——狀態合法性完全交給 db 層：

```python
    note = request.form.get('note', '').strip() or None
    if db.start_request(request_id, user['id'], note):
        flash('已開始處理', 'success')
    else:
        flash('無法開始處理（報修單狀態不符）', 'error')
    return redirect(url_for('repair.detail', request_id=request_id))
```

失敗訊息一律是「無法…（報修單狀態不符）」，因為 Blueprint 拿到的只是一個 `False`，無從得知是狀態不對、單不存在、還是承辦人無效。這是分層帶來的資訊損失，可以接受。

**必填參數在 Blueprint 先擋一次**（db 層也會擋），因為要給出更精確的訊息（`請填寫退件原因`）。

**一條轉移一條路由，不合併成 `/transition`。** 理由見 `document/system-spec.md` §8.2。

---

## 常數

| 常數 | 內容 |
|------|------|
| `CATEGORY_LABELS` | 7 種：給排水、電力照明、家具修繕、網路、空調、門窗鎖具、其他 |
| `PRIORITY_LABELS` | 4 級：低、一般、高、緊急 |
| `STATUS_LABELS` | 6 個：待受理、已派工、處理中、已完成、已退件、已取消 |
| `LOG_TYPE_LABELS` | 3 種：申報內容、回覆、狀態異動 |
| `_PAGE_SIZE` | 10 |

四個標籤字典**由 Blueprint 傳入模板**，不在模板中硬編碼中文。這讓「新增一個狀態」只要改一處。

合法值的白名單（`db.CATEGORIES`、`db.PRIORITIES`、`db.REQUEST_STATUSES`、`db.CLOSED_STATUSES`）定義在 `db/repair.py`，因為它們是資料的約束而非呈現。

---

## 樣板

| 樣板 | 說明 |
|------|------|
| `repair/index.html` | 我的報修單：狀態篩選列 + 表格 + 分頁 |
| `repair/manage.html` | 管理清單：六個狀態的計數方塊 + 篩選 + 搜尋 + 表格（多申報人與操作兩欄） |
| `repair/request_form.html` | 新增／修改共用，以 `mode` 區分 |
| `repair/detail.html` | 左右兩欄：左為基本資料與時間軸，右為依身分與狀態渲染的操作區 |

### `detail.html` 的三個設計

**時間軸的三種 `log_type` 以不同顏色的圓點與標籤區分**：申報內容（藍）、狀態異動（紫）、回覆（灰）。讀者要能一眼分辨「這句話是人寫的」還是「這是系統記錄的事實」。

**右欄依狀態渲染不同的表單**（用 `{% elif %}` 而非平行的多個 `{% if %}`）：

| 狀態 | 顯示 |
|------|------|
| `pending` | 派工（下拉 + 備註）、退件（原因必填） |
| `assigned` | 開始處理 |
| `in_progress` | 登記完成 |
| `completed` | 重新開啟（原因必填） |
| 其他 | 無（只剩刪除） |

**已結案時，左欄的回覆表單替換成一句說明。** 畫面本身就把狀態機的規則表達出來，使用者不需要按下去才知道不行。

承辦人下拉的選項來自 `db.list_active_admins()`，只在 `_is_admin(user)` 時才查詢。

---

## CSS

`static/repair.css`，前綴 `repair-`。

第一行的 `body { display: block; ... }` **必須保留**——它覆蓋 `login.css` 的 flex 置中。

狀態與優先等級的 badge 底色硬編碼於此（`common.css` 只定義按鍵色，KI-19）。
