# 校園訂餐系統（SAD-Meal-Order）

## 專案摘要

115-1 系統分析課程範例系統。主要提供元智大學工業工程與管理學系課程之用，這是一個範例的資訊系統，學生可進行系統分析工作的練習。

本系統聚焦在**訂餐的完整交易流程**：菜單維護、線上訂餐、訂單審核、登記取餐，並以一組完整的**會員帳號與管理**子系統作為身分基礎——「一個被停用的帳號能不能繼續訂餐」「餐點的剩餘份數在哪一步被佔用、取消之後又在哪一步回補」這類問題，只有在訂餐流程與帳號治理同時存在時才問得出來。

五個子系統、四張資料表、152 個自動化測試。

系統分成兩塊：會員帳號與管理（auth / hub / profile / admin），以及訂餐的業務流程（meal）。

---

## 系統文件

各子系統的詳細功能說明請參閱以下文件，請同學好好參考：

| 子系統 | 文件連結 |
|--------|----------|
| Hub 首頁 | [document/hub.md](document/hub.md) |
| 登入與帳號 | [document/auth.md](document/auth.md) |
| 個人資料管理 | [document/profile.md](document/profile.md) |
| 訂餐 | [document/meal.md](document/meal.md) |
| 會員管理（管理員） | [document/admin.md](document/admin.md) |

另有兩份完整的設計文件：

| 文件 | 說明 |
|------|------|
| [document/system-spec.md](document/system-spec.md) | 系統規格書：功能需求、資料模型、狀態機與庫存不變量、驗證規則、已知技術債 |
| [document/build-guide.md](document/build-guide.md) | 建置流程書：從空目錄到可執行的 15 個階段 |

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
| 主檔與明細 | 觀察一張單據如何拆成兩張表 | 一張訂單為什麼要拆成 `meal_orders` 與 `meal_order_items`？明細為什麼要另外存一份單價？ | 理解企業系統中最常見的資料結構 |
| 狀態機 | 追蹤一張訂單的狀態變化 | 一張訂單從送出到取餐經過哪些狀態？哪些轉移是被允許的？限制寫在哪裡？ | 理解 state 與狀態轉移的合法性檢查 |
| 份數一致性 | 注意剩餘份數什麼時候改變 | 送出訂單時剩餘份數變了嗎？確認時呢？取消一張已確認的訂單呢？登記取餐呢？為什麼這樣設計？ | 理解共用資源的檢查時機與佔用時機 |
| 資料狀態改變 | 注意操作前後資料如何變化 | 管理員停用一個帳號後，哪些資料被改變？該帳號還能做什麼、不能做什麼？ | 理解 state、資料更新與畫面同步的概念 |
| 錯誤處理 | 觀察系統對錯誤輸入的反應 | 欄位空白、取餐日期超過 7 天、份數超過剩餘份數時系統如何回應？訂購已售完的餐點，錯誤訊息和份數不足時一樣嗎？ | 理解驗證、例外處理與使用者回饋 |
| 前後端與資料庫分工 | 辨別三層架構各自的責任 | 前端、後端、資料庫分別負責什麼工作？隱藏一個按鈕等於禁止那個操作嗎？單價為什麼不採用表單送來的值？ | 建立系統架構的基本概念，不只看零散的程式碼 |
| 用自己的話說明 | 將觀察轉化為理解並表達出來 | 系統解決什麼問題？資料如何流動？要修改某功能需改哪些地方？ | 將觀察轉為理解，作為小組討論、作業報告與程式修改的基礎 |

---

## 技術棧

- **後端**：Python 3 / Flask / Blueprint
- **前端**：Jinja2 Template / 原生 HTML / CSS（無前端框架）
- **資料庫**：SQLite（WAL 模式，無 ORM）
- **驗證碼**：captcha（ImageCaptcha，伺服器端產生）
- **密碼加密**：bcrypt（註冊 cost=10；種子帳號 cost=4）
- **測試**：pytest + pytest-flask

不用 ORM、不用前端框架、不用 Flask-Login、不用外鍵約束，每一項的理由與代價見規格書 §2.2。

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

這套系統收在課程教材儲存庫裡，路徑是 `03-Midterm-Project-Example-Systems/SAD-Meal-Order/`，不是獨立的儲存庫。下面兩種方法擇一。

#### 方法 A：使用 Git

