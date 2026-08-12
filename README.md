# 系統分析與設計（System Analysis and Design, SAD）

元智大學工業工程與管理學系「系統分析與設計」（課號 IE226）的課程教材與課程規範，全部以繁體中文撰寫、以 Markdown 格式維護，公開於此供修課同學閱讀。

本課程採 **專題導向（Project-Based Learning）**：不考試，用兩份小組報告、一次個人訪談與一份個人學習與貢獻報告檢核學習成果。這個儲存庫收錄課程介紹、報告與分組規範、評量規準、十三章教材、兩組範例報告，以及期中要分析的六套範例系統，各章投影片陸續產出中。

| 項目 | 內容 |
|---|---|
| 學期（課號） | 115-1（IE226） |
| 學分數 | 3 學分 |
| 授課老師 | 呂卓勲 |
| Email | chohsunlu@saturn.yzu.edu.tw |
| Office Hour | 每週四 13:30–16:30 |
| 上課時間 | 每週三，第 2–4 節，共三小時 |
| 上課地點 | *待補* |
| 課程內容 | 以「系統分析與設計」為核心，採專題導向（Project-Based Learning）教學。學生透過實際案例分析、需求萃取、系統設計、文件撰寫與成果報告，建立資訊系統開發所需的分析與設計能力 |

---

## 🖥️ 請用電腦的瀏覽器閱讀

> **這些文件是為了在電腦上閱讀而寫的。用手機看，很容易漏掉會影響你成績的規則。**

不是排版好不好看的問題，是手機上真的會讀漏：

