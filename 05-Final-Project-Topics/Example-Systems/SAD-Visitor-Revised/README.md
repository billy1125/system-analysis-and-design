# 工廠訪客進出登記系統（修改版，SAD-Visitor-Revised）

## 這是什麼系統

這是[工廠訪客進出登記系統（現行版）](../SAD-Visitor/README.md)依兩項修改需求改完的版本：

| 修改需求 | 改了什麼 |
|---|---|
| CR-01 事前來訪預約與受訪員工確認 | 受訪員工可以登入系統，事先登錄訪客預約；接待員從「預約清單」直接報到；過了日期沒來的預約顯示「未到」 |
| CR-02 未離廠追蹤與疏散名單匯出 | 在廠清單分出「非今日報到」；可以補登實際離廠時間與原因；在廠名單可匯出 CSV；登記時記錄隨行人員姓名 |

| 項目 | 內容 |
|---|---|
| 使用者 | 接待員（大門警衛）、管理員（總務人員）、**受訪員工（新增）**。訪客不登入系統 |
| 規模 | 11 個畫面、7 張資料表、3 種角色 |
| 技術 | 與現行版相同：HTML + CSS + JavaScript、SQLite 資料庫檔 `database.db`、Node.js 小程式 `server.js` |
| 執行位置 | 你自己的電腦（本機端）。也可以裝在廠內伺服器，讓其他電腦連線（見〈讓其他電腦連線〉） |

這是期末範例報告第二部分「修改建議書」的實作示範，對應期末的**加分項目**（用 AI 開發工具依修改需求實際修改既有系統），不是必做。修改的理由與規格見[期末範例報告](../../04-Final-Project-Example-Reports/Final-Phase-Sample-Report.md)第二部分。

---

## 安裝與啟動

> 指令區塊中以 `#` 開頭的行是說明文字，不用輸入。

### 1. 安裝 Node.js

這套系統只需要 Node.js，不需要安裝 Python、Docker 或任何套件。

#### 先檢查電腦裡是否已經有 Node.js

你的電腦可能已經裝過 Node.js（例如其他課程或軟體裝的，或是跑過現行版 `SAD-Visitor`）。開啟終端機（Windows 用 PowerShell，macOS 用「終端機」），輸入：

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

這套系統收在課程教材儲存庫裡，路徑是 `05-Final-Project-Topics/SAD-Visitor-Revised/`，不是獨立的儲存庫。下面兩種方法擇一。

#### 方法 A：使用 Git

```bash
git clone https://github.com/billy1125/system-analysis-and-design.git
cd system-analysis-and-design/05-Final-Project-Topics/SAD-Visitor-Revised
```

#### 方法 B：下載 ZIP

1. 開啟 <https://github.com/billy1125/system-analysis-and-design>，點選綠色 **Code** 按鈕 → **Download ZIP**
2. 解壓縮到你想放的位置，解壓縮後的資料夾名稱是「system-analysis-and-design-main」
3. 開啟終端機，切換到解壓縮資料夾底下的 `05-Final-Project-Topics/SAD-Visitor-Revised`

```bash
# Windows（PowerShell）
cd "C:\Users\你的帳號\Downloads\system-analysis-and-design-main\05-Final-Project-Topics\SAD-Visitor-Revised"

# macOS
cd "/Users/你的帳號/Downloads/system-analysis-and-design-main/05-Final-Project-Topics/SAD-Visitor-Revised"
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
工廠訪客進出登記系統（修改版）已啟動：http://localhost:4000
```

開啟瀏覽器，前往 <http://localhost:4000>，就會看到登入頁。

**使用期間這個終端機視窗不能關。** 要結束系統時，在終端機按 `Ctrl + C`。

### 4. 登入

所有測試帳號的密碼都是 `visit1234`。

| 帳號 | 姓名 | 角色 | 狀態 |
|---|---|---|---|
| `admin` | 王總務 | 管理員 | 啟用 |
| `guard01` | 陳警衛 | 接待員 | 啟用 |
| `guard02` | 林警衛 | 接待員 | 啟用 |
| `guard03` | 張警衛 | 接待員 | 停用（用來測試停用帳號無法登入） |
| `e1001` | 李志明 | 受訪員工 | 啟用 |
| `e1002` | 黃美玲 | 受訪員工 | 啟用 |
| `e1005` | 鄭大偉 | 受訪員工 | 啟用 |

用 `guard01` 登入會看到五個選單，用 `admin` 登入會多出員工名單、訪客證、帳號三個選單，用 `e1001` 登入只會看到「我的預約」。

### 5. 試一次從預約報到

種子資料的預約日期都是固定的，日期一過就會顯示「未到」。要看到「今日預約」，自己先登錄一筆：

