# a2gsemu-ia Agent Notes (2025-12-17)

## 今日目標/背景

- 修正/改善 Apple IIgs emulator 在切換遊戲時卡在「Loading Emulator」的問題（此項目前仍未完全解決，已先做最小 reset 與避免 null args，後續待 debug）。
- 擴充遊戲庫：整合 Archive.org `wozaday` collection 的 Apple IIgs 軟體清單，並可自動產生 `games_v8.js`。
- 前端互動改成兩段式：
  - 點左側清單：只顯示 screenshot + 資訊
  - 點 screenshot：才真正啟動 emulator

---

## 已完成變更（重要）

### 1) 產生器腳本：`generate_games_wozaday_iigs.js`

- 新增/更新 Node.js 產生器腳本，可透過 Archive.org advancedsearch + metadata 取得 `wozaday` 內 Apple IIgs 軟體。
- 使用 `node-fetch` v2（專案 `package.json` 已有 `node-fetch@2.7.0`，避免 v3 import breaking）。
- 預設「全收」：`game / edu / tool / special ...` 都收。
- 排序：將 `type === 'game'` 排最前，其餘照權重排序（仍保留穩定排序）。
- `--games-only` 旗標：只輸出遊戲（不含 edu/tool 等）。

執行方式（會需要時間、且會對外請求 Archive.org）：

```bash
node generate_games_wozaday_iigs.js
# or
node generate_games_wozaday_iigs.js --games-only
```

輸出：覆寫/更新 `games_v8.js`。

### 2) 遊戲清單資料：`games_v8.js`

- `games_v8.js` 現在作為獨立資料檔，由 `index_emularity_v8.html` 透過 `window.games` 載入。
- 欄位擴充（產生器會填）：
  - `id`: archive item identifier
  - `emu`: emulator type（例：`apple2gs`）
  - `file`: 主要磁片檔（通常 `00playable.woz` 或 metadata `mame_peripheral_flop3`）
  - `file2`: 第二片磁片（若存在；metadata `mame_peripheral_flop4`）
  - `screenshot`: 截圖檔（通常 `00playable_screenshot.png`）
  - `desc`: description
  - `type`: `game` / `edu` / `tool` / `special`

### 3) 前端流程：`index_emularity_v8.html`

- UX 改成兩步：
  - 點遊戲只顯示 screenshot + 資訊，不立刻啟動。
  - 點 screenshot 才呼叫 `startEmulator(...)`。
- screenshot 來源：
  - 若有 `game.screenshot`：走後端代理 `/proxy/game/{id}/{screenshot}`（加 cache bust `t=Date.now()`）
  - 否則 fallback 到 `https://archive.org/services/img/{id}`
- 修正 `loadGame()` corruption 與多段重複/錯誤結構（先前曾造成語法錯誤）。
- 移除 zoom in/out 按鈕，但保留必要的 `currentZoom` 與 `updateCanvasZoom()`，避免 ReferenceError。
- 右側 info panel 改為可靠可捲動（flex + height/overflow 設定）。
- 音量 mute 狀態：
  - 將 `uiMuted` 與 `updateMuteButton()` 放在 top-level scope，避免 `uiMuted is not defined`。
  - 在 `startEmulator()` 時套用 `currentEmulator.setMute(uiMuted)`。
- 第二次載入偶發卡住的緩解（尚未根治）：
  - `window.Module = null`
  - `delete window.SDL_PauseAudio`
  - MAME JS/WASM URL 加 cache-busting query，確保腳本 load event 在二次啟動仍會觸發。
  - 避免把 `null` loader arg 傳進 `new JSMAMELoader(...)`（可能導致 hang）。
- 另：為了讓 Reload 按鈕在「尚未啟動 emulator」時也能知道目前選到哪個遊戲，`loadGame()` 也會設定 `currentGame = game`。
- **重要改進（2025-01-XX）：**
  - 解決第二次遊戲卡住：改用「同頁重載」策略（`location.href = ?game=<id>`）
  - 自動滾動到選中遊戲：點選遊戲時立即滾動到置中位置
  - 記住滾動位置：使用 `sessionStorage` 記住選單位置，頁面載入時恢復
  - 清理邏輯優化：`resetEmulatorState()` 清理 Emscripten 全域狀態、BrowserFS、script tags

