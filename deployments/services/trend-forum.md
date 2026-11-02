# Trend Forum / Horizon 部署

最后核验：2026-11-02（Asia/Shanghai）

## 公网与运行位置

- 公网：`https://lifeyoume.icu/trends/`
- 静态目录：阿里云 `/var/www/trends`
- 应用副本：阿里云 `/data/app/trend-forum/current`
- 自动化：阿里云 `/data/app/trend-forum/automation`
- Technology Exploration：`/data/app/trend-forum/technology-exploration`
- Horizon：`/data/app/trend-forum/horizon`
- Horizon venv：`/data/app/trend-forum/horizon-venv`
- Horizon 状态：`/data/app/trend-forum/horizon-state`
- 受限环境：`/etc/trend-forum/horizon.env`，root-only `0600`

本产品不需要独立 Web 进程，也不修改共享 Nginx；页面和 JSON 由现有
`/trends/` 静态路由提供。

## 固定版本与数据

- Horizon 提交：`cdd95f8e881673057e3e201717836da4b8e2e0e7`
- 第三方许可：Horizon MIT，项目内保留 `THIRD_PARTY_NOTICES.md`
- 原榜单：`data/trends.json`，Technology Exploration + 失败来源缓存合并
- 深度精选：`data/insights.json`，最近 7 天、最多 28 个 6 小时时间槽
- 每日文章：`data/posts.json`，同一天每轮覆盖同一篇，不重复新增

## 自动任务

- timer：`trend-forum-refresh.timer`
- 时间：每天 `00:00 / 06:00 / 12:00 / 18:00`（Asia/Shanghai）
- service：`trend-forum-refresh.service`
- 超时：90 分钟
- 并发控制：`/data/app/trend-forum/automation/refresh.lock`
- 日志：
  - `/var/log/trend-forum-refresh.log`
  - `/var/log/trend-forum-refresh.error.log`

## MaaS

- 应用：`trend-forum-horizon`
- 仅授权：`lym-chat-quality`
- 阿里云经隧道访问：`http://127.0.0.1:43280/v1`
- Key 不记录在文档或仓库。

2026-11-02 首次 dry-run 的专用 Key 和模型目录鉴权成功，但上游供应商返回
HTTP 402。桥接层在单次预检后快速失败，不覆盖精选；原始 22 个榜单仍正常发布。
上游恢复后，下一个 6 小时任务会自动生成首轮精选，不需要重新部署。

## 降级与回滚

- Horizon 失败：发布新榜单，保留旧精选并标记 `stale`。
- 精选少于 4 条或校验失败：不覆盖旧精选。
- 全部采集失败：不发布任何新 JSON。
- 部署前备份：
  `/data/app/backups/trend-forum-horizon-20261102T070034Z`
- MaaS 数据备份：
  `/data/app/lifeyoume-maas/backups/maas-data-trend-forum-20261102T070211Z.tar.gz`
- 回滚静态站和自动化时从 Trend Forum 备份恢复；无需修改 Nginx。

每次发布后必须回归 `/trends/`、`/image/`、`/flowframe/`、`/ai-team/`、
`/resume/`、`/vault/`、MeYou 和 Audit。
