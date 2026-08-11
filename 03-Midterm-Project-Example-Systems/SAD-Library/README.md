# 校園小型圖書借閱系統

以 Flask + SQLite 實作的教學用圖書借閱系統，供系統分析與設計課程使用。

讀者可以查詢館藏、借書、續借、還書，在書被借光時預約候補；
館員可以維護書目與館藏複本、代為還書登記、管理借閱證帳號。

---

## 快速開始

```bash
pip install -r requirements.txt
python app.py
```

開啟 <http://localhost:4000>。首次啟動會自動建立資料表並植入種子資料。

### 種子帳號

| 身分 | 帳號 | 密碼 |
|------|------|------|
| 讀者 | `user@example.com` | `password123` |
| 館員 | `admin@example.com` | `admin1234` |
| 停用中（測試用） | `disabled@example.com` | `disabled123` |

### 種子館藏

10 筆書目、18 本複本，涵蓋六個分類。其中四筆只有一本複本，
方便體驗「借光 → 預約 → 遞補」的完整流程。

---

## 功能

### 讀者

- 查詢館藏：搜尋書名／作者／ISBN、依分類篩選、看複本在架狀況
- 借書：每人同時 5 冊，借期 14 天
- 續借：每筆 1 次，延長 14 天。逾期或有他人預約時不可續借
- 還書：可自行歸還，也可請館員代為登記
- 預約：書被借光時排隊候補，可查看順位；有人還書時會轉為「可取書」
- 個人資料：修改姓名與顯示名稱

### 館員

- 上述全部，加上：
- 館藏維護：新增／修改／下架書目，新增／調整狀態／報廢複本
- 借閱管理：全館借閱紀錄、逾期清單、還書登記
- 預約管理：全館預約佇列、代為取消
- 會員管理：帳號清單、啟用／停用、角色調整、軟刪除

---

## 借閱規則

| 規則 | 值 |
|------|:--:|
| 借期 | 14 天 |
| 每人同時借閱上限 | 5 冊 |
| 續借次數上限 | 每筆 1 次 |
| 每次續借延長 | 14 天 |

其他限制：

- 有逾期未還時，不能再借任何書
- 同一書目已借且未還時，不能再借第二本
- 已逾期或已被他人預約的書，不能續借
- 尚有可借複本時不能預約（直接借即可）
- **預約不保留書本**，「可取書」只代表輪到你了，取書仍為先到先得

逾期不罰款，只封鎖借閱。歸還後立刻解除。

---

## 技術棧

| 層次 | 技術 |
|------|------|
| 語言 | Python 3.11 |
| Web | Flask（7 個 Blueprint） |
| 樣板 | Jinja2 |
| 資料庫 | SQLite（WAL 模式） |
| 密碼 | bcrypt |
| 驗證碼 | captcha |
| 前端 | 原生 HTML + CSS，無框架、無建置流程 |
| 測試 | pytest + pytest-flask（218 個測試） |
| 部署 | Docker + docker compose |

---

## 專案結構

```
app.py                入口，註冊 7 個 Blueprint
utils.py              共用小工具

db/                   全部 SQL 與借閱業務規則
blueprints/           7 個子系統
templates/            Jinja2 樣板
static/               8 個 CSS
rules/                開發慣例
document/             系統規格書與建置流程書
tests/                218 個測試
```

五張資料表：`users`、`books`、`book_copies`、`loans`、`reservations`。

---

## 測試

```bash
pytest                          # 全部 218 個
pytest tests/test_loans.py -v   # 單一子系統
pytest -k "overdue"             # 逾期相關
```

每個測試函式使用獨立的暫存資料庫，測試之間沒有狀態共用。

---

## Docker

```bash
docker compose up --build
curl localhost:4000/health      # OK
```

資料庫存放於具名 volume，容器重建不會遺失。

環境變數：

| 變數 | 預設值 | 說明 |
|------|--------|------|
| `SECRET_KEY` | `dev-secret-key-change-in-production` | **正式環境必須覆寫** |
| `DB_PATH` | `database.db` | SQLite 檔案路徑 |

---

## 文件

| 文件 | 內容 |
|------|------|
| [`document/system-spec.md`](document/system-spec.md) | 系統規格書：功能、資料模型、規則、已知限制 |
| [`document/build-guide.md`](document/build-guide.md) | 建置流程書：14 個階段，每階段含驗收指令 |
| [`CLAUDE.md`](CLAUDE.md) | 專案速查地圖 |
| [`rules/`](rules/) | 開發慣例（Blueprint 與資料庫） |
| [`tests/CLAUDE.md`](tests/CLAUDE.md) | 測試撰寫指引 |

各子系統另有 `blueprints/<name>/CLAUDE.md` 說明其職責與設計決策。

---

## 三個設計層級的決定

- **可借數量即時彙總，不存欄位** — 在架冊數由 `book_copies` 算出來，不會與實際狀況脫節
- **逾期在查詢時推導，不用狀態欄位** — 時間往前走，狀態自動正確，不需要排程去更新
- **交易子系統一律檢查帳號有效性** — 停用帳號持有舊 session 也借不到書

三者的理由與代價見規格書 §11.5。

---

## 已知限制

系統刻意維持教學規模，以下功能明確不包含：罰款計算、館際互借、條碼掃描、
郵件通知、採購編目、統計報表、預約保留架。

安全性方面尚未實作 CSRF token、登入失敗次數限制、Cookie 安全旗標。
完整的技術債清單（20 多項，含「為何修」與「為何不修」的判準）見規格書 §11。

**正式部署前必須**：覆寫 `SECRET_KEY`、關閉 `app.py` 中的 `debug=True`、
改用 WSGI 伺服器。
