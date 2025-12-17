# <img src="favicon.ico" alt="Apple" height="24" style="vertical-align: middle; margin-right: 8px;"> Apple IIgs Emulator - Server Version

🚀 **完全解決 CORS 問題的 Node.js 後端版本！**

#### PS: 此版本還在施工中! (PS: Work in progress!) #### 

---

## ✨ 特色

- ✅ **Node.js 後端代理** - 完全解決 CORS 問題
- ✅ **檔案快取** - 24 小時快取，加快載入速度
- ✅ **Gzip 壓縮** - 減少頻寬使用
- ✅ **直接存取 Archive.org** - 不需要第三方 CORS Proxy
- 🔊 **完整音效支援**

---

## 🛠️ 安裝步驟

### 1️⃣ 下載專案

```bash
git clone https://github.com/anomixer/a2gsemu-ia.git
cd a2gsemu-ia
git checkout v8
```

### 2️⃣ 安裝依賴

```bash
npm install
```

或使用 yarn:

```bash
yarn install
```

### 3️⃣ 啟動伺服器

```bash
npm start
```

你會看到：

```
✅ Apple IIgs 模擬器伺服器已啟動！
🌐 請開啟: http://localhost:3000/v8

✨ 功能:
   - 代理 Archive.org 檔案（解決 CORS）
   - 提供靜態檔案服務
   - 快取支援（24 小時）

🚨 按 Ctrl+C 停止伺服器
```

### 4️⃣ 開啟瀏覽器

訪問: **http://localhost:3000/v8**

---

## 🎮 使用方法

1. **選擇遊戲** - 從左側列表點擊任何遊戲
   - 選單會自動滾動到該遊戲位置（置中顯示）
   - 選單位置會被記住，下次載入時自動恢復
2. **顯示截圖** - 中間會先顯示該軟體的截圖與資訊
3. **點擊截圖開始** - 點擊截圖後會重載頁面並自動啟動模擬器
   - 每個遊戲都在全新的頁面環境中啟動，確保穩定運行
4. **開始玩！** - 使用鍵盤控制遊戲

### ⌨️ 基本操作說明

- **方向控制**：`↑ ↓ ← →` 方向鍵移動/選擇
- **主要動作**：`Space` 動作/跳躍/射擊
- **系統控制**：`Enter` 開始遊戲/確認，`Esc` 暫停/取消
- **文字輸入**：`1-9` 數字鍵，`A-Z` 字母鍵
- **搖桿控制**：
  - 右邊數字鍵：搖桿方向
  - 左右Alt：搖桿按鈕0,1

### 💡 使用技巧

- **快速切換遊戲**：點選左側列表的遊戲，選單會自動滾動到該位置
- **記住位置**：手動滾動選單時，位置會被自動記住
- **穩定啟動**：每次啟動遊戲都會重載頁面，確保模擬器狀態乾淨

---

## 🔧 API 端點

後端提供以下代理 API：

### BIOS 檔案
```
GET /proxy/bios/:filename
例: /proxy/bios/apple2gs.zip
```

### 遊戲檔案
```
GET /proxy/game/:itemId/:filename
例: /proxy/game/a2gs_Prince_of_Persia_1989_Broderbund/Prince_of_Persia_1989_Broderbund.2mg
```

### MAME 引擎
```
GET /proxy/mame/:filename
例: /proxy/mame/mameapple2gs.js.gz
```

---

## 📊 運作原理

```
瀏覽器
    ↓ 請求遊戲
    ↓
Node.js Server (localhost:3000)
    ↓ 代理請求
    ↓
Archive.org
    ↓ 返回檔案
    ↓
Node.js Server
    ↓ 加上 CORS headers + 快取
    ↓
瀏覽器 (載入成功！)
```

---

## 🛠️ 技術細節

### 後端 (server.js)
- **Express.js** - Web 伺服器
- **CORS** - 跨域支援
- **node-fetch** - 下載 Archive.org 檔案
- **compression** - Gzip 壓縮

