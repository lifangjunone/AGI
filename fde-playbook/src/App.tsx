import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  CircleDollarSign,
  FileText,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import assessmentData from "../shared/assessment-data.json";

type View =
  | "intro"
  | "context"
  | "quiz"
  | "submitting"
  | "result"
  | "checkout"
  | "waiting"
  | "report";

type Risk = {
  id: string;
  name: string;
  score: number;
  diagnosis: string;
};

type ResultPreview = {
  overall: number;
  level: { key: string; label: string; summary: string };
  topRisks: Risk[];
  immediateAction: string;
};

type FullReport = {
  executiveSummary: string;
  dimensions: Array<{
    id: string;
    name: string;
    short: string;
    score: number;
    diagnosis: string;
    impact: string;
    action: string;
    script: string;
    evidence: string[];
  }>;
  priorities: Array<{
    rank: number;
    id: string;
    name: string;
    score: number;
    diagnosis: string;
    impact: string;
    action: string;
    script: string;
    evidence: string[];
  }>;
  sevenDayPlan: Array<{
    day: string;
    title: string;
    action: string;
    evidence: string[];
  }>;
  meetingScripts: Array<{ name: string; script: string }>;
};

type PaidReport = {
  orderId: string;
  projectName: string;
  generatedAt: string;
  score: number;
  level: ResultPreview["level"];
  report: FullReport;
};

