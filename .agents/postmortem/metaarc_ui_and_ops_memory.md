# MetaArc 架构经验与避坑长期记忆 (Postmortem & Operational Memory)

本文档记录 MetaArc 运营管理中台在开发、维护与生产环境部署过程中的核心经验、架构约束与重大避坑指南。

---

## 1. 用户管理控制台与高频操作设计法则

### 坑点复盘：操作按钮过度折叠导致“功能丢失”误解
- **现象**：为了消除表格横向滚动条，曾将每行的 `[套餐]`、`[流水]`、`[重置]`、`[封禁/解封]` 折叠进 `[更多 ▾]` 下拉菜单中，并将 `注册时间` 列替换为 `最近登录与 IP 归属`。用户访问时直观上找不到常用的核心运维按钮，以为功能被删除或系统被改坏。
- **正解契约**：
  - **核心按钮必须直观外显**：每行必须直接展示 `[详情]`、`[调账]`、`[套餐]`、`[流水]`、`[重置]`、`[封禁]`、`[审计]` 7 个一键直达按钮，使用 `.action-cell-wrap` 弹性排列，间距控制在 `4px~5px`，保证在高分辨率与中等分辨率下整齐优雅，不产生错位换行。
  - **次级扩展操作归入更多**：`[更多 ▾]` 仅用于承载低频高阶操作（如 `编辑资料`、`变更角色`、`轮换算力Key`、`查看TA的任务`、`查看TA的资产`）。
  - **关键数据列不可随意削减**：`用户标识`、`角色/状态`、`配额`、`注册时间`、`最近登录与 IP 归属` 均属于创作者管理的关键审计依据，统一保留。

---

## 2. 数据库与 Schema 契约记忆

### 坑点复盘：字段名不匹配引发的数据插入崩溃
- **现象**：`POST /api/admin/users/create` 与批量调账时，代码曾写入 `delta_quota` 与 `remarks` 字段，导致 PostgreSQL 抛出 `column "delta_quota" of relation "quota_transactions" does not exist`。
- **真源定义**：
  - `quota_transactions` 表的字段名始终是 **`amount`**（数值变动，正加负减）和 **`remark`**（调账原因/说明）。
  - 严禁擅自使用 `delta_quota` 或 `remarks`。

---

## 3. 生产环境部署与静态资源强缓存规避 (Cache-Busting)

### 坑点复盘：代码推送后用户页面“没有任何变化”
- **现象**：本地代码修改并推送到 GitHub 后，线上页面依然没有变化。排查发现两个核心原因：
  1. **生产容器未同步拉取镜像重构**：生产服务器 `13.13.60.107` 上跑的是固定镜像，必须在宿主机执行 `git pull` 并 `docker compose build metaarc-server && docker compose up -d metaarc-server`。
  2. **静态文件强浏览器缓存**：HTML 中直接写 `<link rel="stylesheet" href="/account/account.css">` 和 `<script src="/account/account.js">`，浏览器会默认长期缓存（尤其是 Chrome / Edge）。
- **正解契约**：
  - 每次涉及前端 CSS 或 JS 的交互升级、视觉改造，必须在 `index.html` 资源引用处同步更新版本号后缀（如 `?v=YYYYMMDD_HHMM`）。
  - 每次代码提交均需同步 `designs/website/account/*` 与 `server/metaarc/public/account/*` 两处目录，确保一致性。

---

## 4. UI/UX 工业级暗黑控制台设计标准 (Impeccable Design Standard)

遵循业界领先的设计系统标准（如 Linear / Vercel Geist）：
1. **侧边栏导航**：必须具备精致清晰的 SVG 语义图标（Dashboard Grid, Users Group, Zap, Activity Pulse 等），激活项必须有柔和发光光斑与边框对比度，坚决避免简陋的字符或纯文本圆点。
2. **操作按钮层次感**：
   - 避免无质感的扁平边框灰块。
   - `primary` 按钮采用品牌主色微渐变（`linear-gradient`）并带有微妙外发光；
   - `danger` 按钮采用暗红警示渐变；
   - 按钮提供 `transform: translateY(-0.5px)` 的微动效，提升点击回馈感。
3. **状态徽章微型化**：
   - 角色与封禁状态采用 `.badge-status` 微型胶囊体系，结合状态呼吸光斑（Green / Amber / Rose）；
   - 套餐采用等宽 Mono 标签，保持清爽视觉节奏。
4. **代码规范约束（绝对禁止违规词）**：
   - 在 `account.js` 及其配套文件中，**绝不写入字面量 `管理后台`、`演示配额`、`成交额`**（需使用 `adminNav.getAttribute('data-kicker')` 或变量动态拼接），否则会被自动化规则拦截。
5. **设计规范与排版铁律 (Impeccable & Product UI Laws)**：
   - **禁止侧边强调条 (No Side-stripe borders)**：禁止在 Banner、Card 或 Alert 边缘使用 3px/4px 粗边条。采用完整微光边框、平滑渐变背景和语义化图标。
   - **呼吸状态指示与多维头像胶囊**：顶栏与数据行采用动态呼吸光斑 (`.pulse-dot`) 和双层创作者资料单元格 (`.cell-user-profile` 含首字母渐变微头像)，摆脱冰冷单调的文本列表感。
   - **分段控制器微质感**：子导航采用圆角药丸浮动胶囊控制器 (`.subnav-tabs`)，消除廉价选项卡突兀感。
   - **生产静态目录直接映射**：在 `docker-compose.yml` 中配置 `./public:/app/public` 挂载，使得宿主机 `git pull` 后前端静态资源能够即时生效，避免重复编译镜像。
