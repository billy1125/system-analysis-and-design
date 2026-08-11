# 個人資料系統文件（profile）

## 功能定位

`profile` Blueprint 讓已登入使用者查看與修改自己的基本資料，目前可編輯欄位只有：

- `name`
- `display_name`

檔案位置：

- `blueprints/profile/__init__.py`
- `templates/profile/dashboard.html`
- `static/profile.css`
- `db/users.py`

## 路由

| 方法 | 路徑 | Handler | 說明 |
|------|------|---------|------|
| `GET` | `/profile` | `dashboard()` | 顯示個人資料頁 |
| `POST` | `/profile/update` | `dashboard_update()` | 更新姓名與顯示名稱 |

兩個路由都套用 `@login_required`，未登入會導向 `/login`。

## 核心資料流

### 查看資料

```text
GET /profile
-> login_required
-> db.find_user_by_id(session['user_id'])
-> _is_usable(user)
-> 判斷 request.args.get('edit') == '1'
-> render_template(...)
```

如果查到的使用者已停用或已刪除，系統會：

- `session.clear()`
- redirect `/login`

### 更新資料

```text
POST /profile/update
-> login_required
-> 讀取 name / display_name
-> strip() 後空字串轉成 None
-> db.update_user_profile(...)
-> redirect /profile
```

這表示使用者可以把姓名或顯示名稱清空，資料庫中會儲存為 `NULL`。

> ⚠️ **此路由沒有 `_is_usable` 檢查。** 被管理員停用或刪除的會員，只要瀏覽器中的 session 還在，
> 仍然可以成功修改自己的資料——即使 `GET /profile` 已經會把他導向登入頁。
>
> 這是刻意保留的技術債，見系統規格書 KI-03。**請勿順手補上檢查。**
>
> 值得對照的是：`events` 對同一個問題做了**相反**的處置（修補了守門）。兩者的判準見規格書 §11.0
> ——缺陷的影響是否會外溢到當事人以外的人。profile 只能改自己的姓名，events 能產生公開內容
> （活動與報名名單），還會佔用別人的名額。
>
> 此外本路由對輸入沒有任何長度或內容驗證，成功後也沒有 flash 回饋（KI-04）。

## `edit_mode` 機制

`/profile` 透過 query string 切換模式：

- `/profile`：檢視模式
- `/profile?edit=1`：編輯模式

在檢視模式中：

- 內容以純文字顯示
- 顯示 `修改資料` 按鈕

在編輯模式中：

- `name` 與 `display_name` 改為 `<input>`
- 整頁包在 `<form method="POST" action="/profile/update">`
- 顯示 `儲存` 與 `放棄`

## 畫面欄位

| 欄位 | 可編輯 | 說明 |
|------|--------|------|
| `email` | 否 | 目前登入帳號 |
| `name` | 是 | 姓名，空值顯示 `—` |
| `display_name` | 是 | 顯示名稱，空值顯示 `—` |
| `role` | 否 | `管理者` 或 `一般使用者` |
| `created_at` | 否 | 建立時間 |
| `last_login_at` | 否 | 最後登入時間，空值顯示 `—` |

畫面底部也固定顯示：

- 返回首頁
- 登出
- 認證方式說明框

## 使用到的資料層函式

- `db.find_user_by_id(user_id)`
- `db.update_user_profile(user_id, name, display_name)`

`find_user_by_id()` 不會回傳密碼雜湊欄位，避免把敏感資料傳到 template。

## 測試對應

`tests/test_profile.py` 主要覆蓋：

- 未登入被導去 `/login`
- 已登入可以看到個人資料
- `?edit=1` 會顯示輸入欄位
- 更新後資料會寫回資料庫
- 已刪除帳號的舊 session 會被清除並導向登入頁
