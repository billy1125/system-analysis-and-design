# 倉庫盤點管理系統（SAD-Inventory）

## 這是什麼系統

某中型辦公家具製造廠的資材倉庫，原本用 Excel 記帳面數量，盤點時印出料號清單手寫數量。這套系統在 2026-09-01 上線：倉管人員在系統上登錄入庫與出庫，系統維護每個料號的帳面數量；盤點時主管建立盤點單、指派盤點人員，盤點人員在系統上輸入實盤數量，主管結案時系統把帳面調整成實盤數量。

| 項目 | 內容 |
|---|---|
| 使用者 | 主管（倉庫課長與副課長）、倉管人員。年度盤點時來支援的其他部門同仁不使用這套系統 |
| 主要功能 | 盤點單清單、建立盤點單（全盤或抽盤）、輸入實盤數量、盤點結案並調整帳面、料號清單、登錄入庫與出庫、異動紀錄查詢；主管另外負責料號維護與帳號 |
| 規模 | 7 個畫面、5 張資料表、2 種角色 |
| 技術 | 畫面用 HTML + CSS + JavaScript；資料存在 SQLite 資料庫檔 `database.db`；一支 Node.js 小程式 `server.js` 負責讀寫資料庫 |
| 執行位置 | 你自己的電腦（本機端），不需要網路 |

這是**期末題目的既有系統**，抽到這一題的組別要分析它，並依[修改需求提案書](../Change-Proposals/Inventory-System-Change-Proposal.md)提出修改建議。

---

## 安裝與啟動

> 指令區塊中以 `#` 開頭的行是說明文字，不用輸入。

### 1. 安裝 Node.js

這套系統只需要 Node.js，不需要安裝 Python、Docker 或任何套件。

#### 先檢查電腦裡是否已經有 Node.js

你的電腦可能已經裝過 Node.js（例如其他課程或軟體裝的，或是跑過示範系統 `SAD-Visitor`）。開啟終端機（Windows 用 PowerShell，macOS 用「終端機」），輸入：

```bash
node --version
```

| 畫面顯示 | 怎麼做 |
|---|---|
| `v22.13.0` 或更新的版本號（例如 `v24.18.0`） | 已經可以用，跳到〈2. 取得專案〉 |
| 比 `v22.13.0` 舊的版本號（例如 `v20.11.1`） | 版本太舊，照下面的步驟安裝新版 |
| `node` 不是內部或外部命令、`command not found` | 還沒安裝，照下面的步驟安裝 |

#### 安裝 Node.js

1. 開啟 <https://nodejs.org/>，下載標示 **LTS** 的版本安裝。安裝過程全部用預設選項即可
2. 裝完後**把終端機關掉重開**，再輸入一次 `node --version`，顯示 `v22.13.0` 或更新的版本號就代表成功

版本比 22.13 舊的話，系統啟動時會顯示「無法載入 node:sqlite」。

### 2. 取得專案

這套系統收在課程教材儲存庫裡，路徑是 `05-Final-Project-Topics/SAD-Inventory/`，不是獨立的儲存庫。下面兩種方法擇一。

#### 方法 A：使用 Git

```bash
git clone https://github.com/billy1125/system-analysis-and-design.git
cd system-analysis-and-design/05-Final-Project-Topics/SAD-Inventory
```

#### 方法 B：下載 ZIP

1. 開啟 <https://github.com/billy1125/system-analysis-and-design>，點選綠色 **Code** 按鈕 → **Download ZIP**
2. 解壓縮到你想放的位置，解壓縮後的資料夾名稱是「system-analysis-and-design-main」
3. 開啟終端機，切換到解壓縮資料夾底下的 `05-Final-Project-Topics/SAD-Inventory`

```bash
# Windows（PowerShell）
cd "C:\Users\你的帳號\Downloads\system-analysis-and-design-main\05-Final-Project-Topics\SAD-Inventory"

# macOS
cd "/Users/你的帳號/Downloads/system-analysis-and-design-main/05-Final-Project-Topics/SAD-Inventory"
```

> 把範例路徑換成你自己的完整路徑。Windows 在檔案總管點網址列就能複製路徑；macOS 在 Finder 按住 `Option` 右鍵點資料夾，選「複製路徑名稱」。

#### 確認目前的位置

```bash
# Windows（PowerShell）
dir

# macOS
ls
```

列出的檔案中要看得到 `server.js` 與 `database.db`。看不到的話，代表位置不對。

### 3. 啟動系統

在系統資料夾執行：

```bash
node server.js
```

看到下面這行就代表啟動成功：

```text
倉庫盤點管理系統已啟動：http://localhost:8080
```

開啟瀏覽器，前往 <http://localhost:8080>，就會看到登入頁。

**使用期間這個終端機視窗不能關。** 要結束系統時，在終端機按 `Ctrl + C`。

### 4. 登入

所有測試帳號的密碼都是 `ic1234`，以員工編號登入。

