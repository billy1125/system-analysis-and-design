# 論壇系統文件（forum）

## 功能定位

`forum` Blueprint 提供一個簡化的討論區。它把資料分成兩層：

- `forum`：文章主題
- `forum_details`：原始內文與回覆

這樣可以把「文章標題」與「內容串」拆開管理，也方便系統分析時區分主資料與明細資料。

檔案位置：

- `blueprints/forum/__init__.py`
- `templates/forum/index.html`
- `templates/forum/post_form.html`
- `static/forum.css`
- `db/forum.py`

## 路由

| 方法 | 路徑 | 說明 |
|------|------|------|
| `GET` | `/forum` | 論壇首頁，左側文章列表，右側文章內容 |
| `GET / POST` | `/forum/new` | 新增文章 |
| `GET / POST` | `/forum/reply/<master_id>` | 回覆文章 |
| `GET / POST` | `/forum/edit/master/<master_id>` | 修改文章標題 |
| `GET / POST` | `/forum/edit/detail/<detail_id>` | 修改文章內文或回覆 |
| `POST` | `/forum/delete/master/<master_id>` | 刪除文章，僅管理員 |
| `POST` | `/forum/delete/detail/<detail_id>` | 刪除回覆，僅管理員 |

## 權限規則

### 帳號有效性（相對範本的修正）

`_current_user()` **包含 `_is_usable` 檢查**：停用或已刪除的帳號一律回傳 `None`。因此被管理員
停用的會員無法發文、回覆或修改，即使瀏覽器中的 session 尚未過期。

六條寫入路由在 `user is None` 時 `session.clear()` 並導向登入頁。`GET /forum` 是唯一例外——
它把 `None` 當成合法的訪客狀態，繼續以訪客視圖渲染（隱藏「發表文章」等按鈕）。

> 範本的版本只查 id 不驗狀態，這個缺口讓停用帳號仍能產生公開內容，等於讓管理員的停用功能失效。
> 本系統修正了它，並以 `tests/test_forum.py` 的三個專屬案例守住。

### 角色與作者

- 瀏覽論壇：不需登入
- 新增文章：需登入
- 回覆文章：需登入
- 修改文章標題：作者本人或管理員
- 修改內文或回覆：作者本人或管理員
- 刪除文章與回覆：僅管理員

管理員判斷方式是 `user['role'] == 0`。

## 資料流

### 1. 瀏覽論壇

```text
GET /forum?page=n&master_id=x
-> db.list_forum(page=page, page_size=10)
-> 若 master_id 存在，db.get_forum_master(master_id)
-> db.list_forum_details(master_id)
-> render forum/index.html
```

文章列表每頁 10 筆，依 `updated_at DESC` 排序。

若指定的文章已刪除，右側不會顯示內容。

### 2. 新增文章

```text
POST /forum/new
-> 驗證 title / content 非空
-> db.create_forum_master(title, content, user_id)
-> 同時建立 forum 與第一筆 forum_details
-> redirect /forum?master_id=<new_id>
```

`create_forum_master()` 會在 transaction 內一次完成：

- 新增 `forum`
- 新增第一筆 `forum_details`
- 第一筆明細 `is_original_post = 1`

### 3. 回覆文章

```text
POST /forum/reply/<master_id>
-> 檢查文章是否存在且未刪除
-> 驗證 content 非空
-> db.create_forum_detail(master_id, content, user_id)
-> 同步更新 forum.updated_at
-> redirect /forum?master_id=<master_id>
```

### 4. 修改文章標題

```text
POST /forum/edit/master/<master_id>
-> 檢查文章存在
-> 檢查作者或管理員權限
-> 驗證 title 非空
-> db.update_forum_master_title(...)
-> redirect /forum?master_id=<master_id>
```

### 5. 修改內文或回覆

```text
POST /forum/edit/detail/<detail_id>
-> 檢查 detail 存在
-> 檢查作者或管理員權限
-> 驗證 content 非空
-> db.update_forum_detail_content(...)
-> redirect /forum?master_id=<master_id>
```

### 6. 刪除

文章刪除：

```text
POST /forum/delete/master/<master_id>
-> 僅管理員
-> db.soft_delete_forum_master(master_id)
-> forum 與其所有 forum_details 一起標記 is_deleted=1
```

回覆刪除：

```text
POST /forum/delete/detail/<detail_id>
-> 僅管理員
-> db.soft_delete_forum_detail(detail_id)
```

## 資料表

### `forum`

| 欄位 | 說明 |
|------|------|
| `id` | 主題 ID |
| `title` | 文章標題 |
| `created_at` | 建立時間 |
| `updated_at` | 最後更新時間 |
| `user_id` | 發文者 |
| `is_deleted` | 邏輯刪除旗標 |

### `forum_details`

| 欄位 | 說明 |
|------|------|
| `id` | 明細 ID |
| `master_id` | 對應 `forum.id` |
| `content` | 內容 |
| `created_at` | 建立時間 |
| `updated_at` | 最後更新時間 |
| `user_id` | 作者 |
| `is_original_post` | 是否為原始主文 |
| `is_deleted` | 邏輯刪除旗標 |

## 畫面結構

### `templates/forum/index.html`

論壇首頁採雙欄式：

- 左側：文章清單、分頁
- 右側：選定文章內容與回覆

### `templates/forum/post_form.html`

此表單共用於：

- 新增文章
- 回覆文章
- 修改文章標題
- 修改內文

透過 `show_title`、`show_content`、`form_title` 控制表單顯示內容。

## 種子資料

資料庫第一次建立時，`db/forum.py` 的 `_seed_forum_if_empty()` 會植入五篇文章（共 8 則內文與回覆）。機制與種子帳號完全對稱：`forum` 表為空時才執行，因此 `rm database.db` 之後重新啟動就會回到這個初始狀態。

五篇的設計用意見系統規格書 §6.4.1。其中特別值得注意的是第三篇——它是用停用帳號 `disabled@example.com` 發表的，同時示範了兩件事：帳號被停用不會影響既有內容，以及 `COALESCE(u.name, u.email)` 在作者沒有填姓名時退回顯示 email。

## 測試對應

`tests/test_forum.py` 主要覆蓋：

- 匿名瀏覽
- 分頁
- 新增文章
- 回覆文章
- 作者與管理員修改權限
- 僅管理員刪除
- 軟刪除後資料不再顯示
