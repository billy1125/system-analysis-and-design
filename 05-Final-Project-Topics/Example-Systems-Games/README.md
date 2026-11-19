# 期末題目的情境模擬小遊戲

> **注意**：這些小遊戲是老師臨時想到、用來幫同學理解系統的方式。製作時間不多，**遊戲內容可能和實際系統、修改需求提案書有落差**。它是參考性質的數位遊戲教材，不是系統的說明文件，也不是報告的依據。
>
>遊戲和系統或提案書對不上時，一律以實際系統與提案書為準。

這個資料夾收錄六款網頁小遊戲。每一款對應一套期末用到的工廠管理系統。你在遊戲裡扮演使用這套系統的人，在工作現場走動、和同事對話、操作模擬的系統畫面。玩過一遍之後再去操作實際系統，比較容易看懂每個畫面在流程中的位置。

設計這個小遊戲的目的，是以模擬的方式幫助同學看懂期末報告所分配到的系統：現場的人做了哪些事、系統負責哪些檢查與紀錄、資料怎麼跟著改變。

並且我們也透過小遊戲模擬，使用者在使用系統遇到的困難或希望改進的內容，聽提出需求的人怎麼說，理解這項修改為什麼必要，再回到系統與提案書找出它會影響哪些地方。

## 一、六款遊戲一覽

| 遊戲 | 對應系統 | 修改需求 | 下載 |
|---|---|---|---|
| 《毛邊又回來了》 | [SAD-Quality](../Example-Systems/SAD-Quality/README.md) 品質異常回報 | [CR-01 對策確認與退回](../Change-Proposals/Quality-System-Change-Proposal.md) | [期末版](quality-game/dist/quality-game-final.zip)／[期中版](quality-game/dist/quality-game-midterm.zip) |
| 《帳上說有幾個》 | [SAD-Inventory](../Example-Systems/SAD-Inventory/README.md) 倉庫盤點 | [CR-01 覆盤與差異核准](../Change-Proposals/Inventory-System-Change-Proposal.md) | [期末版](inventory-game/dist/inventory-game-final.zip)／[期中版](inventory-game/dist/inventory-game-midterm.zip) |
| 《下次保養是哪天》 | [SAD-Maintenance](../Example-Systems/SAD-Maintenance/README.md) 設備保養 | [CR-01 年度保養計畫與逾期紀錄](../Change-Proposals/Maintenance-System-Change-Proposal.md) | [期末版](maintenance-game/dist/maintenance-game-final.zip)／[期中版](maintenance-game/dist/maintenance-game-midterm.zip) |
| 《誰上過這堂課》 | [SAD-Training](../Example-Systems/SAD-Training/README.md) 員工教育訓練 | [CR-01 應受訓與到期追蹤](../Change-Proposals/Training-System-Change-Proposal.md) | [期末版](training-game/dist/training-game-final.zip)／[期中版](training-game/dist/training-game-midterm.zip) |
| 《這張單做到哪》 | [SAD-Work-Order](../Example-Systems/SAD-Work-Order/README.md) 工單分派 | [CR-01 分批報工與工時](../Change-Proposals/Work-Order-System-Change-Proposal.md) | [期末版](workorder-game/dist/workorder-game-final.zip)／[期中版](workorder-game/dist/workorder-game-midterm.zip) |
| 《今天誰還在廠》 | [SAD-Visitor](../Example-Systems/SAD-Visitor/README.md) 工廠訪客進出登記 | [CR-01、CR-02、CR-03](../Change-Proposals/Visitor-System-Change-Proposal.md) | [期末版](visitor-game/dist/visitor-game-final-demo.zip)／[期中版](visitor-game/dist/visitor-game-midterm.zip) |

除了《今天誰還在廠》對應的是範例報告的示範系統，不在抽籤題目之中，所以它有三項修改需求情境，用來示範不同類型的需求。

**各組的期末報告只處理自己題目的那一項修改需求**，前五款對應抽籤的五個題目，每題只有一項修改需求。

每款遊戲有兩個版本：

