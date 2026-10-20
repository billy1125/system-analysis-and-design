# 校園小型圖書借閱系統（SAD-Library）

## 專案摘要

115-1 系統分析課程範例系統。主要提供元智大學工業工程與管理學系課程之用，這是一個範例的資訊系統，學生可進行系統分析工作的練習。

本系統聚焦在**圖書借閱的完整交易流程**：館藏查詢、借書、續借、還書，以及書被借光時的預約候補，並以一組完整的**會員帳號與管理**子系統作為身分基礎——「一個被停用的帳號能不能繼續借書」「一本借出中的書能不能被下架」「一筆逾期的借閱會擋住哪些操作」這類問題，只有在借閱流程與帳號治理同時存在時才問得出來。

七個子系統、五張資料表、218 個自動化測試。

系統分成兩塊：會員帳號與管理（auth / hub / profile / admin），以及圖書借閱的業務流程（books / loans / reservations）。

### 讀者與館員能做什麼

| 角色 | 功能 |
|------|------|
| 讀者 | 查詢館藏（搜尋書名／作者／ISBN、依分類篩選、看複本在架狀況）；借書；續借；自行還書；書被借光時預約候補並查看順位；修改自己的姓名與顯示名稱 |
| 館員 | 讀者的全部功能，加上：新增／修改／下架書目，新增／調整狀態／報廢複本；全館借閱紀錄、逾期清單、代為還書登記；全館預約佇列、代為取消預約；會員管理（帳號清單、啟用／停用、角色調整、軟刪除） |

**續借是唯一館員也不能代勞的操作**；還書則相反，櫃台代為登記是常態。完整的權限矩陣見 [document/system-spec.md](document/system-spec.md) §4.3。

### 借閱規則

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

逾期不罰款，只封鎖借閱，歸還後立刻解除。各項檢查的先後順序見規格書 §9.4 至 §9.6。

---

## 系統文件

這套系統的說明集中在兩份設計文件，請同學好好參考：

| 文件 | 說明 |
|------|------|
| [document/system-spec.md](document/system-spec.md) | 系統規格書：功能需求、資料模型、狀態機、驗證規則、已知技術債 |
| [document/build-guide.md](document/build-guide.md) | 建置流程書：從空目錄到可執行的 14 個階段（Phase 0 至 Phase 13） |

---

## 同學請注意

除了以上兩份設計文件，請在觀察這個範例系統時，先不要把重點放在程式語法或細節錯誤上，而是要理解「**系統如何運作**」。

當你能說明「**資料從哪裡來、經過哪些處理、最後到哪裡去**」，就代表你已經掌握這個系統最基本的運作方式。

建議你依照以下內容進行觀察與分析：

|  | 觀察重點 | 具體問題 | 學習目標 |
|------|----------|----------|----------|
| 實際操作系統 | 從使用者角度理解功能 | 系統有哪些頁面、按鈕、輸入框？使用者輸入後畫面有何變化？ | 理解「使用者做了什麼」與「系統回應了什麼」 |
| 輸入→處理→輸出 | 用資料流架構整理每個功能 | 資料從哪裡來？程式對資料做了什麼？結果顯示或儲存在哪裡？ | 掌握資料流，避免一開始就陷入程式細節 |
| UI 與程式連動 | 觀察畫面與程式的對應關係 | 輸入框、按鈕如何對應資料？按下後程式執行了哪些動作？ | 理解「畫面操作」如何觸發「程式中的處理」 |
| 函式的角色 | 理解每個函式負責的工作 | 函式名稱代表什麼？接收什麼輸入？回傳什麼輸出？ | 把函式視為系統中負責單一任務的小單元 |
| 函式關係與資料儲存 | 追蹤函式呼叫鏈與資料流向 | 函式在哪裡被呼叫？資料接著流向哪裡？何時、在哪裡儲存？Schema 有哪些欄位？ | 理解資料流、函式分工、UI 互動與儲存邏輯 |
| 書目與複本 | 觀察一本書如何拆成兩張表 | 為什麼要拆成 `books` 與 `book_copies`？借出去的是書目還是複本？如果只用一個「數量」欄位會怎樣？ | 理解主檔／明細結構，以及「借出的是哪一本」這個問題 |
| 不存欄位的狀態 | 找出畫面上有、資料表裡沒有的東西 | 「在架冊數」與「逾期」在資料表裡找得到嗎？它們是怎麼算出來的？ | 理解推導值與儲存值的差別 |
| 規則的交互作用 | 追蹤一條規則會擋住哪些操作 | 逾期會擋住借書與續借嗎？別人預約了，為什麼你就不能續借？檢查的順序為什麼這樣排？ | 理解業務規則之間的牽動，以及規則寫在哪一層 |
| 預約佇列 | 觀察一筆預約的狀態變化 | 預約從等待中到可取書，是誰的哪個動作觸發的？可取書之後書會被保留嗎？ | 理解 state、狀態轉移與觸發時機 |
| 資料狀態改變 | 注意操作前後資料如何變化 | 館員停用一個帳號後，哪些資料被改變？該帳號還能做什麼、不能做什麼？ | 理解 state、資料更新與畫面同步的概念 |
| 錯誤處理 | 觀察系統對錯誤輸入的反應 | 欄位空白、格式錯誤、超過借閱上限時系統如何回應？錯誤訊息由誰產生？ | 理解驗證、例外處理與使用者回饋 |
| 前後端與資料庫分工 | 辨別三層架構各自的責任 | 前端、後端、資料庫分別負責什麼工作？隱藏一個按鈕等於禁止那個操作嗎？ | 建立系統架構的基本概念，不只看零散的程式碼 |
| 用自己的話說明 | 將觀察轉化為理解並表達出來 | 系統解決什麼問題？資料如何流動？要修改某功能需改哪些地方？ | 將觀察轉為理解，作為小組討論、作業報告與程式修改的基礎 |

