import { useEffect, useId, useRef, useState } from "react";
import { tr } from "./i18n";

type Result = { status: "needs_human"; reason: string } | {
  status: "draft"; answer: string; confidence: number; runId: string;
  citations: Array<{ documentId: string; title: string; quote: string; revision: string }>;
  model: { provider: string; model: string };
  scope: { documentsConsidered: number; maxDocuments: number; maxCharactersPerDocument: number };
};
export function KnowledgeAnswerTest({ organizationId, locale, sourceGeneration = 0 }: {
  organizationId: string; locale: "zh-CN" | "en"; sourceGeneration?: number;
}) {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const request = useRef<AbortController | null>(null);
  const field = useId();
  useEffect(() => () => request.current?.abort(), []);
  const generation = useRef(sourceGeneration);
  useEffect(() => {
    if (generation.current === sourceGeneration) return;
    generation.current = sourceGeneration;
    request.current?.abort();
    setBusy(false); setResult(null);
    setError(tr(locale, "知识库已更新，旧测试结果已撤下。问题已保留，请重新测试。",
      "Knowledge was updated; the previous test result was removed. Your question is retained. Run a new test."));
  }, [sourceGeneration, locale]);
  useEffect(() => {
    if (result?.status !== "draft") return;
    const citations = result.citations.map(citation => ({
      documentId: citation.documentId, revision: citation.revision
    }));
    const controller = new AbortController();
    let checking = false;
    async function check() {
      if (checking || controller.signal.aborted) return;
      checking = true;
      try {
        const response = await fetch(`/api/v1/organizations/${organizationId}/knowledge-source-check`, {
          credentials: "include", method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ sources: citations }),
          signal: controller.signal
        });
        if (!response.ok) throw new Error("check_unavailable");
        const body = await response.json() as { valid: boolean };
        if (!controller.signal.aborted && !body.valid) {
          setResult(null);
          setError(tr(locale, "引用来源已修改、停用或删除，旧草稿已撤下。请重新测试。",
            "A cited source changed, was disabled or deleted. The old draft was removed. Run a new test."));
        }
      } catch {
        if (!controller.signal.aborted) {
          setResult(null);
          setError(tr(locale, "无法确认引用来源仍然有效，草稿已撤下。请恢复连接后重新测试。",
            "Source validity could not be confirmed. The draft was removed. Restore the connection and run a new test."));
        }
      } finally { checking = false; }
    }
    void check();
    const timer = window.setInterval(() => void check(), 15000);
    window.addEventListener("focus", check);
    return () => { controller.abort(); window.clearInterval(timer); window.removeEventListener("focus", check); };
  }, [result, organizationId, locale]);
  async function test() {
    if (!question.trim() || busy) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true); setError(""); setResult(null);
    try {
      const response = await fetch(`/api/v1/organizations/${organizationId}/knowledge-test`, {
        credentials: "include", method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: question.trim(), locale }), signal: controller.signal
      });
      if (!response.ok) throw new Error("test_failed");
      const body = await response.json() as Result;
      if (!controller.signal.aborted) setResult(body);
    } catch {
      if (!controller.signal.aborted) setError(tr(locale,
        "测试未完成。请检查模型配置与连接后重试，问题已保留。已发出的模型请求可能消耗额度。",
        "Test could not complete. Check model settings and connection, then retry. Your question is retained. Submitted model requests may consume quota."));
    } finally { if (!controller.signal.aborted) setBusy(false); }
  }
  const reasons: Record<string, string> = {
    no_sources: tr(locale, "没有启用的知识文档，请先添加并启用来源。", "No active source documents. Add and enable a source first."),
    high_risk: tr(locale, "问题涉及高风险事项，请由真人处理。", "This question involves a high-risk matter and needs a person."),
    quota_unavailable: tr(locale, "调用额度不足或不可用，请检查套餐与用量。", "Model quota is exhausted or unavailable. Check plan and usage."),
    model_unavailable: tr(locale, "模型调用未完成，请检查模型配置。", "Model request could not complete. Check model configuration."),
    invalid_output: tr(locale, "模型输出或引用未通过校验，未展示回答。", "Model output or citations failed validation. The answer was withheld."),
    human_review: tr(locale, "回答需要真人判断或置信度不足，未展示回答。", "The answer needs human review or has low confidence; it was withheld."),
    sources_changed: tr(locale, "生成期间来源被修改或停用，请核对来源后重新测试。", "A source changed or was disabled during generation. Review sources and test again.")
  };
  return <details className="knowledge-answer-test">
    <summary>{tr(locale, "测试知识回答", "Test knowledge answers")}</summary>
    <p>{tr(locale,
      "仅管理员内部测试，不发送给客户。使用已保存、启用的文档；真实模型尝试会计入回复额度。",
      "Internal administrator test only; not sent to customers. Uses saved, active documents. Real model attempts count toward reply quota.")}</p>
    <form onSubmit={event => { event.preventDefault(); void test(); }} aria-busy={busy}>
      <label htmlFor={field}>{tr(locale, "测试问题", "Test question")}</label>
      <textarea id={field} value={question} maxLength={2000} disabled={busy}
        onChange={event => { setQuestion(event.target.value); setResult(null); setError(""); }} />
      <button disabled={busy || !question.trim()} type="submit">
        {tr(locale, busy ? "模型正在回答…" : "开始测试", busy ? "Model is answering…" : "Run test")}
      </button>
    </form>
    {busy && <p role="status">{tr(locale, "正在调用模型并核对引用，请稍候。", "Calling the model and checking citations. Please wait.")}</p>}
    {error && <p role="alert">{error}</p>}
    {result?.status === "needs_human" && <p role="status">{reasons[result.reason] ?? tr(locale, "未生成可用草稿，请人工核对。", "No usable draft. Review manually.")}</p>}
    {result?.status === "draft" && <article className="knowledge-answer-result">
      <h3>{tr(locale, "内部测试草稿 · 未发送", "Internal test draft · Not sent")}</h3>
      <p>{result.answer}</p>
      <small>{result.model.provider} / {result.model.model} · {tr(locale,
        `参考 ${result.scope.documentsConsidered} 篇，每篇最多 ${result.scope.maxCharactersPerDocument} 字符`,
        `${result.scope.documentsConsidered} sources considered, up to ${result.scope.maxCharactersPerDocument} characters each`)}</small>
      <p>{tr(locale, "模型自评置信度与引用存在不代表所有事实已验证，请逐条核对。", "Model confidence and valid quotes do not verify every claim. Review each claim.")}</p>
      <h4>{tr(locale, "引用来源", "Source citations")}</h4>
      {result.citations.map((citation, index) => <blockquote key={`${citation.documentId}-${index}`}>
        <b>{citation.title}</b><p>{citation.quote}</p>
        <small>{tr(locale, "来源版本", "Source revision")}: {citation.revision}</small>
      </blockquote>)}
    </article>}
  </details>;
}