| 版本 | 內容 |
|---|---|
| 期中版 | 兩個「現況理解」關卡：一關是正常流程，一關是現有系統的例外狀況 |
| 期末版 | 期中版的兩關，加上「修改需求情境」 |

期末版已經包含期中版的全部內容，**下載期末版即可**。

## 二、怎麼開始玩

| 步驟 | 做什麼 |
|:--:|---|
| 1 | 在上表下載自己題目的期末版 ZIP（在 GitHub 上點進 ZIP 檔後，按下載按鈕） |
| 2 | **先把 ZIP 解壓縮**，得到 `index.html`、`style.css`、`game.js` 三個檔案，三個要放在同一個資料夾 |
| 3 | 用 Chrome 或 Edge 開啟 `index.html`。Mac 預設可能用 Safari 開，請在檔案上按右鍵，選「打開檔案的應用程式」再選 Chrome |
| 4 | 在標題畫面選關卡開始 |

不要在 ZIP 預覽視窗裡直接點 `index.html`，那樣畫面會缺樣式、按鈕也沒有反應。

遊戲不用安裝、不用連網，也不用啟動 Node.js。建議用電腦玩，視窗至少 1280×720，手機不適用。

## 三、操作方式

| 按鍵 | 作用 |
|---|---|
| `WASD` 或方向鍵 | 移動一格，只能上下左右 |
| `E` | 和旁邊的人或物件互動，例如對話、使用電腦、接電話 |
| `Esc` | 關閉對話或表單；在場景中按會開啟暫停選單 |
| 滑鼠、`Tab`、`Enter` | 操作表單、選單與問題 |
| 右上角「音樂」「音效」按鈕 | 分別開關背景音樂與音效 |

角色頭上出現「！」，表示現在去和他說話，劇情會往下走。暫停選單裡有完整的操作說明，也可以重新開始這一關。

## 四、建議的玩法

**現況理解關卡在操作實際系統之前玩。** 抽到題目後先玩兩關，大約 10–15 分鐘。關卡中會請你預測「按下去之後資料會變成什麼樣」，答錯可以重答，不計分。玩完再照該題系統的 `README.md` 安裝實際系統，逐一操作遊戲裡出現過的步驟，確認系統真的是這樣運作。

**修改需求情境在細讀提案書時玩。** 情境會讓你遇到現場的困難，聽提出需求的人說明他要什麼，大約 5–10 分鐘。結算頁分成四塊：觀察到的業務事件、利害關係人的新要求、可能受影響的項目、要回到實際系統確認的地方。最後一塊可以直接當成你接下來操作系統的檢查清單。

**遊戲不會給你答案。** 修改需求情境只呈現問題，不會出現改好之後的畫面、資料表或流程。提案書〈待小組決議的問題〉要由你們自己決定，遊戲裡也找不到標準選項。

## 五、玩的時候要記得

| 注意事項 | 說明 |
|---|---|
| 遊戲不是證據 | 報告裡的流程、功能、資料表與欄位，要以實際系統的畫面、操作結果和資料庫為依據。遊戲截圖不能當成系統現況的證明 |
| 遊戲有簡化 | 為了讓關卡走得下去，遊戲有時會用「教學提示」擋下某些操作。提示框都會標明「不是系統訊息」，實際系統不一定會擋 |
| 資料都是虛構的 | 遊戲裡的人名、單號、數量都是另外編的，和實際系統的種子資料不同，不要混用 |
| 不會存檔 | 遊戲不連網、不儲存任何資料，重新整理就回到標題，關卡重開也會回到同一個初始狀態 |
| 發現落差就記下來 | 遊戲和實際系統或提案書對不上時，以實際系統與提案書為準。歡迎把落差告訴老師，方便修正遊戲 |

各資料夾裡的 `tools/` 是開發用的測試與打包程式，玩遊戲用不到。

---

*本資料夾只放輔助理解的遊戲教材，不含任何繳交規定與評分標準。期末要交什麼見[報告內容](../../00-Course-Introduction/Report-Contents.md)，題目說明見[期末題目](../README.md)。*
