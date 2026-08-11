# profile 子系統

個人資料的查看與編輯。無 `url_prefix`，共 2 條路由。

---

## 路由

| 方法 | 路徑 | 守門 | 說明 |
|------|------|------|------|
| `GET` | `/profile` | 1+2 | 唯讀模式；`?edit=1` 進入編輯模式 |
| `POST` | `/profile/update` | 1+2 | 更新五個欄位 |

兩條路由都做完整的 1+2 兩層檢查。**這一點是本子系統最重要的事，見下。**

---

## ⚠️ `dashboard_update()` 的三層檢查

只有 `@login_required` 是不夠的，`_is_usable` 檢查不可省略：

```python
@profile_bp.route('/profile/update', methods=['POST'])
@login_required
def dashboard_update():
    user = db.find_user_by_id(session['user_id'])
    if not _is_usable(user):
        session.clear()
        return redirect(url_for('auth.login_page'))
    ...
```

### 為什麼這一層不能省

判準只有一條：

> 缺陷的影響是否會外溢到當事人以外的人？

| 個人資料頁能改的東西 | 影響範圍 | 結論 |
|------------------|---------|------|
| 姓名、顯示名稱 | 只有自己，不出現在任何公開頁面 | 影響有限 |
| **房號、聯絡電話** | 會印在報修單上，成為維修人員上門的依據 | **必須擋** |

一個已經退宿、帳號被停用的人，可以把房號改成別人的房間，然後維修人員照著跑一趟。影響外溢了，判準的結論就反了。

**這是整個專案最值得在課堂上講的一件事：技術債的嚴重性不是程式碼的屬性，是脈絡的屬性。** 同一行程式碼、同一條判準、不同的領域，得到相反的答案。

### 迴歸防線

`tests/test_profile.py` 的兩個測試專門防守這一點：

- `test_profile_update_rejects_disabled_user`
- `test_profile_update_rejects_deleted_user_and_clears_session`

**不要移除它們。** 從別的系統逐檔搬 `profile` 過來時，這三行極容易漏掉——少了它們，檔案看起來完全正常。

---

## 五個欄位

| 欄位 | 說明 |
|------|------|
| `name` | 姓名 |
| `display_name` | 顯示名稱 |
| `dorm_building` | 宿舍棟別 |
| `room_no` | 房號 |
| `phone` | 聯絡電話 |

後三個是本系統新增的，會成為報修表單的預設值，並提供維修人員聯繫使用。編輯模式下有一行 `.profile-hint` 說明這件事。

全部空字串轉 `None`。`db.update_user_profile()` 的簽章**沒有預設值**——五個欄位一律一起送出，避免「只送部分欄位就把其他欄位清空」的意外。少送任一個會直接 `TypeError`，在開發階段就炸出來。

---

## 樣板與 CSS

`templates/profile/dashboard.html` 以 `edit_mode` 區分唯讀與編輯兩種模式，**兩邊都要列出全部八個欄位**（五個可編輯 + 身份、建立日期、最後登入三個唯讀）。新增欄位時容易只改一邊。

底部三個導覽連結：我的報修單、返回首頁、登出。

`static/profile.css`（前綴 `profile-`），另有 `.profile-hint`。表單**不加** `.login-form` class，否則會誤套登入頁樣式。
