import Link from "next/link";
import { MermaidRuntime } from "./MermaidRuntime";

export default function BlueprintPage() {
  return (
    <main className="blueprint-page">
      <MermaidRuntime />
      <nav className="top-nav" aria-label="图册导航">
        <Link href="/" className="brand">
          <span className="brand-mark">DT</span>
          <span>架构图册</span>
        </Link>
        <div className="nav-links">
          <Link className="nav-link" href="/">
            产品首页
          </Link>
          <Link className="nav-link" href="/workspace">
            工作台
          </Link>
        </div>
      </nav>

      <header style={{ borderBottom: "1px solid var(--line)", paddingBottom: 38 }}>
        <p className="eyebrow">数字分身 / 架构图册 / Product Blueprint</p>
        <h1>把数字分身<br />画成可落地的系统</h1>
        <p className="lead">
          这版页面以图为主：产品信息架构、创建分身流程、实时对话链路、总体技术架构和路线图都保留为独立大图，便于评审、截图和继续迭代。
        </p>
      </header>

      <DiagramSection
        index="1."
        title="产品机制总览"
        note="数字分身的核心闭环不是“生成头像”，而是本人资料、人格建模、知识记忆、对话分发和本人纠错之间形成持续学习。"
      >
        {`flowchart LR
    A[本人资料] --> B[人格画像]
    B --> C[知识记忆]
    C --> D[数字分身]
    D --> E[访客对话]
    E --> F[本人纠错]
    F --> B
    F --> C
    E --> G[线索 / 预约 / 转化]`}
      </DiagramSection>

      <DiagramSection
        index="2."
        title="总体技术架构图"
        note="用户入口、实时网关、ASR/VAD、Agent Orchestrator、RAG、LLM、TTS、Avatar 和数据训练层在一张图里呈现。"
        wide
      >
        {`flowchart TD
    U3[运营/管理员] --> C3[Admin Console]
    U2[本人/创作者] --> C2[分身工作台]
    U1[访客/客户] --> C1[Web / App / 小程序]
    C3 --> API[API Gateway]
    C2 --> API
    API --> ORCH[Agent Orchestrator<br/>对话状态 / 路由 / 工具调用]
    ORCH --> SAFETY[Safety & Policy Guard<br/>身份声明 / 越权拦截 / 风险动作确认]
    SAFETY --> MEM[Memory Router<br/>短期记忆 / 长期记忆 / 用户画像]
    MEM --> RAG[RAG Retrieval<br/>个人资料 / 推文 / 文章 / 课程 / FAQ]
    RAG --> LLM[LLM Reasoning<br/>GPT / Claude / Gemini / Qwen / DeepSeek]
    LLM --> TOOL[Tool Calling<br/>日历 / CRM / 邮件 / 支付 / 工单]
    TOOL --> LLM
    LLM --> STYLE[Persona Style Layer<br/>口吻 / 价值观 / 表达习惯]
    STYLE --> TEXT[Text Response]
    STYLE --> TTS[Streaming TTS<br/>ElevenLabs / OpenAI / CosyVoice]
    TTS --> AVATAR[Avatar Renderer<br/>Tavus / HeyGen / D-ID / MuseTalk / LiteAvatar]
    C1 --> G[Realtime Gateway<br/>WebRTC / WebSocket / SSE]
    G --> VAD[VAD 语音活动检测]
    VAD --> ASR[Streaming ASR<br/>Whisper / SenseVoice / OpenAI]
    ASR --> ORCH
    TEXT --> G
    AVATAR --> G
    G --> C1
    subgraph Storage[数据与训练层]
        VDB[(Vector DB<br/>知识向量 / 记忆)]
        PG[(Postgres<br/>用户 / 会话 / 权限 / 配置)]
        LOG[(Event Logs<br/>对话 / 反馈 / 审计)]
        OBJ[(Object Storage<br/>音频 / 视频 / 头像素材)]
        EVAL[(Eval Set<br/>本人纠错 / 测试集)]
    end
    MEM --> VDB
    ORCH --> PG
    ORCH --> LOG
    TTS --> OBJ
    AVATAR --> OBJ
    C2 --> EVAL
    EVAL --> STYLE`}
      </DiagramSection>

      <DiagramSection
        index="3."
        title="实时对话链路图"
        note="用于讨论实时体验：音频流、VAD、检索、LLM 流式回复、TTS、Avatar 视频流，以及中途打断如何回到编排层。"
        wide
      >
        {`sequenceDiagram
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
    Agent->>LLM: system persona + context + user query
    LLM-->>Agent: 流式生成回复
    Agent->>TTS: 流式文本转语音
    TTS-->>Avatar: 音频 chunk
    Avatar-->>RT: 视频帧/音频流
    RT-->>Client: WebRTC 返回
    Client-->>User: 数字分身回答
    User->>Client: 中途打断
    Client->>RT: barge-in 信号
    RT->>Agent: 停止当前输出
    Agent->>LLM: 重新组织上下文`}
      </DiagramSection>

      <DiagramSection
        index="4."
        title="产品信息架构"
        note="对应用户如何进入产品，以及分身工作台下的主要功能模块。"
        wide
      >
        {`flowchart LR
    HOME[首页 / 官网] --> DEMO[体验一个数字分身]
    HOME --> LOGIN[登录 / 注册]
    LOGIN --> DASH[分身工作台]
    DASH --> CREATE[创建分身]
    DASH --> KNOW[知识库]
    DASH --> VOICE[声音与形象]
    DASH --> PERSONA[人格设定]
    DASH --> TEST[测试与纠错]
    DASH --> PUBLISH[发布与嵌入]
    DASH --> ANALYTICS[数据分析]
    DASH --> PERMISSION[权限与安全]
    CREATE --> STEP1[身份授权]
    CREATE --> STEP2[上传资料]
    CREATE --> STEP3[生成 Persona]
    CREATE --> STEP4[选择声音 / 形象]
    CREATE --> STEP5[试聊校准]
    CREATE --> STEP6[发布]
    PUBLISH --> WEB[官网 Widget]
    PUBLISH --> LINK[专属链接]
    PUBLISH --> APP[API / SDK]
    PUBLISH --> PRIVATE[私域 / 企业微信 / 飞书]`}
      </DiagramSection>

      <DiagramSection
        index="5."
        title="创建分身流程"
        note="关键节点是“本人确认像不像”：不像就进入纠错与重训，通过才设置权限并发布。"
      >
        {`flowchart TD
    A[开始创建] --> B[身份与授权]
    B --> C[上传本人资料]
    C --> D[自动生成人格画像]
    D --> E[训练知识记忆]
    E --> F[选择声音方案]
    F --> G[选择形象方案]
    G --> H[试聊 20 题]
    H --> I{本人确认像不像}
    I -- 通过 --> K[设置权限边界]
    K --> L[发布到渠道]
    I -- 不像 --> J[纠错与重训]
    J --> H`}
      </DiagramSection>
    </main>
  );
}

function DiagramSection({
  index,
  title,
  note,
  children,
  wide,
}: {
  index: string;
  title: string;
  note: string;
  children: string;
  wide?: boolean;
}) {
  return (
    <section className="diagram-section">
      <div className="section-head">
        <div>
          <p className="eyebrow">{index}</p>
          <h2>{title}</h2>
        </div>
        <p className="section-note">{note}</p>
      </div>
      <div className="diagram-canvas">
        <pre className="mermaid" style={{ minWidth: wide ? 1420 : 1040 }}>
          {children}
        </pre>
      </div>
    </section>
  );
}
