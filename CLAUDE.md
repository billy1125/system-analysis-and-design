# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 專案概述

元智大學「系統分析與設計」（課號 IE226）的課程教材儲存庫，修課對象為工業工程與管理系學生，所有內容以 **繁體中文（台灣用語）** 撰寫。

專案無建置系統、測試套件或 CI/CD，只有 Markdown 文件，因此沒有 build／lint／test 指令可執行。驗證方式是人工檢視：正文在 GitHub 或 Markdown 預覽工具中看排版，投影片（`.slides.md`）用 VS Code 的 Marp for VS Code 擴充套件預覽。

**目前專案時常修改，必須要隨時監測** 目前 Git 的狀態，是否有新增、刪除與修改檔案。

## 資料夾架構

| 資料夾 | 說明 |
|---|---|
| `00-Course-Introduction/` | 課程規範與參考文件共九份，引用的圖片放在其下的 `images/` |
| `01-Course-Materials/` | 教材正文，引用的圖片放在其下的 `images/` |
| `02-Project-Topics/` | 期末設計題目說明書，一題一份，加一份 `README.md` 當索引。**是題目說明不是參考答案**：只給情境、名詞、角色、單據生命週期與設計難點，不給 ERD、資料表、模組清單與畫面線框 |
| `example-system/` | 繳交規範與範例報告進版控；底下的範例系統 `sad-forum/` **不進版控**，只存在本機工作區。它會一直出現在 `git status` 的未追蹤清單裡，不要 `git add`，也不要寫進 `.gitignore` |
| `reference/` | 長期保留的範本與撰寫規範，是全專案的格式基準，會隨慣例調整而更新 |
| `.claude/skills/` | Claude Code 技能，一個技能一個資料夾 |

根目錄只放**全專案層級的索引與規劃文件**，目前為 `README.md`、`TEXTBOOK-PLAN.md`、`PROJECT-TOPICS.md` 與本檔。其餘文件一律收進所屬的章節資料夾，圖片跟著引用它的文章走。新增根目錄文件時要一併更新這句話的清單。

教材正文放 `01-Course-Materials/`，**檔名不加數字序號**（如 `User-Analysis.md`），閱讀順序由 `README.md`〈教材正文〉的表格排序決定。此處與 `reference/chapter-template.md` 所寫的「根目錄下的 `0X-XXX.md`」不同，以本檔為準。

**動筆寫任何一章教材之前，先讀 `TEXTBOOK-PLAN.md`**。那份是教材的施工藍圖：十四章的清單、每章的小節規劃與邊界、與報告產出項目的對應、撰寫順序，以及寫完一章要連帶更新哪些檔案。寫完一章要回頭更新它的狀態欄。本檔規定課程設定與跨檔一致性，`TEXTBOOK-PLAN.md` 規定章節範圍，`reference/` 規定格式。

## 文件清單

`00-Course-Introduction/` 的九份課程文件是同一套規則的不同切面。前四份是 `README.md` 歸類的「基本規範」，後五份是「參考文件」。

