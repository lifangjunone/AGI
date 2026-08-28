import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowRight,
  BookOpen,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  Code2,
  Command,
  Database,
  ExternalLink,
  Gauge,
  GitBranch,
  Menu,
  Radio,
  Search,
  ShieldCheck,
  Target,
  Users,
  X,
  Zap,
} from "lucide-react";
import "./styles.css";

type SectionId = "overview" | "workflow" | "skills" | "lab" | "career";

const sections: { id: SectionId; label: string; short: string }[] = [
  { id: "overview", label: "岗位全景", short: "01" },
  { id: "workflow", label: "工作方法", short: "02" },
  { id: "skills", label: "能力地图", short: "03" },
  { id: "lab", label: "实战演练", short: "04" },
  { id: "career", label: "入行指南", short: "05" },
];

const lifecycle = [
  {
    phase: "发现",
    code: "DISCOVER",
    duration: "1–5 天",
    question: "真正阻塞业务结果的是什么？",
    work: "跟随一线用户观察现有流程，盘点数据、权限、风险和利益相关者。",
    artifact: "问题地图 + 成功指标",
  },
  {
    phase: "定界",
    code: "SCOPE",
    duration: "0.5–2 天",
    question: "最小但完整的价值闭环是什么？",
    work: "锁定 hero workflow，明确不做什么，并写出验收条件与退出标准。",
    artifact: "交付契约 + 架构草图",
  },
  {
    phase: "共建",
    code: "BUILD",
    duration: "3–15 天",
    question: "怎样尽快在真实数据上证明价值？",
    work: "连接数据、实现操作界面、建立评测集，与客户工程师每日验证。",
    artifact: "可运行原型 + Eval",
  },
  {
    phase: "投产",
    code: "DEPLOY",
    duration: "1–4 周",
    question: "系统如何被信任、采用并持续运行？",
    work: "补齐权限、审计、观测、回滚、值班与变更管理，灰度进入生产。",
    artifact: "生产系统 + Runbook",
  },
  {
    phase: "回流",
    code: "PRODUCTIZE",
    duration: "持续",
    question: "哪些现场经验应变成平台能力？",
    work: "区分客户特例与共性模式，把连接器、评测和工作流沉淀回产品。",
    artifact: "产品信号 + 可复用模块",
  },
];

const skillGroups = [
  {
    title: "工程交付",
    level: "硬底座",
    icon: Code2,
    skills: ["全栈开发", "API 与集成", "数据建模", "云与网络", "CI/CD", "可观测性"],
    proof: "能独立把一个模糊需求送到稳定生产，而不止完成 Demo。",
  },
  {
    title: "AI 系统",
    level: "新主场",
    icon: Database,
    skills: ["RAG", "工具调用", "评测设计", "提示版本", "模型路由", "安全护栏"],
    proof: "用业务样本定义质量，能解释准确率、延迟、成本与风险的取舍。",
  },
  {
    title: "客户共创",
    level: "分水岭",
    icon: Users,
    skills: ["现场发现", "需求拆解", "高管沟通", "用户培训", "冲突处理", "项目推进"],
    proof: "能从不同角色的叙述中找到事实，促成决策并推动真实采用。",
  },
  {
    title: "产品判断",
    level: "杠杆点",
    icon: GitBranch,
    skills: ["价值排序", "范围控制", "模式识别", "产品反馈", "商业意识", "行业理解"],
    proof: "知道什么该定制、什么该拒绝、什么必须回流成产品能力。",
  },
];

const comparisons = [
  ["主要目标", "客户业务结果", "通用产品能力", "促成技术购买", "提供建议与方案"],
  ["是否写生产代码", "核心职责", "核心职责", "偶尔做 Demo", "通常不是"],
  ["工作边界", "发现到采用", "产品研发周期", "售前验证", "项目建议范围"],
  ["主要输入", "真实现场与数据", "产品路线图", "商机与需求", "访谈与分析"],
  ["成功信号", "采用率与业务指标", "质量与规模", "赢单与转化", "建议被采纳"],
];

