# <img src="favicon.ico" alt="Apple" height="24" style="vertical-align: middle; margin-right: 8px;"> Apple IIgs 線上模擬器

🎮 **在瀏覽器中體驗經典的 Apple IIgs 遊戲與軟體！**

[![GitHub](https://img.shields.io/badge/GitHub-anomixer/a2gsemu--ia-green?logo=github)](https://github.com/anomixer/a2gsemu-ia)
[![Node.js](https://img.shields.io/badge/Node.js-Backend-brightgreen?logo=node.js)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**🌍 Language / 語言**: [English](README_EN.md) | **繁體中文**

---

## ✨ 特色功能

- 🎯 **130款精選遊戲** - 包含經典 RPG、動作、益智等各類遊戲
- 🔊 **智能音效支援** - 自動檢測後端服務，有聲/靜音模式無縫切換
- 📱 **響應式設計** - 支援桌面和行動裝置
- 🎮 **滑鼠鎖定功能** - 點擊遊戲畫面鎖定滑鼠，按 Esc 解除
- 🔍 **智能搜尋** - 支援中英文遊戲名稱、描述、年份搜尋
- 🌍 **單鍵語言切換** - 右上角單一按鈕，一鍵切換中英文介面，語言設定持久保存
- 📦 **多格式支援** - 支援 .woz、.2mg、.po、.dsk 等磁片格式
- 🌐 **多重資料源** - 支援 Archive.org、自訂 URL、ZIP 檔案
- ⚡ **快速載入** - 24小時檔案快取，提升載入速度
- 🔄 **自動回退** - 後端不可用時自動切換至 IA Loader 模式

---

## 🚀 快速開始

### 智能模式檢測
本專案具備智能檢測機制，會自動判斷運行環境並選擇最佳模式：

#### 🔊 完整功能模式 (推薦)
當檢測到 `server.js` 運行時：
- ✅ **完整音效支援** - 聲音完全正常
- ✅ **ZIP 檔案支援** - 支援壓縮檔案格式
- ✅ **自動預下載** - 核心檔案預先載入
- ✅ **24小時快取** - 提升載入速度
- ✅ **CORS 解決** - 完美解決跨域問題

#### 🔇 IA 嵌入模式 (自動回退)
當檢測到以下情況時自動切換：
- 📁 直接開啟 HTML 檔案 (`file://` 協議)
- 🌐 使用普通 HTTP 服務器 (如 `npx http-server`)
- ❌ 未運行 `server.js` 後端服務

此模式特點：
- 🔇 **靜音模式** - 使用 Archive.org 嵌入式模擬器
- 📱 **純前端** - 無需後端服務
- 🌐 **直接嵌入** - 點擊遊戲直接載入 IA 模擬器
- ⚠️ **功能限制** - 不支援 ZIP 檔案和自訂音效

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
 
```bash
# 1. 下載專案
git clone https://github.com/anomixer/a2gsemu-ia.git
cd a2gsemu-ia

# 2. 使用任何 HTTP 服務器
npx http-server
# 或
python -m http.server 8000

# 3. 開啟瀏覽器
# 系統會自動重定向到 index_old.html (IA 嵌入模式)
```

### 方法三：直接開啟檔案
直接雙擊 `index.html` 檔案，系統會自動重定向到 `index_old.html` 使用 IA 嵌入模式。

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
- **滑鼠鎖定** - 點擊遊戲畫面鎖定滑鼠，按 `Esc` 解除
- **全螢幕模式** - 點擊 `⛶ 全螢幕` 按鈕
- **MAME 設定** - 按 `Tab` 開啟 MAME 選單調整設定
- **存檔/讀檔** - `Shift+F7` 存檔，`F7` 讀檔
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
- **總計**: 130款遊戲與軟體
- **年代**: 1986-2024年
- **語言**: 單鍵切換的完整中英文雙語介面
- **描述**: 每款遊戲都有詳細的400字介紹
- **代理支援**: 44個完整 URL 已轉換為 `/proxy/url/` 格式，提升載入穩定性

---

## 🛠️ 技術架構

### 前端技術
- **HTML5 Canvas** - 遊戲渲染
- **Emularity** - 模擬器核心
- **MAME** - Apple IIgs 模擬引擎 (v0.284)
- **響應式 CSS** - 適配各種螢幕尺寸
- **智能檢測** - 自動檢測後端服務狀態
- **完整國際化系統** - 具備語言持久化的完整雙語支援
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

### 雙模式架構
本專案採用智能雙模式架構，根據運行環境自動選擇最佳模式：

#### 🔊 完整功能模式 (`server.js`)
- **檢測條件**: 檢測到 `/proxy/bios/apple2gs.zip` 端點響應非 404
- **音效支援**: 完整音效，聲音正常
- **檔案支援**: 支援所有格式，包括 ZIP 檔案
- **快取機制**: 24小時檔案快取
- **預下載**: 自動預下載核心檔案

#### 🔇 IA 嵌入模式 (`index_old.html`)
- **檢測條件**: 
  - `file://` 協議 (直接開啟檔案)
  - HTTP 服務器返回 404 (普通 HTTP 服務器)
  - 網絡錯誤或超時
- **音效支援**: 靜音模式，需點擊 "開啟 IA 網站" 獲得音效
- **檔案支援**: 基本格式，不支援 ZIP 檔案
- **載入方式**: 直接嵌入 Archive.org 模擬器

#### 智能檢測流程
```javascript
// 檢測邏輯
1. 檢查協議 → file:// ? 重定向到 index_old.html
2. 測試端點 → fetch('/proxy/bios/apple2gs.zip')
3. 檢查響應 → 404 ? 重定向到 index_old.html
4. 其他狀態 → 使用完整功能模式
```

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
│   ├── index.html              # 主應用程式 (智能檢測 + 完整功能)
│   ├── index_old.html          # IA 嵌入模式 (中文版)
│   ├── index_en_old.html       # IA 嵌入模式 (英文版)
│   ├── server.js               # Node.js 後端伺服器
│   ├── games.js               # 遊戲資料庫 (130 款遊戲)
│   └── package.json           # 專案配置與依賴
│
├── 🎮 模擬器核心
│   ├── browserfs.min.js       # 瀏覽器檔案系統
│   ├── loader.js              # Emularity 載入器
│   └── mameapple2gs.wasm.gz   # MAME Apple IIgs 核心
│
├── 🎨 資源檔案
│   ├── favicon.ico            # 網站圖示
│   └── logo/                  # 標誌資源
│       └── emularity_color_small.png
│
├── 📚 文檔
│   ├── README.md              # 專案說明文檔 (中文版)
│   ├── README_EN.md           # 專案說明文檔 (英文版)
│   ├── agent.md               # 開發文檔
│   └── LICENSE                # MIT 授權條款
│
├── ⚙️ 配置檔案
│   ├── .gitignore             # Git 忽略清單
│   ├── package-lock.json      # 依賴鎖定檔案
│   └── .vscode/               # VS Code 設定
│       └── settings.json
│
├── 📦 Cloudflare 部署
│   └── cf-deploy/             # Cloudflare Pages 部署檔案
│       ├── functions/         # Pages Functions (代理服務)
│       ├── _redirects         # 路由重定向規則
│       ├── wrangler.toml      # Cloudflare Pages 配置
│       ├── worker.js          # 獨立 Worker 版本
│       ├── cloudflare_deploy.md # 部署指南
│       ├── deploy-windows.bat # Windows 部署腳本
│       ├── deploy.sh          # Linux/macOS 部署腳本
│       └── test-*.js          # 測試腳本
│
└── 📦 依賴套件
    └── node_modules/          # Node.js 依賴 (npm install 後產生)
        ├── express/           # Web 框架
        ├── cors/              # CORS 處理
        ├── compression/       # 檔案壓縮
        ├── adm-zip/           # ZIP 檔案處理
        ├── node-fetch/        # HTTP 請求
        └── ...               # 其他依賴
```

### 檔案說明

#### 🎯 主要檔案
- **`index.html`** - 主應用程式，具備智能檢測功能，自動選擇最佳模式
- **`index_old.html`** - IA 嵌入模式 (中文)，純前端，無需後端
- **`index_en_old.html`** - IA 嵌入模式 (英文)，純前端，無需後端
- **`server.js`** - Node.js 後端伺服器，提供代理服務和完整功能
- **`games.js`** - 遊戲資料庫，包含 130 款遊戲的完整資訊

#### 🔧 技術檔案
- **`browserfs.min.js`** - 瀏覽器檔案系統模擬
- **`loader.js`** - Emularity 模擬器載入器
- **`mameapple2gs.wasm.gz`** - MAME Apple IIgs 模擬器核心

#### 📋 配置檔案
- **`package.json`** - 專案配置，依賴管理，腳本定義
- **`.gitignore`** - Git 版本控制忽略清單
- **`.vscode/settings.json`** - VS Code 編輯器設定

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
本專案已完整支援 Cloudflare Pages 部署，享受全球 CDN 加速：

```bash
# 1. 安裝 Wrangler CLI
npm install -g wrangler

# 2. 登入 Cloudflare (Windows 用戶建議使用 cmd)
cmd /c "wrangler login"

# 3. 部署到 Cloudflare Pages
cd cf-deploy
cmd /c "wrangler pages deploy .. --project-name=a2gsemu-ia"
```

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