const STAGES = ["需求澄清", "POC 验证", "准备上线", "验收交接"];

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || "请求失败，请稍后重试");
  }
  return data as T;
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand${compact ? " brand-compact" : ""}`}>
      <span className="brand-mark">FDE</span>
      <span className="brand-copy">
        <strong>项目交付诊断</strong>
        <small>DELIVERY RISK AUDIT</small>
      </span>
    </div>
  );
}

function StepHeader({
  step,
  total,
  label,
  onBack,
}: {
  step: number;
  total: number;
  label: string;
  onBack: () => void;
}) {
  return (
    <header className="flow-head">
      <button className="icon-button" onClick={onBack} aria-label="返回">
        <ArrowLeft size={18} />
      </button>
      <div className="flow-progress">
        <div className="flow-progress-copy">
          <span>{label}</span>
          <b>
            {String(step).padStart(2, "0")} / {String(total).padStart(2, "0")}
          </b>
        </div>
        <div className="progress-track">
          <i style={{ width: `${(step / total) * 100}%` }} />
        </div>
      </div>
    </header>
  );
}

function ScoreGauge({ score }: { score: number }) {
  return (
    <div
      className="score-gauge"
      style={{ "--score": `${score * 3.6}deg` } as React.CSSProperties}
      aria-label={`项目健康度 ${score} 分`}
    >
      <div>
        <strong>{score}</strong>
        <span>/ 100</span>
      </div>
    </div>
  );
}

export default function App() {
  const [view, setView] = useState<View>("intro");
  const [stage, setStage] = useState("");
  const [industry, setIndustry] = useState("");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [diagnosticId, setDiagnosticId] = useState("");
  const [preview, setPreview] = useState<ResultPreview | null>(null);
  const [projectName, setProjectName] = useState("");
  const [contact, setContact] = useState("");
  const [orderId, setOrderId] = useState("");
  const [report, setReport] = useState<PaidReport | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const paymentHost = useRef<HTMLDivElement>(null);

  const question = assessmentData.questions[questionIndex];
  const currentAnswer = question ? answers[question.id] : undefined;

  const answeredCount = Object.keys(answers).length;
  const contextReady = stage && industry.trim().length >= 2;
  const checkoutReady =
    projectName.trim().length >= 2 && contact.trim().length >= 3;

  const reset = () => {
    setView("intro");
    setStage("");
    setIndustry("");
    setQuestionIndex(0);
    setAnswers({});
    setDiagnosticId("");
    setPreview(null);
    setProjectName("");
    setContact("");
    setOrderId("");
    setReport(null);
    setError("");
    window.history.replaceState({}, "", "/");
  };

  const submitDiagnostic = async (nextAnswers: Record<string, number>) => {
    setView("submitting");
    setError("");
    try {
      const data = await api<{
        diagnosticId: string;
        preview: ResultPreview;
      }>("/api/diagnostics", {
        method: "POST",
        body: JSON.stringify({
          context: { stage, industry: industry.trim() },
          answers: nextAnswers,
        }),
      });
      setDiagnosticId(data.diagnosticId);
      setPreview(data.preview);
      setView("result");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "诊断生成失败");
      setView("quiz");
    }
  };

  const nextQuestion = () => {
    if (currentAnswer === undefined) return;
    if (questionIndex < assessmentData.questions.length - 1) {
      setQuestionIndex((value) => value + 1);
      return;
    }
    void submitDiagnostic(answers);
  };

  const startPayment = async () => {
    if (!checkoutReady || !diagnosticId) return;
    setBusy(true);
    setError("");
    try {
      const data = await api<{
        orderId: string;
        accessToken: string;
        paymentHtml: string;
      }>("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          diagnosticId,
          projectName: projectName.trim(),
          contact: contact.trim(),
        }),
      });
      localStorage.setItem(`fde-order:${data.orderId}`, data.accessToken);
      setOrderId(data.orderId);

      const host = paymentHost.current || document.createElement("div");
      host.innerHTML = data.paymentHtml;
      host.className = "payment-host";
      if (!paymentHost.current) document.body.appendChild(host);
      const form = host.querySelector("form");
      if (!form) throw new Error("支付表单生成失败");
      form.submit();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "创建支付失败");
      setBusy(false);
    }
  };

  const loadPaidReport = async (id: string) => {
    const token = localStorage.getItem(`fde-order:${id}`);
    if (!token) {
      setError("当前浏览器没有该订单的报告凭证");
      setView("waiting");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const status = await api<{
        status: string;
        reportReady: boolean;
      }>(`/api/orders/${encodeURIComponent(id)}/status?token=${encodeURIComponent(token)}`);
      if (!status.reportReady) {
        setOrderId(id);
        setView("waiting");
        return;
      }
      const paid = await api<PaidReport>(
        `/api/reports/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`,
      );
      setReport(paid);
      setView("report");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "订单确认失败");
      setView("waiting");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const returnedOrder = params.get("orderId");
    if (params.get("paymentReturn") === "missing") {
      setError("没有找到可确认的支付订单，请从风险结果页重新发起");
      setView("waiting");
      return;
    }
    if (params.get("paymentReturn") === "1" && returnedOrder) {
      setOrderId(returnedOrder);
      setView("waiting");
      void loadPaidReport(returnedOrder);
    }
  }, []);

  useEffect(() => {
    if (view !== "waiting" || !orderId) return;
    const timer = window.setInterval(() => void loadPaidReport(orderId), 4000);
    return () => window.clearInterval(timer);
  }, [view, orderId]);

  const sortedDimensions = useMemo(
    () =>
      report
        ? [...report.report.dimensions].sort((a, b) => a.score - b.score)
        : [],
    [report],
  );

  return (
    <div className={`product-shell view-${view}`}>
      <nav className="topbar">
        <button className="brand-button" onClick={reset} aria-label="返回首页">
          <Brand compact />
        </button>
        <div className="trust-line">
          <ShieldCheck size={15} />
          支付前可看风险结果
        </div>
      </nav>

      <main className="product-main">
        {view === "intro" && (
          <section className="screen intro-screen">
            <div className="intro-copy">
              <span className="signal">
                <span className="signal-dot" />
                AI 项目交付风险诊断
              </span>
              <h1>
                你的 AI 项目，
                <br />
                离失败还有多远？
              </h1>
              <p>
                用 12 个现场问题定位最可能卡住验收、上线和续约的环节。
                免费看到风险分布，完整报告给出 7 天整改动作。
              </p>
              <button className="primary-action" onClick={() => setView("context")}>
                开始免费诊断 <ArrowRight size={18} />
              </button>
              <div className="intro-proof">
                <span>
                  <b>3 分钟</b>
                  完成诊断
                </span>
                <span>
                  <b>6 维度</b>
                  定位风险
                </span>
                <span>
                  <b>¥199</b>
                  完整报告
                </span>
              </div>
            </div>

            <div className="audit-preview" aria-label="诊断报告预览">
              <div className="audit-preview-head">
                <span>交付健康度</span>
                <b>DEMO</b>
              </div>
              <div className="preview-score">
                <strong>42</strong>
                <span>高风险</span>
              </div>
              <div className="risk-lines">
                <div>
                  <span>验收标准</span>
                  <i>
                    <b style={{ width: "28%" }} />
                  </i>
                  <em>28</em>
                </div>
                <div>
                  <span>生产就绪</span>
                  <i>
                    <b style={{ width: "41%" }} />
                  </i>
                  <em>41</em>
                </div>
                <div>
                  <span>数据合规</span>
                  <i>
                    <b style={{ width: "58%" }} />
                  </i>
                  <em>58</em>
                </div>
              </div>
              <div className="preview-note">
                <AlertTriangle size={16} />
                最大风险不是模型，而是项目没有可被否证的验收线。
              </div>
            </div>
          </section>
        )}

        {view === "context" && (
          <section className="screen compact-screen">
            <StepHeader step={1} total={14} label="项目背景" onBack={() => setView("intro")} />
            <div className="question-stage">
              <p className="question-kicker">先确定诊断坐标</p>
              <h2>你的项目现在走到哪一步？</h2>
              <div className="stage-grid">
                {STAGES.map((item) => (
                  <button
                    key={item}
                    className={stage === item ? "selected" : ""}
                    onClick={() => setStage(item)}
                  >
                    {stage === item && <Check size={16} />}
                    {item}
                  </button>
                ))}
              </div>
              <label className="field">
                <span>项目所在行业</span>
                <input
                  value={industry}
                  onChange={(event) => setIndustry(event.target.value)}
                  placeholder="例如：制造、金融、零售"
                  maxLength={60}
                />
              </label>
            </div>
            <div className="flow-actions">
              <button
                className="primary-action"
                disabled={!contextReady}
                onClick={() => {
                  setQuestionIndex(0);
                  setView("quiz");
                }}
              >
                进入风险测试 <ArrowRight size={18} />
              </button>
            </div>
          </section>
        )}

        {view === "quiz" && question && (
          <section className="screen compact-screen quiz-screen" key={question.id}>
            <StepHeader
              step={questionIndex + 2}
              total={assessmentData.questions.length + 2}
              label={question.scenario}
              onBack={() => {
                if (questionIndex === 0) setView("context");
                else setQuestionIndex((value) => value - 1);
              }}
            />
            <div className="question-stage">
              <p className="question-kicker">
                {assessmentData.dimensions.find(
                  (dimension) => dimension.id === question.dimension,
                )?.name}
              </p>
              <h2>{question.question}</h2>
              <p className="question-why">{question.why}</p>
              <div className="option-list">
                {question.options.map((option) => (
                  <button
                    key={option.score}
                    className={currentAnswer === option.score ? "selected" : ""}
                    onClick={() =>
                      setAnswers((current) => ({
                        ...current,
                        [question.id]: option.score,
                      }))
                    }
                  >
                    <i>{currentAnswer === option.score ? <Check size={15} /> : null}</i>
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="flow-actions">
              <span>{answeredCount} 项已回答</span>
              <button
                className="primary-action"
                disabled={currentAnswer === undefined}
                onClick={nextQuestion}
              >
                {questionIndex === assessmentData.questions.length - 1
                  ? "生成风险结果"
                  : "下一题"}
                <ArrowRight size={18} />
              </button>
            </div>
          </section>
        )}

        {view === "submitting" && (
          <section className="screen status-screen">
            <LoaderCircle className="spin" size={30} />
            <h2>正在计算交付风险</h2>
            <p>正在比较 6 个维度，并找出最先应该处理的项目障碍。</p>
          </section>
        )}

        {view === "result" && preview && (
          <section className="screen result-screen">
            <header className="result-head">
              <div>
                <p className="question-kicker">免费诊断结果 · {industry} / {stage}</p>
                <h2>{preview.level.label}</h2>
                <p>{preview.level.summary}</p>
              </div>
              <ScoreGauge score={preview.overall} />
            </header>

            <div className="result-grid">
              <section className="risk-panel">
                <div className="panel-title">
                  <span>优先处理的 3 个风险</span>
                  <b>按影响排序</b>
                </div>
                {preview.topRisks.map((risk, index) => (
                  <div className="risk-row" key={risk.id}>
                    <span className="risk-rank">0{index + 1}</span>
                    <div>
                      <strong>{risk.name}</strong>
                      <p>{risk.diagnosis}</p>
                    </div>
                    <em>{risk.score}</em>
                  </div>
                ))}
                <div className="immediate-action">
                  <Sparkles size={17} />
                  <div>
                    <span>今天先做</span>
                    <p>{preview.immediateAction}</p>
                  </div>
                </div>
              </section>

              <aside className="unlock-panel">
                <div className="lock-badge">
                  <LockKeyhole size={16} /> 完整诊断已生成
                </div>
                <h3>别只知道哪里有风险，还要知道下一步怎么改。</h3>
                <ul>
                  <li><CheckCircle2 size={16} />6 维风险逐项解释</li>
                  <li><CheckCircle2 size={16} />7 天整改行动计划</li>
                  <li><CheckCircle2 size={16} />客户会议可直接照说的话术</li>
                  <li><CheckCircle2 size={16} />验收所需证据清单</li>
                </ul>
                <div className="price-line">
                  <span>一次性解锁</span>
                  <strong>¥199</strong>
                </div>
                <button className="pay-action" onClick={() => setView("checkout")}>
                  获取完整诊断报告 <ArrowRight size={18} />
                </button>
                <small>支付宝支付 · 支付后当前浏览器立即解锁</small>
              </aside>
            </div>
          </section>
        )}

        {view === "checkout" && (
          <section className="screen compact-screen checkout-screen">
            <StepHeader step={1} total={1} label="确认报告归属" onBack={() => setView("result")} />
            <div className="checkout-layout">
              <div className="checkout-form">
                <p className="question-kicker">最后一步</p>
                <h2>完整诊断报告</h2>
                <p className="checkout-lede">
                  填写报告归属信息。支付成功后，当前浏览器立即解锁。
                </p>
                <label className="field">
                  <span>项目名称</span>
                  <input
                    value={projectName}
                    onChange={(event) => setProjectName(event.target.value)}
                    placeholder="例如：智能客服一期"
                    maxLength={80}
                  />
                </label>
                <label className="field">
                  <span>联系方式</span>
                  <input
                    value={contact}
                    onChange={(event) => setContact(event.target.value)}
                    placeholder="微信 / 手机 / 邮箱"
                    maxLength={100}
                  />
                </label>
                {error && <p className="form-error">{error}</p>}
              </div>

              <aside className="order-summary">
                <div className="order-icon"><FileText size={22} /></div>
                <h3>AI 项目交付风险完整诊断</h3>
                <p>包含 6 维分析、3 项优先整改、7 天计划与会议话术。</p>
                <div className="order-total">
                  <span>应付</span>
                  <strong>¥199.00</strong>
                </div>
                <button
                  className="pay-action"
                  disabled={!checkoutReady || busy}
                  onClick={() => void startPayment()}
                >
                  {busy ? <LoaderCircle className="spin" size={18} /> : <CircleDollarSign size={18} />}
                  {busy ? "正在创建订单" : "支付宝支付"}
                </button>
                <small><ShieldCheck size={13} />由支付宝完成安全收款</small>
              </aside>
            </div>
            <div ref={paymentHost} aria-hidden="true" />
          </section>
        )}

        {view === "waiting" && (
          <section className="screen status-screen">
            <LoaderCircle className="spin" size={30} />
            <h2>正在确认支付结果</h2>
            <p>不会依据浏览器回跳直接判定成功，正在向支付宝查询订单状态。</p>
            {error && <p className="form-error">{error}</p>}
            <button
              className="secondary-action"
              disabled={busy}
              onClick={() => void loadPaidReport(orderId)}
            >
              <RefreshCw size={16} /> 重新查询
            </button>
          </section>
        )}

        {view === "report" && report && (
          <section className="report-screen">
            <header className="report-toolbar">
              <div>
                <span>付费诊断报告</span>
                <strong>{report.projectName}</strong>
              </div>
              <button className="secondary-action" onClick={() => window.print()}>
                <FileText size={16} /> 打印 / 保存 PDF
              </button>
            </header>

            <article className="report-document">
              <div className="report-cover">
                <div>
                  <p className="question-kicker">FDE DELIVERY RISK AUDIT</p>
                  <h1>{report.projectName}</h1>
                  <p>{report.report.executiveSummary}</p>
                </div>
                <ScoreGauge score={report.score} />
              </div>

              <section className="report-section">
                <div className="report-section-head">
                  <span>01</span>
                  <h2>六维风险地图</h2>
                </div>
                <div className="dimension-table">
                  {sortedDimensions.map((dimension) => (
                    <div key={dimension.id}>
                      <span>{dimension.name}</span>
                      <i><b style={{ width: `${dimension.score}%` }} /></i>
                      <strong>{dimension.score}</strong>
                    </div>
                  ))}
                </div>
              </section>

              <section className="report-section">
                <div className="report-section-head">
                  <span>02</span>
                  <h2>前三项整改优先级</h2>
                </div>
                <div className="priority-list">
                  {report.report.priorities.map((priority) => (
                    <div className="priority-card" key={priority.id}>
                      <div className="priority-number">0{priority.rank}</div>
                      <div>
                        <div className="priority-title">
                          <h3>{priority.name}</h3>
                          <span>{priority.score} 分</span>
                        </div>
                        <p><b>问题：</b>{priority.diagnosis}</p>
                        <p><b>影响：</b>{priority.impact}</p>
                        <p className="action-copy"><b>整改动作：</b>{priority.action}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="report-section">
                <div className="report-section-head">
                  <span>03</span>
                  <h2>7 天整改计划</h2>
                </div>
                <div className="plan-grid">
                  {report.report.sevenDayPlan.map((item) => (
                    <div key={item.day}>
                      <CalendarDays size={18} />
                      <span>{item.day}</span>
                      <h3>{item.title}</h3>
                      <p>{item.action}</p>
                      <ul>
                        {item.evidence.map((evidence) => <li key={evidence}>{evidence}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>

              <section className="report-section">
                <div className="report-section-head">
                  <span>04</span>
                  <h2>下次客户会议直接照说</h2>
                </div>
                <div className="script-list">
                  {report.report.meetingScripts.map((script) => (
                    <blockquote key={script.name}>
                      <span>{script.name}</span>
                      “{script.script}”
                    </blockquote>
                  ))}
                </div>
              </section>

              <div className="consulting-upsell">
                <div>
                  <span>需要专家一起拆项目？</span>
                  <h3>60 分钟项目复盘 · ¥1,999</h3>
                  <p>基于本报告校准范围、验收指标和下一周行动。</p>
                </div>
                <a href={`mailto:contact@fde.local?subject=${encodeURIComponent(`${report.projectName} 项目复盘`)}`}>
                  预约复盘 <ArrowRight size={17} />
                </a>
              </div>
            </article>
          </section>
        )}
      </main>

      {error && !["checkout", "waiting"].includes(view) && (
        <div className="toast-error">{error}</div>
      )}
    </div>
  );
}
