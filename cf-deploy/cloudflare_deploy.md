# Cloudflare Pages & Workers 部署指南

本指南說明如何將 Apple IIgs 線上模擬器部署到 Cloudflare Pages，同時保持原有的本地部署功能。

## 🎯 部署目標

- **Cloudflare Pages**: `a2gsemu-ia.pages.dev`
- **Cloudflare Workers**: `a2gsemu.workers.dev` (如需要)
- **維持原有功能**: 本地 `server.js` 部署仍然可用

## 📋 部署前準備

### 1. 安裝 Wrangler CLI

```bash
npm install -g wrangler
```

### 2. 登入 Cloudflare

**Windows 用戶注意**: 如果遇到 PowerShell 執行策略限制，請使用 cmd：

```bash
# 使用 cmd 登入 (推薦)
cmd /c "wrangler login"

# 或者臨時允許 PowerShell 腳本執行
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
wrangler login
```

登入過程：
1. 命令會在瀏覽器中打開 Cloudflare OAuth 頁面
2. 使用您的 Cloudflare 帳號登入
3. 授權 Wrangler 存取您的帳號
4. 返回終端機確認登入成功

### 3. 確認專案結構

確保以下檔案存在：
```
a2gsemu-ia/
├── functions/
│   └── proxy/
│       └── [[path]].js          # Pages Functions 代理處理
├── _redirects                   # 路由重定向規則
├── wrangler.toml               # Cloudflare 配置
├── index.html                  # 主應用程式
├── games.js                    # 遊戲資料庫 (已更新代理路徑)
├── browserfs.min.js            # 瀏覽器檔案系統
├── loader.js                   # Emularity 載入器
├── favicon.ico                 # 網站圖示
├── logo/                       # 標誌資源
└── package.json               # 專案配置 (包含 jszip)
```

## 🚀 部署步驟

### 快速部署 (推薦)

**Windows 用戶**:
```bash
# 執行自動部署腳本
deploy-windows.bat
```

**Linux/macOS 用戶**:
```bash
# 設定執行權限並執行
chmod +x deploy.sh
./deploy.sh
```

### 選項 A：Cloudflare Pages 部署 (手動)

#### 使用 Wrangler CLI

**Windows 用戶**: 使用 cmd 來避免 PowerShell 執行策略問題

1. **初始化 Pages 專案**
   ```bash
   cmd /c "wrangler pages project create a2gsemu-ia"
   ```

2. **部署到 Cloudflare Pages**
   ```bash
   cmd /c "wrangler pages deploy . --project-name=a2gsemu-ia"
   ```

3. **設定自訂域名 (可選)**
   ```bash
   cmd /c "wrangler pages domain add a2gsemu-ia.pages.dev --project-name=a2gsemu-ia"
   ```

**其他系統**:
```bash
wrangler pages project create a2gsemu-ia
wrangler pages deploy . --project-name=a2gsemu-ia
wrangler pages domain add a2gsemu-ia.pages.dev --project-name=a2gsemu-ia
```

#### 使用 Cloudflare Dashboard