### 4) 後端 proxy logging：`server.js`

- 加強 proxy endpoint logging：
  - 每個 request 都會 log method/path、itemId/filename、上游 URL、cache header、狀態碼、大小、耗時。
  - 抽出共用 fetch helper（仍維持既有行為：buffer in memory）。

### 5) 文件：`README_SERVER.md`

- 更新「使用方法」流程：
  - 點遊戲 -> 先顯示截圖
  - 點截圖 -> 才啟動
- 新增「擴充遊戲庫（wozaday Apple IIgs）」段落：
  - 產生器用法
  - `games_v8.js` 欄位說明
  - 資料來源 query（collection/emulator/mediatype）

---

## ✅ 已解決問題

### ✅ 第二次切換遊戲卡住（Loading Emulator / Launching Emulator） - 已解決！

**問題根源：**
- Emularity/MAME 設計為「一個頁面只啟動一次 emulator」
- 第二次在同一個 JS 環境啟動會卡在「Launching Emulator」階段
- `window.Module` 和 Emscripten runtime 狀態無法完全清理

**解決方案：**
- 採用「同頁重載」策略：點擊截圖時，將 URL 改為 `?game=<id>` 並重載頁面
- 頁面載入時 `autoStartFromUrl()` 自動選中並啟動對應遊戲
- 每個遊戲都在「全新的頁面環境」中啟動，完全避免狀態殘留
- 保留基本的清理邏輯（`resetEmulatorState`）以防萬一

**效果：**
- ✅ 第一個遊戲：正常啟動
- ✅ 第二個遊戲：正常啟動（不再卡住）
- ✅ 第三個及之後：都正常啟動
- ✅ 瀏覽器快取自動清理（每次重載都是新頁面）

### ✅ 選單自動滾動功能 - 已實現

**功能：**
- 點選遊戲時，選單會立即滾動到該遊戲位置（置中顯示）
- 使用精確計算：`itemOffsetTop - (listHeight / 2) + (itemHeight / 2)`
- 手動滾動選單時，位置會被記住（使用 `sessionStorage`）
- 頁面載入時自動恢復上次的滾動位置

**實現細節：**
- 移除平滑動畫，改為立即滾動（直接設置 `scrollTop`）
- 監聽 `gameList` 的 `scroll` 事件，使用 debounce（200ms）記住位置
- 從 URL 啟動時，`loadGame()` 會自動滾動到對應遊戲

## 目前已知問題 / 待辦

### In progress: `games_v8.js` 大量資料生成

### In progress: B) `games_v8.js` 大量資料生成

- 你回報 `node generate_games_wozaday_iigs.js` 跑很久，屬正常現象（大量 item + metadata fetch）。
- 若要加速：
  - 可以加入「最大筆數」或「並發限制」或「resume/快取中間結果」機制（下次有 credit 再做）。

---

## 最新改進（2025-01-XX）

### ✅ 解決第二次遊戲卡住問題

**問題描述：**
- 第一個遊戲載入正常
- 第二個遊戲會卡在「Launching Emulator」或「wasm binary 載入」
- 之後的遊戲也都無法啟動

**根本原因：**
- Emularity/MAME 設計為「一個頁面只啟動一次 emulator」
- `EmscriptenRunner.stop()` 幾乎是空的，無法完整清理 MAME/WASM runtime
- `window.Module` 和 Emscripten 全域狀態無法完全重置
- 第二次在同一個 JS 環境啟動會卡在初始化階段

**解決方案：**
- 採用「同頁重載」策略：點擊截圖時，將 URL 改為 `?game=<id>` 並使用 `location.href` 重載頁面
- 頁面載入時 `autoStartFromUrl()` 自動選中對應遊戲並啟動
- 每個遊戲都在「全新的頁面環境」中啟動，完全避免狀態殘留
- 保留 `resetEmulatorState()` 清理邏輯以防萬一