| 檔案 | 內容 | 密切關係 |
|---|---|---|
| `Course-Introduction.md` | **課程設定的事實來源**：課程基本資訊表、18 週進度與日期、學期配分、期中／期末產出清單、期末個人訪談、AI 工具使用揭露、出席與扣考、成績申訴 | 產出清單由 `Report-Contents.md` 展開、由 `Rubrics.md` 評分；日期與配分要同步到 `Course-Introduction.slides.md` 與 `README.md`〈⚡ 重點速覽〉 |
| `Report-Rules.md` | **繳交規則的事實來源**：交什麼、怎麼交、期限、準時／遲交／缺交的定義、口頭報告規範、學術誠信、不可抗力 | 遇到分數一律指向 `Grading-Rules.md`；期限日期須與 `Course-Introduction.md` 一致 |
| `Grading-Rules.md` | **所有分數與扣分規定的事實來源**：學期成績公式、內容分數與繳交扣分、什麼情況直接 0 分、雷同與扣考、某一項未完成時的學期成績上限、期中預警的 A/B/C/D 等第換算 | 其他文件一律引用而不重述，**不要把分數散回其他文件** |
| `Group-Rules.md` | 組隊人數與名單期限、分工紀錄、組內衝突、組員變動申請、人力減損與組員中途消失 | 扣分指向 `Grading-Rules.md`、繳交方式指向 `Report-Rules.md` |
| `Rubrics.md` | 四個評分項目的評量規準與等第換算，只處理「內容分數」；每套 Rubric 的各面向配分加總必須為 100 | 評量面向必須對得上 `Course-Introduction.md` 的產出清單與 `Report-Contents.md` 的內容清單，不評課程沒教也沒要求的東西 |
| `Report-Contents.md` | 各項報告要交出什麼內容：書面項目清單、口頭要講到的項目與報告時間、訪談的四類題型、個人報告的篇幅與章節。**列出的項目都是必做**，章節名稱可自訂；本身不含任何扣分規定 | 產出清單本身以 `Course-Introduction.md` 為準，這份是把它展開；評分標準指向 `Rubrics.md`。**不要把內容清單複製回 `Rubrics.md` 或 `Report-Rules.md`** |
| `Bonus-Rules.md` | **唯一的加分機制**：文件類額外項目與雛型系統實作的額度、認定條件、怎麼提出，上限 3 分加在學期成績上 | 加分額度與 `Grading-Rules.md` 公式中的 $B_i$ 一致；「清單以外」的判準以 `Report-Contents.md` 為準 |
| `Question-Bank.md` | 口頭報告與個人訪談的提問方向，**是方向不是考古題**，實際題目來自各組自己的書面報告 | 題型分類須與 `Report-Contents.md` 的四類題型一致 |
| `Course-Rules-Quiz.md` | 30 題是非題附解答與出處章節，自我檢核用，不計分不繳交；第七區對應選讀的 `Bonus-Rules.md` | 前面各份規範的衍生物，只複述不新增規則；解答須標明出處文件與章節 |
| `Course-Introduction.slides.md` | 第一週上課用的 Marp 投影片，只放會扣分或錯過補不回來的規則 | 同上，完整條文一律以規範文件為準 |

**改動任一條規則、扣分數字或日期後，逐一比對其餘文件的交叉引用是否同步。** 專案沒有任何自動化流程能攔截這類不一致，只能靠人工檢查。

### 其他會牽動多個檔案的動作

| 你做了什麼 | 還要一併更新 |
|---|---|
| 新增或更名課程規範文件 | `README.md`〈📚 這裡有哪些文件〉底下的〈基本規範〉或〈參考文件〉表格，以及本檔〈文件連結慣例〉的連結標題對照表 |
| 改動配分、關鍵日期、繳交方式或扣分數字 | `README.md`〈⚡ 重點速覽〉——那張表是四份基本規範的摘要，條文改了它不會自己跟著改 |
| 收錄外部來源圖片 | `README.md`〈📄 授權與使用聲明〉的授權例外表，註明來源、作者與授權條款（依 `reference/chapter-writing-guide.md`〈六〉） |
| 移植外部技能到 `.claude/skills/` | 同上授權例外表，並將原始 `LICENSE` 保留在技能資料夾內 |
| 完成一份章節正文 | 六項連動見 `TEXTBOOK-PLAN.md`〈六〉：`README.md`〈教材正文〉表格、本檔的權威章節清單與終點章設定、前一章的銜接提示、`Report-Contents.md` 的教材連結、`TEXTBOOK-PLAN.md` 的狀態欄 |
| 新增、刪除或重排教材章節 | `TEXTBOOK-PLAN.md`〈三〉章節總表與〈四〉內容概要，以及本檔的權威章節清單 |
| 撰寫任何一章介紹 UML 圖的教材 | 先看 `TEXTBOOK-PLAN.md`〈二〉的四張核心圖與各自的權威章節，該章要點出自己那張圖在四張裡的位置 |
| 改動 `example-system/` 的階段繳交規範或範例報告 | 回頭核對 `01-Course-Materials/` 對應階段的必讀標記（分析階段對 `🔴 期中必讀`，設計階段對 `🔵 期末必讀`）是否仍然成立——標記的判準就是那兩份文件，它們改了標記不會自己跟著改 |

## 撰寫規範

格式規範全部收在 `reference/`。**動筆前先讀完對應的規範文件，再複製骨架檔開始寫**：正文看 `chapter-writing-guide.md` 與 `chapter-template.md`，投影片看 `slides-design-template.md` 與 `slides-template.slides.md`。`personal-voice.md` 是語氣與筆法的蒸餾，不必每次動筆前讀，收尾潤稿或收到指示時再用。

兩邊若有衝突，**格式規則以 `reference/` 為準，課程設定以本檔為準**。

