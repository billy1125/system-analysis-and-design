# 登入系統文件（auth）

## 功能定位

`auth` Blueprint 負責帳號申請、登入、驗證碼與登出。這個子系統的核心任務是建立與清除 `session['user_id']`，讓其他 Blueprint 能判斷目前是否已登入。

檔案位置：

- `blueprints/auth/__init__.py`
- `templates/auth/login.html`
- `templates/auth/register.html`
- `static/login.css`
- `db/users.py`
- `utils.py`

## 路由

| 方法 | 路徑 | Handler | 說明 |
|------|------|---------|------|
| `GET` | `/captcha.png` | `captcha_image()` | 產生驗證碼圖片並寫入 session |
| `GET / POST` | `/login` | `login_page()` | 顯示或送出登入表單 |
| `GET / POST` | `/register` | `register()` | 顯示或送出申請帳號表單 |
| `GET` | `/logout` | `logout()` | 清除 session 後導回登入頁 |

已登入使用者再進入 `/login` 或 `/register`，會直接導回 `/`。

## 核心資料流

### 1. 驗證碼

```text
GET /captcha.png
-> _gen_captcha()
-> session['captcha'] = 5 位字串
-> ImageCaptcha 產生 PNG
-> 回傳 image/png
```

驗證碼字元來源在 `utils.py`：

- `CAPTCHA_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'`
- 長度固定 5 碼
- 排除 `I`、`O`、`1`、`0` 等容易混淆字元

### 2. 登入

```text
POST /login
-> 讀取 email / password / captcha
-> 檢查驗證碼
-> db.find_user_by_email(email)
-> bcrypt.checkpw(...)
-> 檢查 is_active / is_deleted
-> db.update_last_login(user_id)
-> session['user_id'] = user['id']
-> redirect /
```

主要錯誤情境：

- 驗證碼空白：`請輸入驗證碼`
- 驗證碼錯誤：`驗證碼錯誤，請重新輸入`
- 帳號或密碼空白：`請輸入帳號與密碼`
- 使用者不存在、已刪除、密碼錯誤：`帳號或密碼錯誤`
- 帳號停用：`帳號已停用`

### 3. 申請帳號

```text
POST /register
-> 讀取 email / password / confirm_password / name / display_name
-> 檢查必填與 email 格式
-> 檢查密碼長度 >= 8
-> 檢查兩次密碼一致
-> db.create_user(...)
-> flash('申請成功，請登入')
-> redirect /login
```

主要錯誤情境：

- 缺少 email 或 password：`請輸入電子郵件與密碼`
- email 格式錯誤：`電子郵件格式不正確`
- 密碼太短：`密碼至少需要 8 個字元`
- 確認密碼不一致：`兩次密碼輸入不一致`
- email 已存在：`此電子郵件已被使用`

## 前端頁面

### `templates/auth/login.html`

登入頁包含：

- email 輸入框
- password 輸入框
- 驗證碼圖片與刷新按鈕
- captcha 文字輸入框
- 送出登入
- 申請帳號連結

登入頁也會顯示來自 `flash()` 的成功訊息，例如註冊完成後的 `申請成功，請登入`。

### `templates/auth/register.html`

申請帳號頁包含：

- `email`
- `password`
- `confirm_password`
- `name`
- `display_name`

其中 `name` 和 `display_name` 為選填；若驗證失敗，伺服器會把已輸入資料透過 `form_data` 回填到表單。

## 使用到的資料表

### `users`

| 欄位 | 說明 |
|------|------|
| `id` | 使用者主鍵 |
| `email` | 唯一帳號 |
| `hash` | bcrypt 密碼雜湊 |
| `role` | `0=管理員`、`1=一般使用者` |
| `name` | 姓名 |
| `display_name` | 顯示名稱 |
| `is_active` | 是否啟用 |
| `is_deleted` | 是否邏輯刪除 |
| `created_at` | 建立時間 |
| `last_login_at` | 最後登入時間 |

與 auth 直接相關的資料層函式：

- `db.find_user_by_email(email)`
- `db.create_user(email, password, name, display_name)`
- `db.update_last_login(user_id)`

## 安全性與限制

- 密碼使用 `bcrypt` 雜湊，不儲存明文
- 驗證碼答案存在 Flask session
- session 以 `user_id` 作為登入識別
- 對於不存在帳號、刪除帳號、密碼錯誤，統一回傳 `帳號或密碼錯誤`
- 已停用帳號不能登入

## 測試對應

`tests/test_auth.py` 主要覆蓋：

- `/login` GET 與 POST
- `/register` GET 與 POST
- `/logout`
- `/captcha.png`

測試情境包含：

- 驗證碼錯誤
- 帳密缺漏
- 停用帳號
- 重複 email
- 註冊成功後 flash 訊息
- session 是否正確建立
