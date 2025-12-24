/**
 * Cloudflare Worker for Apple IIgs Emulator Proxy
 * 獨立 Worker 版本 - 可部署到 a2gsemu.workers.dev
 */

// 基本 URL 驗證函數
function isValidUrl(urlString) {
    try {
        const url = new URL(urlString);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (err) {
        return false;
    }
}

// 生成請求 ID
function makeReqId() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// 處理代理請求的通用函數
async function proxyFetchBuffer(request, label, url, contentType) {
    const reqId = makeReqId();
    const t0 = Date.now();
    
    console.log(`${label} [${reqId}] ${request.method} ${request.url}`);
    console.log(`   Target URL: ${url}`);

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; Apple2GS-Emulator/1.0)',
            }
        });

        if (!response.ok) {
            console.error(`${label} [${reqId}] ❌ upstream HTTP ${response.status}`);
            return new Response('File not found', { status: response.status });
        }

        const buffer = await response.arrayBuffer();
        const ms = Date.now() - t0;
        const mb = (buffer.byteLength / 1024 / 1024).toFixed(2);
        console.log(`${label} [${reqId}] ✅ ${mb} MB (${ms} ms)`);

        const headers = new Headers({
            'Content-Type': contentType || response.headers.get('content-type') || 'application/octet-stream',
            'Content-Length': buffer.byteLength.toString(),
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Cache-Control': 'public, max-age=86400',
            'X-Proxy-Request-Id': reqId,
        });

        return new Response(buffer, { headers });
    } catch (err) {
        const ms = Date.now() - t0;
        console.error(`${label} [${reqId}] ❌ error after ${ms} ms:`, err.message);
        return new Response('Proxy error', { status: 500 });
    }
}

// 處理 ZIP 檔案的簡化版本
async function handleZipProxy(request, zipUrl, filename) {
    // 對於 Worker 版本，我們可以直接返回 ZIP 檔案讓前端處理
    // 或者實現簡化的 ZIP 解析
    return new Response('ZIP processing not implemented in Worker version', { status: 501 });
}

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const pathSegments = url.pathname.split('/').filter(Boolean);

        // 處理 CORS 預檢請求
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                status: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type',
                },
            });
        }

        // 只處理 GET 請求
        if (request.method !== 'GET') {
            return new Response('Method not allowed', { status: 405 });
        }

        // 檢查是否為代理請求
        if (pathSegments[0] !== 'proxy') {
            return new Response('Not found', { status: 404 });
        }

        try {
            const [, category, ...rest] = pathSegments;

            switch (category) {
                case 'bios': {
                    const filename = rest[0];
                    if (!filename) {
                        return new Response('Missing filename', { status: 400 });
                    }
                    const targetUrl = `https://emularity-bios.ux-b.archive.org/${filename}`;
                    return proxyFetchBuffer(request, `📦 BIOS ${filename}`, targetUrl);
                }

                case 'mame': {
                    const filename = rest[0];
                    if (!filename) {
                        return new Response('Missing filename', { status: 400 });
                    }
                    const targetUrl = `https://emularity-engine.ux-b.archive.org/${filename}`;
                    
                    // 設定適當的 Content-Type for .gz 檔案
                    let contentType;
                    if (filename.endsWith('.wasm.gz')) {
                        contentType = 'application/wasm';
                    } else if (filename.endsWith('.js.gz')) {
                        contentType = 'application/javascript';
                    }
                    
                    return proxyFetchBuffer(request, `🔧 MAME ${filename}`, targetUrl, contentType);
                }

                case 'url': {
                    const encodedUrl = rest.join('/');
                    if (!encodedUrl) {
                        return new Response('Missing URL', { status: 400 });
                    }
                    
                    const fullUrl = decodeURIComponent(encodedUrl);
                    if (!isValidUrl(fullUrl)) {
                        console.error(`🚫 無效的 URL 格式: ${fullUrl}`);
                        return new Response('Invalid URL format', { status: 400 });
                    }
                    
                    const filename = fullUrl.split('/').pop();
                    return proxyFetchBuffer(request, `🌐 URL ${filename}`, fullUrl);
                }

                case 'game': {
                    if (rest.length < 2) {
                        return new Response('Missing itemId or filename', { status: 400 });
                    }
                    
                    const itemId = rest[0];
                    const filename = rest.slice(1).join('/');
                    
                    // 檢查 filename 是否為完整 URL
                    if (filename.startsWith('http://') || filename.startsWith('https://')) {
                        if (!isValidUrl(filename)) {
                            console.error(`🚫 無效的 URL 格式: ${filename}`);
                            return new Response('Invalid URL format', { status: 400 });
                        }
                        
                        const actualFilename = filename.split('/').pop();
                        return proxyFetchBuffer(request, `🎮 GAME ${actualFilename}`, filename);
                    } else {
                        // 傳統格式：itemId + filename
                        const targetUrl = `https://archive.org/download/${itemId}/${filename}`;
                        return proxyFetchBuffer(request, `🎮 GAME ${filename}`, targetUrl);
                    }
                }

                default:
                    return new Response('Invalid proxy category', { status: 404 });
            }
        } catch (error) {
            console.error('Proxy error:', error);
            return new Response('Internal server error', { status: 500 });
        }
    },
};