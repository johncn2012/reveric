# MetaArc 账号服务

本目录是门户静态页（`public/`）和 Express 账号服务。它还不是可用的商业中台。

## 代码里有的

- PostgreSQL 迁移：用户、套餐、订单、资产、任务、流水
- 规范账号路径：`POST /api/auth/register`、`POST /api/auth/login`、`GET /api/auth/profile`。余额在 profile 的 `quota` / `total_quota`。订单是 `GET /api/auth/orders`，流水是 `GET /api/auth/quota/logs`
- 兼容别名：`POST /api/register`、`POST /api/login`、`GET /api/user/profile`、`GET /api/user/orders`、`GET /api/quota/logs`。别名和规范路径走同一处理函数
- `GET /api/plans`
- 同域账号中心：`/account`。未登录只有登录和注册；登录后只显示上述接口返回的字段。支付未开通，页面不能下单
- Docker Compose 会启动 PostgreSQL、Redis 和本服务。业务代码不连接 Redis
- New-API 连接器在配置可用时尝试开户。失败时写入 `sk-mock-` 开头的占位值，不能当作可用密钥
- 对象存储代码返回未签名地址，不是可用的预签名上传

## 代码里没有的

- 微信支付、支付宝，以及渠道验签
- 门户首页上的登录弹窗、假配额和管理后台。首页顶栏链到 `/account`，不在首页嵌这些界面
- 独立的 `/admin` 站点。管理接口仍在服务里，这期不给入口
- MetaArc 自己的客户端安装包

门户价格只来自 `GET /api/plans`。没有支付渠道时，支付按钮保持不可用。

## 启动

```bash
cp .env.example .env
docker compose up -d
docker compose exec metaarc-postgres psql -U metaarc_user -d metaarc_db -c "\dt"
```

`.env` 里的口令和密钥只留在本机，不要写进文档或提交。
