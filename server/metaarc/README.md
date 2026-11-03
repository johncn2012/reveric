# MetaArc (元弧) 商业化中台服务

**品牌官网**：`https://metaarc.com.cn`  
**API 网关**：`https://api.metaarc.com.cn`

本目录为 MetaArc 商业化中台的核心工程，涵盖 Sprint 0 与 Sprint 1 的全部核心能力：
1. **多租户业务数据库**：PostgreSQL 16 初始化迁移脚本（用户、订单、套餐、资产、任务、流水表）；
2. **New-API 自动化联动**：自动开用户、分配专属 Key、充值额度、查询余量；
3. **S3/R2 云端对象存储直传**：租户隔离路径规划与 Presigned PUT 签名生成；
4. **一键容器化编排**：Docker Compose 包含 PostgreSQL + Redis + 业务容器。

## 启动方式

```bash
# 1. 复制配置文件并填入你的实际参数
cp .env.example .env

# 2. 一键启动数据库与后端容器
docker compose up -d

# 3. 校验数据库表结构
docker compose exec metaarc-postgres psql -U metaarc_user -d metaarc_db -c "\dt"
```
