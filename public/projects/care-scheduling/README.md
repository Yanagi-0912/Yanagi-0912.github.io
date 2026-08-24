# 智慧居服排班系統 — 管理員介面雛型

依「基本設計.md」與「居服員排班演算法.md」實作的 Demo 雛型。
純前端，無需安裝任何套件。

## 執行方式

直接以瀏覽器開啟 `index.html` 即可（雙擊或拖入瀏覽器視窗）。
全部為 classic script，不使用 ES module 或 Web Worker，因此 `file://` 可直接執行。

## 檔案結構

| 檔案 | 內容 |
| --- | --- |
| `index.html` | 版面結構 |
| `styles.css` | 白色基底 + 橙色主題 |
| `data.js` | 模擬資料：`PARAMS`、6 名居服員、30 位服務個案、42 件當日案件（每人 5~9 件、服務時長 30/45/60 分） |
| `solver.js` | 排班求解器（GA），可獨立於 Node 執行測試 |
| `app.js` | 介面渲染與互動 |

## 與設計文件的對應

| 設計文件 | 實作位置 |
| --- | --- |
| 演算法 §2 可行邊剪枝 | `solver.js → makeContext()`，剪枝結果顯示於營運指標 |
| 演算法 §3 目標函數 | `solver.js → evaluate()` |
| 演算法 §5 GA 設計 | `solver.js → createSolver()`：giant tour 編碼、OX 交配、swap／insert 突變、貪婪初始解、局部搜尋 |
| 演算法 §7 動態重排 | AI 對話窗口的「請假」指令 |
| 基本設計 → 壓力指數 | `solver.js → computeRoute()` 的 `stress` |
| 基本設計 → 罰分 | `solver.js → evaluate()` 的 `pFair / pPref / pIdle` |
| 基本設計 → 管理員 UI | `app.js` 各 render 函式 |

## 可操作項目

* **調整權重面板** — 拖動 θ 與 λ₁~λ₃ 滑桿後放開，即自動重新求解
* **模擬時間** — 拖動後甘特圖出現時間線，平面圖顯示居服員即時位置，可出勤清單同步更新狀態
* **盒狀圖／平面圖** — 游標移上去顯示案件與居服員詳細資訊
* **清單分頁** — 當日案件／可出勤員工／員工清單／服務個案，可新增、編輯、刪除（測試用面板）
* **AI 對話窗口** — 目前為**規則式模擬**，可辨識：
  * `王淑芬請假` → 動態重排並回報毛利與未排入變化
  * `提高公平性` / `以毛利為優先` → 調整 θ 後重算
  * `為什麼有案件沒排入` → 逐一列出每位居服員無法承接的原因
  * `今天狀況如何` → 營運摘要

## 與正式版的差異

* **求解位置**：目前以 `setTimeout` 分批執行於主執行緒，正式版建議改置於 Web Worker
* **地點**：目前為抽象平面座標，`τ(i,j) = 歐氏距離 ÷ 車速`。
  接上地理編碼與路徑規劃 API 時，只需替換 `solver.js` 的距離計算，其餘不動
* **LLM**：對話窗口為規則式模擬，正式版依演算法文件 §6 接入
* **資料**：記憶體內的模擬資料，重新整理即還原

## 在 Node 中測試求解器

> 注意：repo 根目錄的 `package.json` 含 `"type": "module"`，Node 會把本目錄的 `.js`
> 視為 ESM 而使 `module.exports` 失效。請先將 `data.js`、`solver.js` 複製到 repo 之外再執行。
> 瀏覽器端不受影響（皆為 classic script）。

```
node -e "
const D=require('./data.js'), S=require('./solver.js');
const ctx=S.makeContext(D);
const sv=S.createSolver(ctx,{theta:0.3,lambda:D.PARAMS.lambda},{generations:250});
const m=sv.step(250).best.metrics;
console.log('毛利', Math.round(m.profit), '未排入', m.unassigned, 'P_fair', m.pFair.toFixed(3));
"
```
