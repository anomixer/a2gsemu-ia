# <img src="favicon.ico" alt="Apple" height="24" style="vertical-align: middle; margin-right: 8px;"> Apple IIgs Emulator - Server Version

🚀 **完全解決 CORS 問題的 Node.js 後端版本！**

---

## ✨ 特色

- ✅ **Node.js 後端代理** - 完全解決 CORS 問題
- ✅ **檔案快取** - 24 小時快取，加快載入速度
- ✅ **Gzip 壓縮** - 減少頻寬使用
- ✅ **直接存取 Archive.org** - 不需要第三方 CORS Proxy
- ✅ **自訂 URL 支援** - 支援任何 HTTP/HTTPS URL 作為遊戲來源
- ✅ **ZIP 檔案支援** - 支援從 ZIP 檔案中提取遊戲檔案
- ✅ **跨項目檔案** - 支援來自不同 Archive.org 項目的遊戲檔案
- ✅ **智能搜尋** - 支援中英文遊戲名稱、描述、年份搜尋
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

### 3️⃣ 啟動伺服器

```bash
npm start
```

你會看到：

```
🚀 Apple IIgs 模擬器伺服器已啟動！
🌐 請開啟: http://localhost:3000

⚡ 可用版本:
   - http://localhost:3000     (前端版本，無聲)
   - http://localhost:3000/v8  (後端代理版本)

✨ 功能:
   ✅ 代理 Archive.org 檔案（解決 CORS）
   ✅ 支援完整 URL 檔案來源
   ✅ 支援 ZIP 檔案內檔案提取
   ✅ 提供靜態檔案服務
   ✅ 快取支援（24 小時）
   ✅ 正確處理 .gz 壓縮檔

📦 ZIP 檔案格式範例:
   file: "game.zip/disk1.po"
   file2: "game.zip/disk2.po"

🚨 按 Ctrl+C 停止伺服器
```

### 4️⃣ 開啟瀏覽器

訪問: **http://localhost:3000/v8**

---

## 🎮 使用方法

1. **選擇遊戲** - 從左側列表點擊任何遊戲，選單會自動滾動到該位置
2. **顯示截圖** - 中間會先顯示該軟體的截圖與資訊
3. **點擊截圖開始** - 點擊截圖後會重載頁面並自動啟動模擬器
4. **開始玩！** - 使用鍵盤控制遊戲

### 🔍 搜尋功能
- 支援中英文遊戲名稱搜尋
- 支援描述、年份、開發商搜尋
- 大小寫不敏感智能匹配

### 🖱️ 滑鼠鎖定功能
- **鎖定滑鼠**：點擊遊戲畫面即可鎖定滑鼠游標
- **解除鎖定**：按 `Esc` 鍵恢復滑鼠游標
- **視覺提示**：滑鼠鎖定時，標題列會顯示黃色提示文字

### ⌨️ 基本操作說明
- **方向控制**：`↑ ↓ ← →` 方向鍵移動/選擇
- **主要動作**：`Space` 動作/跳躍/射擊
- **系統控制**：`Enter` 開始遊戲/確認，`Esc` 暫停/取消/解除滑鼠鎖定
- **搖桿控制**：右邊數字鍵控制方向，左右Alt為搖桿按鈕

### 🖥️ 顯示設定
- **正常模式**：704x462 解析度，無邊框設計
- **全螢幕模式**：按 `⛶ 全螢幕` 按鈕進入，保持正確比例

---

## 🔧 支援的檔案格式

### 1. 傳統 Archive.org 格式
```javascript
{
    "id": "wozaday_SomeGame_IIgs",
    "emu": "apple2gs",
    "file": "00playable.woz",
    "file2": "00playable2.woz",
    "screenshot": "00playable_screenshot.png"
}
```

