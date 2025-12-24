/**
 * 測試 Cloudflare 部署的腳本
 * 驗證所有代理端點是否正常工作
 */

const BASE_URL = process.argv[2] || 'http://localhost:3000';

console.log(`🧪 測試部署: ${BASE_URL}`);

async function testEndpoint(url, description) {
    try {
        console.log(`\n🔍 測試: ${description}`);
        console.log(`   URL: ${url}`);
        
        const response = await fetch(url);
        const contentLength = response.headers.get('content-length');
        const contentType = response.headers.get('content-type');
        
        console.log(`   狀態: ${response.status} ${response.statusText}`);
        console.log(`   類型: ${contentType}`);
        console.log(`   大小: ${contentLength ? (parseInt(contentLength) / 1024).toFixed(2) + ' KB' : '未知'}`);
        
        if (response.ok) {
            console.log(`   ✅ 成功`);
            return true;
        } else {
            console.log(`   ❌ 失敗`);
            return false;
        }
    } catch (error) {
        console.log(`   ❌ 錯誤: ${error.message}`);
        return false;
    }
}

async function runTests() {
    const tests = [
        // 靜態檔案測試
        {
            url: `${BASE_URL}/`,
            description: '主頁 (index.html)'
        },
        {
            url: `${BASE_URL}/games.js`,
            description: '遊戲資料庫'
        },
        {
            url: `${BASE_URL}/browserfs.min.js`,
            description: 'BrowserFS 庫'
        },
        {
            url: `${BASE_URL}/loader.js`,
            description: 'Emularity 載入器'
        },
        
        // 代理端點測試
        {
            url: `${BASE_URL}/proxy/bios/apple2gs.zip`,
            description: 'BIOS 檔案代理'
        },
        {
            url: `${BASE_URL}/proxy/mame/mameapple2gs.js.gz`,
            description: 'MAME JS 引擎代理'
        },
        {
            url: `${BASE_URL}/proxy/mame/mameapple2gs.wasm.gz`,
            description: 'MAME WASM 引擎代理'
        },
        {
            url: `${BASE_URL}/proxy/game/wozaday_4th_and_Inches_IIgs/00playable.woz`,
            description: '遊戲檔案代理 (傳統格式)'
        },
        {
            url: `${BASE_URL}/proxy/url/${encodeURIComponent('https://archive.org/download/wozaday_Airball_IIgs/00playable_screenshot.png')}`,
            description: '完整 URL 代理'
        }
    ];
    
    console.log(`\n🚀 開始測試 ${tests.length} 個端點...\n`);
    
    let passed = 0;
    let failed = 0;
    
    for (const test of tests) {
        const success = await testEndpoint(test.url, test.description);
        if (success) {
            passed++;
        } else {
            failed++;
        }
        
        // 避免請求過於頻繁
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log(`\n📊 測試結果:`);
    console.log(`   ✅ 通過: ${passed}`);
    console.log(`   ❌ 失敗: ${failed}`);
    console.log(`   📈 成功率: ${((passed / tests.length) * 100).toFixed(1)}%`);
    
    if (failed === 0) {
        console.log(`\n🎉 所有測試通過！部署成功！`);
        process.exit(0);
    } else {
        console.log(`\n⚠️  有 ${failed} 個測試失敗，請檢查部署配置。`);
        process.exit(1);
    }
}

// 執行測試
runTests().catch(error => {
    console.error('測試執行失敗:', error);
    process.exit(1);
});