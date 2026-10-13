import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Check,
  ChevronRight,
  Clock3,
  Code2,
  Copy,
  Gauge,
  History,
  KeyRound,
  Layers3,
  Play,
  Settings,
  ShieldCheck,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import "./styles.css";

const API = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
const PUBLIC_API_BASE = `${window.location.origin}${API}`;

const scenarios = {
  support: {
    label: "客服路由",
    state: "客户反馈同一张订单被重复扣款，已经联系过两次客服。订单记录显示两笔相同金额、间隔 12 秒的支付。",
    question: "下一步应该由哪个团队处理？",
    options: [
      ["billing", "处理扣款、发票和退款"],
      ["technical", "处理系统故障和服务异常"],
      ["support", "继续向客户收集信息"],
      ["escalation", "立即升级人工处理"],
    ],
  },
  coding: {
    label: "Coding Agent",
    state: "Agent 已定位 auth.py 中 token 过期校验条件写反，当前工作区干净，尚未修改代码。",
    question: "下一步最合适的动作是什么？",
    options: [
      ["search_code", "继续搜索相关代码"],
      ["edit_file", "修改已经定位的错误"],
      ["run_test", "运行现有测试"],
      ["ask_user", "向用户询问更多信息"],
    ],
  },
  moderation: {
    label: "内容审核",
    state: "视频包含明显的血腥事故画面，标题声称是真实现场，已有多名用户举报。",
    question: "下一步应该如何处理？",
    options: [
      ["allow", "允许内容继续分发"],
      ["limit", "降低内容推荐量"],
      ["review", "暂停分发并转人工审核"],
      ["remove", "立即删除内容"],
    ],
  },
};

function apiError(payload, fallback) {
  return payload?.error?.message || payload?.detail || fallback;
}

async function post(path, body) {
  const response = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(apiError(payload, "请求失败，请稍后重试"));
  return payload;
}

function getDistribution(answer) {
  if (!answer) return {};
  if (answer.type === "noul") return { false: 1 - answer.noul, true: answer.noul };
  return answer.probabilities || {};
}

function getWinner(answer) {
  if (!answer) return "—";
  if (answer.type === "choice") return answer.choice;
  if (answer.type === "noul") return answer.noul >= 0.5 ? "是" : "否";
  return `${Number(answer.score).toFixed(2)} 分`;
}

const decisionModes = [
  ["choice", "选一个", "Choice", "从候选方案中选择"],
  ["noul", "是 / 否", "Noul", "判断一件事是否成立"],
  ["score", "评分", "Score", "按自定义等级打分"],
  ["rank", "排序", "Rank", "给多个候选项排优先级"],
];

function Term({ children }) {
  return <code className="term-tag">{children}</code>;
}

function Logo() {
  return (
    <div className="brand">
      <span className="brand-symbol"><Sparkles size={18} /></span>
      <span>决策工作台</span>
    </div>
  );
}