**前置需求**：已安裝 [Git](https://git-scm.com/)，Windows、macOS、Linux 均支援。

1. 決定你的專案放在電腦的位置（例如桌面或 Documents）
2. 開啟終端機，切換到該資料夾後執行：

```bash
git clone https://github.com/billy1125/system-analysis-and-design.git
cd system-analysis-and-design/03-Midterm-Project-Example-Systems/SAD-Meal-Order
```

#### 方法 B：下載 ZIP（如果你不會用 Git 的話）

1. 開啟課程教材儲存庫的 GitHub 頁面 <https://github.com/billy1125/system-analysis-and-design>，點選綠色 **Code** 按鈕 → **Download ZIP**
2. 將下載的壓縮檔解壓縮到你想放的位置（例如桌面或 Documents），解壓縮之後資料夾名稱應該是「system-analysis-and-design-main」
3. 開啟終端機，切換到解壓縮資料夾底下的 `03-Midterm-Project-Example-Systems/SAD-Meal-Order`

**如何找到完整路徑？**

- **Windows**：在檔案總管中開啟該資料夾，點選上方網址列，即可看到並複製完整路徑。
- **macOS**：在 Finder 中找到該資料夾，按住 `Option` 鍵並右鍵點選，選擇「複製路徑名稱」。

取得路徑後，在終端機輸入 `cd`、一個空格，再貼上路徑：

```bash
# Windows（PowerShell）
cd "C:\Users\billy\Downloads\system-analysis-and-design-main\03-Midterm-Project-Example-Systems\SAD-Meal-Order"

# macOS / Linux
cd "/Users/billy/Downloads/system-analysis-and-design-main/03-Midterm-Project-Example-Systems/SAD-Meal-Order"
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

> 系統的資料（帳號、餐點、訂單）儲存在 Docker 的 named volume 中，`stop` 或 `down` 都不會刪除資料；只有加上 `-v` 才會完全清除，下次啟動時回復為三個種子帳號、六道種子餐點與四張種子訂單的初始狀態。加上 `--rmi all` 才會同時刪除本機的 Docker 映像。

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

> **第一次用本機方式啟動前，先照下方〈重置資料庫〉刪掉 `database.db`。** 種子訂單的取餐日期是依建立資料庫那一天換算的，儲存庫附的 `database.db` 建立於 2026-08-12，裡面的取餐日期都已經過去。直接使用的話，修改待確認的訂單 #4 時，表單帶入的舊日期會被「取餐日期不可早於今天」擋下。刪掉重建後，取餐日期會改以啟動當天為準。Docker 會在容器第一次啟動時另外建立資料庫，不受影響。

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
| user@example.com | password123 | 一般使用者 |
| admin@example.com | admin1234 | 管理者 |
| disabled@example.com | disabled123 | 停用帳號 |

**資料庫內容注意事項**

資料庫第一次建立時會自動植入**三個種子帳號**（見上表）、**六道種子餐點**與**四張種子訂單**。這些都是模擬資料，並非真實餐點或真實帳號，請勿對內容過度解讀。

三個帳號的密碼公開於原始碼中，僅供教學操作使用。

六道種子餐點各自對應一個值得觀察的系統狀態：

| 餐點 | 狀態 | 剩餘／供應 | 為什麼放它 |
|------|------|-----------:|-----------|
| 雞腿便當（A01） | 供應中 | 60 / 60 | 一般情形 |
| **素食便當（A02）** | **供應中** | **38 / 40** | 被已確認的種子訂單 #3 佔用 2 份 |
| 排骨便當（A03） | 今日售完 | 0 / 50 | 售完：擋下它的是**狀態檢查**，而且排在份數檢查之前 |
| 牛肉麵（A04） | 停售 | 30 / 30 | 停售但仍有份數，擋下它的是狀態而不是數量 |
| 燙青菜（B01） | 供應中 | 79 / 80 | 附餐分類；同樣被訂單 #3 佔用 1 份 |
| 古早味紅茶（C01） | 供應中 | 100 / 100 | 飲料分類 |

四張種子訂單覆蓋訂單狀態機中四個可達的狀態：

| 訂單 | 訂購人 | 狀態 | 品項 | 金額 | 為什麼放它 |
|:--:|-------|------|------|-----:|-----------|
| #1 | user@example.com | 已取餐 | 雞腿便當×1、古早味紅茶×1 | 115 | 已結案，不可修改或取消 |
| #2 | user@example.com | 已取消 | 素食便當×1 | 75 | 已結案 |
| #3 | disabled@example.com | 已確認 | 素食便當×2、燙青菜×1 | 175 | **唯一佔用份數的訂單**；訂購人是停用帳號，訂購人欄因為沒有填姓名而顯示 email |
| #4 | user@example.com | 待確認 | 雞腿便當×2、燙青菜×2 | 240 | 可修改、可取消、可審核 |

設計用意見 [document/system-spec.md](document/system-spec.md) §6.12。

要回到初始狀態：本機執行的話，照〈重置資料庫〉刪掉資料庫檔後重新啟動；Docker 執行的話，用 `docker compose down -v` 清除資料後再 `docker compose up -d`。

---

## 功能與訂餐規則

### 各角色能做什麼

| 角色 | 功能 |
|------|------|
| 任何人（含訪客） | 瀏覽今日菜單、價格與剩餘份數；依分類（主餐／附餐／飲料）篩選；申請帳號、登入 |
| 會員 | 線上訂餐（選取餐日期、時段、地點，一次可訂多道餐點）；檢視自己的訂單；修改待確認的訂單；取消待確認或已確認的訂單；查看與編輯個人資料 |
| 管理員 | 以上全部，加上：餐點管理（新增、修改、下架）；訂單管理（確認、拒絕、登記取餐、代為取消）；會員管理（清單、篩選、搜尋、啟用／停用、調整角色、軟刪除） |

訂餐的限制：取餐日期限今天起算 7 天內（含今天）；至少訂一項，單張訂單總份數上限 20 份；每一項的份數不得超過該餐點的剩餘份數。完整的驗證順序見規格書 §9.6。

### 訂單狀態機

```text
pending ──confirm──> confirmed ──complete──> completed
   │                     │
   ├──reject──> rejected └──cancel──> cancelled
   └──cancel──> cancelled
```

| 狀態值 | 畫面標籤 |
|--------|---------|
| `pending` | 待確認 |
| `confirmed` | 已確認 |
| `completed` | 已取餐 |
| `cancelled` | 已取消 |
| `rejected` | 已拒絕 |

**份數規則：餐點的剩餘份數只在「已確認」狀態被佔用。**

| 轉移 | 觸發者 | 剩餘份數 |
|------|--------|---------|
| 確認（待確認 → 已確認） | 管理員 | **扣減** |
| 拒絕（待確認 → 已拒絕） | 管理員 | 不動（本來就沒佔用） |
| 取消待確認的訂單 | 訂購人或管理員 | 不動（本來就沒佔用） |
| 登記取餐（已確認 → 已取餐） | 管理員 | 不動（餐點已被取走） |
| 取消已確認的訂單 | 訂購人或管理員 | **回補** |

確認時會重新檢查每一項的份數，任何一項不足就整張退回，不做部分確認。這條規則保證不會超賣、取消一定還原。詳見規格書 §6.10。

### 資料模型的三個設計決策

四張表的關係是 `users ──1:N──> meal_orders ──1:N──> meal_order_items ──N:1──> meals`。其中 `meal_order_items` 是一張**帶屬性的關聯表**，除了指向訂單與餐點，還帶著 `quantity`、`unit_price`、`subtotal` 三個欄位。

- **價格用整數（元）**，不用浮點數——總金額是明細的加總，浮點誤差會累積
- **明細存 `unit_price` 快照**——菜單調價不應該改變歷史訂單的金額
- **`total_amount` 由資料層依明細算出**，表單與 Blueprint 都不參與計算

---

## 建議的第一個練習：走完一次訂餐流程

1. 以 `user@example.com` 登入，進入「今日菜單」，點選「我要訂餐」
2. 雞腿便當填 3 份，填好取餐資訊後送出訂單，觀察訂單狀態為「待確認」
3. **回到今日菜單，確認雞腿便當的剩餘份數還是 60** — 送出訂單不會佔用份數
4. 登出，以 `admin@example.com` 登入，進入「訂單管理」
5. 按「確認」→ 狀態變「已確認」。**再回今日菜單確認剩餘份數變成 57**
6. 按「登記取餐」→ 狀態變「已取餐」。**剩餘份數仍是 57** — 餐點已被取走，不回補
7. 再用 `user@example.com` 訂一次 3 份，請管理員確認（剩餘 54），然後由使用者自己取消這張訂單。**剩餘份數回到 57**

第 3 步是最容易被誤解的一步。多數人會直覺認為「送出訂單」就等於「份數被保留下來了」，但這個系統不是這樣設計的——它的後果是十個人各訂最後一份便當都會成功，直到管理員確認第一張，其餘九張才在確認時失敗。這個取捨的完整討論見規格書 §11.4 的 KI-M1。

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
.schema meal_orders              -- 看訂單主檔的完整 CREATE TABLE 語句
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

for row in conn.execute('SELECT id, meal_code, meal_name, daily_quantity, remaining_quantity FROM meals'):
    print(dict(row))

conn.close()
```

### 四張資料表

系統只有四張表，全部看完不會花太多時間：

| 資料表 | 存什麼 |
|--------|--------|
| `users` | 所有會員帳號 |
| `meals` | 餐點主檔：編號、名稱、分類、單價、每日供應份數、剩餘份數、供應狀態 |
| `meal_orders` | 訂單的**表頭**：誰訂的、取餐日期／時段／地點、總金額、目前狀態、審核紀錄 |
| `meal_order_items` | 訂單的**明細**：這張單訂了哪些餐點、各幾份、當時的單價與小計 |

一張訂單拆成表頭與明細兩張表，這是「主檔／明細」的設計，也是企業資訊系統中最常見的資料結構之一。詳細理由見 [document/system-spec.md](document/system-spec.md) §6.2。

### 幾個值得先跑跑看的查詢

**看所有帳號的狀態**

```sql
SELECT id, email, role, is_active, is_deleted FROM users;
```

對照畫面上的「會員管理」頁面。注意 `role` 是 `0`（管理員）或 `1`（一般使用者），`is_active` 與 `is_deleted` 是 `0`／`1` 而不是 true／false。

**確認密碼真的沒有明文儲存**

```sql
SELECT email, hash FROM users;
```

`hash` 欄位是 bcrypt 雜湊，長得像 `$2b$04$...`。就算拿到資料庫也還原不出原始密碼。

**看餐點的兩個份數欄位**

```sql
SELECT id, meal_code, meal_name, meal_status, daily_quantity, remaining_quantity FROM meals;
```

`daily_quantity` 是每日供應份數，不會因為訂餐而改變；`remaining_quantity` 才是目前還能訂的份數。注意素食便當的剩餘是 38 而不是 40——少掉的 2 份，就是已確認的訂單 #3 佔用的。

**看一張訂單怎麼跨兩張表**

```sql
SELECT id, orderer_id, pickup_date, pickup_slot, total_amount, order_status
FROM meal_orders;

SELECT id, meal_order_id, meal_id, quantity, unit_price, subtotal, item_status
FROM meal_order_items
WHERE meal_order_id = 3;
```

第二個查詢會看到兩列，就是畫面上訂單 #3 明細表格的兩行。注意 `item_status` 和 `order_status` 是一樣的——它們是同步更新的。

**確認總金額等於明細加總**

```sql
SELECT o.id, o.total_amount, SUM(i.subtotal) AS 明細加總
FROM meal_orders o
JOIN meal_order_items i ON i.meal_order_id = o.id AND i.is_deleted = 0
GROUP BY o.id;
```

兩欄每一列都相等。`total_amount` 是資料層依明細算出來寫進去的，不是表單送來的值。

**驗證份數規則**

```sql
SELECT m.meal_code, m.meal_name, m.daily_quantity, m.remaining_quantity,
       COALESCE(SUM(CASE WHEN o.order_status = 'confirmed' THEN i.quantity END), 0) AS 已確認份數
FROM meals m
LEFT JOIN meal_order_items i ON i.meal_id = m.id AND i.is_deleted = 0
LEFT JOIN meal_orders o      ON o.id = i.meal_order_id
WHERE m.is_deleted = 0
GROUP BY m.id
ORDER BY m.meal_code;
```

照份數規則，每一列應該都滿足「供應份數 − 已確認份數 = 剩餘份數」。實際跑一次會發現排骨便當（A03）不符合：它沒有任何已確認的訂單，剩餘份數卻是 0。原因是剩餘份數也能由管理員在餐點管理頁直接修改，這種情形不受份數規則約束，見規格書 §6.10 與 KI-M7。

**把三張表接起來，重現訂單管理頁**

```sql
SELECT o.id,
       COALESCE(u.name, u.email) AS 訂購人,
       m.meal_name               AS 餐點,
       i.quantity                AS 份數,
       i.subtotal                AS 小計,
       o.order_status            AS 狀態
FROM meal_orders o
LEFT JOIN users       u ON u.id = o.orderer_id
JOIN meal_order_items i ON i.meal_order_id = o.id AND i.is_deleted = 0
LEFT JOIN meals       m ON m.id = i.meal_id
WHERE o.is_deleted = 0
ORDER BY o.created_at DESC, o.id DESC;
```

這段 SQL 把 `list_all_orders()` 與 `list_order_items()` 兩個函式做的事合在一起。系統實際上分成兩次查詢：先撈表頭，再依 id 撈明細。訂單 #3 的訂購人顯示 email，是因為那個帳號沒有填姓名。

**觀察份數什麼時候改變**

照〈建議的第一個練習〉走一次，每一步都回來跑這個查詢：

```sql
SELECT meal_name, remaining_quantity FROM meals WHERE id = 1;
```

| 步驟 | 預期的 `remaining_quantity` |
|------|---------------------------|
| 初始 | 60 |
| 使用者送出 3 份的訂單 | 60（不變） |
| 管理員確認 | 57 |
| 管理員登記取餐 | 57（不變） |

**驗證軟刪除**

先在系統畫面上用管理員身分下架一道餐點，然後回來執行：

```sql
SELECT id, meal_name, is_deleted FROM meals;
```

會發現那筆資料**還在**，只是 `is_deleted` 變成 `1`。系統從來不真的執行 `DELETE`。

### 觀察就好，不要直接改

**建議只讀不寫。** 資料庫可以隨意查詢，但要改資料請透過系統的畫面操作。

原因是很多規則寫在程式裡而不是資料庫裡。舉例來說，「只有待確認的訂單能被確認」「剩餘份數只在確認時扣減」「管理員不能停用自己的帳號」這些規則都是 Python 程式在檢查的，資料庫本身完全不知道有這回事——這個系統的四張表甚至連外鍵約束都沒有（見規格書 KI-13）。直接下 SQL 可以輕易做出系統本身永遠不會產生的狀態，之後就很難判斷你看到的行為是系統的設計，還是自己改壞的。

另外兩點：

- **伺服器執行中不要改資料庫**，容易與正在進行的寫入衝突
- 改壞了不用緊張，照〈重置資料庫〉刪掉資料庫檔後重新啟動，就會回到乾淨的初始狀態

如果你的目的是「想知道改了某個欄位系統會怎麼反應」，那正是值得做的實驗——但請在改之前先想好預期會發生什麼，改完再回頭驗證，這樣才有分析的價值。

---

## 執行測試

```bash
pytest                                  # 執行全部 152 個測試
pytest tests/test_meal.py -v            # 只執行訂餐的測試
pytest -k "confirm"                     # 執行名稱含 confirm 的測試
```

測試不會動到 `database.db`——每個測試函式都會建立自己的暫存資料庫。各測試檔的案例數見規格書 §12.4。

---

## 給開發者

專案的模組職責、開發規範、已知技術債清單見：

- [CLAUDE.md](CLAUDE.md) — 專案速查、路由總表、權限模型、CSS 規範
- [rules/flask-blueprint.md](rules/flask-blueprint.md) — Blueprint 路由與表單的實作規範
- [rules/database.md](rules/database.md) — `db/` 套件、transaction、軟刪除的實作規範
- [document/system-spec.md](document/system-spec.md) 第 11 章 — 已知技術債（共 25 條），含每一條的接受理由與修補方向

這個專案刻意留下一些「不完美」的地方，它們是教材而非疏漏：

- **`POST /profile/update` 缺少帳號有效性檢查（KI-03）。** 被停用的會員仍可修改自己的姓名。這示範技術債如何跨功能傳染——它讓管理員的停用功能部分失效。**請勿修補**，有測試在保護它
- **訂餐的守門則修補了。** 同一個缺陷，一個修一個不修，判準是「影響會不會外溢到當事人以外的人」：改自己的姓名只影響自己，佔用餐點份數會讓別人訂不到（見規格書 §11.0）
- **三層權限檢查在每個路由開頭明碼重複寫出**，不抽象成裝飾器。讀者從任一路由的第一行就能讀出完整的守門條件
