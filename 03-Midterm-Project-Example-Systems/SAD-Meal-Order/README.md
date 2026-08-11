# 校園訂餐系統（sad-meal-order）

以學習為目的之校園訂餐系統，用於系統分析與設計課程的教學。

- **會員登入與管理系統**沿用同一個資料夾底下的 [`SAD-Forum`](../SAD-Forum/README.md)
- **訂餐子系統**的設計模式取自 [`billy1125/Course-SAD-Sample-System`](https://github.com/billy1125/Course-SAD-Sample-System) 的器材借用（equipment）

Python 3.11 + Flask + SQLite，伺服器端渲染，無前端框架、無 ORM。全部程式碼可以在
一到兩小時內讀完。

---

## 快速開始

```bash
conda activate flask
pip install -r requirements.txt
python app.py
```

開啟 http://localhost:4000

### Docker

```bash
docker compose up -d --build
docker compose down -v          # 停止並重置資料庫
```

---

## 種子帳號

資料庫初次建立時自動植入：

| email | 密碼 | 身份 |
|-------|------|------|
| `user@example.com` | `password123` | 一般使用者 |
| `admin@example.com` | `admin1234` | 管理員 |
| `disabled@example.com` | `disabled123` | 停用帳號（無法登入） |

另有 6 道種子餐點與 4 張種子訂單，覆蓋訂單狀態機的四個可達狀態。

---

## 功能

### 任何人（含訪客）

- 瀏覽今日菜單、價格與剩餘份數
- 依分類（主餐／附餐／飲料）篩選
- 申請帳號、登入

### 會員

- 線上訂餐：選取餐日期、時段、地點，一次可訂多道餐點
- 檢視、修改（限待確認）、取消自己的訂單
- 查看與編輯個人資料

### 管理員

- 餐點管理：新增、修改、下架
- 訂單審核：確認（扣減庫存）、拒絕、登記取餐、代為取消（回補庫存）
- 會員管理：清單、篩選、搜尋、啟用／停用、調整角色、軟刪除

---

## 訂單狀態機

```text
pending ──confirm──> confirmed ──complete──> completed
   │                     │
   ├──reject──> rejected └──cancel──> cancelled
   └──cancel──> cancelled
```

**庫存不變量：餐點的剩餘份數只在 `confirmed` 狀態被佔用。**

| 轉移 | 庫存 |
|------|------|
| 確認（pending → confirmed） | 扣減 |
| 取消已確認的訂單 | 回補 |
| 取消／拒絕待確認的訂單 | 不動（本來就沒佔用） |
| 登記取餐 | 不動（餐點已被取走） |

這條不變量是整個系統的核心。它保證：不會超賣、取消一定還原、剩餘份數恆等於
每日供應份數減去所有已確認訂單的份數。

---

## 資料模型

四張表：

```text
users ──1:N──> meal_orders ──1:N──> meal_order_items ──N:1──> meals
```

`meal_order_items` 是一張**帶屬性的關聯表**，額外攜帶 `quantity`、`unit_price`、
`subtotal`。三個值得注意的設計決策：

- **價格用整數（元）**，不用浮點數——總金額是明細的加總，浮點誤差會累積
- **明細存 `unit_price` 快照**——菜單調價不應該改變歷史訂單的金額
- **`total_amount` 由資料層依明細算出**，表單與 Blueprint 都不參與計算

---

## 測試

```bash
pytest              # 152 個測試
pytest -q
pytest tests/test_meal.py -v
```

| 檔案 | 案例數 |
|------|:--:|
| `test_auth.py` | 23 |
| `test_hub.py` | 11 |
| `test_profile.py` | 10 |
| `test_admin.py` | 30 |
| `test_meal.py` | 78 |

---

## 文件

| 文件 | 回答的問題 |
|------|-----------|
| [`document/system-spec.md`](document/system-spec.md) | 這個系統**是什麼**：功能、資料、規則、限制 |
| [`document/build-guide.md`](document/build-guide.md) | 這個系統**怎麼建**：15 個階段的步驟與驗收指令 |
| [`CLAUDE.md`](CLAUDE.md) | 開發者與 AI 助理**怎麼協作**：專案速查、模組職責 |
| [`rules/`](rules/) | 寫程式時**要遵守什麼**：路由、表單、SQL、CSS 的具體慣例 |
| [`document/meal.md`](document/meal.md) 等五份 | 單一子系統的**細部行為** |

---

## 教學重點

這個專案刻意留下一些「不完美」的地方，它們是教材而非疏漏：

- **`POST /profile/update` 缺少帳號有效性檢查（KI-03）。** 被停用的會員仍可修改自己
  的姓名。這示範技術債如何跨功能傳染——它讓管理員的停用功能部分失效。**請勿修補**，
  有測試在保護它
- **訂餐的守門則修補了。** 同一個缺陷，一個修一個不修，判準是「影響會不會外溢到當事人
  以外的人」：改自己的姓名只影響自己，佔用餐點份數會讓別人訂不到
- **三層權限檢查在每個路由開頭明碼重複寫出**，不抽象成裝飾器。讀者從任一路由的第一行
  就能讀出完整的守門條件
- **不用 ORM、不用前端框架、不用 Flask-Login、不用外鍵約束。** 每一項的理由與代價都
  寫在規格書 §2.2

完整的技術債清單（25 條，含影響、接受理由、修補方向）見規格書第 11 章。

---

## 參考專案

會員系統的來源 `SAD-Forum` 就在同一個資料夾底下（`../SAD-Forum/`），要比對「本系統
改了什麼、為什麼改」直接 diff 兩邊即可。

訂餐子系統的設計模式來源 `Course-SAD-Sample-System` **不在本儲存庫內**，需要對照時
自行 clone 到專案外：

```bash
git clone https://github.com/billy1125/Course-SAD-Sample-System.git
```
