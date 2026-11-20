# Indie Spark Radar

个人小项目灵感雷达。它把 Show HN、V2EX 等来源里的有趣个人项目整理成卡片，并通过 LifeYouMe MaaS 生成中文点评、三天薄切片和二创风险提醒。

当前是轻量 MVP：

- Node.js 内置 HTTP 服务，无数据库、无构建步骤。
- 前端为原生 HTML/CSS/JS，入口默认 `/indie-spark/`。
- MaaS 使用 OpenAI-compatible `POST /v1/chat/completions`。
- 未配置 `MAAS_SERVICE_KEY` 时自动使用本地规则降级，方便先预览 UI。

## 本地运行

```bash
cd /Users/bytedance/Desktop/agi/indie-spark-radar
cp .env.example .env
# 填入 MAAS_SERVICE_KEY 后再加载环境变量；不填也能看本地降级版
set -a && . ./.env && set +a
npm start
```

打开：

```text
http://127.0.0.1:45520/indie-spark/
```

测试：

```bash
npm test
```

## MaaS 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `MAAS_BASE_URL` | `https://maas.lifeyoume.icu/v1` | LifeYouMe MaaS OpenAI-compatible API base |
| `MAAS_MODEL_ID` | `lym-chat-quality` | 逻辑模型 ID |
| `MAAS_SERVICE_KEY` | 空 | 应用服务 Key，只能放服务端环境变量 |
| `MODEL_TIMEOUT_MS` | `45000` | 模型调用超时 |

不要把 MaaS Key 写入代码、README、前端或仓库。

## 后续可以加的功能

1. 定时抓取 Show HN / V2EX / GitHub Trending，写入 `data/projects.json` 或轻量 SQLite。
2. 给每张卡片生成“我能做的版本”收藏夹。
3. 按“周末可做 / 三天可做 / 需要后端 / 适合变现”自动打分。
4. 接入 LifeYouMe 账号后保存个人灵感池。

## 部署注意

部署目标按用户要求只考虑阿里云入口，不部署到 Tencent。共享 Nginx 是多产品基础设施，不能整体替换配置；只能追加或更新本产品自己的 `location /indie-spark/` 块。详细见 [docs/ALIYUN_DEPLOYMENT.md](docs/ALIYUN_DEPLOYMENT.md)。
