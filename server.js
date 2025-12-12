const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const compression = require('compression');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

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
    
    console.log(`📦 下載 BIOS: ${filename}`);
    console.log(`   URL: ${url}`);
    
    try {
        const response = await fetch(url);
        
        if (!response.ok) {
            console.error(`❌ 下載失敗: HTTP ${response.status}`);
            return res.status(response.status).send('File not found');
        }
        
        const buffer = await response.buffer();
        console.log(`✅ BIOS 下載成功: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);
        
        // 設定 headers
        res.set('Content-Type', response.headers.get('content-type') || 'application/octet-stream');
        res.set('Content-Length', buffer.length);
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Cache-Control', 'public, max-age=86400'); // 快取 24 小時
        
        res.send(buffer);
    } catch (err) {
        console.error(`❌ 下載錯誤:`, err.message);
        res.status(500).send('Proxy error');
    }
});

app.get('/proxy/game/:itemId/:filename', async (req, res) => {
    const { itemId, filename } = req.params;
    const url = `https://archive.org/download/${itemId}/${filename}`;
    
    console.log(`🎮 下載遊戲: ${filename}`);
    console.log(`   項目: ${itemId}`);
    console.log(`   URL: ${url}`);
    
    try {
        const response = await fetch(url);
        
        if (!response.ok) {
            console.error(`❌ 下載失敗: HTTP ${response.status}`);
            return res.status(response.status).send('File not found');
        }
        
        const buffer = await response.buffer();
        console.log(`✅ 遊戲下載成功: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);
        
        // 設定 headers
        res.set('Content-Type', response.headers.get('content-type') || 'application/octet-stream');
        res.set('Content-Length', buffer.length);
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Cache-Control', 'public, max-age=86400');
        
        res.send(buffer);
    } catch (err) {
        console.error(`❌ 下載錯誤:`, err.message);
        res.status(500).send('Proxy error');
    }
});

// 代理 MAME 檔案
app.get('/proxy/mame/:filename', async (req, res) => {
    const filename = req.params.filename;
    const url = `https://emularity-engine.ux-b.archive.org/${filename}`;
    
    console.log(`🔧 下載 MAME: ${filename}`);
    console.log(`   URL: ${url}`);
    
    try {
        const response = await fetch(url);
        
        if (!response.ok) {
            console.error(`❌ 下載失敗: HTTP ${response.status}`);
            return res.status(response.status).send('File not found');
        }
        
        const buffer = await response.buffer();
        console.log(`✅ MAME 下載成功: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);
        
        // 設定 headers
        // ⭐ 關鍵修正：.gz 檔案不要設定 Content-Encoding
        // 讓瀏覽器當作普通二進制檔案處理
        if (filename.endsWith('.wasm.gz')) {
            res.set('Content-Type', 'application/wasm');
        } else if (filename.endsWith('.js.gz')) {
            res.set('Content-Type', 'application/javascript');
        } else {
            res.set('Content-Type', response.headers.get('content-type') || 'application/octet-stream');
        }
        
        res.set('Content-Length', buffer.length);
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Cache-Control', 'public, max-age=86400');
        
        // ❌ 不要設定 Content-Encoding: gzip
        // 因為檔案已經是 .gz 格式，瀏覽器會自動處理
        
        res.send(buffer);
    } catch (err) {
        console.error(`❌ 下載錯誤:`, err.message);
        res.status(500).send('Proxy error');
    }
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
