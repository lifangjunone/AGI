# LifeYouMe MaaS

LifeYouMe 的统一模型接入、路由、托管、计量与分发平台。第一版纵向切片支持
OpenAI-compatible Chat Gateway 和 CPU 自托管中文 TTS，并为 ASR、图像和
多模态能力保留统一的逻辑模型与 Runtime 边界。

## 本地运行

```bash
cd /Users/bytedance/Desktop/agi/lifeyoume-maas
export MAAS_BOOTSTRAP_PROVIDER_API_KEY='your-provider-key'
export MAAS_BOOTSTRAP_MODEL_ID='your-upstream-model-id'
npm run dev
```

打开 <http://127.0.0.1:43280>。

首次启动会注册：

- `lym-chat-quality`
- `lym-tts-realtime`，生产使用腾讯云 CPU sherpa-onnx VITS Runtime
- `meyou`、`second-me`、`staffdeck` 三个应用

## 网关

在控制台“应用”页面创建服务 Key，然后调用：

```bash
curl http://127.0.0.1:43280/v1/chat/completions \
  -H 'Authorization: Bearer lym_srv_...' \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "lym-chat-quality",
    "messages": [{"role": "user", "content": "你好"}]
  }'
```

业务调用方只知道逻辑模型和 MaaS 服务 Key，不取得供应商原始密钥。

`POST /v1/audio/speech` 已连接独立 TTS Runtime，支持 `model`、`voice-0` 至
`voice-4`、`input`、`speed` 和 `response_format=wav`。普通私有对话默认不做
跨用户音频缓存；队列满时返回 429。

## 安全

- `MAAS_MASTER_KEY` 生产环境必须至少 32 字符，并保存在受限环境文件。
- 供应商 Key 使用 AES-256-GCM 加密。
- 应用服务 Key 仅在创建时显示一次，持久化层只保存 SHA-256 哈希。
- 生产控制台由阿里云入口注入 `X-LifeYouMe-Admin-User`；直接管理 API 可使用
  `MAAS_ADMIN_TOKEN` 作为受限运维后备。
- 服务默认只监听 `127.0.0.1`。

## 部署

腾讯云 Compose 位于 `deploy/compose.tencent.yml`。Nginx 文件只是产品自有的
增量 `server` 片段，严禁覆盖共享配置。正式部署前必须遵守工作区
`deployments/runbooks/SHARED_NGINX.md`。

本阶段不自动部署、不修改共享 Nginx、不迁移 MeYou 生产调用。
