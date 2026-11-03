# MetaArc 账号服务

本目录是门户静态页（`public/`）和 Express 账号服务。它还不是可用的商业中台。

## 代码里有的

- PostgreSQL 迁移：用户、套餐、订单、资产、任务、流水
- `POST /api/register`、`POST /api/login`、`GET /api/user/profile`、`GET /api/plans`
- Docker Compose 会启动 PostgreSQL、Redis 和本服务。业务代码不连接 Redis
- New-API 连接器在配置可用时尝试开户。失败时写入 `sk-mock-` 开头的占位值，不能当作可用密钥
- 对象存储代码返回未签名地址，不是可用的预签名上传

## 代码里没有的

- 微信支付、支付宝，以及渠道验签
- 独立的用户中心或管理后台路由。相关界面嵌在门户单页里
- MetaArc 自己的客户端安装包

门户价格只来自 `GET /api/plans`。没有支付渠道时，支付按钮保持不可用。

## 启动

```bash
cp .env.example .env
docker compose up -d
docker compose exec metaarc-postgres psql -U metaarc_user -d metaarc_db -c "\dt"
```

`.env` 里的口令和密钥只留在本机，不要写进文档或提交。
