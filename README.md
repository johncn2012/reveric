# MetaArc（元弧）

MetaArc 是基于 Reveric（幻界）修改的创作客户端，另外带有仍在搭建的账号门户。支持 Windows、macOS、Android。

[English](README.en-US.md)

## 客户端

桌面端和移动端沿用上游的本地优先工作台。小说、剧本、画布、导演台和剪辑在本机完成，作品数据放在本地 SQLite。模型由使用者自己配置供应商。这些创作能力来自 Reveric，不是 MetaArc 已经开通的云端算力，也不是官方托管服务。

## 门户与账号

`server/metaarc/` 提供门户页面和账号接口，包括注册、登录和 `GET /api/plans`。定价区只展示这个接口返回的套餐。接口失败时不显示价格。

支付渠道没有接入。购买和充值按钮不可用，页面也不会显示支付成功。

注册只创建本站账号。移动端没有账号入口，注册成功不会开通移动端同步。算力通道没有返回可用凭据时，界面不把它写成已分配的密钥。

管理页的配置项没有探测接口，不显示「已集成」。

## 下载

门户静态页默认写明尚未发布，不提供上游 Release 链接。Windows 卡片只在同域更新清单返回真实的 `*setup.exe` 时变成下载链接。清单和安装包的放置方式见 `server/metaarc/README.md`。当前安装包没有 Authenticode 签名，按内测包使用。

## 本地运行

在本仓库根目录：

```bash
make deps
make codegen
make run-macos
```

Windows 使用 `make run-windows`。账号服务的启动方式见 `server/metaarc/README.md`。

## 署名与许可证

本仓库基于 Reveric（幻界）修改，作者署名为 looplj。客户端关于页保留署名句 “Based on Reveric by looplj.”。

许可证是 [GNU AGPLv3](./LICENSE)。附加条款和第三方声明见 [NOTICES](./NOTICES)。
