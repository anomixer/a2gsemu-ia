/**
 * Cloudflare Pages Function for Apple IIgs Emulator Proxy
 * 處理所有 /proxy/* 路由的代理請求
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

// 記錄代理請求
function logProxyRequest(reqId, label, url, request) {
    console.log(`${label} [${reqId}] ${request.method} ${request.url}`);
    console.log(`   Target URL: ${url}`);
}

// 處理代理請求的通用函數
async function proxyFetchBuffer(request, label, url, contentType) {
    const reqId = makeReqId();
    const t0 = Date.now();
    logProxyRequest(reqId, label, url, request);

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

// 處理 ZIP 檔案中的檔案提取 - 改進版本
async function handleZipProxy(request, zipUrl, filename) {
    if (!isValidUrl(zipUrl)) {
        console.error(`🚫 無效的 ZIP URL 格式: ${zipUrl}`);
        return new Response('Invalid ZIP URL format', { status: 400 });
    }

    const reqId = makeReqId();
    const t0 = Date.now();
    
    console.log(`📦 ZIP [${reqId}] ${request.method} ${request.url}`);
    console.log(`   ZIP URL: ${zipUrl}`);
    console.log(`   Target File: ${filename}`);

    try {
        // 對於 Archive.org，嘗試多種直接存取策略
        if (zipUrl.includes('archive.org')) {
            console.log(`📦 ZIP [${reqId}] 🔄 Archive.org detected, trying multiple strategies...`);
            
            // 策略 1: Archive.org 原生 ZIP 內檔案存取 (最可能成功)
            // 保持原始 .zip/ 格式，這是 Archive.org 的標準格式
            const directUrl1 = `${zipUrl}/${filename}`;
            console.log(`📦 ZIP [${reqId}] 🔄 Strategy 1 (Archive.org native): ${directUrl1}`);
            
            const directResponse1 = await fetch(directUrl1);
            if (directResponse1.ok) {
                return await createSuccessResponse(directResponse1, reqId, t0, filename, zipUrl, 'Archive.org Native');
            }
            
            // 策略 2: 直接替換 .zip/ 為 / (解壓縮版本)
            const directUrl2 = zipUrl.replace('.zip/', '/');
            console.log(`📦 ZIP [${reqId}] 🔄 Strategy 2 (Unzipped): ${directUrl2}`);
            
            const directResponse2 = await fetch(directUrl2);
            if (directResponse2.ok) {
                return await createSuccessResponse(directResponse2, reqId, t0, filename, zipUrl, 'Unzipped Version');
            }
            
            // 策略 3: 嘗試解壓縮目錄結構
            const pathParts = zipUrl.split('/');
            const zipFilename = pathParts[pathParts.length - 1];
            const basePath = pathParts.slice(0, -1).join('/');
            const directUrl3 = `${basePath}/${zipFilename.replace('.zip', '')}/${filename}`;
            console.log(`📦 ZIP [${reqId}] 🔄 Strategy 3 (Directory): ${directUrl3}`);
            
            const directResponse3 = await fetch(directUrl3);
            if (directResponse3.ok) {
                return await createSuccessResponse(directResponse3, reqId, t0, filename, zipUrl, 'Directory Structure');
            }
            
            // 策略 4: 嘗試不同的編碼格式
            const directUrl4 = `${zipUrl}/${encodeURIComponent(filename)}`;
            console.log(`📦 ZIP [${reqId}] 🔄 Strategy 4 (Encoded): ${directUrl4}`);
            
            const directResponse4 = await fetch(directUrl4);
            if (directResponse4.ok) {
                return await createSuccessResponse(directResponse4, reqId, t0, filename, zipUrl, 'Encoded Filename');
            }
        } else {
            // 非 Archive.org，對於大多數伺服器，直接存取 ZIP 內檔案不被支援
            // 直接跳到 ZIP 解析，避免無效的直接存取嘗試
            console.log(`📦 ZIP [${reqId}] 🔄 Non-Archive.org ZIP, skipping direct access strategies`);
        }
        
        // 所有直接存取策略都失敗，回退到 ZIP 解析
        console.log(`📦 ZIP [${reqId}] 🔄 All direct access failed, trying ZIP extraction...`);
        
        // 下載 ZIP 檔案
        const response = await fetch(zipUrl);
        
        if (!response.ok) {
            console.error(`📦 ZIP [${reqId}] ❌ upstream HTTP ${response.status}`);
            return new Response('ZIP file not found', { status: response.status });
        }

        const zipBuffer = await response.arrayBuffer();
        console.log(`📦 ZIP [${reqId}] ✅ Downloaded ZIP: ${(zipBuffer.byteLength / 1024 / 1024).toFixed(2)} MB`);

        // 使用改進的 ZIP 解析
        const result = await extractFromZipImproved(zipBuffer, filename, reqId);
        
        if (result.success) {
            const ms = Date.now() - t0;
            const mb = (result.buffer.byteLength / 1024 / 1024).toFixed(2);
            
            console.log(`📦 ZIP [${reqId}] ✅ Extracted ${filename}: ${mb} MB (${ms} ms)`);

            const headers = new Headers({
                'Content-Type': getContentType(filename),
                'Content-Length': result.buffer.byteLength.toString(),
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Cache-Control': 'public, max-age=86400',
                'X-Proxy-Request-Id': reqId,
                'X-Zip-Source': zipUrl,
                'X-Zip-Entry': result.entryName,
                'X-Compression-Method': result.compressionMethod.toString(),
            });

            return new Response(result.buffer, { headers });
        } else {
            console.error(`📦 ZIP [${reqId}] ❌ ${result.error}`);
            return new Response(result.error, { status: 404 });
        }

    } catch (err) {
        const ms = Date.now() - t0;
        console.error(`📦 ZIP [${reqId}] ❌ error after ${ms} ms:`, err.message);
        return new Response('ZIP processing error', { status: 500 });
    }
}

// 輔助函數：創建成功回應
async function createSuccessResponse(response, reqId, t0, filename, zipUrl, strategy) {
    const buffer = await response.arrayBuffer();
    const ms = Date.now() - t0;
    const mb = (buffer.byteLength / 1024 / 1024).toFixed(2);
    
    console.log(`📦 ZIP [${reqId}] ✅ ${strategy} successful: ${mb} MB (${ms} ms)`);
    
    const headers = new Headers({
        'Content-Type': getContentType(filename),
        'Content-Length': buffer.byteLength.toString(),
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Cache-Control': 'public, max-age=86400',
        'X-Proxy-Request-Id': reqId,
        'X-Zip-Source': zipUrl,
        'X-Direct-Access': strategy,
    });

    return new Response(buffer, { headers });
}

// 輔助函數：獲取 Content-Type
function getContentType(filename) {
    const ext = filename.split('.').pop()?.toLowerCase();
    switch (ext) {
        case 'woz':
        case '2mg':
        case 'po':
        case 'dsk':
            return 'application/octet-stream';
        case 'png':
            return 'image/png';
        case 'jpg':
        case 'jpeg':
            return 'image/jpeg';
        case 'gif':
            return 'image/gif';
        default:
            return 'application/octet-stream';
    }
}

// 改進的 ZIP 提取函數，支援更多壓縮格式
async function extractFromZipImproved(zipBuffer, filename, reqId) {
    try {
        const view = new DataView(zipBuffer);
        
        // 尋找中央目錄結束記錄
        let eocdOffset = -1;
        for (let i = zipBuffer.byteLength - 22; i >= Math.max(0, zipBuffer.byteLength - 65557); i--) {
            if (view.getUint32(i, true) === 0x06054b50) {
                eocdOffset = i;
                break;
            }
        }
        
        if (eocdOffset === -1) {
            return { success: false, error: 'Invalid ZIP file: EOCD not found' };
        }
        
        const totalEntries = view.getUint16(eocdOffset + 10, true);
        const centralDirOffset = view.getUint32(eocdOffset + 16, true);
        
        console.log(`📦 ZIP [${reqId}] 📊 Total entries: ${totalEntries}`);
        
        // 解析中央目錄
        let offset = centralDirOffset;
        const allFiles = [];
        
        for (let i = 0; i < totalEntries; i++) {
            if (view.getUint32(offset, true) !== 0x02014b50) break;
            
            const filenameLength = view.getUint16(offset + 28, true);
            const extraFieldLength = view.getUint16(offset + 30, true);
            const commentLength = view.getUint16(offset + 32, true);
            const localHeaderOffset = view.getUint32(offset + 42, true);
            const compressionMethod = view.getUint16(offset + 10, true);
            
            // 讀取檔案名
            const filenameBytes = new Uint8Array(zipBuffer, offset + 46, filenameLength);
            const entryFilename = new TextDecoder('utf-8', { ignoreBOM: true }).decode(filenameBytes);
            
            allFiles.push({
                filename: entryFilename,
                localHeaderOffset,
                compressionMethod
            });
            
            // 檢查是否為目標檔案
            if (entryFilename === filename || 
                entryFilename.endsWith('/' + filename) || 
                entryFilename.endsWith('\\' + filename)) {
                
                console.log(`📦 ZIP [${reqId}] 🎯 Found target file: ${entryFilename} (compression: ${compressionMethod})`);
                
                // 讀取本地檔案頭
                if (view.getUint32(localHeaderOffset, true) !== 0x04034b50) {
                    return { success: false, error: 'Invalid local file header' };
                }
                
                const compressedSize = view.getUint32(localHeaderOffset + 18, true);
                const uncompressedSize = view.getUint32(localHeaderOffset + 22, true);
                const localFilenameLength = view.getUint16(localHeaderOffset + 26, true);
                const localExtraFieldLength = view.getUint16(localHeaderOffset + 28, true);
                
                const fileDataOffset = localHeaderOffset + 30 + localFilenameLength + localExtraFieldLength;
                
                // 如果本地檔案頭中的大小為 0，使用中央目錄中的大小
                const actualCompressedSize = compressedSize || view.getUint32(offset + 20, true);
                const actualUncompressedSize = uncompressedSize || view.getUint32(offset + 24, true);
                
                console.log(`📦 ZIP [${reqId}] 📊 File info: compressed=${actualCompressedSize}, uncompressed=${actualUncompressedSize}, method=${compressionMethod}`);
                
                if (compressionMethod === 0) {
                    // 無壓縮
                    const actualSize = actualCompressedSize || actualUncompressedSize;
                    const buffer = zipBuffer.slice(fileDataOffset, fileDataOffset + actualSize);
                    return { 
                        success: true, 
                        buffer, 
                        entryName: entryFilename,
                        compressionMethod
                    };
                } else if (compressionMethod === 8) {
                    // Deflate 壓縮 - 使用 Cloudflare Workers 的 DecompressionStream
                    try {
                        const compressedData = new Uint8Array(zipBuffer, fileDataOffset, actualCompressedSize);
                        console.log(`📦 ZIP [${reqId}] 🔄 Attempting Deflate decompression: ${actualCompressedSize} bytes compressed → ${actualUncompressedSize} bytes expected`);
                        
                        // 檢查 DecompressionStream 是否可用
                        if (typeof DecompressionStream === 'undefined') {
                            console.error(`📦 ZIP [${reqId}] ❌ DecompressionStream not available`);
                            return { success: false, error: 'DecompressionStream not available in this environment' };
                        }
                        
                        // 使用 Cloudflare Workers 的 DecompressionStream
                        const stream = new DecompressionStream('deflate-raw');
                        const writer = stream.writable.getWriter();
                        const reader = stream.readable.getReader();
                        
                        // 寫入壓縮資料並關閉寫入流
                        await writer.write(compressedData);
                        await writer.close();
                        
                        // 讀取解壓縮結果
                        const chunks = [];
                        let totalSize = 0;
                        
                        try {
                            while (true) {
                                const { done, value } = await reader.read();
                                if (done) break;
                                chunks.push(value);
                                totalSize += value.length;
                            }
                        } catch (readError) {
                            console.error(`📦 ZIP [${reqId}] ❌ Error reading decompressed stream:`, readError.message);
                            return { success: false, error: `Failed to read decompressed data: ${readError.message}` };
                        }
                        
                        // 合併所有塊
                        const buffer = new ArrayBuffer(totalSize);
                        const view = new Uint8Array(buffer);
                        let offset = 0;
                        for (const chunk of chunks) {
                            view.set(chunk, offset);
                            offset += chunk.length;
                        }
                        
                        console.log(`📦 ZIP [${reqId}] ✅ Deflate decompression successful: ${totalSize} bytes decompressed`);
                        
                        // 驗證解壓縮大小
                        if (actualUncompressedSize > 0 && totalSize !== actualUncompressedSize) {
                            console.warn(`📦 ZIP [${reqId}] ⚠️  Size mismatch: expected ${actualUncompressedSize}, got ${totalSize}`);
                        }
                        
                        return { 
                            success: true, 
                            buffer, 
                            entryName: entryFilename,
                            compressionMethod
                        };
                        
                    } catch (decompressError) {
                        console.error(`📦 ZIP [${reqId}] ❌ Deflate decompression failed:`, decompressError.message);
                        console.error(`📦 ZIP [${reqId}] ❌ Error details:`, decompressError);
                        return { success: false, error: `Failed to decompress file: ${decompressError.message}` };
                    }
                } else {
                    return { success: false, error: `Unsupported compression method: ${compressionMethod}` };
                }
            }
            
            offset += 46 + filenameLength + extraFieldLength + commentLength;
        }
        
        console.log(`📦 ZIP [${reqId}] 📋 Available files:`, allFiles.map(f => f.filename));
        return { success: false, error: `File '${filename}' not found in ZIP archive` };
        
    } catch (error) {
        console.error(`📦 ZIP [${reqId}] ❌ ZIP parsing error:`, error.message);
        return { success: false, error: `ZIP parsing error: ${error.message}` };
    }
}

export async function onRequest(context) {
    const { request, params } = context;
    const url = new URL(request.url);
    const pathSegments = params.path || [];

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

    try {
        // 解析路徑
        const [category, ...rest] = pathSegments;

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

            case 'zip': {
                if (rest.length < 2) {
                    return new Response('Missing ZIP URL or filename', { status: 400 });
                }
                
                const encodedZipUrl = rest[0];
                const encodedFilename = rest.slice(1).join('/');
                const zipUrl = decodeURIComponent(encodedZipUrl);
                const filename = decodeURIComponent(encodedFilename);
                
                return handleZipProxy(request, zipUrl, filename);
            }

            case 'game': {
                if (rest.length < 2) {
                    return new Response('Missing itemId or filename', { status: 400 });
                }
                
                const itemId = rest[0];
                const filename = rest.slice(1).join('/');
                
                // 檢查是否為 ZIP 檔案格式 (例如: game.zip/disk1.po)
                if (filename.includes('.zip/')) {
                    const [zipFilename, innerFilename] = filename.split('.zip/');
                    const zipFilenameWithExt = zipFilename + '.zip';
                    
                    // 檢查 itemId 是否為完整 URL
                    let zipUrl;
                    if (itemId.startsWith('http://') || itemId.startsWith('https://')) {
                        if (!isValidUrl(itemId)) {
                            console.error(`🚫 無效的 ZIP URL 格式: ${itemId}`);
                            return new Response('Invalid ZIP URL format', { status: 400 });
                        }
                        zipUrl = `${itemId}/${zipFilenameWithExt}`;
                    } else {
                        zipUrl = `https://archive.org/download/${itemId}/${zipFilenameWithExt}`;
                    }
                    
                    return handleZipProxy(request, zipUrl, innerFilename);
                }
                
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
}