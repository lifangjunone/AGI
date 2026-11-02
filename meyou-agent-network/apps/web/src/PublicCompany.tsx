import { useRef, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { BriefcaseBusiness, Clock3, Languages, ArrowRight } from "lucide-react";
import { tr } from "./i18n";
import { useAppStore } from "./store";
import { CustomerChat } from "./CustomerChat";

export function PublicCompany() {
  const { handle = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const locale = useAppStore(state => state.locale);
  const setLocale = useAppStore(state => state.setLocale);
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const sending = useRef(false);
  const chatPanel = useRef<HTMLDivElement>(null);
  const pendingInquiry = useRef<{ content: string; requestId: string } | null>(null);
  const company = useQuery({
    queryKey: ["public-company", handle],
    queryFn: async () => {
      const response = await fetch(`/api/v1/public/companies/${encodeURIComponent(handle)}`);
      if (!response.ok) throw new Error("company_unavailable");
      return (await response.json() as { company: {
        name: string; handle: string; description: string; businessHours: string;
      } }).company;
    }
  });
  const session = useQuery({
    queryKey: ["company-session"],
    queryFn: async () => {
      const response = await fetch("/api/v1/session", { credentials: "include" });
      if (!response.ok) return null;
      return (await response.json() as { user: { name: string } | null }).user;
    }
  });
  const threads = useInfiniteQuery({
    queryKey: ["my-company-chats", handle], enabled: Boolean(session.data),
    refetchInterval: 10000,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page: { nextCursor?: string | null }) => page.nextCursor ?? undefined,
    queryFn: async ({ pageParam, signal }) => {
      const query = new URLSearchParams({ handle, limit: "20" });
      if (pageParam) query.set("before", pageParam);
      const response = await fetch(`/api/v1/company-chats?${query}`, { credentials: "include", signal });
      if (!response.ok) throw new Error("threads_unavailable");
      return await response.json() as { threads: Array<{ id: string; subject: string; status: string; createdAt?: string }>; nextCursor?: string | null };
    }
  });
  async function submit() {
    if (sending.current || !content.trim()) return;
    sending.current = true;
    setBusy(true); setError("");
    if (!pendingInquiry.current || pendingInquiry.current.content !== content.trim()) {
      pendingInquiry.current = { content: content.trim(), requestId: crypto.randomUUID() };
    }
    try {
      const response = await fetch(`/api/v1/public/companies/${encodeURIComponent(handle)}/inquiries`, {
        method: "POST", credentials: "include", headers: { "content-type": "application/json" },
        body: JSON.stringify(pendingInquiry.current)
      });
      if (!response.ok) {
        setError(response.status === 401
          ? tr(locale, "登录已失效，请重新登录后提交。咨询内容已保留。", "Session expired. Sign in again to submit. Your inquiry is retained.")
          : response.status === 429
            ? tr(locale, "提交过于频繁，请稍后再试。内容已保留。", "Too many inquiries. Try later. Your input is retained.")
            : tr(locale, "提交失败，内容已保留，请重试。", "Submission failed. Your input is retained; please retry."));
        return;
      }
      const body = await response.json() as { inquiry: { id: string } };
      setSent(true); setContent("");
      pendingInquiry.current = null;
      setParams({ thread: body.inquiry.id });
      await threads.refetch();
    } catch { setError(tr(locale, "连接失败，内容已保留，请稍后重试。", "Connection failed. Your inquiry is retained; please retry.")); }
    finally { setBusy(false); sending.current = false; }
  }
  const returnTo = `/company/${encodeURIComponent(handle)}`;
  const directory = [...new Map((threads.data?.pages.flatMap(page => page.threads) ?? []).map(thread => [thread.id, thread])).values()];
  const statusLabel = (status: string) => ({
    unassigned: tr(locale, "等待接待", "Awaiting reception"),
    agent: tr(locale, "Agent 处理中", "Agent handling"),
    waiting_human: tr(locale, "等待人工", "Awaiting a person"),
    active: tr(locale, "处理中", "In progress"),
    resolved: tr(locale, "已解决", "Resolved")
  }[status] ?? tr(locale, "待处理", "Pending"));
  return <div className="public-company-page">
    <header><Link to="/">{tr(locale, "遇见 MeYou", "MeYou")}</Link><button aria-label={tr(locale, "切换语言", "Switch language")}
      onClick={() => setLocale(locale === "en" ? "zh-CN" : "en")}><Languages size={16} />{locale === "en" ? "中文" : "English"}</button></header>
    <main>
      {company.isPending ? <p role="status">{tr(locale, "正在读取企业资料…", "Loading organization…")}</p>
        : company.isError ? <div role="alert"><h1>{tr(locale, "企业页面暂不可用", "Organization unavailable")}</h1>
          <button onClick={() => void company.refetch()}>{tr(locale, "重试", "Retry")}</button></div>
          : <>
            <section className="company-public-info"><BriefcaseBusiness size={28} aria-hidden="true" />
              <span>{tr(locale, "企业接待", "ORGANIZATION RECEPTION")}</span>
              <h1>{company.data.name}</h1><p>{company.data.description}</p>
              <small><Clock3 size={16} aria-hidden="true" />{tr(locale, "营业时间", "Business hours")} · {company.data.businessHours}</small>
            </section>
            <section className="company-inquiry-form"><h2>{tr(locale, "联系这家企业", "Contact this organization")}</h2>
              <p>{tr(locale, "咨询进入企业的独立会话。企业可授权 Agent 依据知识库接待；未授权、服务不可用或涉及高风险时由真人处理。", "Your inquiry opens a private organization conversation. An authorized Agent may answer from its knowledge base; a person handles unavailable, unauthorized or high-risk cases.")}</p>
              {sent ? <div role="status"><b>{tr(locale, "咨询已送达企业收件箱", "Inquiry delivered to the organization inbox")}</b>
                <p>{tr(locale, "在下方会话查看企业回复并继续沟通。", "View organization replies and continue below.")}</p></div>
                : <form onSubmit={event => { event.preventDefault(); void submit(); }}>
                  <label htmlFor="company-inquiry">{tr(locale, "你的咨询", "Your inquiry")}</label>
                  <textarea id="company-inquiry" value={content} maxLength={2000} disabled={busy}
                    onChange={event => setContent(event.target.value)} aria-describedby="company-inquiry-help" />
                  <small id="company-inquiry-help">{tr(locale, "1–2,000 字符。请不要填写密码、支付信息或其他敏感资料。", "1–2,000 characters. Do not include passwords, payment information or other sensitive data.")}</small>
                  {error && <p role="alert">{error}</p>}
                  {session.isPending ? <p role="status">{tr(locale, "正在检查登录…", "Checking sign-in…")}</p>
                    : session.data ? <button disabled={busy || !content.trim()} type="submit">
                      {tr(locale, busy ? "正在提交…" : "提交咨询", busy ? "Submitting…" : "Submit inquiry")}<ArrowRight size={16} /></button>
                      : <Link to={`/login?returnTo=${encodeURIComponent(returnTo)}`}>{tr(locale, "登录后提交咨询", "Sign in to submit an inquiry")}<ArrowRight size={16} /></Link>}
                </form>}
              {session.data && <section className="my-company-chats">
                <h3>{tr(locale, "我的咨询", "My inquiries")}</h3>
                <small>{tr(locale, "按创建时间排列，点击查看完整会话", "Newest inquiries first. Select one to read the conversation.")}</small>
                {threads.isPending && <p role="status">{tr(locale, "正在读取咨询…", "Loading inquiries…")}</p>}
                {threads.isError && <p role="alert">{tr(locale, "咨询列表读取失败", "Inquiries unavailable")}<button onClick={() => void threads.refetch()}>{tr(locale, "重试", "Retry")}</button></p>}
                {!threads.isPending && !threads.isError && !directory.length && <p>{tr(locale, "还没有咨询，提交后可在这里继续沟通。", "No inquiries yet. Submit one to continue the conversation here.")}</p>}
                <div className="company-inquiry-directory" role="region" aria-label={tr(locale, "咨询历史列表", "Inquiry history list")} tabIndex={0}>
                {directory.map(thread => <button key={thread.id} aria-pressed={params.get("thread") === thread.id} title={thread.subject}
                  onClick={() => {
                    setParams({ thread: thread.id });
                    requestAnimationFrame(() => chatPanel.current?.scrollIntoView?.({ block: "start", behavior: "auto" }));
                  }}>
                  <span>{thread.subject.slice(0, 80)}</span><small>{statusLabel(thread.status)}
                    {thread.createdAt && <> · {new Date(thread.createdAt).toLocaleDateString(locale)}</>}</small>
                </button>)}
                {threads.hasNextPage && <button disabled={threads.isFetching} onClick={() => void threads.fetchNextPage()}>
                  {tr(locale, threads.isFetchingNextPage ? "正在加载…" : "加载更早咨询", threads.isFetchingNextPage ? "Loading…" : "Load earlier inquiries")}
                </button>}
                </div>
                <div ref={chatPanel} className={params.get("thread") ? "company-selected-chat" : undefined}>
                  {params.get("thread") && <CustomerChat key={params.get("thread")} id={params.get("thread")!} audience="customer" locale={locale} />}
                </div>
              </section>}
            </section>
          </>}
    </main>
  </div>;
}
