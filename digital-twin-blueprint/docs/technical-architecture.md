# 数字分身技术架构

## 1. 总体架构

数字分身不是一个单一模型，而是一条实时多模态 Agent 流水线：

```text
用户输入 → 听懂/看懂 → 分身大脑 → 生成回复 → 语音合成 → 口型/表情/视频驱动 → WebRTC/网页/应用输出
```

总体架构由 7 层构成：

1. 身份与授权层
2. 知识与记忆层
3. 对话 Agent 层
4. 声音层
5. 形象/视频层
6. 实时通信层
7. 安全与产品边界

## 2. 总体技术架构图

```mermaid
flowchart TD
    U1[访客/客户] --> C1[Web / App / 小程序]
    U2[本人/创作者] --> C2[分身工作台]
    U3[运营/管理员] --> C3[Admin Console]

    C1 --> G[Realtime Gateway<br/>WebRTC / WebSocket / SSE]
    C2 --> API[API Gateway]
    C3 --> API

    G --> VAD[VAD 语音活动检测]
    VAD --> ASR[Streaming ASR<br/>Whisper / SenseVoice / OpenAI]
    ASR --> ORCH[Agent Orchestrator<br/>对话状态 / 路由 / 工具调用]

    API --> ORCH

    ORCH --> SAFETY[Safety & Policy Guard<br/>身份声明 / 越权拦截 / 风险动作确认]
    SAFETY --> MEM[Memory Router<br/>短期记忆 / 长期记忆 / 用户画像]
    MEM --> RAG[RAG Retrieval<br/>个人资料 / 推文 / 文章 / 课程 / FAQ]
    RAG --> LLM[LLM Reasoning<br/>GPT / Claude / Gemini / Qwen / DeepSeek]

    LLM --> TOOL[Tool Calling<br/>日历 / CRM / 邮件 / 支付 / 工单]
    TOOL --> LLM

    LLM --> STYLE[Persona Style Layer<br/>口吻 / 价值观 / 表达习惯]
    STYLE --> TTS[Streaming TTS<br/>ElevenLabs / OpenAI / CosyVoice]
    TTS --> AVATAR[Avatar Renderer<br/>Tavus / HeyGen / D-ID / MuseTalk / LiteAvatar]
    AVATAR --> G

    STYLE --> TEXT[Text Response]
    TEXT --> G

    subgraph Storage[数据与训练层]
        PG[(Postgres<br/>用户/会话/权限/配置)]
        VDB[(Vector DB<br/>知识向量/记忆)]
        OBJ[(Object Storage<br/>音频/视频/头像素材)]
        LOG[(Event Logs<br/>对话/反馈/审计)]
        EVAL[(Eval Set<br/>本人纠错/测试集)]
    end

    ORCH --> PG
    MEM --> VDB
    ASR --> OBJ
    TTS --> OBJ
    AVATAR --> OBJ
    ORCH --> LOG
    C2 --> EVAL
    EVAL --> STYLE
```

## 3. 实时对话链路

```mermaid
sequenceDiagram
    participant User as 访客
    participant Client as 前端 Web/App
    participant RT as Realtime Gateway
    participant ASR as ASR/VAD
    participant Agent as Agent Orchestrator
    participant RAG as Memory/RAG
    participant LLM as LLM
    participant TTS as TTS
    participant Avatar as Avatar Engine

    User->>Client: 说话/输入问题
    Client->>RT: 音频流 / 文本流
    RT->>ASR: 推送音频 chunk
    ASR->>ASR: VAD 判断是否说完
    ASR->>Agent: 转写文本 + 语音状态

    Agent->>Agent: 判断意图和风险
    Agent->>RAG: 检索本人资料/历史记忆
    RAG-->>Agent: 返回相关内容和来源
    Agent->>LLM: persona + context + user query
    LLM-->>Agent: 流式生成回复

    Agent->>TTS: 流式文本转语音
    TTS-->>Avatar: 音频 chunk
    Avatar-->>RT: 视频帧/音频流
    RT-->>Client: WebRTC 返回
    Client-->>User: 数字分身回答

    User->>Client: 中途打断
    Client->>RT: barge-in 信号
    RT->>Agent: 停止当前输出
    Agent->>LLM: 重新组织上下文
```

## 4. Agent Orchestrator 职责

`Agent Orchestrator` 是系统中最重要的编排层，负责：

