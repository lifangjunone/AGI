import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { tr } from "./i18n";
import { CustomerChat } from "./CustomerChat";
import { CustomerReceptionReadiness } from "./CustomerReceptionReadiness";

interface CustomerThread {
  id: string; organizationName: string; customerName: string; subject: string;
  status: string; priority: string; assigneeName: string | null; internalNotes: string[]; updatedAt: string;
  agentMode?: string; agentRevision?: number;
  agentTasks?: Array<{ id: string; state: string; outcome?: string; authorityRevision: number; updatedAt: string }>;
}
export function CustomerThreadDetail({ id, locale }: { id: string; locale: "zh-CN" | "en" }) {
  const client = useQueryClient();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const thread = useQuery({
    queryKey: ["customer", id],
    refetchInterval: 5000,
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/v1/customers/${id}`, { credentials: "include", signal });
      if (!response.ok) throw new Error("customer_unavailable");
      return (await response.json() as { thread: CustomerThread }).thread;
    }
  });
  async function update(body: { action?: string; note?: string; priority?: string }) {
    if (busy) return;
    setBusy(true); setFeedback("");
    try {
      const response = await fetch(`/api/v1/customers/${id}`, {
        credentials: "include", method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!response.ok) throw new Error("update_failed");
      if (body.note) setNote("");
      await Promise.all([
        client.invalidateQueries({ queryKey: ["customer", id] }),
        client.invalidateQueries({ queryKey: ["customer-chat", "owner", id] }),
        client.invalidateQueries({ queryKey: ["dashboard"] })
      ]);
      setFeedback(tr(locale, "已保存", "Saved"));
    } catch {
      setFeedback(tr(locale, "保存失败，内容已保留，请重试。", "Could not save. Your input is retained; please retry."));
    } finally { setBusy(false); }
  }
  if (thread.isPending) return <p role="status">{tr(locale, "正在读取客户线程…", "Loading customer thread…")}</p>;
  if (thread.isError) return <div role="alert"><p>{tr(locale, "无法读取线程，可能无访问权限。", "Thread unavailable or access denied.")}</p>
    <button onClick={() => void thread.refetch()}>{tr(locale, "重试", "Retry")}</button></div>;
  const data = thread.data;
  const statuses: Record<string, string> = {
    agent: tr(locale, "Agent 待接待", "Awaiting Agent"),
    waiting_human: tr(locale, "待真人", "Needs human"),
    active: tr(locale, "处理中", "In progress"), resolved: tr(locale, "已解决", "Resolved"),
    unassigned: tr(locale, "未分配", "Unassigned")
  };
  const taskStates: Record<string, string> = {
    pending: tr(locale, "排队中", "Queued"), running: tr(locale, "执行中", "Running"),
    completed: tr(locale, "已完成", "Completed"), cancelled: tr(locale, "已取消", "Cancelled"),
    failed: tr(locale, "未完成", "Not completed")
  };
  const reasons: Record<string, string> = {
    no_sources: tr(locale, "没有启用的知识来源，请补充企业知识库。", "No active knowledge sources. Add organization knowledge."),
    high_risk: tr(locale, "涉及敏感承诺或业务决策，请由真人回复。", "Sensitive commitment or business decision. A person must reply."),
    business_permission_required: tr(locale, "企业自动回复未授权，请检查我的 Agent 权限。", "Automatic business replies are not authorized. Check My Agent permissions."),
    business_permission_changed: tr(locale, "企业授权在执行期间改变，请由真人确认。", "Business permission changed during execution. A person must review."),
    quota_or_uncertain_attempt: tr(locale, "额度不足或上次调用结果不确定，请检查用量后人工处理。", "Quota unavailable or previous attempt uncertain. Check usage and handle manually."),
    model_or_answer_unavailable: tr(locale, "模型或回答未通过验证，请检查模型与知识库后人工处理。", "Model or answer validation failed. Check model and knowledge; handle manually."),
    sources_changed: tr(locale, "回答引用的知识已改变，旧回答未发送。", "Referenced knowledge changed. The old answer was not sent."),
    publication_failed: tr(locale, "回复保存未完成，请检查会话再处理。", "Reply could not be saved. Review the conversation."),
    conversation_advanced: tr(locale, "会话已有新消息，旧任务已退出。", "New messages superseded this task."),
    authorization_changed: tr(locale, "授权或接管状态已改变，旧任务已退出。", "Permission or takeover changed; this task stopped.")
  };
  return <div className="inquiry-detail customer-thread-detail">
    <section className="customer-desk-conversation" aria-label={tr(locale, "沟通工作区", "Conversation workspace")}>
      <CustomerChat id={id} audience="owner" locale={locale} />
    </section>
    <aside className="customer-desk-tools" aria-label={tr(locale, "接待管理", "Reception management")} tabIndex={0}>
    <div className="inquiry-meta"><b>{data.organizationName}</b><span>{statuses[data.status] ?? data.status}</span></div>
    <p>{data.customerName || tr(locale, "客户", "Customer")} · {tr(locale, "负责人", "Owner")}: {data.assigneeName || "—"}</p>
    <p className="customer-desk-explanation">{tr(locale, "客户消息与内部备注分开。Agent 仅在授权和接待条件满足时回复，无法可靠回答时转真人。", "Customer messages and internal notes are separate. Agent replies require authorization and reception readiness; uncertain answers go to a person.")}</p>
    <div className="customer-desk-actions">
      {data.status !== "active" && data.status !== "resolved" && <button disabled={busy} onClick={() => void update({ action: "takeover" })}>{tr(locale, "接管处理", "Take over")}</button>}
      {data.status !== "resolved" ? <button disabled={busy} onClick={() => void update({ action: "resolve" })}>{tr(locale, "标记已解决", "Mark resolved")}</button>
        : <button disabled={busy} onClick={() => void update({ action: "reopen" })}>{tr(locale, "重新打开", "Reopen")}</button>}
    </div>
    {feedback && <p role="status">{feedback}</p>}
    {!!data.agentTasks?.length && <details className="customer-internal-tools">
      <summary>{tr(locale, "Agent 执行与升级记录", "Agent execution & handoff log")}</summary>
      <small>{tr(locale, "最近 5 个任务；旧版本结果不代表当前会话状态。", "Latest 5 tasks. Older revisions do not represent the current conversation state.")}</small>
      {data.agentTasks.map(task => <article className="customer-task-result" key={task.id}>
        <b>{taskStates[task.state] ?? tr(locale, "状态待确认", "Status unconfirmed")}</b>
        <small>{task.authorityRevision !== data.agentRevision && tr(locale, "历史授权 · ", "Earlier permission · ")}
          {new Date(task.updatedAt).toLocaleString(locale)}</small>
        {task.outcome && <p>{reasons[task.outcome] ?? (task.outcome === "sent"
          ? tr(locale, "回复已发送，依据见消息内的回复引用。", "Reply sent. See answer sources in the message.")
          : tr(locale, "任务未继续，请检查会话及审计记录。", "Task stopped. Review the conversation and audit."))}</p>}
      </article>)}
    </details>}
    <CustomerReceptionReadiness id={id} locale={locale} />
    <details className="customer-internal-tools">
    <summary>{tr(locale, "内部管理与备注", "Internal management & notes")}</summary>
    <label>{tr(locale, "优先级", "Priority")}<select disabled={busy} value={data.priority}
      onChange={event => void update({ priority: event.target.value })}>
      <option value="normal">{tr(locale, "普通", "Normal")}</option><option value="high">{tr(locale, "高", "High")}</option>
    </select></label>
    <section><h3>{tr(locale, "内部备注", "Internal notes")}</h3>
      <small>{tr(locale, "仅企业管理员可见，不会发送给客户。", "Visible only to the organization administrator; not sent to the customer.")}</small>
      {data.internalNotes.map((item, index) => <p key={index}>{item}</p>)}
      <label>{tr(locale, "新增内部备注", "Add internal note")}<textarea value={note} maxLength={2000}
        onChange={event => setNote(event.target.value)} disabled={busy} /></label>
      <button disabled={busy || !note.trim()} onClick={() => void update({ note })}>{tr(locale, "保存备注", "Save note")}</button>
    </section>
    </details>
    </aside>
  </div>;
}
