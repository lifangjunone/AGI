import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { tr } from "./i18n";

export function OrganizationReception({ id, name, locale }: { id: string; name: string; locale: "zh-CN" | "en" }) {
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const query = useQuery({
    queryKey: ["organization-reception", id], retry: false,
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/v1/organizations/${id}/reception`, { credentials: "include", signal });
      if (!response.ok) throw new Error("unavailable");
      return await response.json() as { mode: "human" | "agent" };
    }
  });
  async function save(mode: "human" | "agent") {
    if (busy) return;
    setBusy(true); setError(""); setFeedback("");
    try {
      const response = await fetch(`/api/v1/organizations/${id}/reception`, {
        method: "PUT", credentials: "include", headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode, ...(mode === "agent" ? { confirmation: "authorize-new-customer-reception" } : {}) })
      });
      if (!response.ok) throw new Error("save_failed");
      const saved = await response.json() as { mode: "human" | "agent" };
      if (saved.mode !== mode) throw new Error("save_failed");
      setConfirm(false);
      queryClient.setQueryData(["organization-reception", id], saved);
      setFeedback(tr(locale, "已保存，只影响后续新咨询。", "Saved. Applies only to future inquiries."));
    } catch { setError(tr(locale, "保存未完成，请重试。", "Could not save. Please retry.")); }
    finally { setBusy(false); }
  }
  return <details className="customer-internal-tools">
    <summary>{tr(locale, "新咨询默认接待", "Default reception for new inquiries")} · {name}</summary>
    <p>{tr(locale, "只影响新咨询，不改变现有会话。执行服务关闭或离线时新咨询进入人工收件箱；已排队任务可能等待服务恢复。执行时还会检查权限、知识、模型与额度，不满足时转人工。", "Only affects new inquiries, not existing conversations. New inquiries go to the human inbox when execution is disabled or offline; queued tasks may wait for recovery. Execution rechecks permission, knowledge, model and quota, handing off if requirements fail.")}</p>
    {query.isPending && <p role="status">{tr(locale, "读取中…", "Loading…")}</p>}
    {query.isError && <p role="alert">{tr(locale, "设置读取失败", "Settings unavailable")}<button onClick={() => void query.refetch()}>{tr(locale, "重试", "Retry")}</button></p>}
    {query.data && <p>{tr(locale, "当前默认：", "Current default: ")}{query.data.mode === "agent" ? "Agent" : tr(locale, "人工", "Human")}</p>}
    {query.data?.mode === "human" && !confirm && <button disabled={busy} onClick={() => setConfirm(true)}>{tr(locale, "改为 Agent 接待", "Use Agent reception")}</button>}
    {confirm && <div>
      <p>{tr(locale, "确认授权此企业的新客户咨询自动回复？真实模型调用计入负责人额度，可随时关闭。", "Authorize automatic replies to new customer inquiries? Real calls consume the owner's quota. You can disable this anytime.")}</p>
      <button disabled={busy} onClick={() => setConfirm(false)}>{tr(locale, "取消", "Cancel")}</button>
      <button disabled={busy} onClick={() => void save("agent")}>{tr(locale, "确认授权新咨询", "Confirm new-inquiry authorization")}</button>
    </div>}
    {query.data?.mode === "agent" && <button disabled={busy} onClick={() => void save("human")}>{tr(locale, "新咨询改为人工", "Use human reception for new inquiries")}</button>}
    {error && <p role="alert">{error}</p>}
    {feedback && <p role="status">{feedback}</p>}
  </details>;
}
