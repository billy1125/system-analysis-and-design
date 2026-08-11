# hub 子系統

首頁。無 `url_prefix`，僅 1 條路由 `GET POST /`。

---

## 雙模式

`home()` 依 session 決定渲染哪一種版面：

| 狀態 | 版面 |
|------|------|
| 訪客（或帳號失效） | 左側四張**鎖定的**服務卡片 + 右側內嵌登入表單 |
| 已登入 | 歡迎訊息（含住宿位置）+ 服務卡片（住宿生 3 張，管理員 5 張） |

**帳號失效時 `session.clear()` 之後以訪客視圖渲染，不 redirect。** 若改成 redirect 到 `/login`，被停用的使用者會陷入「點首頁被踢到登入頁」的體驗，但他其實只是想看看首頁。

---

## 訪客沒有任何可進入的子系統

報修單含房號與電話，因此**四張卡片全部是 `hub-card-locked`**，訪客一個子系統都進不去。

理由寫在頁面上，而不只是寫在文件裡：

```html
<p class="hub-guest-note">
  報修單載有房號與聯絡電話，屬於個人資料，因此本系統沒有開放訪客瀏覽的頁面。
</p>
```

讀原始碼的人與用系統的人會問同一個問題（「為什麼不給看」），答案應該在他們各自看得到的地方。

---

## 登入後的卡片

| 卡片 | 對象 | 附帶資訊 |
|------|------|---------|
| 我要報修 | 全部 | — |
| 我的報修單 | 全部 | 「共 N 筆」 |
| 個人資料 | 全部 | — |
| 報修管理 | 管理員 | 「N 筆待受理」（僅 N > 0 時顯示） |
| 會員管理 | 管理員 | — |

摘要查詢：

```python
    if user is not None:
        _, my_summary = db.list_my_requests(user['id'], 1, 1, 'all')
        if user['role'] == 0:
            pending_count = db.count_by_status()['pending']
```

`page_size=1` 只是為了取 `total`（回傳 tuple 的第二個元素）。這浪費了一次索引查詢，但省下再寫一個 count 函式。在這個規模下划算；若首頁成為效能瓶頸，這是第一個該改的地方。

`pending_count` 只在管理員時查詢——住宿生看不到那張卡片，查了也沒用。

歡迎詞的住宿位置用 `and` 而非 `or` 判斷，否則管理員（棟別與房號都是 NULL）會看到「住宿位置：　|」這種殘骸。

---

## 內嵌登入表單

`POST /` 的邏輯與 `auth.login_page()` **逐行相同**（KI-12）。五道驗證、五則訊息、`update_last_login()` 的呼叫時機都一樣。

**任何登入政策的強化都必須兩處都改**，漏改就能從另一個入口繞過。

抽出共用函式會讓兩個 Blueprint 產生依賴，違反「Blueprint 之間不互相 import」的原則。正確的修補方向是把驗證邏輯抽到 `utils.py`：

```python
def authenticate(email, password, captcha_input, captcha_answer):
    """回傳 (user_or_None, error_or_None)"""
```

`<form>` 必須有 `class="login-form"`。

---

## 樣板與 CSS

`templates/hub/home.html`、`static/hub.css`（前綴 `hub-`）。

CSS 有三個本子系統專用的 class：`.hub-badge-count`（藍，單數）、`.hub-badge-alert`（紅，待受理）、`.hub-guest-note`（訪客說明文字）。三者的顏色硬編碼——`common.css` 只管按鍵色。

`hub.css` 開頭覆蓋 `body { display: block; }`，取消 `login.css` 的 flex 置中。