### 前端 (index_emularity_v8.html)
- **Emularity** - MAME 模擬器框架
- **JSMAMELoader** - MAME JavaScript 載入器
- **BrowserFS** - 虛擬檔案系統

### 🎯 關鍵技術改進

#### 解決第二次遊戲卡住問題
- **問題**：Emularity/MAME 設計為「一個頁面只啟動一次」，第二次啟動會卡住
- **解決**：採用「同頁重載」策略，每個遊戲在全新的頁面環境中啟動
- **實現**：點擊截圖時將 URL 改為 `?game=<id>` 並重載，`autoStartFromUrl()` 自動啟動

#### 選單自動滾動
- **功能**：點選遊戲時立即滾動到置中位置
- **實現**：精確計算 `scrollTop = itemOffsetTop - (listHeight / 2) + (itemHeight / 2)`
- **記憶**：使用 `sessionStorage` 記住滾動位置，頁面載入時自動恢復

#### 狀態清理
- **清理範圍**：`window.Module`、`SDL_PauseAudio`、Emscripten HEAP、BrowserFS、script tags
- **時機**：每次切換遊戲前徹底清理，確保乾淨的啟動環境

---

## 📚 擴充遊戲庫（wozaday Apple IIgs）

本專案支援從 Archive.org 的 woz-a-day collection 批次產生大量 Apple IIgs 軟體清單。

資料來源篩選條件（由產生器腳本使用）：

- `collection:wozaday AND emulator:apple2gs AND mediatype:software`

### 產生/更新 games_v8.js

在專案根目錄執行：

```bash
node generate_games_wozaday_iigs.js
```

預設會輸出到 `games_v8.js`，並將 `game` 類型排在最前面。

只想產生遊戲（不含教育/工具等）可用：

```bash
node generate_games_wozaday_iigs.js --games-only
```

### games_v8.js 欄位

- `id`：Archive.org item identifier（例：`wozaday_Hardball_IIgs`）
- `emu`：模擬器類型（例：`apple2gs`）
- `file`：主要磁片檔（通常是 `00playable.woz`，或 metadata 的 `mame_peripheral_flop3`）
- `file2`：第二片磁片（若存在，對應 `mame_peripheral_flop4`）
- `screenshot`：截圖檔（通常是 `00playable_screenshot.png`）
- `type`：`game` / `edu` / `tool` / `special`
- `desc`：描述（目前先使用 Archive.org description）

---

## 🐛 常見問題

### Q: 為什麼需要 Node.js 後端？
**A:** Archive.org 的 CORS 設定有時會造成問題，使用後端代理可以完全解決。

### Q: 可以部署到雲端嗎？
**A:** 可以！支援部署到：
- **Heroku** - 免費方案
- **Railway** - 簡單部署
- **Render** - 免費託依
- **Vercel** - 需要 Serverless 調整

### Q: 檔案快取在哪裡？
**A:** 快取在伺服器記憶體中，24 小時後過期。

### Q: 聲音沒有？
**A:** 請確保：
1. 點擊了畫面（瀏覽器要求使用者互動）
2. 檢查瀏覽器音量設定
3. Console 沒有錯誤訊息

---

## 🚀 部署到 Heroku

### 1️⃣ 安裝 Heroku CLI
```bash
npm install -g heroku
```

### 2️⃣ 登入並建立應用
```bash
heroku login
heroku create a2gsemu-ia
```

### 3️⃣ 部署
```bash
git push heroku v8:main
```

### 4️⃣ 開啟應用
```bash
heroku open
```

---

## 📝 認證

- **Emularity** - Internet Archive
- **MAME** - Multiple Arcade Machine Emulator
- **Archive.org** - 遊戲 ROM 來源

---

## 🔗 相關連結

- [Archive.org Apple IIgs Collection](https://archive.org/details/apple_iigs_library)
- [Emularity GitHub](https://github.com/db48x/emularity)
- [MAME Official](https://www.mamedev.org/)

---

## 👏 貢獻

歡迎提交 Issue 和 Pull Request！

---

**Made with ❤️ by anomixer**
