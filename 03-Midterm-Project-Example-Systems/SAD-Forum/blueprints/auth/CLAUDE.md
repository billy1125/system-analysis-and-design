# auth Blueprint

## 職責

處理使用者身份驗證，包含登入、申請帳號、登出，以及伺服器端圖形驗證碼產生。

---

## 路由

| 方法         | 路徑           | 函式              | 說明                                       |
| ------------ | -------------- | ----------------- | ------------------------------------------ |
| `GET / POST` | `/login`       | `login_page`      | 登入；成功後 redirect `/`                  |
| `GET / POST` | `/register`    | `register`        | 申請帳號；成功後 redirect `/login`         |
| `GET`        | `/logout`      | `logout`          | 清除 session，redirect `/login`            |
| `GET`        | `/captcha.png` | `captcha_image`   | 產生驗證碼圖片，答案寫入 `session['captcha']` |

---

## 業務邏輯

### 登入（`/login` POST）

驗證順序：
1. 驗證碼不可空白
2. 驗證碼答案比對（`session['captcha']`，不區分大小寫，輸入前先 `.upper()`）
3. email / password 不可空白
4. `find_user_by_email` 查找使用者；`is_deleted` 為真或帳號不存在 → 錯誤
5. `bcrypt.checkpw` 驗證密碼
6. `is_active` 為假 → 停用帳號錯誤
7. 通過：`update_last_login` → 設 `session['user_id']` → redirect `hub.home`

### 申請帳號（`/register` POST）

驗證順序：
1. email / password 不可空白
2. email 格式（`EMAIL_REGEX`）
3. 密碼長度 ≥ 8
4. 兩次密碼一致
5. `create_user`（bcrypt cost=10 雜湊）；email 重複 → `sqlite3.IntegrityError`

### 驗證碼

- 每次 GET `/captcha.png` 產生新的 5 位大寫英數字串，存入 `session['captcha']`
- 使用 `captcha.image.ImageCaptcha`（160×50 px）

---

## Templates

- `templates/auth/login.html` — 登入表單（email、password、captcha input + captcha img）
- `templates/auth/register.html` — 申請帳號表單（email、password、confirm_password、name、display_name）

兩個模板的 `<form>` 元素均需保留 `class="login-form"`，`login.css` 的 `button[type="submit"]` 樣式限定在此 class 內，缺少則送出按鈕無樣式。

---

## 測試

`tests/test_auth.py`，涵蓋：
- 正確登入 / 登出
- 驗證碼空白 / 錯誤
- 密碼錯誤、帳號不存在、帳號停用
- 申請帳號各驗證條件
- email 重複申請