規範文件中以 `{}` 標示、指定由 `CLAUDE.md` 決定的項目，本課程的設定如下：

| 設定項 | 本課程的值 |
|---|---|
| 章節標題副標 | 不加副標，直接寫 `# {章節標題}` |
| 讀者程度 | 工業工程與管理系大學部學生，大一修過基本程式設計，具語法層次的撰寫能力，**但未修過資料結構、資料庫系統與軟體工程，尚未建立完整的系統開發概念**（需求怎麼形成、規格怎麼寫、模組怎麼切、系統怎麼交付與驗收）；資訊技術名詞一律視為需要解釋 |
| 範例取材領域 | 製造業與工業工程場域（生產排程、品管、物料與訂單流程、工廠資訊系統等），情境優先取材自學生實習或未來職場會遇到的系統 |
| 學習重點總結的固定引言 | 「讀完本章後，你應該能夠理解以下核心概念，並將其應用於工業場域的思考與決策：」 |
| 參考文獻取材 | 系統分析與設計領域的經典教科書（如 Dennis、Kendall、Pressman、Sommerville、Yourdon）與原典或里程碑論文（如 Royce 1970、Chen 1976、UML 與敏捷方法的原始文獻），各章約 20 筆以上 |
| 必讀標記 | 兩組：`🔴 期中必讀` 與 `🔵 期末必讀`，接在小節標題之後（格式見 `reference/chapter-writing-guide.md`〈七、7.1〉），同一行並列時期中在前、期末在後。**判準是該小節的產出或方法，在該階段的兩份文件中被明確要求或實際示範**——期中看 `example-system/Analysis-Phase-Deliverables.md` 與 `Analysis-Phase-Sample-Report.md`，期末看 `Design-Phase-Deliverables.md` 與 `Design-Phase-Sample-Report.md`；概念相關但那兩份文件沒有真的用到的一律不標，列為可選項目的（設計類別圖、REST API 規格、部署圖等）也不標。目前 `Systems-and-Analysis.md` 只帶期中標記，`Feasibility-and-Risk.md`、`Object-Modeling.md`、`System-Interface-and-Data-Exchange.md`、`UI-Design.md`、`Design-Specification.md` 五章只帶期末標記，其餘七章兩組都有 |
| 必讀標記的章首說明 | 放在章首導言最後一則 blockquote 之後，全專案措辭一致，依該章帶哪幾組標記三擇一。**只有期中**：「> **期中必讀標記**：標題後加註 🔴 期中必讀 的小節，是期中小組報告九項產出直接會用到的內容。判準見[「系統分析階段繳交規範」](../example-system/Analysis-Phase-Deliverables.md)，成品的樣子見[「系統分析範例報告」](../example-system/Analysis-Phase-Sample-Report.md)。未標記的小節仍屬課程範圍，只是期中不會直接產出。」**只有期末**：同上句型，標記換成 🔵 期末必讀、九項換成八項、兩份文件換成[「系統設計階段繳交規範」](../example-system/Design-Phase-Deliverables.md)與[「系統設計範例報告」](../example-system/Design-Phase-Sample-Report.md)。**兩組都有**：合寫成一則，不各寫一則——「> **必讀標記**：標題後加註 🔴 期中必讀 的小節，是期中小組報告九項產出直接會用到的內容；加註 🔵 期末必讀 的，是期末八項產出直接會用到的。判準與成品的樣子，期中見[「系統分析階段繳交規範」](../example-system/Analysis-Phase-Deliverables.md)與[「系統分析範例報告」](../example-system/Analysis-Phase-Sample-Report.md)，期末見[「系統設計階段繳交規範」](../example-system/Design-Phase-Deliverables.md)與[「系統設計範例報告」](../example-system/Design-Phase-Sample-Report.md)。未標記的小節仍屬課程範圍，只是報告不會直接產出。」 |
| 權威章節清單 | 見下表，新增章節時一併維護 |
| 終點章與銜接順序 | 十三章全部完成，順序為 `Systems-and-Analysis.md` → `Problem-Definition.md` → `User-Analysis.md` → `System-Requirements-Analysis.md` → `Functional-Analysis.md` → `Behavioral-Modeling.md` → `Data-Modeling.md` → `System-Architecture.md` → `Feasibility-and-Risk.md` → `Object-Modeling.md` → `System-Interface-and-Data-Exchange.md` → `UI-Design.md` → `Design-Specification.md`。**`Design-Specification.md` 是全書終點章**，不加 `> **銜接提示**`；其餘各章末尾都要有銜接提示指向下一章 |

