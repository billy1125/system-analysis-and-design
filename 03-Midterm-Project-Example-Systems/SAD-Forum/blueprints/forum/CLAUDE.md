# forum Blueprint

## 職責

提供討論區功能，包含瀏覽文章列表與內文、發表文章、回覆、修改標題/內容、刪除（管理員）。

---

## 路由

| 方法         | 路徑                              | 函式            | 說明                                               |
| ------------ | --------------------------------- | --------------- | -------------------------------------------------- |
| `GET`        | `/forum`                          | `index`         | 論壇主頁；左側文章列表（分頁）+ 右側依 `?master_id` 顯示內文 |
| `GET / POST` | `/forum/new`                      | `new_post`      | 新增文章（需登入）                                 |
| `GET / POST` | `/forum/reply/<master_id>`        | `reply`         | 回覆文章（需登入）                                 |
| `GET / POST` | `/forum/edit/master/<master_id>`  | `edit_master`   | 修改文章標題（原發文者或管理員）                   |
| `GET / POST` | `/forum/edit/detail/<detail_id>`  | `edit_detail`   | 修改內文或回覆（原作者或管理員）                   |
| `POST`       | `/forum/delete/master/<master_id>`| `delete_master` | 刪除文章（僅管理員）                               |
| `POST`       | `/forum/delete/detail/<detail_id>`| `delete_detail` | 刪除回覆（僅管理員）                               |

新增、修改、刪除路由皆套用 `@login_required`。

---

## 業務邏輯

### 分頁

- `_PAGE_SIZE = 10`
- `?page=N` 控制文章列表分頁（`list_forum_masters`）

### 權限

守門分三層，依路由分級：

| 路由 | 需要的層級 |
|------|-----------|
| `GET /forum` | 無（訪客可瀏覽） |
| `/forum/new`、`/reply/*`、`/edit/*` | 已登入 + 帳號有效 |
| `/forum/delete/*` | 已登入 + 帳號有效 + 管理員 |

**`_current_user()` 已包含 `_is_usable` 檢查**，停用或已刪除的帳號一律回傳 `None`。只查 id 不驗狀態的話，被停用的帳號仍能發表公開內容。

因此**六條寫入路由必須各自處理 `user is None`**（`session.clear()` + redirect 登入頁）。新增第七條寫入路由時務必一併加上，否則會在取用 `user['id']` 時拋 `TypeError`。

`forum.index` 是唯一**不加**這段防護的路由——它必須把 `None` 當成合法的訪客狀態繼續渲染。

不要把 `session.clear()` 塞進 `_current_user()`：訪客與失效帳號在它眼中都是 `None`，但只有後者需要清 session。

- `_is_admin(user)`：`user['role'] == 0`
- 修改文章標題：原發文者（`user['id'] == master['user_id']`）或管理員
- 修改內文/回覆：原作者（`user['id'] == detail['user_id']`）或管理員
- 刪除文章/回覆：僅管理員

### 資料模型

- `forum`：文章主表（title、user_id、created_at、updated_at、is_deleted）
- `forum_details`：內文與回覆（master_id、content、user_id、is_original_post、is_deleted）
- 刪除採用邏輯刪除（`soft_delete_*`），不實際移除資料列

---

## Templates

- `templates/forum/index.html` — 論壇主頁：左側文章列表 + 右側內文
- `templates/forum/post_form.html` — 共用表單，透過參數控制顯示標題欄 / 內容欄：
  - `show_title=True / False`
  - `show_content=True / False`
  - `form_title` — 表單頁標題字串

---

## CSS

- `static/forum.css` — 論壇頁面專用樣式

---

## 測試

`tests/test_forum.py`，涵蓋：
- 未登入 redirect（新增、修改、刪除）
- 瀏覽文章列表與內文
- 新增文章 / 回覆（正常、空白驗證）
- 修改標題 / 內文（原作者、他人、管理員）
- 刪除文章 / 回覆（管理員、非管理員）
