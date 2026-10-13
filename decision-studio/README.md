# 决策工作台

面向普通用户的结构化 AI 决策产品。默认连接私有部署的 CLM；Jev 使用用户自己的 API Key。网页与 API 共用同一套能力。

## 产品能力

- 选一个：从多个候选方案中给出选择和完整概率。
- 是/否：判断某个命题是否成立。
- 评分：按自定义的有序等级评分。
- 排序：对候选项给出名次和概率。
- 多问题：共享同一份背景，一次提交多个判断或评分问题。
- 同题对比：CLM 和 Jev 并行回答，直观比较结论、概率与延迟；单侧失败不影响另一侧。
- 隐私：Jev Key 只存在浏览器会话中，经后端内存转发，不持久化；历史记录只放在浏览器本地。

## 本地启动

要求 Node.js 22+、Python 3.11+。

```bash
npm install
python3 -m venv .venv
.venv/bin/pip install -e '.[dev]'
cp .env.example .env
npm run dev
```

访问 `http://localhost:5173`，API 文档位于 `http://localhost:8810/docs`。

也可以用生产模式单端口启动：

```bash
npm run build
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8810
```

访问 `http://localhost:8810`。

## Docker 部署

```bash
cp .env.example .env
docker compose up -d --build
```

正式环境应在反向代理上配置 HTTPS、请求体上限和产品用户认证。当前 API 已含参数校验、CORS、IP 限流、上游超时和统一错误，不记录 Jev Key。

## API

核心端点：

- `POST /api/decisions`：choice、noul、score，可一次提交 1–20 个问题。
- `POST /api/rank`：候选项排序。
- `POST /api/compare`：CLM/Jev 同题并行对比。
- `GET /api/health`：CLM 连通状态。
- `GET /docs`：OpenAPI 交互文档。

Jev 请求需增加 `jev_api_key`；CLM 使用服务端环境变量，不向浏览器暴露凭据。

## GPU 上部署 CLM

CLM 由两个本机服务组成：

1. `vllm` 运行 Qwen3-8B pooling encoder，监听 `127.0.0.1:8090`。
2. `clm-serve` 运行决策 API，监听 `127.0.0.1:8700`。

`deploy/` 提供安装脚本和 systemd 单元模板。它们默认只监听回环地址，产品后端应通过同机部署或 SSH 隧道访问，不要把 8700 直接暴露到公网。

```bash
sudo mkdir -p /opt/decision-studio/clm /opt/decision-studio/models
sudo bash deploy/install-clm.sh
```

然后根据 GPU 主机上的实际服务账号安装并启用 systemd 单元。显存容量、CUDA、驱动和模型访问权限需先在 GPU 主机确认。

产品端配置：

```dotenv
CLM_BASE_URL=http://127.0.0.1:8700
```

## 验证

```bash
npm run lint
npm test
npm run build
```
