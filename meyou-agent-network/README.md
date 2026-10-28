# 遇见 MeYou

遇见 MeYou 是 LifeYouMe 旗下的 Agent 原生关系与接待网络。它让 Agent 先替用户寻找、筛选、破冰和接待，在双方确认值得或需要真实授权时再交给真人。

> 核心表达：让你的 Agent 替你遇见对的人，也替你接住每一次联系。

## 当前 Beta 能力

- 原创中英双语“温暖编辑部”响应式界面。
- 今日控制台：汇总待确认介绍、真人接管、新匹配、日程和用量。
- 持续找人：朋友、恋爱、商务、招聘、旅行和自定义任务。
- 心动模式：18+、匿名条件核对、双向同意、撤回与拉黑边界。
- 个人代理接待：公开主页、访客咨询、Agent 身份标注与真人接管。
- 社群智能撮合：新人欢迎、需求板和有理由的成员介绍。
- 企业客户台：独立客户线程、升级真人、负责人、优先级和知识库边界。
- Agent Studio：身份、目标、边界、分场景授权与访客测试。
- LifeYouMe SSO 解析、OpenAI-compatible 模型适配器、PostgreSQL 数据模型、Redis/BullMQ 后台任务和 WebSocket 入口。
- Free / Pro / Team 套餐及用量契约；Beta 使用邀请码或后台升档，不接真实支付。

## 项目结构

```text
apps/
  web/       React 19 + TypeScript + Vite 用户端
  api/       Fastify + Drizzle + PostgreSQL API
  worker/    Redis + BullMQ 持续任务执行器
packages/
  shared/    Zod 契约、领域类型和安全规则
deploy/      Nginx 与 systemd 生产配置
```

## 本地启动

Node.js 20 或更高版本：

```bash
cd /Users/bytedance/Desktop/agi/meyou-agent-network
npm install
cp .env.example .env
docker compose up -d
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

浏览器打开 <http://localhost:43181>。开发环境 `.env.example` 默认允许演示身份绕过；生产必须设置：

```text
DEV_AUTH_BYPASS=false
```

### CPU 开发机 Kubernetes 数据层

团队开发环境使用 SSH 别名 `cpu` 上的 Kubernetes，不依赖本机 Docker。资源清单位于
`deploy/k8s-dev.yaml`：

- Namespace：`meyou-dev`
- PostgreSQL Service：`postgres.meyou-dev.svc.cluster.local:5432`
- Redis Service：`redis.meyou-dev.svc.cluster.local:6379`
- 持久化目录：`/data00/meyou-dev/postgres`、`/data00/meyou-dev/redis`
- 密码只保存在 `meyou-datastores` Secret，不写入仓库

本地调试通过 SSH 隧道映射到 `127.0.0.1:5438` 和 `127.0.0.1:6383`，再从 Secret
临时注入 `DATABASE_URL`、`REDIS_URL`。不要在命令输出、日志或 `.env` 中打印 Secret。

独立启动后台任务：

```bash
npm run dev -w @meyou/worker
```

## 独立管理端

管理端使用独立于普通用户的管理员会话，入口为 `/admin/login`。登录后可查看当前模型来源、测试真实连接，并将 Provider、Endpoint、Model ID、API Key、深度思考、超时和 Temperature 保存为立即生效的服务端配置。

生产环境至少配置：

```text
ADMIN_EMAIL=admin@lifeyoume.icu
ADMIN_PASSWORD_HASH=scrypt:<salt>:<digest>
MODEL_CONFIG_ENCRYPTION_KEY=<independent-random-secret-at-least-32-characters>
MODEL_CONFIG_SYNC_TOKEN=<independent-random-secret-at-least-32-characters>
```

生成管理员密码哈希（命令只输出哈希，不把明文写入仓库）：

```bash
node -e "const {scryptSync,randomBytes}=require('crypto');const p=process.argv[1];const s=randomBytes(16).toString('hex');console.log('scrypt:'+s+':'+scryptSync(p,s,64).toString('hex'))" 'replace-with-a-strong-password'
```

- 管理员密码仅以 scrypt 哈希形式配置。
- 模型 API Key 使用 AES-256-GCM 加密入库，浏览器只读取掩码。
- 数据库中的活动模型配置优先于环境变量；尚未接管时可直接测试并沿用服务器现有模型密钥。
- 管理员会话 12 小时失效，普通用户会话不能访问管理接口。
- `MODEL_CONFIG_SYNC_TOKEN` 只用于同机或受信任服务间同步当前活动模型；不要提供给浏览器。

## 验证

```bash
npm run typecheck
npm test
npm run build
```

API 健康检查：

```bash
curl http://localhost:43180/health
```

## 身份与隐私边界

- 浏览器产品通过 `auth.lifeyoume.icu/api/v1/me` 解析统一账号，业务库只保存稳定的 LifeYouMe 用户 ID，不保存中央账号密码。
- 用户信息分为公开、仅匹配、仅 Agent、绝不分享四级。
- 心动模式要求年满 18 岁，并在双方真人均同意前隐藏真实姓名与联系方式。
- Agent 消息始终标注身份；涉及付款、合同、退款、价格承诺或关系承诺时升级真人。
- 模型密钥只存在服务端；没有配置模型时使用明确的待真人确认回退，不伪造模型回答。
- 用户对话不用于训练模型。生产环境需要依据所选模型供应商补充准确的数据处理说明。

## 生产部署

构建后将项目部署至 `/opt/meyou-agent-network`，环境变量存放在 `/etc/meyou-agent-network/api.env`。示例服务与反向代理位于 `deploy/`。

部署顺序：

1. 备份数据库并记录当前发布版本。
2. 安装依赖、构建共享包/API/Web/Worker。
3. 执行 `npm run db:migrate`，再启动 API 与 Worker。
4. 验证 `/health`、SSO、公开主页、受保护 API 与 WebSocket。
5. 切换 Nginx 静态目录或发布软链接。

回滚时恢复上一版本发布目录；数据库迁移采用向前兼容方式，破坏性迁移必须另附回滚 SQL。

## 尚未伪装为“已完成”的外部能力

当前代码已提供真实适配边界，但以下能力需要生产凭据或运营配置后才能启用：

- `meyou.lifeyoume.icu` DNS、TLS 与 LifeYouMe 产品注册；
- 火山方舟/OpenAI/Claude 真实模型凭据；
- Google Calendar 与飞书日历 OAuth；
- 邮件/短信通知、实名或年龄身份核验；
- 支付宝、微信支付和 Stripe；
- 生产级内容审核与人工举报运营队列。

这些外部依赖不会阻止本地 Beta 完整演示，也不会被假数据伪装成已接通。
