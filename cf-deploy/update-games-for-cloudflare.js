/**
 * 修復版：更新 games.js 以支援 Cloudflare Pages 部署
 * 將完整 URL 的 screenshot, file, file2 欄位轉換為代理路徑
 * 注意：保持 ZIP 內檔案路徑格式不變 (例如: https://xxx.zip/file.po)
 */

const fs = require('fs');
const path = require('path');

// 讀取 games.js 檔案
const gamesPath = path.join(__dirname, 'games.js');
let gamesContent = fs.readFileSync(gamesPath, 'utf8');

// 轉換函數：將完整 URL 轉換為代理路徑
function convertUrlToProxy(url) {
    if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
        return url; // 不是完整 URL，保持原樣
    }
    
    // 檢查是否為 ZIP 內檔案格式 (例如: https://xxx.zip/file.po)
    if (url.includes('.zip/')) {
        // ZIP 內檔案格式保持原樣，讓 server.js 的現有邏輯處理
        console.log(`🔄 ZIP 內檔案保持原樣: ${url}`);
        return url;
    }
    
    // 編碼 URL 並返回代理路徑
    const encodedUrl = encodeURIComponent(url);
    return `/proxy/url/${encodedUrl}`;
}

// 處理 games.js 內容
console.log('🔄 開始轉換 games.js 中的完整 URL...');
console.log('📝 注意：ZIP 內檔案路徑將保持原樣以維持本地部署相容性');

// 統計轉換數量
let screenshotCount = 0;
let fileCount = 0;
let file2Count = 0;
let zipFileCount = 0;

// 轉換 screenshot 欄位
gamesContent = gamesContent.replace(
    /"screenshot":\s*"(https?:\/\/[^"]+)"/g,
    (match, url) => {
        if (url.includes('.zip/')) {
            zipFileCount++;
            console.log(`📦 ZIP Screenshot 保持原樣: ${url}`);
            return `"screenshot": "${url}"`;
        } else {
            screenshotCount++;
            const proxyUrl = convertUrlToProxy(url);
            console.log(`📸 Screenshot: ${url} -> ${proxyUrl}`);
            return `"screenshot": "${proxyUrl}"`;
        }
    }
);

// 轉換 file 欄位
gamesContent = gamesContent.replace(
    /"file":\s*"(https?:\/\/[^"]+)"/g,
    (match, url) => {
        if (url.includes('.zip/')) {
            zipFileCount++;
            console.log(`📦 ZIP File 保持原樣: ${url}`);
            return `"file": "${url}"`;
        } else {
            fileCount++;
            const proxyUrl = convertUrlToProxy(url);
            console.log(`💾 File: ${url} -> ${proxyUrl}`);
            return `"file": "${proxyUrl}"`;
        }
    }
);

// 轉換 file2 欄位
gamesContent = gamesContent.replace(
    /"file2":\s*"(https?:\/\/[^"]+)"/g,
    (match, url) => {
        if (url.includes('.zip/')) {
            zipFileCount++;
            console.log(`📦 ZIP File2 保持原樣: ${url}`);
            return `"file2": "${url}"`;
        } else {
            file2Count++;
            const proxyUrl = convertUrlToProxy(url);
            console.log(`💾 File2: ${url} -> ${proxyUrl}`);
            return `"file2": "${proxyUrl}"`;
        }
    }
);

// 寫入更新後的檔案
fs.writeFileSync(gamesPath, gamesContent, 'utf8');

console.log('\n✅ 轉換完成！');
console.log(`📊 統計：`);
console.log(`   - Screenshot 轉換: ${screenshotCount} 個`);
console.log(`   - File 轉換: ${fileCount} 個`);
console.log(`   - File2 轉換: ${file2Count} 個`);
console.log(`   - ZIP 檔案保持原樣: ${zipFileCount} 個`);
console.log(`   - 總計轉換: ${screenshotCount + fileCount + file2Count} 個 URL`);
console.log(`   - 總計保持: ${zipFileCount} 個 ZIP 內檔案`);

console.log('\n🎯 games.js 已更新：');
console.log('   ✅ 一般完整 URL 通過 Cloudflare Pages 代理訪問');
console.log('   ✅ ZIP 內檔案路徑保持原樣，維持本地部署相容性');