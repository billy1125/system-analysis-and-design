# 會員管理系統文件（admin）

## 功能定位

`admin` Blueprint 提供管理員治理所有會員帳號的介面。它是本系統唯一一個「一個使用者操作另一個使用者的資料」的子系統，因此權限檢查比其他子系統多一層。

管理員可以做四件事：檢視所有會員（包含已被軟刪除的）、切換帳號的啟用狀態、調整角色、軟刪除帳號。不能做的是：修改別人的姓名與密碼，以及對自己執行上述任何一種破壞性操作。

檔案位置：

- `blueprints/admin/__init__.py`
- `templates/admin/user_list.html`
- `templates/admin/user_detail.html`
- `static/admin.css`
- `db/users.py`

## 路由

| 方法 | 路徑 | Handler | 說明 |
|------|------|---------|------|
| `GET` | `/admin/users` | `user_list()` | 會員清單 |
| `GET` | `/admin/users/<user_id>` | `user_detail()` | 會員明細 |
| `POST` | `/admin/users/<user_id>/activate` | `activate_user()` | 啟用帳號 |
| `POST` | `/admin/users/<user_id>/deactivate` | `deactivate_user()` | 停用帳號 |
| `POST` | `/admin/users/<user_id>/role` | `update_role()` | 調整角色 |
| `POST` | `/admin/users/<user_id>/delete` | `delete_user()` | 軟刪除帳號 |

全部套用 `@login_required`，並在函式內再做兩層檢查。Blueprint 宣告 `url_prefix='/admin'`。

清單頁接受三個 query parameter，可自由組合：

- `?status=all|active|disabled|deleted`（預設 `all`，非法值視同 `all`）
- `?q=<關鍵字>`（比對 email、姓名、顯示名稱）
- `?page=N`（預設 1，`_PAGE_SIZE = 10`）

## 權限檢查

三層，順序固定：

```text
1. @login_required        無 session          -> redirect /login
2. _is_usable(user)       帳號停用或已刪除     -> session.clear() + redirect /login
3. _is_admin(user)        role != 0           -> flash 無操作權限 + redirect /
```

第 2 層失敗代表身分本身失效，處置是登出；第 3 層失敗代表身分有效但權限不足，處置是導回首頁。順序若調換，一個被停用的管理員會收到「無操作權限」這種與事實不符的回饋，而且 session 不會被清除。

這三層在每一條路由的開頭明碼重複寫出，**不抽象成裝飾器**。這是刻意的教學設計，詳見 `blueprints/admin/CLAUDE.md`。

## 自我保護規則

| 規則 | 內容 | 訊息 |
|------|------|------|
| R1 | 不可停用自己 | `不可停用自己的帳號` |
| R2 | 不可刪除自己 | `不可刪除自己的帳號` |
| R3 | 不可修改自己的角色 | `不可修改自己的角色` |

啟用不設自我限制——能執行到那一行的管理員必然已經是啟用狀態，對自己啟用等同無操作。

由這三條規則可以推出一個保證：任何管理動作完成之後，執行者仍然是一個啟用、未刪除、`role = 0` 的帳號。因此系統中永遠至少存在一個可用的管理員，「所有管理員都被鎖死」的狀態不可達。系統也因此不需要實作「啟用中的管理員數 ≥ 1」這類計數檢查。

這個保證完全依賴三條規則同時成立。若日後放寬其中任何一條，必須立即補上計數檢查。

## 資料流

### 檢視清單

```text
GET /admin/users?status=active&q=admin&page=2
-> login_required
-> _is_usable(user)
-> _is_admin(user)
-> 解析 status / q / page
-> db.list_users(page, 10, status, keyword)  回傳 (items, total)
-> total_pages = ceil(total / 10)
-> render_template(...)
```

### 停用帳號

```text
POST /admin/users/<id>/deactivate
-> login_required
-> _is_usable(user)
-> _is_admin(user)
-> db.find_user_by_id(id) 存在？
-> id != user['id']？（R1）
-> not target['is_deleted']？
-> db.set_user_active(id, 0)
-> flash 帳號已停用
-> redirect /admin/users
```

啟用、角色調整、刪除三條路由的結構相同，只差在中間的規則檢查與最後呼叫的 `db.*` 函式。

## 主要錯誤情境

- 非管理員存取任一路由：`無操作權限`
- 目標 id 不存在：`找不到該使用者`
- 對自己停用：`不可停用自己的帳號`
- 對自己刪除：`不可刪除自己的帳號`
- 對自己調整角色：`不可修改自己的角色`
- 對已軟刪除的帳號執行任何操作：`該帳號已刪除，無法操作`
- `role` 表單值不是 `'0'` 或 `'1'`：`角色值不正確`

成功訊息四條：`帳號已啟用`、`帳號已停用`、`角色已更新`、`帳號已刪除`。

全部以 `flash()` 傳遞，因為每一條都伴隨 redirect。這與 auth 的登入錯誤（用 `error` 變數，因為是重新渲染同一頁）形成對照。

## 前端頁面

### `templates/admin/user_list.html`

由上而下：topbar（返回首頁、個人資料、使用者名稱、登出）→ flash 區 → 篩選列 → 表格 → 分頁列。

篩選列左側是四個狀態連結，當前狀態加上 `.admin-filter-active`；右側是搜尋表單，以 hidden 欄位帶上當前的 `status`，避免一搜尋就把篩選重設。

表格欄位：ID｜Email｜姓名｜顯示名稱｜角色｜狀態｜建立時間｜最後登入｜操作。角色與狀態以 badge 呈現，姓名與顯示名稱為空時顯示 `—`。

「操作」欄依該列的狀態決定內容：自己那一列只顯示「（目前登入帳號）」與「詳細」；已刪除的只有「詳細」；其餘顯示啟用或停用、刪除、詳細。刪除按鈕帶 `confirm()`。

前端隱藏按鈕只是提示，後端的規則檢查才是權威。

### `templates/admin/user_detail.html`

資訊卡以雙欄格線顯示 `users` 表的九個欄位（不含 `hash`）。下方是操作區：角色調整表單（`<select>` 加送出按鈕）、啟用或停用按鈕、刪除按鈕。

被檢視的會員在模板中叫 `target`，當前登入者叫 `user`。若檢視的是自己或已刪除的帳號，整個操作區換成提示文字。

## 使用到的資料層函式

- `db.find_user_by_id(user_id)`
- `db.list_users(page, page_size, status, keyword)`
- `db.set_user_active(user_id, is_active)`
- `db.set_user_role(user_id, role)`
- `db.soft_delete_user(user_id)`

`list_users()` 刻意不強制過濾 `is_deleted`，因為管理員的職責就是要能檢視已刪除的紀錄。這是 `rules/database.md` 明列的例外之一。

後三個函式雖然是為會員管理而新增的，仍放在 `db/users.py` 而非另建 `db/admin.py`——模組拆分的依據是資料表，不是子系統。

## 測試對應

`tests/test_admin.py` 共 30 個案例，涵蓋：

- 三種身分（匿名、一般使用者、管理員）存取六條路由的結果
- 「停用中的管理員」被第 2 層而非第 3 層攔下
- 四種狀態篩選、關鍵字比對 email 與姓名、第二頁分頁
- 啟用、停用、角色調整、刪除的正常流程
- 三條自我保護規則
- 目標不存在、目標已刪除、角色值非法三種邊界
- 軟刪除後無法登入的整合案例

被權限擋下的 POST 一律同時斷言資料庫沒有改變——只驗 302 無法區分「被擋下」與「執行成功後 redirect」。