function Shell({ page, setPage, clmOnline, children }) {
  const nav = [
    ["studio", "决策工作台", Sparkles],
    ["compare", "模型对比", Layers3],
    ["history", "历史记录", History],
    ["developers", "开发者 API", Code2],
  ];
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Logo />
        <nav className="side-nav">
          {nav.map(([id, label, NavIcon]) => (
            <button className={page === id ? "active" : ""} key={id} onClick={() => setPage(id)}>
              {React.createElement(NavIcon, { size: 18 })}<span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className={`service-state ${clmOnline ? "online" : ""}`}>
            <span className="status-dot" />
            <div><strong>CLM 服务</strong><small>{clmOnline ? "已连接 · GPU" : "正在检查"}</small></div>
          </div>
          <button className="settings-link" onClick={() => setPage("settings")}><Settings size={17} /> 设置</button>
        </div>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  );
}

function Header({ eyebrow, title, description, action }) {
  return (
    <header className="page-header">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </header>
  );
}

function ProviderPicker({ provider, setProvider, hasJevKey, onConfigure }) {
  return (
    <div className="provider-picker">
      <button className={provider === "clm" ? "selected" : ""} onClick={() => setProvider("clm")}>
        <span className="provider-icon clm">C</span>
        <span><strong>CLM</strong><small>默认可用 · 隐私部署</small></span>
        {provider === "clm" && <Check size={17} />}
      </button>
      <button
        className={provider === "jev" ? "selected" : ""}
        onClick={() => hasJevKey ? setProvider("jev") : onConfigure()}
      >
        <span className="provider-icon jev">J</span>
        <span><strong>Jev</strong><small>{hasJevKey ? "已连接" : "需要 API Key"}</small></span>
        {provider === "jev" ? <Check size={17} /> : !hasJevKey && <KeyRound size={16} />}
      </button>
    </div>
  );
}

function Builder({ form, setForm }) {
  const updateOption = (index, field, value) => {
    const options = form.options.map((option, i) => i === index ? { ...option, [field]: value } : option);
    setForm({ ...form, options });
  };
  const addOption = () => setForm({ ...form, options: [...form.options, { key: `option_${form.options.length + 1}`, description: "" }] });
  const removeOption = (index) => setForm({ ...form, options: form.options.filter((_, i) => i !== index) });
  return (
    <section className="builder-card">
      <div className="field-group">
        <div className="field-label"><span>01</span><div><strong>描述当前情况 <Term>state</Term></strong><small>模型做决定时所知道的全部信息</small></div></div>
        <textarea value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} rows={6} placeholder="例如：客户被重复扣款，已经联系过两次客服……" />
      </div>
      <div className="field-group">
        <div className="field-label"><span>02</span><div><strong>提出一个问题 <Term>instructions</Term></strong><small>问题越明确，结果越稳定</small></div></div>
        <input value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} placeholder="下一步应该怎么做？" />
      </div>
      <div className="field-group">
        <div className="field-label"><span>03</span><div><strong>设置候选答案 <Term>criteria</Term></strong><small>模型只会从这些选项中做决定</small></div></div>
        <div className="option-list">
          {form.options.map((option, index) => (
            <div className="option-row" key={index}>
              <input aria-label={`选项 ${index + 1} 标识`} value={option.key} onChange={(e) => updateOption(index, "key", e.target.value)} />
              <input aria-label={`选项 ${index + 1} 描述`} value={option.description} onChange={(e) => updateOption(index, "description", e.target.value)} placeholder="告诉模型这个选项代表什么" />
              <button aria-label="删除选项" disabled={form.options.length <= 2} onClick={() => removeOption(index)}><X size={16} /></button>
            </div>
          ))}
          <button className="add-option" onClick={addOption}>＋ 添加选项</button>
        </div>
      </div>
    </section>
  );
}

function MultiModeBuilder({ mode, form, setForm }) {
  const updateQuestion = (index, patch) => {
    const questions = form.questions.map((item, i) => i === index ? { ...item, ...patch } : item);
    setForm({ ...form, questions });
  };
  const updateCriterion = (questionIndex, criterionIndex, patch) => {
    const question = form.questions[questionIndex];
    const criteria = question.criteria.map((item, i) => i === criterionIndex ? { ...item, ...patch } : item);
    updateQuestion(questionIndex, { criteria });
  };
  const addCriterion = (questionIndex) => {
    const question = form.questions[questionIndex];
    updateQuestion(questionIndex, {
      criteria: [...question.criteria, { key: `option_${question.criteria.length + 1}`, description: "" }],
    });
  };
  const addQuestion = () => setForm({
    ...form,
    questions: [...form.questions, {
      id: `question_${form.questions.length + 1}`,
      instructions: "",
      criteria: mode === "noul"
        ? [{ key: "false", description: "否" }, { key: "true", description: "是" }]
        : [{ key: "low", description: "低" }, { key: "high", description: "高" }],
    }],
  });
  return (
    <section className="builder-card multi-builder">
      <div className="field-group">
        <div className="field-label"><span>01</span><div><strong>描述当前情况 <Term>state</Term></strong><small>所有问题共享这一份背景信息</small></div></div>
        <textarea value={form.state} onChange={(event) => setForm({ ...form, state: event.target.value })} rows={5} placeholder="写清事实、限制条件和已知信息……" />
      </div>
      {form.questions.map((question, questionIndex) => (
        <div className="field-group question-block" key={`${mode}-${questionIndex}`}>
          <div className="field-label">
            <span>{String(questionIndex + 2).padStart(2, "0")}</span>
            <div><strong>{form.questions.length > 1 ? `问题 ${questionIndex + 1}` : "提出问题"} <Term>instructions</Term></strong><small>可以一次让模型回答多个相关问题</small></div>
            {form.questions.length > 1 && <button className="text-action danger" onClick={() => setForm({ ...form, questions: form.questions.filter((_, index) => index !== questionIndex) })}>删除</button>}
          </div>
          <div className="question-heading">
            <label className="field-cell"><span>问题标识 <Term>question_id</Term></span><input className="question-id" aria-label="问题标识 question_id" value={question.id} onChange={(event) => updateQuestion(questionIndex, { id: event.target.value })} placeholder="decision" /></label>
            <label className="field-cell"><span>问题内容 <Term>instructions</Term></span><input value={question.instructions} onChange={(event) => updateQuestion(questionIndex, { instructions: event.target.value })} placeholder={mode === "noul" ? "例如：是否需要立即转人工？" : mode === "score" ? "例如：评估这次投诉的紧急程度" : "例如：下一步应该怎么做？"} /></label>
          </div>
          <div className="criteria-header">
            <span>答案标识 <Term>answer_key</Term></span>
            <span>答案说明 <Term>{mode === "score" ? "score_levels" : "criteria"}</Term></span>
          </div>
          <div className="option-list">
            {question.criteria.map((criterion, criterionIndex) => (
              <div className="option-row" key={criterionIndex}>
                <input aria-label="选项标识 answer_key" disabled={mode === "noul"} value={criterion.key} onChange={(event) => updateCriterion(questionIndex, criterionIndex, { key: event.target.value })} />
                <input aria-label="选项说明 answer_text" value={criterion.description} onChange={(event) => updateCriterion(questionIndex, criterionIndex, { description: event.target.value })} placeholder="这个答案代表什么 / answer_text" />
                <button aria-label="删除选项" disabled={mode === "noul" || question.criteria.length <= 2} onClick={() => updateQuestion(questionIndex, { criteria: question.criteria.filter((_, index) => index !== criterionIndex) })}><X size={16} /></button>
              </div>
            ))}
            {mode !== "noul" && <button className="add-option" onClick={() => addCriterion(questionIndex)}>＋ 添加{mode === "score" ? "等级" : "选项"}</button>}
          </div>
        </div>
      ))}
      <button className="add-question" onClick={addQuestion}>＋ 再问一个问题</button>
    </section>
  );
}