1. **登入 Cloudflare Dashboard**
   - 前往 [Cloudflare Dashboard](https://dash.cloudflare.com/)
   - 選擇 "Pages" 服務

2. **建立新專案**
   - 點擊 "Create a project"
   - 選擇 "Upload assets"
   - 上傳整個專案資料夾

3. **配置專案設定**
   - Project name: `a2gsemu-ia`
   - Build command: (留空)
   - Build output directory: `.`

### 選項 B：Cloudflare Worker 部署 (僅代理服務)

如果您只需要代理服務，可以部署獨立的 Worker：

1. **部署 Worker (Windows)**
   ```bash
   cmd /c "wrangler deploy --config wrangler-worker.toml"
   ```

2. **部署 Worker (其他系統)**
   ```bash
   wrangler deploy --config wrangler-worker.toml
   ```

3. **測試 Worker**
   ```bash
   curl https://a2gsemu.workers.dev/proxy/bios/apple2gs.zip
   ```

**注意**: Worker 版本僅提供代理服務，靜態檔案需要另外託管。

### 選項 C：混合部署

- **Pages**: 託管靜態檔案 (`a2gsemu-ia.pages.dev`)
- **Worker**: 提供代理服務 (`a2gsemu.workers.dev`)

修改 `index.html` 中的 `SERVER_URL`：
```javascript
const SERVER_URL = 'https://a2gsemu.workers.dev';
```

## ⚙️ 技術實現

### Pages Functions 代理

`functions/proxy/[[path]].js` 處理所有 `/proxy/*` 請求：

- **BIOS 檔案**: `/proxy/bios/apple2gs.zip`
- **MAME 引擎**: `/proxy/mame/mameapple2gs.js.gz`
- **遊戲檔案**: `/proxy/game/itemId/filename`
- **完整 URL**: `/proxy/url/encodedUrl`
- **ZIP 檔案**: `/proxy/zip/encodedZipUrl/filename`

### 路由重定向

`_redirects` 檔案處理：
- 代理路由重定向到 Pages Functions
- 靜態資源服務
- 404 回退到主頁

### 遊戲資料更新

`games.js` 中的完整 URL 已自動轉換為代理路徑：
- `screenshot`: `https://...` → `/proxy/url/encoded...`
- `file`: `https://...` → `/proxy/url/encoded...`
- `file2`: `https://...` → `/proxy/url/encoded...`

## 🔧 本地測試

在部署前，可以使用 Wrangler 本地測試：

**Windows**:
```bash
cmd /c "wrangler pages dev . --port 3000"
```

**其他系統**:
```bash
wrangler pages dev . --port 3000
```

**測試 Pages Functions**:
```bash
curl http://localhost:3000/proxy/bios/apple2gs.zip
```

## 📊 功能對比

| 功能 | 本地部署 (server.js) | Cloudflare Pages |
|------|---------------------|------------------|
| 靜態檔案服務 | ✅ Express | ✅ Pages |
| CORS 代理 | ✅ Node.js | ✅ Pages Functions |
| ZIP 檔案支援 | ✅ adm-zip | ✅ 原生解析 + DecompressionStream |
| 快取機制 | ✅ 24小時 | ✅ 24小時 |
| 完整 URL 支援 | ✅ | ✅ |
| 音效支援 | ✅ | ✅ |
| 自動擴展 | ❌ | ✅ |
| 全球 CDN | ❌ | ✅ |

## 🌍 環境變數 (可選)

如需要設定環境變數：

```bash
# 設定生產環境變數
wrangler pages secret put API_KEY --project-name=a2gsemu-ia

# 設定開發環境變數
wrangler pages secret put API_KEY --project-name=a2gsemu-ia --env=preview
```

## 🔍 監控與除錯

### 查看部署日誌

**Windows**:
```bash
cmd /c "wrangler pages deployment list --project-name=a2gsemu-ia"
```

**其他系統**:
```bash
wrangler pages deployment list --project-name=a2gsemu-ia
```

### 查看 Functions 日誌

**Windows**:
```bash
cmd /c "wrangler pages functions tail --project-name=a2gsemu-ia"
```

**其他系統**:
```bash
wrangler pages functions tail --project-name=a2gsemu-ia
```

### 測試代理端點

```bash
# 測試 BIOS 代理
curl https://a2gsemu-ia.pages.dev/proxy/bios/apple2gs.zip

# 測試遊戲檔案代理
curl https://a2gsemu-ia.pages.dev/proxy/game/wozaday_4th_and_Inches_IIgs/00playable.woz

# 測試完整 URL 代理
curl "https://a2gsemu-ia.pages.dev/proxy/url/https%3A%2F%2Farchive.org%2Fdownload%2Ftest%2Ffile.png"

# 測試 ZIP 檔案代理 (Lode Runner)
curl "https://a2gsemu-ia.pages.dev/proxy/zip/https%3A%2F%2Fwww.brutaldeluxe.fr%2Fproducts%2Fapple2gs%2Floderunner%2Fdisks%2Floderunneriigs.zip/lr_system.po"
```

### 專用 ZIP 檔案測試

```bash
# 測試本地 ZIP 處理
node test-zip-files.js http://localhost:3000

# 測試 Pages ZIP 處理
node test-zip-files.js https://a2gsemu-ia.pages.dev
```

## 🚨 常見問題

### 1. PowerShell 執行策略錯誤

**問題**: `running scripts is disabled on this system`
**解決**: 
```bash
# 方法 1: 使用 cmd (推薦)
cmd /c "wrangler login"

# 方法 2: 臨時允許腳本執行
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### 2. Wrangler 配置錯誤

**問題**: `Expected "pages_build_output_dir" to be of type string`
**解決**: 確認 `wrangler.toml` 配置正確：
```toml
name = "a2gsemu-ia"
compatibility_date = "2024-12-24"
```

### 3. ZIP 檔案解析失敗

**問題**: Lode Runner、Hover Blade 等 ZIP 內檔案無法載入
**解決**: 
1. 檢查 ZIP 檔案格式，確保使用標準 ZIP 壓縮
2. 確認 Pages Functions 的 ZIP 處理邏輯正常
3. 使用專用測試腳本診斷：
   ```bash
   node test-zip-files.js https://a2gsemu-ia.pages.dev
   ```
4. 如果直接存取失敗，會自動回退到 ZIP 解析
5. 目前只支援無壓縮的 ZIP 檔案

### 4. CORS 錯誤

**問題**: 瀏覽器顯示 CORS 錯誤
**解決**: 確認 Pages Functions 正確設定 CORS 標頭

### 5. 檔案載入緩慢

**問題**: 遊戲檔案載入速度慢
**解決**: 利用 Cloudflare CDN 快取，檔案會在首次載入後快取

### 6. 函數執行逾時

**問題**: Pages Functions 執行逾時
**解決**: 大型 ZIP 檔案可能需要優化處理邏輯

### 7. 登入問題

**問題**: Wrangler 登入失敗
**解決**: 
```bash
# 清除快取並重新登入
cmd /c "wrangler logout"
cmd /c "wrangler login"
```

## 📈 效能優化

### 1. 快取策略

- 靜態資源: 長期快取 (1年)
- 代理檔案: 中期快取 (24小時)
- API 回應: 短期快取 (1小時)

### 2. 壓縮優化

- 啟用 Brotli/Gzip 壓縮
- 優化圖片格式 (WebP)
- 最小化 JavaScript/CSS

### 3. CDN 配置

- 啟用 Cloudflare 的所有效能功能
- 設定適當的快取規則
- 使用 Page Rules 優化特定路徑

## 🔄 更新部署

### 自動部署 (推薦)

連接 GitHub 倉庫實現自動部署：

1. 在 Cloudflare Dashboard 中連接 GitHub
2. 選擇倉庫和分支
3. 設定建置命令 (可留空)
4. 每次推送自動觸發部署

### 手動部署

**Windows**:
```bash
# 更新部署
cmd /c "wrangler pages deploy . --project-name=a2gsemu-ia"

# 部署到預覽環境
cmd /c "wrangler pages deploy . --project-name=a2gsemu-ia --env=preview"
```

**其他系統**:
```bash
# 更新部署
wrangler pages deploy . --project-name=a2gsemu-ia

# 部署到預覽環境
wrangler pages deploy . --project-name=a2gsemu-ia --env=preview
```

## 📞 支援與維護

- **監控**: 使用 Cloudflare Analytics 監控流量
- **日誌**: 透過 Wrangler CLI 查看 Functions 日誌
- **警報**: 設定 Cloudflare 警報通知異常狀況

## 🎉 部署完成

部署成功後，您的 Apple IIgs 模擬器將可透過以下網址存取：

- **主要網址**: `https://a2gsemu-ia.pages.dev`
- **自訂域名**: `https://your-custom-domain.com` (如已設定)

所有原有功能都將正常運作，包括：
- 130款精選遊戲
- 完整音效支援
- ZIP 檔案支援
- 響應式設計
- 多語言介面
- 滑鼠鎖定功能

享受在全球 CDN 上運行的高效能 Apple IIgs 模擬器！