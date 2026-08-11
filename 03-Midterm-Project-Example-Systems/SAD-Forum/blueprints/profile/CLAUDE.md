# profile Blueprint

## 職責

提供已登入使用者查看與修改自己的個人資料（name、display_name）。

---

## 路由

| 方法   | 路徑              | 函式               | 說明                                        |
| ------ | ----------------- | ------------------ | ------------------------------------------- |
| `GET`  | `/profile`        | `dashboard`        | 個人資料頁；`?edit=1` 進入編輯模式          |
| `POST` | `/profile/update` | `dashboard_update` | 更新 name / display_name，redirect `/profile` |

兩個路由皆套用 `@login_required`。

---

## 業務邏輯

### 查看個人資料（`/profile` GET）

1. `find_user_by_id` 取得使用者；`_is_usable` 為假 → 清除 session → redirect 登入頁
2. `?edit=1` → `edit_mode=True`，模板顯示編輯表單；否則顯示唯讀檢視

### 更新個人資料（`/profile/update` POST）

1. 從 `request.form` 取得 `name`、`display_name`（空字串轉 `None`）
2. `update_user_profile(session['user_id'], name, display_name)`
3. redirect `/profile`（唯讀模式）

---

## Templates

- `templates/profile/dashboard.html` — 個人資料頁；`edit_mode` 控制唯讀 / 編輯模式

---

## CSS

- `static/login.css` — auth / profile 共用樣式

---

## 測試

`tests/test_profile.py`，涵蓋：
- 未登入 redirect
- 停用帳號 redirect
- 查看個人資料
- 進入編輯模式（`?edit=1`）
- 更新 name / display_name
