# 更新清单

`latest.example.json` 只是格式样例，服务不会读取它。

发布内测包时复制为 `latest.json`。`latest.json` 已加入 `.gitignore`。字段含义和上传步骤见 `../README.md`。

没有 `latest.json` 时，`GET /api/updates/latest` 返回 `has_update: false`。

若条目写了 `file`，则必须能在 `../downloads/` 找到该文件，否则仍是尚未发布。若只写允许主机上的 `download_url`（`metaarc.com.cn` 或其子域），则不依赖本机 `downloads/`。