---

## 技術棧

- **後端**：Python 3 / Flask / Blueprint（7 個 Blueprint）
- **前端**：Jinja2 Template / 原生 HTML / CSS（無前端框架、無建置流程）
- **資料庫**：SQLite（WAL 模式，無 ORM）
- **驗證碼**：captcha（ImageCaptcha，伺服器端產生）
- **密碼加密**：bcrypt（註冊 cost=10；種子帳號 cost=4）
- **測試**：pytest + pytest-flask

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

這套系統收在課程教材儲存庫裡，路徑是 `03-Midterm-Project-Example-Systems/SAD-Library/`，不是獨立的儲存庫。下面兩種方法擇一。

#### 方法 A：使用 Git

**前置需求**：已安裝 [Git](https://git-scm.com/)，Windows、macOS、Linux 均支援。

1. 決定你的專案放在電腦的位置（例如桌面或 Documents）
2. 開啟終端機，切換到該資料夾後執行：

```bash
git clone https://github.com/billy1125/system-analysis-and-design.git
cd system-analysis-and-design/03-Midterm-Project-Example-Systems/SAD-Library
```

#### 方法 B：下載 ZIP（如果你不會用 Git 的話）

1. 開啟課程教材儲存庫的 GitHub 頁面 <https://github.com/billy1125/system-analysis-and-design>，點選綠色 **Code** 按鈕 → **Download ZIP**
2. 將下載的壓縮檔解壓縮到你想放的位置（例如桌面或 Documents），解壓縮之後資料夾名稱應該是「system-analysis-and-design-main」
3. 開啟終端機，切換到解壓縮資料夾底下的 `03-Midterm-Project-Example-Systems/SAD-Library`

**如何找到完整路徑？**

- **Windows**：在檔案總管中開啟該資料夾，點選上方網址列，即可看到並複製完整路徑。
- **macOS**：在 Finder 中找到該資料夾，按住 `Option` 鍵並右鍵點選，選擇「複製路徑名稱」。

取得路徑後，在終端機輸入 `cd`、一個空格，再貼上路徑：

```bash
# Windows（PowerShell）
cd "C:\Users\billy\Downloads\system-analysis-and-design-main\03-Midterm-Project-Example-Systems\SAD-Library"

# macOS / Linux
cd "/Users/billy/Downloads/system-analysis-and-design-main/03-Midterm-Project-Example-Systems/SAD-Library"
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

> 系統的資料（帳號、書目、複本、借閱、預約）儲存在 Docker 的 named volume 中，`stop` 或 `down` 都不會刪除資料；只有加上 `-v` 才會完全清除，下次啟動時回復為三個種子帳號、十筆種子書目與十八本複本的初始狀態。加上 `--rmi all` 才會同時刪除本機的 Docker 映像。

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
| user@example.com | password123 | 讀者（一般使用者） |
| admin@example.com | admin1234 | 館員（管理者） |
| disabled@example.com | disabled123 | 停用帳號 |

**資料庫內容注意事項**

資料庫第一次建立時會自動植入**三個種子帳號**（見上表）與**十筆書目、十八本複本**。這些都是模擬資料，並非真實館藏或真實帳號，請勿對內容過度解讀。

三個帳號的密碼公開於原始碼中，僅供教學操作使用。

十筆種子書目涵蓋五個分類，複本數刻意不同：

| 書目 | 分類 | 複本數 | 為什麼放它 |
|------|------|:------:|-----------|
| 系統分析與設計、普通物理學 | 應用科技、自然科學 | 3 | 複本較多，一般情形 |
| 資料庫系統概論、演算法圖鑑、經濟學原理、百年孤寂 | 應用科技、社會科學、文學 | 2 | 一般情形 |
| **台灣通史新編、文心雕龍讀本、西洋美術史、有機化學導論** | 社會科學、文學、藝術、自然科學 | **1** | 借走一本就沒了，**用來觀察「借光 → 預約 → 遞補」** |

**借閱與預約則刻意不放模擬資料。** 交易資料從空的開始，測試才能以絕對值斷言。想看到借閱與預約，請自己在畫面上跑一次完整流程——這也正是最值得做的第一個練習。種子資料的完整內容見規格書 §6.8。

要回到初始狀態：本機執行的話，照〈重置資料庫〉刪掉資料庫檔後重新啟動；Docker 執行的話，用 `docker compose down -v` 清除資料後再 `docker compose up -d`。

---

## 建議的第一個練習：借光 → 預約 → 遞補

種子帳號只有一位讀者，所以這個練習讓館員扮演第二位讀者——館員也可以借書與預約。

1. 以 `user@example.com` 登入，進入「館藏查詢」，點選「台灣通史新編」，按「借閱這本書」
2. **回到館藏查詢，確認這本書的在架冊數變成 0**
3. 登出，以 `admin@example.com` 登入，打開同一本書。右欄顯示「目前無可借複本」與「預約候補」按鈕，按下預約
4. 進入「我的預約」，狀態為「等待中」、順位 1
5. 登出，以 `user@example.com` 登入，進入「我的借閱」，**試著按續借** — 會被擋下：「此書已有其他讀者預約，無法續借」
6. 按「歸還」（跳出確認視窗時按確定）
7. 登出，以 `admin@example.com` 登入，進入「我的預約」。狀態變成「可取書」，並出現「立即借閱」
8. 按「立即借閱」，借閱成立，這筆預約同時轉為「已完成」

第 5 與第 6 步是最值得想清楚的兩步。續借被擋，是因為別人的預約會影響你的權利；歸還時，系統在同一個 transaction 裡把複本放回架上、並把排第一的預約轉為可取書。
但「可取書」**不代表書被保留**——如果第 7 步之前有別人先借走，館員那筆預約只會停在可取書。這個取捨的討論見規格書 §8.4 旅程 B 與 §11.4 的 KI-21。

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

可以自己驗證這件事：

```python
import sqlite3, os

conn = sqlite3.connect('database.db')
conn.execute('PRAGMA journal_mode=WAL')
conn.execute('SELECT 1')
print('連線開啟中:', sorted(f for f in os.listdir('.') if f.startswith('database.db')))
conn.close()
print('連線關閉後:', sorted(f for f in os.listdir('.') if f.startswith('database.db')))
```

**如果你真的看到 `-wal` 或 `-shm`，代表有程式正抓著這個資料庫不放**——最常見的是你把 `database.db` 開在 DB Browser 裡忘了關，或是有個 Python 程式當掉了沒關連線。這時候：

- 要複製或備份，**三個檔案要一起複製**，只拿 `database.db` 會缺少還留在 `-wal` 裡的變更
- 或者先把佔用的程式關掉，附屬檔案消失後再複製主檔即可

### 從 Docker 取出資料庫檔

用 Docker 執行時，資料庫在容器裡，本機看不到。先複製出來：

```bash
docker compose cp web:/app/data/database.db ./database.db
```

**容器必須是啟動狀態**（先 `docker compose up -d`），否則會找不到來源。複製出來的檔案就在專案根目錄，之後用下面任何一種工具打開它即可。

改回容器裡的用法相反：

```bash
docker compose cp ./database.db web:/app/data/database.db
```

但如同本節最後的提醒，**不建議這樣改資料**。

### 可以用哪些軟體打開

| 工具 | 平台 | 費用 | 說明 |
|------|------|------|------|
| **DB Browser for SQLite** | Windows / macOS / Linux | 免費開源 | **最推薦**。圖形介面，可以直接瀏覽資料表、看欄位定義、執行 SQL。安裝後把 `database.db` 拖進去就能看 |
| **VS Code + SQLite Viewer 擴充套件** | 全平台 | 免費 | 已經在用 VS Code 的話最方便。在擴充套件市集搜尋「SQLite Viewer」或「SQLite」安裝，之後在檔案總管直接點 `database.db` 即可 |
| **`sqlite3` 命令列** | macOS 內建；Windows 需另外下載 | 免費 | 不想安裝軟體時最快。macOS 打開終端機就能用 |
| **Python 的 `sqlite3` 模組** | 全平台 | 免費 | 已經隨 Python 安裝，不需要任何額外套件。適合想用程式讀資料的人 |
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
.schema book_copies              -- 看複本表的完整 CREATE TABLE 語句
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

for row in conn.execute('SELECT id, book_id, copy_barcode, copy_status FROM book_copies'):
    print(dict(row))

conn.close()
```

### 五張資料表

| 資料表 | 存什麼 |
|--------|--------|
| `users` | 所有會員帳號（讀者與館員） |
| `books` | 書目**主檔**：一個 ISBN 一筆，記書名、作者、分類、是否暫停借閱 |
| `book_copies` | 館藏複本**明細**：架上的每一本實體書一筆，記條碼與在架狀態 |
| `loans` | 借閱交易：誰借了哪一本複本、借出與應還時間、續借次數、是否已還 |
| `reservations` | 預約候補：誰在排哪一筆書目、排隊時間、目前狀態 |

`books` 與 `book_copies` 是「主檔／明細」的設計。**借閱的對象是複本，不是書目**——拆成兩張表，才回答得了「借出去的是哪一本」。詳細理由見 [document/system-spec.md](document/system-spec.md) §6.1.1。

### 幾個值得先跑跑看的查詢

**看所有帳號的狀態**

```sql
SELECT id, email, role, is_active, is_deleted FROM users;
```

對照畫面上的「會員管理」頁面。注意 `role` 是 `0`（館員）或 `1`（讀者），`is_active` 與 `is_deleted` 是 `0`／`1` 而不是 true／false。

**確認密碼真的沒有明文儲存**

```sql
SELECT email, hash FROM users;
```

`hash` 欄位是 bcrypt 雜湊，長得像 `$2b$04$...`。就算拿到資料庫也還原不出原始密碼。

**重現館藏查詢頁的「館藏／在架」**

```sql
SELECT b.id, b.title, b.book_status,
       (SELECT COUNT(*) FROM book_copies c
         WHERE c.book_id = b.id AND c.is_deleted = 0) AS 館藏,
       (SELECT COUNT(*) FROM book_copies c
         WHERE c.book_id = b.id AND c.is_deleted = 0 AND c.copy_status = 'available') AS 在架
FROM books b
WHERE b.is_deleted = 0
ORDER BY b.id;
```

`books` 表裡**沒有**「在架冊數」這個欄位，畫面上的數字每次都是從 `book_copies` 現算出來的。代價是每次查詢多兩個子查詢，換來的是主檔與明細不可能對不上帳。見規格書 §6.6。

**看一本書有哪幾本複本**

```sql
SELECT id, book_id, copy_barcode, copy_status FROM book_copies WHERE book_id = 4;
```

「台灣通史新編」只有一本，條碼 `0004-001`。做完第一個練習的第 1 步再跑一次，`copy_status` 會從 `available` 變成 `borrowed`。

**看借閱紀錄，以及逾期是怎麼算出來的**

先在畫面上借一本書，然後執行：

```sql
SELECT id, borrower_id, due_at, loan_status,
       CASE WHEN returned_at IS NULL AND due_at < datetime('now')
            THEN 1 ELSE 0 END AS is_overdue
FROM loans;
```

`loan_status` 只有 `borrowed` 與 `returned` 兩種值，**沒有 `overdue`**。逾期是查詢時用「還沒還、而且應還時間早於現在」推導出來的，時間往前走，狀態就自動正確，不需要排程去更新。

另外注意時間欄位：`datetime('now')` 產生的是 UTC 時間，比台灣時間慢 8 小時（規格書 KI-35）。

**把四張表接起來，重現借閱管理頁**

```sql
SELECT l.id,
       COALESCE(u.name, u.email) AS 借閱人,
       b.title                   AS 書名,
       c.copy_barcode            AS 條碼,
       l.due_at                  AS 應還時間,
       l.loan_status             AS 狀態
FROM loans l
JOIN users       u ON u.id = l.borrower_id
JOIN books       b ON b.id = l.book_id
JOIN book_copies c ON c.id = l.copy_id
ORDER BY l.borrowed_at DESC;
```

`loans` 同時存了 `book_id` 與 `copy_id`。`book_id` 其實可以從 `copy_id` 查出來，這是規格書 §6.4 說明的「唯一被允許的冗餘」——想想看為什麼要多存這一欄。

**觀察預約佇列的變化**

做第一個練習時，每一步都回來跑這個查詢：

```sql
SELECT id, book_id, user_id, reserved_at, ready_at, reservation_status
FROM reservations
WHERE book_id = 4
ORDER BY reserved_at;
```

| 步驟 | 預期的 `reservation_status` |
|------|---------------------------|
| 館員按下預約 | `waiting` |
| 讀者歸還 | `ready`（`ready_at` 同時有值） |
| 館員按「立即借閱」 | `fulfilled` |

順位不存在資料表裡，是依 `reserved_at` 排出來的。

**驗證軟刪除**

先在系統畫面上用館員身分下架一筆書目，然後回來執行：

```sql
SELECT id, title, is_deleted FROM books;
```

會發現那筆資料**還在**，只是 `is_deleted` 變成 `1`。系統從來不真的執行 `DELETE`。

### 觀察就好，不要直接改

**建議只讀不寫。** 資料庫可以隨意查詢，但要改資料請透過系統的畫面操作。

原因是很多規則寫在程式裡而不是資料庫裡。舉例來說，「每人同時最多借 5 冊」「有逾期就不能借書」「借出中的複本不能刪除」「館員不能停用自己的帳號」這些規則都是 Python 程式在檢查的，資料庫本身完全不知道有這回事——這個系統的五張表甚至沒有啟用外鍵約束，`books.isbn` 也沒有 `UNIQUE` 約束（見規格書 KI-31、KI-32）。直接下 SQL 可以輕易做出系統本身永遠不會產生的狀態，之後就很難判斷你看到的行為是系統的設計，還是自己改壞的。

另外兩點：

- **伺服器執行中不要改資料庫**，容易與正在進行的寫入衝突
- 改壞了不用緊張，照〈重置資料庫〉刪掉資料庫檔後重新啟動，就會回到乾淨的初始狀態

如果你的目的是「想知道改了某個欄位系統會怎麼反應」，那正是值得做的實驗——但請在改之前先想好預期會發生什麼，改完再回頭驗證，這樣才有分析的價值。

---

## 執行測試

```bash
pytest                                  # 執行全部 218 個測試
pytest tests/test_loans.py -v           # 只執行借閱的測試
pytest -k "overdue"                     # 執行名稱含 overdue 的測試
```

測試不會動到 `database.db`——每個測試函式都會建立自己的暫存資料庫。各測試檔的案例數見規格書 §12.4。

---

## 給開發者

### 三個設計層級的決定

- **在架冊數即時彙總，不存欄位** — 在架冊數由 `book_copies` 算出來，不會與實際狀況脫節
- **逾期在查詢時推導，不用狀態欄位** — 時間往前走，狀態自動正確，不需要排程去更新
- **交易子系統一律檢查帳號有效性** — 停用帳號持有舊 session 也借不到書

三者的理由與代價見規格書 §11.5。

### 已知限制

系統刻意維持教學規模，以下功能明確不包含：罰款計算、館際互借、條碼掃描、郵件通知、採購編目、統計報表、預約保留架（見規格書 §1.2）。

安全性方面尚未實作 CSRF token、登入失敗次數限制、Cookie 安全旗標。完整的技術債清單（24 項，含「為何修」與「為何不修」的判準）見規格書第 11 章。

**正式部署前必須**：覆寫 `SECRET_KEY`、關閉 `app.py` 中的 `debug=True`、改用 WSGI 伺服器（KI-01、KI-02、KI-08）。

### 環境變數

| 變數 | 預設值 | 說明 |
|------|--------|------|
| `SECRET_KEY` | `dev-secret-key-change-in-production` | Flask session 簽章金鑰，**正式環境必須覆寫** |
| `DB_PATH` | `database.db` | SQLite 檔案路徑；Docker 中設為 `/app/data/database.db` |

### 其他文件

- [CLAUDE.md](CLAUDE.md) — 專案速查、目錄地圖、七個子系統
- 各子系統的 `blueprints/<name>/CLAUDE.md` — 該子系統的職責與設計決策
- [rules/flask-blueprint.md](rules/flask-blueprint.md) — Blueprint 路由與表單的實作規範
- [rules/database.md](rules/database.md) — `db/` 套件、transaction、軟刪除的實作規範
- [tests/CLAUDE.md](tests/CLAUDE.md) — 測試撰寫指引
- [document/system-spec.md](document/system-spec.md) 第 11 章 — 已知技術債，含每一條的接受理由與修補方向
