# Windows 安装包目录

把 Package workflow 产出的 `MetaArc-<版本>-windows-setup.exe` 放在这里。目录由 Express 挂到 `/downloads`。

不要提交 exe、zip 或 apk。`updates/latest.json` 里的 `file` 必须和这里的文件名一致，并且文件大小大于 0。文件不存在时，更新接口返回尚未发布，不会编造下载地址。

放置步骤和签名说明见 `../README.md`。当前内测包没有 Authenticode 签名。
