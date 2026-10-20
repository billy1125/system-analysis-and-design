# 校園宿舍報修系統（SAD-Dormitory-Repair）

## 專案摘要

115-1 系統分析課程範例系統。主要提供元智大學工業工程與管理學系課程之用，這是一個範例的資訊系統，學生可進行系統分析工作的練習。

本系統聚焦在**宿舍設施報修的完整流程**：申報、派工、處理、結案，並在每一次狀態異動時留下處理歷程；會員帳號與管理子系統則作為身分基礎。「住宿生為什麼看不到別人的報修單」「一張已完工的單被重新開啟之後，上次的處理紀錄還在不在」這類問題，只有在報修流程與帳號治理同時存在時才問得出來。

五個子系統、三張資料表、188 個自動化測試。

系統分成兩塊：會員帳號與管理（auth / hub / profile / admin），以及報修的業務流程（repair）。

---

## 系統文件

各子系統的詳細功能說明請參閱以下文件，請同學好好參考：

| 子系統 | 文件連結 |
|--------|----------|
| Hub 首頁 | [document/hub.md](document/hub.md) |
| 登入與帳號 | [document/auth.md](document/auth.md) |
| 個人資料管理 | [document/profile.md](document/profile.md) |
| 報修 | [document/repair.md](document/repair.md) |
| 會員管理（管理員） | [document/admin.md](document/admin.md) |

另有兩份完整的設計文件：

| 文件 | 說明 |
|------|------|
| [document/system-spec.md](document/system-spec.md) | 系統規格書：功能需求、資料模型、狀態機、權限、驗證規則、已知技術債 |
| [document/build-guide.md](document/build-guide.md) | 建置流程書：從空目錄到可執行的 14 個階段 |

初次接觸建議的閱讀順序：本檔 → 規格書 §1（定位）與 §7（狀態機）→ `db/repair.py` → `blueprints/repair/__init__.py`。

---

## 同學請注意

除了以上的系統文件與兩份設計文件，請在觀察這個範例系統時，先不要把重點放在程式語法或細節錯誤上，而是要理解「**系統如何運作**」。

當你能說明「**資料從哪裡來、經過哪些處理、最後到哪裡去**」，就代表你已經掌握這個系統最基本的運作方式。

建議你依照以下內容進行觀察與分析：

|  | 觀察重點 | 具體問題 | 學習目標 |
|------|----------|----------|----------|
| 實際操作系統 | 從使用者角度理解功能 | 系統有哪些頁面、按鈕、輸入框？使用者輸入後畫面有何變化？ | 理解「使用者做了什麼」與「系統回應了什麼」 |
| 輸入→處理→輸出 | 用資料流架構整理每個功能 | 資料從哪裡來？程式對資料做了什麼？結果顯示或儲存在哪裡？ | 掌握資料流，避免一開始就陷入程式細節 |
| UI 與程式連動 | 觀察畫面與程式的對應關係 | 輸入框、按鈕如何對應資料？按下後程式執行了哪些動作？ | 理解「畫面操作」如何觸發「程式中的處理」 |
| 函式的角色 | 理解每個函式負責的工作 | 函式名稱代表什麼？接收什麼輸入？回傳什麼輸出？ | 把函式視為系統中負責單一任務的小單元 |
| 函式關係與資料儲存 | 追蹤函式呼叫鏈與資料流向 | 函式在哪裡被呼叫？資料接著流向哪裡？何時、在哪裡儲存？Schema 有哪些欄位？ | 理解資料流、函式分工、UI 互動與儲存邏輯 |
| 主檔與明細 | 觀察一張報修單如何拆成兩張表 | 為什麼報修單要拆成 `repair_requests` 與 `repair_logs`？如果只用一張表，歷程會怎樣？ | 理解企業系統中最常見的資料結構 |
| 狀態機 | 追蹤一張報修單的狀態變化 | 一張單從申報到結案經過哪些狀態？哪些轉移是被允許的？誰可以觸發？限制寫在哪裡？ | 理解 state 與狀態轉移的合法性檢查 |
| 資料範圍權限 | 比較不同使用者看得到的資料 | 同樣是登入的住宿生，為什麼看不到別人的報修單？這個檢查在哪裡做？ | 區分「能不能進這一頁」與「這一筆是不是你的」 |
| 稽核軌跡 | 注意每次操作留下什麼紀錄 | 派工、開始處理、完成之後，處理歷程多了什麼？報修單本身又記住了什麼？ | 理解「單據記得現在，歷程記得經過」 |
| 資料狀態改變 | 注意操作前後資料如何變化 | 管理員停用一個帳號後，他的報修單還在嗎？該帳號還能做什麼、不能做什麼？ | 理解 state、資料更新與畫面同步的概念 |
| 錯誤處理 | 觀察系統對錯誤輸入的反應 | 欄位空白、退件不填原因、修改已派工的單時系統如何回應？錯誤訊息由誰產生？ | 理解驗證、例外處理與使用者回饋 |
| 前後端與資料庫分工 | 辨別三層架構各自的責任 | 前端、後端、資料庫分別負責什麼工作？隱藏一個按鈕等於禁止那個操作嗎？ | 建立系統架構的基本概念，不只看零散的程式碼 |
| 用自己的話說明 | 將觀察轉化為理解並表達出來 | 系統解決什麼問題？資料如何流動？要修改某功能需改哪些地方？ | 將觀察轉為理解，作為小組討論、作業報告與程式修改的基礎 |