**效果：**
- ✅ 第一個遊戲：正常啟動
- ✅ 第二個遊戲：正常啟動（不再卡住）
- ✅ 第三個及之後：都正常啟動
- ✅ 瀏覽器快取自動清理（每次重載都是新頁面）

### ✅ 選單自動滾動功能

**需求：**
- 點選遊戲時，選單自動滾動到該遊戲位置
- 記住滾動位置，下次載入時恢復

**實現：**
- 使用精確計算：`scrollTop = itemOffsetTop - (listHeight / 2) + (itemHeight / 2)`
- 立即滾動（不使用平滑動畫，直接設置 `scrollTop`）
- 監聽 `gameList` 的 `scroll` 事件，使用 debounce（200ms）記住位置到 `sessionStorage`
- 頁面載入時自動恢復滾動位置（如果沒有從 URL 啟動）

**效果：**
- ✅ 點選遊戲時立即滾動到置中位置
- ✅ 手動滾動選單時位置會被記住
- ✅ 頁面載入時自動恢復上次位置

### ✅ 清理邏輯優化

**改進：**
- `resetEmulatorState()` 清理範圍擴大：
  - `window.Module = null` 並 `delete window.Module`
  - `delete window.SDL_PauseAudio`
  - 清理 Emscripten HEAP 相關全域變數（`HEAP8`, `HEAP16`, `HEAP32`, `wasmMemory`, `wasmTable` 等）
  - 清理 BrowserFS `/emulator` 目錄
  - 移除可能殘留的 MAME script tags
- 清理時機：每次切換遊戲前、啟動前

## 下次接續建議（有 credit 時）

1) 對產生器做速度/穩定性優化：
- 增加 `--limit` / `--offset` / `--concurrency` / `--cache` / `--resume`。

2) 若大量清單導致 UI 慢：
- `renderGames()` 加 debounce
- 或實作簡單 virtualization（只渲染可視範圍）

3) 改善 desc 欄位：
- 從 `games_v8_old.js` 或原 HTML 提取更完整的描述
- 寫合併腳本把較完整的敘述覆蓋到 `games_v8.js`

---

## 最新改進（2025-12-17）

### ✅ UI 操作說明更新

**需求：**
- 修正左邊搜尋功能（確認功能正常）
- 移除右側操作說明中的 Ctrl 和 Alt 鍵
- 新增搖桿控制說明
- 讓標題可點擊回到 `/v8`

**實現：**

#### 1) 搜尋功能確認 ✅
- 檢查 `index_emularity_v8.html` 的搜尋功能實現
- 確認 `searchBox.addEventListener('input', (e) => { renderGames(e.target.value); })` 正常運作
- `renderGames()` 函數正確過濾中文和英文遊戲名稱（大小寫不敏感）

#### 2) 操作說明更新 ✅
**修改檔案：**
- `index_emularity_v8.html` (v8 後端代理版本)
- `index.html` (前端版本)  
- `index_en.html` (英文版本)

**變更內容：**
- 移除：`Ctrl` 開火/次要動作 和 `Alt` 替代按鈕
- 新增：
  - 中文版：「右邊數字鍵: 搖桿方向」和「左右Alt: 搖桿按鈕0,1」
  - 英文版：「Numpad: Joystick directions」和「Left/Right Alt: Joystick buttons 0,1」

#### 3) 標題連結功能 ✅
- 將所有版本的標題 "Apple IIgs 線上模擬器 🎮" 包裝在 `<a href="/v8">` 標籤中
- 添加 `text-decoration: none` 樣式保持外觀一致
- 現在點擊標題會導航回 `/v8` 頁面

**效果：**
- ✅ 搜尋功能確認正常運作
- ✅ 操作說明更清晰，移除不必要的按鍵說明
- ✅ 新增搖桿控制說明，提升遊戲體驗
- ✅ 標題可點擊，改善導航體驗