function RankBuilder({ form, setForm }) {
  const update = (index, value) => setForm({ ...form, answers: form.answers.map((item, i) => i === index ? value : item) });
  return (
    <section className="builder-card multi-builder">
      <div className="field-group">
        <div className="field-label"><span>01</span><div><strong>描述当前情况 <Term>context</Term></strong><small>模型排序时参考的背景信息</small></div></div>
        <textarea value={form.state} onChange={(event) => setForm({ ...form, state: event.target.value })} rows={5} />
      </div>
      <div className="field-group">
        <div className="field-label"><span>02</span><div><strong>说明排序目标 <Term>question</Term></strong><small>例如按优先级、匹配度或风险排序</small></div></div>
        <input value={form.question} onChange={(event) => setForm({ ...form, question: event.target.value })} placeholder="按处理优先级从高到低排序" />
      </div>
      <div className="field-group">
        <div className="field-label"><span>03</span><div><strong>输入候选项 <Term>answers</Term></strong><small>至少两项，结果会给出名次和概率</small></div></div>
        <div className="criteria-header rank-header">
          <span>序号 <Term>rank</Term></span>
          <span>候选项 <Term>candidate</Term></span>
        </div>
        <div className="option-list">
          {form.answers.map((answer, index) => <div className="option-row rank-option" key={index}><span>{index + 1}</span><input value={answer} onChange={(event) => update(index, event.target.value)} /><button disabled={form.answers.length <= 2} onClick={() => setForm({ ...form, answers: form.answers.filter((_, i) => i !== index) })}><X size={16} /></button></div>)}
          <button className="add-option" onClick={() => setForm({ ...form, answers: [...form.answers, ""] })}>＋ 添加候选项</button>
        </div>
      </div>
    </section>
  );
}

