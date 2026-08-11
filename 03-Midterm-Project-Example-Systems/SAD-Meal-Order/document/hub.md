# 首頁系統文件（hub）

## 功能定位

`hub` 是系統入口頁。它不是單純的「登入後首頁」，而是同時提供兩種模式：

- 未登入：可瀏覽公開服務，並可直接在首頁登入
- 已登入：顯示完整服務卡片與使用者資訊

檔案位置：

- `blueprints/hub/__init__.py`
- `templates/hub/home.html`
- `static/hub.css`

## 路由

| 方法 | 路徑 | Handler | 說明 |
|------|------|---------|------|
| `GET / POST` | `/` | `home()` | 首頁；未登入時也可直接提交登入表單 |

## 頁面模式

### 未登入模式

首頁會顯示：

- 今日菜單卡片，可直接進入
- 我的訂單鎖定卡片，提示需登入
- 個人資料鎖定卡片，提示需登入
- 訂單管理鎖定卡片，提示需管理員權限
- 會員管理鎖定卡片，提示需管理員權限
- 右側登入表單
- 右上角申請帳號連結

這表示系統並不是所有功能都必須登入後才能瀏覽：菜單與價格屬於可公開讀取的資訊，
訂餐這個「會產生資料」的動作才需要身分。

### 已登入模式

首頁會顯示：

- 歡迎訊息
- 使用者名稱
- 今日菜單卡片
- 我的訂單卡片
- 個人資料卡片
- 訂單管理卡片（僅管理員）
- 會員管理卡片（僅管理員）
- 登出連結

使用者名稱的顯示優先順序由 template 決定：

- `user['name']`
- `user['display_name']`
- `user['email']`

## 資料流

### GET `/`

```text
GET /
-> 檢查 session 是否有 user_id
-> 若有，db.find_user_by_id(user_id)
-> _is_usable(user) 檢查是否啟用且未刪除
-> 成功：render 已登入首頁
-> 失敗：session.clear()，改以訪客模式顯示首頁
```

注意：Hub 對「失效帳號的舊 session」採取的是清除後回到訪客首頁，而不是直接 redirect `/login`。

### POST `/`

```text
POST /
-> 僅在 user is None 時處理登入
-> 驗證 captcha
-> db.find_user_by_email(email)
-> bcrypt.checkpw(...)
-> 檢查 is_active / is_deleted
-> db.update_last_login(...)
-> session['user_id'] = user['id']
-> redirect /
```

首頁本身內建一份與 `/login` 類似的登入流程，差別在於提交目標是 `hub.home`，成功後仍回到 `/`。

## 與其他子系統的關係

Hub 主要扮演導覽中心，連往：

- `meal.index`
- `meal.my_orders`
- `profile.dashboard`
- `meal.admin_orders`（僅管理員可見）
- `admin.user_list`（僅管理員可見）
- `auth.register`
- `auth.logout`

## 前端結構

### `templates/hub/home.html`

主要區塊：

- `.hub-topbar`
- `.hub-main`
- `.hub-grid`
- `.hub-guest-layout`
- `.hub-login-panel`

登入表單中使用的驗證碼圖片仍來自 `auth.captcha_image`，代表 Hub 與 Auth 在 UI 上有協作。

### `static/hub.css`

負責首頁的雙欄布局、卡片樣式、訪客與登入者兩種畫面配置。

## 測試對應

`tests/test_hub.py` 主要驗證：

- 訪客能看到今日菜單（可點的 `<a>`），其餘卡片為 locked `<div>`
- 已登入使用者能看到歡迎訊息、菜單、我的訂單與個人資料卡片
- 管理員能額外看到訂單管理與會員管理卡片，一般使用者看不到
- 已刪除使用者的舊 session 會被清掉，並回到訪客畫面

## 已知限制

`hub/home.html` **沒有渲染 flash 區塊**。任何 `flash(...)` 後 redirect 到首頁的訊息
都會被靜默丟棄——包含 `admin` 與 `meal` 管理端路由在第 3 層權限檢查失敗時的
「無操作權限」。使用者只會發現自己被彈回首頁，不知道為什麼。

這是刻意保留的缺陷，記錄為規格書的 KI-M6。修補方式是在
`.hub-main` 開頭加上與其他子系統相同的 `get_flashed_messages` 迴圈，成本約五行。