### 2. 完整 URL 格式
```javascript
{
    "id": "wozaday_Keef_the_Thief_IIgs",
    "emu": "apple2gs",
    "file": "https://archive.org/download/e2gs_0907_Keef_the_Thief_Disk_1/0907_Keef_the_Thief_Disk_1.po",
    "file2": "https://archive.org/download/e2gs_0908_Keef_the_Thief_Disk_2/0908_Keef_the_Thief_Disk_2.po",
    "screenshot": "https://archive.org/download/e2gs_0907_Keef_the_Thief_Disk_1/screenshot.png"
}
```

### 3. ZIP 檔案格式
```javascript
{
    "id": "wozaday_MyGame_IIgs",
    "emu": "apple2gs",
    "file": "mygame.zip/disk1.woz",
    "file2": "mygame.zip/disk2.woz",
    "screenshot": "mygame.zip/screenshot.png"
}
```

### 4. 自訂 URL 支援
```javascript
{
    "id": "custom_game",
    "emu": "apple2gs",
    "file": "https://mywebsite.com/apple2gs/mygame.2mg",
    "file2": "https://cdn.gamefiles.net/apple2gs/mygame_disk2.2mg",
    "screenshot": "https://static.mygames.com/screenshots/mygame.jpg",
    "name": "My Custom Game",
    "nameCh": "我的自訂遊戲"
}
```

---

## 📦 ZIP 檔案支援

### 功能概述
伺服器支援從 ZIP 檔案中直接提取遊戲檔案，無需手動解壓縮。

### 支援的檔案類型
- `.woz`, `.2mg`, `.po`, `.dsk` - 磁碟映像檔
- `.png`, `.jpg`, `.jpeg`, `.gif` - 圖片檔案

### 使用範例

#### Archive.org ZIP 檔案
```javascript
{
    "id": "wozaday_MyGame_IIgs",
    "file": "game_collection.zip/disk1.woz",
    "file2": "game_collection.zip/disk2.woz"
}
```

#### 自訂伺服器 ZIP 檔案
```javascript
{
    "id": "https://myserver.com/games",
    "file": "adventure_pack.zip/main.2mg",
    "file2": "adventure_pack.zip/data.2mg"
}
```

---

## 🔧 API 端點

### 遊戲檔案
```
GET /proxy/game/:itemId/:filename
```

### 完整 URL 代理
```
GET /proxy/url/{encoded_full_url}
```

### ZIP 檔案支援
```
GET /proxy/zip/:zipUrl/:filename
```

### BIOS 和 MAME 引擎
```
GET /proxy/bios/:filename
GET /proxy/mame/:filename
```

---

## 🌐 技術特色

### 後端處理
- 自動檢測 URL 格式（HTTP/HTTPS vs 傳統格式）
- 基本 URL 驗證（只允許 HTTP/HTTPS 協議）
- 透過代理伺服器處理所有外部請求，解決 CORS 問題
- 24 小時快取機制提升效能
- ZIP 檔案智能解析和檔案提取

### 前端處理
- 智能 URL 構建和格式檢測
- 搜尋框和模擬器的焦點管理
- 自動 URL 編碼處理特殊字符
- 滑鼠鎖定和全螢幕支援

### 安全性措施
- 只允許 HTTP 和 HTTPS 協議
- 拒絕其他協議（FTP、FILE 等）
- 基本的 URL 格式驗證
- 完整的錯誤處理和回報

---

## 📝 注意事項

1. **CORS 問題**：所有外部 URL 都會透過後端代理處理，自動解決 CORS 問題
2. **檔案大小**：建議遊戲檔案不超過 10MB，以確保良好的載入體驗
3. **網路穩定性**：外部 URL 的可用性取決於來源伺服器的穩定性
4. **快取機制**：檔案會被快取 24 小時，修改檔案後可能需要等待快取過期
5. **格式支援**：支援 .woz、.2mg、.po、.dsk 等 Apple IIgs 磁片格式

---

## 📄 授權

MIT License - 詳見 LICENSE 檔案
