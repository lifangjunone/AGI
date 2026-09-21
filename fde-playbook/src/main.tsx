import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ArrowLeft, Check, Copy, X } from "lucide-react";
import DiagnosticApp from "./App";
import "./styles.css";

type ScriptLine = { label: string; text: string };
type CaseStudy = { tag: string; title: string; body: string; result: string };
type Moment = {
  id: string;
  idx: string;
  title: string;
  when: string;
  goal: string;
  steps: string[];
  scripts: ScriptLine[];
  checklist: string[];
  flags: string[];
  caseStudy: CaseStudy;
};

const MOMENTS: Moment[] = [
  {
    id: "clarify",
    idx: "01",
    title: "需求澄清",
    when: "客户开口就是「我想上个 AI」「我要个智能助手」",
    goal: "离开会议时，能把「想要 AI」翻译成一个可验证的业务结果，以及谁在什么环节用它。",
    steps: [
      "先问业务事件、不问功能：在哪个具体流程、谁、多久一次、现在怎么处理、错一次代价多大。",
      "只锁定最贵的那个动作：高频 × 高失败成本 × 有现成数据。这阶段只做这一个。",
      "要现状基线（现在的准确率/耗时/人力）。没有基线，先花半天测出来，不许跳过。",
      "用一句话写回确认：让「谁」在「什么环节」把「某指标」从 X 改到 Y。",
    ],
    scripts: [
      {
        label: "把功能请求转成业务结果",
        text: "先不聊模型。如果这个东西三个月后算成功，您会用哪个数字判断？谁的工作会因此变轻松？",
      },
      {
        label: "顶住泛化范围",
        text: "「更智能」没法验收。我们先挑一个您这周就会因为它变好而省钱的环节，其它的进二期清单。",
      },
    ],
    checklist: [
      "有具体角色 / 环节 / 频率",
      "有可量化指标和现状基线",
      "问清「做错一次的代价」",
      "范围不超过 1 个闭环",
      "关键决策人当面复述并认可",
    ],
    flags: [
      "只谈技术参数、不谈业务",
      "一上来就要「大而全平台」",
      "没有任何现状数据就承诺效果",
      "决策人根本不在场",
    ],
    caseStudy: {
      tag: "真实小案例",
      title: "从「知识库」收敛到「告警分诊」",
      body: "某制造客户开场要一个会聊天的知识库。跟岗两天发现最贵动作是凌晨告警分诊：每天约 2000 条、错派损失高、历史工单齐全。范围改为告警分级一条闭环，约定误派率为指标，六周后误派率下降，知识库被放进二期。",
      result: "范围：平台 → 1 个可验收闭环",
    },
  },
  {
    id: "metrics",
    idx: "02",
    title: "定义成功标准",
    when: "项目要验收了，却只得到一句「效果好像还不错」",
    goal: "在动手前，把成功写成可测量、有阈值、有时间点、能被否证的标准，并由客户确认。",
    steps: [
      "区分三类指标：业务结果（误派率/停机时长）、系统质量（准确/召回/延迟）、采纳（真实使用人数/频次），每类至少一个。",
      "每个指标写清「基线 → 目标 → 测量方式 → 测量时间」，目标由客户签字。",
      "同时定「最低成功线」（不达标即失败）和「惊喜线」，别只报一个漂亮数。",
      "事先约定反例与人工兜底：模型错了怎么算、谁有权一键停用。",
    ],
    scripts: [
      {
        label: "把验收前置",
        text: "如果上线四周后您要决定要不要继续投入，我们今天就把判断标准写下来，省得到时各说各话。",
      },
      {
        label: "拆开「准确率」",
        text: "我们把「准」拆开：该报警的漏掉多少、不该报的骚扰多少，分别定阈值，比一个总准确率更能说明问题。",
      },
    ],
    checklist: [
      "每个指标有基线/目标/测法/时点",
      "设了最低成功线",
      "客户书面确认",
      "定义了失败与停用条件",
    ],
    flags: [
      "用「感觉变好了」当标准",
      "只承诺模型分、不谈业务结果",
      "没有测量数据来源",
      "目标在项目中途被随意改",
    ],
    caseStudy: {
      tag: "真实小案例",
      title: "87 分却被判成功",
      body: "客户要求「准确率做到 90%」。拆成漏报率 ≤5%（安全）、误报率 ≤30%（不打扰）、值班实际采纳 ≥80%。上线后模型总分 87、但漏报仅 2%，客户依据事前标准判定成功并决定扩点。",
      result: "标准事前定清 → 验收无争议",
    },
  },
  {
    id: "production",
    idx: "03",
    title: "POC 转生产",
    when: "Demo 跑得很炫，但没有任何人敢真正用它",
    goal: "在 POC 阶段就为上生产铺路，而不是做完 Demo 再整体返工。",
    steps: [
      "第一天就对齐生产差距清单：真实数据源、权限、延迟、并发、监控、降级、审计。",
      "用真实（脱敏）数据和真实用户跑，不用精心准备的 demo 样本。",
      "设计「人在回路」：关键动作保留人工确认，并展示依据与置信度。",
      "先小范围灰度，定义好退出/回滚条件，再逐步放量。",
    ],
    scripts: [
      {
        label: "重新定义 POC",
        text: "POC 的目标不是证明它聪明，是提前暴露所有让它不敢上线的东西。",
      },
      {
        label: "给激进上线踩刹车",
        text: "我们先让一个班组用两周，约定好什么情况立刻回退，再谈全厂推广。",
      },
    ],
    checklist: [
      "接入真实数据源和权限",
      "有日志/监控/告警",
      "有降级与回滚开关",
      "经真实用户灰度验证",
      "明确了运维责任人",
    ],
    flags: [
      "只在样例数据上成功",
      "没人愿意为上线后负责",
      "没有回滚方案",
      "要求一步到位全量上线",
    ],
    caseStudy: {
      tag: "真实小案例",
      title: "演示封神，为什么没翻车",
      body: "告警 Demo 在样例上表现完美，接入真实数据后准确率骤降——数据缺失、口径不一。因提前列了生产差距清单，补齐数据校验与置信度展示，先灰度一个班组，达标后才扩线。",
      result: "灰度先行，避免「上线翻车」",
    },
  },
  {
    id: "data",
    idx: "04",
    title: "数据权限与合规",
    when: "客户两手一摊：「数据不能给你」",
    goal: "让项目在不踩数据红线的前提下拿到够用的数据，把合规变成可执行方案，而不是一句拒绝。",
    steps: [
      "尽早摸清数据在哪、谁有权、什么敏感级别、有无出境与留存要求。",
      "最小化取数：只取该闭环必需字段，能脱敏/匿名就不取明文。",
      "给出落地选项：内网部署、专有环境、字段脱敏、访问审计，让客户安全团队选。",
      "把授权范围、用途、留存期限写成书面确认，全程留痕。",
    ],
    scripts: [
      {
        label: "缩小取数面",
        text: "我不需要全部数据。告诉我这个判断真正依赖哪几个字段，我们围绕最小集合申请。",
      },
      {
        label: "换一条路拿数据",
        text: "我们换个方式——在您内网环境里跑，数据不出域，我只拿到评测结果，可以吗？",
      },
    ],
    checklist: [
      "明确数据清单与敏感级",
      "最小字段 + 脱敏",
      "有部署/留存方案",
      "安全与法务书面授权",
      "全程访问可审计",
    ],
    flags: [
      "只靠口头授权、无留痕",
      "先拿数据后补审批",
      "把生产数据随意导出调试",
      "用途超出当初申请范围",
    ],
    caseStudy: {
      tag: "真实小案例",
      title: "数据不出域，项目照样推进",
      body: "客户以保密为由拒绝提供告警明细。改为客户内网部署、字段级脱敏、只回传统一评测指标。安全团队两周放行，项目未因数据问题停摆。",
      result: "合规方案落地，审批仅 2 周",
    },
  },
  {
    id: "expect",
    idx: "05",
    title: "客户预期管理",
    when: "对方觉得「AI 应该什么都能做、还能替掉几个人」",
    goal: "把不切实际的预期持续校准成这阶段能做 / 不能做什么，同时保住信任。",
    steps: [
      "第一次会就明确能力边界，用「现在能做 / 暂时不能 / 需要人确认」三栏写清。",
      "固定节奏（如每周）同步进展、坏消息和指标，坏消息不过夜。",
      "每交付一个小结果就可视化，用客户的语言而非模型术语。",
      "主动维护一份「不会做的事」清单，比被动拒绝更建立信任。",
    ],
    scripts: [
      {
        label: "摆正人机关系",
        text: "它不是替代专家，是帮专家把 80% 的重复判断先筛一遍，最后拍板的还是人。",
      },
      {
        label: "顶住过度承诺压力",
        text: "这个目标我可以做探索，但不建议写进本阶段验收——我不想用一个做不到的承诺，换今天的高兴。",
      },
    ],
    checklist: [
      "有书面的能力边界",
      "固定同步节奏",
      "坏消息即时披露",
      "成果用业务语言呈现",
      "维护「不做清单」",
    ],
    flags: [
      "为签约默认夸张承诺",
      "只报喜、不报忧",
      "用技术术语压客户",
      "阶段中途偷偷换目标",
    ],
    caseStudy: {
      tag: "真实小案例",
      title: "一次坏消息，换来续约",
      body: "客户高层期待「全自动决策、可裁撤岗位」。项目组首会即明确「辅助分诊、人工拍板」，每周用误派率曲线同步。一次数据质量问题当天通报并给出补救，信任不降反升，二期主动续约。",
      result: "透明同步 → 信任上升",
    },
  },
  {
    id: "handoff",
    idx: "06",
    title: "交付与交接",
    when: "项目结束了，客户团队却没人接得住",
    goal: "交付的不是一个模型，而是客户团队能独立运行、维护、判断异常的能力。",
    steps: [
      "立项即定义交接物：文档、运行手册、应急预案、再训练/评测方法、责任人。",
      "至少两次实操陪跑：让客户团队自己操作，你只在场、不代劳。",
      "固化可复用资产：连接器、提示模板、评测集、问题清单，沉淀回产品。",
      "约定交付后支持窗口与升级路径，再正式收尾。",
    ],
    scripts: [
      {
        label: "把验收变成客户的主场",
        text: "验收那天请你们团队独立跑一遍，我在旁边不插手——能跑通，才算交接成功。",
      },
      {
        label: "留下「一页纸」",
        text: "我会把怎么判断它不对劲、出问题先做什么写成一页纸，贴在值班室。",
      },
    ],
    checklist: [
      "交接物齐全",
      "客户独立实操通过",
      "有一页纸应急手册",
      "可复用资产已回流",
      "支持窗口与责任人明确",
    ],
    flags: [
      "只交一个链接或模型",
      "知识全留在你脑子里",
      "没有运维负责人",
      "交付完就失联",
    ],
    caseStudy: {
      tag: "真实小案例",
      title: "三个月后，客户自己更新了规则",
      body: "验收不只看指标，要求值班团队独立操作两轮、并完成一次模拟误报处置。交接含一页纸应急流程与评测集模板。三个月后客户自行完成一次规则更新，无需原厂介入。",
      result: "客户可独立运维 → 交接成功",
    },
  },
];

