# MetaArc (元弧) 生产环境 5 分钟极速上线指南

本指南专为 **MetaArc (元弧)** 商业中台与 Web 运营门户定制，适用于 Ubuntu 20.04 / 22.04 / Debian 11+ 等 Linux 生产服务器。

---

## 一、服务器与域名解析前置要求

1. **域名解析（在您的域名 DNS 控制台添加两解析记录）**：
   - `metaarc.com.cn`（或 `@`）-> 指向服务器公网 IP（A 记录）
   - `api.metaarc.com.cn` -> 可选。账号接口和账号中心都在主域；这条记录只给仍访问旧主机的客户端，Nginx 会转到同一服务
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

- [ ] **官网**：访问 `https://metaarc.com.cn`，确认页面正常打开。顶栏「账号」进入 `https://metaarc.com.cn/account`。未登录不出现配额数字。支付按钮保持不可用。
- [ ] **健康探针**：访问 `https://metaarc.com.cn/health`，应返回 `{"status":"ok","brand":"MetaArc","db":"connected"}`。
- [ ] **账号路径**：`POST /api/auth/login` 与 `POST /api/login` 对同一请求返回相同结果。`/admin` 未登录不能操作；支付接口返回尚未开通。
- [ ] **数据库**：已有库在服务监听前会补 `users.session_version` 和 `admin_audit_logs`，重复启动不会再加一列。新库由 `migrations/003_session_and_audit.sql` 随初始化执行。回滚代码时这两处可以留下。不要 `docker compose down -v`，也不要覆盖 `.env`、`downloads/` 和 `updates/latest.json`。生产目录是 `/opt/metaarc/server`。
- [ ] **客户端**：桌面端会员弹窗默认服务器为 `https://metaarc.com.cn`。移动端还没有账号入口。