---

## 技術棧

- **後端**：Python 3 / Flask / Blueprint
- **前端**：Jinja2 Template / 原生 HTML / CSS（無前端框架）
- **資料庫**：SQLite（WAL 模式，無 ORM）
- **驗證碼**：captcha（ImageCaptcha，伺服器端產生）
- **密碼加密**：bcrypt（註冊 cost=10；種子帳號 cost=4，見規格書 KI-10）
- **測試**：pytest + pytest-flask

不用 ORM、不用前端框架、不用狀態機函式庫、不用 Flask-Login，理由見規格書 §2.2。

---

## 需要的套件

| 套件 | 用途 |
|------|------|
| `flask` | Web 框架 |
| `bcrypt` | 密碼雜湊加密 |
| `captcha` | 伺服器端產生圖形驗證碼 |
| `pytest`、`pytest-flask` | 自動化測試（僅執行測試時需要） |

---

## 基本安裝與執行方式

安裝分成三步：開啟終端機、取得專案檔案、選一種方式把系統跑起來。系統跑起來之後，用瀏覽器開啟 <http://localhost:4000> 就能操作。

### 0. 開啟終端機

後面所有指令都在「終端機」裡輸入，每輸入一行就按一次 Enter 執行。

| 作業系統 | 開啟方式 |
|----------|----------|
| Windows | 開始功能表搜尋「PowerShell」或「終端機」，點選開啟 |
| macOS | 按 `Command + 空白鍵` 開啟 Spotlight，輸入「終端機」（Terminal）後按 Enter |

> 指令區塊中以 `#` 開頭的行是說明文字，不用輸入。

### 1. 取得專案

這套系統收在課程教材儲存庫裡，路徑是 `03-Midterm-Project-Example-Systems/SAD-Dormitory-Repair/`，不是獨立的儲存庫。下面兩種方法擇一。

#### 方法 A：使用 Git

