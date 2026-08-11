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

- 論壇卡片，可直接進入
- 校園活動報名卡片，可直接進入
- 個人資料鎖定卡片，提示需登入
- 右側登入表單
- 右上角申請帳號連結

這表示系統並不是所有功能都必須登入後才能瀏覽，論壇與活動清單屬於可公開讀取的資訊。

### 已登入模式

首頁會顯示：

- 歡迎訊息
- 使用者名稱
- 個人資料卡片
- 論壇卡片
- 校園活動報名卡片
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

- `profile.dashboard`
- `forum.index`
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

- 訪客能看到論壇與活動
- 已登入使用者能看到歡迎訊息與個人資料卡片
- 已刪除使用者的舊 session 會被清掉，並回到訪客畫面
