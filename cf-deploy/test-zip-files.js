/**
 * 測試 ZIP 檔案處理的專用腳本
 * 驗證 Lode Runner 和 Hover Blade 等 ZIP 內檔案是否能正確載入
 */

const BASE_URL = process.argv[2] || 'https://3c696024.a2gsemu-ia.pages.dev';

console.log(`🧪 測試 ZIP 檔案處理: ${BASE_URL}`);

async function testZipEndpoint(url, description) {
    try {
        console.log(`\n🔍 測試: ${description}`);
        console.log(`   URL: ${url}`);
        
        const response = await fetch(url);
        const contentLength = response.headers.get('content-length');
        const contentType = response.headers.get('content-type');
        const zipSource = response.headers.get('x-zip-source');
        const zipEntry = response.headers.get('x-zip-entry');
        const directAccess = response.headers.get('x-direct-access');
        
        console.log(`   狀態: ${response.status} ${response.statusText}`);
        console.log(`   類型: ${contentType}`);
        console.log(`   大小: ${contentLength ? (parseInt(contentLength) / 1024).toFixed(2) + ' KB' : '未知'}`);
        
        if (zipSource) console.log(`   ZIP 來源: ${zipSource}`);
        if (zipEntry) console.log(`   ZIP 條目: ${zipEntry}`);
        if (directAccess) console.log(`   直接存取: ${directAccess}`);
        
        if (response.ok) {
            console.log(`   ✅ 成功`);
            return true;
        } else {
            console.log(`   ❌ 失敗`);
            const errorText = await response.text();
            console.log(`   錯誤: ${errorText}`);
            return false;
        }
    } catch (error) {
        console.log(`   ❌ 錯誤: ${error.message}`);
        return false;
    }
}

async function runZipTests() {
    const zipTests = [
        // Lode Runner 2024 - ZIP 內檔案
        {
            url: `${BASE_URL}/proxy/zip/${encodeURIComponent('https://www.brutaldeluxe.fr/products/apple2gs/loderunner/disks/loderunneriigs.zip')}/lr_system.po`,
            description: 'Lode Runner - System Disk (ZIP 內檔案)'
        },
        {
            url: `${BASE_URL}/proxy/zip/${encodeURIComponent('https://www.brutaldeluxe.fr/products/apple2gs/loderunner/disks/loderunneriigs.zip')}/lr_program.po`,
            description: 'Lode Runner - Program Disk (ZIP 內檔案)'
        },
        
        // Hover Blade - ZIP 內檔案
        {
            url: `${BASE_URL}/proxy/zip/${encodeURIComponent('https://archive.org/download/wozaday_Hover_Blade_IIgs/Hover%20Blade%20IIgs%20%28woz-a-day%20collection%29.zip')}/Hover%20Blade%20IIgs%20%28woz-a-day%20collection%29%2FHover%20Blade%20IIgs%20-%20Disk%202.woz`,
            description: 'Hover Blade - Disk 2 (Archive.org ZIP 內檔案)'
        }
    ];
    
    console.log(`\n🚀 開始測試 ${zipTests.length} 個 ZIP 端點...\n`);
    
    let passed = 0;
    let failed = 0;
    
    for (const test of zipTests) {
        const success = await testZipEndpoint(test.url, test.description);
        if (success) {
            passed++;
        } else {
            failed++;
        }
        
        // 避免請求過於頻繁
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log(`\n📊 ZIP 測試結果:`);
    console.log(`   ✅ 通過: ${passed}`);
    console.log(`   ❌ 失敗: ${failed}`);
    console.log(`   📈 成功率: ${((passed / zipTests.length) * 100).toFixed(1)}%`);
    
    if (failed === 0) {
        console.log(`\n🎉 所有 ZIP 測試通過！Lode Runner 和其他 ZIP 遊戲應該能正常載入！`);
        process.exit(0);
    } else {
        console.log(`\n⚠️  有 ${failed} 個 ZIP 測試失敗，ZIP 檔案處理可能有問題。`);
        process.exit(1);
    }
}

// 執行測試
runZipTests().catch(error => {
    console.error('ZIP 測試執行失敗:', error);
    process.exit(1);
});