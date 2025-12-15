# a2gsemu-ia Agent Notes (2025-12-15)

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

## 目前已知問題 / 待辦

### Pending: 第二次切換遊戲卡住（Loading Emulator / Launching Emulator）

- 現況：已做最小 reset + cache-busting + 避免 null args，仍可能在第二次啟動卡住。
- 下次建議方向：
  - 深入追 `loader.js` 的 `JSMAMELoader` / script attach/load lifecycle。
  - 檢查 stop() 後是否有殘留 request/interval/worker。
  - 針對 `window.Module` / Emscripten runtime 是否完整釋放做更嚴謹清理。
  - 增加更細的 logging：
    - attach_script 成功/失敗
    - wasm fetch/compile/instantiate
    - BrowserFS mount
    - runner state transitions

### In progress: B) `games_v8.js` 大量資料生成

- 你回報 `node generate_games_wozaday_iigs.js` 跑很久，屬正常現象（大量 item + metadata fetch）。
- 若要加速：
  - 可以加入「最大筆數」或「並發限制」或「resume/快取中間結果」機制（下次有 credit 再做）。

---

## 下次接續建議（有 credit 時）

1) 對產生器做速度/穩定性優化：
- 增加 `--limit` / `--offset` / `--concurrency` / `--cache` / `--resume`。

2) 根治 second-load hang：
- 針對 `JSMAMELoader`/`Emulator` 的 state machine 加 log，定位卡在哪一步。

3) 若大量清單導致 UI 慢：
- `renderGames()` 加 debounce
- 或實作簡單 virtualization（只渲染可視範圍）
