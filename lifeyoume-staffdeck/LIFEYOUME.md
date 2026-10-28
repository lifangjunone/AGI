# LifeYouMe · 数字团队

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

## 开源与署名

上游项目采用 GNU AGPL v3。公开提供修改版网络服务时，需要向用户提供对应源代码，
保留版权与许可证信息，并在界面中提供清晰的开源来源。本项目登录页已保留
“基于 OpenBMB StaffDeck 构建”及源码链接；发布前仍应根据实际托管方式完成
AGPL 合规检查。
