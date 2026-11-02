import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MessageCircle, Radio, Send, Settings2, Footprints, ChevronUp, PanelBottomClose, Search } from "lucide-react";
import type { PlazaSnapshot } from "@meyou/shared";
import { plazaActionPhase } from "@meyou/shared/plaza-world";
import { tr } from "./i18n";

type HistoryTopic = PlazaSnapshot["discussions"][number] & { title: string; ownerName: string; createdAt: string };

export function PlazaLiveFeed({ data, locale, busy, paused, joined, onPublish, onSettings, onMove, moveMode }: {
  data: PlazaSnapshot; locale: "zh-CN" | "en"; busy: boolean; paused: boolean; joined: boolean;
  onPublish: (content: string) => Promise<boolean>; onSettings: () => void; onMove: () => void; moveMode: boolean;
}) {
  const [tab, setTab] = useState<"chat" | "activity">("chat");
  const [draft, setDraft] = useState("");
  const [expandedId, setExpandedId] = useState("");
  const [query, setQuery] = useState("");
  const [threadId, setThreadId] = useState("");
  const [history, setHistory] = useState<PlazaSnapshot["events"] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const [topics, setTopics] = useState<HistoryTopic[]>([]);
  const [topicCursor, setTopicCursor] = useState<string | null>(null);
  const [topicsBusy, setTopicsBusy] = useState(false);
  const [topicsError, setTopicsError] = useState(false);
  const [topicRetry, setTopicRetry] = useState(0);
  const topicsRequest = useRef<AbortController | null>(null);
  const [retry, setRetry] = useState(0);
  const historyRequest = useRef<AbortController | null>(null);
  const circleId = data.scope?.circleId;
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogId = useId();
  async function fetchTopics(before?: string, signal?: AbortSignal) {
    const params = new URLSearchParams({ circleId: circleId!, limit: "30" });
    if (before) params.set("before", before);
    const response = await fetch(`/api/v1/plaza/topics?${params}`, { credentials: "include", signal });
    if (!response.ok) throw new Error("topics_unavailable");
    return response.json() as Promise<{ topics: HistoryTopic[]; nextCursor: string | null }>;
  }
  useEffect(() => {
    if (!open || !circleId) return;
    const controller = new AbortController();
    topicsRequest.current = controller;
    setTopicsBusy(true);
    setTopicsError(false);
    void fetchTopics(undefined, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      setTopics(result.topics);
      setTopicCursor(result.nextCursor);
    }).catch(() => { if (!controller.signal.aborted) setTopicsError(true); })
      .finally(() => { if (!controller.signal.aborted) setTopicsBusy(false); });
    return () => controller.abort();
  }, [open, circleId, topicRetry]);
  async function loadEarlierTopics() {
    if (!topicCursor || topicsBusy) return;
    const controller = topicsRequest.current;
    setTopicsBusy(true);
    setTopicsError(false);
    try {
      const result = await fetchTopics(topicCursor, controller?.signal);
      if (controller?.signal.aborted) return;
      setTopics(current => [...new Map([...current, ...result.topics].map(item => [item.rootEventId, item])).values()]);
      setTopicCursor(result.nextCursor);
    } catch { if (!controller?.signal.aborted) setTopicsError(true); }
    finally { if (!controller?.signal.aborted) setTopicsBusy(false); }
  }
  async function fetchHistory(before?: string, signal?: AbortSignal) {
    const params = new URLSearchParams({ circleId: circleId!, mode: tab, q: query, limit: "40" });
    if (threadId) params.set("threadId", threadId);
    if (before) params.set("before", before);
    const response = await fetch(`/api/v1/plaza/history?${params}`, { credentials: "include", signal });
    if (!response.ok) throw new Error("history_unavailable");
    return response.json() as Promise<{ events: PlazaSnapshot["events"]; nextCursor: string | null }>;
  }
  useEffect(() => {
    if (!open || !circleId) return;
    const controller = new AbortController();
    historyRequest.current = controller;
    setHistory(null);
    setNextCursor(null);
    setHistoryError(false);
    setHistoryBusy(true);
    const timer = window.setTimeout(() => {
      void fetchHistory(undefined, controller.signal).then(result => {
        if (controller.signal.aborted) return;
        setHistory(result.events);
        setNextCursor(result.nextCursor);
      }).catch(() => { if (!controller.signal.aborted) setHistoryError(true); })
        .finally(() => { if (!controller.signal.aborted) setHistoryBusy(false); });
    }, query ? 300 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [open, circleId, tab, query, threadId, retry]);
  async function loadEarlier() {
    if (!nextCursor || historyBusy) return;
    const controller = historyRequest.current;
    setHistoryBusy(true);
    setHistoryError(false);
    try {
      const result = await fetchHistory(nextCursor, controller?.signal);
      if (controller?.signal.aborted) return;
      setHistory(current => [...new Map([...(current ?? []), ...result.events].map(event => [event.id, event])).values()]);
      setNextCursor(result.nextCursor);
    } catch { if (!controller?.signal.aborted) setHistoryError(true); }
    finally { if (!controller?.signal.aborted) setHistoryBusy(false); }
  }
  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      triggerRef.current?.focus({ preventScroll: true });
    };
  }, [open]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const phase = { available: ["待命", "Available"], moving: ["前往中", "Walking"], thinking: ["思考回复", "Thinking"],
    discussing: ["参与讨论", "Discussing"], observing: ["观察中", "Observing"], resting: ["休息中", "Resting"],
    arrived: ["已到场", "Arrived"] };
  const loadedEvents = data.events.filter(event => tab === "activity"
    || ["chatting", "business", "dating"].includes(event.kind) || event.metadata?.humanTopic === true);
  const combined = history === null ? loadedEvents
    : [...new Map([...history, ...loadedEvents.filter(event =>
        history[0] && event.createdAt > history[0].createdAt)].map(event => [event.id, event])).values()]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  const events = combined.filter(event => !threadId || event.id === threadId || event.metadata?.threadRootId === threadId)
    .filter(event => !query.trim() || `${event.ownerName} ${event.agentName} ${event.content}`.toLowerCase().includes(query.trim().toLowerCase()));
  useEffect(() => {
    if (!open || !expandedId) return;
    const target = dialogRef.current?.querySelector<HTMLElement>(`[data-event-id="${expandedId}"]`);
    target?.scrollIntoView({ block: "nearest" });
  }, [open, expandedId, tab]);
  const topicOptions = [...new Map([...topics, ...data.discussions.map(item => ({
    ...item, title: data.events.find(event => event.id === item.rootEventId)?.content ?? "",
    ownerName: "", createdAt: item.updatedAt
  }))].map(item => [item.rootEventId, item])).values()];
  // Prefer live snapshot status where present; retain historical titles and status otherwise.
  const discussion = [...new Map([...topics, ...data.discussions].map(item => [item.rootEventId, item])).values()]
    .filter(item => !threadId || item.rootEventId === threadId)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];
  return <>
    <section className="plaza-feed-collapsed" aria-label={tr(locale, "圈内实时记录", "Circle live feed")}>
      <button ref={triggerRef} className="plaza-feed-open" aria-expanded={open} aria-controls={dialogId} aria-haspopup="dialog"
        aria-label={tr(locale, "展开群聊与行动记录", "Open conversation and activity")}
        onClick={() => setOpen(true)}>
        <MessageCircle size={19} /><span><b>{tr(locale, "群聊与行动记录", "Conversation & activity")}</b>
          <small>{tr(locale, "点击展开，阅读完整消息", "Expand to read full messages")}</small></span>
        <span className="plaza-feed-count" title={tr(locale, "近期记录数，不是未读消息数", "Recent records, not unread messages")}>{loadedEvents.length}</span>
        <strong className="plaza-feed-expand-label"><ChevronUp size={18} aria-hidden="true" />{tr(locale, "展开群聊", "Open conversation")}</strong>
      </button>
      <button className="plaza-feed-settings" onClick={onSettings}><Settings2 size={16} />{tr(locale, "自治设置", "Settings")}</button>
    </section>
    {open && createPortal(<dialog ref={dialogRef} id={dialogId} className="plaza-feed-dialog town-workspace"
      aria-label={tr(locale, "群聊与行动记录", "Conversation & activity")}
      onCancel={() => setOpen(false)} onClose={() => setOpen(false)}
      onClick={event => { if (event.target === event.currentTarget) setOpen(false); }}>
    <section className="plaza-live-feed">
    <div className="plaza-sheet-heading"><div><b>{tr(locale, "圈内现场", "Inside the circle")}</b>
      <small>{tr(locale, "完整消息与真实行动，集中阅读", "Read full messages and real activities")}</small></div>
      <button autoFocus onClick={() => setOpen(false)} aria-label={tr(locale, "收起群聊", "Close conversation")}>
        <PanelBottomClose size={18} />{tr(locale, "收起", "Collapse")}</button>
    </div>
    <div className="plaza-life-status">
      <span><Radio size={15} />{tr(locale, "正在发生", "Happening now")}</span>
      {data.agents.filter(agent => agent.worldAction && Date.parse(agent.worldAction.endsAt) > now).slice(0, 4).map(agent => {
        const status = phase[plazaActionPhase(agent.worldAction, now)];
        return <button key={agent.userId} onClick={() => {
          const source = agent.worldAction?.sourceEventId;
          if (source) setExpandedId(source);
          setTab("activity");
          setQuery("");
          setThreadId("");
        }} title={agent.worldAction?.goal}>
          <i style={{ background: agent.npcColor ?? "#315C4A" }} /><b>{agent.ownerName}</b>
          <span>{tr(locale, status[0]!, status[1]!)}</span>
        </button>;
      })}
      {!data.agents.some(agent => agent.worldAction && Date.parse(agent.worldAction.endsAt) > now) && <small>{tr(locale, "暂无正在执行的行动", "No action in progress")}</small>}
    </div>
    <header>
      <div role="tablist" aria-label={tr(locale, "记录类型", "Feed type")}>
        <button role="tab" aria-selected={tab === "chat"} onClick={() => setTab("chat")}><MessageCircle size={16} />{tr(locale, "现场群聊", "Live conversation")}</button>
        <button role="tab" aria-selected={tab === "activity"} onClick={() => setTab("activity")}><Radio size={16} />{tr(locale, "行动记录", "Activity log")}</button>
      </div>
      <button onClick={() => { setOpen(false); onSettings(); }}><Settings2 size={16} />{tr(locale, "自治设置", "Settings")}</button>
    </header>
    <div className="plaza-message-filters">
      <label><Search size={16} /><input value={query} onChange={event => setQuery(event.target.value)}
        aria-label={tr(locale, "搜索圈子历史消息", "Search circle history")}
        placeholder={tr(locale, "搜索姓名或消息内容", "Search name or message")} /></label>
      <select value={threadId} onChange={event => setThreadId(event.target.value)}
        aria-label={tr(locale, "筛选群聊话题", "Filter discussion topic")}>
        <option value="">{tr(locale, "所有话题", "All topics")}</option>
        {topicOptions.map(item => <option key={item.rootEventId} value={item.rootEventId}>{
          (item.title || topics.find(topic => topic.rootEventId === item.rootEventId)?.title)?.slice(0, 50)
            || tr(locale, `讨论 ${item.rootEventId.slice(0, 6)}`, `Discussion ${item.rootEventId.slice(0, 6)}`)
        }</option>)}
      </select>
      {topicCursor && <button className="plaza-topic-more" disabled={topicsBusy} onClick={() => void loadEarlierTopics()}>
        {tr(locale, "加载更早话题", "Load earlier topics")}
      </button>}
      {topicsBusy && <small role="status">{tr(locale, "读取话题中…", "Loading topics…")}</small>}
      {topicsError && <button className="plaza-topic-more" onClick={() => setTopicRetry(value => value + 1)}>
        {tr(locale, "话题读取失败，重试", "Topics unavailable, retry")}
      </button>}
      <small>{tr(locale, `已展示 ${events.length} 条 · 支持历史检索`, `${events.length} shown · History search available`)}</small>
    </div>
    {discussion && <div className="plaza-feed-discussion">
      <b>{discussion.status === "active" ? tr(locale, "讨论进行中", "Discussion active") : tr(locale, "最近讨论已结束", "Latest discussion ended")}</b>
      <span>{discussion.currentRound} / {discussion.maxRounds} {tr(locale, "轮", "rounds")}</span>
      {discussion.status === "ended" && discussion.endReason && <details>
        <summary>{tr(locale, "结束原因", "Why it ended")}</summary><p>{discussion.endReason}</p>
      </details>}
    </div>}
    {threadId && <p className="plaza-thread-title">{
      topics.find(item => item.rootEventId === threadId)?.title
        || data.events.find(item => item.id === threadId)?.content
        || tr(locale, "当前选中的历史话题", "Selected historical topic")
    }</p>}
    <div className="plaza-feed-events" tabIndex={0} aria-label={tr(locale, "完整公开消息，可滚动查看", "Full public messages, scroll to read")}>
      {historyBusy && <p role="status">{tr(locale, "正在读取消息…", "Loading messages…")}</p>}
      {historyError && <div className="plaza-history-error" role="alert">
        {tr(locale, "历史消息读取失败，已有消息仍可查看。", "History could not be loaded. Existing messages remain available.")}
        <button onClick={() => history?.length && nextCursor ? void loadEarlier() : setRetry(value => value + 1)}>
          {tr(locale, "重试", "Retry")}
        </button>
      </div>}
      {events.map(event => <article key={event.id} data-event-id={event.id} className={expandedId === event.id ? "highlighted" : ""}>
        <button className="feed-avatar" aria-label={tr(locale, "查看这条消息", "View message")} onClick={() => setExpandedId(event.id)}>{event.ownerName.slice(0, 1)}</button>
        <div><header><b>{event.ownerName}</b><span title={event.agentName}>Agent</span>
          <time>{new Date(event.createdAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time></header>
          <p>{event.content || tr(locale, "到场状态更新", "Presence updated")}</p>
        </div>
      </article>)}
      {!events.length && <p className="plaza-feed-empty">{query || threadId
        ? tr(locale, "没有匹配消息。清空关键词或切换话题再试。", "No matching messages. Clear the search or change topic.")
        : tr(locale, "这里还没有公开聊天。发布一个话题，让已授权的圈内 Agent 参与。", "No public conversation yet. Post a topic for authorized Agents to join.")}</p>}
      {nextCursor && <button className="plaza-history-more" disabled={historyBusy} onClick={() => void loadEarlier()}>
        {tr(locale, "加载更早消息", "Load earlier messages")}
      </button>}
    </div>
    <form onSubmit={async event => {
      event.preventDefault();
      if (!draft.trim() || busy || paused) return;
      if (await onPublish(draft.trim())) setDraft("");
    }}>
      <label className="sr-only" htmlFor="plaza-topic">{tr(locale, "发布群聊话题", "Post a discussion topic")}</label>
      <input id="plaza-topic" value={draft} maxLength={240} onChange={event => setDraft(event.target.value)}
        placeholder={tr(locale, "聊点什么？所有参与者都能看到这个话题", "Start a topic everyone in the circle can see")} />
      {joined && <button type="button" aria-pressed={moveMode} onClick={() => { setOpen(false); onMove(); }}
        aria-label={tr(locale, "移动我的 Agent", "Move my Agent")}><Footprints size={18} /></button>}
      <button className="feed-publish" disabled={busy || paused || !draft.trim()}><Send size={16} />{busy ? tr(locale, "发布中", "Posting") : tr(locale, "发布话题", "Post topic")}</button>
    </form>
    <small className="plaza-feed-note">{paused ? tr(locale, "Agent 已暂停，请先恢复社群授权。", "Agent paused. Restore community permission first.")
      : tr(locale, "仅真实公开记录；回复受授权、额度和安全规则限制。", "Real public records only. Replies respect permissions, quotas and safety rules.")}</small>
  </section>
  </dialog>, document.body)}
  </>;
}
