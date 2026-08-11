# 首頁系統文件（hub）

## 功能定位

`hub` 是系統入口頁。它不是單純的「登入後首頁」，而是同時提供兩種模式：

- 未登入：可瀏覽公開服務（器材清單），並可直接在首頁登入
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

- 器材借用卡片，可直接進入（`/equipment/`）
- 我的借用紀錄鎖定卡片，提示需登入
- 個人資料鎖定卡片，提示需登入
- 借用單管理鎖定卡片，提示需管理員權限
- 會員管理鎖定卡片，提示需管理員權限
- 右側登入表單
- 右上角申請帳號連結

這表示系統並不是所有功能都必須登入後才能瀏覽——器材清單屬於可公開讀取的資訊，
使用者可以先確認有沒有想借的東西，再決定要不要申請帳號。

### 已登入模式

首頁會顯示：

- 歡迎訊息與使用者名稱
- 器材借用卡片
- 我的借用紀錄卡片
- 個人資料卡片
- 借用單管理卡片（僅 `role == 0`）
- 會員管理卡片（僅 `role == 0`）
- 登出連結

使用者名稱的顯示優先順序由 template 決定：

- `user['name']`
- `user['display_name']`
- `user['email']`

管理員卡片的顯示由 template 的 `{% if user['role'] == 0 %}` 決定，Blueprint 本身不做角色判斷。
這只是介面提示，真正的守門在 `admin` 與 `equipment` 的路由裡——測試會直接 POST 管理端路由來證明這一點。

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
-> 檢查 is_deleted / is_active
-> db.update_last_login(...)
-> session['user_id'] = user['id']
-> redirect /
```

首頁本身內建一份與 `/login` 完全相同的登入流程，差別只在提交目標是 `hub.home`、成功後仍回到 `/`。
五條錯誤訊息各硬編碼兩份，任何登入政策的強化都必須兩處都改（規格書 KI-02）。

## 與其他子系統的關係

Hub 扮演導覽中心，連往：

- `equipment.index`
- `equipment.my_orders`
- `equipment.admin_orders`（僅管理員可見）
- `profile.dashboard`
- `admin.user_list`（僅管理員可見）
- `auth.register`
- `auth.logout`

Hub 不 import 任何其他 Blueprint，全部透過 `url_for()` 建立關聯。

## 前端結構

### `templates/hub/home.html`

主要區塊：

- `.hub-topbar`
- `.hub-main`
- `.hub-grid`
- `.hub-guest-layout`
- `.hub-login-panel`

登入表單中使用的驗證碼圖片仍來自 `auth.captcha_image`，代表 Hub 與 Auth 在 UI 上有協作。
內嵌登入表單的 `<form>` 必須帶 `class="login-form"`，否則送出按鈕不會套用 `login.css` 的樣式。

### `static/hub.css`

負責首頁的雙欄布局、卡片樣式、訪客與登入者兩種畫面配置。

## 使用到的資料層函式

- `db.find_user_by_id(user_id)`
- `db.find_user_by_email(email)`（內嵌登入）
- `db.update_last_login(user_id)`（內嵌登入）

## 測試對應

`tests/test_hub.py` 主要驗證：

- 訪客能看到器材借用卡片，且該卡片是可點的 `<a href="/equipment/">`
- 其他卡片是 `hub-card-locked` 的 `<div>`
- 已登入使用者能看到歡迎訊息、個人資料卡片、我的借用紀錄連結
- 管理員能看到 `/equipment/admin/orders` 與 `/admin/users` 兩張管理卡片
- 一般使用者的頁面中完全不出現這兩個網址
- 已刪除使用者的舊 session 會被清掉，並回到訪客畫面
