#!/usr/bin/env bash
# MetaArc (元弧) - SSL 自动化申请与续期脚本 (Let's Encrypt / Certbot)
set -e

DOMAIN="metaarc.com.cn"
SUBDOMAIN="api.metaarc.com.cn"
EMAIL="admin@metaarc.com.cn"

echo "=========================================================="
echo "🔐 正在为 ${DOMAIN} 与 ${SUBDOMAIN} 申请免费 Let's Encrypt SSL 证书..."
echo "=========================================================="

# 检查 certbot
if ! command -v certbot &> /dev/null; then
    echo "📦 正在安装 Certbot..."
    apt-get update && apt-get install -y certbot python3-certbot-nginx
fi

# 申请证书
certbot certonly --nginx \
    -d "${DOMAIN}" \
    -d "www.${DOMAIN}" \
    -d "${SUBDOMAIN}" \
    --email "${EMAIL}" \
    --agree-tos \
    --no-eff-email \
    --non-interactive

echo "✅ 证书申请成功！已安装于 /etc/letsencrypt/live/${DOMAIN}/"

# 重载 Nginx
nginx -s reload || systemctl reload nginx

# 配置每日自动续期检查
(crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet && nginx -s reload") | crontab -

echo "🎉 自动续期任务已注册，证书将在到期前 30 天自动无缝延期！"
