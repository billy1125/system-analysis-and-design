# 品質異常回報管理系統（SAD-Quality）

## 這是什麼系統

某中型汽車零件射出成型廠的品保課，原本用紙本異常單記錄品質異常。這套系統在 2026-09-01 上線：品管人員登記現場回報的異常、指派責任單位，責任單位回覆處理對策後，由品管人員登錄對策並結案。

| 項目 | 內容 |
|---|---|
| 使用者 | 主管（品保課長與副課長）、品管人員（品管工程師與品管員）。現場班長與責任單位不使用這套系統 |
| 主要功能 | 未結案清單、登記異常單、指派與改派責任單位、登錄對策並結案、判定不成立、異常單查詢；主管另外負責產品、責任單位、異常類別與帳號維護 |
| 規模 | 9 個畫面、5 張資料表、2 種角色 |
| 技術 | 畫面用 HTML + CSS + JavaScript；資料存在 SQLite 資料庫檔 `database.db`；一支 Node.js 小程式 `server.js` 負責讀寫資料庫 |
| 執行位置 | 你自己的電腦（本機端），不需要網路 |

這是**期末題目的既有系統**，抽到這一題的組別要分析它，並依[修改需求提案書](../Change-Proposals/Quality-System-Change-Proposal.md)提出修改建議。

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

這套系統收在課程教材儲存庫裡，路徑是 `05-Final-Project-Topics/SAD-Quality/`，不是獨立的儲存庫。下面兩種方法擇一。

#### 方法 A：使用 Git

```bash
git clone https://github.com/billy1125/system-analysis-and-design.git
cd system-analysis-and-design/05-Final-Project-Topics/SAD-Quality
```

#### 方法 B：下載 ZIP

1. 開啟 <https://github.com/billy1125/system-analysis-and-design>，點選綠色 **Code** 按鈕 → **Download ZIP**
2. 解壓縮到你想放的位置，解壓縮後的資料夾名稱是「system-analysis-and-design-main」
3. 開啟終端機，切換到解壓縮資料夾底下的 `05-Final-Project-Topics/SAD-Quality`

```bash
# Windows（PowerShell）
cd "C:\Users\你的帳號\Downloads\system-analysis-and-design-main\05-Final-Project-Topics\SAD-Quality"

# macOS
cd "/Users/你的帳號/Downloads/system-analysis-and-design-main/05-Final-Project-Topics/SAD-Quality"
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
品質異常回報管理系統已啟動：http://localhost:4000
```

開啟瀏覽器，前往 <http://localhost:4000>，就會看到登入頁。

**使用期間這個終端機視窗不能關。** 要結束系統時，在終端機按 `Ctrl + C`。

### 4. 登入

所有測試帳號的密碼都是 `qc1234`，以員工編號登入。

| 員工編號 | 姓名 | 職稱 | 角色 | 狀態 |
|---|---|---|---|---|
| `E6001` | 鄭雅婷 | 品保課長 | 主管 | 啟用 |
| `E6002` | 江明軒 | 品保副課長 | 主管 | 啟用 |
| `E6101` | 吳承翰 | 品管工程師 | 品管人員 | 啟用 |
| `E6102` | 許佩珊 | 品管工程師 | 品管人員 | 啟用 |
| `E6103` | 邱家豪 | 品管員 | 品管人員 | 啟用 |
| `E6104` | 謝宛臻 | 品管員 | 品管人員 | 停用（用來測試停用帳號無法登入） |

用品管人員帳號登入會看到三個選單，用主管帳號登入會多出「產品」「責任單位」「異常類別」「帳號」四個選單。兩種角色都建議登入看看。

### 系統怎麼算「經過天數」

「經過天數」不是存在資料庫裡的值。還沒結案的單，是從發現日算到**你電腦的今天日期**；已結案或不成立的單，是從發現日算到結案日。種子資料的日期是固定的，所以隨著日期往後，未結案清單上的經過天數會越來越大，這是正常現象。

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
| `EADDRINUSE`、port 4000 已被使用 | 另一個程式（例如示範系統 `SAD-Visitor`）佔用了 4000。先關掉它，或改用別的連接埠：PowerShell 執行 `$env:PORT=4001; node server.js`，macOS 執行 `PORT=4001 node server.js`，再開 <http://localhost:4001> |
| 重新啟動後被登出 | 正常現象。登入狀態只存在 `server.js` 的記憶體裡，重新啟動就會清空 |
| 畫面排版被擠壓 | 系統只針對 1280 像素以上的桌上型電腦螢幕設計，不支援手機 |

---

## 資料夾結構

```text
SAD-Quality/
├── server.js            # 本機伺服器：提供畫面檔案與 API，讀寫 database.db
├── database.db          # SQLite 資料庫檔（含種子資料，進版控）
├── lib/                 # 共用程式
│   ├── db.js            #   開啟資料庫、交易、取得本機時間
│   ├── auth.js          #   密碼雜湊、登入狀態
│   ├── http.js          #   回傳 JSON、讀取請求內容、提供畫面檔案
│   ├── validate.js      #   欄位檢查與錯誤訊息
│   └── rules.js         #   經過天數、異常單號、登記與修改的檢查
├── routes/              # API，一個檔案對應一組功能
│   ├── auth.js          #   登入、登出
│   ├── issues.js        #   未結案清單、登記、指派、結案、查詢
│   ├── master.js        #   產品、責任單位、異常類別
│   └── admin.js         #   帳號
├── public/              # 畫面（瀏覽器端）
│   ├── *.html           #   9 個畫面
│   ├── css/style.css
│   └── js/              #   每個畫面一支程式，加上共用的 common.js
├── db/schema.sql        # 建立 5 張資料表的 SQL
└── scripts/create-db.js # 產生種子資料庫（維護者用）
```

畫面與程式的對應：

| 編號 | 畫面 | 畫面檔 | API 程式 |
|---|---|---|---|
| UI-01 | 登入頁 | `public/login.html` | `routes/auth.js` |
| UI-02 | 未結案清單（首頁） | `public/index.html` | `routes/issues.js` |
| UI-03 | 登記異常單 | `public/issue-new.html` | `routes/issues.js` |
| UI-04 | 異常單查詢 | `public/issues.html` | `routes/issues.js` |
| UI-05 | 異常單明細與處理 | `public/issue.html` | `routes/issues.js` |
| UI-06 | 產品管理 | `public/products.html` | `routes/master.js` |
| UI-07 | 責任單位管理 | `public/departments.html` | `routes/master.js` |
| UI-08 | 異常類別管理 | `public/defect-types.html` | `routes/master.js` |
| UI-09 | 帳號管理 | `public/users.html` | `routes/admin.js` |