- **表格會被截掉**。繳交期限、扣分規定、曠課計算幾乎都寫在表格裡，手機螢幕塞不下，右邊幾欄要橫向滑動才看得到——而多數人不會滑，就這樣漏掉「最晚可繳交時間」那一欄。
- **流程圖（Mermaid）縮成一團**。分組規範裡「組員中途消失了怎麼辦？」是一張流程圖，手機上可能渲染不出來，或者字會小到看不清分支條件。
- **文件很長，需要對照著讀**。規範文件之間互相引用，電腦上開兩個分頁對照最快，手機來回切換很容易失去脈絡。
- **投影片檔（`.slides.md`）需要工具才看得出樣子**。它是 [Marp](https://marp.app/) 格式，在 GitHub 上只會顯示成一長串 Markdown；要看成投影片，請用 VS Code 安裝 **Marp for VS Code** 擴充套件開啟。或者也可以去 Portal 上下載 PDF 版本。

**建議做法**：找一次坐在電腦前的時間，把課程介紹與報告規範從頭讀完一遍，再做一次理解測驗。手機適合用來查「期中報告哪天交」，不適合用來第一次讀完全部規則。

---

## ⚡ 重點速覽

下表是提醒，**不能取代全文**。每一列的完整條件與例外都在「詳見」欄指出的文件與章節裡，真的發生爭議時以該處的條文為準。

| 項目 | 重點 | 詳見 |
|---|---|---|
| 配分 | 期中小組報告 30%、期末小組報告 30%、期末個人訪談 20%、個人學習與貢獻報告 15%、出席 5% | [SAD 課程介紹](00-Course-Introduction/Course-Introduction.md)〈學期配分比重〉 |
| 關鍵日期 | 期中報告 **11/4（第 9 週）**、期末報告 **12/23（第 16 週）**；**11/25 不上課**，該時數挪作期末個人訪談，時段以線上表單自選 | [SAD 課程介紹](00-Course-Introduction/Course-Introduction.md)〈課程預計進度表〉 |
| 繳交 | 一律 **PDF 上傳學校 Portal**（不收紙本與其他管道）；書面在報告或訪談日 **前一個星期五 23:59:59**，投影片在報告 **當週星期五 23:59:59**，以 **Portal 記錄為準** | [報告規範](00-Course-Introduction/Report-Rules.md) |
| 書面與口頭 | **分開計分**：沒交書面就是書面 0 分，沒上台就是口頭 0 分。但沒有書面，老師沒有可對照的文件，**口頭的分數也會大幅下降** | 同上 |
| 四項會互相影響 | 四個項目各自計分，**沒有任何一項是另一項的參加資格**；但訪談問的、個人報告寫的都是小組報告裡做過的事，**少做一項，後面的分數一定跟著掉** | 同上 |
| 扣分 | 每份報告以 100 分計。書面：**遲交扣 10 分**、**檔案有問題經通知後補上扣 5 分**、**缺交或遲交又交出打不開的檔案，該部分 0 分**；投影片：**過了期限一律扣口頭 10 分，不通知補交** | [成績計算規範](00-Course-Introduction/Grading-Rules.md) |
| Portal 故障 | 系統端問題不用自己承擔，但要 **在期限前通報**；備援管道與新期限 **公告於 LINE 群組** | [報告規範](00-Course-Introduction/Report-Rules.md) |
| 加分 | 唯一的加分機制，**上限 3 分加在學期成績上**：做清單以外的內容（全組 +1）、把雛型系統實作出來（**實際動手的人 +2、同組其他人 +1**）。**基本項目沒做完不給、說不出所以然不給** | [額外投入加分](00-Course-Introduction/Bonus-Rules.md) |
| 分組 | 3–4 人一組，**第三週前** 確定名單；組員變動申請 **最晚第 10 週（11/11）** | [分組規範](00-Course-Introduction/Group-Rules.md) |
| 出席 | 只看曠課，**曠課超過 18 小時逕行扣考**，扣考等於期末小組報告與個人兩項全部不計分 | [SAD 課程介紹](00-Course-Introduction/Course-Introduction.md)〈課堂規範〉 |
| 公告管道 | 所有公告都在 **LINE 群組**，請務必加入 | [SAD 課程介紹](00-Course-Introduction/Course-Introduction.md)〈LINE 群組〉 |

---

## 📚 這裡有哪些文件

### 基本規範

課程怎麼跑、報告怎麼交，全部的起點在這兩份。

| 文件 | 檔名 | 內容 |
|---|---|---|
| [SAD 課程介紹](00-Course-Introduction/Course-Introduction.md) | `Course-Introduction.md` | 課程基本資訊、18 週進度表、學期配分、兩份小組報告的產出項目、期末個人訪談、AI 工具使用揭露、出席與扣考、成績申訴管道 |
| [報告規範](00-Course-Introduction/Report-Rules.md) | `Report-Rules.md` | 繳交規則的事實來源：交什麼、怎麼交、期限是哪一天、準時／遲交／缺交的定義、口頭報告規範、學術誠信、不可抗力 |

### 規範細節說明

上面兩份訂下的規則，細節分別展開在這五份裡。**每一份在自己的範圍內是唯一的事實來源**，其他文件只引用不重述，所以查某件事時直接翻對應的那一份就好。

| 文件 | 檔名 | 內容 |
|---|---|---|
| [報告內容](00-Course-Introduction/Report-Contents.md) | `Report-Contents.md` | 各項報告要交出什麼內容，**列出的項目都要完成**：期中九項、期末八項、口頭要講到的項目與報告時間、訪談的四類題型、個人報告的篇幅與章節 |
| [報告評量 Rubrics](00-Course-Introduction/Rubrics.md) | `Rubrics.md` | 四個評分項目的評量規準與等第、分數的換算。分數是照這份規準給的，覺得分數不理想時先自己對照一遍 |
| [成績計算規範](00-Course-Introduction/Grading-Rules.md) | `Grading-Rules.md` | **所有分數與扣分規定的事實來源**：學期成績公式、內容分數與繳交扣分、什麼情況直接 0 分、雷同與扣考、某一項未完成時的學期成績上限 |
| [分組規範](00-Course-Introduction/Group-Rules.md) | `Group-Rules.md` | 組隊人數與名單期限、分工紀錄、組內衝突、組員變動申請、人力減損與組員中途消失 |
| [額外投入加分](00-Course-Introduction/Bonus-Rules.md) | `Bonus-Rules.md` | 想多做一點的同學再看，**不看不影響成績**：做清單以外的內容、把雛型系統實作出來可以加分，上限 3 分 |

> **建議在第二週（9/16）上課前，把〈基本規範〉與〈規範細節說明〉讀過一遍**（〈額外投入加分〉可以先跳過）。為什麼規範寫得這麼長、讀的時候該抓什麼重點，見文末的〈老師的話〉。

### 參考文件

用來幫你準備報告與自我檢核，本身不另訂規定。

| 文件 | 檔名 | 內容 |
|---|---|---|
| [參考題庫](00-Course-Introduction/Question-Bank.md) | `Question-Bank.md` | 口頭報告與個人訪談的提問方向。**是方向不是考古題**，實際題目來自各組自己的書面報告 |
| [課程規範理解測驗](00-Course-Introduction/Course-Rules-Quiz.md) | `Course-Rules-Quiz.md` | 36 題是非題，附解答與出處章節。**不計分、不用繳交，也不用給老師看**，用來確認你記得的版本是不是對的 |
| [課程介紹投影片](00-Course-Introduction/Course-Introduction.slides.md) | `Course-Introduction.slides.md` | 第一週上課用（Marp 格式）。只放會扣分或錯過補不回來的規則，完整條文一律以規範文件為準 |

### 範例報告

兩個階段各一組，成品與說明成對出現：成品讓你看「交出去的東西長什麼樣」，說明講每一項該有什麼欄位、為什麼這樣寫。期中那一組收在 `02-Midterm-Project-Example-Reports/`，期末那一組收在 `04-Final-Project-Example-Reports/`。

**都是範例不是答案。** 寫得精簡是為了讓你看懂結構，各組題目不同，不能照抄。兩個階段刻意用不同的示範系統：分析階段用課堂範例系統，設計階段用工廠訪客進出登記系統——**那一題刻意不在五個期末題目之中**，所以你抄得到結構，抄不到答案。

| 文件 | 檔名 | 內容 |
|---|---|---|
| [系統分析範例報告](02-Midterm-Project-Example-Reports/Analysis-Phase-Sample-Report.md) | `Analysis-Phase-Sample-Report.md` | 一份寫好的期中報告成品，只有內容、沒有解說 |
| [系統分析範例報告說明](02-Midterm-Project-Example-Reports/Analysis-Phase-Deliverables.md) | `Analysis-Phase-Deliverables.md` | 上面那份範例報告的解說：每一項該有的欄位、為什麼這樣寫、UML 圖例與方法出處 |
| [系統設計範例報告](04-Final-Project-Example-Reports/Design-Phase-Sample-Report.md) | `Design-Phase-Sample-Report.md` | 一份寫好的期末報告成品，只有內容、沒有解說 |
| [系統設計範例報告說明](04-Final-Project-Example-Reports/Design-Phase-Deliverables.md) | `Design-Phase-Deliverables.md` | 上面那份設計報告的解說：每一項該有的欄位、為什麼這樣決定、圖怎麼畫與方法出處 |

### 期中要分析的範例系統

期中報告分析的是既有系統，所以系統本身要跑得起來、看得到原始碼。系統收在 `03-Midterm-Project-Example-Systems/`，都是 Python + Flask + SQLite 寫成，操作介面與資料表結構相近；各組可選的有以下五套。

| 系統 | 資料夾 | 情境 |
|---|---|---|
| [器材借用系統](03-Midterm-Project-Example-Systems/SAD-Equipment/README.md) | `SAD-Equipment/` | 器材的借用申請、審核、借出與歸還，含狀態機與庫存數量的一致性 |
| [活動報名系統](03-Midterm-Project-Example-Systems/SAD-Events/README.md) | `SAD-Events/` | 校園活動的建立與報名，含活動狀態、名額限制與「發起者」這種由資料決定的權限 |
| [校園訂餐系統](03-Midterm-Project-Example-Systems/SAD-Meal-Order/README.md) | `SAD-Meal-Order/` | 菜單維護、線上訂餐、訂單審核與登記取餐，含訂單狀態機與剩餘份數的佔用和回補 |
| [校園宿舍報修系統](03-Midterm-Project-Example-Systems/SAD-Dormitory-Repair/README.md) | `SAD-Dormitory-Repair/` | 報修的申報、派工、處理與結案，含六個狀態的流轉、資料範圍權限與處理歷程 |
| [校園小型圖書借閱系統](03-Midterm-Project-Example-Systems/SAD-Library/README.md) | `SAD-Library/` | 館藏查詢、借書、續借、還書與預約候補，含書目與複本的分層、算出來的在架冊數與逾期 |

前三套的規模與難度相當，宿舍報修的流程最長，圖書借閱的資料結構最複雜——挑題前先看[索引](03-Midterm-Project-Example-Systems/README.md)〈三〉的比較。

同一個資料夾底下還有一套討論區系統（`SAD-Forum/`），**那是上一節的範例報告拿來示範的系統，不是各組可選的題目**。想知道一份分析報告從系統推導到什麼程度，可以拿它和範例報告對著看。每套系統的定位、共通概念與使用步驟，見這個資料夾的[索引](03-Midterm-Project-Example-Systems/README.md)。

每套系統的資料夾內都附有系統規格書與建置流程書（`document/`），**但那是給你對照用的參考，不是你報告的替代品**——分析要自己從畫面、流程與程式碼推導出來。怎麼把系統跑起來，見各系統自己的 `README.md`。

### 期末報告的題目

期末設計的題目是工廠或製造現場的管理系統，五題選一。每題一份說明書，收在 `05-Final-Project-Topics/`，另有一份[索引](05-Final-Project-Topics/README.md)說明選題判準、使用步驟與不建議做的方向。

| 題目 | 領域 | 難度 | 這一題要想清楚的問題 |
|---|---|---|---|
| [工具借用與歸還管理系統](05-Final-Project-Topics/Tool-Loan-and-Return.md) | 生產現場管理 | 入門 | 「這支工具在誰手上」要存成欄位，還是由借用紀錄推出來 |
| [品質異常回報管理系統](05-Final-Project-Topics/Quality-Issue-Reporting.md) | 品質管理 | 入門 | 「處理完了」跟「可以結案了」不是同一件事 |
| [倉庫盤點管理系統](05-Final-Project-Topics/Inventory-Stocktaking.md) | 物料與倉儲 | 標準 | 盤點期間帳面還在變，比對的基準要不要凍結 |
| [設備保養紀錄管理系統](05-Final-Project-Topics/Equipment-Maintenance.md) | 設備維護 | 標準 | 「下次應保養日」是算出來的還是填出來的 |
| [員工教育訓練紀錄系統](05-Final-Project-Topics/Training-Records.md) | 人力資源與工安 | 標準 | 報名、簽到、完成是三件事，一個欄位裝不下 |

**是題目說明不是參考答案。** 五份給的只有情境、名詞、角色、一張單子的一生，以及這一題真正要想的問題；ERD、資料表、模組清單與畫面線框都是你的工作，也是分數所在。難度只反映「要想的事情有幾層」，不反映分數上限——**入門題做得深，分數會高過標準題做得淺**。

### 教材正文

**這十三章就是上課會講的課文**，依編號順序上，投影片只是課文的濃縮版。哪一週講哪一章，見 [SAD 課程介紹](00-Course-Introduction/Course-Introduction.md)〈課程預計進度表〉的「對應報告項目與提醒」欄。課堂上聽過不等於讀過，當週那一章請自己讀完。

內容是概念說明，和上一節的兩份範例報告說明搭配著看：說明講每一項要交什麼，教材講那件事是怎麼做的。

| # | 文件 | 檔名 | 內容 |
|---|---|---|---|
| 1 | [系統分析與設計導論](01-Course-Materials/01-Systems-and-Analysis.md) | `01-Systems-and-Analysis.md` | 整門課的共同語彙：系統與資訊系統的組成、分析與設計的分界、系統開發生命週期、開發方法論、專案角色分工、系統為什麼會失敗 |
| 2 | [問題定義與現況分析](01-Course-Materials/02-Problem-Definition.md) | `02-Problem-Definition.md` | 從既有系統反推當初要解決的問題：問題定義的四件事、5 Why 與魚骨圖、可驗收的目標與成功指標、問題定義書、現況問題與改善建議 |
| 3 | [使用者分析](01-Course-Materials/03-User-Analysis.md) | `03-User-Analysis.md` | 分析階段的第一步：利害關係人分析、需求收集方法、使用者分群與人物誌、流程分析與事件表、使用案例圖 |
| 4 | [系統需求分析](01-Course-Materials/04-System-Requirements-Analysis.md) | `04-System-Requirements-Analysis.md` | 把使用案例展開成需求：需求的五個級別、功能需求與非功能需求的寫法、需求品質判準、優先順序與追溯、系統需求規格 |
| 5 | [功能分析](01-Course-Materials/05-Functional-Analysis.md) | `05-Functional-Analysis.md` | 把需求整理成系統的功能結構：系統邊界與範圍外清單、情境圖、功能分解、資料流程圖、功能清單與模組劃分、CRUD 矩陣、模組設計 |
| 6 | [行為建模](01-Course-Materials/06-Behavioral-Modeling.md) | `06-Behavioral-Modeling.md` | 補上系統的動態面：活動圖與泳道、系統循序圖、狀態機圖，以及三張圖在設計階段的深化與交叉檢核 |
| 7 | [資料建模與資料庫設計](01-Course-Materials/07-Data-Modeling.md) | `07-Data-Modeling.md` | 系統要記住什麼：實體關聯圖與基數、從需求找實體、正規化、資料字典與值域，以及期中反推與期末推導兩種做法 |
| 8 | [系統環境與架構](01-Course-Materials/08-System-Architecture.md) | `08-System-Architecture.md` | 系統放在哪裡、和誰連：使用者端與應用系統與資料庫的三段結構、外部系統與現場設備、地端與雲端的取捨、非功能需求如何決定架構 |
| 9 | [可行性、限制與風險分析](01-Course-Materials/09-Feasibility-and-Risk.md) | `09-Feasibility-and-Risk.md` | 設計與現實的對帳：技術／經濟／組織／時程四面向可行性、成本效益估算、六類系統限制、風險辨識與評估、風險如何回頭改動設計 |
| 10 | [物件建模](01-Course-Materials/10-Object-Modeling.md) | `10-Object-Modeling.md` | 概念類別圖：類別與關係、多重性、只放領域概念的原則，以及它與 ERD 到底差在哪 |
| 11 | [系統介面與資料交換設計](01-Course-Materials/11-System-Interface-and-Data-Exchange.md) | `11-System-Interface-and-Data-Exchange.md` | 兩套系統之間那條線：資料來源與去向、交換內容與欄位對應、時機與頻率、失敗處理，REST API 列為可選 |
| 12 | [使用者介面設計](01-Course-Materials/12-UI-Design.md) | `12-UI-Design.md` | 從需求與流程推出畫面：使用性原則、線框圖與保真度、畫面欄位對回資料字典、現場的介面限制 |
| 13 | [系統設計規格與追溯](01-Course-Materials/13-Design-Specification.md) | `13-Design-Specification.md` | 把各章產出收成一套設計：規格書架構、五段追溯鏈、六種常見的不一致、設計決策紀錄、交件前的檢查清單 |

---

## 🔄 文件版本

- 文件若有異動（例如日期調整或條文修訂），會於課程 **LINE 群組** 公告，並以 **儲存庫中的最新版本** 為準。
- 各次修訂的內容可從 [commit 紀錄](../../commits/main) 查閱。
- 對規範內容有疑問，歡迎在課堂上、Office Hour 或 LINE 群組提出。

---

## 🤖 這份教材是怎麼做出來的

**這個儲存庫裡的文字，是老師與 AI 協作的成果，全部經過老師逐份審閱之後才放上來。內容正確與否的責任在老師，不在工具。**

課程要求同學揭露 AI 使用（見 [SAD 課程介紹](00-Course-Introduction/Course-Introduction.md)〈AI 工具使用揭露〉），老師自己當然也照同一張表揭露：

| 項目 | 說明 |
|---|---|
| 使用工具 | Anthropic 的 Claude（透過 Claude Code 使用，Opus 系列模型） |
| 使用目的 | 章節草稿撰寫、文字整理與潤稿、跨文件的一致性檢查與交叉引用比對 |
| 使用範圍 | 各章教材正文、兩組範例報告、課程規範文件與本檔的文字；圖表與截圖不在此列 |
| 人工查核與修改 | 課程設定、規則、日期、配分、評分標準與所有教學上的取捨，一律由老師決定；AI 產出的每一段都經老師閱讀、修改或重寫後才提交，未經審閱的內容不會出現在這裡 |

**這也是在示範一件事**：用了 AI 不等於可以不負責。你的報告也一樣——寫得出來、說得出來、改得動，才是你的東西。

**發現錯誤請告訴老師。** 錯字、前後矛盾、連結點不開、日期或分數對不上，都算。修課同學直接在課堂上、Office Hour 或 LINE 群組講；校外讀者可以在本儲存庫開 Issue。文件很長，交叉引用又多，一定有漏掉的地方，收到就會更正。

---

# 🗣️ 老師的話

這幾份文件很長，但每一條都可能影響你的成績。請不要只在第一週聽老師講過一次就算了，找時間自己從頭到尾讀完一遍。課程規範不會因為你沒讀而不適用，學期中真的出狀況時，老師是依文件處理，不是依你記得的版本。

不過也要說另一面：**規則通常是為了處理例外而存在的。**

它們之所以這麼長，是因為要把「沒交、遲交、檔案打不開、人沒到、組員中途消失」這些狀況一條一條寫清楚。

反過來說，只要你照基本原則走「**準時交、到場報告、寫自己做過的事**」——這些條文有一大半跟你沒有關係，掌握重點就夠了。真的需要翻到那些細節的時候，通常表示事情已經出狀況了。

因此，**請同學不要花太多心思在「這個不想做、那個不想寫，有沒有辦法混過去？」** 你花在研究怎麼凹的時間，多半比把那份文件寫完還多，而且拿不到分數。同樣的力氣拿去把報告寫好、上台好好講、該訪談的時候到場，分數自然就有了。

如果你覺得有些規定不太能接受，歡迎直接跟老師聊聊，也許只是還沒說清楚。這些規範對全班一體適用，老師沒辦法為個別同學調整；如果談過還是覺得不合適，**趁加退選期間想清楚要不要繼續修這門課就好**，在還有選擇的時候做決定，總比整學期都不自在來得好。

---

## 📄 授權與使用聲明

本儲存庫的教材與文件採 **[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh-hant)**（姓名標示—非商業性—相同方式分享）授權：

- **姓名標示**：使用時請標明出處與作者。
- **非商業性**：不得用於商業用途。
- **相同方式分享**：若改作或加以轉換，須以相同授權條款散布。

### 授權例外

以下項目不適用上述 CC BY-NC-SA 授權，改依表中各自的授權條款：

| 項目 | 作者 | 授權 | 位置 |
|---|---|---|---|
| 期中範例系統的程式碼與系統文件 | Cho-Hsun Lu | MIT | [`03-Midterm-Project-Example-Systems/`](03-Midterm-Project-Example-Systems/)（LICENSE 置於該資料夾內，涵蓋底下六套系統） |
| `speak-human-tw` skill | Raymond Hou | MIT | [`.claude/skills/speak-human-tw/`](.claude/skills/speak-human-tw/)（原始 LICENSE 保留於該資料夾內） |
| 學則截圖 `course-attendance-rule.png` | 元智大學 | 校方公開規章，依著作權法為授課目的引用，著作權仍屬元智大學 | `00-Course-Introduction/images/`（引用於 [SAD 課程介紹](00-Course-Introduction/Course-Introduction.md)〈課堂規範〉） |

課程規範類文件（課程介紹、報告規範、分組規範、評量規準、理解測驗）僅適用於本學期本課程，其他課程如需參考，請自行依實際狀況調整，勿直接沿用日期與扣分規定。
