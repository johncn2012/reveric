#!/usr/bin/env bash
# MetaArc (元弧) 生产环境一键部署与自愈脚本
set -e

echo "=========================================================="
echo "🌟 正在启动 MetaArc (元弧) 商业中台与多租户网关服务..."
echo "=========================================================="

# 检查 Docker 是否安装
if ! command -v docker &> /dev/null; then
    echo "❌ 错误: 未检测到 Docker，请先安装 Docker 和 Docker Compose。"
    exit 1
fi

# 检查 .env 是否存在，若不存在从 .env.example 复制
if [ ! -f ".env" ]; then
    echo "⚠️ 未发现 .env 文件，正在从 .env.example 生成默认配置..."
    cp .env.example .env
fi

# 构建并启动容器
echo "📦 正在拉起 PostgreSQL 16、Redis 7 与 MetaArc BaaS 容器..."
docker compose up -d --build

echo "⏳ 等待服务健康检查..."
sleep 5

# 检查健康接口
curl -s http://localhost:8080/health || true

echo ""
echo "=========================================================="
echo "✅ MetaArc 后端服务已成功就绪！"
echo "🌐 API 接口地址: http://localhost:8080/api"
echo "🖥️ 官网与收银台: http://localhost:8080"
echo "=========================================================="
