# AI 可见性体检

最后核验：2026-11-13（Asia/Shanghai）

## 公网入口

- 产品入口：`https://lifeyoume.icu/ai-visibility/`
- 健康检查：`https://lifeyoume.icu/ai-visibility/health`

这是一个中文 AI 搜索 / Agent 可见性检测工具。用户输入公开 URL 后，服务会检测：

- 目标页 HTTP 状态、最终 URL、标题、描述、canonical、meta robots；
- 页面可读正文长度与基础 HTML 文本；
- `/robots.txt` 中 GPTBot、ChatGPT-User、ClaudeBot、Claude-User、PerplexityBot、
  Google-Extended、GoogleOther、Bytespider、CCBot、Amazonbot 的允许/阻止状态；
- `/llms.txt` 是否存在及摘要预览；
- 使用 LifeYouMe MaaS 生成中文诊断、优先修复建议、下一步实验和 llms.txt 草稿。

## 腾讯云部署

- 部署根目录：`/data/app/ai-visibility-clinic`
- 当前版本链接：`/data/app/ai-visibility-clinic/current`
- 服务：`ai-visibility-clinic.service`
- 隧道：`ai-visibility-clinic-aliyun-tunnel.service`
- 监听：`127.0.0.1:45530`
- 环境文件：`/etc/ai-visibility-clinic/app.env`，root-only
- MaaS：`MAAS_BASE_URL=http://127.0.0.1:43280/v1`，模型 `lym-chat-quality`

服务使用 Python 标准库实现，无数据库、无持久业务数据。MaaS Key 仅保存在
Tencent 服务器环境文件中，不进入仓库。当前线上 Key 通过 MaaS 在线管理 API
创建，Key 名为 `ai-visibility-clinic production`；由于 MaaS 当前没有在线创建
新应用接口，生产 Key 暂挂在已有 `staffdeck` 应用下并授权 `lym-chat-quality`，
后续 MaaS 支持应用创建接口后可迁移为独立 `ai-visibility-clinic` 应用。

## 阿里云入口

- 共享配置：`/data/app/lifeyoume-platform/deploy/nginx-platform.conf`
- 产品块标记：`BEGIN/END ai-visibility-clinic`
- Aliyun 本地监听：`127.0.0.1:45530`，由 Tencent 反向 SSH 隧道提供
- 共享容器：`opportunity_factory_proxy`

本次只追加 `/ai-visibility/` scoped location，并撤销误上线的
`/indie-spark/` 路由；保持共享配置 inode，执行 `nginx -t` 后使用
`nginx -s reload`，未重启或重建共享代理容器。

## 安全边界

- 只允许检测 `http` / `https` 公开 URL；
- 拒绝 localhost、内网、保留地址和非 global IP；
- 不提交表单，不执行浏览器脚本；
- 抓取有超时和响应大小上限；
- 模型请求只发送检测摘要，不发送 MaaS Key 或服务器 Secret；
- 模型失败时返回本地降级建议。

## 验证

2026-11-13 上线验证：

- 本地测试 `6/6` 通过，Python 编译通过；
- Tencent `ai-visibility-clinic.service` active，`NRestarts=0`；
- Tencent `ai-visibility-clinic-aliyun-tunnel.service` active，`NRestarts=0`；
- Aliyun `127.0.0.1:45530` 由 sshd 监听；
- `https://lifeyoume.icu/ai-visibility/`、`styles.css`、`app.js`、`/health`
  均返回 200；
- 公网 `POST /ai-visibility/api/analyze` 检测 `https://lifeyoume.icu/`
  返回 200，评分 96，`diagnosis.source=maas`；
- 代表性既有入口回归：
  `/ai-team/`、`/flowframe/`、`/image/`、`/resume/`、`/vault/`、
  `/trends/`、`meyou.lifeyoume.icu`、`audit.lifeyoume.icu` 均正常返回
  200 或按既有策略跳转登录页。

共享 Nginx 备份：

`/data/app/backups/ai-visibility-clinic/nginx-20261113T094402Z`