function ResultPanel({ result, loading, error, provider }) {
  if (loading) return <section className="result-card empty-result"><div className="loader" /><strong>正在做决定</strong><p>模型正在理解情况并比较所有候选答案</p></section>;
  if (error) return <section className="result-card empty-result error-result"><X size={32} /><strong>没有完成这次决策</strong><p>{error}</p></section>;
  if (!result) return <section className="result-card empty-result"><div className="decision-orbit"><span /></div><strong>结果会显示在这里</strong><p>填写左侧内容，运行你的第一个 AI 决策</p></section>;
  if (result.ranked) return (
    <section className="result-card">
      <div className="result-top"><div><span className="eyebrow">排序结果 · rank</span><h2>排序结果</h2></div><span className={`model-badge ${provider}`}>{provider.toUpperCase()}</span></div>
      <ol className="ranking-list">{result.ranked.map((row) => <li key={row.candidate}><span>{row.rank}</span><strong>{row.candidate}</strong><em>probability {(Number(row.prob ?? row.probability ?? 0) * 100).toFixed(1)}%</em></li>)}</ol>
    </section>
  );
  const answerEntries = Object.entries(result.answers || {});
  const answer = answerEntries[0]?.[1];
  const rows = Object.entries(getDistribution(answer)).sort((a, b) => b[1] - a[1]);
  return (
    <section className="result-card">
      <div className="result-top">
        <div><span className="eyebrow">决策结果 · answer</span><h2>{getWinner(answer)}</h2></div>
        <span className={`model-badge ${provider}`}>{provider.toUpperCase()}</span>
      </div>
      {answerEntries.map(([id, item]) => {
        const distributions = Object.entries(getDistribution(item)).sort((a, b) => b[1] - a[1]);
        return <div className="answer-section" key={id}>{answerEntries.length > 1 && <div className="answer-label"><span>{id}</span><strong>{getWinner(item)}</strong></div>}<div className="distribution-title">概率分布 <Term>probabilities</Term></div><div className="probability-list">{distributions.map(([label, value], index) => <div className="probability-row" key={label}><div><strong>{label}</strong><span>{(value * 100).toFixed(1)}%</span></div><div className="probability-track"><span className={index === 0 ? "winner" : ""} style={{ width: `${Math.max(1, value * 100)}%` }} /></div></div>)}</div></div>;
      })}
      <div className="result-meta">
        <div><Clock3 size={16} /><span>响应时间 <Term>latency</Term></span><strong>{Number(result.latency_ms || 0).toFixed(0)} ms</strong></div>
        <div><Gauge size={16} /><span>决策置信度 <Term>confidence</Term></span><strong>{rows.length ? `${(rows[0][1] * 100).toFixed(1)}%` : "—"}</strong></div>
      </div>
    </section>
  );
}

