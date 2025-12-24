#!/bin/bash

echo "🚀 Apple IIgs 模擬器 - Cloudflare Pages 部署腳本"
echo

echo "📋 檢查 Wrangler 安裝..."
if ! command -v wrangler &> /dev/null; then
    echo "❌ Wrangler 未安裝，請先執行: npm install -g wrangler"
    exit 1
fi

echo "✅ Wrangler 已安裝"

echo
echo "🔐 檢查登入狀態..."
if ! wrangler whoami &> /dev/null; then
    echo "📝 需要登入 Cloudflare，即將開啟瀏覽器..."
    wrangler login
    if [ $? -ne 0 ]; then
        echo "❌ 登入失敗"
        exit 1
    fi
fi

echo "✅ 已登入 Cloudflare"

echo
echo "📦 建立 Pages 專案..."
wrangler pages project create a2gsemu-ia 2>/dev/null
if [ $? -ne 0 ]; then
    echo "📝 專案可能已存在，繼續部署..."
else
    echo "✅ 專案建立成功"
fi

echo
echo "🚀 開始部署到 Cloudflare Pages..."
wrangler pages deploy .. --project-name=a2gsemu-ia
if [ $? -ne 0 ]; then
    echo "❌ 部署失敗"
    exit 1
fi

echo
echo "🎉 部署成功！"
echo "🌐 您的網站現在可以在以下網址存取："
echo "   https://a2gsemu-ia.pages.dev"
echo
echo "📊 查看部署狀態："
echo "   wrangler pages deployment list --project-name=a2gsemu-ia"
echo
echo "📝 查看即時日誌："
echo "   wrangler pages functions tail --project-name=a2gsemu-ia"
echo