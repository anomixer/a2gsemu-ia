# 🍎 a2gsemu-ia - Apple IIgs 線上模擬器

一個基於 Internet Archive 的 Apple IIgs 遊戲模擬器網頁介面,讓你在瀏覽器中重溫 80 年代經典遊戲!

**✨ 特色:單一 HTML 檔案,無需安裝,開箱即用!**

![Apple IIgs Logo](https://img.shields.io/badge/Apple_IIgs-1986-green?style=for-the-badge&logo=apple)
![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)
![Single File](https://img.shields.io/badge/Single_File-✓-success?style=for-the-badge)
[![GitHub Pages](https://img.shields.io/badge/demo-online-success?style=for-the-badge)](https://anomixer.github.io/a2gsemu-ia/)

## 📦 專案特色

### 🎯 單一 HTML 檔案設計
- **零依賴** - 不需要任何外部檔案或資料庫
- **即開即用** - 下載後直接用瀏覽器開啟
- **易於部署** - 上傳到任何網頁伺服器即可運行
- **完全離線** - HTML/CSS/JavaScript 全部內嵌
- **檔案大小** - 僅約 50KB,輕量快速

### 🎮 遊戲收藏
- **28+ 款精選軟體**,涵蓋動作、冒險、RPG、運動、益智等類型
- 包含經典名作如《波斯王子》、《俄羅斯方塊》、《冰城傳奇》等
- 特別收錄 Total Replay 百款Apple IIe遊戲合集

### 🖥️ 使用者介面
- **全繁體中文介面**,適合台灣玩家
- **三欄式布局**:遊戲列表 | 模擬器畫面 | 操作說明
- **可拖曳調整**左右面板寬度,自訂最佳顯示比例
- **即時搜尋**功能,快速找到想玩的遊戲
- **響應式設計**,支援桌面和平板裝置

### 🎯 模擬器功能
- **640x200 原生解析度**顯示,還原真實 Apple IIgs 畫面比例
- **全螢幕模式**,沉浸式遊戲體驗
- **MAME 模擬器**整合,支援存檔/讀檔功能
- **一鍵開啟 Archive.org**完整聲音控制面板
- **自動狀態儲存**到瀏覽器本地

### 📖 完整說明文件
- 詳細的遊戲資訊(年份、開發商、發行商、簡介)
- 一般操作說明(方向鍵、空白鍵、Enter 等)
- MAME 模擬器進階操作指南
- CPU 速度調整、視訊設定、音訊設定等

## 🚀 快速開始

### 方法一:線上使用 (推薦)
直接訪問 GitHub Pages 部署版本:
https://anomixer.github.io/a2gsemu-ia/

### 方法二:下載單一 HTML 檔案
1. **下載 `index.html`**
```
wget https://raw.githubusercontent.com/anomixer/a2gsemu-ia/main/index.html
```

2. **雙擊開啟**

用任何現代瀏覽器開啟 `index.html` 即可!

- Windows: 雙擊檔案,用預設瀏覽器開啟
- macOS: 雙擊檔案,或拖曳到瀏覽器
- Linux: `xdg-open index.html` 或 `firefox index.html`

### 方法三:克隆完整專案
```
git clone https://github.com/anomixer/a2gsemu-ia.git
cd a2gsemu-ia
```

然後用瀏覽器開啟 `index.html`

### 方法四:本地伺服器 (可選)
如果需要測試或開發:

Python 3
```
python -m http.server 8000
```

Node.js (需安裝 http-server)
```
npx http-server
```

PHP
```
php -S localhost:8000
```

訪問 `http://localhost:8000`

## 🎮 使用說明

### 基本操作
1. 從左側遊戲列表選擇一款遊戲
2. 等待 10-30 秒載入(首次載入較慢)
3. 使用鍵盤操作:
   - **方向鍵**: 移動/選擇
   - **Space**: 動作/跳躍/射擊
   - **Enter**: 開始遊戲/確認
   - **Esc**: 暫停/取消

### 進階功能

#### 全螢幕模式
點擊右上角「⛶ 全螢幕」按鈕,再次點擊退出

#### 聲音控制
點擊「🔊 開啟聲音」在新分頁開啟 Archive.org 完整控制面板

#### 存檔/讀檔
- **存檔**: `Shift` + `F7`
- **讀檔**: `F7`
- 支援 0-9 共 10 個存檔槽位

#### MAME 選單
1. 按 `Scroll Lock` 開啟 MAME UI 模式
2. 按 `Tab` 開啟選單
3. 選擇 **Machine Configuration** 可調整:
   - CPU Speed (加速/減速遊戲)
   - Video Options (畫面設定)
   - Audio Options (音訊設定)
   - Input Settings (按鍵設定)

#### 調整面板大小
拖曳左右兩側的綠色分隔線 `⋮` 調整寬度

## 📝 遊戲列表

### 🎯 動作遊戲
- **波斯王子** (Prince of Persia) - 1989
- **送報生** (Paperboy) - 1988
- **不朽傳說** (The Immortal) - 1990
- **王者之劍** (Rastan) - 1990
- **水晶任務** (Crystal Quest) - 1988
- **快打磚塊** (Arkanoid) - 1987
- **雲霄飛球** (Marble Madness) - 1988

### 🗺️ 冒險遊戲
- **宇宙英雄傳 2** (Space Quest II) - 1988
- **芝加哥之王** (The King of Chicago) - 1988
- **似曾相識** (Déjà Vu) - 1987
- **東城時光** (Tass Times In Tonetown) - 1986
- **影之門** (Shadowgate) - 1988

### ⚔️ 角色扮演
- **冰城傳奇** (The Bard's Tale) - 1987

### 🏃 運動遊戲
- **硬式棒球** (Hardball!) - 1987
- **冬季運動會** (Winter Games) - 1987
- **加州運動會** (California Games) - 1989
- **世界運動會** (World Games) - 1987
- **瘋狂高爾夫** (Zany Golf) - 1988

### 🧩 益智遊戲
- **上海** (Shanghai) - 1987
- **戰鬥西洋棋** (Battle Chess) - 1989
- **水管夢** (Pipe Dream) - 1990
- **俄羅斯方塊** (Tetris) - 1988

### 🗺️ 模擬/策略遊戲
- **保皇騎士** (Defender of the Crown) - 1988
- **驅逐艦** (Destroyer) - 1987

### 🎓 教育軟體
- **查理布朗字母學習** (Charlie Brown's ABCs) - 1990
- **會說話的字母熊** (Talking Stickybear Alphabet) - 1988

### ⚙️ 工具軟體
- **List Plus** - 1989

### ⭐ 特別收藏
- **Total Replay** (100款合集) - 2024
- **Pitch Dark** (漆黑) - 2023

## 🔧 技術架構

### 單一檔案設計

- index.html ← 唯一檔案,包含所有功能
- README.md ← 說明文件
- LICENSE ← 授權說明

**index.html 內含:**
- HTML5 結構
- CSS3 樣式 (內嵌 `<style>`)
- JavaScript 程式碼 (內嵌 `<script>`)
- 遊戲資料庫 (JSON 格式)
- 完整使用說明

### 前端技術
- **純 HTML5 + CSS3 + JavaScript (ES6+)**
- 無需任何框架或建構工具
- 無需 Node.js、npm、webpack 等
- 相容性:IE11+ / Edge / Chrome / Firefox / Safari

### 模擬器來源
- **Internet Archive** - 遊戲 ROM 和模擬器 (透過 iframe 載入)
- **MAME** - Apple IIgs 硬體模擬
- **Emularity** - 瀏覽器端模擬器框架

### 瀏覽器支援
- ✅ Chrome/Edge 90+ (建議)
- ✅ Firefox 88+
- ✅ Safari 14+
- ⚠️ 行動裝置支援有限(鍵盤操作限制)

## ⚠️ 限制與注意事項

### 技術限制
1. **首次載入較慢** (10-30 秒)
   - 需從 Internet Archive 下載模擬器和 ROM 檔案
   - 建議使用穩定網路連線

2. **聲音控制受限**
   - iframe 嵌入限制,無法直接控制音量
   - 需點擊「開啟聲音」按鈕在新分頁操作

3. **行動裝置體驗欠佳**
   - 需要實體鍵盤操作
   - 觸控螢幕無法模擬所有按鍵

4. **存檔依賴瀏覽器**
   - 清除瀏覽器快取會遺失存檔
   - 不同瀏覽器/裝置的存檔不共通

### 版權聲明
- 所有遊戲 ROM 來自 [Internet Archive](https://archive.org)
- 僅供個人學習和懷舊用途
- 商業使用請遵守原版權方規定

### 相容性問題
- 部分遊戲可能無法正常執行
- 某些特殊按鍵組合可能被瀏覽器攔截
- 全螢幕模式在某些瀏覽器可能有限制

## 🤝 貢獻指南

歡迎提交 PR 或 Issue!

### 新增遊戲
在 `index.html` 的 `games` 陣列中新增:

```
{
id: 'archive_org_identifier',
name: '遊戲中文名稱',
nameEn: 'Game English Name',
year: '1987',
type: 'game', // game, edu, tool, special
desc: '遊戲簡介...',
developer: '開發商',
publisher: '發行商'
}
```

### ID 查找方式
1. 訪問 https://archive.org/details/softwarelibrary_apple2gs_games
2. 找到想要的遊戲
3. 點擊進入,網址最後部分即為 ID
   - 例: `https://archive.org/details/wozaday_Tetris_IIgs`
   - ID 為: `wozaday_Tetris_IIgs`

### 修改建議
因為是單一 HTML 檔案,修改時請注意:
- 保持 HTML/CSS/JavaScript 的內嵌結構
- 測試確保所有功能正常
- 壓縮前建議保留可讀性(換行和註解)

## 📚 參考資源

### Apple IIgs 相關
- [Apple II 維基百科](https://zh.wikipedia.org/wiki/Apple_II%E7%B3%BB%E5%88%97)
- [Virtual Apple](https://www.virtualapple.org/) - 線上 Apple II 模擬器
- [Apple II Documentation](https://www.apple2.org/)

### 模擬器相關
- [MAME 官方網站](https://www.mamedev.org/)
- [Internet Archive Software Library](https://archive.org/details/softwarelibrary)
- [Emularity GitHub](https://github.com/db48x/emularity)

### 遊戲資料庫
- [MobyGames - Apple IIgs](https://www.mobygames.com/platform/apple-iigs/)
- [Apple II Games](https://www.apple2.org/games/)

## 🌟 為什麼選擇單一 HTML 檔案?

### 優點
✅ **極簡部署** - 上傳一個檔案即可  
✅ **零配置** - 不需要安裝任何依賴  
✅ **易於分享** - Email、雲端硬碟直接分享  
✅ **版本控制** - 單一檔案更容易追蹤變更  
✅ **離線使用** - 下載後無需網路(遊戲需網路)  
✅ **跨平台** - Windows/macOS/Linux 通用  

### 缺點
⚠️ **檔案較大** - 所有資源內嵌(但仍只有約 50KB)  
⚠️ **難以模組化** - 所有功能在同一檔案  
⚠️ **不適合大型專案** - 適合中小型單頁應用  

## 📄 授權條款

本專案採用 **MIT License**

**註**: 遊戲 ROM、Disk 版權歸原開發商所有,本專案僅提供介面整合。

## 🙏 致謝

- **Internet Archive** - 提供遊戲 ROM 和模擬器服務
- **MAME 開發團隊** - 優秀的多平台模擬器
- **Emularity 專案** - 讓模擬器能在瀏覽器中運行
- **Apple Computer** - 創造了 Apple IIgs
- **所有遊戲開發商** - 帶給我們美好的童年回憶

📧 聯絡方式
GitHub Issues: 提交問題

GitHub Profile: @anomixer

⭐ 如果這個專案對你有幫助,請給個 Star!

🎮 享受復古遊戲的樂趣!

📦 單一 HTML 檔案 - 簡單、快速、有效!

Made with ❤️ by anomixer
