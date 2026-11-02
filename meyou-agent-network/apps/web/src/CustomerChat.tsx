import { useRef, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { tr } from "./i18n";
import { useChatReading } from "./useChatReading";
import { fetchChatUpdates, type ChatPage } from "./customer-chat-sync";

export function CustomerChat({ id, audience, locale }: {
  id: string; audience: "customer" | "owner"; locale: "zh-CN" | "en";
}) {
  const client = useQueryClient();
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<{ content: string; requestId: string } | null>(null);
  const prefix = audience === "customer" ? "/api/v1/company-chats" : "/api/v1/customers";
  const checkpoint = useRef<{ scope: string; latest?: string; earlier?: string | null }>({ scope: "" });
  const syncScope = `${audience}:${id}`;
  if (checkpoint.current.scope !== syncScope) checkpoint.current = { scope: syncScope };
  const chat = useInfiniteQuery({
    queryKey: ["customer-chat", audience, id],
    initialPageParam: null as string | null,
    getNextPageParam: (page: { nextCursor?: string | null }) => page.nextCursor ?? undefined,
    refetchInterval: 5000,
    queryFn: async ({ pageParam, signal }) => {
      if (!pageParam && checkpoint.current.latest) {
        const page = await fetchChatUpdates(prefix, id, checkpoint.current.latest, signal);
        return { ...page, nextCursor: checkpoint.current.earlier };
      }
      const params = new URLSearchParams({ limit: "40" });
      if (pageParam) params.set("before", pageParam);
      const response = await fetch(`${prefix}/${id}/messages?${params}`, { credentials: "include", signal });
      if (!response.ok) throw new Error("chat_unavailable");
      const page = await response.json() as ChatPage;
      return page;
    }
  });
  const currentThread = chat.data?.pages[0]?.thread;
  // A polling page is a moving window, not a deletion instruction. Retain
  // explicitly loaded history until this conversation/identity view changes.
  const loaded = useRef<{ scope: string; messages: Map<string, NonNullable<typeof chat.data>["pages"][number]["messages"][number]> }>({
    scope: "", messages: new Map()
  });
  const scope = `${audience}:${id}`;
  if (loaded.current.scope !== scope) loaded.current = { scope, messages: new Map() };
  for (const page of chat.data?.pages ?? []) {
    for (const message of page.messages) loaded.current.messages.set(message.id, message);
  }
  const messages = [...loaded.current.messages.values()]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  checkpoint.current.latest = messages.at(-1)?.id;
  if (chat.data) checkpoint.current.earlier = chat.data.pages[0]?.nextCursor;
  const reading = useChatReading(messages.map(message => message.id));
  async function send() {
    if (!content.trim() || busy) return;
    const trimmed = content.trim();
    if (!pending.current || pending.current.content !== trimmed) {
      pending.current = { content: trimmed, requestId: crypto.randomUUID() };
    }
    setBusy(true); setError("");
    try {
      const response = await fetch(`${prefix}/${id}/messages`, {
        method: "POST", credentials: "include", headers: { "content-type": "application/json" },
        body: JSON.stringify(pending.current)
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.error === "customer_thread_resolved"
          ? tr(locale, "会话已解决，请联系企业重新打开。内容已保留。", "Thread resolved. Ask the organization to reopen it. Your input is retained.")
          : tr(locale, "发送未完成，内容已保留；可重试相同消息。", "Delivery incomplete. Your input is retained; retry the same message."));
        return;
      }
      setContent(""); pending.current = null;
      await Promise.all([
        client.invalidateQueries({ queryKey: ["customer-chat", audience, id] }),
        client.invalidateQueries({ queryKey: ["dashboard"] })
      ]);
    } catch {
      setError(tr(locale, "连接失败，内容已保留；可重试相同消息。", "Connection failed. Your input is retained; retry the same message."));
    } finally { setBusy(false); }
  }
  return <section className="customer-chat" aria-label={tr(locale, "客户会话", "Customer conversation")}>
    <h3>{tr(locale, "客户会话", "Customer conversation")}</h3>
    <small>{tr(locale, `已加载 ${messages.length} 条 · 可读取历史 · 发送者身份明确标注`, `${messages.length} loaded · History available · Sender type labeled`)}</small>
    {chat.isPending && <p role="status">{tr(locale, "读取消息中…", "Loading messages…")}</p>}
    {chat.isError && <p role="alert">{tr(locale, "消息读取失败。", "Messages unavailable.")}<button onClick={() => void chat.refetch()}>{tr(locale, "重试", "Retry")}</button></p>}
    {currentThread && <>
      <p className="customer-reception-status">{currentThread.status === "resolved"
        ? tr(locale, "会话已解决", "Conversation resolved")
        : currentThread.status === "waiting_human"
          ? tr(locale, "等待真人处理，自动接待已暂停", "Waiting for a person; automatic reception is paused")
          : currentThread.agentMode === "auto"
            ? tr(locale, "Agent 接待已授权，回复仍受知识、额度和安全检查限制", "Agent reception authorized; replies remain subject to sources, quota and safety checks")
            : tr(locale, "当前由真人接待", "Currently handled by a person")}</p>
      <div ref={reading.historyRef} onScroll={reading.onScroll} className="customer-chat-history" role="region" tabIndex={0} aria-label={tr(locale, "消息历史，可滚动阅读", "Message history, scroll to read")}>
      <blockquote><b>{tr(locale, "最初咨询", "Initial inquiry")}</b><p>{currentThread.subject}</p></blockquote>
      {chat.hasNextPage && <button disabled={chat.isFetchingNextPage} onClick={() => { reading.beforeEarlier(); void chat.fetchNextPage(); }}>
        {tr(locale, chat.isFetchingNextPage ? "加载中…" : "加载更早消息", chat.isFetchingNextPage ? "Loading…" : "Load earlier messages")}
      </button>}
      {chat.isFetchNextPageError && <p role="alert">{tr(locale, "历史读取失败，已有消息仍可查看，请重试。", "History unavailable. Existing messages remain visible; retry.")}</p>}
      {messages.map(message => <article key={message.id} data-message-id={message.id}>
        <header><b>{message.actor === "customer" ? tr(locale, "客户", "Customer")
          : message.actor === "agent" ? tr(locale, "企业 · Agent", "Organization · Agent")
            : message.actor === "human" ? tr(locale, "企业 · 真人", "Organization · Person")
              : tr(locale, "系统", "System")}</b>
          <time>{new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(new Date(message.createdAt))}</time></header>
        <p>{message.content}</p>
        {audience === "owner" && message.actor === "agent" && message.trace && <details className="customer-answer-trace">
          <summary>{tr(locale, "回复依据 · 仅内部可见", "Answer sources · Internal only")}</summary>
          {message.trace.model && <small>{message.trace.model.provider} / {message.trace.model.model}</small>}
          {message.trace.sources.map((source, index) => <blockquote key={`${source.documentId}-${index}`}>
            <p>{source.quote}</p><small>{tr(locale, "来源版本", "Source revision")}: {source.revision}</small>
          </blockquote>)}
          <small>{tr(locale, "任务追溯", "Task reference")}: {message.trace.taskId}</small>
        </details>}
      </article>)}</div>
      <div className="customer-reading-status">
        <small role="status" aria-atomic="true">{reading.pendingCount > 0
          ? tr(locale, `有 ${reading.pendingCount} 条新消息，当前阅读位置已保留`, `${reading.pendingCount} new messages. Your reading position is preserved.`)
          : reading.readingHistory ? tr(locale, "正在阅读历史消息", "Reading earlier messages")
            : tr(locale, "正在查看最新消息", "Viewing latest messages")}</small>
        {reading.readingHistory && <button type="button" onClick={reading.showLatest}>
          {tr(locale, reading.pendingCount > 0 ? "查看新消息" : "回到最新", reading.pendingCount > 0 ? "View new messages" : "Back to latest")}
        </button>}
      </div>
      <form onSubmit={event => { event.preventDefault(); void send(); }}>
        <label>{audience === "owner" ? tr(locale, "回复客户", "Reply to customer") : tr(locale, "继续咨询", "Continue inquiry")}
          <textarea value={content} maxLength={4000} disabled={busy || currentThread.status === "resolved"}
            onChange={event => setContent(event.target.value)} /></label>
        {currentThread.status === "resolved" && <p>{tr(locale, "会话已解决，企业重新打开后可继续沟通。", "Thread resolved. Conversation can continue once the organization reopens it.")}</p>}
        {error && <p role="alert">{error}</p>}
        <button disabled={busy || !content.trim() || currentThread.status === "resolved"} type="submit">
          {tr(locale, busy ? "发送中…" : "发送消息", busy ? "Sending…" : "Send message")}</button>
      </form>
    </>}
  </section>;
}
