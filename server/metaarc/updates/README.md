# 更新清单

`latest.example.json` 只是格式样例，服务不会读取它。

发布内测包时复制为 `latest.json`。`latest.json` 已加入 `.gitignore`。字段含义和上传步骤见 `../README.md`。

没有 `latest.json`，或其中的 Windows 安装包不在 `../downloads/` 时，`GET /api/updates/latest` 返回 `has_update: false`。
