#!/usr/bin/env bash
set -e

mkdir -p /etc/nginx/ssl/metaarc
cd /etc/nginx/ssl/metaarc

# 1. 根 CA
openssl genrsa -out ca.key 2048
openssl req -x509 -new -nodes -key ca.key -sha256 -days 3650 \
  -subj "/CN=MetaArc Origin CA" -out ca.crt

# 2. 证书请求
openssl genrsa -out server.key 2048
openssl req -new -key server.key \
  -subj "/CN=metaarc.com.cn" -out server.csr

# 3. 配置文件
cat << 'EOF' > extensions.cnf
subjectAltName=DNS:metaarc.com.cn,DNS:www.metaarc.com.cn,DNS:api.metaarc.com.cn
extendedKeyUsage=serverAuth
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
EOF

# 4. 签发
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
  -out server.crt -days 1095 -sha256 -extfile extensions.cnf

chmod 644 ca.crt server.crt
chmod 600 ca.key server.key
ls -la /etc/nginx/ssl/metaarc/
openssl x509 -in server.crt -noout -subject -issuer -dates
