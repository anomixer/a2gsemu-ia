@echo off
chcp 65001
echo 🚀 Apple IIgs 模擬器 - Cloudflare Pages 部署腳本 (Windows)
echo.

echo 📋 檢查 Wrangler 安裝...
cmd /c "wrangler --version" >nul 2>&1
if errorlevel 1 (
    echo ❌ Wrangler 未安裝，請先執行: npm install -g wrangler
    pause
    exit /b 1
)

echo ✅ Wrangler 已安裝

echo.
echo 🔐 檢查登入狀態...
cmd /c "wrangler whoami" >nul 2>&1
if errorlevel 1 (
    echo 📝 需要登入 Cloudflare，即將開啟瀏覽器...
    cmd /c "wrangler login"
    if errorlevel 1 (
        echo ❌ 登入失敗
        pause
        exit /b 1
    )
)

echo ✅ 已登入 Cloudflare

echo.
echo 📦 建立 Pages 專案...
cmd /c "wrangler pages project create a2gsemu-ia" 2>nul
if errorlevel 1 (
    echo 📝 專案可能已存在，繼續部署...
) else (
    echo ✅ 專案建立成功
)

echo.
echo 🚀 開始部署到 Cloudflare Pages...
cmd /c "wrangler pages deploy .. --project-name=a2gsemu-ia"
if errorlevel 1 (
    echo ❌ 部署失敗
    pause
    exit /b 1
)

echo.
echo 🎉 部署成功！
echo 🌐 您的網站現在可以在以下網址存取：
echo    https://a2gsemu-ia.pages.dev
echo.
echo 📊 查看部署狀態：
echo    cmd /c "wrangler pages deployment list --project-name=a2gsemu-ia"
echo.
echo 📝 查看即時日誌：
echo    cmd /c "wrangler pages functions tail --project-name=a2gsemu-ia"
echo.
pause