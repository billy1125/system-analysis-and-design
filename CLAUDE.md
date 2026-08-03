# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 專案概述

本專案為元智大學「系統分析與設計」課程的教材儲存庫，修課對象為工業工程與管理系學生。所有內容以 **繁體中文（台灣用語）** 撰寫。

本專案無建置系統、測試套件或 CI/CD 流程，僅包含 Markdown 文件與 Jupyter 筆記本，因此沒有 build／lint／test 指令可執行。驗證方式是直接在 GitHub 或 Markdown 預覽工具中檢視排版是否正確；投影片則以 VS Code 的 Marp for VS Code 擴充套件預覽。

## 目前專案狀態

本專案 **剛起步**，正式章節內容尚未開始撰寫。目前儲存庫內只有：

| 檔案 | 說明 |
|------|------|
| `00-Course-Introduction.md` | 課程介紹。**現有內容與本課主題差距大，屬待修訂狀態**；其他文件提到它時單純引用檔名或連結即可，不要把它目前的課程概要、進度表與課程地圖內容當作本課程的事實依據來延伸撰寫，也不要以它為寫作範本。 |
| `reference/chapter-writing-guide.md` | 教材撰寫規範全文（語言、Markdown 格式、圖片與授權、章節結構、參考文獻、學習重點總結、跨章連結）。 |
| `reference/chapter-template.md` | 章節正文骨架範本，撰寫新章節時複製本檔為 `0X-XXX.md` 開始寫。 |
| `reference/slides-design-template.md` | 投影片設計規範全文。 |
| `reference/slides-template.slides.md` | Marp 投影片骨架範本。 |
| `images/` | 目前僅含 `course-attendance-rule.png`，為 `00-Course-Introduction.md` 引用的學則截圖；尚未依文章分子資料夾。 |

下列項目 **尚未建立**，需要時才新增，不要假設它們已經存在：`README.md`、各章正文 `0X-XXX.md` 與投影片 `0X-XXX.slides.md`、`notebooks/`、`temp-reference/`、`.claude/skills/`。各章的格式基準以 `reference/` 下的兩份骨架範本為準；第一份實際產出的章節完成後，應回頭校正範本與實際產出之間的落差，並更新本檔案的檔案清單。

### 預期的資料夾架構

新增內容時依下列慣例建立資料夾：

| 資料夾 | 說明 |
|------|------|
| `reference/` | 長期保留的範本與規範文件（章節正文與投影片的骨架範本、撰寫規範），是全專案的格式基準，會隨慣例調整而更新 |
| `temp-reference/` | 用於生成教材的參考資料，屬一次性素材，與 `reference/` 的長期規範不同 |
| `images/` | Markdown 文件引用的圖片，依所屬文章分子資料夾 |
| `notebooks/` | 所有課程練習用的 Jupyter 筆記本，集中放置於此資料夾 |
| `.claude/skills/` | Claude Code 技能（skill），每個技能自成一個資料夾，資料夾內含 `SKILL.md` 與其相依檔案 |

## 內容撰寫規範

完整規範見 `reference/chapter-writing-guide.md`，章節骨架見 `reference/chapter-template.md`。**撰寫任何章節正文前，先讀完規範文件，再複製骨架檔開始寫**，不要只憑本節摘要動筆——本節僅列出最容易出錯或後果不可逆的幾條，格式細節（章節結構、參考文獻的 APA 寫法、學習重點總結、跨章連結句型、圖說格式）一律以規範文件為準。

- **語言與讀者程度**：所有內容必須以繁體中文、台灣習慣的工程與資訊用語撰寫，技術名詞首次出現時附上英文，格式為「中央處理器（CPU）」。讀者是無程式設計背景的大學部學生，說明技術概念時避免未加解釋的專業術語。
- **粗體標記前後留空白**：粗體的 `**` 標記只要 **直接貼著中文字或英數字**，就在標記外側補一個半形空白，例如 `這是 **重點** 內容`；外側若已是全形標點、半形標點、空白或行首行尾則 **不補**。原因是 `**` 緊貼中文字時部分 Markdown 剖析器會辨識失敗。此規則同樣適用於 `.slides.md`。
- **圖片授權**：下載外部圖片前務必先在該圖的檔案頁面（File page）確認授權條款，避免使用僅限「合理使用／fair use」的非自由版權圖片，**無法確認授權的圖片不可收錄**。每張圖片下方需依來源（AI 生成／作者自製／外部來源）標註對應的斜體圖說，格式見規範文件。
- **參考資料**：如果要生成新內容，優先找 `temp-reference/` 中的內容，再透過網路找尋適合的資料。
- **專案架構**：本專案資料夾架構，不要增加與更新於 `README.md` 之中。

## 投影片（`.slides.md`）撰寫規範

各章節正文另有對應的 Marp 投影片版本，檔名為 `0X-XXX.slides.md`。完整設計規範見 `reference/slides-design-template.md`，可直接複製的骨架見 `reference/slides-template.slides.md`。

投影片與正文最大的差異是 **投影片不加圖片來源圖說**，圖片授權標註仍以正文 `.md` 為準；其餘 frontmatter 設定、章節分隔頁寫法、blockquote 整句粗體規則與三種圖片版式，均見設計規範文件。

## Claude Code 技能（`.claude/skills/`）

- **一個技能一個資料夾**：每個 skill 都自成一個獨立資料夾，該技能所有相依檔案（`references/`、`evals/` 等）一律收在此資料夾內，不散落於專案根目錄；`SKILL.md` 內的相對連結也必須指向資料夾內部，確保技能可獨立搬移。
- **技能授權例外**：移植自外部專案的技能，依其原始授權條款使用，不適用本專案 `README.md` 所宣告的 CC BY-NC-SA 授權。移植時須在技能資料夾內保留原始 `LICENSE`，`SKILL.md` frontmatter 保留原作者標示，並在 `README.md`〈📄 授權與使用聲明〉的例外項目中列明來源與授權。
