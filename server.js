const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const compression = require('compression');
const path = require('path');

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

app.get('/proxy/game/:itemId/:filename', async (req, res) => {
    const { itemId, filename } = req.params;
    
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
// v8 路由
app.get('/v8', (req, res) => {
    res.sendFile(path.join(__dirname, 'index_emularity_v8.html'));
});

// 啟動伺服器
app.listen(PORT, () => {
    console.log(`\n🚀 Apple IIgs 模擬器伺服器已啟動！`);
    console.log(`🌐 請開啟: http://localhost:${PORT}`);
    console.log(`\n⚡ 可用版本:`);
    console.log(`   - http://localhost:${PORT}     (前端版本，無聲)`);
    console.log(`   - http://localhost:${PORT}/v8  (後端代理版本)`);
    console.log(`\n✨ 功能:`);
    console.log(`   ✅ 代理 Archive.org 檔案（解決 CORS）`);
    console.log(`   ✅ 提供靜態檔案服務`);
    console.log(`   ✅ 快取支援（24 小時）`);
    console.log(`   ✅ 正確處理 .gz 壓縮檔`);
    console.log(`\n🚨 按 Ctrl+C 停止伺服器\n`);
});
