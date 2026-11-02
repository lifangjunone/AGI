# 生产服务部署清单

最后核验：2026-11-02（Asia/Shanghai）

状态说明：

- `腾讯云`：应用已迁移，阿里云仅保留入口或回滚副本。
- `阿里云`：仍在入口机实际运行。
- `静态`：由阿里云 Nginx 直接读取文件或轻量静态服务。
- `待确认`：运行中但未确认是否仍有真实公网流量。

## 已迁移到腾讯云

| 服务 | 公网地址 | 入口端口 | 腾讯云运行方式 | 权威数据 | 状态 |
| --- | --- | ---: | --- | --- | --- |
| StaffDeck | `/ai-team/` | 45173 | systemd | SQLite | 腾讯云；0.6.1 外部任务恢复版、工作台、问答页、执行记录/代码高亮、广场卡片、引导/账号弹窗、管理资源、广场轻量会话运行时、英文词典按语言加载、完整英文体验、全局 CSS 清理、手机管理端响应式及可滚动 44px 触控侧栏、独立登录/注册页 44px 触控、字段级中英文校验与错误无障碍、身份服务连接失败自助重连、注册密码常驻提示与说明文字对比度修复、公共首页语义/键盘焦点/44px 开源链接及认证链路中英文切换、认证回调状态播报和失败恢复、登录/注册唯一主标题与动态浏览器标题、问答首轮断线草稿恢复、手机工作台真实折叠导航、320px 广场双行头部及全链路 44px 触控、账户菜单统一账号与安全入口已上线（2026-10-30） |
| StaffDeck SSO | `/ai-team/auth/*` | 45174 | systemd | StaffDeck SQLite | 腾讯云 |
| MeYou API | `meyou.lifeyoume.icu` | 43180 | Docker Compose | PostgreSQL、LifeYouMe MaaS | 腾讯云；已切 MaaS `lym-chat-quality`，独立 Key、浅色 Admin、真实 JSON/thinking 影子验证通过（2026-10-30） |
| MeYou Worker | 无公网端口 | 内网 | Docker Compose | PostgreSQL、Redis | 腾讯云；保留固定 Worker 镜像，通过 API 委托 MaaS |
| MeYou PostgreSQL | 无公网端口 | Docker 内网 | Docker Compose | Docker Volume | 腾讯云 |
| MeYou Redis | 无公网端口 | Docker 内网 | Docker Compose | Docker Volume | 腾讯云 |
| LifeYouMe MaaS | `maas.lifeyoume.icu` | 43280 | Docker Compose | Docker Volume JSON | 腾讯云；Chat/托管TTS在线；完整核验状态筛选、模型测试按Deployment隔离；Embeddings、外部TTS、图像生成与图片理解尚无对应供应商模型，release 20261030120000（2026-10-30） |
| LifeYouMe TTS Runtime | MaaS Docker 内网 | 43281 | Docker Compose | 只读 ONNX + 缓存卷 | 腾讯云；sherpa-onnx VITS，单并发有限队列 |
| MapProof | `/mapproof/` | 45210 | systemd + Docker | 无服务端业务数据 | 腾讯云；Mermaid 本地渲染、规则验图、关键路径和 Markdown 报告，release `20261102T162000`（2026-11-02） |

## 仍在阿里云运行

| 服务 | 入口或路径 | 本地端口 | 运行方式 | 建议 |
| --- | --- | ---: | --- | --- |
| LifeYouMe Portal | `/` | 8800 | systemd | 保留入口机 |
| LifeYouMe Ops | `/admin/`、`ops.*` | 8801 | systemd | 保留入口机；支持管理员登录后在 `/admin/#security` 自助改密，旧管理员会话随凭据版本更新而失效 |
| LifeYouMe Auth | `auth.*` | 8802 | systemd | 保留入口机；`/account` 支持普通用户验证当前密码后自助改密，成功后撤销全部 Web 会话、设备 Token 与待兑换设备码 |
| LifeYouMe Billing | `billing.*` | 8803 | systemd | 保留入口机 |
| Opportunity Factory / Audit | `audit.*` | 8787 | systemd | 后续单独迁移 |
| Pay Skill | `/api/pay-skills/` | 8788 | systemd | 与 Audit 一起评估 |
| Product Image Studio | `/image/` | 4188 | systemd | 第二批迁移候选 |
| Decision Studio | `/decision/` | 8810 | systemd | 第二批迁移候选 |
| Story Studio | `/story-studio/` | 4361 | systemd | 第二批迁移候选 |
| Short Video Studio | `/video/` | 4321 | systemd | 第二批迁移候选 |
| FlowFrame | `/flowframe/` | 4390 | systemd | 第二批迁移候选 |
| Model Radar | `/models/` | 4417 | systemd | 第二批迁移候选 |
| Second Me | `/second-me/` | 4395 | systemd | 第二批迁移候选；未保存修改产品内关闭保护 release 20261030T035006Z（2026-10-30） |
| Skill Radar | `/skills/` | 4398 | systemd | 低优先级 |
| Duix | `/duix/` | 4396 | systemd 静态服务 | 低优先级 |
| Trend Forum | `/trends/` | 静态 | Nginx + 6h timer | 阿里云；Technology Exploration 22 榜单缓存合并 + 固定 Horizon 内容增强，站内详情、stale 降级与 90 分钟任务已部署（2026-11-02）；见 `services/trend-forum.md` |
| Game Hub | `/games/` | 静态 | Nginx | 保留 |
| Travel Frame | `/travel-frame/` | 静态 | Nginx | 保留 |
| Privacy Vault | `/vault/` | 静态 | Nginx | 保留 |
| Resume Forge | `/resume/` | 静态 | Nginx | 保留 |

## 历史或待确认

| 服务 | 当前情况 | 操作要求 |
| --- | --- | --- |
| `mirror_backend` | 阿里云容器运行，但共享 Nginx 未发现公网路由 | 确认无人使用后再停，不迁移 |
| 阿里云旧 StaffDeck | 已停止并禁用 | 保留临时回滚文件，禁止与腾讯云同时写 |
| 阿里云旧 MeYou 四容器 | 已停止，`restart=no` | 保留卷和最终备份，禁止形成双主 |

## 更新要求

迁移、停用、端口或域名变化后，必须更新本清单并链接到对应
[`services/`](services/) 文档。
