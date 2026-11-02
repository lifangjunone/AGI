# LifeYouMe · 数字团队

生产地址：`https://lifeyoume.icu/ai-team/`

发行准备脚本使用 `STAFFDECK_PUBLIC_BASE=/ai-team/`；直接运行前端构建则必须使用
`VITE_PUBLIC_BASE=/ai-team/`。该前缀同时隔离前端路由、静态资源、浏览器存储和
API 请求；反向代理需要将 `/ai-team/` 前缀剥离后转发给 StaffDeck。

生产前端必须使用以下命令，它会强制注入 `/ai-team/` 并在构建完成后校验
`index.html` 中的全部本地资源 URL：

```bash
npm --prefix frontend-enterprise run build:production
```

禁止把普通 `npm run build` 生成的默认根路径版本直接发布到生产。发布前还可单独
运行 `npm --prefix frontend-enterprise run verify:production`；发现 `/assets/`
等缺少 `/ai-team/` 前缀的地址时必须终止发布。

这是 LifeYouMe 基于 [OpenBMB StaffDeck](https://github.com/OpenBMB/StaffDeck)
构建的数字员工子产品。它把个人和团队的经验、知识、SOP 与工具组合成可持续
执行、可追踪、可复盘的 AI 工作团队。

## 产品定位

- 对外名称：`LifeYouMe · 数字团队`
- 产品分类：AI 工程
- 一句话介绍：把你的经验，变成一支随时上岗的 AI 团队
- 建议产品路径：`/products/digital-team`
- 建议应用路径：`/digital-team/`

## 本地运行

运行环境需要 Python 3.11+ 与 Node.js 22.19+（22.x）或 24+。

```bash
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install -e "backend[dev]"
npm --prefix frontend-enterprise ci
cp backend/.env.example backend/.env
python3 prepare.py --no-cli-link
scripts/dev_up.sh --detach
curl http://127.0.0.1:5173/api/health
```

首次启动账号为 `admin / admin`，仅用于本地初始化。对外部署前必须修改密码，
设置强随机 `APP_SECRET`，配置 HTTPS，并接入真实的 OpenAI 兼容模型服务。

## LifeYouMe 品牌层

品牌信息集中在
`frontend-enterprise/src/config/brand.ts`，品牌标志位于
`frontend-enterprise/src/assets/lifeyoume-mark.svg`。底层运行时、CLI、数据目录和
API 协议仍保留 StaffDeck 名称，以便继续同步上游版本并避免破坏兼容性。

## 同步 MeYou 模型

数字团队可复用 `https://meyou.lifeyoume.icu/admin` 中当前启用的模型配置。
MeYou 服务端需要设置同一枚至少 32 字符的 `MODEL_CONFIG_SYNC_TOKEN`，然后运行：

```bash
MEYOU_MODEL_SYNC_TOKEN='服务端同步令牌' \
STAFFDECK_ADMIN_USERNAME='admin' \
STAFFDECK_ADMIN_PASSWORD='数字团队管理员密码' \
python3 scripts/sync_meyou_model.py
```

可选变量包括 `MEYOU_URL`、`STAFFDECK_URL` 和 `STAFFDECK_TENANT_ID`。
同步过程只在内存中传递模型密钥，不会写入仓库、命令参数或日志。数字团队会先真实
验证模型的文本、流式和 JSON 能力；全部通过后才启用并设为默认，失败时保留原默认模型。

## 部署边界

本项目不会写入或替换共享 Nginx 配置。部署时只能在服务器当前配置的最新副本
上新增本产品专属 `location /digital-team/`，并严格遵守工作区根目录
`AGENTS.md` 中的共享 Nginx 安全规则：备份、清点既有路由、检测并发变更、
`nginx -t`、仅 reload、验证其他产品无 404。

腾讯云当前静态文件位于：

`/data/app/lifeyoume-staffdeck/current/usr/lib/staffdeck/_internal/frontend-enterprise/dist`

发布前端时先追加带哈希的 `assets/`，最后原子切换 `index.html`，不需要重启
StaffDeck、SSO bridge 或隧道服务。本服务的完整部署清单、验证命令和回滚点记录在
工作区顶层 `deployments/services/staffdeck.md`。

日常仅更新前端时，禁止手工复制入口文件。先生成受门禁保护的生产构建，再将
`dist` 上传到腾讯云暂存目录，最后在服务器使用专用发布器：

```bash
npm --prefix frontend-enterprise run build:production

sudo /data/app/lifeyoume-staffdeck/deploy/release_frontend.py \
  --source-dist /path/to/uploaded/dist \
  --check-only

sudo /data/app/lifeyoume-staffdeck/deploy/release_frontend.py \
  --source-dist /path/to/uploaded/dist
```

发布器会在任何写入前验证基路径、引用资产、三个 systemd 服务和公网产品矩阵；
随后追加资产并通过真实公网逐个验证候选 JS/CSS/图标；JS 和 CSS 还必须返回正确
MIME。只有全部资源通过后才原子切换 `index.html`。同名资产内容冲突时终止，
切换后的健康或回归探针失败时自动恢复旧入口并复查旧入口资源。该工具不会执行
`systemctl restart` 或任何 Nginx 命令。

公开首页与登录页使用轻量入口，认证后工作台通过动态模块加载。不要把后台
`AppHeader`、弹窗或工作台页面重新静态引入 `App.tsx` 或公开页面，否则会让匿名
访问重新下载完整后台包。

## 开源与署名

上游项目采用 GNU AGPL v3。公开提供修改版网络服务时，需要向用户提供对应源代码，
保留版权与许可证信息，并在界面中提供清晰的开源来源。本项目登录页已保留
“基于 OpenBMB StaffDeck 构建”及源码链接；发布前仍应根据实际托管方式完成
AGPL 合规检查。