| 員工編號 | 姓名 | 職稱 | 角色 | 狀態 |
|---|---|---|---|---|
| `E8001` | 溫志遠 | 倉庫課長 | 主管 | 啟用 |
| `E8002` | 蕭淑貞 | 倉庫副課長 | 主管 | 啟用 |
| `E8101` | 呂佳蓉 | 倉管員 | 倉管人員 | 啟用 |
| `E8102` | 施博凱 | 倉管員 | 倉管人員 | 啟用 |
| `E8103` | 范雅琳 | 倉管員 | 倉管人員 | 啟用 |
| `E8104` | 唐國維 | 倉管員 | 倉管人員 | 停用（用來測試停用帳號無法登入） |

用倉管人員帳號登入會看到「盤點單」「料號」「庫存異動」三個選單，用主管帳號登入會多出「帳號」一個選單，另外在盤點單清單看得到「建立盤點單」、在料號清單看得到新增與修改。兩種角色都建議登入看看。盤點中的 IC-2611-01 指派給范雅琳（`E8103`），只有她和主管能在這張單上輸入實盤數量。

### 盤點單上的「帳面數量」與「盤差」

盤點中的盤點單，明細上的帳面數量不是盤點當時記下來的值，而是**料號目前的帳面數量**；盤差是實盤數量減這個值。所以盤點之後只要有人登錄入庫或出庫，同一張盤點單再打開時，帳面數量與盤差就會跟著改變，這是這一版的設計。已結案的盤點單，盤差取結案時產生的盤點調整，之後不再變動。

---

## 資料玩壞了怎麼辦

你在系統裡做的每一個動作都會直接寫進 `database.db`。系統**沒有**「重設資料」的功能，要回到原本的種子資料：

1. 在終端機按 `Ctrl + C` 停止系統
2. 重新從 GitHub 下載 `database.db`，覆蓋系統資料夾裡的同名檔案
   - 用 Git 取得的：在系統資料夾執行 `git checkout -- database.db`
   - 用 ZIP 取得的：重新下載 ZIP，只取出裡面的 `database.db`
3. 再執行一次 `node server.js`

> 建議在動手測試之前，先把 `database.db` 複製一份備份，玩壞時直接拿備份覆蓋，比重新下載快。

---

## 常見問題

| 狀況 | 原因與處理 |
|---|---|
| `node` 不是內部或外部命令 | Node.js 沒裝好，或裝完沒有重開終端機 |
| 無法載入 node:sqlite | Node.js 版本太舊，要 22.13 以上 |
| 找不到資料庫檔 database.db | 終端機的位置不對，或 `database.db` 被刪掉了。見〈確認目前的位置〉與〈資料玩壞了怎麼辦〉 |
| `EADDRINUSE`、port 8080 已被使用 | 另一個程式（例如示範系統 `SAD-Visitor`）佔用了 8080。先關掉它，或改用別的連接埠：PowerShell 執行 `$env:PORT=8081; node server.js`，macOS 執行 `PORT=8081 node server.js`，再開 <http://localhost:8081> |
| 重新啟動後被登出 | 正常現象。登入狀態只存在 `server.js` 的記憶體裡，重新啟動就會清空 |
| 畫面排版被擠壓 | 系統只針對 1280 像素以上的桌上型電腦螢幕設計，不支援手機 |

---

## 資料夾結構

```text
SAD-Inventory/
├── server.js            # 本機伺服器：提供畫面檔案與 API，讀寫 database.db
├── database.db          # SQLite 資料庫檔（含種子資料，進版控）
├── lib/                 # 共用程式
│   ├── db.js            #   開啟資料庫、交易、取得本機時間
│   ├── auth.js          #   密碼雜湊、登入狀態
│   ├── http.js          #   回傳 JSON、讀取請求內容、提供畫面檔案
│   ├── validate.js      #   欄位檢查與錯誤訊息
│   └── rules.js         #   盤點單號、帳面數量與盤差、異動寫入
├── routes/              # API，一個檔案對應一組功能
│   ├── auth.js          #   登入、登出
│   ├── counts.js        #   盤點單清單、建立、輸入實盤數量、結案
│   ├── stock.js         #   料號、入庫與出庫、異動查詢
│   └── admin.js         #   帳號
├── public/              # 畫面（瀏覽器端）
│   ├── *.html           #   7 個畫面
│   ├── css/style.css
│   └── js/              #   每個畫面一支程式，加上共用的 common.js
├── db/schema.sql        # 建立 5 張資料表的 SQL
└── scripts/create-db.js # 產生種子資料庫（維護者用）
```

畫面與程式的對應：

| 編號 | 畫面 | 畫面檔 | API 程式 |
|---|---|---|---|
| UI-01 | 登入頁 | `public/login.html` | `routes/auth.js` |
| UI-02 | 盤點單清單（首頁） | `public/index.html` | `routes/counts.js` |
| UI-03 | 建立盤點單 | `public/count-new.html` | `routes/counts.js` |
| UI-04 | 盤點單明細與輸入 | `public/count.html` | `routes/counts.js` |
| UI-05 | 料號清單 | `public/items.html` | `routes/stock.js` |
| UI-06 | 庫存異動 | `public/moves.html` | `routes/stock.js` |
| UI-07 | 帳號管理 | `public/users.html` | `routes/admin.js` |
