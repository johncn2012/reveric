# Windows 安装包目录

把 Package workflow 产出的 `MetaArc-<版本>-windows-setup.exe` 放在这里。目录由 Express 挂到 `/downloads`。

不要提交 exe、zip 或 apk。

两种清单写法：

1. **本机文件**：`updates/latest.json` 写 `file`，且文件名与本目录一致、大小大于 0。文件缺失时接口返回尚未发布。
2. **对象存储（当前生产）**：清单只写允许主机上的 `download_url`（如 `https://assets.metaarc.com.cn/desktop/...`），不要同时写 `file`。本目录可留同名 exe 作回退，但不会被清单引用。

放置步骤和签名说明见 `../README.md`。当前内测包没有 Authenticode 签名。
