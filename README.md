# <img src="favicon.ico" alt="Apple" height="24" style="vertical-align: middle; margin-right: 8px;"> Apple IIgs 線上模擬器 v2.0

🎮 **在瀏覽器中體驗經典的 Apple IIgs 遊戲與軟體！**

[![GitHub](https://img.shields.io/badge/GitHub-anomixer/a2gsemu--ia-green?logo=github)](https://github.com/anomixer/a2gsemu-ia)
[![Node.js](https://img.shields.io/badge/Node.js-Backend-brightgreen?logo=node.js)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**🌍 Language / 語言**: [English](README_EN.md) | **繁體中文**

<p align="center">
  <a href="https://www.kansasfest.org/2026/01/apple-iigs-theme/" target="_blank">
    <img src="logo/iigs-40th.png" alt="Apple IIgs 40th Anniversary" width="400">
  </a>
</p>

## ✨ 特色功能

- 🎯 **131款精選遊戲** - 包含經典 RPG、動作、益智等各類遊戲
- 🔊 **完整音效支援** - 透過代理後端（Cloudflare Pages / 本地 server.js）完整輸出聲音
- 📱 **響應式設計 & 雙側滑動抽屜** - 支援桌面和行動裝置；全新設計的左右側邊欄抽屜佈局，支援滑鼠拖曳調整寬度、桌面小螢幕（寬度 < 1200px）自動收合優化
- 🔍 **畫面比例切換** - 右上方控制列新增「切到原生模式1x / 切到縮放適應」一鍵切換，支援設定記憶持久化與完美的 RWD 比例縮放
- 🎮 **滑鼠鎖定功能** - 點擊遊戲畫面鎖定滑鼠，按 ESC/F1 恢復滑鼠游標
- 🔍 **智能搜尋** - 支援中英文遊戲名稱、描述、年份搜尋
- 🌍 **單鍵語言切換** - 右上角單一按鈕，一鍵切換中英文介面，語言設定持久保存
- 📦 **多格式支援** - 支援 .woz、.2mg、.po、.dsk 等磁片格式
- 🌐 **多重資料源** - 支援 Archive.org、自訂 URL、ZIP 檔案
- ⚡ **快速載入** - 24小時檔案快取，提升載入速度
- 📄 **三種運行版本** - GS² 加速版、MAME 完整版與零後端簡易版

---

## 🚀 快速開始

### 三種運行版本
本專案提供三種獨立運行版本，依需求選擇：

#### 🔊💽 v2.0 加速版 (`main` 分支 / GSSquared 核心 / 極推薦)
使用 GS² (GSSquared) WebAssembly 核心，提供快速啟動與磁碟存取：
- ✅ **可切換執行速度** - 按住滑鼠右鍵即可加速模擬速度，透過 GS² 介面可調整速度
- ✅ **軟碟加速存取** - 可將相容的軟碟映像掛載到硬碟 slot 7，加速載入；不相容的遊戲仍使用 slot 5
- ✅ **WOZ / PO / 2MG 支援** - 直接透過瀏覽器虛擬檔案系統掛載映像
- ✅ **原生 GS² 顯示與音效** - 較小的核心、快速啟動

#### 🔊 完整版 (`mame0239` 分支 / MAME 核心 / 推薦)
搭配代理後端使用（本 repo 的 `server.js` 或 Cloudflare Pages Functions）：
- ✅ **完整音效支援** - 聲音完全正常
- ✅ **ZIP 檔案支援** - 支援壓縮檔案格式
- ✅ **24小時快取** - 提升載入速度
- ✅ **CORS 解決** - 完美解決跨域問題
- ✅ **縮放適應** - 原生 1x / 縮放適應一鍵切換

#### 🔇 簡易版 (`OneHtmlFile` 分支)
純靜態部署（如 GitHub Pages），以 iframe 嵌入 Internet Archive 模擬器：
- 🔇 **靜音模式** - 需點進 IA 網站才有音效
- 📱 **純前端** - 無需後端服務
- 🌐 **直接嵌入** - 點擊遊戲直接載入 IA 模擬器
- ⚠️ **功能限制** - 不支援 ZIP 檔案、縮放適應與自訂音效

### 方法一：完整功能模式 (推薦)
線上體驗: https://a2gsemu-ia.pages.dev

```bash
# 1. 下載專案
git clone https://github.com/anomixer/a2gsemu-ia.git
cd a2gsemu-ia

# 2. 安裝依賴
npm install

# 3. 啟動伺服器
npm start

# 4. 開啟瀏覽器
# 訪問 http://localhost:3000
```

### 方法二：簡易模式
線上體驗: https://anomixer.github.io/a2gsemu-ia

**簡易版特色：**
- **零後端依賴**：純靜態 HTML/JS 架構，直接使用 iframe 載入 Internet Archive 模擬器。
- **UI 完美同步**：具備與完整版完全一致的「雙側滑動抽屜」與「RWD 手機版自動收合」設計。
- **注意事項**：因受限於跨網域 iframe 嵌入，此版本不支援畫面比例縮放適應與自訂音效功能。
 
```bash
# 1. 下載專案 (切換到簡易版分支)
git clone -b OneHtmlFile https://github.com/anomixer/a2gsemu-ia.git
cd a2gsemu-ia

# 2. 使用任何 HTTP 服務器
npx http-server
# 或
python -m http.server 8000

# 3. 開啟瀏覽器並造訪 http://localhost:8080 (或其他提示的埠號)
```

---

## 🎮 使用方法

### 基本操作
1. **選擇遊戲** - 從左側列表點擊任何遊戲
2. **查看資訊** - 中間會顯示遊戲截圖與詳細資訊
3. **開始遊戲** - 點擊截圖開始載入模擬器
4. **語言切換** - 使用右上角單一按鈕一鍵切換中英文介面
5. **享受遊戲** - 使用鍵盤控制，支援全螢幕模式

### 鍵盤控制
- **方向鍵** `↑ ↓ ← →` - 移動/選擇
- **空白鍵** `Space` - 動作/跳躍/射擊
- **Enter** - 開始遊戲/確認
- **Esc** - 暫停/取消/解除滑鼠鎖定
- **數字鍵** `1-9` - 數字輸入
- **字母鍵** `A-Z` - 字母輸入

### 進階功能
- **滑鼠鎖定** - 點擊遊戲畫面鎖定滑鼠，按 `ESC/F1` 恢復滑鼠游標
- **雙側抽屜拉伸與縮放** - 左右抽屜支援滑鼠拖曳調整寬度，行動裝置下（寬度 <= 768px）自動收合隱藏，點擊拉出時箭頭與邊框精準錨定
- **畫面比例持久化** - 按下畫面比例切換後設定會自動儲存到瀏覽器，下次加載時自動恢復
- **磁碟 slot 設定持久化** - 點擊遊戲標題旁的磁碟圖示切換 slot 5／slot 7 後會記住設定；遊戲執行中切換會自動重新啟動並套用新掛載位置
- **全螢幕模式** - 點擊 `⛶ 全螢幕` 按鈕
- **MAME 設定（僅 `mame0239` 分支）** - 按 `Tab` 開啟 MAME 選單調整設定
- **MAME 存檔/讀檔（僅 `mame0239` 分支）** - `Shift+F7` 存檔，`F7` 讀檔；`main` 的 GS² 建置目前不提供存檔／讀檔，`F7` 用於 CRT shader 切換
- **語言持久化** - 語言設定會自動保存，重新載入頁面或點擊遊戲截圖後語言不會改變
- **URL 分享** - 可以分享帶有語言參數的 URL，接收者會看到相同的語言介面

---

## 📚 遊戲收藏

### 🎯 遊戲類型
- **RPG** - The Bard's Tale、Dragon Wars 等
- **動作** - California Games、Marble Madness 等
- **益智** - Tetris、Columns、Block Out 等
- **冒險** - Beyond Zork 系列、Space Quest 系列等
- **模擬** - Pirates!、Balance of Power 等

### 📊 統計資訊
- **總計**: 131款遊戲與軟體
- **年代**: 1986-2024年
- **語言**: 單鍵切換的完整中英文雙語介面
- **描述**: 每款遊戲都有詳細的400字介紹
- **代理支援**: 44個完整 URL 已轉換為 `/proxy/url/` 格式，提升載入穩定性

---

## 🛠️ 技術架構

### 前端技術
- **HTML5 Canvas** - 遊戲渲染
- **Emularity** - 模擬器核心
- **MAME** - Apple IIgs 模擬引擎
- **響應式 CSS** - 適配各種螢幕尺寸
- **國際化系統** - 具備語言持久化的完整雙語支援
  - 單鍵語言切換 (🇺🇸 En ↔ 🇹🇼 中文)
  - 首次載入時自動檢測瀏覽器語言
  - URL 參數儲存語言設定，支援分享和書籤
  - 完整 UI 翻譯，包含使用提示、控制說明、MAME 設定
  - 遊戲資訊雙語顯示，語言切換後立即更新

### 後端技術 (可選)
- **Node.js + Express** - 伺服器框架
- **代理服務** - 解決 CORS 問題，提供完整音效
- **檔案快取** - 24小時快取機制
- **ZIP 支援** - 直接從 ZIP 檔案提取遊戲
- **預下載** - 自動預下載核心檔案加速載入

### 版本與部署架構
本專案提供三個獨立運行版本，功能互為取捨：

#### 🔊💽 GS² 加速版 (`main` 分支)
- **核心載入**: GS² WebAssembly 核心與資源自帶於 `gs2/`
- **磁碟存取**: 依遊戲相容性選擇 slot 7 加速或 slot 5 軟碟模式

#### 🔊 完整版 (`mame0239` 分支)
- **部署位置**: Cloudflare Pages (a2gsemu-ia.pages.dev) 或本地 `server.js`
- **音效支援**: 完整音效，聲音正常
- **檔案支援**: 支援所有格式，包括 ZIP 檔案
- **快取機制**: 24小時檔案快取
- **核心載入**: MAME 核心與 BIOS 透過 `/proxy/mame/`、`/proxy/bios/` 代理載入（不自帶於 repo）

#### 🔇 簡易版 (`OneHtmlFile` 分支)
- **部署位置**: GitHub Pages (anomixer.github.io/a2gsemu-ia)
- **音效支援**: 靜音模式，需點進 IA 網站才有音效
- **檔案支援**: 基本格式，不支援 ZIP 檔案
- **載入方式**: 以 iframe 直接嵌入 Archive.org 模擬器

### 資料來源
- **Internet Archive** - 主要遊戲檔案來源
- **自訂 URL** - 支援任何 HTTP/HTTPS 來源
- **ZIP 檔案** - 支援壓縮檔案格式
- **Full URL ID** - 支援完整 URL 作為遊戲 ID

---

## 📁 專案結構

```
a2gsemu-ia/
├── 📄 核心檔案
│   ├── index.html              # 主應用程式 (完整功能)
│   ├── server.js               # Node.js 後端伺服器 (代理服務)
│   ├── games.js               # 遊戲資料庫 (131 款遊戲)
│   └── package.json           # 專案配置與依賴
│
├── 🎮 GS² 核心 (`main` 分支)
│   ├── gs2/GSSquared.js       # Emscripten 執行環境與 GS² 啟動器
│   ├── gs2/GSSquared.wasm     # GS² WebAssembly 核心
│   ├── gs2/GSSquared.data     # BIOS、ROM 與預載資源
│   ├── gs2/resources/         # GS² 虛擬檔案系統資源
│   └── gs2/gssquared-mark.png # GSSquared 品牌圖示
│
├── 🎮 MAME 載入器（`mame0239` 分支）
│   ├── browserfs.min.js       # 瀏覽器檔案系統（MAME/Emularity）
│   └── loader.js              # Emularity 載入器（MAME/Emularity）
│   (MAME 核心與 BIOS 透過 /proxy/ 代理自 Internet Archive 載入，不自帶於 repo)
│
├── 💾 硬碟映像
│   ├── roms/GSOS601.zip       # 壓縮後的 ProDOS 硬碟映像（載入時解壓）
│   └── roms/SpaceAce2.po      # GS² 可用的遊戲硬碟映像
│
├── ☁️ Cloudflare Pages (根目錄)
│   ├── functions/proxy/[[path]].js  # Pages Functions 代理服務
│   ├── _redirects             # 路由規則
│   └── wrangler.toml          # Cloudflare Pages 配置
│
├── 🎨 資源檔案
│   ├── favicon.ico            # 網站圖示
│   └── logo/                  # 標誌資源
│       ├── iigs-40th.png      # 40 週年標誌
│       └── emularity_color_small.png
│
├── 📚 文檔
│   ├── README.md              # 專案說明文檔 (中文版)
│   ├── README_EN.md           # 專案說明文檔 (英文版)
│   ├── agent.md               # 開發文檔
│   └── LICENSE                # MIT 授權條款
│
├── ⚙️ CI/CD
│   ├── .github/workflows/cf-deploy.yml  # GitHub Actions 自動部署 (push main)
│   ├── .gitignore             # Git 忽略清單
│   └── package-lock.json      # 依賴鎖定檔案
│
├── 📦 Cloudflare 輔助腳本
│   └── cf-deploy/             # Worker 版本與部署/測試腳本
│       ├── worker.js          # 獨立 Worker 版本
│       ├── wrangler-worker.toml # Worker 配置
│       ├── cloudflare_deploy.md # 部署指南
│       ├── deploy-windows.bat / deploy.sh  # 手動部署腳本
│       ├── test-deployment.js / test-zip-files.js  # 測試腳本
│       └── update-games-for-cloudflare.js  # 遊戲資料轉換工具
│
└── 📦 依賴套件
    └── node_modules/          # Node.js 依賴 (npm install 後產生)
        ├── express/           # Web 框架
        ├── cors/              # CORS 處理
        ├── compression/       # 檔案壓縮
        ├── adm-zip/           # ZIP 檔案處理
        ├── jszip/             # ZIP 檔案處理 (前端)
        └── node-fetch/        # HTTP 請求
```

### 檔案說明

#### 🎯 主要檔案
- **`index.html`** - 主應用程式，搭配代理後端提供完整功能
- **`server.js`** - Node.js 後端伺服器，提供 `/proxy/*` 代理服務和完整功能
- **`games.js`** - 遊戲資料庫，包含 131 款遊戲的完整資訊
- **簡易版 (無後端)** - 位於獨立的 `OneHtmlFile` 分支，純靜態部署

#### 🔧 技術檔案
- **`browserfs.min.js`** - 瀏覽器檔案系統模擬
- **`loader.js`** - Emularity 模擬器載入器
- **MAME 核心與 BIOS** - 不自帶於 repo，執行時透過 `/proxy/mame/`、`/proxy/bios/` 代理載入

#### 📋 配置檔案
- **`package.json`** - 專案配置，依賴管理，腳本定義
- **`.gitignore`** - Git 版本控制忽略清單
- **`wrangler.toml`** - Cloudflare Pages 配置（根目錄）

---

## 🌐 部署指南

### 本地部署 (推薦)
```bash
# 1. 下載專案
git clone https://github.com/anomixer/a2gsemu-ia.git
cd a2gsemu-ia

# 2. 安裝依賴
npm install

# 3. 啟動伺服器
npm start

# 4. 開啟瀏覽器
# 訪問 http://localhost:3000
```

### Cloudflare Pages 部署
本專案已完整支援 Cloudflare Pages 部署，享受全球 CDN 加速。

Pages 配置（`wrangler.toml`、`_redirects`、`functions/`）位於**倉庫根目錄**，因此從根目錄部署：

```bash
# 手動部署 (在倉庫根目錄執行)
npm run deploy-pages
# 或
wrangler pages deploy . --project-name=a2gsemu-ia
```

**自動部署**: 推送到 `main` 分支會自動觸發 GitHub Actions（`.github/workflows/cf-deploy.yml`），無需手動操作。

**Cloudflare Pages 特色**:
- ✅ **全球 CDN** - 全球 300+ 資料中心加速
- ✅ **自動擴展** - 無需維護，自動處理流量
- ✅ **完整功能** - 支援所有 ZIP 檔案和代理功能
- ✅ **HTTPS** - 預設啟用安全連線
- ✅ **零成本** - 免費託管靜態網站

詳細部署說明請參考 `cf-deploy/cloudflare_deploy.md`

### Vercel 部署
```bash
# 安裝 Vercel CLI
npm i -g vercel

# 部署
vercel --prod
```

### Docker 部署
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

### 傳統伺服器
```bash
# 使用 PM2 管理程序
npm install -g pm2
pm2 start server.js --name "a2gsemu-ia"
pm2 startup
pm2 save
```

---

## 🤝 貢獻指南

歡迎貢獻新遊戲、修復錯誤或改進功能！

### 添加新遊戲
1. 編輯 `games.js` 添加遊戲資料
2. 確保遊戲檔案可正常存取
3. 添加適當的截圖和描述
4. 測試遊戲是否正常運行

### 報告問題
- 使用 [GitHub Issues](https://github.com/anomixer/a2gsemu-ia/issues)
- 提供詳細的錯誤資訊和重現步驟
- 包含瀏覽器版本和作業系統資訊

### 提交 Pull Request
1. Fork 專案
2. 創建功能分支
3. 提交變更
4. 創建 Pull Request

---

## 📄 授權條款

本專案採用 [MIT License](LICENSE) 授權。

### 第三方資源
- **遊戲檔案** - 來自 Internet Archive，遵循各自的授權條款
- **Emularity** - Internet Archive 開源模擬器框架
- **MAME** - 多重街機模擬器，GPL 授權

---

## 🙏 致謝

- **Internet Archive** - 提供珍貴的遊戲保存服務
- **MAME 團隊** - 優秀的模擬器引擎
- **Emularity 專案** - 讓瀏覽器模擬成為可能
- **Apple** - 創造了經典的 Apple IIgs 電腦
- **遊戲開發者們** - 創作了這些永恆的經典

---

## 📞 聯絡資訊

- **GitHub**: [anomixer/a2gsemu-ia](https://github.com/anomixer/a2gsemu-ia)
- **Issues**: [回報問題](https://github.com/anomixer/a2gsemu-ia/issues)
- **Discussions**: [討論區](https://github.com/anomixer/a2gsemu-ia/discussions)

---

<div align="center">

**🎮 享受經典 Apple IIgs 遊戲的樂趣！ 🎮**

Made with ❤️ by [anomixer](https://github.com/anomixer)

</div>
