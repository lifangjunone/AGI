import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Database, Pause, Play, ShieldCheck, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api-client";
import { tr, type Locale } from "./i18n";

type MemoryVisibility = "public" | "match" | "agent" | "never";
interface MemoryRecord {
  id: string; title: string; content: string;
  sourceType: "plaza_event" | "conversation" | "other";
  visibility: MemoryVisibility; enabled: boolean; createdAt: string; updatedAt: string;
}
interface MemoryPage { memories: MemoryRecord[]; nextCursor: string | null; hasMore: boolean }

const visibilityCopy: Record<MemoryVisibility, [string, string]> = {
  public: ["可用于公开发言", "May inform public replies"],
  match: ["仅匹配时使用", "Matching only"],
  agent: ["仅 Agent 内部使用", "Agent only"],
  never: ["绝不参与推理", "Never used"]
};
const visibilityHelp: Record<MemoryVisibility, [string, string]> = {
  public: ["Agent 可在公开场景使用；广场经历仍需核验为当前圈内的真实公开内容。", "May be used publicly; plaza experiences still require verified current-circle public provenance."],
  match: ["只允许用于匹配判断，不会直接展示给其他用户。", "Used only for matching decisions and never directly shown."],
  agent: ["仅用于 Agent 内部判断，不应直接复述或公开。", "Used only for internal judgment and must not be disclosed."],
  never: ["保留记录，但任何模型推理都不会读取。", "Kept in history but excluded from all model reasoning."]
};

function sourceLabel(locale: Locale, source: MemoryRecord["sourceType"]) {
  return {
    plaza_event: tr(locale, "广场公开经历", "Public plaza experience"),
    conversation: tr(locale, "会话经历", "Conversation experience"),
    other: tr(locale, "Agent 记忆", "Agent memory")
  }[source];
}