**前置需求**：已安裝 [Git](https://git-scm.com/)，Windows、macOS、Linux 均支援。

1. 決定你的專案放在電腦的位置（例如桌面或 Documents）
2. 開啟終端機，切換到該資料夾後執行：

```bash
git clone https://github.com/billy1125/system-analysis-and-design.git
cd system-analysis-and-design/03-Midterm-Project-Example-Systems/SAD-Dormitory-Repair
```

#### 方法 B：下載 ZIP（如果你不會用 Git 的話）

1. 開啟課程教材儲存庫的 GitHub 頁面 <https://github.com/billy1125/system-analysis-and-design>，點選綠色 **Code** 按鈕 → **Download ZIP**
2. 將下載的壓縮檔解壓縮到你想放的位置（例如桌面或 Documents），解壓縮之後資料夾名稱應該是「system-analysis-and-design-main」
3. 開啟終端機，切換到解壓縮資料夾底下的 `03-Midterm-Project-Example-Systems/SAD-Dormitory-Repair`

**如何找到完整路徑？**

- **Windows**：在檔案總管中開啟該資料夾，點選上方網址列，即可看到並複製完整路徑。
- **macOS**：在 Finder 中找到該資料夾，按住 `Option` 鍵並右鍵點選，選擇「複製路徑名稱」。

取得路徑後，在終端機輸入 `cd`、一個空格，再貼上路徑：

```bash
# Windows（PowerShell）
cd "C:\Users\billy\Downloads\system-analysis-and-design-main\03-Midterm-Project-Example-Systems\SAD-Dormitory-Repair"

# macOS / Linux
cd "/Users/billy/Downloads/system-analysis-and-design-main/03-Midterm-Project-Example-Systems/SAD-Dormitory-Repair"
```

> 將上方範例路徑替換為你自己複製的完整路徑。路徑前後的雙引號要保留，路徑裡有空格（例如 `My Documents`）時才不會出錯。

#### 確認目前的位置

切換之後，先確認終端機真的在系統資料夾裡：

```bash
# Windows（PowerShell）
dir

# macOS / Linux
ls
```

列出的檔案中要看得到 `app.py`、`requirements.txt` 與 `docker-compose.yml`。看不到的話，代表位置不對，後面的指令都會失敗。

**之後每次開新的終端機，都要先 `cd` 回這個資料夾**，再執行下一節的指令。

### 2. 建置與啟動系統

這個範例系統提供兩種方式，擇一即可，建議使用方法 A。

| | 方法 A：Docker | 方法 B：本機 Python |
|---|---|---|
| 要先安裝 | Docker Desktop | Python 3.11 |
| 優點 | 不用處理 Python 版本與套件，每個人的執行環境都一樣 | 不必安裝 Docker |
| 資料庫檔的位置 | 容器裡（要先複製出來才看得到，見〈直接檢視資料庫〉） | 系統資料夾裡的 `database.db` |

#### 方法 A：以 Docker 建置

**前置需求**：已安裝 Docker Desktop。還沒安裝的話，先照 [Docker Desktop 安裝指南：Windows 與 macOS](../Docker-Desktop-Installation-Guide.md) 完成安裝，並做完該文件〈4. Windows 與 macOS 共用的安裝驗證〉。

**每次使用前，都要先開啟 Docker Desktop 應用程式**，等它顯示引擎已啟動再輸入指令。沒開的話，指令會出現無法連線到 Docker daemon 的錯誤。

##### 安裝（第一次使用）

確認終端機位在系統資料夾裡（見〈確認目前的位置〉），執行：

```bash
docker compose up -d --build
```

第一次執行要下載 Python 映像並安裝套件，需要網路連線，大約要等幾分鐘。完成後確認系統有在執行：

```bash
docker compose ps
```

`STATUS` 欄顯示 `Up` 就代表啟動成功。開啟瀏覽器前往「[http://localhost:4000](http://localhost:4000)」。

##### 日常執行

之後每次要啟動系統，先開啟 Docker Desktop，在系統資料夾裡執行（不需要重新建置）：

```bash
docker compose up -d
```

開啟後，使用任何一種瀏覽器連到「[http://localhost:4000](http://localhost:4000)」

##### 停止與清除

| 指令 | 說明 |
|------|------|
| `docker compose stop` | 暫停服務（資料保留，下次可繼續） |
| `docker compose down` | 停止並移除容器（資料保留） |
| `docker compose down -v` | 停止並**刪除所有資料**（資料庫重置為初始狀態） |
| `docker compose down --rmi all` | 停止、移除容器，並**刪除映像**（釋放磁碟空間） |
| `docker compose down -v --rmi all` | 停止、移除容器、**刪除映像**及**所有資料**（完全清除） |

> 系統的資料（帳號、報修單、處理歷程）儲存在 Docker 的 named volume 中，`stop` 或 `down` 都不會刪除資料；只有加上 `-v` 才會完全清除，下次啟動時回復為四個種子帳號與六張種子報修單的初始狀態。加上 `--rmi all` 才會同時刪除本機的 Docker 映像。

> 六套範例系統都使用 4000 這個連接埠，**同一時間只能啟動一套**。要換另一套之前，先到原本那套的資料夾執行 `docker compose stop`。各套的資料存在各自的 volume，不會互相影響。

---

#### 方法 B：手動本機安裝（需要 Python 3 環境）

**前置需求**：已安裝 Python 3.11。Docker 映像用的是 3.11，本機也以 3.11 測試過；其他版本沒有測試過。

##### 步驟 1：確認 Python 已安裝

```bash
# Windows（PowerShell）
python --version

# macOS / Linux
python3 --version
```

應顯示 `Python 3.11.x`。如果顯示找不到指令，或 Windows 跳出 Microsoft Store，代表還沒安裝 Python：到 <https://www.python.org/downloads/> 下載 3.11 版安裝。Windows 安裝程式的第一個畫面**要勾選「Add python.exe to PATH」**，裝完把終端機關掉重開，再檢查一次。

##### 步驟 2：建立並啟用虛擬環境

虛擬環境（virtual environment）是專屬這個專案的 Python 套件空間，裝進去的套件不會影響電腦上的其他程式。下面兩種工具擇一。

**用 Python 內建的 venv**（不用另外安裝東西）：

```bash
# Windows（PowerShell）
python -m venv .venv
.venv\Scripts\Activate.ps1

# macOS / Linux
python3 -m venv .venv
source .venv/bin/activate
```

**已經裝了 Anaconda 或 Miniconda 的話，也可以用 conda**：

```bash
conda create -n flask python=3.11    # 只有第一次需要
conda activate flask
```

啟用成功後，終端機每一行的最前面會出現 `(.venv)` 或 `(flask)`。之後的步驟在這個狀態下執行，macOS 也直接打 `python` 即可。

> Windows 執行 `Activate.ps1` 時，若出現「因為這個系統上已停用指令碼執行」，先執行下面這行，再重新啟用一次：
>
> ```powershell
> Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
> ```

##### 步驟 3：安裝相依套件

```bash
pip install -r requirements.txt
```

最後出現 `Successfully installed ...` 就代表安裝完成。已經裝過的套件會顯示 `Requirement already satisfied`，也是正常的。

##### 步驟 4：啟動伺服器

```bash
python app.py
```

畫面出現 `Running on http://127.0.0.1:4000` 就代表啟動成功，開啟瀏覽器前往「[http://localhost:4000](http://localhost:4000)」。同一個畫面上的 `WARNING: This is a development server` 是 Flask 的固定提醒，不影響使用。

伺服器執行期間，這個終端機視窗要保持開著。要停止系統，在終端機按 `Ctrl + C`。

##### 之後每次啟動

套件不用重裝，只要做三件事：`cd` 到系統資料夾、啟用虛擬環境（步驟 2 的第二行，或 `conda activate flask`）、執行 `python app.py`。

##### 重置資料庫

先按 `Ctrl + C` 停止伺服器，刪掉資料庫檔後重新啟動。系統找不到資料庫檔時，會重新建立資料表並植入種子資料：

```bash
# Windows（PowerShell）
Remove-Item database.db
python app.py

# macOS / Linux
rm database.db
python app.py
```

### 3. 安裝時常見的問題

| 狀況 | 原因與處理 |
|------|------------|
| `docker` 不是可辨識的指令，或 `command not found: docker` | Docker Desktop 沒有安裝，或安裝後還沒啟動過。見 [Docker Desktop 安裝指南：Windows 與 macOS](../Docker-Desktop-Installation-Guide.md)〈5〉 |
| 出現 `Cannot connect to the Docker daemon` 或 `error during connect` | Docker Desktop 沒有開。開啟應用程式，等引擎啟動後再執行一次 |
| 出現 `no configuration file provided: not found` | 終端機不在系統資料夾裡，回〈確認目前的位置〉 |
| Windows 輸入 `python` 後跳出 Microsoft Store | 還沒安裝 Python，見方法 B 步驟 1 |
| `No module named 'flask'`（或 `bcrypt`、`captcha`） | 虛擬環境沒有啟用，或套件還沒安裝。啟用虛擬環境後重新執行 `pip install -r requirements.txt` |
| 出現 `port is already allocated`、`Address already in use` 等連接埠被佔用的訊息 | 4000 連接埠已被佔用，通常是另一套範例系統還開著。先停掉它：Docker 用 `docker compose stop`，本機在原本的終端機按 `Ctrl + C` |
| 瀏覽器顯示「無法連上這個網站」 | 系統沒有在執行。Docker 用 `docker compose ps` 確認；本機確認執行 `python app.py` 的終端機還開著 |

---

## 預設帳號與資料庫說明

系統啟動時會自動建立以下範例帳號，可直接用來登入操作：

| email | 密碼 | 身份 |
|-------|------|------|
| user@example.com | password123 | 住宿生 陳小明（A 棟 301） |
| admin@example.com | admin1234 | 宿舍管理員 |
| staff@example.com | staff1234 | 維修組 王師傅（也是管理員） |
| disabled@example.com | disabled123 | 停用帳號 |

系統不設「維修人員」這個角色，宿舍管理員與維修人員都是管理員（理由見規格書 §4.1）。`staff@example.com` 存在的理由，是讓派工時有一個「不是操作者本人」的承辦人可選。

**資料庫內容注意事項**

資料庫第一次建立時會自動植入**四個種子帳號**（見上表）與**六張種子報修單**。這些都是模擬資料，並非真實住戶或真實報修，請勿對內容過度解讀。

四個帳號的密碼公開於原始碼中，僅供教學操作使用（見規格書 KI-10）。**本系統不得部署到公開網際網路。**

六張種子報修單剛好涵蓋六個狀態各一張，每一張各自對應一個值得觀察的系統行為：

| # | 標題 | 申報人 | 狀態 | 處理歷程 | 為什麼放它 |
|:--:|------|--------|------|:--:|-----------|
| 1 | 浴室水龍頭持續漏水 | 陳小明 | 待受理 | 1 則 | 最小案例：只有申報內容，等待受理 |
| 2 | 房間日光燈管閃爍 | 陳小明 | 已派工 | 2 則 | 派工後的樣子；狀態紀錄帶備註 |
| 3 | 冷氣不冷且有異音 | 陳小明 | 處理中 | 4 則 | 申報、狀態異動、回覆三種紀錄並存的完整時間軸 |
| 4 | 衣櫃門把鬆脫 | 陳小明 | 已完成 | 5 則 | 走完全程；雙方來回討論後結案 |
| 5 | 想在房間加裝個人洗衣機 | **停用帳號** | 已退件 | 2 則 | 帳號停用後，既有的報修單不受影響；申報人欄因為沒有填姓名而顯示 email；退件強制附原因 |
| 6 | 走廊燈泡不亮（已自行更換） | 陳小明 | 已取消 | 2 則 | 申報人自行取消；報修地點可以是「3 樓走廊」這種非房號 |

設計用意見 [document/system-spec.md](document/system-spec.md) §6.5。

要回到初始狀態：本機執行的話，照〈重置資料庫〉刪掉資料庫檔後重新啟動；Docker 執行的話，用 `docker compose down -v` 清除資料後再 `docker compose up -d`。

---

## 報修單的狀態與權限

### 誰能做什麼

| 身份 | 可以做的事 |
|------|-----------|
| 住宿生 | 申報報修；查詢、修改、取消、回覆**自己的**報修單；維護個人資料（姓名、顯示名稱、棟別、房號、電話） |
| 管理員 | 住宿生的全部功能，加上：檢視所有報修單、派工、開始處理、登記完成、退件、重新開啟、刪除報修單、會員管理 |

修改與取消**只限申報人本人，管理員也不行**：申報內容是住戶的原始證言，取消是申報人的權利，管理員要拒絕受理時該用的是退件。

### 六個狀態

```
pending ──派工──► assigned ──開始處理──► in_progress ──完成──► completed
   │                  │                                            │
   ├──退件──► rejected │                                            │
   └──取消──► cancelled ◄──取消──┘                                  │
   ▲                                                               │
   └────────────────────── 重新開啟 ────────────────────────────────┘
```

| 狀態 | 中文 | 申報人可做 | 管理員可做 | 可回覆 |
|------|------|-----------|-----------|:---:|
| `pending` | 待受理 | 修改、取消 | 派工、退件、刪除 | ✅ |
| `assigned` | 已派工 | 取消 | 開始處理、刪除 | ✅ |
| `in_progress` | 處理中 | — | 登記完成、刪除 | ✅ |
| `completed` | 已完成 | — | 重新開啟、刪除 | ❌ |
| `rejected` | 已退件 | — | 刪除 | ❌ |
| `cancelled` | 已取消 | — | 刪除 | ❌ |

退件與重新開啟**必須填寫原因**，其餘轉移不強制。重新開啟後回到待受理，但**保留上一次的承辦人**。完整的轉移表與設計理由見規格書 §7。

### 三個值得注意的地方

1. **狀態機**：一張報修單在六個狀態之間依固定規則移動，不合法的移動會被擋下。合法性判斷寫在 SQL 的 `WHERE` 子句裡，不是先讀出來再用 Python 比對
2. **資料範圍權限**：同樣是合法登入的使用者，看得到的報修單不同。這是「路由能不能進」無法表達的權限，必須把資料讀出來之後逐筆比對
3. **稽核軌跡**：每一次狀態異動都會在處理歷程中留下一筆紀錄，記錄誰、在何時、做了什麼。報修單本身只記得現在，歷程才記得經過

---

## 建議的第一個練習：走完一張報修單的一生

1. 以 `user@example.com` 登入，點「我要報修」，填寫並送出。觀察報修單狀態為「待受理」，處理歷程只有 1 則（申報內容）
2. 在詳細頁按「修改報修單」，改一下標題後送出——**待受理的單，申報人可以修改**
3. 登出，以 `admin@example.com` 登入，進入「報修管理」，打開剛才那張單
4. 選擇承辦人「維修組 王師傅」後按「派工」→ 狀態變「已派工」，**處理歷程多了一則狀態紀錄**
5. 依序按「開始處理」與「登記完成」→ 狀態變「已完成」，處理歷程再多兩則
6. 登出，以 `user@example.com` 登入，打開同一張單。**修改、取消與回覆的入口都不見了**——已完成的單是終態
7. 在網址列直接輸入 <http://localhost:4000/repair/5>，這是停用帳號的報修單。系統會顯示「無權限檢視此報修單」
8. 以 `admin@example.com` 登入，打開第 5 張單——**管理員看得到**。再回到第 1 步那張單，按「重新開啟」並填寫原因，觀察狀態回到「待受理」，承辦人欄位仍然是王師傅

第 6 步要想的是：按鈕不見了，是畫面藏起來，還是後端真的擋下？第 7 步是資料範圍權限：一般使用者能不能進 `/repair/<id>` 這條路由不是問題，問題是**這一筆是不是你的**。

---

## 直接檢視資料庫

系統分析很重要的一環，是能夠對照「畫面上看到的東西」與「資料庫裡實際存的東西」。這一節說明資料庫檔在哪裡、用什麼工具打開，以及幾個值得先跑跑看的查詢。

### 檔案在哪裡

| 執行方式 | 位置 |
|---------|------|
| 本機（`python app.py`） | 專案根目錄的 **`database.db`** |
| Docker | 容器內的 `/app/data/database.db`，實體存放在 Docker 的 named volume `db_data` |

本機的 `database.db` 隨儲存庫一起提供，內容是種子資料；刪掉之後，系統下次啟動會重新建立。Docker 的資料庫則是容器第一次啟動時另外建立的，和資料夾裡的 `database.db` 是兩個獨立的檔案，在其中一邊做的操作不會出現在另一邊。

每個人的資料庫都是自己電腦上的一份，你在上面做的任何操作都不會影響別人。

### 如果看到 `-wal` 和 `-shm` 兩個檔案

系統使用 SQLite 的 **WAL 模式**（Write-Ahead Logging），運作時會額外產生兩個附屬檔案：

| 檔案 | 用途 |
|------|------|
| `database.db` | 資料庫主檔 |
| `database.db-wal` | 尚未合併回主檔的變更紀錄 |
| `database.db-shm` | 共享記憶體索引，供多個連線協調用 |

不過**平常你只會看到 `database.db` 一個檔案**，即使伺服器正在執行也一樣。

原因是本系統的資料存取函式每次都自己開一條連線、用完立刻關閉（見 `db/connection.py`）。SQLite 在**最後一條連線關閉時**會自動把 WAL 的內容合併回主檔，並刪掉那兩個附屬檔案。因為每條連線只存活幾毫秒，那兩個檔案幾乎不可能被你剛好看到。

**如果你真的看到 `-wal` 或 `-shm`，代表有程式正抓著這個資料庫不放**——最常見的是你把 `database.db` 開在 DB Browser 裡忘了關，或是有個 Python 程式當掉了沒關連線。這時候：

- 要複製或備份，**三個檔案要一起複製**，只拿 `database.db` 會缺少還留在 `-wal` 裡的變更
- 或者先把佔用的程式關掉，附屬檔案消失後再複製主檔即可

### 從 Docker 取出資料庫檔

用 Docker 執行時，資料庫在容器裡，本機看不到。先複製出來：

```bash
docker compose cp web:/app/data/database.db ./database.db
```

**容器必須是啟動狀態**（先 `docker compose up -d`），否則會找不到來源。複製出來的檔案就在專案根目錄，之後用下面任何一種工具打開它即可。

### 可以用哪些軟體打開

| 工具 | 平台 | 費用 | 說明 |
|------|------|------|------|
| **DB Browser for SQLite** | Windows / macOS / Linux | 免費開源 | **最推薦**。圖形介面，可以直接瀏覽資料表、看欄位定義、執行 SQL。安裝後把 `database.db` 拖進去就能看 |
| **VS Code + SQLite Viewer 擴充套件** | 全平台 | 免費 | 已經在用 VS Code 的話最方便。在擴充套件市集搜尋「SQLite Viewer」或「SQLite」安裝，之後在檔案總管直接點 `database.db` 即可 |
| **`sqlite3` 命令列** | macOS 內建；Windows 需另外下載 | 免費 | 不想安裝軟體時最快 |
| **Python 的 `sqlite3` 模組** | 全平台 | 免費 | 已經隨 Python 安裝，不需要任何額外套件 |
| TablePlus | Windows / macOS | 有免費版 | 介面精美，免費版有開啟數量限制 |
| JetBrains DataGrip / PyCharm Professional | 全平台 | 商業軟體 | 學生可申請免費授權 |

官方下載頁面：

- DB Browser for SQLite — <https://sqlitebrowser.org/>
- SQLite 命令列工具（Windows 用 `sqlite-tools-win-x64`）— <https://www.sqlite.org/download.html>

> ⚠️ 網路上有「線上 SQLite 檢視器」這類服務，需要把檔案上傳到別人的伺服器。本專案裡都是模擬資料，上傳不會有什麼損失，但**請養成習慣**：真實系統的資料庫檔絕對不要上傳到來路不明的網站。

### 用命令列看

```bash
sqlite3 database.db
```

進去之後可以用這些指令（開頭有點號的是 `sqlite3` 自己的指令，不是 SQL）：

```sql
.tables                          -- 列出所有資料表
.schema repair_requests          -- 看報修單主檔的完整 CREATE TABLE 語句
.headers on                      -- 查詢結果顯示欄位名稱
.mode column                     -- 以對齊的欄位顯示，比較好讀
.quit                            -- 離開
```

### 用 Python 看

不需要安裝任何東西：

```python
import sqlite3

conn = sqlite3.connect('database.db')
conn.row_factory = sqlite3.Row          # 讓結果可以用欄位名稱存取

for row in conn.execute('SELECT id, title, request_status, requester_id FROM repair_requests'):
    print(dict(row))

conn.close()
```

### 三張資料表

系統只有三張表，全部看完不會花太多時間：

| 資料表 | 存什麼 |
|--------|--------|
| `users` | 所有會員帳號，比一般會員表多了棟別、房號、電話三欄 |
| `repair_requests` | 報修單的**主檔**：誰申報、報修地點、類別、優先等級、目前狀態、承辦人與各階段時間 |
| `repair_logs` | 報修單的**處理歷程**：申報內容、雙方的回覆、每一次狀態異動 |

一張報修單拆成主檔與處理歷程兩張表，這是「主檔／明細」的設計。這裡的明細同時是使用者寫的內容與系統的稽核軌跡，靠 `log_type` 欄位區分（`report` 申報內容、`comment` 回覆、`status` 狀態異動）。詳細理由見 [document/system-spec.md](document/system-spec.md) §6.1。

報修單自己存一份棟別與房號，而不是每次去 `users` 查申報人的房間：報修地點不一定是申報人的房間（例如走廊），而且住戶換房之後，舊的報修單仍應指向當時的地點。理由見規格書 §6.3。

### 幾個值得先跑跑看的查詢

**看所有帳號的狀態**

```sql
SELECT id, email, role, name, dorm_building, room_no, is_active, is_deleted FROM users;
```

對照畫面上的「會員管理」頁面。注意 `role` 是 `0`（管理員）或 `1`（住宿生），`is_active` 與 `is_deleted` 是 `0`／`1` 而不是 true／false。停用帳號的 `name` 是空的（NULL），這就是第 5 張報修單的申報人欄顯示 email 的原因。

**確認密碼真的沒有明文儲存**

```sql
SELECT email, hash FROM users;
```

`hash` 欄位是 bcrypt 雜湊，長得像 `$2b$04$...`。就算拿到資料庫也還原不出原始密碼。

**看六個狀態各有幾張單**

```sql
SELECT request_status, COUNT(*) FROM repair_requests
WHERE is_deleted = 0
GROUP BY request_status;
```

初始狀態下六個數字都是 1，對照「報修管理」頁上方的六個計數。

**看一張報修單怎麼跨兩張表**

```sql
SELECT id, title, request_status, assigned_to, assigned_at, started_at, closed_at
FROM repair_requests
WHERE id = 3;

SELECT id, user_id, log_type, content, created_at
FROM repair_logs
WHERE request_id = 3
ORDER BY created_at;
```

第二個查詢會看到四列：一則 `report`（申報內容）、兩則 `status`（派工、開始處理）、一則 `comment`（王師傅的回覆）。這正是畫面上第 3 張單「處理歷程（4 則）」的內容。主檔只記得「現在是處理中、何時派工、何時開始」，經過是誰說了什麼，要看歷程。

**把三張表接起來，重現報修管理頁**

```sql
SELECT r.id,
       r.title                                     AS 標題,
       COALESCE(req.name, req.display_name, req.email) AS 申報人,
       COALESCE(a.name, a.display_name, a.email)       AS 承辦人,
       r.request_status                            AS 狀態,
       r.updated_at
FROM repair_requests r
JOIN users      req ON req.id = r.requester_id
LEFT JOIN users a   ON a.id   = r.assigned_to
WHERE r.is_deleted = 0
ORDER BY r.updated_at DESC;
```

這段 SQL 幾乎就是 `db/repair.py` 的 `list_all_requests()` 在做的事。`COALESCE(...)` 的意思是「有姓名就顯示姓名，沒有就依序退回顯示名稱、email」。承辦人用 `LEFT JOIN`，因為還沒派工的單 `assigned_to` 是空的。

**觀察一次狀態轉移留下什麼**

做完〈建議的第一個練習〉之後，把下面的 `7` 換成你那張單的 id（還沒建立過其他報修單的話就是 7）：

```sql
SELECT id, request_status, assigned_to, assigned_at, started_at, closed_at
FROM repair_requests
WHERE id = 7;

SELECT log_type, content, created_at
FROM repair_logs
WHERE request_id = 7
ORDER BY id;
```

每做一次派工、開始處理、登記完成或重新開啟，歷程就多一則 `status` 紀錄。重新開啟之後，主檔的 `started_at` 與 `closed_at` 被清空，`assigned_to` 卻還在。

另外注意所有時間都是 UTC，比台灣時間慢 8 小時，畫面上顯示的也是 UTC（規格書 KI-25）。

**驗證軟刪除**

先在系統畫面上用管理員身分刪除一張報修單，然後回來執行（把 `1` 換成你刪掉的那張）：

```sql
SELECT id, title, is_deleted FROM repair_requests;

SELECT id, request_id, log_type, is_deleted FROM repair_logs WHERE request_id = 1;
```

會發現那張單和它所有的歷程**都還在**，只是 `is_deleted` 變成 `1`。系統從來不真的執行 `DELETE`；主檔與歷程一起標記，是程式在同一個 transaction 裡做的，不是資料庫的連鎖刪除（規格書 KI-21）。

### 觀察就好，不要直接改

**建議只讀不寫。** 資料庫可以隨意查詢，但要改資料請透過系統的畫面操作。

原因是很多規則寫在程式裡而不是資料庫裡。舉例來說，「只有待受理的報修單可以修改」「退件必須附原因」「每次狀態轉移都要寫一筆歷程」「管理員不能停用自己的帳號」這些規則都是 Python 程式在檢查的，資料庫本身完全不知道有這回事——這個系統的三張表甚至連外鍵約束都沒有（見規格書 KI-20）。直接下 SQL 改 `request_status`，就會做出一張「狀態變了、歷程卻沒有紀錄」的單，這是系統本身永遠不會產生的狀態，之後就很難判斷你看到的行為是系統的設計，還是自己改壞的。

另外兩點：

- **伺服器執行中不要改資料庫**，容易與正在進行的寫入衝突
- 改壞了不用緊張，照〈重置資料庫〉刪掉資料庫檔後重新啟動，就會回到乾淨的初始狀態

如果你的目的是「想知道改了某個欄位系統會怎麼反應」，那正是值得做的實驗——但請在改之前先想好預期會發生什麼，改完再回頭驗證，這樣才有分析的價值。

---

## 執行測試

測試需要先完成方法 B 的步驟 1 到 3（Python 環境與套件），在啟用虛擬環境的狀態下執行：

```bash
pytest                                  # 執行全部 188 個測試
pytest tests/test_repair.py -v          # 只執行報修的測試
pytest -k "full_lifecycle"              # 執行名稱含 full_lifecycle 的測試（一張單走完全程）
```

測試不會動到 `database.db`——每個測試函式都會建立自己的暫存資料庫。

---

## 給開發者

專案的模組職責、開發規範、已知技術債清單見：

- [CLAUDE.md](CLAUDE.md) — 專案速查、路由總表、狀態機、權限模型、CSS 規範
- [rules/flask-blueprint.md](rules/flask-blueprint.md) — Blueprint 路由與表單的實作規範
- [rules/database.md](rules/database.md) — `db/` 套件、transaction、軟刪除、狀態轉移函式的實作規範
- [tests/CLAUDE.md](tests/CLAUDE.md) — 測試撰寫指引
- [document/system-spec.md](document/system-spec.md) 第 12 章 — 已知技術債（共 30 條），含每一條的接受理由與修補方向

影響最明顯的三條：

- **所有時間顯示為 UTC**，在台灣使用時每個時間都慢 8 小時（KI-25）
- **無 CSRF 防護**（KI-01）
- **`debug=True` 且綁定 `0.0.0.0`**（KI-09）

**本系統不得部署到公開網際網路。**
