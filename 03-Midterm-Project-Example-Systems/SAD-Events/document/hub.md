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

首頁會顯示四張卡片，其中只有一張可以點：

| 卡片 | 狀態 | 理由 |
|------|------|------|
| 校園活動報名 | **可點**，連向 `events.index` | `GET /events` 本身不需登入 |
| 我的報名 | 鎖定，`🔒 需登入` | `/events/my` 套用 `@login_required` |
| 個人資料 | 鎖定，`🔒 需登入` | 同上 |
| 會員管理 | 鎖定，`🔒 需管理員權限` | 需通過三層守門 |

以及右側的登入表單與右上角的申請帳號連結。

**卡片的鎖定狀態必須忠實反映後端的守門。** 「校園活動報名」與「我的報名」
同屬 events 子系統，前者開放、後者需登入——若把兩張都做成可點，
使用者點「我的報名」只會被踢回登入頁。

這也表示系統並不是所有功能都必須登入後才能瀏覽：活動清單與活動內容屬於可公開讀取的資訊。

### 已登入模式

首頁會顯示：

- 歡迎訊息與使用者名稱
- 校園活動報名卡片
- 我的報名卡片
- 個人資料卡片
- 會員管理卡片（僅 `role == 0`）
- 右上角登出連結

使用者名稱的顯示優先順序由 template 決定：`user['name']` → `user['display_name']` → `user['email']`。

管理員卡片以 `{% if user['role'] == 0 %}` 條件顯示。
**Blueprint 本身不做角色判斷**——`user` 物件（含 `role`）已完整傳給 template，
判斷在 Jinja 中完成。

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

注意：Hub 對「失效帳號的舊 session」採取的是清除後回到訪客首頁，
而不是直接 redirect `/login`。這與 `profile`、`admin`、`events` 的處置不同——
那些路由沒有「訪客模式」可以退回，只能導向登入頁。

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

首頁內建一份與 `/login` **完全相同**的登入流程，差別只在提交目標是 `hub.home`，
成功後仍回到 `/`。五條錯誤訊息各硬編碼兩份。

> 這是規格書的 KI-23：任何登入政策的強化（速率限制、驗證碼 pop、session 重生成）
> 都**必須兩處都改**，漏改就能從另一個入口繞過。

## 與其他子系統的關係

Hub 扮演導覽中心，連往：

- `events.index`（訪客也可）
- `events.my_registrations`
- `profile.dashboard`
- `admin.user_list`（僅管理員可見）
- `auth.register`、`auth.logout`、`auth.captcha_image`

**Hub 不 import 任何其他 Blueprint**，只透過 `url_for()` 建立關聯。
這是為什麼把論壇換成活動報名時，`blueprints/hub/__init__.py` 一行都不用改——
服務卡片的內容全部在模板中決定。

## 前端結構

### `templates/hub/home.html`

主要區塊：

- `.hub-topbar` — 系統標題與使用者資訊
- `.hub-main` — 內容容器
- `.hub-grid` — 服務卡片格線（`repeat(auto-fill, minmax(180px, 1fr))`，卡片數改變不需調整 CSS）
- `.hub-guest-layout` — 訪客模式的左右兩欄
- `.hub-login-panel` — 訪客模式右側的登入卡片

內嵌登入表單的 `<form>` **必須**帶 `class="login-form"`，
否則送出按鈕不會套用 `login.css` 的樣式。全系統恰有三處需要這個 class。

登入表單中的驗證碼圖片來自 `auth.captcha_image`，代表 Hub 與 Auth 在 UI 上有協作。
驗證碼刷新的兩個 `onclick` 是全站十處允許的 inline event handler 之一。

### `static/hub.css`

負責首頁的雙欄布局、卡片樣式、訪客與登入者兩種畫面配置。

`body { display: block }` 覆寫了 `login.css` 的 flex 置中——
`login.css` 是由 `base.html` 全域載入的，各子系統都需要這個覆寫。

> 已知技術債 KI-31：`.hub-register-link` 與 `.hub-logout` 是按鍵，
> 卻寫死了色碼而非使用 `var(--btn-*)` token。
> 它們的類別名稱不含 `btn`，因此以「btn」為關鍵字的 CSS 稽核抓不到。

## 測試對應

`tests/test_hub.py`，11 個案例，主要驗證：

- 訪客能看到活動報名卡片，且該卡片是可點的 `<a href="/events/">`
- 訪客看不到 `/events/my`，且畫面上有 `hub-card-locked` 卡片
- 已登入使用者能看到歡迎訊息、個人資料與我的報名卡片
- 管理員卡片只對 `role == 0` 顯示
- 已刪除使用者的舊 session 會被清掉，並回到訪客畫面

> 斷言活動連結時要注意尾斜線：`events.index` 宣告 `strict_slashes=False`，
> `url_for()` 產生的是 `/events/` 而非 `/events`。
