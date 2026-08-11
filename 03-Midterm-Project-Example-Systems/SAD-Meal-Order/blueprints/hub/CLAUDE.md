# hub Blueprint

## 職責

服務入口（Hub）。**訪客與已登入者皆可瀏覽**，兩種模式渲染不同內容。

---

## 路由

| 方法         | 路徑 | 函式   | 說明                                                   |
| ------------ | ---- | ------ | ------------------------------------------------------ |
| `GET / POST` | `/`  | `home` | Hub 首頁；訪客顯示服務卡片 + 內嵌登入表單，POST 處理登入 |

---

## 業務邏輯

1. 有 `session['user_id']` 時以 `find_user_by_id` 查找使用者
2. `_is_usable` 為假（已停用或已刪除）→ `session.clear()`、`user = None`。**不 redirect**，退回訪客視圖
3. `request.method == 'POST'` 且 `user is None` → 處理內嵌登入（驗證順序與訊息與 `auth.login_page` 完全相同）
4. 渲染 `hub/home.html`，傳入 `user` 與 `error`

> 內嵌登入的邏輯是 `auth.login_page` 的完整複製，含五條錯誤訊息各硬編碼兩份。任何登入政策的強化都必須**兩處都改**，見規格書 KI-23。

## 服務卡片

| 卡片 | 訪客視圖 | 已登入視圖 |
|------|---------|-----------|
| 今日菜單 | `<a>` 連向 `meal.index`，**可點** | `<a>` 連向 `meal.index` |
| 我的訂單 | locked `<div>`，`🔒 需登入` | `<a>` 連向 `meal.my_orders` |
| 個人資料 | locked `<div>`，`🔒 需登入` | `<a>` 連向 `profile.dashboard` |
| 訂單管理 | locked `<div>`，`🔒 需管理員權限` | 僅 `user['role'] == 0` 時顯示，連向 `meal.admin_orders` |
| 會員管理 | locked `<div>`，`🔒 需管理員權限` | 僅 `user['role'] == 0` 時顯示，連向 `admin.user_list` |

管理員卡片以 `{% if user['role'] == 0 %}` 條件顯示。Blueprint 本身不做角色判斷——`user` 物件（含 `role`）已完整傳給 template，判斷在 Jinja 中完成。

---

## Templates

- `templates/hub/home.html` — 服務入口頁，顯示各子系統的導覽連結

未登入時 `home.html` 會內嵌登入表單，該 `<form>` 需保留 `class="login-form"`，使其套用 `login.css` 的按鈕樣式（同 auth 頁面）。

---

## CSS

- `static/hub.css` — Hub 首頁專用 layout

---

## 測試

`tests/test_hub.py`，涵蓋：
- 未登入 redirect
- 停用帳號 redirect
- 正常登入顯示首頁