**權威章節清單（主題 → 完整介紹該主題的章節）**

| 主題 | 權威章節 |
|---|---|
| 系統的四要素、邊界與環境、子系統 | `01-Course-Materials/Systems-and-Analysis.md` |
| 資料與資訊的差別、資訊系統的五個組成、ERP／MES／WMS／QMS | `01-Course-Materials/Systems-and-Analysis.md` |
| 分析與設計的分界、系統分析師的角色、工管背景在系統專案的定位 | `01-Course-Materials/Systems-and-Analysis.md` |
| 系統開發生命週期、瀑布／疊代／敏捷、專案角色分工、錯誤成本曲線 | `01-Course-Materials/Systems-and-Analysis.md` |
| 問題定義的四件事、從既有系統反推問題、5 Why 與魚骨圖、問題陳述的寫法 | `01-Course-Materials/Problem-Definition.md` |
| 可驗收的目標與成功指標、SMART、問題定義書 | `01-Course-Materials/Problem-Definition.md` |
| 現況問題的盤點、改善建議的三個層次（流程／系統／組織） | `01-Course-Materials/Problem-Definition.md` |
| 利害關係人分析、RACI、需求收集方法（質化／量化）、使用者分群、目標受眾與 STP、人物誌 | `01-Course-Materials/User-Analysis.md` |
| 流程分析（AS-IS／TO-BE、泳道圖）、事件與事件表 | `01-Course-Materials/User-Analysis.md` |
| 使用案例圖、使用案例敘述、參與者、«include»／«extend» | `01-Course-Materials/User-Analysis.md` |
| 需求的五個級別、需求工程四階段 | `01-Course-Materials/System-Requirements-Analysis.md` |
| 功能需求與非功能需求、FURPS+、需求品質判準、MoSCoW、追溯矩陣、SRS | `01-Course-Materials/System-Requirements-Analysis.md` |
| 系統邊界、情境圖、範圍外清單與範圍蔓延 | `01-Course-Materials/Functional-Analysis.md` |
| 功能分解與功能階層圖、資料流程圖（DFD）與分層平衡、功能清單 | `01-Course-Materials/Functional-Analysis.md` |
| 模組劃分、內聚與耦合、CRUD 矩陣、模組規格與相依關係圖 | `01-Course-Materials/Functional-Analysis.md` |
| 活動圖與泳道（TO-BE 流程）、分岔與會合 | `01-Course-Materials/Behavioral-Modeling.md` |
| 系統循序圖與設計階段循序圖、`alt`／`opt`／`loop` 片段 | `01-Course-Materials/Behavioral-Modeling.md` |
| 狀態機圖、狀態轉移與生命週期 | `01-Course-Materials/Behavioral-Modeling.md` |
| 實體關聯圖（ERD）、實體與屬性、主鍵與外鍵、基數與多對多拆解 | `01-Course-Materials/Data-Modeling.md` |
| 名詞分析法、正規化（1NF–3NF）與反正規化 | `01-Course-Materials/Data-Modeling.md` |
| 資料字典、欄位值域、Schema 落地與畫面欄位對照 | `01-Course-Materials/Data-Modeling.md` |
| 系統架構圖、主從式與分層式架構、使用者端／應用系統／資料庫三段結構 | `01-Course-Materials/System-Architecture.md` |
| 外部系統與現場設備介接、地端與雲端、網路分區 | `01-Course-Materials/System-Architecture.md` |
| 非功能需求如何決定架構、架構取捨與決策說明 | `01-Course-Materials/System-Architecture.md` |
| 可行性分析四面向、成本效益估算、投資回收期 | `01-Course-Materials/Feasibility-and-Risk.md` |
| 系統限制的六類盤點、限制與需求的差別 | `01-Course-Materials/Feasibility-and-Risk.md` |
| 風險與問題的差別、風險辨識與機率乘衝擊、四種風險回應、殘餘風險 | `01-Course-Materials/Feasibility-and-Risk.md` |
| 類別與物件、關聯與多重性、聚合組合與一般化、概念類別圖與 ERD 的差異 | `01-Course-Materials/Object-Modeling.md` |
| 設計類別圖、方法與可見性、Controller／Service／Repository（可選層級） | `01-Course-Materials/Object-Modeling.md` |
| 系統介面規格的五件事、交換時機與頻率、失敗處理、CSV 與 JSON、REST API | `01-Course-Materials/System-Interface-and-Data-Exchange.md` |
| 使用性原則、線框圖與原型保真度、資訊架構與導覽、現場介面限制 | `01-Course-Materials/UI-Design.md` |
| 畫面欄位對回資料字典、原型的評估標準 | `01-Course-Materials/UI-Design.md` |
| 設計規格書架構、需求追溯鏈、文件不一致的檢查、設計決策紀錄與待解問題 | `01-Course-Materials/Design-Specification.md` |