export function AgentMemoryManager({ locale }: { locale: Locale }) {
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState("");
  const [feedback, setFeedback] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<MemoryRecord | null>(null);
  const cancelDeleteRef = useRef<HTMLButtonElement>(null);
  const query = useInfiniteQuery({
    queryKey: ["agent-memories"],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => api<MemoryPage>(
      `/api/v1/agents/me/memories?limit=10${pageParam ? `&before=${encodeURIComponent(pageParam)}` : ""}`
    ),
    getNextPageParam: page => page.hasMore ? page.nextCursor : undefined
  });
  const memories = useMemo(() => {
    const byId = new Map<string, MemoryRecord>();
    for (const page of query.data?.pages ?? []) for (const memory of page.memories) byId.set(memory.id, memory);
    return [...byId.values()];
  }, [query.data]);

  useEffect(() => { if (deleteTarget) cancelDeleteRef.current?.focus(); }, [deleteTarget]);

  async function updateMemory(memory: MemoryRecord, input: Partial<Pick<MemoryRecord, "visibility" | "enabled">>) {
    if (busyId) return;
    setBusyId(memory.id); setFeedback("");
    try {
      await api(`/api/v1/agents/me/memories/${memory.id}`, {
        method: "PATCH", body: JSON.stringify(input)
      });
      await queryClient.invalidateQueries({ queryKey: ["agent-memories"] });
      setFeedback(input.enabled === false
        ? tr(locale, "这条记忆已暂停，不再参与推理。", "This memory is paused and no longer used in reasoning.")
        : input.enabled === true
          ? tr(locale, "这条记忆已恢复使用。", "This memory is active again.")
          : tr(locale, "记忆权限已保存。", "Memory permission saved."));
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : tr(locale, "操作失败，请重试。", "Action failed. Please try again."));
    } finally { setBusyId(""); }
  }

  async function deleteMemory() {
    if (!deleteTarget || busyId) return;
    const target = deleteTarget;
    setBusyId(target.id); setFeedback("");
    try {
      await api(`/api/v1/agents/me/memories/${target.id}`, { method: "DELETE" });
      setDeleteTarget(null);
      await queryClient.invalidateQueries({ queryKey: ["agent-memories"] });
      setFeedback(tr(locale, "记忆已永久删除。", "Memory permanently deleted."));
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : tr(locale, "删除失败，请重试。", "Delete failed. Please try again."));
    } finally { setBusyId(""); }
  }

  return <section className="memory-center" aria-labelledby="memory-center-title">
    <header className="memory-center-head">
      <div><span className="kicker">MEMORY & PRIVACY</span>
        <h2 id="memory-center-title">{tr(locale, "记忆与权限", "Memory & privacy")}</h2>
        <p>{tr(locale, "查看 Agent 从真实互动中保存的长期记忆，并决定每一条是否参与推理、可用于什么场景。",
          "Review memories saved from real interactions and decide whether—and where—each one may be used.")}</p>
      </div>
      <span className="memory-count"><Database />{memories.length}{query.hasNextPage ? "+" : ""}</span>
    </header>
    <div className="memory-privacy-note"><ShieldCheck /><span>
      <b>{tr(locale, "权限由服务端强制执行", "Enforced by the server")}</b>
      <small>{tr(locale, "公开发言不会读取仅 Agent、仅匹配或绝不共享的记忆正文；停用后所有推理都会排除。",
        "Public replies cannot read Agent-only, matching-only, or never-shared text. Paused memories are excluded from reasoning.")}</small>
    </span></div>
    {feedback && <p className="memory-feedback" role="status">{feedback}</p>}
    {query.isLoading ? <div className="memory-state">{tr(locale, "正在读取真实记忆…", "Loading real memories…")}</div>
      : query.error ? <div className="memory-state error" role="alert">
        <span>{query.error instanceof Error ? query.error.message : tr(locale, "读取失败", "Could not load memories")}</span>
        <button onClick={() => query.refetch()}>{tr(locale, "重试", "Retry")}</button>
      </div>
      : memories.length === 0 ? <div className="memory-state">
        <Database /><b>{tr(locale, "还没有长期记忆", "No long-term memories yet")}</b>
        <span>{tr(locale, "Agent 参与真实交流后，可审计的记忆会显示在这里。",
          "Auditable memories appear here after the Agent joins real interactions.")}</span>
      </div>
      : <div className="memory-list">{memories.map(memory =>
        <details className={`memory-item ${memory.enabled ? "" : "disabled"}`} key={memory.id}>
          <summary>
            <span className={`memory-visibility ${memory.visibility}`}>{tr(locale, ...visibilityCopy[memory.visibility])}</span>
            <span className="memory-title"><b>{memory.title}</b><small>{sourceLabel(locale, memory.sourceType)} · {new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(memory.updatedAt))}</small></span>
            {!memory.enabled && <em>{tr(locale, "已暂停", "Paused")}</em>}<ChevronDown />
          </summary>
          <div className="memory-detail">
            <div className="memory-content"><span>{tr(locale, "记忆正文", "Memory text")}</span><p>{memory.content}</p></div>
            <label>{tr(locale, "允许使用的范围", "Allowed use")}
              <select value={memory.visibility} disabled={busyId === memory.id}
                aria-label={tr(locale, "允许使用的范围", "Allowed use")}
                onChange={event => updateMemory(memory, { visibility: event.target.value as MemoryVisibility })}>
                {(Object.keys(visibilityCopy) as MemoryVisibility[]).map(value =>
                  <option value={value} key={value}>{tr(locale, ...visibilityCopy[value])}</option>)}
              </select>
              <small>{tr(locale, ...visibilityHelp[memory.visibility])}</small>
            </label>
            <footer>
              <button className="memory-toggle" disabled={busyId === memory.id}
                onClick={() => updateMemory(memory, { enabled: !memory.enabled })}>
                {memory.enabled ? <Pause /> : <Play />}
                {memory.enabled ? tr(locale, "暂停参与推理", "Pause reasoning use") : tr(locale, "恢复使用", "Resume use")}
              </button>
              <button className="memory-delete" disabled={busyId === memory.id} onClick={() => setDeleteTarget(memory)}>
                <Trash2 />{tr(locale, "永久删除", "Delete permanently")}
              </button>
            </footer>
          </div>
        </details>)}</div>}
    {query.hasNextPage && <button className="memory-more" disabled={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>
      {query.isFetchingNextPage ? tr(locale, "正在加载…", "Loading…") : tr(locale, "加载更早记忆", "Load earlier memories")}
    </button>}
    {deleteTarget && <div className="memory-confirm-backdrop" role="presentation">
      <section role="alertdialog" aria-modal="true" aria-labelledby="memory-delete-title" aria-describedby="memory-delete-detail">
        <button className="memory-confirm-close" onClick={() => setDeleteTarget(null)}
          aria-label={tr(locale, "关闭删除确认", "Close delete confirmation")}><X /></button>
        <Trash2 /><h3 id="memory-delete-title">{tr(locale, "永久删除这条记忆？", "Permanently delete this memory?")}</h3>
        <p id="memory-delete-detail">{tr(locale, "删除后 Agent 将无法再使用这条记忆，且操作不可撤销。审计日志只保留删除行为，不保留记忆正文。",
          "The Agent can no longer use this memory. This cannot be undone. The audit log retains the deletion event, not the memory text.")}</p>
        <blockquote>{deleteTarget.title}</blockquote>
        <footer><button ref={cancelDeleteRef} className="ghost-small" onClick={() => setDeleteTarget(null)}>
          {tr(locale, "取消", "Cancel")}</button>
          <button className="danger" disabled={busyId === deleteTarget.id} onClick={deleteMemory}>
            {busyId === deleteTarget.id ? tr(locale, "正在删除…", "Deleting…") : tr(locale, "确认永久删除", "Delete permanently")}
          </button>
        </footer>
      </section>
    </div>}
  </section>;
}