const BLOCK_TITLES = [
  { key: "A", title: "该怎么做" },
  { key: "B", title: "可直接照说的话术" },
  { key: "C", title: "离场前检查清单" },
  { key: "D", title: "要躲开的雷区" },
  { key: "E", title: "真实小案例" },
] as const;

type Notify = (message: string) => void;

function CopyButton({ text, notify }: { text: string; notify: Notify }) {
  const [copied, setCopied] = useState(false);

  const fallback = () => {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    document.body.removeChild(ta);
    return ok;
  };

  const handleCopy = async () => {
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        ok = true;
      } else {
        ok = fallback();
      }
    } catch {
      ok = fallback();
    }
    if (ok) {
      setCopied(true);
      notify("话术已复制，可直接粘贴");
      window.setTimeout(() => setCopied(false), 1500);
    } else {
      notify("复制失败，请手动选择");
    }
  };

  return (
    <button className="copy" onClick={handleCopy}>
      {copied ? <Check size={13} /> : <Copy size={13} />}
      {copied ? "已复制" : "复制这句话"}
    </button>
  );
}

function Checklist({ items, momentId }: { items: string[]; momentId: string }) {
  const [checked, setChecked] = useState<boolean[]>(() => items.map(() => false));

  useEffect(() => {
    setChecked(items.map(() => false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [momentId]);

  return (
    <ul className="checklist">
      {items.map((item, index) => (
        <li
          key={item}
          className={checked[index] ? "done" : ""}
          onClick={() =>
            setChecked((current) => current.map((v, i) => (i === index ? !v : v)))
          }
        >
          <input
            type="checkbox"
            checked={checked[index]}
            onChange={() =>
              setChecked((current) => current.map((v, i) => (i === index ? !v : v)))
            }
          />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function MomentView({ moment, onBack, notify }: { moment: Moment; onBack: () => void; notify: Notify }) {
  return (
    <>
      <div className="crumb">
        <button className="back" onClick={onBack}>
          <ArrowLeft size={14} /> 返回 6 个时刻
        </button>
      </div>
      <div className="m-head">
        <div className="m-index">时刻 {moment.idx}</div>
        <h1>{moment.title}</h1>
        <div className="goal">
          <b>这一时刻要达成的唯一结果：</b>{moment.goal}
        </div>

        <div className="block">
          <p className="block-title">
            <span className="n">{BLOCK_TITLES[0].key}</span>
            {BLOCK_TITLES[0].title}
          </p>
          <ol className="steps">
            {moment.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>

        <div className="block">
          <p className="block-title">
            <span className="n">{BLOCK_TITLES[1].key}</span>
            {BLOCK_TITLES[1].title}
          </p>
          {moment.scripts.map((line) => (
            <div className="script" key={line.label}>
              <p className="lab">{line.label}</p>
              <p>{line.text}</p>
              <div className="foot">
                <CopyButton text={line.text} notify={notify} />
              </div>
            </div>
          ))}
        </div>

        <div className="block">
          <p className="block-title">
            <span className="n">{BLOCK_TITLES[2].key}</span>
            {BLOCK_TITLES[2].title}
          </p>
          <Checklist items={moment.checklist} momentId={moment.id} />
        </div>

        <div className="block">
          <p className="block-title">
            <span className="n">{BLOCK_TITLES[3].key}</span>
            {BLOCK_TITLES[3].title}
          </p>
          <div className="flags">
            {moment.flags.map((flag) => (
              <div className="flag" key={flag}>
                <span className="x">
                  <X size={14} />
                </span>
                <span>{flag}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="block">
          <p className="block-title">
            <span className="n">{BLOCK_TITLES[4].key}</span>
            {BLOCK_TITLES[4].title}
          </p>
          <div className="case">
            <p className="ct">{moment.caseStudy.tag}</p>
            <h4>{moment.caseStudy.title}</h4>
            <p>{moment.caseStudy.body}</p>
            <span className="metric">
              <b>结果</b> {moment.caseStudy.result}
            </span>
          </div>
        </div>
      </div>
      <div className="m-foot">
        <button className="ghost-btn" onClick={onBack}>
          <ArrowLeft size={15} /> 选其它时刻
        </button>
      </div>
    </>
  );
}

function App() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  const notify = (message: string) => {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 1800);
  };

  const activeMoment = MOMENTS.find((m) => m.id === activeId) ?? null;

  const goHome = () => {
    setActiveId(null);
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  const openMoment = (id: string) => {
    setActiveId(id);
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && activeId) goHome();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeId]);

  return (
    <div className="app-shell">
      <div className="top">
        <div className="wrap">
          <button className="brand" onClick={goHome}>
            <span className="brand-mark">FDE</span>
            <span className="brand-name">
              <strong>现场作战工具包</strong>
              <small>FIELD KIT · v0.1</small>
            </span>
          </button>
        </div>
      </div>

      <main>
        {!activeMoment && (
          <section className="view show home-view">
            <div className="wrap">
              <div className="hero">
                <p className="eyebrow">Forward Deployed Engineer · 现场作战工具包</p>
                <h1>上客户现场前，先把这 6 个难关过一遍</h1>
                <p className="lede">
                  不是文章合集，也不是空社区。每个时刻给你<b>可直接照说的话术、可勾选的离场清单、可复制的模板</b>，外加一个带数字的真实小案例。目标只有一个：你这周就在项目里用掉其中一个。
                </p>
                <div className="usage">
                  <span>
                    <i className="dot" />
                    进入你当前所处的时刻
                  </span>
                  <span>
                    <i className="dot" />
                    照话术开场，避免被需求带跑
                  </span>
                  <span>
                    <i className="dot" />
                    用清单做离场前自检
                  </span>
                </div>
              </div>

              <div className="pick-title">
                <h2>你现在卡在哪一刻？</h2>
                <small>点进去就是对应打法</small>
              </div>
              <div className="grid">
                {MOMENTS.map((moment) => (
                  <button
                    key={moment.id}
                    className="moment-card"
                    onClick={() => openMoment(moment.id)}
                  >
                    <span className="idx">{moment.idx}</span>
                    <span className="moment-card-text">
                      <h3>{moment.title}</h3>
                      <p>{moment.when}</p>
                    </span>
                    <span className="go">›</span>
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        {activeMoment && (
          <section className="view show moment-view" key={activeMoment.id}>
            <div className="wrap">
              <MomentView moment={activeMoment} onBack={goHome} notify={notify} />
            </div>
          </section>
        )}
      </main>

      <footer className="site">
        <div className="wrap">FDE 现场作战工具包 · 面向被派到企业做 AI 交付的工程师。</div>
      </footer>

      <div className={`toast${toast ? " show" : ""}`}>{toast}</div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<DiagnosticApp />);
