#!/usr/bin/env bash
# MetaArc (元弧) - macOS 自动化打包流水线脚本
# 产出目标:
#   1. DMG 安装镜像: dist/MetaArc-v<version>-macos-arm64.dmg
#   2. 自动更新归档: dist/MetaArc-v<version>-macos-arm64.zip
set -e

VERSION=${1:-"0.6.2"}

echo "=========================================================="
echo "🚀 开始打包 MetaArc (元弧) macOS 客户端 v${VERSION} ..."
echo "=========================================================="

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"

mkdir -p dist

# 1. 编译 Flutter macOS Release 二进制
echo "🔨 正在编译 Flutter macOS Release 二进制 (Apple Silicon)..."
if command -v fvm &> /dev/null; then
    fvm flutter build macos --release
elif command -v flutter &> /dev/null; then
    flutter build macos --release
else
    echo "⚠️ 未检测到全局 flutter/fvm，请确保构建环境中已配置 Flutter SDK。"
fi

APP_PATH="${ROOT_DIR}/build/macos/Build/Products/Release/MetaArc.app"

# 2. 如果存在 FastForge，调用生产级 DMG 打包
if command -v fastforge &> /dev/null; then
    echo "📦 正在使用 FastForge 生成 DMG 镜像与更新包..."
    fastforge release --name release --jobs macos-dmg --skip-clean
    fastforge release --name release --jobs macos-zip --skip-clean
else
    # 基础备用打包方案
    if [ -d "${APP_PATH}" ]; then
        ZIP_PATH="${ROOT_DIR}/dist/MetaArc-v${VERSION}-macos-arm64.zip"
        echo "📦 正在压缩 macOS App: ${ZIP_PATH} ..."
        (cd "$(dirname "${APP_PATH}")" && zip -r -q -y "${ZIP_PATH}" "$(basename "${APP_PATH}")")
        echo "✅ ZIP 归档生成完毕: ${ZIP_PATH}"
    else
        echo "ℹ️ 未找到编译产物: ${APP_PATH} (可在 macOS 构建机上直接运行)"
    fi
fi

echo "=========================================================="
echo "🎉 MetaArc macOS 打包流程就绪！"
echo "=========================================================="
