# Local Avatar Generator

## 统一身份

本项目是内部服务组件，没有独立终端用户登录页。调用方必须先通过 LifeYouMe
统一身份获得用户上下文，服务仅接受受信产品传递的稳定用户 ID，不保存账号
密码。接入契约见
[`lifeyoume-platform/docs/SSO.md`](../lifeyoume-platform/docs/SSO.md)。

This service repaints the full material set of an existing rigged GLB from a
full-character reference. It uses the MIT-licensed Hunyuan3D-Swift MLX port on
Apple Silicon. Close-up face identity is handled inside English Immersion
Studio by the local MediaPipe UV pipeline because whole-body diffusion paint
can contaminate clothing when given a portrait crop.

Pipeline:

1. Accept a full-character reference and a rigged source GLB.
2. Run Hunyuan3D Paint locally to generate a coherent UV texture.
3. Preserve the source skeleton, skin weights, and facial morph targets.
4. Return a self-contained GLB to English Immersion Studio.

Upstream source:

- https://github.com/ZimengXiong/Hunyuan3D-Swift
- Model weights: `zimengxiong/hunyuan3d-mlx-paint-large`

Large model weights and Swift build artifacts are local-only and excluded from
Git.

## Setup

```bash
npm run download:weights
npm run build
npm start
```

The service listens only on `127.0.0.1:4782` and is started explicitly with
`npm start`. `GET /api/health` reports engine readiness; `POST /api/avatar`
accepts multipart field `image` and returns `model/gltf-binary`.

Generation preserves the first avatar mesh's existing UV topology. The
rig-safe merger rejects changed vertex counts, missing skin data, or missing
facial morph targets before it creates the final GLB.