export const scenarios = [
  {
    title: "发现：先找真实瓶颈",
    context:
      "一家精密制造企业希望“用 AI 预测设备故障”。厂长要求 4 周上线，数据团队给了 18 个月传感器数据，但维修主管说误报会让班组彻底弃用系统。",
    prompt: "你的第一步是什么？",
    options: [
      {
        text: "先训练预测模型，用 AUC 证明技术可行",
        score: 0,
        feedback: "过早进入方案。你还不知道哪类停机最贵、谁采取行动、误报成本多高。",
      },
      {
        text: "跟班观察维修流程，并定义可行动告警与业务基线",
        score: 3,
        feedback: "正确。FDE 先确认决策闭环：谁收到什么信号、采取什么动作、结果如何计量。",
      },
      {
        text: "组织高管会议，确认预算和项目汇报线",
        score: 1,
        feedback: "治理重要，但不能替代现场事实。应同时接触操作人员和数据拥有者。",
      },
    ],
  },
  {
    title: "定界：做最小价值闭环",
    context:
      "现场发现：80% 的损失来自 12 台关键机床的主轴过热。现有系统每天发 200 条阈值告警，仅 4% 需要处理。维修记录散落在 MES、Excel 和纸质交接本。",
    prompt: "首个两周版本应交付什么？",
    options: [
      {
        text: "覆盖全厂所有设备的统一预测平台",
        score: 0,
        feedback: "范围过大，数据异构和采用风险会吞掉四周期限。",
      },
      {
        text: "12 台机床的风险排序、证据解释和维修确认闭环",
        score: 3,
        feedback: "正确。范围小但闭环完整，既能度量误报，也能收集新的维修标签。",
      },
      {
        text: "一个展示趋势和热力图的管理驾驶舱",
        score: 1,
        feedback: "可视化不等于业务闭环。缺少操作动作、责任人和反馈采集。",
      },
    ],
  },
  {
    title: "投产：守住可信门槛",
    context:
      "灰度结果显示计划外停机减少 22%，但夜班出现一次数据延迟，系统仍展示旧风险分数。客户要求次日全量上线。",
    prompt: "你会如何处理？",
    options: [
      {
        text: "按客户要求上线，之后再补监控",
        score: 0,
        feedback: "这是生产责任缺位。过期数据会直接破坏用户信任。",
      },
      {
        text: "暂停发布，加入数据新鲜度门禁、降级提示与回滚演练",
        score: 3,
        feedback: "正确。业务收益不能抵消运行风险；明确降级行为后再扩大范围。",
      },
      {
        text: "隐藏风险分数更新时间，避免操作员困惑",
        score: 0,
        feedback: "不可接受。透明度是高风险系统建立信任的基础。",
      },
    ],
  },
];

export const sources = [
  {
    name: "OpenAI · Forward Deployed Engineer",
    note: "官方岗位定义：端到端部署、生产采用、评测反馈与跨团队协作。",
    href: "https://openai.com/careers/forward-deployed-engineer-(fde)-sf-san-francisco/",
  },
  {
    name: "Palantir · 官方招聘岗位库",
    note: "岗位原型：客户现场、架构决策、大规模数据和定制应用。",
    href: "https://jobs.lever.co/palantir",
  },
  {
    name: "Deloitte · Associate FDE",
    note: "企业 AI 交付细节：人机协同、质量/安全/延迟/成本权衡与可复用资产。",
    href: "https://apply.deloitte.com/en_US/careers/JobDetail?jobId=360224",
  },
  {
    name: "Awesome FDE Roadmap",
    note: "社区实践路线：数据、云基础设施、AI 评测与咨询能力。",
    href: "https://github.com/nikolaospapachristou/Awesome-FDE-Roadmap",
  },
];

