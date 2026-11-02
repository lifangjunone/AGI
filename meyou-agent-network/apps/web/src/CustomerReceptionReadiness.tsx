import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { tr } from "./i18n";

type Checks = "customerChannel" | "threadOpen" | "businessPermission" | "activeKnowledge" | "modelConfigured" | "quotaAvailable" | "executionEnabled";
export function CustomerReceptionReadiness({ id, locale }: { id: string; locale: "zh-CN" | "en" }) {
  const client = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [failed, setFailed] = useState(false);
  const query = useQuery({
    queryKey: ["customer-reception-readiness", id],
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/v1/customers/${id}/reception-readiness`, { credentials: "include", signal });
      if (!response.ok) throw new Error("readiness_unavailable");
      const data = await response.json() as { ready: boolean; checks: Record<Checks, boolean> };
      if (!data.checks) throw new Error("readiness_unavailable");
      return data;
    }, staleTime: 0, retry: false
  });
  const labels: Record<Checks, string> = {
    customerChannel: tr(locale, "客户已登录，有独立回复渠道", "Customer has an authenticated reply channel"),
    threadOpen: tr(locale, "会话尚未解决", "Conversation is open"),
    businessPermission: tr(locale, "我的 Agent 已允许企业自动回复", "My Agent permits automatic business replies"),
    activeKnowledge: tr(locale, "企业有启用的知识文档", "Organization has active knowledge documents"),
    modelConfigured: tr(locale, "服务端模型已配置且开启", "Server model is configured and enabled"),
    quotaAvailable: tr(locale, "负责人回复额度充足", "Owner has available reply quota"),
    executionEnabled: tr(locale, "自动接待执行服务已开放", "Automatic reception execution is enabled")
  };
  async function enable() {
    if (saving) return;
    setSaving(true); setFeedback(""); setFailed(false);
    try {
      const response = await fetch(`/api/v1/customers/${id}`, {
        credentials: "include", method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "resume_agent" })
      });
      if (!response.ok) throw new Error("not_ready");
      setConfirm(false);
      setFeedback(tr(locale, "此会话已授权 Agent 接待。可随时接管；授权不代表已经回复。", "Agent reception authorized for this conversation. You can take over at any time; authorization is not a delivered reply."));
      await Promise.all([
        client.invalidateQueries({ queryKey: ["customer", id] }),
        client.invalidateQueries({ queryKey: ["customer-chat", "owner", id] }),
        query.refetch()
      ]);
    } catch {
      setFailed(true);
      setFeedback(tr(locale, "授权未完成，请重新检查条件后重试。", "Authorization did not complete. Check requirements and retry."));
      await query.refetch();
    } finally { setSaving(false); }
  }
  return <details className="customer-internal-tools">
    <summary>{tr(locale, "Agent 接待条件", "Agent reception requirements")}</summary>
    <p>{tr(locale, "所有条件满足后才能授权接待。此检查不会修改权限、配置或调用模型。", "All checks must pass before reception can be authorized. This check does not change permissions or call the model.")}</p>
    {query.isPending && <p role="status">{tr(locale, "正在检查…", "Checking…")}</p>}
    {query.isError && <p role="alert">{tr(locale, "条件读取失败，请重试。", "Could not load requirements. Please retry.")}</p>}
    {query.data && <ul className="customer-readiness-list">{(Object.keys(labels) as Checks[]).map(key =>
      <li key={key}><span>{labels[key]}</span><b>{query.data.checks[key] ? tr(locale, "已满足", "Ready") : tr(locale, "未满足", "Not ready")}</b></li>
    )}</ul>}
    <button disabled={query.isFetching} onClick={() => void query.refetch()}>{tr(locale, "重新检查", "Check again")}</button>
    {query.data?.ready && !confirm && <button disabled={saving} onClick={() => { setConfirm(true); setFeedback(""); }}>
      {tr(locale, "授权此会话 Agent 接待", "Authorize Agent reception")}
    </button>}
    {confirm && <section aria-label={tr(locale, "确认接待授权", "Confirm reception authorization")}>
      <p>{tr(locale, "Agent 将处理最新未回答咨询及后续消息，真实模型调用计入回复额度。高风险或无可靠来源会转真人；你可随时接管。", "The Agent will handle the latest unanswered inquiry and future messages. Real model calls consume reply quota. High-risk or unsupported answers go to a person; you can take over anytime.")}</p>
      <button disabled={saving} onClick={() => setConfirm(false)}>{tr(locale, "取消", "Cancel")}</button>
      <button disabled={saving || !query.data?.ready} onClick={() => void enable()}>
        {tr(locale, saving ? "授权中…" : "确认授权", saving ? "Authorizing…" : "Confirm authorization")}
      </button>
    </section>}
    {feedback && <p role={failed ? "alert" : "status"}>{feedback}</p>}
  </details>;
}
