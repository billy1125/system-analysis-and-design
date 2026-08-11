# 校園宿舍報修系統

系統分析與設計課程的教學專案。以 Flask + SQLite 實作一套完整的宿舍設施報修流程，涵蓋會員登入與管理、報修申報、派工、處理、結案與稽核軌跡。

---

## 快速開始

```bash
conda activate flask
pip install -r requirements.txt
python app.py
```

開啟 http://localhost:4000

首次啟動會自動建立 `database.db`，並植入四個種子帳號與六張種子報修單。

### 種子帳號

| Email | 密碼 | 身份 |
|-------|------|------|
| `user@example.com` | `password123` | 住宿生 陳小明（A 棟 301） |
| `admin@example.com` | `admin1234` | 宿舍管理員 |
| `staff@example.com` | `staff1234` | 維修組 王師傅（亦為管理員） |
| `disabled@example.com` | `disabled123` | 已停用的帳號（用於示範停用行為） |

> ⚠️ 這些密碼公開於原始碼中，且種子帳號的 bcrypt cost 刻意調低以加速測試。**本系統不得部署到公開網際網路。**

### Docker

```bash
docker compose up -d --build     # http://localhost:4000
docker compose down -v           # 停止並刪除資料
```

### 測試

```bash
pytest                           # 188 個案例，約 2.7 秒
pytest tests/test_repair.py -v
pytest -k "full_lifecycle"
```

---

## 功能

### 住宿生

- 申請帳號、登入（含圖形驗證碼）
- 維護個人資料：姓名、顯示名稱、宿舍棟別、房號、聯絡電話
- **申報報修**：標題、維修類別、優先等級、地點、故障情形
- 查詢自己的報修單（狀態篩選、分頁）
- 在待受理階段修改或取消報修單
- 與管理員在報修單上來回回覆

### 管理員

- 上述全部功能
- **報修管理**：全部報修單清單、六個狀態的即時計數、篩選與搜尋
- **派工**：指定承辦人（須為啟用中的管理員）
- **狀態流轉**：開始處理 → 登記完成；或退件、重新開啟
- 刪除報修單（連同其所有處理紀錄）
- **會員管理**：清單、篩選、搜尋、啟用／停用、調整角色、軟刪除

---

## 報修單狀態

```
pending ──派工──► assigned ──開始處理──► in_progress ──完成──► completed
   │                  │                                            │
   ├──退件──► rejected │                                            │
   └──取消──► cancelled ◄──取消──┘                                  │
   ▲                                                               │
   └────────────────────── 重新開啟 ────────────────────────────────┘
```

| 狀態 | 中文 | 誰可以離開這個狀態 |
|------|------|------------------|
| `pending` | 待受理 | 管理員（派工、退件）／申報人（修改、取消） |
| `assigned` | 已派工 | 管理員（開始處理）／申報人（取消） |
| `in_progress` | 處理中 | 管理員（登記完成） |
| `completed` | 已完成 | 管理員（重新開啟） |
| `rejected` | 已退件 | — |
| `cancelled` | 已取消 | — |

**每一次狀態異動都會在處理歷程中留下一筆紀錄**，記錄誰、在何時、做了什麼。這條稽核軌跡是本系統的核心。

---

## 技術棧

| 層 | 技術 |
|----|------|
| 語言 | Python 3.11 |
| Web 框架 | Flask + Blueprint |
| 樣板 | Jinja2（伺服器端渲染） |
| 資料庫 | SQLite（WAL 模式，三張資料表） |
| 密碼 | bcrypt |
| 驗證碼 | captcha |
| 測試 | pytest + pytest-flask |
| 部署 | Docker + Docker Compose |

不用 ORM、不用前端框架、不用狀態機函式庫、不用 Flask-Login——理由見規格書 §2.2。

---

## 專案結構

```
├── app.py / utils.py / pytest.ini
├── db/              資料存取層（connection、users、repair）
├── blueprints/      auth、hub、profile、admin、repair
├── templates/       11 個樣板
├── static/          6 個 CSS
├── tests/           188 個測試案例
├── rules/           開發規範
└── document/        規格書、建置流程書、子系統文件
```

系統分成兩塊：**會員登入與管理**（auth / hub / profile / admin 四個 Blueprint 與 `users` 表），以及**報修子系統**（狀態機、資料範圍權限與稽核軌跡）。

---

## 文件

| 文件 | 內容 |
|------|------|
| [`document/system-spec.md`](document/system-spec.md) | **系統規格書**：功能需求、資料模型、狀態機、權限、驗證規則、30 條已知技術債、測試策略 |
| [`document/build-guide.md`](document/build-guide.md) | **建置流程書**：14 個階段，每階段含產出檔案、關鍵決策與可直接執行的驗收指令 |
| [`CLAUDE.md`](CLAUDE.md) | 專案速查：路由總表、狀態機、權限、種子資料、開發原則 |
| [`rules/`](rules/) | Blueprint 與資料層的撰寫規範 |
| [`document/auth.md`](document/auth.md) 等 | 各子系統的細部行為 |

初次接觸建議的閱讀順序：本檔 → `document/system-spec.md` §1（定位）與 §7（狀態機）→ `db/repair.py` → `blueprints/repair/__init__.py`。

---

## 三個教學重點

這套系統相對於一般的 CRUD 教學專案，多了三件事：

1. **狀態機**——一張報修單在六個狀態之間依固定規則移動。不合法的移動必須被擋下，而且合法性判斷寫在 SQL 的 `WHERE` 子句裡，不是先讀出來再用 Python 比對
2. **資料範圍權限（row-level）**——同樣是合法登入的使用者，看得到的報修單不同。這是「路由能不能進」無法表達的權限
3. **稽核軌跡**——每一次狀態異動都留下誰、在何時、做了什麼。歷程本身就是報修系統一半的價值

---

## 已知限制

本系統為教學用途，刻意保留了 30 條已知技術債（見規格書第 12 章），其中影響最明顯的三條：

- **所有時間顯示為 UTC**，在台灣使用時每個時間都慢 8 小時（KI-25）
- **無 CSRF 防護**（KI-01）
- **`debug=True` 且綁定 `0.0.0.0`**（KI-09）

**本系統不得部署到公開網際網路。**
