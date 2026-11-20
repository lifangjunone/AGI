# AI Visibility Clinic

一个中文 AI 可见性体检工具。它参考的是 “AI Crawler Access Checker” 这类小工具的方向，但这是独立实现的 LifeYouMe 子项目，不是项目列表页。

输入一个公开 URL 后，它会检测：

- 页面 HTTP 状态、最终 URL、标题、描述、canonical、meta robots；
- 可读正文长度和基础 HTML 文本可见性；
- `/robots.txt` 中 GPTBot、ClaudeBot、PerplexityBot、Google-Extended、Bytespider 等 AI/搜索 bot 的允许/阻止状态；
- `/llms.txt` 是否存在；
- 使用 LifeYouMe MaaS 生成中文诊断、优先修复建议和 `llms.txt` 草稿；
- MaaS 未配置或失败时返回本地降级建议。

## 本地运行

```bash
cd /Users/bytedance/Desktop/agi/ai-visibility-clinic
HOST=127.0.0.1 PORT=45530 BASE_PATH=/ai-visibility python3 app/server.py
```

打开：

```text
http://127.0.0.1:45530/ai-visibility/
```

测试：

```bash
python3 -m unittest discover -s tests
```

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | 服务监听地址 |
| `PORT` | `45530` | 服务端口 |
| `BASE_PATH` | `/ai-visibility` | 公网路径前缀 |
| `MAAS_BASE_URL` | `https://maas.lifeyoume.icu/v1` | LifeYouMe MaaS OpenAI-compatible API |
| `MAAS_MODEL_ID` | `lym-chat-quality` | MaaS 逻辑模型 |
| `MAAS_SERVICE_KEY` | 空 | MaaS 应用服务 Key，只放服务端环境 |
| `MODEL_TIMEOUT_MS` | `45000` | 模型调用超时 |

## 部署拓扑

按用户要求：

```text
用户
  ↓
Aliyun 共享 Nginx：/ai-visibility/
  ↓ 127.0.0.1:45530（反向 SSH 隧道）
Tencent：ai-visibility-clinic.service
  ↓
LifeYouMe MaaS
```

服务部署到 Tencent，Aliyun 只做共享 Nginx 入口和反向代理。见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)。
