# 静态站构建（不是已发布的安装包）

`site/build.mjs` 把 `designs/website/` 复制到 `site/dist/`，并给样式和脚本加内容哈希。下载区保持「尚未发布」占位，不写入安装包地址。`--version` 会被忽略。

线上门户在 `server/metaarc/public/`。本构建不修改那份文件。首页顶栏链到 `/account`，套餐只请求 `/api/plans`。账号登录、注册和余额在账号中心，走 `/api/auth/*`。

`site/static/` 里的 `reveric.app` 地址，以及 Cloudflare Pages 项目名 `reveric-site`，都不是 MetaArc 已交付的下载渠道。

## 脚本说明

纯静态页面，部署目标写成了 Cloudflare Pages。

## 目录

| 路径 | 内容 |
|---|---|
| `designs/website/` | 页面真源：`index.html`、`landing.css`、`landing.js`、截图、字体子集和本地化的 [cineview](https://www.npmjs.com/package/cineview) |
| `site/build.mjs` | 复制页面到 `site/dist/`。不注入版本号，也不写入安装包链接 |
| `site/static/` | `robots.txt`、`sitemap.xml`、`_headers`，原样复制到产物根目录 |
| `site/scripts/subset_fonts.py` | 按页面用字裁剪 Noto Serif SC |
| `site/screenshots/` | 原始截图和打码脚本，已加入 `.gitignore`，只在本地保留 |

## 本地预览

```bash
python3 -m http.server 4311 --directory designs
# 打开 http://localhost:4311/website/index.html
```

查看构建产物：

```bash
node site/build.mjs
python3 -m http.server 4312 --directory site/dist
```

## 修改文案

改 `designs/website/index.html`。如果新增了字体子集里没有的汉字，`build.mjs` 会列出缺少的字，此时运行 `make site-fonts` 重新生成字体子集（首次运行会把源字体和 fonttools 缓存到 `site/.cache/`）。

## 更新截图

原始截图用 Reveric 深色主题、窗口 1440×900、按 2x 截取，放进本地的 `site/screenshots/`，用其中的 `process_screenshots.py` 打码后输出到 `designs/website/assets/`。

## 部署

现有 `Website` workflow 和 `Package` 里的 `deploy-website` 仍会在有人运行时把 `site/dist` 上传到旧的 Cloudflare 项目 `reveric-site`。构建结果里没有安装包链接。推送代码不会触发部署。本地上传命令是 `make site-deploy`；只构建用 `make site-build`。

### 首次配置

1. 创建 Direct Upload 类型的 Pages 项目，生产分支设为 `unstable`（Direct Upload 项目不连 git，这里只需与 workflow 中 `--branch` 一致）：
   `npx wrangler pages project create reveric-site --production-branch=unstable`
2. 在 Pages 项目里绑定自定义域名 `reveric.app`。
3. 在 GitHub 仓库 Secrets 中添加：
   - `CLOUDFLARE_API_TOKEN`：带 `Cloudflare Pages: Edit` 权限的 API Token
   - `CLOUDFLARE_ACCOUNT_ID`：Cloudflare 账户 ID
