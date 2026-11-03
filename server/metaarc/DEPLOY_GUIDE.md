# MetaArc (元弧) 生产环境 5 分钟极速上线指南

本指南专为 **MetaArc (元弧)** 商业中台与 Web 运营门户定制，适用于 Ubuntu 20.04 / 22.04 / Debian 11+ 等 Linux 生产服务器。

---

## 一、服务器与域名解析前置要求

1. **域名解析（在您的域名 DNS 控制台添加两解析记录）**：
   - `metaarc.com.cn`（或 `@`）-> 指向服务器公网 IP（A 记录）
   - `api.metaarc.com.cn` -> 指向服务器公网 IP（A 记录）
2. **云服务器安全组 / 防火墙开放端口**：
   - `80` (HTTP)
   - `443` (HTTPS)
   - `22` (SSH)

---

## 二、部署执行（仅需 3 步）

### 第 1 步：安装基础环境（Docker 与 Nginx）
登录服务器终端，一键安装 Docker 与 Nginx：
```bash
# 更新系统并安装 Docker
curl -fsSL https://get.docker.com | bash
systemctl enable --now docker

# 安装 Nginx
apt-get update && apt-get install -y nginx
```

### 第 2 步：配置生产环境变量
进入项目 `server/metaarc` 目录：
```bash
cd /opt/metaarc/server/metaarc  # 替换为您放置项目的目录
cp .env.example .env
nano .env                      # 填写您的 NEW_API_ADMIN_KEY、S3 AK/SK 等生产密钥
```

### 第 3 步：一键点火与 SSL 证书申请
执行自愈与部署脚本：
```bash
# 1. 启动 BaaS 容器集群 (Postgres 16 + Redis 7 + MetaArc Server)
chmod +x deploy.sh
./deploy.sh

# 2. 部署 Nginx 生产反向代理
cp nginx/metaarc.conf /etc/nginx/conf.d/metaarc.conf
nginx -t && nginx -s reload

# 3. 一键申请免费 Let's Encrypt SSL 证书并配置自动续期
chmod +x nginx/certbot-init.sh
./nginx/certbot-init.sh
```

---

## 三、线上验证检查清单

- [ ] **官网与收银台**：访问 `https://metaarc.com.cn`，确认页面正常打开、深色电影放映厅样式就绪。
- [ ] **API 网关健康探针**：访问 `https://api.metaarc.com.cn/health`，应返回 `{"status":"ok","brand":"MetaArc","db":"connected"}`。
- [ ] **默认超管后台登录**：
  - 超管账号：`admin@metaarc.com.cn`
  - 初始密码：`Admin@MetaArc2026`
- [ ] **客户端一键连接**：在 Flutter 桌面端打开会员弹窗，输入 `https://api.metaarc.com.cn` 即可秒级登录并自动装配算力！