- 判断用户意图：闲聊、问知识、请求操作、高风险请求。
- 判断是否检索：是否需要进入个人知识库或长期记忆。
- 判断是否调用工具：日历、CRM、邮件、工单、支付等。
- 控制回复形态：文字、语音、视频。
- 管理对话状态：多轮上下文、打断、重试、澄清。
- 记录反馈：把本人纠错转化成规则、记忆和测试样本。
- 执行安全策略：越权拦截、高风险操作确认、隐私保护。

## 5. 数据与记忆设计

### 5.1 数据来源

- 公开内容：X/Twitter 历史推文、博客、Newsletter、视频、播客、访谈。
- 私有内容：笔记、文档、邮件、聊天记录。
- 业务内容：产品文档、CRM、FAQ、客服知识库。
- 人格材料：价值观、表达样例、禁区、个人经历。

### 5.2 记忆类型

| 记忆类型 | 说明 | 示例 |
|---|---|---|
| 短期记忆 | 当前会话上下文 | 用户刚刚问过什么 |
| 长期事实记忆 | 稳定个人事实 | 经历、作品、公司、项目 |
| 语义记忆 | 观点和知识 | 对 AI Agent 的判断 |
| 情节记忆 | 发生过的事件 | 上次和某客户聊了什么 |
| 程序记忆 | 做事方式 | 如何筛选线索、如何回复合作请求 |
| 风格记忆 | 表达习惯 | 常用比喻、语气、禁用表达 |

### 5.3 知识处理流程

```mermaid
flowchart TD
    DATA[资料来源] --> CLEAN[清洗/切片]
    CLEAN --> TAG[主题标注]
    TAG --> EMB[向量化]
    EMB --> MEMORY[长期记忆]
    MEMORY --> TEST[自动生成测试题]
    TEST --> EVAL[本人校验]
    EVAL --> MEMORY
```

## 6. 推荐技术选型

### 快速 MVP

```text
前端：Next.js / React
实时：WebSocket / SSE，后续 LiveKit
大脑：OpenAI / Claude / Gemini
RAG：Supabase pgvector / Qdrant
声音：OpenAI TTS / ElevenLabs
Avatar：先不自研，后续接 Tavus / HeyGen / D-ID
部署：Vercel + 后端 API
```

### 中文自托管方案

```text
ASR：FunASR / SenseVoice / Whisper
LLM：Qwen / DeepSeek / GPT
TTS：CosyVoice / GPT-SoVITS / Fish Speech
Avatar：MuseTalk / Wav2Lip / LiteAvatar / SadTalker
实时：FastAPI + WebSocket / LiveKit
RAG：Qdrant / Milvus / pgvector
前端：React / Vue
部署：GPU 服务器 + Docker
```

### 商业实时视频方案

```text
Realtime Infra：LiveKit / Daily / Agora
Avatar Provider：Tavus / HeyGen / D-ID / Simli / Synthesia
TTS：ElevenLabs / OpenAI / Cartesia
LLM：GPT / Claude / Gemini
Memory：Postgres + Vector DB
Safety：Policy Guard + Audit Logs
```

## 7. 实时体验指标

| 指标 | 建议目标 |
|---|---:|
| 首次文字响应 | < 1 秒 |
| 语音首包 | < 1.5 秒 |
| 视频首帧 | < 2.5 秒 |
| 端到端回答 | 2-4 秒 |
| 可打断响应 | < 500ms |
| ASR 准确率 | 中文场景优先优化口语、噪声、人名 |

## 8. 安全策略

数字分身必须默认具备以下安全能力：

- 明示“我是某某的 AI 分身，不是本人实时在线”。
- 肖像权、声音权和数据授权记录。
- 高风险动作确认，例如投资承诺、财务承诺、法律建议、医疗建议。
- 隐私保护，避免透露私人联系方式、内部资料、未授权数据。
- 审计日志，记录关键对话和工具调用。
- 输出水印或身份标识。
- 本人可随时暂停、下线、删除或重训分身。

## 9. 实现难点排序

1. 像本人的判断方式：需要本人资料、结构化人格、反例和持续纠错。
2. 实时低延迟：ASR、LLM、TTS、口型、WebRTC 每层都会增加延迟。
3. 视频自然度：唇形、眨眼、微表情、头部运动和情绪同步都影响真实感。
4. 打断能力：没有 barge-in 会显得非常机械。
5. 记忆可靠性：数字分身不能胡编本人经历，需要来源、置信度和时间戳。
6. 授权和安全：特别是声音克隆和真人形象。
7. 成本：实时视频 Avatar + TTS + LLM 的并发成本较高。
