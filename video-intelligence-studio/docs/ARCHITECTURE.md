# 技术架构

## 当前实现

```text
React + TypeScript + Vite → Express workflow API
  ├─ Multipart video upload → data/uploads
  ├─ FFmpeg → 16 kHz mono PCM → SeedASR
  ├─ Ark Files API → Responses API video understanding
  ├─ ASR / visual TextUnit → evidence IDs
  ├─ Entity normalization + Claim / Evidence graph
  ├─ Louvain community detection + community reports
  └─ Ontology nodes and relations → Neo4j
```

视频理解已接通真实上传、ASR、多模态理解与 Neo4j 写入。二创、裂变、前贴和钩子尚未接入真实生成服务，界面会明确显示不可用，不生成模拟结果。

## GraphRAG / LightRAG 对齐

当前 `video-ontology-v2` 参考两个社区项目的数据组织方式：

- Microsoft GraphRAG：`Document → TextUnit → Entity / Relationship / Claim → Community → Community Report`。
- LightRAG：分块后抽取实体与关系，做实体归一与描述聚合，并区分实体导向和关系导向的检索入口。

本项目把视频转换为时间化 `TextUnit`：SeedASR 片段是 `asr-*`，多模态高光是 `visual-*`。实体、事件、关系和 Claim 必须引用这些证据 ID。Neo4j 保存 `OntologyNode` 与 `RELATES`，前端提供：

1. `语义网络`：实体、事件、Claim 及业务关系。
2. `社区地图`：社区节点与成员归属关系。
3. `证据链`：Evidence → Entity / Event / Claim 的支持路径。

当前社区检测使用单层 Louvain，社区摘要由成员描述确定性聚合。这是可运行的 GraphRAG 索引子集，不等同于 Microsoft GraphRAG 的分层 Leiden、LLM Community Report、向量索引及 Local / Global / DRIFT Query。后续接入检索时再实现这些能力，界面和接口不得提前宣称已支持。

## 生产目标架构

```text
Web Client
  │
API Gateway ─ Project / Asset / Workflow APIs
  │
Workflow Orchestrator
  ├─ Ingest: upload, probe, proxy, shot detection
  ├─ Understand: ASR, OCR, VLM, speaker and face entities
  ├─ Index: transcript vectors, visual vectors, story graph
  ├─ Generate: script, image/video, voice, captions
  ├─ Compose: FFmpeg / render workers
  └─ Evaluate: continuity, duplication, safety, hook score
       │
PostgreSQL + Object Storage + Vector Index + Graph Store
```

## 统一视频本体

不要把模型自由文本直接当成事实层。建议将每次分析归一到以下实体：

- `Asset`：原视频、代理文件、音轨、字幕及派生版本
- `Shot`：镜头边界、关键帧、构图、动作和视觉向量
- `Utterance`：起止时间、说话人、文本、语言和置信度
- `Entity`：人物、地点、物体、组织及跨镜头身份
- `Event`：参与实体、动作、前因后果和情绪变化
- `Moment`：可创作片段、得分、理由及证据引用
- `Relation`：人物关系及其随剧情变化的时间范围
- `Claim`：模型判断、置信度、模型版本和证据集合

所有实体必须使用毫秒级时间范围，并保留来源资产与模型版本。GraphRAG 用于跨事件、人物和因果关系推理；向量检索用于召回相关镜头、对白和视觉片段。

## 工作流模型

参考 ComfyUI 的可复用图思路，但第一阶段不暴露通用节点编辑器。每个产品动作映射为版本化工作流：

1. 输入节点引用原片、理解快照和用户约束。
2. 生成节点输出候选脚本、EDL 或媒体资产。
3. 评估节点过滤连续性差、重复或不安全的结果。
4. 合成节点生成低清预览，确认后再渲染正式版本。
5. 每次运行记录参数、模型、种子、成本和产物血缘。

## 工程优先级

1. 建立上传、代理转码、镜头检测和 ASR 的可靠媒体底座。
2. 实现统一本体与时间码证据 API，再接入向量和图检索。
3. 打通“高光选择 → 钩子生成 → 竖屏预览 → 导出”闭环。
4. 增加任务队列、幂等、失败恢复、成本预算和可观测性。
5. 最后开放工作流模板与批量裂变能力。

## 安全与合规

- 上传前明确版权和肖像授权，素材默认私有。
- 对人脸、声音克隆和生成内容记录授权范围。
- 保存生成模型、提示词、输入资产和导出版本的审计链。
- 敏感内容检测应覆盖输入、脚本、生成帧和最终成片。
