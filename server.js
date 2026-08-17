const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const compression = require('compression');
const path = require('path');
const AdmZip = require('adm-zip');

const app = express();
const PORT = process.env.PORT || 3000;

function makeReqId() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function logProxyRequestStart(reqId, label, req, url) {
    const { method, originalUrl } = req;
    const ims = req.get('if-modified-since');
    const inm = req.get('if-none-match');
    const range = req.get('range');
    console.log(`${label} [${reqId}] ${method} ${originalUrl}`);
    console.log(`   URL: ${url}`);
    if (ims) console.log(`   If-Modified-Since: ${ims}`);
    if (inm) console.log(`   If-None-Match: ${inm}`);
    if (range) console.log(`   Range: ${range}`);
}

// 基本 URL 驗證函數
function isValidUrl(urlString) {
    try {
        const url = new URL(urlString);
        // 只允許 HTTP 和 HTTPS 協議
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (err) {
        return false;
    }
}

async function proxyFetchBuffer({ req, res, label, url, contentType }) {
    const reqId = makeReqId();
    const t0 = Date.now();
    logProxyRequestStart(reqId, label, req, url);

    try {
        const response = await fetch(url);

        if (!response.ok) {
            console.error(`${label} [${reqId}] ❌ upstream HTTP ${response.status}`);
            return res.status(response.status).send('File not found');
        }

        const buffer = await response.buffer();
        const ms = Date.now() - t0;
        const mb = (buffer.length / 1024 / 1024).toFixed(2);
        console.log(`${label} [${reqId}] ✅ ${mb} MB (${ms} ms)`);

        res.set('Content-Type', contentType || response.headers.get('content-type') || 'application/octet-stream');
        res.set('Content-Length', buffer.length);
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Cache-Control', 'public, max-age=86400');
        res.set('X-Proxy-Request-Id', reqId);

        return res.send(buffer);
    } catch (err) {
        const ms = Date.now() - t0;
        console.error(`${label} [${reqId}] ❌ error after ${ms} ms:`, err.message);
        return res.status(500).send('Proxy error');
    }
}

// 啟用 CORS
app.use(cors());

// Cross-Origin Isolation (COOP/COEP) — GS² wasm 核心以 pthreads/SharedArrayBuffer 編譯,
// 瀏覽器需要這兩個 header 才開放 SharedArrayBuffer
app.use((req, res, next) => {
    res.set('Cross-Origin-Opener-Policy', 'same-origin');
    res.set('Cross-Origin-Embedder-Policy', 'require-corp');
    next();
});

// 啟用壓縮（但排除已經壓縮的檔案）
app.use(compression({
    filter: (req, res) => {
        // 不壓縮已經是 .gz 的檔案
        if (req.path.endsWith('.gz')) return false;
        return compression.filter(req, res);
    }
}));

// 提供靜態檔案
app.use(express.static('.', {
    setHeaders: (res, filepath) => {
        // 設定 CORS headers
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.set('Access-Control-Allow-Headers', 'Content-Type');
        
        // 設定檔案類型
        if (filepath.endsWith('.wasm')) {
            res.set('Content-Type', 'application/wasm');
        } else if (filepath.endsWith('.js')) {
            res.set('Content-Type', 'application/javascript');
        }
        // 不要為 .gz 設定 Content-Encoding
    }
}));

// 代理 Archive.org 檔案
app.get('/proxy/bios/:filename', async (req, res) => {
    const filename = req.params.filename;
    const url = `https://emularity-bios.ux-b.archive.org/${filename}`;

    return proxyFetchBuffer({
        req,
        res,
        label: `📦 BIOS ${filename}`,
        url
    });
});

// 支援完整 URL 的檔案代理
app.get('/proxy/url/*', async (req, res) => {
    // 從路徑中提取完整 URL
    const fullUrl = req.params[0];
    
    // 基本 URL 驗證
    if (!isValidUrl(fullUrl)) {
        console.error(`🚫 無效的 URL 格式: ${fullUrl}`);
        return res.status(400).send('Invalid URL format');
    }

    const filename = fullUrl.split('/').pop();
    console.log(`   Full URL: ${fullUrl}`);
    
    return proxyFetchBuffer({
        req,
        res,
        label: `🌐 URL ${filename}`,
        url: fullUrl
    });
});

// 支援 ZIP 檔案中的檔案代理
app.get('/proxy/zip/:zipUrl/:filename', async (req, res) => {
    const zipUrl = decodeURIComponent(req.params.zipUrl);
    const filename = req.params.filename;
    
    // 基本 URL 驗證
    if (!isValidUrl(zipUrl)) {
        console.error(`🚫 無效的 ZIP URL 格式: ${zipUrl}`);
        return res.status(400).send('Invalid ZIP URL format');
    }

    const reqId = makeReqId();
    const t0 = Date.now();
    
    console.log(`📦 ZIP [${reqId}] GET ${req.originalUrl}`);
    console.log(`   ZIP URL: ${zipUrl}`);
    console.log(`   Target File: ${filename}`);

    try {
        // 下載 ZIP 檔案
        const response = await fetch(zipUrl);
        
        if (!response.ok) {
            console.error(`📦 ZIP [${reqId}] ❌ upstream HTTP ${response.status}`);
            return res.status(response.status).send('ZIP file not found');
        }

        const zipBuffer = await response.buffer();
        console.log(`📦 ZIP [${reqId}] ✅ Downloaded ZIP: ${(zipBuffer.length / 1024 / 1024).toFixed(2)} MB`);

        // 解析 ZIP 檔案
        const zip = new AdmZip(zipBuffer);
        const zipEntries = zip.getEntries();
        
        // 尋找目標檔案
        const targetEntry = zipEntries.find(entry => {
            const entryName = entry.entryName;
            // 支援完整路徑匹配或檔名匹配
            return entryName === filename || entryName.endsWith('/' + filename) || entryName.endsWith('\\' + filename);
        });

        if (!targetEntry) {
            console.error(`📦 ZIP [${reqId}] ❌ File not found in ZIP: ${filename}`);
            console.log(`📦 ZIP [${reqId}] Available files:`, zipEntries.map(e => e.entryName));
            return res.status(404).send(`File '${filename}' not found in ZIP archive`);
        }

        // 提取檔案內容
        const fileBuffer = zip.readFile(targetEntry);
        const ms = Date.now() - t0;
        const mb = (fileBuffer.length / 1024 / 1024).toFixed(2);
        
        console.log(`📦 ZIP [${reqId}] ✅ Extracted ${filename}: ${mb} MB (${ms} ms)`);

        // 設定適當的 Content-Type
        let contentType = 'application/octet-stream';
        const ext = path.extname(filename).toLowerCase();
        switch (ext) {
            case '.woz':
            case '.2mg':
            case '.po':
            case '.dsk':
                contentType = 'application/octet-stream';
                break;
            case '.png':
                contentType = 'image/png';
                break;
            case '.jpg':
            case '.jpeg':
                contentType = 'image/jpeg';
                break;
            case '.gif':
                contentType = 'image/gif';
                break;
        }

        res.set('Content-Type', contentType);
        res.set('Content-Length', fileBuffer.length);
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Cache-Control', 'public, max-age=86400');
        res.set('X-Proxy-Request-Id', reqId);
        res.set('X-Zip-Source', zipUrl);
        res.set('X-Zip-Entry', targetEntry.entryName);

        return res.send(fileBuffer);

    } catch (err) {
        const ms = Date.now() - t0;
        console.error(`📦 ZIP [${reqId}] ❌ error after ${ms} ms:`, err.message);
        return res.status(500).send('ZIP processing error');
    }
});

app.get('/proxy/game/:itemId/:filename', async (req, res) => {
    const { itemId, filename } = req.params;
    
    // 檢查是否為 ZIP 檔案格式 (例如: game.zip/disk1.po)
    if (filename.includes('.zip/')) {
        const [zipFilename, innerFilename] = filename.split('.zip/');
        const zipFilenameWithExt = zipFilename + '.zip';
        
        // 檢查 itemId 是否為完整 URL
        let zipUrl;
        if (itemId.startsWith('http://') || itemId.startsWith('https://')) {
            // 如果 itemId 是完整 URL，直接使用
            if (!isValidUrl(itemId)) {
                console.error(`🚫 無效的 ZIP URL 格式: ${itemId}`);
                return res.status(400).send('Invalid ZIP URL format');
            }
            zipUrl = `${itemId}/${zipFilenameWithExt}`;
        } else {
            // 傳統格式：從 Archive.org 構建 URL
            zipUrl = `https://archive.org/download/${itemId}/${zipFilenameWithExt}`;
        }
        
        console.log(`🎮 ZIP GAME ${innerFilename} from ${zipFilenameWithExt}`);
        console.log(`   itemId: ${itemId}`);
        console.log(`   ZIP URL: ${zipUrl}`);
        console.log(`   Inner file: ${innerFilename}`);
        
        // 重定向到 ZIP 處理路由
        const encodedZipUrl = encodeURIComponent(zipUrl);
        return res.redirect(`/proxy/zip/${encodedZipUrl}/${innerFilename}`);
    }
    
    // 檢查 filename 是否為完整 URL
    if (filename.startsWith('http://') || filename.startsWith('https://')) {
        // 如果是完整 URL，驗證格式並直接使用
        if (!isValidUrl(filename)) {
            console.error(`🚫 無效的 URL 格式: ${filename}`);
            return res.status(400).send('Invalid URL format');
        }
        
        const actualFilename = filename.split('/').pop();
        
        console.log(`   itemId: ${itemId} (ignored for full URL)`);
        console.log(`   Full URL: ${filename}`);
        
        return proxyFetchBuffer({
            req,
            res,
            label: `🎮 GAME ${actualFilename}`,
            url: filename
        });
    } else {
        // 傳統格式：itemId + filename
        const url = `https://archive.org/download/${itemId}/${filename}`;
        
        console.log(`   itemId: ${itemId}`);
        return proxyFetchBuffer({
            req,
            res,
            label: `🎮 GAME ${filename}`,
            url
        });
    }
});

// 代理 MAME 檔案
app.get('/proxy/mame/:filename', async (req, res) => {
    const filename = req.params.filename;
    const url = `https://emularity-engine.ux-b.archive.org/${filename}`;

    // ⭐ .gz 檔案不要設定 Content-Encoding
    let contentType;
    if (filename.endsWith('.wasm.gz')) {
        contentType = 'application/wasm';
    } else if (filename.endsWith('.js.gz')) {
        contentType = 'application/javascript';
    }

    return proxyFetchBuffer({
        req,
        res,
        label: `🔧 MAME ${filename}`,
        url,
        contentType
    });
});

// 首頁 - 使用後端代理版本
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 啟動伺服器
app.listen(PORT, () => {
    console.log(`\n🚀 Apple IIgs 模擬器伺服器已啟動！`);
    console.log(`🌐 請開啟: http://localhost:${PORT}`);
    console.log(`\n⚡ 可用版本:`);
    console.log(`   - http://localhost:${PORT}     (後端代理版本)`);
    console.log(`\n✨ 功能:`);
    console.log(`   ✅ 代理 Archive.org 檔案（解決 CORS）`);
    console.log(`   ✅ 支援完整 URL 檔案來源`);
    console.log(`   ✅ 支援 ZIP 檔案內檔案提取`);
    console.log(`   ✅ 提供靜態檔案服務`);
    console.log(`   ✅ 快取支援（24 小時）`);
    console.log(`   ✅ 正確處理 .gz 壓縮檔`);
    console.log(`\n📦 ZIP 檔案格式範例:`);
    console.log(`   file: "game.zip/disk1.po"`);
    console.log(`   file2: "game.zip/disk2.po"`);
    console.log(`\n🚨 按 Ctrl+C 停止伺服器\n`);
});
