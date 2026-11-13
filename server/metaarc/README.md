# MetaArc 账号服务

本目录是门户静态页（`public/`）和 Express 账号服务。它还不是可用的商业中台。

## 代码里有的

- PostgreSQL 迁移：用户、套餐、订单、资产、任务、流水
- 规范账号路径：`POST /api/auth/register`、`POST /api/auth/login`、`GET /api/auth/profile`。余额在 profile 的 `quota` / `total_quota`。订单是 `GET /api/auth/orders`，流水是 `GET /api/auth/quota/logs`
- 兼容别名：`POST /api/register`、`POST /api/login`、`GET /api/user/profile`、`GET /api/user/orders`、`GET /api/quota/logs`。别名和规范路径走同一处理函数
- `GET /api/plans`
- `GET /api/updates/latest?platform=windows&arch=x64&current=<版本>`。没有清单或安装包文件时返回 `has_update: false`、`status: "unreleased"`，不带 `download_url`
- 同域账号中心：`/account`。未登录是登录和注册；登录后只显示上述接口返回的字段。管理员从登录后的入口进入 `/admin`，读取既有管理接口。支付未开通，页面不能下单，也不汇总金额
- `GET /api/updates/catalog` 同时给出 Windows、macOS、Android 的清单结果。没有安装包时各平台都是尚未发布
- `POST /api/auth/forgot-password` 固定返回尚未开通，不发送邮件
- `POST /api/orders/create`、`POST /api/orders/:id/pay` 和 `POST /api/orders/notify/:channel` 在支付开通前返回 403，不再把订单标成已支付
- Docker Compose 会启动 PostgreSQL、Redis 和本服务。业务代码不连接 Redis
- New-API 连接器在配置可用时尝试开户。失败时写入 `sk-mock-` 开头的占位值，不能当作可用密钥
- 对象存储代码返回未签名地址，不是可用的预签名上传

## 代码里没有的

- 微信支付、支付宝，以及渠道验签。手动完成支付和未验签通知都已关闭
- 门户首页上的登录弹窗和假配额。首页顶栏链到 `/account`，帮助在 `/help/`
- 不登录就能操作的管理后台。`/admin` 只是同一套页面的管理员入口，仍要先登录，角色不符返回 403
- 已提交的 Windows 安装包。`downloads/` 里只有说明，`updates/latest.json` 不入库

门户价格只来自 `GET /api/plans`。没有支付渠道时，支付按钮保持不可用。

## Windows 内测包

客户端默认请求 `https://metaarc.com.cn/api/updates/latest`。编译期可以用 `--dart-define=METAARC_UPDATE_API_BASE=...`、`--dart-define=METAARC_UPDATE_API_PATH=...` 或 `--dart-define=METAARC_UPDATE_API=<完整 URL>` 改地址。`--dart-define=METAARC_UPDATE_SOURCE=unavailable` 会关掉清单查询，关于页仍显示尚未发布，且不发网络请求。

查询参数是 `platform`（`windows`）、`arch`（`x64` 或 `arm64`）和 `current`（当前版本）。`arch` 是 CPU 架构，不是操作系统版本文本。

放置一份内测包：

1. 用 Package workflow 打 Windows 安装器。触发方式是推送 `v*` tag，或在 Actions 里手动运行 Package，`platform` 选 `windows`。产物名必须是 `MetaArc-<版本>-windows-setup.exe`。这一步不签名。
2. 把该 exe 放到本目录的 `downloads/`。不要提交 exe。
3. 复制 `updates/latest.example.json` 为 `updates/latest.json`，把 `version` 和 `file` 改成实际文件。写了 `file` 就只认这个本地文件，文件缺失时不会改用 `download_url`。`signed` 保持 `false`，除非这个文件真的做了 Authenticode。
4. 重启或直接请求 `GET /api/updates/latest?platform=windows&arch=x64&current=0.0.0`。有文件时返回 `has_update: true`、`version` 和 `download_url`；文件不在磁盘上时仍然是尚未发布。
5. 对外下载地址由 `UPDATE_PUBLIC_BASE_URL` 决定，默认 `https://metaarc.com.cn`。只有真正提供 `/downloads` 的那台机器可以写 `latest.json`。对象存储上的包不要写 `file`，改为 `download_url`，主机名必须是 `metaarc.com.cn` 或其子域；其它主机名放进 `UPDATE_DOWNLOAD_HOSTS`。不要填写 GitHub Release 地址。

`downloads/` 会由 Express 挂到 `/downloads`。Docker Compose 把 `./downloads` 和 `./updates` 挂进容器。大文件以后可以改到对象存储，清单仍由这个接口返回 URL。

macOS bundle id 是 `cn.metaarc` / `cn.metaarc.debug`。Windows 可执行文件是 `MetaArc.exe`。Inno `app_id` 仍是 `ai.reveric`，这样升级会替换原来的安装，而不是再装一份。Android `applicationId` 和 iOS bundle id 仍是 `ai.reveric`，因为新包读不到旧的私有目录。Dart 包名仍是 `reveric`。

macOS 与 Android 下载卡片保持尚未发布。本接口可以描述它们，但这次不要求打出这两个包。

## 启动

```bash
cp .env.example .env
docker compose up -d
docker compose exec metaarc-postgres psql -U metaarc_user -d metaarc_db -c "\dt"
```

`.env` 里的口令和密钥只留在本机，不要写进文档或提交。

## 生产目录 /opt/metaarc/server

生产机上的 Docker 工程就在 `/opt/metaarc/server`。更新时只替换代码和镜像，保留已经在跑的数据。

保留、不要覆盖、也不要打进部署包的内容：

- `/opt/metaarc/server/.env`
- `/opt/metaarc/server/downloads/`
- `/opt/metaarc/server/updates/latest.json`
- Docker 卷 `postgres_data`、`redis_data`

部署包是 `server/metaarc` 的代码归档，不含 `node_modules`、`.env`、`downloads/`、`updates/latest.json` 和数据库。解压到原目录时，包里没有的文件会留在磁盘上。

```bash
cd /opt/metaarc/server
# 备份由现场另行完成。不要使用 docker compose down -v。
tar -xzf metaarc-server-deploy.tar.gz -C /opt/metaarc/server
docker compose up -d --build
curl -fsS http://127.0.0.1:8080/health
```

仍在 `/opt/metaarc/server` 里执行 compose，不要改项目名，否则会新建一套空数据库卷。服务启动前会先做一次幂等补列：`users.session_version` 和 `admin_audit_logs`。新空库还会在首次初始化时执行 `migrations/003_session_and_audit.sql`。已有用户、安装包和更新清单不会被这条升级改写。

回滚：用上一份代码包按同样方式解压，再 `docker compose up -d --build`。新列和新表可以留下，旧版本不读取它们。不要删除用户表。回滚到禁用支付之前的版本后，未验签的支付完成接口会重新可用。

核对：

```bash
docker compose exec metaarc-postgres psql -U metaarc_user -d metaarc_db -c "\d users" | grep session_version
docker compose exec metaarc-postgres psql -U metaarc_user -d metaarc_db -c "\d admin_audit_logs"
test -f /opt/metaarc/server/.env && test -f /opt/metaarc/server/updates/latest.json
```