`example-system/` 的兩份 `*-Phase-Deliverables.md` 是繳交規範，不是教材正文：規範說「要交什麼」，教材說「怎麼做」。同一主題在兩邊都出現時，概念說明留在教材，繳交欄位與最低標準留在規範，彼此以連結互指。每份規範各配一份 `*-Phase-Sample-Report.md`，是照該規範寫完的成品，只放內容不放解說。

**兩個階段刻意用不同的示範系統，改動時不要把它們統一：** 分析階段（`Analysis-Phase-*.md`）用課堂範例系統 `sad-forum`，因為分析要對照既有系統的原始碼才驗證得出有沒有看懂；設計階段（`Design-Phase-*.md`）用 `02-Project-Topics/Work-Order-and-Reporting.md` 那一題的工廠情境，因為期末題目全在製造現場，校園系統示範不出外部系統介接、班別跨日歸屬與現場操作限制。**設計階段的文件不得再出現論壇系統的內容。**

## 本專案自訂慣例

- **文字撰寫風格**：簡潔清晰易理解，如果能用 1 句話說明，就不要用 5 句話，條列的內容如果敘述太多，可改用表格呈現。作者的語氣與筆法蒸餾在 `reference/personal-voice.md`，**收到「用 `reference/personal-voice.md` 調整文章」這類指示時**再讀它的〈速查〉。
- **不重複說明別的文件已有的內容**：除非有必要，那僅需一句話提醒讀者，然後用文件連結提示。
- **檔名慣例**：課程規範類文件採描述性英文檔名，放在 `00-Course-Introduction/`。
- **資料夾架構慣例**：資料夾狀況不寫進 `README.md`。
- `.claude/skills/` 內移植自外部的技能依原始授權維持原樣，不套用本節的檔名與連結慣例。
- **文件連結慣例**：連結怎麼寫（`[標題](檔名.md)`、內文加「」、表格與清單不加）見 `reference/chapter-writing-guide.md`〈十一、跨章連結格式〉。

**文件連結預設以被連文件的大標題當連結文字**，只有下列文件另行指定，以本表為準：

| 檔案 | 連結標題 | 為什麼不用大標題 |
|---|---|---|
| `Course-Introduction.md` | SAD 課程介紹 | 大標題含課程全名，太長 |
| `Course-Introduction.slides.md` | 課程介紹投影片 | Marp 投影片沒有 `#` 大標 |
| `Rubrics.md` | 課程評量 Rubrics | 大標題的「規準（Rubrics）」重複 |
| `Course-Rules-Quiz.md` | 課程規範理解測驗 | 省略大標題的「（自我檢核）」 |
| `Analysis-Phase-Sample-Report.md` | 系統分析範例報告 | 大標題含範例系統名稱，會看起來像是在講那套系統而非示範文件 |
| `Design-Phase-Sample-Report.md` | 系統設計範例報告 | 同上 |
| `README.md` | SAD 課程教材 | 大標題只有課程名，看不出是什麼文件 |

新增文件時，只有在大標題不適合直接當連結文字時才登記到上表。

## Claude Code 技能（`.claude/skills/`）

- **一個技能一個資料夾**：技能的所有相依檔案（`references/`、`evals/` 等）一律收在自己的資料夾內，`SKILL.md` 的相對連結也必須指向資料夾內部，確保技能可獨立搬移。
- **授權例外**：移植自外部的技能依其原始授權使用，不適用專案 `README.md` 宣告的 CC BY-NC-SA。移植時保留原始 `LICENSE` 於技能資料夾內，`SKILL.md` frontmatter 保留原作者標示。
- **已安裝**：`speak-human-tw`（Raymond Hou，MIT），繁體中文去 AI 味審查與改寫，使用者說「去 AI 味」「說人話」或要求潤稿時觸發。**它強制走兩輪流程**：第一輪只列編號建議清單並停下來等回覆，收到勾選後才動筆或寫檔，不要在確認前直接輸出改寫版或覆蓋檔案。
