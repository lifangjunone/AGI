# 叙镜 Narrative Lens

面向视频创作者的理解、二创与增长工作台。产品目标是把视频从“文件”转换为可检索、可验证、可重组的叙事资产。

## 当前能力

- 视频理解：上传本地视频，查看故事摘要、Neo4j 人物/情节图谱、逐段转写、高光与时间码证据。
- 视频二创：按叙事策略重组片段，配置画幅、字幕、节奏与声音轨。
- 视频裂变：组合受众、画幅、时长与开场策略，生成变体矩阵。
- 生成前贴：围绕原片入口生成独立前贴脚本与镜头板。
- 黄金钩子：按受众和强度生成、评分、复制前 5 秒钩子。
- 任务中心：所有理解与生成操作统一排队，展示阶段、进度、已耗时和预计剩余时间。

当前版本已包含本地 API、任务调度器与 Neo4j 图谱存储。模型推理、媒体转码和渲染导出仍是待接入的生产能力。

## 本地运行

```bash
npm install
npm run infra:up
npm run dev
```

Web 默认运行在 `http://localhost:5173`，API 在 `http://127.0.0.1:8787`。如果 5173 被占用，Vite 会自动选择下一个端口。

Neo4j Browser：

```text
http://127.0.0.1:7474
用户名：neo4j
密码：narrative-lens-local
```

停止基础设施：

```bash
npm run infra:down
```

Kubernetes 部署清单位于 `infra/k8s/neo4j.yaml`：

```bash
kubectl apply -f infra/k8s/neo4j.yaml
```

Docker Compose 与 Kubernetes 不应同时绑定本机的 7474/7687 端口。

生产构建：

```bash
npm run build
```

## 文档

- [产品定义](docs/PRODUCT.md)
- [技术架构](docs/ARCHITECTURE.md)

## 参考方向

- ComfyUI：节点化工作流、可复用图与 API 执行模型
- VideoRAG：长视频检索、跨模态索引与图结构上下文
- VideoDB Director：面向视频处理的 Agent 编排
- LosslessCut / FFmpeg：低损耗切分与媒体基础设施
- OpusClip：高光识别、重构画幅、字幕与增长评分

这些项目用于提炼产品和架构原则，不复制其界面或实现。