function App() {
  const [activeSection, setActiveSection] = useState<SectionId>("overview");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [lifecyclePhase, setLifecyclePhase] = useState(0);
  const [scenarioStep, setScenarioStep] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((current) => !current);
      }
      if (event.key === "Escape") setSearchOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActiveSection(visible.target.id as SectionId);
      },
      { rootMargin: "-25% 0px -60% 0px", threshold: [0.1, 0.4] },
    );
    sections.forEach(({ id }) => {
      const node = document.getElementById(id);
      if (node) observer.observe(node);
    });
    return () => observer.disconnect();
  }, []);

  const searchResults = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const pages = [
      { title: "FDE 是什么", detail: "一句话定义、核心责任和岗位边界", id: "overview" },
      { title: "部署生命周期", detail: "发现、定界、共建、投产与回流", id: "workflow" },
      { title: "能力地图", detail: "工程、AI、客户共创与产品判断", id: "skills" },
      { title: "制造业实战", detail: "处理设备告警项目的三次关键决策", id: "lab" },
      { title: "90 天入行路线", detail: "作品集、面试和自我判断", id: "career" },
    ];
    if (!normalized) return pages;
    return pages.filter((item) =>
      `${item.title}${item.detail}`.toLowerCase().includes(normalized),
    );
  }, [query]);

  const score = answers.reduce(
    (total, answer, index) => total + (scenarios[index]?.options[answer]?.score ?? 0),
    0,
  );

  const jumpTo = (id: SectionId) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    setMobileOpen(false);
    setSearchOpen(false);
  };

  const answerScenario = (option: number) => {
    if (answers.length !== scenarioStep) return;
    setAnswers((current) => [...current, option]);
  };

  const resetLab = () => {
    setAnswers([]);
    setScenarioStep(0);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
          <span className="brand-mark">F/DE</span>
          <span>
            <strong>前线工程手册</strong>
            <small>FIELD MANUAL · 2026</small>
          </span>
        </button>
        <nav className="desktop-nav" aria-label="主导航">
          {sections.map((section) => (
            <button
              key={section.id}
              className={activeSection === section.id ? "active" : ""}
              onClick={() => jumpTo(section.id)}
            >
              {section.label}
            </button>
          ))}
        </nav>
        <div className="top-actions">
          <button className="search-trigger" onClick={() => setSearchOpen(true)}>
            <Search size={16} />
            <span>搜索手册</span>
            <kbd>⌘ K</kbd>
          </button>
          <button
            className="icon-button menu-button"
            aria-label={mobileOpen ? "关闭导航" : "打开导航"}
            onClick={() => setMobileOpen((current) => !current)}
          >
            {mobileOpen ? <X /> : <Menu />}
          </button>
        </div>
        {mobileOpen && (
          <nav className="mobile-nav" aria-label="移动端导航">
            {sections.map((section) => (
              <button key={section.id} onClick={() => jumpTo(section.id)}>
                <span>{section.short}</span>
                {section.label}
              </button>
            ))}
          </nav>
        )}
      </header>

      <main>
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="eyebrow"><Radio size={15} /> CUSTOMER REALITY / PRODUCTION CODE</p>
            <h1 id="hero-title">FDE<br />前线工程手册</h1>
            <p className="hero-lead">
              站在客户现场，把最模糊、最关键的问题，变成真正运行的生产系统。
            </p>
            <div className="hero-actions">
              <button className="primary-button" onClick={() => jumpTo("lab")}>
                进入实战 <ArrowRight size={18} />
              </button>
              <button className="text-button" onClick={() => jumpTo("overview")}>
                先用 60 秒了解岗位 <ChevronRight size={17} />
              </button>
            </div>
          </div>
          <div className="hero-status" aria-label="岗位核心信号">
            <div><span>01</span><strong>深入现场</strong><small>理解没有写进 PRD 的事实</small></div>
            <div><span>02</span><strong>亲手交付</strong><small>从原型直到生产采用</small></div>
            <div><span>03</span><strong>反哺产品</strong><small>让一次经验产生复利</small></div>
          </div>
          <div className="scroll-cue"><span /> 向下进入现场</div>
        </section>

        <section id="overview" className="content-section overview-section">
          <SectionHeading
            index="01"
            kicker="60 秒岗位全景"
            title="不是顾问，也不只是工程师"
            intro="FDE（Forward Deployed Engineer，前线部署工程师）嵌入客户团队，对从问题发现到生产采用的完整结果负责。"
          />

          <div className="definition-grid">
            <article className="definition-primary">
              <p className="definition-quote">
                “一个客户，许多能力。”<br />
                <span>用工程能力解决现场结果，再把重复模式带回核心产品。</span>
              </p>
              <div className="responsibility-line">
                {["发现", "定界", "架构", "编码", "上线", "采用", "回流"].map((item, index) => (
                  <div key={item}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <strong>{item}</strong>
                  </div>
                ))}
              </div>
            </article>
            <aside className="truth-panel">
              <div className="panel-label">THE TRUTH</div>
              <h3>交付物不是 PPT</h3>
              <p>而是客户在真实数据、真实权限和真实风险下愿意持续使用的系统。</p>
              <dl>
                <div><dt>输入</dt><dd>模糊问题 + 复杂现场</dd></div>
                <div><dt>输出</dt><dd>可衡量的业务结果</dd></div>
                <div><dt>杠杆</dt><dd>可复用的产品能力</dd></div>
              </dl>
            </aside>
          </div>

          <div className="role-table-wrap">
            <div className="table-heading">
              <div>
                <p className="micro-label">ROLE DIFFERENCE</p>
                <h3>相似岗位，到底差在哪</h3>
              </div>
              <p>边界会因公司而异，判断岗位时要看实际责任，不只看 Title。</p>
            </div>
            <div className="role-table" role="table" aria-label="FDE 与相似岗位对比">
              <div className="role-row role-head" role="row">
                <span role="columnheader">维度</span>
                <span role="columnheader" className="fde-column">FDE</span>
                <span role="columnheader">产品工程师</span>
                <span role="columnheader">解决方案工程师</span>
                <span role="columnheader">技术顾问</span>
              </div>
              {comparisons.map((row) => (
                <div className="role-row" role="row" key={row[0]}>
                  {row.map((cell, index) => (
                    <span role="cell" className={index === 1 ? "fde-column" : ""} key={`${row[0]}-${index}`}>
                      {cell}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="workflow" className="content-section dark-section">
          <SectionHeading
            index="02"
            kicker="端到端工作方法"
            title="五个阶段，一条价值闭环"
            intro="FDE 的节奏不是先写完整需求再开发，而是用现场证据不断收窄问题，尽快交付可验证的生产切片。"
            inverted
          />
          <div className="lifecycle-layout">
            <div className="phase-selector" role="tablist" aria-label="部署生命周期">
              {lifecycle.map((item, index) => (
                <button
                  key={item.code}
                  role="tab"
                  aria-selected={lifecyclePhase === index}
                  className={lifecyclePhase === index ? "active" : ""}
                  onClick={() => setLifecyclePhase(index)}
                >
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{item.phase}</strong>
                  <small>{item.code}</small>
                </button>
              ))}
            </div>
            <article className="phase-detail">
              <div className="phase-topline">
                <span>{lifecycle[lifecyclePhase].code}</span>
                <span><Clock3 size={14} /> {lifecycle[lifecyclePhase].duration}</span>
              </div>
              <p className="phase-question">{lifecycle[lifecyclePhase].question}</p>
              <p className="phase-work">{lifecycle[lifecyclePhase].work}</p>
              <div className="artifact">
                <Target size={18} />
                <span>阶段产物</span>
                <strong>{lifecycle[lifecyclePhase].artifact}</strong>
              </div>
            </article>
          </div>
          <div className="week-strip">
            <div><span>MON</span><strong>用户跟访</strong><small>观察操作，不代替用户描述</small></div>
            <div><span>TUE</span><strong>数据剖析</strong><small>验证质量、权限与边界</small></div>
            <div><span>WED</span><strong>结对构建</strong><small>用真实样本完成纵向切片</small></div>
            <div><span>THU</span><strong>现场评测</strong><small>错误分析与范围重排</small></div>
            <div><span>FRI</span><strong>生产回流</strong><small>复盘风险，沉淀产品信号</small></div>
          </div>
        </section>

        <section id="skills" className="content-section">
          <SectionHeading
            index="03"
            kicker="能力地图"
            title="技术是底座，判断力决定上限"
            intro="强 FDE 不是每项都最深，而是能在不确定环境里快速建立足够深度，串起技术、业务与组织。"
          />
          <div className="skill-grid">
            {skillGroups.map(({ title, level, icon: Icon, skills, proof }, index) => (
              <article className="skill-card" key={title}>
                <div className="skill-card-head">
                  <div className="skill-icon"><Icon /></div>
                  <span>0{index + 1} / {level}</span>
                </div>
                <h3>{title}</h3>
                <div className="skill-tags">
                  {skills.map((skill) => <span key={skill}>{skill}</span>)}
                </div>
                <p><Check size={16} /> {proof}</p>
              </article>
            ))}
          </div>
          <div className="decision-model">
            <div>
              <p className="micro-label">DAILY TRADE-OFF</p>
              <h3>每个方案都要同时过四道门</h3>
            </div>
            <div className="decision-axis">
              <span><Zap />价值<strong>现在值得做吗</strong></span>
              <span><Clock3 />速度<strong>多久能证伪</strong></span>
              <span><ShieldCheck />风险<strong>错了会怎样</strong></span>
              <span><Gauge />复用<strong>下个客户更快吗</strong></span>
            </div>
          </div>
        </section>

        <section id="lab" className="content-section lab-section">
          <SectionHeading
            index="04"
            kicker="交互式实战"
            title="你来接管这次部署"
            intro="客户不是在购买一个模型，而是在赌一条关键业务流程。连续完成三次判断，看看你是否具备 FDE 的结果思维。"
          />
          <div className="lab-frame">
            <aside className="mission-rail">
              <div className="mission-id"><Radio /> LIVE MISSION<br /><strong>MX-204</strong></div>
              <div className="mission-meta">
                <span>客户</span><strong>精密制造集团</strong>
                <span>目标</span><strong>降低计划外停机</strong>
                <span>周期</span><strong>4 周</strong>
                <span>风险</span><strong className="risk">高</strong>
              </div>
              <div className="lab-progress" aria-label={`实战进度 ${answers.length}/3`}>
                {[0, 1, 2].map((item) => (
                  <span key={item} className={answers.length > item ? "done" : scenarioStep === item ? "current" : ""} />
                ))}
              </div>
              <small>{answers.length} / 3 决策完成</small>
            </aside>

            <div className="scenario-panel">
              {scenarioStep < scenarios.length ? (
                <>
                  <div className="scenario-head">
                    <span>DECISION {scenarioStep + 1} / 3</span>
                    <strong>{scenarios[scenarioStep].title}</strong>
                  </div>
                  <p className="scenario-context">{scenarios[scenarioStep].context}</p>
                  <h3>{scenarios[scenarioStep].prompt}</h3>
                  <div className="option-list">
                    {scenarios[scenarioStep].options.map((option, index) => {
                      const answered = answers.length > scenarioStep;
                      const selected = answers[scenarioStep] === index;
                      return (
                        <button
                          key={option.text}
                          disabled={answered}
                          className={selected ? (option.score === 3 ? "correct" : "wrong") : ""}
                          onClick={() => answerScenario(index)}
                        >
                          <span>{String.fromCharCode(65 + index)}</span>
                          <strong>{option.text}</strong>
                          {selected && <Check size={18} />}
                        </button>
                      );
                    })}
                  </div>
                  {answers.length > scenarioStep && (
                    <div className="feedback-box">
                      <CircleAlert size={20} />
                      <p>{scenarios[scenarioStep].options[answers[scenarioStep]].feedback}</p>
                      <button
                        onClick={() => setScenarioStep((current) => current + 1)}
                      >
                        继续下一决策 <ArrowRight size={17} />
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="mission-result">
                  <span className="result-label">MISSION REVIEW</span>
                  <div className="score-ring"><strong>{score}</strong><span>/ 9</span></div>
                  <h3>{score >= 8 ? "具备结果型 FDE 思维" : score >= 5 ? "方向正确，需加强生产判断" : "仍在用传统交付思维解题"}</h3>
                  <p>
                    最优路径不是“最快写出模型”，而是先定义可行动结果，再交付最小闭环，最后用生产门禁守住长期信任。
                  </p>
                  <button className="primary-button" onClick={resetLab}>重新演练</button>
                </div>
              )}
            </div>
          </div>
        </section>

        <section id="career" className="content-section career-section">
          <SectionHeading
            index="05"
            kicker="入行与面试"
            title="用 90 天证明你能交付"
            intro="证书的说服力有限。最有价值的作品集，是一个从业务问题、真实数据、工程实现到运行证据都完整的部署案例。"
          />
          <div className="roadmap">
            <article>
              <span className="roadmap-day">01—30</span>
              <h3>补齐生产底座</h3>
              <p>做一个带鉴权、日志、测试、部署和回滚的全栈小系统。</p>
              <ul>
                <li>API、数据库与数据管道</li>
                <li>云部署、权限和可观测性</li>
                <li>明确 SLO 与故障演练</li>
              </ul>
            </article>
            <article>
              <span className="roadmap-day">31—60</span>
              <h3>完成 AI 纵向切片</h3>
              <p>选一个真实工作流，用业务样本建立评测，不把演示效果当质量。</p>
              <ul>
                <li>50+ 条代表性 Eval 数据</li>
                <li>质量、延迟、成本仪表</li>
                <li>人工复核与失败降级</li>
              </ul>
            </article>
            <article>
              <span className="roadmap-day">61—90</span>
              <h3>模拟客户交付</h3>
              <p>找 3 位真实用户跟访，让系统承受现场约束并记录每次取舍。</p>
              <ul>
                <li>发现记录与范围决策</li>
                <li>采用数据与错误复盘</li>
                <li>可复用模块与产品建议</li>
              </ul>
            </article>
          </div>

          <div className="interview-grid">
            <div className="interview-main">
              <p className="micro-label">INTERVIEW SIGNAL</p>
              <h3>面试官真正想看到的四个证据</h3>
              <ol>
                <li><span>01</span><div><strong>先澄清，再编码</strong><p>主动识别用户、约束、成功指标与风险。</p></div></li>
                <li><span>02</span><div><strong>能做范围取舍</strong><p>解释为什么先做这个，也能清楚说明不做什么。</p></div></li>
                <li><span>03</span><div><strong>代码可进生产</strong><p>考虑测试、权限、观测、回滚，而不是停在 happy path。</p></div></li>
                <li><span>04</span><div><strong>讲清业务影响</strong><p>把技术选择翻译成采用、效率、收入或风险变化。</p></div></li>
              </ol>
            </div>
            <aside className="fit-check">
              <BriefcaseBusiness />
              <h3>你适合 FDE 吗？</h3>
              <p>高匹配信号</p>
              <ul>
                <li>喜欢直接面对用户与模糊问题</li>
                <li>愿意跨前后端、数据和基础设施</li>
                <li>能在压力下做清晰取舍</li>
                <li>对“被采用”比“已发布”更兴奋</li>
              </ul>
              <p>需要慎重</p>
              <ul className="muted-list">
                <li>强烈偏好稳定、封闭的需求边界</li>
                <li>不愿承担出差与客户沟通</li>
                <li>只想深耕单一技术层</li>
              </ul>
            </aside>
          </div>

          <div className="source-block">
            <div className="source-heading">
              <BookOpen />
              <div><p className="micro-label">SOURCES</p><h3>继续深入</h3></div>
              <span>资料核验：2026-08-28</span>
            </div>
            <div className="source-list">
              {sources.map((source, index) => (
                <a href={source.href} target="_blank" rel="noreferrer" key={source.name}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div><strong>{source.name}</strong><p>{source.note}</p></div>
                  <ExternalLink size={17} />
                </a>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer>
        <div className="brand-mark">F/DE</div>
        <p>从现场事实到生产结果。</p>
        <span>独立学习项目 · 非任何公司的官方材料</span>
      </footer>

      {searchOpen && (
        <div className="search-overlay" role="dialog" aria-modal="true" aria-label="搜索手册">
          <button className="overlay-dismiss" aria-label="关闭搜索" onClick={() => setSearchOpen(false)} />
          <div className="search-dialog">
            <div className="search-input">
              <Search />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索岗位、能力或实战..."
              />
              <kbd>ESC</kbd>
            </div>
            <div className="search-results">
              {searchResults.map((result) => (
                <button key={result.id} onClick={() => jumpTo(result.id as SectionId)}>
                  <Command size={17} />
                  <div><strong>{result.title}</strong><span>{result.detail}</span></div>
                  <ChevronRight size={17} />
                </button>
              ))}
              {searchResults.length === 0 && <p className="empty-search">没有匹配内容</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SectionHeading({
  index,
  kicker,
  title,
  intro,
  inverted = false,
}: {
  index: string;
  kicker: string;
  title: string;
  intro: string;
  inverted?: boolean;
}) {
  return (
    <header className={`section-heading ${inverted ? "inverted" : ""}`}>
      <div className="section-index">{index}</div>
      <div>
        <p className="eyebrow">{kicker}</p>
        <h2>{title}</h2>
      </div>
      <p className="section-intro">{intro}</p>
    </header>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