function DecisionStudio({ hasJevKey, jevKey, openKeyModal, saveHistory }) {
  const [provider, setProvider] = useState("clm");
  const [mode, setMode] = useState("choice");
  const [form, setForm] = useState({
    state: scenarios.support.state,
    questions: [{ id: "decision", instructions: scenarios.support.question, criteria: scenarios.support.options.map(([key, description]) => ({ key, description })) }],
    question: "按处理优先级从高到低排序",
    answers: ["退款团队处理", "技术团队排查", "升级人工客服"],
  });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const chooseMode = (nextMode) => {
    setMode(nextMode); setResult(null); setError("");
    if (nextMode === "noul") setForm({ ...form, questions: [{ id: "need_human", instructions: "是否需要立即升级人工处理？", criteria: [{ key: "false", description: "无需立即升级" }, { key: "true", description: "需要立即升级" }] }] });
    if (nextMode === "score") setForm({ ...form, questions: [{ id: "urgency", instructions: "评估这次投诉的紧急程度", criteria: [{ key: "low", description: "低" }, { key: "medium", description: "中" }, { key: "high", description: "高" }] }] });
    if (nextMode === "choice") setForm({ ...form, questions: [{ id: "decision", instructions: scenarios.support.question, criteria: scenarios.support.options.map(([key, description]) => ({ key, description })) }] });
  };
  const run = async () => {
    if (provider === "jev" && !hasJevKey) return openKeyModal();
    setLoading(true); setError("");
    try {
      let payload;
      if (mode === "rank") {
        payload = await post("/api/rank", { provider, context: form.state, question: form.question, answers: form.answers.filter((item) => item.trim()), jev_api_key: provider === "jev" ? jevKey : undefined });
      } else {
        const questions = Object.fromEntries(form.questions.map((question) => [question.id.trim(), {
          type: mode,
          instructions: question.instructions,
          criteria: mode === "score" ? question.criteria.map((item) => item.description.trim()) : Object.fromEntries(question.criteria.map((item) => [item.key.trim(), item.description.trim()])),
        }]));
        payload = await post("/api/decisions", { provider, state: form.state, questions, jev_api_key: provider === "jev" ? jevKey : undefined });
      }
      setResult(payload);
      const firstAnswer = Object.values(payload.answers || {})[0];
      saveHistory({ at: Date.now(), provider, state: form.state, question: mode === "rank" ? form.question : form.questions[0].instructions, result: mode === "rank" ? payload.ranked?.[0]?.candidate || "已排序" : getWinner(firstAnswer) });
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };
  return (
    <>
      <Header eyebrow="决策工作台" title="把复杂情况，变成清晰决定" description="选择一种决策方式。你可以选答案、做判断、打分、排序，也可以一次提交多个问题。" />
      <div className="studio-toolbar">
        <div className="mode-tabs">{decisionModes.map(([id, label, term, description]) => <button className={mode === id ? "active" : ""} key={id} onClick={() => chooseMode(id)}><strong>{label} <Term>{term}</Term></strong><span>{description}</span></button>)}</div>
        <ProviderPicker provider={provider} setProvider={setProvider} hasJevKey={hasJevKey} onConfigure={openKeyModal} />
      </div>
      <div className="run-bar">
        <div><ShieldCheck size={18} /><span>{provider === "clm" ? "由默认 CLM 私有服务处理" : "Jev Key 仅用于本次请求"}</span></div>
        <button className="primary-button" disabled={loading} onClick={run}><Play size={17} fill="currentColor" />运行决策</button>
      </div>
      <div className="studio-grid">
        {mode === "rank" ? <RankBuilder form={form} setForm={setForm} /> : <MultiModeBuilder mode={mode} form={form} setForm={setForm} />}
        <ResultPanel result={result} loading={loading} error={error} provider={provider} />
      </div>
    </>
  );
}

function ComparisonResult({ side, response }) {
  const ok = response?.ok;
  const result = ok ? response.data : null;
  const answer = result ? Object.values(result.answers)[0] : null;
  const rows = Object.entries(getDistribution(answer)).sort((a, b) => b[1] - a[1]);
  return (
    <section className={`compare-column ${side}`}>
      <div className="compare-model">
        <span className={`provider-icon ${side}`}>{side === "clm" ? "C" : "J"}</span>
        <div><h2>{side === "clm" ? "CLM" : "Jev"}</h2><p>{side === "clm" ? "开源 · 私有部署" : "商业 · 托管服务"}</p></div>
        {result && <strong>{Number(result.latency_ms || 0).toFixed(0)} ms</strong>}
      </div>
      {!response && <div className="compare-placeholder">等待同题对比</div>}
      {response && !ok && <div className="compare-placeholder error-result"><X size={26} /><span>{response.error}</span></div>}
      {result && (
        <>
          <div className="compare-answer"><small>最终选择</small><strong>{getWinner(answer)}</strong></div>
          <div className="probability-list compact">
            {rows.map(([label, value], index) => (
              <div className="probability-row" key={label}>
                <div><strong>{label}</strong><span>{(value * 100).toFixed(1)}%</span></div>
                <div className="probability-track"><span className={index === 0 ? "winner" : ""} style={{ width: `${Math.max(1, value * 100)}%` }} /></div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function ComparePage({ hasJevKey, jevKey, openKeyModal, saveHistory }) {
  const initial = scenarios.coding;
  const [form, setForm] = useState({ state: initial.state, question: initial.question, options: initial.options.map(([key, description]) => ({ key, description })) });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const run = async () => {
    if (!hasJevKey) return openKeyModal();
    setLoading(true); setError("");
    try {
      const criteria = Object.fromEntries(form.options.map((item) => [item.key.trim(), item.description.trim()]));
      const data = await post("/api/compare", {
        state: form.state, jev_api_key: jevKey,
        questions: { decision: { type: "choice", instructions: form.question, criteria } },
      });
      setResult(data);
      const clm = data.clm?.data?.answers?.decision;
      const jev = data.jev?.data?.answers?.decision;
      saveHistory({ at: Date.now(), provider: "对比", state: form.state, question: form.question, result: `${getWinner(clm)} / ${getWinner(jev)}` });
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };
  const agreement = useMemo(() => {
    const a = result?.clm?.data?.answers?.decision;
    const b = result?.jev?.data?.answers?.decision;
    if (!a || !b) return null;
    return getWinner(a) === getWinner(b);
  }, [result]);
  return (
    <>
      <Header eyebrow="模型对比" title="同一个问题，两种模型同时回答" description="使用完全相同的情况、问题和候选项，并排比较答案、概率分布和响应速度。" action={<button className="secondary-button" onClick={openKeyModal}><KeyRound size={16} />{hasJevKey ? "Jev 已连接" : "连接 Jev"}</button>} />
      <div className="compare-workspace">
        <div className="compare-builder">
          <Builder form={form} setForm={setForm} />
          <button className="primary-button compare-run" onClick={run} disabled={loading}><Zap size={17} fill="currentColor" />{loading ? "两种模型正在回答…" : "开始同题对比"}</button>
        </div>
        <div className="compare-output">
          {error && <div className="inline-error">{error}</div>}
          {agreement !== null && <div className={`agreement ${agreement ? "match" : "different"}`}>{agreement ? <Check size={18} /> : <Activity size={18} />}<strong>{agreement ? "两种模型选择一致" : "两种模型给出了不同选择"}</strong><span>{agreement ? "继续比较概率集中度和速度" : "这类样本值得加入人工评测集"}</span></div>}
          <div className="comparison-grid">
            <ComparisonResult side="clm" response={result?.clm} />
            <ComparisonResult side="jev" response={result?.jev} />
          </div>
          <div className="comparison-notes">
            <div><Zap size={18} /><strong>速度</strong><span>比较端到端响应时间，不把单次网络波动当结论。</span></div>
            <div><BarChart3 size={18} /><strong>概率</strong><span>更集中的分布不一定更正确，还需要真实答案验证。</span></div>
            <div><ShieldCheck size={18} /><strong>隐私</strong><span>CLM 留在私有服务；Jev 请求会发送到 TypeSafe。</span></div>
          </div>
        </div>
      </div>
    </>
  );
}

function HistoryPage({ history, clearHistory }) {
  return (
    <>
      <Header eyebrow="本地记录" title="你的决策记录" description="记录仅保存在当前浏览器，方便复盘和复用，不会上传到我们的数据库。" action={history.length > 0 && <button className="secondary-button danger" onClick={clearHistory}>清空记录</button>} />
      {history.length === 0 ? <div className="large-empty"><History size={38} /><h2>还没有决策记录</h2><p>运行一次决策或模型对比后，记录会出现在这里。</p></div> :
        <div className="history-list">{history.map((item) => <article key={item.at}><span className="history-provider">{item.provider}</span><div><strong>{item.question}</strong><p>{item.state}</p></div><div className="history-result"><small>结果</small><strong>{item.result}</strong><time>{new Date(item.at).toLocaleString()}</time></div></article>)}</div>}
    </>
  );
}

function DevelopersPage() {
  const sample = `curl -X POST ${PUBLIC_API_BASE}/api/decisions \\
  -H "Content-Type: application/json" \\
  -d '{
    "provider": "clm",
    "state": "客户被重复扣款",
    "questions": {
      "route": {
        "type": "choice",
        "instructions": "由哪个团队处理？",
        "criteria": {
          "billing": "扣款和退款",
          "technical": "系统故障"
        }
      }
    }
  }'`;
  const copy = () => navigator.clipboard.writeText(sample);
  return (
    <>
      <Header eyebrow="开发者接口" title="把决策能力接入你的产品" description="页面和 API 使用同一套结构。先在工作台调好问题，再复制请求到你的应用。" action={<a className="secondary-button" href={`${API}/docs`} target="_blank" rel="noreferrer">打开 OpenAPI <ArrowRight size={16} /></a>} />
      <div className="api-grid">
        <section className="api-card">
          <span className="method">POST</span><code>{API}/api/decisions</code>
          <h2>单模型决策</h2><p>使用默认 CLM，或在请求中携带用户自己的 Jev Key。</p>
          <ChevronRight size={18} />
        </section>
        <section className="api-card">
          <span className="method">POST</span><code>{API}/api/compare</code>
          <h2>双模型对比</h2><p>并行调用 CLM 与 Jev，单侧失败不会影响另一侧结果。</p>
          <ChevronRight size={18} />
        </section>
      </div>
      <section className="code-card">
        <div><span>快速开始</span><button onClick={copy}><Copy size={15} />复制</button></div>
        <pre><code>{sample}</code></pre>
      </section>
    </>
  );
}

function SettingsPage({ hasJevKey, openKeyModal, clearKey }) {
  return (
    <>
      <Header eyebrow="系统设置" title="连接与隐私" description="管理你的模型连接。默认 CLM 无需配置，Jev 使用你自己的 API Key。" />
      <div className="settings-grid">
        <section className="setting-card"><span className="provider-icon clm">C</span><div><h2>CLM</h2><p>由决策工作台默认提供，运行在私有 GPU 服务上。</p><span className="connected"><Check size={14} />已连接</span></div></section>
        <section className="setting-card"><span className="provider-icon jev">J</span><div><h2>Jev</h2><p>使用你从 TypeSafe 获取的 API Key。Key 只保存在当前浏览器会话。</p>{hasJevKey ? <div className="setting-actions"><span className="connected"><Check size={14} />已连接</span><button onClick={clearKey}>断开</button></div> : <button className="secondary-button" onClick={openKeyModal}><KeyRound size={16} />配置 API Key</button>}</div></section>
      </div>
      <section className="privacy-card"><ShieldCheck size={24} /><div><h2>你的数据如何流动</h2><p>使用 CLM 时，请求发送到产品配置的私有模型服务；使用 Jev 时，请求内容和临时 Key 会通过我们的无日志代理转发给 TypeSafe。我们不会持久化你的 Key。</p></div></section>
    </>
  );
}

function KeyModal({ open, onClose, onSave }) {
  const [value, setValue] = useState("");
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="key-modal" role="dialog" aria-modal="true" aria-labelledby="key-title" onMouseDown={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="关闭"><X size={18} /></button>
        <span className="modal-icon"><KeyRound size={22} /></span>
        <h2 id="key-title">连接你的 Jev</h2>
        <p>在 TypeSafe 控制台创建 API Key，然后粘贴到这里。我们只把它保存在当前浏览器会话，关闭标签页后自动清除。</p>
        <label>Jev API Key<input autoFocus type="password" value={value} onChange={(e) => setValue(e.target.value)} placeholder="jv_live_••••••••••••" /></label>
        <div className="modal-security"><ShieldCheck size={16} /><span>不会写入 URL、日志或数据库</span></div>
        <button className="primary-button full" disabled={value.length < 8} onClick={() => { onSave(value); setValue(""); }}>保存并连接</button>
        <a href="https://typesafe.ai/" target="_blank" rel="noreferrer">还没有 Key？前往 TypeSafe <ArrowRight size={14} /></a>
      </section>
    </div>
  );
}

function App() {
  const [page, setPage] = useState("studio");
  const [clmOnline, setClmOnline] = useState(false);
  const [jevKey, setJevKey] = useState(() => sessionStorage.getItem("decision-studio:jev-key") || "");
  const [keyModal, setKeyModal] = useState(false);
  const [history, setHistory] = useState(() => JSON.parse(localStorage.getItem("decision-studio:history") || "[]"));
  useEffect(() => { fetch(`${API}/api/health`).then((r) => r.json()).then((data) => setClmOnline(Boolean(data?.clm?.available))).catch(() => setClmOnline(false)); }, []);
  const saveKey = (key) => { sessionStorage.setItem("decision-studio:jev-key", key); setJevKey(key); setKeyModal(false); };
  const clearKey = () => { sessionStorage.removeItem("decision-studio:jev-key"); setJevKey(""); };
  const saveHistory = (entry) => {
    const next = [entry, ...history].slice(0, 50);
    setHistory(next); localStorage.setItem("decision-studio:history", JSON.stringify(next));
  };
  const clearHistory = () => { setHistory([]); localStorage.removeItem("decision-studio:history"); };
  let content;
  if (page === "compare") content = <ComparePage hasJevKey={Boolean(jevKey)} jevKey={jevKey} openKeyModal={() => setKeyModal(true)} saveHistory={saveHistory} />;
  else if (page === "history") content = <HistoryPage history={history} clearHistory={clearHistory} />;
  else if (page === "developers") content = <DevelopersPage />;
  else if (page === "settings") content = <SettingsPage hasJevKey={Boolean(jevKey)} openKeyModal={() => setKeyModal(true)} clearKey={clearKey} />;
  else content = <DecisionStudio hasJevKey={Boolean(jevKey)} jevKey={jevKey} openKeyModal={() => setKeyModal(true)} saveHistory={saveHistory} />;
  return (
    <Shell page={page} setPage={setPage} clmOnline={clmOnline}>
      {content}
      <KeyModal open={keyModal} onClose={() => setKeyModal(false)} onSave={saveKey} />
    </Shell>
  );
}

createRoot(document.getElementById("root")).render(<App />);