1. 用 `e1001` 登入，在「我的預約」新增一筆**今天**的預約，訪客手機填 `0912345678`（種子資料裡的張家豪）
2. 登出，改用 `guard01` 登入，開「預約清單」，今天的那筆會有「報到」按鈕
3. 按「報到」，來訪登記頁會帶入受訪員工、事由與訪客資料，選一張訪客證、輸入隨行人員姓名後送出
4. 再用 `e1001` 登入，那筆預約會變成「已報到」

在廠清單的「非今日報到」區會看到 11/2 進廠的陳俊宏，可以拿來試「補登離廠」。

---

## 讓其他電腦連線

CR-01 要讓受訪員工在自己的座位上使用，系統要裝在一台大家都連得到的電腦上。在那台電腦上這樣啟動：

```bash
# Windows（PowerShell）
$env:HOST="0.0.0.0"; node server.js

# macOS
HOST=0.0.0.0 node server.js
```

其他電腦用 `http://那台電腦的 IP 位址:4000` 連線。Windows 第一次這樣啟動時，防火牆可能會詢問是否允許連線，選「允許」。**上課練習時不需要這樣做**，在自己的電腦上用 `localhost` 就能試所有功能。

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
| `EADDRINUSE`、port 4000 已被使用 | 另一個程式（例如期中的範例系統）佔用了 4000。先關掉它，或改用別的連接埠：PowerShell 執行 `$env:PORT=4001; node server.js`，macOS 執行 `PORT=4001 node server.js`，再開 <http://localhost:4001> |
| 重新啟動後被登出 | 正常現象。登入狀態只存在 `server.js` 的記憶體裡，重新啟動就會清空 |
| 畫面排版被擠壓 | 系統只針對 1280 像素以上的桌上型電腦螢幕設計，不支援手機 |

---

## 資料夾結構

```text
SAD-Visitor-Revised/
├── server.js            # 本機伺服器：提供畫面檔案與 API，讀寫 database.db
├── database.db          # SQLite 資料庫檔（含種子資料，進版控）
├── lib/                 # 共用程式
│   ├── db.js            #   開啟資料庫、交易、取得本機時間
│   ├── auth.js          #   密碼雜湊、登入狀態
│   ├── http.js          #   回傳 JSON、讀取請求內容、提供畫面檔案
│   └── validate.js      #   欄位檢查與錯誤訊息
├── routes/              # API，一個檔案對應規格書的一組功能需求
│   ├── auth.js          #   FR-AUTH 登入、登出
│   ├── onsite.js        #   FR-OUT  在廠清單、離廠、補登離廠、匯出 CSV
│   ├── register.js      #   FR-REG  查詢訪客、來訪登記
│   ├── visits.js        #   FR-QRY  來訪紀錄查詢、明細、修改
│   ├── visitors.js      #   FR-VIS  訪客資料
│   ├── appointments.js  #   CR-01   我的預約、預約清單
│   └── admin.js         #   FR-ADM  員工名單、訪客證、帳號
├── public/              # 畫面（瀏覽器端）
│   ├── *.html           #   11 個畫面，對應規格書 UI-01～UI-11
│   ├── css/style.css
│   └── js/              #   每個畫面一支程式，加上共用的 common.js
├── db/schema.sql        # 建立 7 張資料表的 SQL
└── scripts/create-db.js # 產生種子資料庫（維護者用，見下方說明）
```

畫面與程式的對應：

| 規格書編號 | 畫面 | 畫面檔 | API 程式 |
|---|---|---|---|
| UI-01 | 登入頁 | `public/login.html` | `routes/auth.js` |
| UI-02 | 在廠訪客清單（首頁） | `public/index.html` | `routes/onsite.js` |
| UI-03 | 來訪登記頁 | `public/register.html` | `routes/register.js` |
| UI-04 | 來訪紀錄查詢頁 | `public/visits.html` | `routes/visits.js` |
| UI-05 | 來訪明細與修改頁 | `public/visit.html` | `routes/visits.js` |
| UI-06 | 訪客資料頁 | `public/visitors.html` | `routes/visitors.js` |
| UI-07 | 員工名單頁 | `public/employees.html` | `routes/admin.js` |
| UI-08 | 訪客證管理頁 | `public/passes.html` | `routes/admin.js` |
| UI-09 | 帳號管理頁 | `public/users.html` | `routes/admin.js` |
| UI-10 | 預約清單（新增） | `public/appointments.html` | `routes/appointments.js` |
| UI-11 | 我的預約（新增） | `public/my-appointments.html` | `routes/appointments.js` |

### 給維護者：重新產生種子資料庫

`scripts/create-db.js` 會依 `db/schema.sql` 與規格書〈5.5〉的種子資料建立 `database.db`。`database.db` 已存在時程式會拒絕執行，要重建得先自己刪掉舊檔：

```bash
node scripts/create-db.js
```

修課同學不需要用這支程式，資料玩壞時照〈資料玩壞了怎麼辦〉重新下載即可。
