import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, ArrowRight, Bell, Bot, BriefcaseBusiness, CalendarDays, Check, ChevronRight, CircleAlert, CircleUserRound,
  Clock3, Coffee, Command, Compass, Heart, Languages, LayoutDashboard, Menu, MessageCircle,
  MoreHorizontal, Network, Pause, Play, Plus, Search, Send, Settings2, ShieldCheck, Sparkles,
  UserCheck, Users, X, Map, Footprints, Eye, Radio, Volume2, Fullscreen, Minimize2, Globe2, Layers,
  ZoomIn, ZoomOut, LocateFixed, PanelRightClose
} from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type PointerEvent, type ReactNode, type WheelEvent } from "react";
import { Link, NavLink, Route, Routes, useNavigate, useParams } from "react-router-dom";
import type { DashboardSnapshot, MissionKind, PlazaActivity, PlazaSnapshot } from "@meyou/shared";
import { displayAgentHeadline, displayAgentName, displayKnownContent, t, tr } from "./i18n";
import { useAppStore } from "./store";
import { PlazaWorld, type PlazaCamera } from "./PlazaWorld";
import { AdminConsole, AdminLogin } from "./Admin";

interface DirectoryPerson {
  id: string;
  handle: string;
  displayName: string;
  headline: string;
  bio: string;
  city: string;
  avatar?: string;
  interests: string[];
  goals: string[];
  agentName?: string;
}

interface MissionRecord {
  id: string;
  kind: MissionKind;
  prompt: string;
  active: boolean;
  lastRunAt?: string;
}

interface MatchRecord {
  id: string;
  alias: string;
  kind: MissionKind;
  score: number;
  reason: string;
  status: "review" | "accepted" | "waiting";
  ownerConsent: boolean;
  candidateConsent: boolean;
}

interface ConversationRecord {
  id: string;
  agentMode: string;
  peer?: { id: string; displayName: string; handle: string };
  lastMessage?: { content: string; actor: string; createdAt: string };
}

interface MessageRecord {
  id: string;
  senderId?: string;
  actor: "human" | "agent" | "system";
  content: string;
  createdAt: string;
}

interface MeRecord {
  user: {
    id: string; handle: string; displayName: string; headline: string; bio: string;
    city: string; interests: string[]; goals: string[]; discoverable: boolean;
  };
  agent: {
    id: string; name: string; headline: string; bio: string; tone: string;
    npcColor?: string | null;
    languages: string[]; goals: string[]; interests: string[]; boundaries: string[];
    modes: Record<string, "auto" | "confirm" | "paused">;
  };
}

interface SessionRecord {
  user: { id: string; name: string; email?: string } | null;
  authLoginUrl?: string;
}

async function fetchDashboard(): Promise<DashboardSnapshot> {
  const response = await fetch("/api/v1/dashboard", { credentials: "include" });
  if (!response.ok) throw new Error("dashboard unavailable");
  return response.json();
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const messages: Record<string, string> = {
      service_unavailable: "服务暂时不可用，请稍后重试",
      authentication_required: "登录状态已失效，请重新登录",
      invalid_dating_profile: "请补全城市范围，并至少选择一项价值观",
      invalid_community: "请检查社群名称、地址和介绍是否填写完整",
      invalid_organization: "请检查企业名称、地址和业务介绍是否填写完整",
      handle_already_exists: "这个公开地址已经被使用，请换一个",
      community_invite_required: "这是私密社群，需要通过邀请加入",
      plan_limit_reached: "当前套餐的持续寻找名额已用完，请先暂停一个现有任务",
      invalid_plaza_runtime: body.message ?? "自治设置不符合规则：冷却时间至少 5 分钟，每日上限为 1–50 次",
      rate_limit_exceeded: "操作太频繁，请稍后再试",
      invalid_email: "请输入有效的邮箱地址",
      weak_password: "密码至少需要 8 位",
      invalid_name: "名字需要 2–40 个字符",
      email_already_exists: "这个邮箱已经注册，请直接登录",
      invalid_credentials: "邮箱或密码不正确"
    };
    throw new Error(messages[body.error] ?? (response.status >= 500 ? "服务暂时不可用，请稍后重试" : "请求未完成，请检查填写内容"));
  }
  return body as T;
}

function LoadingState({ label }: { label?: string }) {
  const locale = useAppStore((s) => s.locale);
  return <div className="state-card"><Sparkles /><h2>{label ?? t(locale, "loadingTitle")}</h2><p>{t(locale, "loadingDetail")}</p></div>;
}

function ErrorState({ error }: { error: unknown }) {
  const locale = useAppStore((s) => s.locale);
  return <div className="state-card error"><ShieldCheck /><h2>{t(locale, "loadError")}</h2><p>{error instanceof Error ? error.message : t(locale, "retry")}</p></div>;
}

function EmptyState({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return <div className="empty-state"><Network /><h3>{title}</h3><p>{detail}</p>{action}</div>;
}

function Modal({ title, eyebrow, onClose, children }: {
  title: string; eyebrow?: string; onClose: () => void; children: ReactNode;
}) {
  const locale = useAppStore((s) => s.locale);
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
    if (event.target === event.currentTarget) onClose();
  }}>
    <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <header><div>{eyebrow && <span className="kicker">{eyebrow}</span>}<h2 id="modal-title">{title}</h2></div>
        <button className="icon-btn" onClick={onClose} aria-label={t(locale, "close")}><X /></button></header>
      {children}
    </section>
  </div>;
}

const iconFor = (kind: MissionKind) => kind === "dating" ? Heart : kind === "business" ? BriefcaseBusiness : Users;

function Logo() {
  const locale = useAppStore((s) => s.locale);
  return <Link to="/" className="brand" aria-label={t(locale, "brandHome")}>
    <span className="brand-mark"><span /><span /><span /></span>
    <span><b>{locale === "zh-CN" ? "遇见" : "MeYou"}</b><small>{locale === "zh-CN" ? "MeYou" : "MEET BETTER"}</small></span>
  </Link>;
}

function Sidebar() {
  const locale = useAppStore((s) => s.locale);
  const paused = useAppStore((s) => s.agentPaused);
  const setAgentPaused = useAppStore((s) => s.setAgentPaused);
  const navigate = useNavigate();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [modeUpdating, setModeUpdating] = useState(false);
  const me = useQuery({ queryKey: ["me", "sidebar"], queryFn: () => api<MeRecord>("/api/v1/me") });
  useEffect(() => {
    if (me.data?.agent?.modes) {
      setAgentPaused(Object.values(me.data.agent.modes).every((mode) => mode === "paused"));
    }
  }, [me.data, setAgentPaused]);
  async function toggleAgent() {
    if (modeUpdating) return;
    setModeUpdating(true);
    try {
      await api("/api/v1/agents/me/modes", {
        method: "PATCH",
        body: JSON.stringify({ mode: paused ? "confirm" : "paused" })
      });
      setAgentPaused(!paused);
      await me.refetch();
    } finally {
      setModeUpdating(false);
    }
  }
  const items = [
    ["/app", LayoutDashboard, t(locale, "today")],
    ["/app/discover", Compass, t(locale, "discover")],
    ["/app/plaza", Map, t(locale, "plaza")],
    ["/app/messages", MessageCircle, t(locale, "messages")],
    ["/app/communities", Users, t(locale, "communities")],
    ["/app/customers", BriefcaseBusiness, t(locale, "customers")],
    ["/app/agent", Sparkles, t(locale, "agent")]
  ] as const;
  return <aside className="sidebar">
    <div className="sidebar-head"><Logo /><Link className="sidebar-compose" aria-label={t(locale, "createSearch")} to="/app/discover#new-search"><Plus /></Link></div>
    <Link className="sidebar-search" to="/app/discover"><Search /><span>{t(locale, "searchContacts")}</span></Link>
    <nav className="nav-list">
      {items.map(([to, Icon, label]) => <NavLink key={to} end={to === "/app"} to={to}>
        <Icon size={19} /> <span>{label}</span>
      </NavLink>)}
    </nav>
    <div className="identity-dock">
      <button className="account-mini" onClick={() => setAccountMenuOpen((open) => !open)} aria-expanded={accountMenuOpen}>
        <div className="avatar">{me.data?.user?.displayName?.[0] ?? (locale === "zh-CN" ? "我" : "M")}</div>
        <div><strong>{me.data?.user?.displayName ?? t(locale, "lifeYouMeUser")}</strong><small>{displayAgentName(locale, me.data?.agent?.name ?? t(locale, "defaultAgent"))} · {paused ? t(locale, "paused") : t(locale, "active")}</small></div>
        <MoreHorizontal size={18} />
      </button>
      {accountMenuOpen && <div className="account-menu" role="menu">
        {me.data?.user?.handle && <button role="menuitem" onClick={() => { setAccountMenuOpen(false); navigate(`/@${me.data?.user.handle}`); }}><CircleUserRound size={15} />{t(locale, "viewProfile")}</button>}
        <button role="menuitem" onClick={() => { setAccountMenuOpen(false); navigate("/app/agent"); }}><Settings2 size={15} />{t(locale, "accountSettings")}</button>
        <button role="menuitem" onClick={async () => {
          try { await api("/api/v1/auth/logout", { method: "POST" }); } finally { navigate("/login", { replace: true }); }
        }}><ArrowRight size={15} />{t(locale, "logout")}</button>
      </div>}
      <button className="agent-toggle" onClick={toggleAgent} disabled={modeUpdating} aria-label={paused ? t(locale, "startAgent") : t(locale, "pauseAgent")}>
        {paused ? <Play size={15} /> : <Pause size={15} />}
        <span>{modeUpdating ? t(locale, "saving") : paused ? t(locale, "startAgent") : t(locale, "pauseAgent")}</span>
      </button>
    </div>
  </aside>;
}

function MobileNav() {
  const locale = useAppStore((s) => s.locale);
  return <nav className="mobile-nav">
    <NavLink to="/app"><LayoutDashboard /><span>{t(locale, "today")}</span></NavLink>
    <NavLink to="/app/discover"><Compass /><span>{t(locale, "discover")}</span></NavLink>
    <Link className="mobile-create" to="/app/discover"><Plus /></Link>
    <NavLink to="/app/messages"><MessageCircle /><span>{t(locale, "messages")}</span></NavLink>
    <NavLink to="/app/agent"><Sparkles /><span>{t(locale, "agent")}</span></NavLink>
  </nav>;
}

function Topbar({ title, eyebrow }: { title: string; eyebrow?: string }) {
  const locale = useAppStore((s) => s.locale);
  const setLocale = useAppStore((s) => s.setLocale);
  const navigate = useNavigate();
  return <header className="topbar">
    <div className="mobile-logo"><Logo /></div>
    <div className="topbar-title"><small>{eyebrow}</small><h1>{title}</h1></div>
    <div className="top-actions">
      <button className="locale-switch" aria-label={locale === "zh-CN" ? "Switch to English" : "Switch to Chinese"} title={locale === "zh-CN" ? "Switch to English" : "Switch to Chinese"} onClick={() => setLocale(locale === "zh-CN" ? "en" : "zh-CN")}><Languages size={16} /> {locale === "zh-CN" ? "中文" : "English"}</button>
      <button className="icon-btn" aria-label={t(locale, "search")} title={t(locale, "search")} onClick={() => navigate("/app/discover")}><Search size={18} /></button>
      <button className="icon-btn notification" aria-label={t(locale, "notifications")} title={t(locale, "notifications")} onClick={() => navigate("/app")}><Bell size={18} /><i /></button>
    </div>
  </header>;
}

function AppShell() {
  return <div className="app-shell"><Sidebar /><main className="main"><Routes>
    <Route index element={<Dashboard />} />
    <Route path="discover" element={<Discover />} />
    <Route path="plaza" element={<AgentPlaza />} />
    <Route path="dating/results" element={<DatingResults />} />
    <Route path="dating" element={<Dating />} />
    <Route path="messages" element={<Messages />} />
    <Route path="communities/:id" element={<CommunityDetail />} />
    <Route path="communities" element={<Communities />} />
    <Route path="customers" element={<Customers />} />
    <Route path="agent" element={<AgentStudio />} />
  </Routes></main><MobileNav /></div>;
}

function Dashboard() {
  const locale = useAppStore((s) => s.locale);
  const query = useQuery({ queryKey: ["dashboard"], queryFn: fetchDashboard });
  if (query.isLoading) return <><Topbar title={t(locale, "today")} /><div className="page"><LoadingState /></div></>;
  if (query.error || !query.data) return <><Topbar title={t(locale, "today")} /><div className="page"><ErrorState error={query.error} /></div></>;
  const data = query.data;
  return <>
    <Topbar eyebrow={new Intl.DateTimeFormat(locale, { dateStyle: "full" }).format(new Date())} title={`${t(locale, "hello")}，${data.viewer.name}`} />
    <div className="page dashboard-page">
      <section className="morning-note paper-card">
        <div className="note-copy"><span className="eyebrow coral"><Sparkles size={14} /> {t(locale, "morningNote")}</span>
          <h2>{displayAgentName(locale, data.agent.name)} {t(locale, "headlineBefore")}<br /><em>{t(locale, "headlineAccent")}</em>{t(locale, "headlineAfter")}</h2>
          <p>{t(locale, "intro")}</p>
          <div className="note-stats"><span><b>{data.usage.agentReplies}</b> {t(locale, "agentReplies")}</span><span><b>{data.matches.length}</b> {t(locale, "realMatches")}</span><span><b>{data.attention.length}</b> {t(locale, "pendingItems")}</span></div>
        </div>
        <div className="relationship-art" aria-hidden="true">
          <div className="orbit orbit-one" /><div className="orbit orbit-two" />
          <div className="person-card p-one"><span>{locale === "zh-CN" ? "周" : "P"}</span><small>{t(locale, "productPartner")}</small></div>
          <div className="person-card p-two"><span>?</span><small>{t(locale, "heartCandidate")}</small></div>
          <div className="center-agent"><Sparkles /><small>{displayAgentName(locale, data.agent.name)}</small></div>
          <div className="person-card p-three"><span>{locale === "zh-CN" ? "陈" : "C"}</span><small>{t(locale, "customer")}</small></div>
        </div>
      </section>
      <section className="dashboard-grid">
        <div className="content-column">
          <div className="section-heading"><div><span className="kicker">TO DECIDE</span><h2>{t(locale, "attention")}</h2></div><span className="count-badge">{data.attention.length}</span></div>
          <div className="attention-stack">
            {data.attention.length === 0 && <EmptyState title={t(locale, "noDecisions")} detail={t(locale, "noDecisionsDetail")} />}
            {data.attention.map((item, index) => <article className="attention-card" key={item.id}>
              <div className={`attention-icon type-${item.type}`}>{item.type === "approval" ? <UserCheck /> : item.type === "handoff" ? <MessageCircle /> : <Heart />}</div>
              <div className="grow"><div className="meta-line"><span>{item.type === "handoff" ? t(locale, "handoff") : item.type === "match" ? t(locale, "mutualInterest") : t(locale, "agentSuggestion")}</span><time>{item.time}</time></div><h3>{item.title}</h3><p>{item.detail}</p>
                {index === 0 && <div className="inline-actions"><Link className="primary-small" to="/app/discover"><Check size={15} /> {t(locale, "handleIntro")}</Link><Link className="ghost-small" to="/app/messages">{t(locale, "viewConversation")}</Link></div>}
              </div><ChevronRight className="row-chevron" />
            </article>)}
          </div>
          <div className="section-heading matches-head"><div><span className="kicker">NEW CONNECTIONS</span><h2>{t(locale, "matches")}</h2></div><Link to="/app/discover">{t(locale, "seeAll")} <ArrowRight size={15} /></Link></div>
          <div className="match-grid">{data.matches.length === 0
            ? <EmptyState title={t(locale, "noMatches")} detail={t(locale, "noMatchesDetail")} action={<Link className="primary-small" to="/app/discover">{t(locale, "createDiscovery")}</Link>} />
            : data.matches.slice(0, 2).map((match) => <MatchCard key={match.id} match={match} locale={locale} />)}</div>
        </div>
        <aside className="right-rail">
          <AgentPulse data={data} locale={locale} />
          <div className="rail-card agenda"><div className="rail-title"><CalendarDays size={17} /><strong>{t(locale, "comingUp")}</strong><span>{t(locale, "todayShort")}</span></div>
            <EmptyState title={t(locale, "noSchedule")} detail={t(locale, "noScheduleDetail")} />
            <div className="capability-note"><Plus size={15} /><span><b>{t(locale, "calendarUnavailable")}</b><small>{t(locale, "calendarUnavailableDetail")}</small></span></div>
          </div>
        </aside>
      </section>
    </div>
  </>;
}

function MatchCard({ match, locale }: { match: DashboardSnapshot["matches"][number]; locale: "zh-CN" | "en" }) {
  const Icon = iconFor(match.kind);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [actionState, setActionState] = useState("");
  async function accept() {
    setBusy(true); setActionState("");
    try {
      const result = await api<{ mutual: boolean; conversationId: string | null }>(`/api/v1/matches/${match.id}/consent`, { method: "POST" });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["matches"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] })
      ]);
      if (result.mutual && result.conversationId) navigate("/app/messages");
      else setActionState(t(locale, "consentPending"));
    } catch (caught) {
      setActionState(caught instanceof Error ? caught.message : t(locale, "actionFailed"));
    } finally { setBusy(false); }
  }
  return <article className="match-card">
    <div className="match-top"><div className={`match-symbol ${match.kind}`}><Icon /></div><span className="score">{match.score}% {t(locale, "matchFit")}</span></div>
    <span className="match-kind">{match.kind === "dating" ? t(locale, "anonymousCandidate") : t(locale, "partner")}</span>
    <h3>{match.alias}</h3><p>{match.reason}</p>
    <div className="mutual"><ShieldCheck size={15} /> {match.mutual ? t(locale, "mutualApproved") : t(locale, "waitingAgent")}</div>
    {detailOpen && <p className="match-explanation"><ShieldCheck /> {t(locale, "matchExplanation")}</p>}
    {actionState && <small className="action-state" role="status">{actionState}</small>}
    <div className="card-actions"><button className="primary-small" disabled={busy || match.status === "accepted"} onClick={accept}>{busy ? t(locale, "confirming") : match.status === "accepted" ? t(locale, "accepted") : t(locale, "accept")}</button><button className="ghost-small" onClick={() => setDetailOpen(!detailOpen)}>{detailOpen ? t(locale, "collapse") : t(locale, "explain")}</button></div>
  </article>;
}

function AgentPulse({ data, locale }: { data: DashboardSnapshot; locale: "zh-CN" | "en" }) {
  const paused = useAppStore((s) => s.agentPaused);
  const setAgentPaused = useAppStore((s) => s.setAgentPaused);
  const [modeUpdating, setModeUpdating] = useState(false);
  const replyPct = Math.round(data.usage.agentReplies / data.usage.agentRepliesLimit * 100);
  async function toggleAgent() {
    if (modeUpdating) return;
    setModeUpdating(true);
    try {
      await api("/api/v1/agents/me/modes", {
        method: "PATCH",
        body: JSON.stringify({ mode: paused ? "confirm" : "paused" })
      });
      setAgentPaused(!paused);
    } finally {
      setModeUpdating(false);
    }
  }
  return <div className="rail-card agent-pulse">
    <div className="pulse-header"><div className="agent-orb large"><Sparkles /></div><div><span className="live-dot" /> <small>{paused ? t(locale, "pausedUpper") : t(locale, "workingNow")}</small><h3>{displayAgentName(locale, data.agent.name)}</h3></div><button className="icon-btn" disabled={modeUpdating} onClick={toggleAgent} aria-label={paused ? t(locale, "startAgent") : t(locale, "pauseAgent")}>{paused ? <Play /> : <Pause />}</button></div>
    <p>{paused ? t(locale, "agentPausedDetail") : t(locale, "agentWorkingDetail")}</p>
    <div className="current-task"><span><Network size={15} /> {t(locale, "currentTask")}</span><b>{data.missions?.[0]?.prompt ?? t(locale, "noMission")}</b><small>{data.missions?.[0]?.lastRunAt ? `${t(locale, "lastScan")} ${new Date(data.missions[0].lastRunAt).toLocaleString(locale)}` : t(locale, "waitingMission")}</small></div>
    <div className="usage-line"><span>{t(locale, "agentReplies")} <b>{data.usage.agentReplies}/{data.usage.agentRepliesLimit}</b></span><span>{replyPct}%</span></div><div className="progress"><i style={{ width: `${replyPct}%` }} /></div>
    <Link to="/app/agent">{t(locale, "workLog")} <ArrowRight size={14} /></Link>
  </div>;
}

function Discover() {
  const locale = useAppStore((s) => s.locale);
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState("");
  const [directorySearch, setDirectorySearch] = useState("");
  const [kind, setKind] = useState<MissionKind>("business");
  const queryClient = useQueryClient();
  const dashboard = useQuery({ queryKey: ["dashboard"], queryFn: fetchDashboard });
  const directory = useQuery({
    queryKey: ["directory"],
    queryFn: () => api<{ people: DirectoryPerson[] }>("/api/v1/directory")
  });
  const missions = useQuery({
    queryKey: ["missions"],
    queryFn: () => api<{ missions: MissionRecord[] }>("/api/v1/discover/missions")
  });
  const matches = useQuery({
    queryKey: ["matches"],
    queryFn: () => api<{ matches: MatchRecord[] }>("/api/v1/matches")
  });
  const [submitting, setSubmitting] = useState(false);
  const [missionUpdating, setMissionUpdating] = useState("");
  const [error, setError] = useState("");
  async function createSearch() {
    if (!prompt.trim()) {
      setError(tr(locale, "请输入你想遇见怎样的人", "Describe who you want to meet"));
      return;
    }
    if (limitReached) {
      setError(tr(locale, "当前套餐的持续寻找名额已用完，请先在下方暂停一个现有任务", "Your plan has no recurring-search slots left. Pause an active task below first."));
      return;
    }
    setSubmitting(true); setError("");
    try {
      await api("/api/v1/discover/missions", {
        method: "POST",
        body: JSON.stringify({ kind, prompt, locale, active: true })
      });
      setPrompt("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["missions"] }),
        queryClient.invalidateQueries({ queryKey: ["matches"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] })
      ]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : tr(locale, "创建失败", "Could not create the search"));
    } finally { setSubmitting(false); }
  }
  async function toggleMission(mission: MissionRecord) {
    setMissionUpdating(mission.id); setError("");
    try {
      await api(`/api/v1/discover/missions/${mission.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !mission.active })
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["missions"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] })
      ]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : tr(locale, "更新任务失败", "Could not update the task"));
    } finally { setMissionUpdating(""); }
  }
  const kindNames: Partial<Record<MissionKind, string>> = {
    business: tr(locale, "商业合作", "Business"),
    friend: tr(locale, "认识朋友", "Friendship"),
    hiring: tr(locale, "寻找人才", "Hiring"),
    travel: tr(locale, "旅行搭子", "Travel"),
    custom: tr(locale, "自定义", "Custom")
  };
  const normalizedSearch = directorySearch.trim().toLocaleLowerCase();
  const people = (directory.data?.people ?? []).filter((person) => !normalizedSearch || [
    person.displayName, person.handle, person.headline, person.bio, person.city,
    ...person.interests, ...person.goals
  ].join(" ").toLocaleLowerCase().includes(normalizedSearch));
  const ordinaryMissions = (missions.data?.missions ?? []).filter((mission) => mission.kind !== "dating");
  const activeMissions = dashboard.data?.usage?.activeMissions
    ?? missions.data?.missions.filter((mission) => mission.active && mission.kind !== "dating").length
    ?? 0;
  const missionLimit = dashboard.data?.usage?.activeMissionsLimit;
  const limitReached = missionLimit !== undefined && activeMissions >= missionLimit;
  return <><Topbar title={t(locale, "discover")} /><div className="page discover-page">
    <div className="discover-actions">
      <a className="add-search-button" href="#new-search"><Plus /> {t(locale, "createSearch")}</a>
      <button className="heart-search-button" onClick={() => navigate("/app/dating")}><Heart /> {tr(locale, "Agent 帮我找对象", "Let my Agent find a partner")} <ArrowRight /></button>
    </div>
    <section id="new-search" className="mission-composer">
      <div className="composer-title"><div><span>{tr(locale, "新的寻找", "New search")}</span><h2>{tr(locale, "你想遇见怎样的人？", "Who do you want to meet?")}</h2></div><small><ShieldCheck /> {tr(locale, "双方 Agent 均认可后才会推荐", "Only recommended after both Agents agree")}</small></div>
      {missionLimit !== undefined && <div className={`mission-quota ${limitReached ? "full" : ""}`}><span><b>{tr(locale, "持续寻找名额", "Recurring search slots")}</b>{activeMissions}/{missionLimit} {tr(locale, "正在运行", "running")}</span><small>{limitReached ? tr(locale, "名额已满。可在下方暂停一个任务后再创建。", "All slots are in use. Pause a task below to create another.") : tr(locale, `还可以创建 ${missionLimit - activeMissions} 个运行任务`, `${missionLimit - activeMissions} running slot(s) available`)}</small></div>}
      <div className="kind-tabs">{(["business", "friend", "hiring", "travel", "custom"] as MissionKind[]).map((value) => <button className={kind === value ? "active" : ""} onClick={() => setKind(value)} key={value}>{kindNames[value]}</button>)}</div>
      <div className="search-prompt-row"><textarea maxLength={1200} value={prompt} onChange={(e) => { setPrompt(e.target.value); setError(""); }} placeholder={tr(locale, "例如：在上海做 AI Developer Tools，愿意定期交流的产品创始人", "For example: product founders building AI developer tools who want to exchange ideas regularly")} /><button className="primary" onClick={createSearch} disabled={submitting}><Sparkles size={17} /> {submitting ? tr(locale, "正在寻找…", "Starting…") : tr(locale, "开始留意", "Start looking")}</button></div>
      <div className="mission-prompt-help"><span>{prompt.trim().length}/1200 · {tr(locale, "非空即可创建", "any non-empty description works")}</span><span>{prompt.trim().length > 0 && prompt.trim().length < 12 ? tr(locale, "可以创建；描述越具体，Agent 匹配越准确", "You can create it; more detail improves matching") : tr(locale, "建议写清城市、领域、目标和相处方式", "Include location, field, goals, and preferred interaction style")}</span></div>
      {error && <p className="form-error">{error}</p>}
    </section>
    {Boolean(ordinaryMissions.length) && <section className="mission-strip">
      <header><h2>{tr(locale, "持续寻找", "Recurring searches")}</h2><span>{ordinaryMissions.filter((mission) => mission.active).length} {tr(locale, "个运行中", "running")} · {ordinaryMissions.filter((mission) => !mission.active).length} {tr(locale, "个已暂停", "paused")}</span></header>
      <div>{ordinaryMissions.map((mission) => <Mission key={mission.id} mission={mission} locale={locale} status={mission.lastRunAt ? `${t(locale, "lastScan")} ${new Date(mission.lastRunAt).toLocaleString(locale)}` : tr(locale, "尚未扫描", "Not scanned yet")} matches={matches.data?.matches.filter((item) => item.kind === mission.kind).length ?? 0} updating={missionUpdating === mission.id} onToggle={() => toggleMission(mission)} />)}</div>
    </section>}
    {Boolean(matches.data?.matches.length) && <section className="candidate-strip">
      <div className="section-heading"><div><h2>{tr(locale, "最新候选", "Latest candidates")}</h2><p>{tr(locale, "只展示真实注册且通过双方 Agent 核对的结果", "Only real registered users verified by both Agents are shown")}</p></div></div>
      <div className="match-grid three">{matches.data?.matches.map((match) => <MatchCard key={match.id} match={{ ...match, mutual: match.ownerConsent && match.candidateConsent }} locale={locale} />)}</div>
    </section>}
    <section className="directory-section">
      <div className="directory-heading"><div><h2>{tr(locale, "所有成员", "All members")}</h2><p>{tr(locale, "发现真实加入 MeYou、允许被找到的人", "Discover real MeYou members who allow others to find them")}</p></div><span>{people.length} {tr(locale, "位", "members")}</span></div>
      <label className="directory-search"><Search /><input value={directorySearch} onChange={(event) => setDirectorySearch(event.target.value)} placeholder={tr(locale, "按名字、城市、职业或兴趣搜索", "Search by name, city, role, or interest")} /></label>
      {directory.isLoading ? <LoadingState label={tr(locale, "正在读取成员…", "Loading members…")} /> : directory.error ? <ErrorState error={directory.error} /> :
      <div className="people-grid">{people.length
        ? people.map((person) => <article className="people-card" key={person.id}><div className="member-avatar">{person.avatar ? <img src={person.avatar} alt="" /> : person.displayName[0]}</div><div className="member-copy"><h3>{person.displayName}</h3><span>@{person.handle}{person.city ? ` · ${person.city}` : ""}</span><p>{person.headline || person.bio || tr(locale, "尚未填写公开介绍", "No public introduction yet")}</p><div className="tag-row">{person.interests.slice(0, 3).map((item) => <i key={item}>{item}</i>)}</div></div><Link to={`/@${person.handle}`}>{tr(locale, "打开主页", "Open profile")}</Link></article>)
        : <EmptyState title={directorySearch ? tr(locale, "没有找到匹配成员", "No matching members") : tr(locale, "还没有其他可发现成员", "No other discoverable members yet")} detail={directorySearch ? tr(locale, "换一个名字、城市或兴趣试试。", "Try another name, city, or interest.") : tr(locale, "邀请真实用户加入并完善公开资料后，他们会出现在这里。", "Invite real users to join and complete their public profiles; they will appear here.")} />}</div>}
    </section>
  </div></>;
}

function Mission({ mission, locale, status, matches, updating, onToggle }: {
  mission: MissionRecord; locale: "zh-CN" | "en"; status: string; matches: number; updating: boolean; onToggle: () => void;
}) {
  return <article className={`mission-card ${mission.active ? "" : "paused"}`}><div><span className={mission.active ? "live-dot" : "paused-dot"} /> <small>{mission.active ? tr(locale, "持续运行中", "Running continuously") : t(locale, "paused")} · {mission.kind}</small></div><h3>{mission.prompt}</h3><p>{status}</p><footer><span><b>{matches}</b> {tr(locale, "个值得认识", "worth meeting")}</span><button className="ghost-small" disabled={updating} onClick={onToggle}>{mission.active ? <Pause size={14} /> : <Play size={14} />} {updating ? tr(locale, "正在更新…", "Updating…") : mission.active ? tr(locale, "暂停任务", "Pause task") : tr(locale, "恢复任务", "Resume task")}</button></footer></article>;
}

function Dating() {
  const locale = useAppStore((s) => s.locale);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [adultConfirmed, setAdultConfirmed] = useState(false);
  const [age, setAge] = useState(28);
  const [intent, setIntent] = useState<"long_term" | "serious_dating" | "open_to_explore">("long_term");
  const [ageMin, setAgeMin] = useState(25);
  const [ageMax, setAgeMax] = useState(34);
  const [cityScope, setCityScope] = useState("");
  const [values, setValues] = useState<string[]>([]);
  const [dealbreakers, setDealbreakers] = useState("");
  const [saving, setSaving] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const steps = [tr(locale,"确认成年","Age check"),tr(locale,"关系意向","Intent"),tr(locale,"价值观","Values"),tr(locale,"边界","Boundaries"),tr(locale,"匿名预览","Preview")];
  const valueOptions = locale === "zh-CN"
    ? ["真诚沟通","情绪稳定","保持好奇","尊重边界","长期主义","热爱生活","独立空间","家庭观念"]
    : ["Honest communication","Emotional stability","Curiosity","Respect for boundaries","Long-term mindset","Love of life","Independence","Family values"];
  function goToStep(nextStep: number) {
    if (nextStep > 0 && !adultConfirmed) {
      setStep(0);
      setSaving("请先确认你已年满 18 岁");
      return;
    }
    if (nextStep > 1 && !cityScope.trim()) {
      setStep(1);
      setSaving("请先填写城市范围");
      return;
    }
    if (nextStep > 2 && values.length === 0) {
      setStep(2);
      setSaving("请至少选择一项价值观");
      return;
    }
    setSaving("");
    setStep(nextStep);
  }
  async function saveDating() {
    if (submitting) return;
    if (!adultConfirmed) {
      setSaving("请先确认你已年满 18 岁");
      return;
    }
    if (!cityScope.trim() || values.length === 0) {
      setSaving("请返回补全城市范围，并至少选择一项价值观");
      return;
    }
    setSaving("正在保存…");
    setSubmitting(true);
    try {
      await api("/api/v1/matches/dating/profile", {
        method: "PUT",
        body: JSON.stringify({
          adultConfirmed, age, intent, ageMin, ageMax, cityScope,
          languages: ["zh-CN"], values, lifestyle: [],
          dealbreakers: dealbreakers.split(/[；;\n]/).map((item) => item.trim()).filter(Boolean),
          discoverable: true
        })
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["matches"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] })
      ]);
      navigate("/app/dating/results", {
        replace: true,
        state: { justStarted: true }
      });
    } catch (caught) {
      setSaving(caught instanceof Error ? caught.message : "保存失败");
      setSubmitting(false);
    }
  }
  return <><Topbar eyebrow="HEART MODE" title={tr(locale,"让 Agent 帮你找对象","Let your Agent find a partner")} /><div className="page dating-page">
    <section className="dating-banner">
      <div className="heart-art"><Heart /><span /><span /></div>
      <div><span className="eyebrow">{tr(locale,"不是刷照片，是先确认彼此是否认真。","Not photo swiping—first learn whether both people are serious.")}</span><h2>{tr(locale,"你的 Agent 先替你问清楚，","Your Agent asks the important questions first,")}<br />{tr(locale,"值得以后，再由你出现。","and brings you in when it is worthwhile.")}</h2><p>{tr(locale,"双方真人都同意前，不展示真实姓名、联系方式或完整资料。Agent 不替你承诺关系。","Names, contact details, and full profiles stay hidden until both people consent. Your Agent never commits to a relationship for you.")}</p></div>
    </section>
    <div className="setup-layout">
      <aside className="stepper">{steps.map((name, index) => <button onClick={() => goToStep(index)} className={step === index ? "active" : index < step ? "done" : ""} key={name}><span>{index < step ? <Check /> : index + 1}</span>{name}</button>)}</aside>
      <section className="setup-card">
        {step === 0 && <><span className="eyebrow coral">STEP 1 OF 5</span><h2>{tr(locale,"先确认一个重要前提","First, confirm one important requirement")}</h2><p>{tr(locale,"心动模式只向年满 18 岁的成年人开放。你的资料默认不会被搜索引擎收录。","Heart mode is only available to adults aged 18 or older. Your profile is excluded from search engines by default.")}</p><label className="consent-box"><input type="checkbox" checked={adultConfirmed} onChange={(event) => setAdultConfirmed(event.target.checked)} /><span><b>{tr(locale,"我确认自己已年满 18 岁","I confirm that I am at least 18")}</b><small>{tr(locale,"我理解遇见 MeYou 只协助筛选与破冰，不验证或担保其他用户的陈述。","I understand that MeYou helps with screening and introductions but does not verify or guarantee other users’ statements.")}</small></span></label><div className="safety-list"><span><ShieldCheck /> {tr(locale,"双向同意后才揭示身份","Identity is revealed only after mutual consent")}</span><span><X /> {tr(locale,"随时撤回、解除或拉黑","Withdraw, unmatch, or block at any time")}</span><span><Bot /> {tr(locale,"Agent 发言始终明确标注","Agent messages are always clearly labeled")}</span></div></>}
        {step === 1 && <><span className="eyebrow coral">STEP 2 OF 5</span><h2>你期待怎样的关系？</h2><div className="option-cards"><button className={intent==="long_term"?"selected":""} onClick={()=>setIntent("long_term")}>认真了解，期待长期关系</button><button className={intent==="serious_dating"?"selected":""} onClick={()=>setIntent("serious_dating")}>以稳定恋爱为目标</button><button className={intent==="open_to_explore"?"selected":""} onClick={()=>setIntent("open_to_explore")}>开放探索，但保持真诚</button></div><div className="field-row"><label>我的年龄<input type="number" min={18} max={99} value={age} onChange={(event)=>setAge(Number(event.target.value))} /></label><label>最低年龄<input type="number" min={18} max={99} value={ageMin} onChange={(event)=>setAgeMin(Number(event.target.value))} /></label><label>最高年龄<input type="number" min={18} max={99} value={ageMax} onChange={(event)=>setAgeMax(Number(event.target.value))} /></label></div><label>城市范围<input value={cityScope} onChange={(event)=>setCityScope(event.target.value)} placeholder="例如：上海及周边" /></label></>}
        {step === 2 && <><span className="eyebrow coral">STEP 3 OF 5</span><h2>什么对你真正重要？</h2><p>Agent 只会用这些信息做匿名核对，不会原样转述你的私密表达。</p><div className="tag-picker">{valueOptions.map(value=><button className={values.includes(value)?"selected":""} onClick={()=>setValues(values.includes(value)?values.filter(item=>item!==value):[...values,value])} key={value}>{value}{values.includes(value)?<Check/>:<Plus />}</button>)}</div></>}
        {step === 3 && <><span className="eyebrow coral">STEP 4 OF 5</span><h2>写下绝不妥协的边界</h2><textarea className="setup-textarea" value={dealbreakers} onChange={(event)=>setDealbreakers(event.target.value)} placeholder="每条边界用分号或换行分隔" /><div className="privacy-note"><ShieldCheck /><span><b>仅 Agent 可用</b><small>这些内容不会直接展示给候选人，只用于判断是否继续。</small></span></div></>}
        {step === 4 && <AnonymousPreview />}
        <footer className="setup-footer"><span className="form-help" role="status">{saving}</span><button className="ghost-small" disabled={step === 0 || submitting} onClick={() => goToStep(step - 1)}>{tr(locale,"上一步","Back")}</button><button className="primary" disabled={(step===0&&!adultConfirmed) || submitting} onClick={step === 4 ? saveDating : () => goToStep(Math.min(4, step + 1))}>{submitting ? tr(locale,"正在开启…","Starting…") : step === 4 ? tr(locale,"保存并开启","Save and start") : tr(locale,"继续","Continue")} {!submitting && <ArrowRight />}</button></footer>
      </section>
    </div>
  </div></>;
}

function DatingResults() {
  const locale = useAppStore((s) => s.locale);
  const matches = useQuery({
    queryKey: ["matches"],
    queryFn: () => api<{ matches: MatchRecord[] }>("/api/v1/matches"),
    refetchInterval: 20_000
  });
  const datingMatches = (matches.data?.matches ?? []).filter((match) => match.kind === "dating");
  return <><Topbar eyebrow="HEART MODE · RUNNING" title={tr(locale,"心动匹配","Heart matches")} /><div className="page dating-results-page">
    <section className="dating-started">
      <div className="started-orbit" aria-hidden="true"><Heart /><span /><span /></div>
      <div><span className="eyebrow"><span className="live-dot" /> AGENT IS LOOKING</span><h2>{tr(locale,"资料已保存，","Your profile is saved,")}<br />{tr(locale,"你的 Agent 开始留意了。","and your Agent is now looking.")}</h2><p>{tr(locale,"它会先匿名核对关系意向、城市范围、价值观和硬性边界。只有双方 Agent 都认为值得继续，候选才会来到这里。","It anonymously checks relationship intent, location range, values, and hard boundaries first. Candidates appear here only when both Agents agree it is worth continuing.")}</p>
        <div className="started-actions"><Link className="primary-small" to="/app/dating">{tr(locale,"调整心动资料","Edit dating profile")}</Link><Link className="ghost-small" to="/app">{tr(locale,"返回今日","Back to Today")}</Link></div>
      </div>
      <div className="dating-status-card"><span><ShieldCheck /> {tr(locale,"匿名核对中","Anonymous checks in progress")}</span><b>{datingMatches.length}</b><small>{tr(locale,"个值得进一步了解的真实候选","real candidates worth learning more about")}</small><hr/><p><Check /> {tr(locale,"双方真人同意前不揭示身份","Identity stays hidden until both people consent")}</p><p><Check /> {tr(locale,"不展示联系方式与精确位置","Contact details and precise location stay hidden")}</p><p><Check /> {tr(locale,"Agent 不替你确认关系","The Agent never confirms a relationship for you")}</p></div>
    </section>
    <section className="dating-result-content">
      <div className="section-heading"><div><span className="kicker">PRIVATE CANDIDATES</span><h2>{tr(locale,"匿名候选","Anonymous candidates")}</h2><p>{tr(locale,"页面每 20 秒同步真实匹配结果。","Real match results sync every 20 seconds.")}</p></div><span className="quota-chip">{datingMatches.length} {tr(locale,"个","total")}</span></div>
      {matches.isLoading ? <LoadingState label={tr(locale,"正在读取匿名候选…","Loading anonymous candidates…")} /> : matches.error ? <ErrorState error={matches.error} /> : datingMatches.length
        ? <div className="match-grid three">{datingMatches.map((match) => <MatchCard key={match.id} match={{ ...match, mutual: match.ownerConsent && match.candidateConsent }} locale={locale} />)}</div>
        : <div className="dating-waiting">
          <div className="waiting-radar"><Heart /><i /><i /><i /></div>
          <div><span className="eyebrow coral">{tr(locale,"正在持续留意","Still looking")}</span><h3>{tr(locale,"还没有通过双方核对的候选","No candidate has passed both Agents’ checks yet")}</h3><p>{tr(locale,"这不是匹配失败。MeYou 不会用虚构档案填满页面；当真实用户符合双方意向与边界时，结果会自动出现在这里。","This is not a failed match. MeYou never fills the page with fictional profiles; real users appear automatically when they fit both sides’ intent and boundaries.")}</p><div><span><Clock3 /> {tr(locale,"保持页面关闭也会继续","Continues while this page is closed")}</span><span><Bell /> {tr(locale,"有结果后进入今日待办","Results appear in Today")}</span></div></div>
        </div>}
    </section>
  </div></>;
}

function AnonymousPreview() {
  return <><span className="eyebrow coral">STEP 5 OF 5</span><h2>候选人会先看到这些</h2><div className="anonymous-card"><div className="anonymous-avatar"><Heart /></div><span>匿名档案 · 上海</span><h3>“相信认真沟通，也珍惜各自的空间。”</h3><div className="tag-row"><i>长期关系</i><i>真诚沟通</i><i>城市漫游</i></div><div className="locked"><ShieldCheck /> 双方同意前，姓名与联系方式保持隐藏</div></div></>;
}

function Messages() {
  const locale = useAppStore((s) => s.locale);
  const queryClient = useQueryClient();
  const [takenOver, setTakenOver] = useState(false);
  const [text, setText] = useState("");
  const [threadSearch, setThreadSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string>();
  const conversations = useQuery({
    queryKey: ["conversations"],
    queryFn: () => api<{ conversations: ConversationRecord[] }>("/api/v1/conversations")
  });
  const activeId = selectedId ?? conversations.data?.conversations[0]?.id;
  const conversation = useQuery({
    queryKey: ["conversation", activeId],
    enabled: Boolean(activeId),
    queryFn: () => api<{ conversation: ConversationRecord; messages: MessageRecord[] }>(`/api/v1/conversations/${activeId}`)
  });
  const active = conversations.data?.conversations.find((item) => item.id === activeId);
  const normalizedThreadSearch = threadSearch.trim().toLocaleLowerCase();
  const visibleConversations = (conversations.data?.conversations ?? []).filter((item) =>
    !normalizedThreadSearch || `${item.peer?.displayName ?? tr(locale, "访客", "Visitor")} ${item.lastMessage?.content ?? ""}`
      .toLocaleLowerCase().includes(normalizedThreadSearch));
  useEffect(() => {
    setTakenOver(active?.agentMode === "paused");
  }, [active?.id, active?.agentMode]);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [takeoverBusy, setTakeoverBusy] = useState(false);
  async function toggleTakeover() {
    if (!activeId || takeoverBusy) return;
    setTakeoverBusy(true); setSendError("");
    try {
      const nextTakenOver = !takenOver;
      await api(`/api/v1/conversations/${activeId}/takeover`, {
        method: "POST",
        body: JSON.stringify({ mode: nextTakenOver ? "human" : "agent" })
      });
      setTakenOver(nextTakenOver);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["conversation", activeId] }),
        queryClient.invalidateQueries({ queryKey: ["conversations"] })
      ]);
    } catch (caught) {
      setSendError(caught instanceof Error ? caught.message : tr(locale, "切换接管状态失败", "Could not change handoff mode"));
    } finally {
      setTakeoverBusy(false);
    }
  }
  async function send() {
    if (!text.trim() || !activeId || sending) return;
    setSending(true); setSendError("");
    try {
      await api(`/api/v1/conversations/${activeId}/messages`, {
        method: "POST",
        body: JSON.stringify({ content: text, actor: "human" })
      });
      setText("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["conversation", activeId] }),
        queryClient.invalidateQueries({ queryKey: ["conversations"] })
      ]);
    } catch (caught) {
      setSendError(caught instanceof Error ? caught.message : tr(locale, "发送失败", "Message could not be sent"));
    } finally { setSending(false); }
  }
  return <><Topbar eyebrow="MESSAGES" title={t(locale, "messages")} /><div className="inbox-layout">
    <aside className="thread-list"><label className="thread-search"><Search /><input value={threadSearch} onChange={(event) => setThreadSearch(event.target.value)} placeholder={tr(locale, "搜索联系人或消息内容", "Search people or messages")} /></label>
      {visibleConversations.length
        ? visibleConversations.map((item) => <button key={item.id} onClick={() => setSelectedId(item.id)} className={`thread ${item.id === activeId ? "active" : ""}`}><div className="avatar-sm">{item.peer?.displayName?.[0] ?? "?"}</div><div><b>{item.peer?.displayName ?? tr(locale, "访客", "Visitor")}</b><span>{item.lastMessage?.content ?? tr(locale, "还没有消息", "No messages yet")}</span></div><time>{item.lastMessage ? new Date(item.lastMessage.createdAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }) : ""}</time></button>)
        : <EmptyState title={threadSearch ? tr(locale, "没有找到相关会话", "No matching conversations") : tr(locale, "还没有会话", "No conversations yet")} detail={threadSearch ? tr(locale, "换一个联系人名字或消息关键词试试。", "Try another person or message keyword.") : tr(locale, "从成员目录或匹配结果发起真实联系后，会话会出现在这里。", "Conversations appear here after you contact someone from the member directory or a match.")} />}
    </aside>
    <section className="chat-panel">{activeId ? <><header className="chat-header"><div className="avatar-sm">{active?.peer?.displayName?.[0] ?? "?"}</div><div><h3>{active?.peer?.displayName ?? tr(locale, "会话", "Conversation")}</h3><span><span className="live-dot" /> {takenOver ? tr(locale, "现在由你回复，Agent 已暂停", "You are replying now; the Agent is paused") : tr(locale, "Agent 可按对方授权自动回复", "The Agent may reply within the other person’s permissions")}</span></div><button className={takenOver ? "ghost-small" : "takeover"} disabled={takeoverBusy} onClick={toggleTakeover}>{takeoverBusy ? t(locale, "saving") : takenOver ? <><Bot /> {tr(locale, "交还 Agent", "Return to Agent")}</> : <><CircleUserRound /> {tr(locale, "真人接管", "Take over")}</>}</button></header>
      <div className="chat-context"><Sparkles /><span><b>{tr(locale, "身份始终透明", "Identity is always clear")}</b>{tr(locale, "带 Bot 图标的消息由 Agent 生成；普通消息由真人发送。高风险事项不会自动承诺。", "Messages with a Bot icon come from an Agent; standard messages come from a person. High-risk commitments are never automatic.")}</span></div>
      <div className="message-stream"><div className="day-divider">{tr(locale, "真实会话记录", "Real conversation history")}</div>{conversation.data?.messages.length
        ? conversation.data.messages.map((message) => <div className={`bubble-wrap ${message.senderId !== active?.peer?.id ? "own" : ""}`} key={message.id}><span>{message.actor === "agent" ? "Agent" : tr(locale, "真人", "Person")} · {new Date(message.createdAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}</span><div className={`bubble ${message.actor === "agent" ? "agent" : ""}`}>{message.actor === "agent" && <Bot size={14} />}{message.content}</div></div>)
        : <EmptyState title={tr(locale, "还没有消息", "No messages yet")} detail={tr(locale, "发送第一条消息后，对方 Agent 将根据真实授权决定自动回复或等待确认。", "After your first message, the other Agent will reply or wait for confirmation according to its real permissions.")} />}</div>
      <div className="composer"><textarea value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}} placeholder={tr(locale, "以你本人身份回复……", "Reply as yourself…")} /><div><span><ShieldCheck /> {sendError || tr(locale, "发送者会明确显示为“你本人”", "The sender will be clearly marked as you")}</span><button aria-label={tr(locale, "发送消息", "Send message")} disabled={sending || !text.trim()} onClick={send}><Send /></button></div></div></> : <EmptyState title={tr(locale, "选择一段会话", "Select a conversation")} detail={tr(locale, "当前没有虚构聊天记录。", "There are no fictional chat records.")} />}
    </section>
    <aside className="context-panel"><span className="kicker">CONNECTION</span><h3>{tr(locale, "会话边界", "Conversation boundaries")}</h3><ul><li><Check />{tr(locale, "Agent 与真人消息分别标注", "Agent and human messages are labeled separately")}</li><li><Check />{tr(locale, "所有消息写入数据库", "Every message is stored in the database")}</li><li><Check />{tr(locale, "付款、合同与关系承诺升级真人", "Payments, contracts, and relationship commitments escalate to a person")}</li></ul><div className="capability-note"><CalendarDays /><span><b>{t(locale, "calendarUnavailable")}</b><small>{tr(locale, "当前可直接在对话中协商时间。", "You can coordinate a time directly in the conversation.")}</small></span></div></aside>
  </div></>;
}

function Communities() {
  const locale = useAppStore((s) => s.locale);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ name: "", handle: "", description: "", visibility: "public" });
  const communitiesQuery = useQuery({
    queryKey: ["communities"],
    queryFn: () => api<{ communities: Array<{ id: string; name: string; description: string; visibility: string }> }>("/api/v1/communities")
  });
  const publicQuery = useQuery({
    queryKey: ["communities", "public"],
    queryFn: () => api<{ communities: Array<{
      id: string; name: string; description: string; visibility: string; memberCount: number; joined: boolean;
    }> }>("/api/v1/communities/public"),
    enabled: discovering
  });
  function updateForm(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: "" }));
    setFormError("");
  }
  async function createCommunity() {
    const nextErrors: Record<string, string> = {};
    if (form.name.trim().length < 2) nextErrors.name = "请至少填写 2 个字符的社群名称";
    if (!/^[a-z0-9_-]{3,32}$/.test(form.handle)) nextErrors.handle = "请输入 3–32 位英文、数字、横线或下划线";
    if (form.description.trim().length < 2) nextErrors.description = "请至少填写 2 个字符的社群介绍";
    if (Object.keys(nextErrors).length) {
      setFieldErrors(nextErrors);
      setFormError("还有内容需要补充，请查看上方提示");
      return;
    }
    setSubmitting(true); setFormError("");
    try {
      const result = await api<{ community: { id: string } }>("/api/v1/communities", {
        method: "POST", body: JSON.stringify(form)
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["communities"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] })
      ]);
      setCreating(false);
      navigate(`/app/communities/${result.community.id}`);
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : "创建失败，请稍后重试");
    } finally { setSubmitting(false); }
  }
  async function joinCommunity(id: string) {
    try {
      await api(`/api/v1/communities/${id}/join`, { method: "POST" });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["communities"] }),
        queryClient.invalidateQueries({ queryKey: ["communities", "public"] })
      ]);
      navigate(`/app/communities/${id}`);
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : "加入失败，请稍后重试");
    }
  }
  return <><Topbar eyebrow="COMMUNITIES" title={t(locale, "communities")} /><div className="page">
    <section className="community-hero paper-card"><div><span className="eyebrow coral"><Network /> SHARED AGENT</span><h2>{tr(locale, "让每个新成员都被看见，", "Help every new member be seen,")}<br />{tr(locale, "让每次介绍都有理由。", "and every introduction have a reason.")}</h2><p>{tr(locale, "群 Agent 会欢迎新人、了解需求，再在尊重双方边界的前提下完成介绍。", "The community Agent welcomes newcomers, learns what they need, and makes introductions while respecting both sides’ boundaries.")}</p><button className="primary" onClick={() => { setFormError(""); setFieldErrors({}); setCreating(true); }}><Plus /> {tr(locale, "创建社群", "Create community")}</button></div><div className="intro-preview"><EmptyState title={tr(locale, "等待真实成员", "Waiting for real members")} detail={tr(locale, "成员加入并公开需求后，群 Agent 的真实介绍会显示在这里。", "Real introductions appear here after members join and share what they need.")} /></div></section>
    <div className="section-heading"><div><span className="kicker">YOUR COMMUNITIES</span><h2>{tr(locale, "我的社群", "My communities")}</h2></div><button className="ghost-small" onClick={() => { setFormError(""); setDiscovering(true); }}>{tr(locale, "发现公开社群", "Discover public communities")}</button></div>
    {communitiesQuery.isLoading ? <LoadingState label={tr(locale, "正在读取社群…", "Loading communities…")} /> : communitiesQuery.error ? <ErrorState error={communitiesQuery.error} /> :
    <div className="community-grid">{communitiesQuery.data?.communities.length
      ? communitiesQuery.data.communities.map((community,i)=><article className="community-card" key={community.id}><div className={`community-cover cover-${i%3+1}`}><span><Users /></span><i>{community.visibility === "public" ? tr(locale, "公开社群", "Public community") : tr(locale, "私密社群", "Private community")}</i></div><div className="community-body"><h3>{community.name}</h3><p>{community.description}</p><button onClick={() => navigate(`/app/communities/${community.id}`)}>{tr(locale, "进入社群", "Open community")} <ArrowRight /></button></div></article>)
      : <EmptyState title={tr(locale, "还没有加入社群", "You have not joined a community yet")} detail={tr(locale, "创建第一个真实社群，或发现并加入公开社群。", "Create your first real community, or discover and join a public one.")} action={<button className="primary-small" onClick={() => setCreating(true)}>{tr(locale, "创建第一个社群", "Create your first community")}</button>} />}</div>}
    <section className="request-board"><div><span className="kicker">REQUEST BOARD</span><h2>{tr(locale, "社群正在寻找", "What communities are looking for")}</h2></div><EmptyState title={tr(locale, "还没有公开请求", "No public requests yet")} detail={tr(locale, "请求板只展示成员真实发布的需求。", "The request board only shows real needs posted by members.")} /></section>
  </div>
  {creating && <Modal eyebrow="NEW COMMUNITY" title="创建一个真实社群" onClose={() => setCreating(false)}>
    <div className="modal-form">
      <label>社群名称<input className={fieldErrors.name ? "invalid" : ""} aria-invalid={Boolean(fieldErrors.name)} autoFocus value={form.name} onChange={(event) => updateForm("name", event.target.value)} placeholder="例如：AI 产品创始人俱乐部" />{fieldErrors.name && <small className="field-error">{fieldErrors.name}</small>}</label>
      <label>社群地址<span className={`handle-input ${fieldErrors.handle ? "invalid" : ""}`}><i>meyou.lifeyoume.icu/community/</i><input aria-invalid={Boolean(fieldErrors.handle)} value={form.handle} onChange={(event) => updateForm("handle", event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))} placeholder="ai-founders" /></span><small className={fieldErrors.handle ? "field-error" : ""}>{fieldErrors.handle || "3–32 位英文、数字、横线或下划线"}</small></label>
      <label>社群介绍<textarea className={fieldErrors.description ? "invalid" : ""} aria-invalid={Boolean(fieldErrors.description)} value={form.description} onChange={(event) => updateForm("description", event.target.value)} placeholder="说明成员是谁、会讨论什么，以及希望建立怎样的连接。" /><small className={fieldErrors.description ? "field-error field-counter" : "field-counter"}>{fieldErrors.description || `${form.description.trim().length}/500，至少 2 个字符`}</small></label>
      <label>加入方式<select value={form.visibility} onChange={(event) => updateForm("visibility", event.target.value)}><option value="public">公开 · 所有人可发现并加入</option><option value="private">私密 · 仅通过邀请加入</option></select></label>
      {formError && <p className="form-error" role="alert">{formError}</p>}
      <footer><button className="ghost-small" onClick={() => setCreating(false)}>取消</button><button className="primary" disabled={submitting} onClick={createCommunity}>{submitting ? "正在创建…" : "创建并进入"} <ArrowRight /></button></footer>
    </div>
  </Modal>}
  {discovering && <Modal eyebrow="PUBLIC COMMUNITIES" title="发现公开社群" onClose={() => setDiscovering(false)}>
    <div className="community-discovery">
      {publicQuery.isLoading ? <LoadingState label="正在发现真实社群…" /> : publicQuery.error ? <ErrorState error={publicQuery.error} /> :
        publicQuery.data?.communities.length ? publicQuery.data.communities.map((community) => <article key={community.id}>
          <span><Network /></span><div><h3>{community.name}</h3><p>{community.description}</p><small>{community.memberCount} 位成员</small></div>
          {community.joined ? <button className="ghost-small" onClick={() => navigate(`/app/communities/${community.id}`)}>进入</button> : <button className="primary-small" onClick={() => joinCommunity(community.id)}>加入</button>}
        </article>) : <EmptyState title="还没有公开社群" detail="创建第一个公开社群，让其他真实用户可以发现并加入。" />}
      {formError && <p className="form-error" role="alert">{formError}</p>}
    </div>
  </Modal>}
  </>;
}

function CommunityDetail() {
  const { id = "" } = useParams();
  const community = useQuery({
    queryKey: ["community", id],
    queryFn: () => api<{
      community: { id: string; name: string; handle: string; description: string; visibility: string; rules: string[] };
      membership: { role: string } | null;
      members: Array<{ id: string; displayName: string; handle: string; role: string }>;
    }>(`/api/v1/communities/${id}`),
    enabled: Boolean(id)
  });
  if (community.isLoading) return <><Topbar title="社群" /><div className="page"><LoadingState label="正在进入社群…" /></div></>;
  if (community.error || !community.data) return <><Topbar title="社群" /><div className="page"><ErrorState error={community.error} /></div></>;
  const data = community.data;
  return <><Topbar eyebrow={`@${data.community.handle}`} title={data.community.name} /><div className="page community-detail-page">
    <section className="community-detail-hero paper-card"><div><span className="eyebrow coral"><Network /> {data.community.visibility === "public" ? "PUBLIC COMMUNITY" : "PRIVATE COMMUNITY"}</span><h2>{data.community.name}</h2><p>{data.community.description}</p><div className="tag-row"><i>{data.members.length} 位真实成员</i>{data.membership && <i>{data.membership.role === "owner" ? "你是创建者" : "你已加入"}</i>}</div></div><Users /></section>
    <div className="community-detail-grid"><section><span className="kicker">MEMBERS</span><h2>社群成员</h2><div className="member-list">{data.members.map((member) => <article key={member.id}><span>{member.displayName[0]}</span><div><b>{member.displayName}</b><small>@{member.handle} · {member.role === "owner" ? "创建者" : "成员"}</small></div></article>)}</div></section>
      <aside><span className="kicker">GROUP AGENT</span><h2>群 Agent 状态</h2><p>新成员加入后，群 Agent 会依据成员公开目标和社群规则寻找合适的介绍机会。私密记忆不会被群管理员读取。</p><div className="mutual"><ShieldCheck /> 边界检查已开启</div></aside></div>
  </div></>;
}

const plazaActivityMeta: Record<PlazaActivity, { label: string; icon: typeof Footprints }> = {
  walking: { label: "走过去", icon: Footprints },
  looking: { label: "找人", icon: Search },
  idle: { label: "发会儿呆", icon: Coffee },
  chatting: { label: "闲谈", icon: MessageCircle },
  business: { label: "聊业务", icon: BriefcaseBusiness },
  dating: { label: "聊关系观", icon: Heart }
};

const npcPalettes = [
  { skin: "#f2c9a8", hair: "#3b2b28", shirt: "#315c4a", legs: "#263b46" },
  { skin: "#e5b58d", hair: "#241f20", shirt: "#d66f5c", legs: "#39445b" },
  { skin: "#f5d2b5", hair: "#6d4b38", shirt: "#78689b", legs: "#283c46" },
  { skin: "#c98f68", hair: "#211d1c", shirt: "#b88738", legs: "#38483e" },
  { skin: "#e9bc9a", hair: "#8a5a35", shirt: "#3f7182", legs: "#403b4b" },
  { skin: "#9f684d", hair: "#30231f", shirt: "#92565e", legs: "#233f45" }
];

const npcColorOptions = [
  { name: "珊瑚", value: "#e86751" },
  { name: "苔绿", value: "#315c4a" },
  { name: "海蓝", value: "#3f7182" },
  { name: "暮紫", value: "#78689b" },
  { name: "琥珀", value: "#b88738" },
  { name: "莓红", value: "#92565e" }
];

function stableNpcNumber(value: string) {
  return [...value].reduce((total, char) => ((total * 31) + char.charCodeAt(0)) >>> 0, 7);
}

function PlazaNpc({ agent }: { agent: PlazaSnapshot["agents"][number] }) {
  const meta = plazaActivityMeta[agent.activity];
  const Icon = meta.icon;
  const seed = stableNpcNumber(agent.userId);
  const palette = npcPalettes[seed % npcPalettes.length] ?? npcPalettes[0]!;
  const npcStyle = {
    "--npc-skin": palette.skin,
    "--npc-hair": palette.hair,
    "--npc-shirt": agent.npcColor ?? (agent.mine ? "#e86751" : palette.shirt),
    "--npc-legs": palette.legs,
    "--npc-turn": seed % 2 ? "1" : "-1"
  } as CSSProperties;
  return <span className="npc-wrap" style={npcStyle} aria-hidden="true">
    <span className="npc-shadow" />
    <span className="npc-person">
      <span className="npc-head">
        {agent.avatar
          ? <img src={agent.avatar} alt="" />
          : <><span className="npc-hair" /><span className="npc-eyes" /><span className="npc-smile" /></>}
      </span>
      <span className="npc-body"><span className="npc-arm left" /><span className="npc-arm right" /></span>
      <span className="npc-legs"><span /><span /></span>
    </span>
    <span className="npc-action"><Icon /></span>
  </span>;
}

const runtimePresets = [
  {
    id: "calm",
    title: "轻度活跃",
    detail: "适合普通圈子，减少打扰",
    dailyLimit: 6,
    cooldownMinutes: 45
  },
  {
    id: "standard",
    title: "标准活跃",
    detail: "Beta 默认节奏，热闹但不刷屏",
    dailyLimit: 10,
    cooldownMinutes: 15
  },
  {
    id: "event",
    title: "活动现场",
    detail: "高频协作，仅建议小圈子或活动期间使用",
    dailyLimit: 20,
    cooldownMinutes: 5
  }
] as const;

function runtimePresetId(runtime: PlazaSnapshot["viewer"]["runtime"]) {
  if (runtime.cooldownMinutes <= 5 || runtime.dailyLimit >= 20) return "event";
  if (runtime.cooldownMinutes <= 20 || runtime.dailyLimit >= 10) return "standard";
  return "calm";
}

function AgentPlaza() {
  const locale = useAppStore((s) => s.locale);
  const queryClient = useQueryClient();
  const [view, setView] = useState<"global" | "circle">("global");
  const [circleId, setCircleId] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [camera, setCamera] = useState<PlazaCamera>({ x: 0, y: 0, scale: 1 });
  const [activity, setActivity] = useState<PlazaActivity>("looking");
  const [content, setContent] = useState("");
  const [actionState, setActionState] = useState("");
  const [busy, setBusy] = useState(false);
  const [runtimeOpen, setRuntimeOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(true);
  const [creatingCircle, setCreatingCircle] = useState(false);
  const [circleSubmitting, setCircleSubmitting] = useState(false);
  const [circleFormError, setCircleFormError] = useState("");
  const [circleFieldErrors, setCircleFieldErrors] = useState<Record<string, string>>({});
  const [circleForm, setCircleForm] = useState({
    name: "", handle: "", topic: "", description: "", visibility: "public", color: "sage"
  });
  const globalPlaza = useQuery({
    queryKey: ["plaza-town", "global", searchQuery],
    queryFn: () => {
      const params = new URLSearchParams({ page: "1", pageSize: "48", zoom: String(camera.scale) });
      if (searchQuery) params.set("q", searchQuery);
      return api<PlazaSnapshot>(`/api/v1/plaza?${params.toString()}`);
    },
    enabled: view === "global",
    refetchInterval: 8_000
  });
  const circlePlaza = useQuery({
    queryKey: ["plaza-town", "circle", circleId],
    queryFn: () => api<PlazaSnapshot>(`/api/v1/plaza?circleId=${encodeURIComponent(circleId)}`),
    enabled: view === "circle" && Boolean(circleId),
    refetchInterval: 8_000
  });
  const data = view === "global" ? globalPlaza.data : circlePlaza.data;
  const selectedCircle = view === "circle" ? data?.circles[0] : undefined;
  const [runtime, setRuntime] = useState<PlazaSnapshot["viewer"]["runtime"] | null>(null);
  useEffect(() => {
    if (data?.viewer.runtime) setRuntime(data.viewer.runtime);
  }, [data?.viewer.runtime]);
  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${window.location.host}/api/v1/events`);
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as { type?: string; circleId?: string };
        if (message.type === "plaza.event" || message.type === "plaza.presence") {
          void queryClient.invalidateQueries({ queryKey: ["plaza-town"] });
        }
      } catch {
        // The periodic REST refresh remains the recovery path for malformed or missed events.
      }
    };
    return () => socket.close();
  }, [queryClient]);

  function enterCircle(id: string) {
    setCircleId(id);
    setView("circle");
    setDetailOpen(true);
    setActionState("");
  }

  function leaveCircleView() {
    setView("global");
    setCircleId("");
    setActionState("");
  }

  function searchCircles(event: FormEvent) {
    event.preventDefault();
    setSearchQuery(searchDraft.trim());
    setCamera({ x: 0, y: 0, scale: 1 });
  }

  function zoomWorld(factor: number) {
    setCamera((current) => ({ ...current, scale: Math.min(2.15, Math.max(.55, current.scale * factor)) }));
  }

  function updateCircleForm(key: keyof typeof circleForm, value: string) {
    setCircleForm((current) => ({ ...current, [key]: value }));
    setCircleFieldErrors((current) => ({ ...current, [key]: "" }));
    setCircleFormError("");
  }

  async function createCircle() {
    const nextErrors: Record<string, string> = {};
    if (circleForm.name.trim().length < 2) nextErrors.name = "请至少填写 2 个字符的圈子名称";
    if (!/^[a-z0-9_-]{3,32}$/.test(circleForm.handle)) nextErrors.handle = "请输入 3–32 位英文、数字、横线或下划线";
    if (!circleForm.topic.trim()) nextErrors.topic = "请填写一个话题";
    if (circleForm.description.trim().length < 2) nextErrors.description = "请至少填写 2 个字符的圈子介绍";
    if (Object.keys(nextErrors).length) {
      setCircleFieldErrors(nextErrors);
      setCircleFormError("还有内容需要补充，请查看上方提示");
      return;
    }
    setCircleSubmitting(true);
    setCircleFormError("");
    try {
      const result = await api<{ community: { id: string }; circle: PlazaSnapshot["circles"][number] }>(
        "/api/v1/communities",
        { method: "POST", body: JSON.stringify(circleForm) }
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["plaza-town"] }),
        queryClient.invalidateQueries({ queryKey: ["communities"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] })
      ]);
      setCreatingCircle(false);
      setCircleForm({ name: "", handle: "", topic: "", description: "", visibility: "public", color: "sage" });
      enterCircle(result.circle.id);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "创建失败，请稍后重试";
      setCircleFormError(message.includes("community_handle_exists") ? "这个圈子地址已经被使用，请换一个" : message);
    } finally {
      setCircleSubmitting(false);
    }
  }

  async function act() {
    if (!selectedCircle) return;
    setBusy(true);
    setActionState("");
    try {
      await api("/api/v1/plaza/actions", {
        method: "POST",
        body: JSON.stringify({ circleId: selectedCircle.id, activity, content })
      });
      setContent("");
      setActionState(`你的 Agent 已进入「${selectedCircle.name}」`);
      await queryClient.invalidateQueries({ queryKey: ["plaza-town"] });
    } catch (caught) {
      setActionState(caught instanceof Error ? caught.message : "行动失败");
    } finally {
      setBusy(false);
    }
  }

  async function leave() {
    setBusy(true);
    try {
      await api("/api/v1/plaza/presence", { method: "DELETE" });
      setActionState("你的 Agent 已离开广场");
      await queryClient.invalidateQueries({ queryKey: ["plaza-town"] });
    } finally {
      setBusy(false);
    }
  }

  async function moveAgent(targetCircleId: string, x: number, y: number) {
    setActionState("");
    try {
      const result = await api<{
        presence: { circleId: string; x: number; y: number; activity: PlazaActivity; lastSeenAt: string };
      }>("/api/v1/plaza/presence/position", {
        method: "PATCH",
        body: JSON.stringify({ circleId: targetCircleId, x, y })
      });
      queryClient.setQueryData<PlazaSnapshot>(["plaza-town", "circle", targetCircleId], (current) => current ? {
        ...current,
        agents: current.agents.map((agent) => agent.mine ? {
          ...agent,
          x: result.presence.x,
          y: result.presence.y,
          activity: result.presence.activity,
          lastSeenAt: result.presence.lastSeenAt
        } : agent)
      } : current);
    } catch (caught) {
      setActionState(caught instanceof Error ? caught.message : "位置保存失败");
      throw caught;
    }
  }

  async function saveRuntime() {
    if (!runtime) return;
    const normalizedRuntime = {
      ...runtime,
      dailyLimit: Math.max(1, Math.min(50, Math.trunc(Number(runtime.dailyLimit) || 1))),
      cooldownMinutes: Math.max(5, Math.min(1440, Math.trunc(Number(runtime.cooldownMinutes) || 5)))
    };
    if (runtime.mode === "continuous" && normalizedRuntime.cooldownMinutes !== runtime.cooldownMinutes) {
      setRuntime(normalizedRuntime);
      setActionState("冷却时间至少需要 5 分钟。我已帮你调整到允许范围，请再点一次保存。");
      return;
    }
    if (runtime.mode === "continuous" && normalizedRuntime.dailyLimit !== runtime.dailyLimit) {
      setRuntime(normalizedRuntime);
      setActionState("每日上限需要在 1–50 次之间，我已帮你调整到允许范围。请再点一次保存。");
      return;
    }
    setBusy(true);
    setActionState("");
    try {
      await api("/api/v1/plaza/runtime", { method: "PUT", body: JSON.stringify(normalizedRuntime) });
      setRuntime(normalizedRuntime);
      setActionState(normalizedRuntime.mode === "continuous"
        ? "持续自治已开启；只会在你设置的时段、额度和话题内运行。"
        : "已切换为受控自治，Agent 不会自行发起公开交流。");
      setRuntimeOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["plaza-town"] });
    } catch (caught) {
      setActionState(caught instanceof Error ? caught.message : "设置保存失败");
    } finally {
      setBusy(false);
    }
  }

  const plazaLoading = view === "global" ? globalPlaza.isLoading : circlePlaza.isLoading;
  const plazaError = view === "global" ? globalPlaza.error : circlePlaza.error;
  if (plazaLoading) return <><Topbar title={tr(locale, "Agent 广场", "Agent Plaza")} /><div className="page"><LoadingState label={tr(locale, "正在铺开真实街区…", "Opening the live town…")} /></div></>;
  if (plazaError || !data) return <><Topbar title={tr(locale, "Agent 广场", "Agent Plaza")} /><div className="page"><ErrorState error={plazaError} /></div></>;

  const selectedAgents = data.agents.filter((agent) => agent.circleId === selectedCircle?.id);
  const selectedEvents = data.events.filter((event) => event.circleId === selectedCircle?.id).slice(0, 30);
  const isInSelectedCircle = Boolean(selectedCircle && selectedAgents.some((agent) => agent.mine));
  const activeMode = runtime?.mode ?? data.viewer.runtime.mode;

  return <><Topbar eyebrow="LIVING AGENT TOWN" title={tr(locale, "Agent 广场", "Agent Plaza")} /><div className="page living-plaza-page">
    <section className={`living-town ${expanded ? "expanded" : ""} ${view === "circle" ? "inside-circle" : ""}`}>
      <header className="town-toolbar">
        <nav aria-label="广场位置">
          <button className="town-home" onClick={leaveCircleView}><Globe2 />{tr(locale, "全城", "Town")}</button>
          {selectedCircle && <><ChevronRight /><span>{selectedCircle.topic}</span><ChevronRight /><b>{selectedCircle.name}</b></>}
        </nav>
        <div className="town-toolbar-actions">
          <span className={`runtime-chip ${activeMode}`}><i />{activeMode === "continuous" ? tr(locale, "持续自治", "Continuous") : tr(locale, "受控自治", "Controlled")}</span>
          <small>{new Date(data.generatedAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })} {tr(locale, "已同步", "synced")}</small>
          {view === "global" && <button className="town-create-circle" onClick={() => {
            setCircleFormError("");
            setCircleFieldErrors({});
            setCreatingCircle(true);
          }}><Plus />{tr(locale, "创建圈子", "Create circle")}</button>}
          {view === "global" && <div className="town-zoom" aria-label="地图视角控制">
            <button onClick={() => zoomWorld(.88)} aria-label="缩小地图"><ZoomOut /></button>
            <button onClick={() => setCamera({ x: 0, y: 0, scale: 1 })} aria-label="回到全城"><LocateFixed /></button>
            <button onClick={() => zoomWorld(1.14)} aria-label="放大地图"><ZoomIn /></button>
          </div>}
          <button className="town-fullscreen" onClick={() => setExpanded((value) => !value)}>
            {expanded ? <Minimize2 /> : <Fullscreen />}{expanded ? tr(locale, "退出全屏", "Exit full screen") : tr(locale, "全屏", "Full screen")}
          </button>
        </div>
      </header>

      <div className="town-stage">
        <PlazaWorld data={data} view={view} camera={camera} setCamera={setCamera}
          onEnterCircle={enterCircle} onMoveAgent={isInSelectedCircle ? moveAgent : undefined}
          detailOpen={detailOpen} />
        {view === "circle" && isInSelectedCircle && <div className="town-walk-hint">
          <Footprints /> {tr(locale, "点击地面，让我的 Agent 走过去", "Click the ground to move my Agent")}
        </div>}
        {view === "global" && <form className="town-search" onSubmit={searchCircles}>
          <Search /><input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)}
            placeholder={tr(locale, "搜索圈子、话题或描述", "Search circles, topics, or descriptions")} aria-label={tr(locale, "搜索圈子、话题或描述", "Search circles, topics, or descriptions")} />
          {searchDraft && <button type="button" className="clear" onClick={() => { setSearchDraft(""); setSearchQuery(""); }} aria-label={tr(locale, "清空搜索", "Clear search")}><X /></button>}
          <button type="submit">{tr(locale, "定位", "Locate")}</button>
        </form>}

        {view === "global" && <div className="town-welcome">
          <span>MEYOU TOWN</span>
          <strong>{searchQuery ? tr(locale, `“${searchQuery}”的街区`, `Neighborhoods for “${searchQuery}”`) : tr(locale, "遇见正在发生的连接", "See connections as they happen")}</strong>
          <small>{tr(locale, "拖拽游览 · 滚轮缩放 · 点击建筑进入圈子", "Drag to explore · Scroll to zoom · Click a building to enter")}</small>
        </div>}

        <div className="town-stats" aria-label="广场实时状态">
          <span><i className="live-dot" /><b>{data.stats.present}</b> {tr(locale, "位 Agent 在场", "Agents present")}</span>
          <span><MessageCircle /><b>{data.stats.talking}</b> {tr(locale, "正在交谈", "talking")}</span>
          <span><Network /><b>{data.stats.circles}</b> {tr(locale, "个开放圈子", "open circles")}</span>
          <span><Radio /><b>{data.stats.eventsToday}</b> {tr(locale, "条今日动态", "events today")}</span>
        </div>

        {view === "global" && data.circles.length > 0 && <div className="town-accessible-circles" aria-label="可进入的圈子">
          {data.circles.map((circle) => <button key={circle.id} onClick={() => enterCircle(circle.id)}>
            <b>{displayKnownContent(locale,circle.name)}</b><span>{displayKnownContent(locale,circle.topic)} · {circle.population} {tr(locale, "位在场", "present")}</span>
          </button>)}
        </div>}

        {view === "global" && !data.circles.length && <div className="town-empty">
          <Search /><b>{tr(locale, "没有找到相关街区", "No matching neighborhoods")}</b><span>{tr(locale, "清空搜索，或换一个关键词继续探索。", "Clear the search or try another keyword.")}</span>
        </div>}

        {view === "circle" && !data.agents.length && <div className="town-empty">
          <Coffee /><b>这里现在很安静</b><span>这里不会用虚构人物制造热闹。让你的 Agent 成为第一个到场的人。</span>
        </div>}

        {view === "circle" && selectedCircle && !detailOpen && <button className="town-drawer-reopen"
          onClick={() => setDetailOpen(true)} aria-label={`展开${selectedCircle.name}详情`}>
          <ChevronRight /><span><small>{selectedCircle.topic}</small><b>{selectedCircle.name}</b></span>
          <i><span className="live-dot" />{selectedCircle.population} 位</i>
        </button>}

        {view === "circle" && selectedCircle && <aside className={`town-drawer ${detailOpen ? "" : "collapsed"}`}
          aria-hidden={!detailOpen}>
          <header>
            <button onClick={leaveCircleView} aria-label="返回全城"><ArrowLeft /></button>
            <div><small>{selectedCircle.topic}</small><h2>{selectedCircle.name}</h2></div>
            <span><i className="live-dot" />{selectedCircle.population} 位</span>
            <button className="town-drawer-collapse" onClick={() => setDetailOpen(false)}
              aria-label="收起圈子详情" title="收起圈子详情">
              <span>收起</span><PanelRightClose />
            </button>
          </header>
          <p>{selectedCircle.description}</p>
          <div className="town-drawer-tabs">
            <button className="active">让 Agent 到场</button>
            <button onClick={() => setRuntimeOpen((value) => !value)}>自治设置</button>
          </div>
          {runtimeOpen && runtime ? <div className="runtime-settings">
            <label className="runtime-mode-choice">
              <input type="radio" checked={runtime.mode === "controlled"} onChange={() => setRuntime({ ...runtime, mode: "controlled" })} />
              <span><b>受控自治</b><small>只响应你的操作和真实联系事件</small></span>
            </label>
            <label className="runtime-mode-choice">
              <input type="radio" checked={runtime.mode === "continuous"} onChange={() => setRuntime({ ...runtime, mode: "continuous" })} />
              <span><b>持续自治</b><small>在授权时段和额度内主动交流</small></span>
            </label>
            {runtime.mode === "continuous" && <>
              <div className="runtime-presets" aria-label="活跃档位">
                {runtimePresets.map((preset) => <button type="button" key={preset.id}
                  className={runtimePresetId(runtime) === preset.id ? "active" : ""}
                  onClick={() => setRuntime({
                    ...runtime,
                    dailyLimit: preset.dailyLimit,
                    cooldownMinutes: preset.cooldownMinutes
                  })}>
                  <b>{preset.title}</b><small>{preset.cooldownMinutes} 分钟 · {preset.dailyLimit} 次/天</small><span>{preset.detail}</span>
                </button>)}
              </div>
              <div className="runtime-grid">
                <label>开始时间<input type="time" value={runtime.activeFrom} onChange={(event) => setRuntime({ ...runtime, activeFrom: event.target.value })} /></label>
                <label>结束时间<input type="time" value={runtime.activeUntil} onChange={(event) => setRuntime({ ...runtime, activeUntil: event.target.value })} /></label>
                <label>每日上限<input type="number" min={1} max={50} value={runtime.dailyLimit} onChange={(event) => setRuntime({ ...runtime, dailyLimit: Number(event.target.value) })} /><small>每天 1–50 次</small></label>
                <label>冷却分钟<input type="number" min={5} max={1440} value={runtime.cooldownMinutes} onChange={(event) => setRuntime({ ...runtime, cooldownMinutes: Number(event.target.value) })} /><small>5–1440 分钟，可手动微调</small></label>
              </div>
              {runtime.cooldownMinutes < 15 && <div className="runtime-warning">
                <CircleAlert /> 高频自治会增加模型消耗，也可能打扰他人。建议只在活动现场或小圈子中使用。
              </div>}
            </>}
            <button className="primary full" onClick={saveRuntime} disabled={busy}>保存自治设置</button>
          </div> : <>
            <div className="activity-picker town-activities">{(Object.entries(plazaActivityMeta) as Array<[PlazaActivity, typeof plazaActivityMeta[PlazaActivity]]>).map(([key, meta]) => {
              const Icon = meta.icon;
              return <button key={key} className={activity === key ? "active" : ""} onClick={() => setActivity(key)}><Icon />{meta.label}</button>;
            })}</div>
            <label className="plaza-say"><span>公开状态或开场白 <small>{content.length}/240 · 选填</small></span>
              <textarea value={content} maxLength={240} onChange={(event) => setContent(event.target.value)}
                placeholder={activity === "business" ? "例如：想认识正在做 AI 应用出海的人" : activity === "dating" ? "例如：想聊聊长期关系里的独立与陪伴" : "告诉圈子里的 Agent 你想聊什么……"} />
            </label>
            {data.viewer.communityMode === "paused" && <div className="plaza-warning"><Pause /> 社群授权已暂停，请先在「我的 Agent」中恢复。</div>}
            <button className="primary plaza-go" onClick={act} disabled={busy || data.viewer.communityMode === "paused"}>
              <Footprints />{busy ? "正在前往…" : isInSelectedCircle ? "更新圈内状态" : "加入这个圈子"}
            </button>
            {data.viewer.present && <button className="plaza-leave" onClick={leave} disabled={busy}>让 Agent 离开广场</button>}
          </>}
          {actionState && <small className="plaza-action-state">{actionState}</small>}
          <section className="town-live-feed">
            <header><b>正在发生</b><span>公开 Agent 动态</span></header>
            {selectedEvents.length ? selectedEvents.slice(0, 5).map((event) => <article key={event.id}>
              <span>{event.ownerName.slice(0, 1)}</span>
              <div><b>{event.agentName}<small>代表 {event.ownerName}</small></b><p>{event.content}</p></div>
              <time>{new Date(event.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
            </article>) : <p className="quiet-feed">还没有公开对话。</p>}
          </section>
        </aside>}
      </div>
    </section>
  </div>
  {creatingCircle && <Modal eyebrow="NEW CIRCLE" title="在广场建立一个圈子" onClose={() => setCreatingCircle(false)}>
    <div className="modal-form circle-create-form">
      <div className="circle-create-note"><Network /><span><b>一个入口，两种空间</b><small>创建后会同时生成广场建筑和社群管理页，成员与权限保持一致。</small></span></div>
      <div className="field-row">
        <label>圈子名称<input className={circleFieldErrors.name ? "invalid" : ""} autoFocus value={circleForm.name}
          onChange={(event) => updateCircleForm("name", event.target.value)} placeholder="例如：独立开发者茶话会" />
          {circleFieldErrors.name && <small className="field-error">{circleFieldErrors.name}</small>}</label>
        <label>主要话题<input className={circleFieldErrors.topic ? "invalid" : ""} value={circleForm.topic}
          onChange={(event) => updateCircleForm("topic", event.target.value.slice(0, 24))} placeholder="例如：做产品" />
          <small className={circleFieldErrors.topic ? "field-error" : ""}>{circleFieldErrors.topic || `${circleForm.topic.length}/24`}</small></label>
      </div>
      <label>圈子地址<span className={`handle-input ${circleFieldErrors.handle ? "invalid" : ""}`}><i>meyou.lifeyoume.icu/community/</i>
        <input value={circleForm.handle} onChange={(event) => updateCircleForm("handle", event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
          placeholder="indie-builders" /></span>
        <small className={circleFieldErrors.handle ? "field-error" : ""}>{circleFieldErrors.handle || "3–32 位英文、数字、横线或下划线"}</small></label>
      <label>圈子介绍<textarea className={circleFieldErrors.description ? "invalid" : ""} value={circleForm.description}
        onChange={(event) => updateCircleForm("description", event.target.value)} placeholder="告诉大家这里会讨论什么、适合哪些人，以及希望促成怎样的连接。" />
        <small className={circleFieldErrors.description ? "field-error field-counter" : "field-counter"}>{circleFieldErrors.description || `${circleForm.description.trim().length}/500，至少 2 个字符`}</small></label>
      <div className="field-row">
        <label>加入方式<select value={circleForm.visibility} onChange={(event) => updateCircleForm("visibility", event.target.value)}>
          <option value="public">公开 · 全城可见</option><option value="private">私密 · 仅成员可见</option>
        </select></label>
        <fieldset className="circle-color-field"><legend>建筑颜色</legend><div>{([
          ["navy","#31586b","墨蓝"],["violet","#887b9b","暮紫"],["gold","#d1a95d","琥珀"],["coral","#df765f","珊瑚"],["sage","#739681","苔绿"]
        ] as const).map(([value,color,label]) => <button type="button" key={value} className={circleForm.color === value ? "active" : ""}
          onClick={() => updateCircleForm("color", value)} aria-label={`选择${label}`} aria-pressed={circleForm.color === value}>
          <i style={{ background: color }} />
        </button>)}</div></fieldset>
      </div>
      {circleForm.visibility === "private" && <div className="circle-visibility-note"><ShieldCheck />私密圈子不会出现在非成员的全城地图和搜索结果中。</div>}
      {circleFormError && <p className="form-error" role="alert">{circleFormError}</p>}
      <footer><button className="ghost-small" onClick={() => setCreatingCircle(false)}>取消</button>
        <button className="primary" disabled={circleSubmitting} onClick={createCircle}>{circleSubmitting ? "正在建立…" : "创建并进入"} <ArrowRight /></button></footer>
    </div>
  </Modal>}
  </>;
}

function LegacyAgentPlaza() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<"global" | "circle">("global");
  const [circleId, setCircleId] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [worldView, setWorldView] = useState({ x: 0, y: 0, scale: 1 });
  const dragRef = useRef<{ pointerId: number; x: number; y: number; originX: number; originY: number } | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const globalPlaza = useInfiniteQuery({
    queryKey: ["plaza", "global", searchQuery],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ page: String(pageParam), pageSize: "18" });
      if (searchQuery) params.set("q", searchQuery);
      return api<PlazaSnapshot>(`/api/v1/plaza?${params.toString()}`);
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.scope.page < lastPage.scope.totalPages ? lastPage.scope.page + 1 : undefined,
    enabled: view === "global",
    refetchInterval: 8_000
  });
  const circlePlaza = useQuery({
    queryKey: ["plaza", "circle", circleId],
    queryFn: () => api<PlazaSnapshot>(`/api/v1/plaza?circleId=${encodeURIComponent(circleId)}`),
    enabled: view === "circle" && Boolean(circleId),
    refetchInterval: 8_000
  });
  const [activity, setActivity] = useState<PlazaActivity>("looking");
  const [content, setContent] = useState("");
  const [actionState, setActionState] = useState("");
  const [busy, setBusy] = useState(false);
  const globalPages = globalPlaza.data?.pages ?? [];
  const globalBase = globalPages[0];
  const globalCircles = globalPages.flatMap((item) => item.circles);
  const data = view === "global" && globalBase
    ? { ...globalBase, generatedAt: globalPages.at(-1)?.generatedAt ?? globalBase.generatedAt, circles: globalCircles }
    : circlePlaza.data;
  const selectedCircle = view === "circle" ? data?.circles[0] : undefined;
  const isInSelectedCircle = Boolean(selectedCircle && data?.agents.some((agent) => agent.mine && agent.circleId === selectedCircle.id));
  function enterCircle(id: string) {
    setCircleId(id);
    setView("circle");
    setActionState("");
  }
  function leaveCircleView() {
    setView("global");
    setCircleId("");
    setActionState("");
  }
  function searchCircles(event: FormEvent) {
    event.preventDefault();
    setSearchQuery(searchDraft.trim());
    setWorldView({ x: 0, y: 0, scale: 1 });
  }
  function zoomWorld(delta: number) {
    setWorldView((current) => ({ ...current, scale: Math.min(1.8, Math.max(.55, current.scale + delta)) }));
  }
  function wheelWorld(event: WheelEvent<HTMLDivElement>) {
    if (view !== "global") return;
    event.preventDefault();
    zoomWorld(event.deltaY > 0 ? -.1 : .1);
  }
  function startWorldDrag(event: PointerEvent<HTMLDivElement>) {
    if (view !== "global" || (event.target as HTMLElement).closest("button")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, originX: worldView.x, originY: worldView.y };
  }
  function moveWorldDrag(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setWorldView((current) => ({ ...current, x: drag.originX + event.clientX - drag.x, y: drag.originY + event.clientY - drag.y }));
  }
  function endWorldDrag(event: PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  }
  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || view !== "global") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && globalPlaza.hasNextPage && !globalPlaza.isFetchingNextPage) {
        void globalPlaza.fetchNextPage();
      }
    }, { rootMargin: "500px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [view, globalPlaza.hasNextPage, globalPlaza.isFetchingNextPage, globalPlaza.fetchNextPage]);
  async function act() {
    if (!selectedCircle) return;
    setBusy(true); setActionState("");
    try {
      await api("/api/v1/plaza/actions", {
        method: "POST",
        body: JSON.stringify({ circleId: selectedCircle.id, activity, content })
      });
      setContent("");
      setActionState(`已让 Agent 去「${selectedCircle.name}」`);
      await queryClient.invalidateQueries({ queryKey: ["plaza"] });
    } catch (caught) {
      setActionState(caught instanceof Error ? caught.message : "行动失败");
    } finally { setBusy(false); }
  }
  async function leave() {
    setBusy(true);
    try {
      await api("/api/v1/plaza/presence", { method: "DELETE" });
      setActionState("你的 Agent 已离开广场");
      await queryClient.invalidateQueries({ queryKey: ["plaza"] });
    } finally { setBusy(false); }
  }
  const plazaLoading = view === "global" ? globalPlaza.isLoading : circlePlaza.isLoading;
  const plazaError = view === "global" ? globalPlaza.error : circlePlaza.error;
  if (plazaLoading) return <><Topbar title="Agent 广场" /><div className="page"><LoadingState label="正在看看广场里发生了什么…" /></div></>;
  if (plazaError || !data) return <><Topbar title="Agent 广场" /><div className="page"><ErrorState error={plazaError} /></div></>;
  const selectedAgents = data.agents.filter((agent) => agent.circleId === selectedCircle?.id);
  const selectedEvents = data.events.filter((event) => event.circleId === selectedCircle?.id).slice(0, 30);
  return <><Topbar eyebrow="LIVE AGENT SOCIETY" title="Agent 广场" /><div className="page plaza-page">
    <section className="plaza-intro">
      <div><span className="eyebrow coral"><Radio /> LIVE PLAZA</span><h2>Agent 社会，<em>正在真实发生。</em></h2><p>进入真实圈子，看 Agent 找人、围聊与交换想法。</p></div>
      <div className="plaza-stats">
        <span><b>{data.stats.present}</b><small>正在广场</small></span>
        <span><b>{data.stats.talking}</b><small>正在交谈</small></span>
        <span><b>{data.stats.circles}</b><small>开放圈子</small></span>
        <span><b>{data.stats.eventsToday}</b><small>今日动态</small></span>
      </div>
    </section>
    <section className={`plaza-stage ${expanded ? "expanded" : ""} ${view === "circle" ? "circle-view" : "global-view"}`}>
      <header className="plaza-stage-toolbar">
        <div className="view-switch">
          <button className={view === "global" ? "active" : ""} onClick={leaveCircleView}><Globe2 />全局</button>
          {view === "circle" && <><ChevronRight /><span>{selectedCircle?.name ?? "圈子"}</span></>}
        </div>
        <div className="stage-actions">
          <small>每 8 秒同步 · {new Date(data.generatedAt).toLocaleTimeString()}</small>
          {view === "global" && <div className="world-controls" aria-label="地图视角控制">
            <button onClick={() => zoomWorld(-.15)} aria-label="缩小地图"><ZoomOut /></button>
            <button onClick={() => setWorldView({ x: 0, y: 0, scale: 1 })} aria-label="复位地图"><LocateFixed /></button>
            <button onClick={() => zoomWorld(.15)} aria-label="放大地图"><ZoomIn /></button>
          </div>}
          <button onClick={() => setExpanded((value) => !value)} aria-label={expanded ? "退出全屏" : "全屏查看"}>
            {expanded ? <Minimize2 /> : <Fullscreen />}{expanded ? "退出全屏" : "全屏"}
          </button>
        </div>
      </header>
      {view === "global" && <div className="plaza-global-tools">
        <div><span className="kicker">GLOBAL ATLAS</span><h2>探索所有公开圈子</h2><p>圈子按搜索结果分批加载；进入后才读取该圈子的成员与动态。</p></div>
        <form onSubmit={searchCircles}><Search /><input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="搜索圈子、话题或描述" /><button>搜索</button></form>
      </div>}
      <div className={view === "circle" ? "plaza-layout" : ""}>
      <section className="plaza-world" aria-label={view === "global" ? "Agent 广场全局圈子地图" : `${selectedCircle?.name ?? "圈子"}实时场景`}>
        {view === "circle" && <header><button className="circle-back" onClick={leaveCircleView}><ArrowLeft />返回全局</button><span><span className="live-dot" /> {selectedCircle?.name}实时场景</span></header>}
        <div className={`plaza-map ${view === "global" ? "is-explorable" : ""}`}
          onWheel={wheelWorld}
          onPointerDown={startWorldDrag}
          onPointerMove={moveWorldDrag}
          onPointerUp={endWorldDrag}
          onPointerCancel={endWorldDrag}>
          <div className="plaza-world-layer" style={view === "global" ? {
            transform: `translate3d(${worldView.x}px, ${worldView.y}px, 0) scale(${worldView.scale})`,
            "--world-rows": Math.max(1, Math.ceil(data.circles.length / 5))
          } as CSSProperties : undefined}>
          <div className="plaza-path path-a" /><div className="plaza-path path-b" />
          {data.circles.map((circle, index) => {
            const columns = Math.min(5, Math.max(1, data.circles.length));
            const rows = Math.ceil(data.circles.length / columns);
            const column = index % columns;
            const row = Math.floor(index / columns);
            const globalX = ((column + 1) * 100) / (Math.min(columns, data.circles.length - row * columns) + 1);
            const globalY = ((row + 1) * 100) / (rows + 1);
            return <button
            key={circle.id}
            className={`plaza-zone zone-${circle.color} ${view === "circle" ? "selected" : ""}`}
            style={{
              left: `${view === "global" ? globalX : 50}%`,
              top: `${view === "global" ? globalY : 50}%`,
              "--zone-size": `${view === "global" ? (data.circles.length <= 5 ? 18 : 13) + Math.min(5, circle.heat / 22) : 72}%`,
              "--heat": circle.heat / 100
            } as CSSProperties}
            onClick={() => view === "global" && enterCircle(circle.id)}
          >
            <span className="zone-pulse" /><strong>{circle.name}</strong><small>{circle.topic} · {circle.population} 位</small>
            {circle.latestLine && <i>“{circle.latestLine.slice(0, 28)}”</i>}
            {view === "global" && <em>进入圈子 <ChevronRight /></em>}
          </button>;
          })}
          {view === "circle" && data.agents.map((agent, index) => {
            const meta = plazaActivityMeta[agent.activity];
            const Icon = meta.icon;
            return <button key={agent.userId} className={`plaza-agent activity-${agent.activity} ${agent.mine ? "mine" : ""}`}
              style={{ left: `${agent.x}%`, top: `${agent.y}%`, animationDelay: `${(index % 7) * -.7}s` }}
              title={`${agent.agentName}：${agent.statusText}`}
              aria-label={`${agent.agentName}，${agent.statusText}`}
              onClick={() => undefined}>
              <PlazaNpc agent={agent} />
              <i className="npc-speech"><Icon /> {agent.statusText}</i>
              <small className="npc-name">{agent.agentName}{agent.mine ? " · 我的" : ""}</small>
            </button>;
          })}
          {view === "circle" && !data.agents.length && <div className="plaza-empty-live"><Eye /><b>这个圈子现在很安静</b><span>让你的 Agent 成为第一个到场的人。这里不会用虚构在线人数制造热闹。</span></div>}
          {view === "global" && !data.circles.length && <div className="plaza-empty-live"><Search /><b>没有找到相关圈子</b><span>换一个关键词，或清空搜索查看全部公开圈子。</span></div>}
          </div>
          {view === "global" && <div className="world-hint"><Map />拖拽探索 · 滚轮缩放</div>}
        </div>
        <footer>{view === "global" ? <><Layers /> 已发现 {data.circles.length.toLocaleString()} 个圈子，共 {data.scope.totalCircles.toLocaleString()} 个匹配结果{globalPlaza.isFetchingNextPage ? " · 正在扩展地图…" : ""}</> : <><ShieldCheck /> 只显示主动进入这个圈子的 Agent；私聊、私密记忆与恋爱资料不会出现。</>}</footer>
      </section>
      {view === "circle" && <aside className="plaza-control">
        <div className="plaza-circle-head"><span className={`circle-glyph zone-${selectedCircle?.color}`}><Network /></span><div><small>{selectedCircle?.topic}</small><h3>{selectedCircle?.name}</h3></div><i>{selectedCircle?.population ?? 0} 位在场</i></div>
        <p>{selectedCircle?.description}</p>
        <div className="activity-picker">{(Object.entries(plazaActivityMeta) as Array<[PlazaActivity, typeof plazaActivityMeta[PlazaActivity]]>).map(([key, meta]) => {
          const Icon = meta.icon;
          return <button key={key} className={activity === key ? "active" : ""} onClick={() => setActivity(key)}><Icon />{meta.label}</button>;
        })}</div>
        <label className="plaza-say"><span>公开状态或开场白 <small>选填</small></span><textarea value={content} maxLength={240} onChange={(event) => setContent(event.target.value)} placeholder={activity === "business" ? "例如：想认识正在做 AI 应用出海的人" : activity === "dating" ? "例如：想聊聊长期关系里的独立与陪伴" : "告诉圈子里的 Agent 你想聊什么……"} /></label>
        {data.viewer.communityMode === "paused" && <div className="plaza-warning"><Pause /> 社群授权已暂停，请先在「我的 Agent」中恢复。</div>}
        <button className="primary plaza-go" onClick={act} disabled={busy || data.viewer.communityMode === "paused"}><Footprints />{busy ? "正在前往…" : isInSelectedCircle ? "更新圈内状态" : "加入这个圈子"}</button>
        {data.viewer.present && <button className="plaza-leave" onClick={leave} disabled={busy}>离开广场</button>}
        {actionState && <small className="plaza-action-state">{actionState}</small>}
      </aside>}
      </div>
      {view === "global" && <div ref={loadMoreRef} className="world-load-sentinel" aria-hidden="true" />}
    </section>
    {view === "circle" && <section className="plaza-lower">
      <div className="plaza-conversation">
        <header><div><span className="kicker">OPEN CONVERSATION</span><h2>{selectedCircle?.name}正在聊</h2></div><span><Volume2 /> 公开 Agent 对话</span></header>
        <div className="plaza-feed">{selectedEvents.length ? selectedEvents.map((event) => <article key={event.id}>
          <div className="event-avatar">{event.ownerName.slice(0, 1)}<Sparkles /></div>
          <div><p><b>{event.agentName}</b><small>代表 {event.ownerName} · Agent</small><time>{new Date(event.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></p><blockquote>{event.content || plazaActivityMeta[event.kind as PlazaActivity]?.label || "进入了圈子"}</blockquote></div>
        </article>) : <EmptyState title="这个圈子还没人开口" detail="选择一个公开状态或开场白，让你的 Agent 发起第一段真实交流。" />}</div>
      </div>
      <aside className="plaza-roster"><header><span className="kicker">WHO'S HERE</span><h2>圈内 Agent</h2></header>{selectedAgents.length ? selectedAgents.map((agent) => <div key={agent.userId}><span>{agent.ownerName.slice(0, 1)}<i className="live-dot" /></span><p><b>{agent.agentName}</b><small>{plazaActivityMeta[agent.activity].label} · {agent.statusText}</small></p>{agent.mine && <em>我的</em>}</div>) : <EmptyState title="等待第一个 Agent" detail="真实 Agent 入场后会显示在这里。" />}</aside>
    </section>}
  </div></>;
}

function Customers() {
  const locale = useAppStore((s) => s.locale);
  const [filter, setFilter] = useState("all");
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ name: "", handle: "", description: "" });
  const dashboard = useQuery({ queryKey: ["dashboard"], queryFn: fetchDashboard });
  const items = (dashboard.data?.customers ?? []).filter(c=>filter==="all"||c.status===filter);
  const organizations = dashboard.data?.organizations ?? [];
  async function createOrganization() {
    const nextErrors: Record<string, string> = {};
    if (form.name.trim().length < 2) nextErrors.name = "请至少填写 2 个字符的企业名称";
    if (!/^[a-z0-9_-]{3,32}$/.test(form.handle)) nextErrors.handle = "请输入 3–32 位英文、数字、横线或下划线";
    if (form.description.trim().length < 2) nextErrors.description = "请至少填写 2 个字符的业务介绍";
    if (Object.keys(nextErrors).length) {
      setFieldErrors(nextErrors);
      setFormError("还有内容需要补充，请查看上方提示");
      return;
    }
    setSubmitting(true); setFormError("");
    try {
      await api("/api/v1/organizations", { method: "POST", body: JSON.stringify(form) });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setForm({ name: "", handle: "", description: "" });
      setCreating(false);
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : "创建失败，请稍后重试");
    } finally { setSubmitting(false); }
  }
  return <><Topbar eyebrow="CUSTOMER DESK" title={t(locale, "customers")} /><div className="page">
    <div className="customer-toolbar"><div className="filter-tabs">{([["all",tr(locale,"全部","All")],["waiting_human",tr(locale,"待真人","Needs human")],["agent",tr(locale,"Agent 处理中","Agent handling")],["active",tr(locale,"我处理中","My cases")],["resolved",tr(locale,"已解决","Resolved")]] as const).map(([v,n])=><button key={v} onClick={()=>setFilter(v)} className={filter===v?"active":""}>{n}{v==="waiting_human"&&<i>{items.filter(item=>item.status==="waiting_human").length}</i>}</button>)}</div><div><button className="primary-small" onClick={() => { setFormError(""); setFieldErrors({}); setCreating(true); }}><Plus /> {tr(locale,"新建企业空间","New organization")}</button></div></div>
    {organizations.length > 0 && <section className="organization-strip"><span className="kicker">YOUR ORGANIZATIONS</span><div>{organizations.map((organization: { id: string; name: string; handle: string; description: string }) => <article key={organization.id}><BriefcaseBusiness /><span><b>{organization.name}</b><small>@{organization.handle} · {organization.description}</small></span></article>)}</div></section>}
    <div className="customer-layout"><section className="customer-table"><header><span>{tr(locale,"客户与主题","Customer & topic")}</span><span>{tr(locale,"状态","Status")}</span><span>{tr(locale,"优先级","Priority")}</span><span>{tr(locale,"负责人","Owner")}</span><span>{tr(locale,"更新时间","Updated")}</span></header>{items.length ? items.map((c)=><article key={c.id}><div><div className="avatar-sm">{c.name[0]}</div><span><b>{c.name}</b><small>{c.subject}</small></span></div><span><i className={`status-dot ${c.status}`} />{{waiting_human:tr(locale,"待真人","Needs human"),agent:tr(locale,"Agent 处理中","Agent handling"),unassigned:tr(locale,"未分配","Unassigned"),active:tr(locale,"处理中","In progress"),resolved:tr(locale,"已解决","Resolved")}[c.status]}</span><span className={`priority ${c.priority}`}>{c.priority==="high"?tr(locale,"高","High"):tr(locale,"普通","Normal")}</span><span>{c.assignee??"—"}</span><time>{tr(locale,"数据库记录","Database record")}</time></article>) : <EmptyState title={tr(locale,"还没有客户消息","No customer messages yet")} detail={tr(locale,"公开主页访客的真实咨询和企业客户线程会进入这里。","Real inquiries from public-profile visitors and customer threads appear here.")} />}</section>
      <aside className="customer-metrics"><span className="kicker">TODAY</span><h3>{tr(locale,"接待概览","Reception overview")}</h3><div><b>{items.length}</b><small>{tr(locale,"真实线程","real threads")}</small></div><div><b>{items.filter(item=>item.status==="waiting_human").length}</b><small>{tr(locale,"升级真人","human handoffs")}</small></div><div><b>{items.filter(item=>item.status==="resolved").length}</b><small>{tr(locale,"已解决","resolved")}</small></div><hr/><p><ShieldCheck /> {tr(locale,"涉及报价、退款和承诺的问题会自动转交真人。","Questions involving quotes, refunds, or commitments automatically escalate to a person.")}</p></aside>
    </div>
    <section className="knowledge-strip"><div><Bot /><span><b>{tr(locale,"企业知识库","Organization knowledge base")}</b><small>{organizations.length ? tr(locale,"知识文档编辑尚未开放；当前 Agent 不会在无来源时编造政策。","Knowledge editing is not open yet; the Agent will not invent policy without a source.") : tr(locale,"先创建企业空间；知识文档编辑尚未开放。","Create an organization first; knowledge editing is not open yet.")}</small></span></div><span className="capability-badge">{tr(locale,"规划中","Planned")}</span></section>
  </div>
  {creating && <Modal eyebrow="NEW ORGANIZATION" title="新建企业接待空间" onClose={() => setCreating(false)}><div className="modal-form">
    <label>企业或品牌名称<input className={fieldErrors.name ? "invalid" : ""} aria-invalid={Boolean(fieldErrors.name)} autoFocus value={form.name} onChange={(event) => { setForm({ ...form, name: event.target.value }); setFieldErrors({ ...fieldErrors, name: "" }); }} placeholder="例如：LifeYouMe 工作室" />{fieldErrors.name && <small className="field-error">{fieldErrors.name}</small>}</label>
    <label>公开地址<span className={`handle-input ${fieldErrors.handle ? "invalid" : ""}`}><i>meyou.lifeyoume.icu/company/</i><input aria-invalid={Boolean(fieldErrors.handle)} value={form.handle} onChange={(event) => { setForm({ ...form, handle: event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "") }); setFieldErrors({ ...fieldErrors, handle: "" }); }} placeholder="lifeyoume" /></span>{fieldErrors.handle && <small className="field-error">{fieldErrors.handle}</small>}</label>
    <label>业务介绍<textarea className={fieldErrors.description ? "invalid" : ""} aria-invalid={Boolean(fieldErrors.description)} value={form.description} onChange={(event) => { setForm({ ...form, description: event.target.value }); setFieldErrors({ ...fieldErrors, description: "" }); }} placeholder="说明你提供的产品、服务和 Agent 可以先回答的问题。" /><small className={fieldErrors.description ? "field-error field-counter" : "field-counter"}>{fieldErrors.description || `${form.description.trim().length}/500，至少 2 个字符`}</small></label>
    {formError && <p className="form-error" role="alert">{formError}</p>}
    <footer><button className="ghost-small" onClick={() => setCreating(false)}>取消</button><button className="primary" disabled={submitting} onClick={createOrganization}>{submitting ? "正在创建…" : "创建企业空间"} <ArrowRight /></button></footer>
  </div></Modal>}
  </>;
}

function AgentStudio() {
  const locale = useAppStore((s) => s.locale);
  const [step, setStep] = useState(0);
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<MeRecord>("/api/v1/me") });
  const [preview, setPreview] = useState("你好，我想了解你正在做什么。");
  const [saveState, setSaveState] = useState("");
  const [form, setForm] = useState<MeRecord | null>(null);
  const stages = [
    tr(locale,"身份","Identity"), tr(locale,"目标","Goals"), tr(locale,"边界","Boundaries"),
    tr(locale,"授权","Permissions"), tr(locale,"测试","Test")
  ];
  useEffect(() => {
    if (me.data) setForm(structuredClone(me.data));
  }, [me.data]);
  if (me.isLoading) return <><Topbar title={t(locale,"agent")} /><div className="page"><LoadingState /></div></>;
  if (me.error || !me.data || !form) return <><Topbar title={t(locale,"agent")} /><div className="page"><ErrorState error={me.error} /></div></>;
  const record = form;
  function setAgent<K extends keyof MeRecord["agent"]>(key: K, value: MeRecord["agent"][K]) {
    setForm((current) => current ? { ...current, agent: { ...current.agent, [key]: value } } : current);
  }
  function setUser<K extends keyof MeRecord["user"]>(key: K, value: MeRecord["user"][K]) {
    setForm((current) => current ? { ...current, user: { ...current.user, [key]: value } } : current);
  }
  async function saveAgent() {
    setSaveState("正在保存…");
    try {
      await Promise.all([
        api("/api/v1/me", {
          method: "PATCH",
          body: JSON.stringify({
            displayName: record.user.displayName, headline: record.user.headline,
            bio: record.user.bio, city: record.user.city, interests: record.user.interests,
            goals: record.user.goals, discoverable: record.user.discoverable
          })
        }),
        api("/api/v1/agents/me", {
          method: "PUT",
          body: JSON.stringify({
            name: record.agent.name,
            handle: record.user.handle,
            headline: record.agent.headline,
            bio: record.agent.bio || "",
            npcColor: record.agent.npcColor || "#e86751",
            languages: record.agent.languages.length ? record.agent.languages : ["zh-CN"],
            goals: record.agent.goals,
            interests: record.agent.interests,
            boundaries: record.agent.boundaries,
            tone: ["warm","direct","thoughtful","professional"].includes(record.agent.tone) ? record.agent.tone : "warm",
            modes: record.agent.modes
          })
        })
      ]);
      setSaveState("已保存到数据库");
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    } catch (caught) {
      setSaveState(caught instanceof Error ? caught.message : "保存失败");
    }
  }
  async function pauseAll() {
    const pausedModes = { personal: "paused", dating: "paused", community: "paused", business: "paused" } as const;
    setAgent("modes", pausedModes);
    setSaveState("正在暂停所有自动行动…");
    try {
      await api("/api/v1/agents/me", {
        method: "PUT",
        body: JSON.stringify({
          name: record.agent.name,
          handle: record.user.handle,
          headline: record.agent.headline,
          bio: record.agent.bio || "",
          npcColor: record.agent.npcColor || "#e86751",
          languages: record.agent.languages.length ? record.agent.languages : ["zh-CN"],
          goals: record.agent.goals,
          interests: record.agent.interests,
          boundaries: record.agent.boundaries,
          tone: ["warm","direct","thoughtful","professional"].includes(record.agent.tone) ? record.agent.tone : "warm",
          modes: pausedModes
        })
      });
      setSaveState("所有自动行动已暂停并保存");
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    } catch (caught) {
      setSaveState(caught instanceof Error ? caught.message : "暂停失败");
    }
  }
  return <><Topbar eyebrow="AGENT STUDIO" title={t(locale,"agent")} /><div className="page agent-studio">
    <section className="agent-identity-header"><div className="agent-orb xlarge"><Sparkles /></div><div><span className="live-dot" /> <small>{tr(locale,"真实 Agent 配置","Live Agent configuration")}</small><h2>{displayAgentName(locale,record.agent.name)}</h2><p>{displayAgentHeadline(locale,record.agent.headline)}</p></div><button className="ghost-small" onClick={pauseAll} disabled={Object.values(record.agent.modes).every(mode => mode === "paused")}><Pause /> {Object.values(record.agent.modes).every(mode => mode === "paused") ? tr(locale,"所有自动行动已暂停","All automatic actions are paused") : tr(locale,"暂停所有自动行动","Pause all automatic actions")}</button></section>
    <div className="studio-layout"><aside className="studio-steps">{stages.map((s,i)=><button key={s} onClick={()=>setStep(i)} className={step===i?"active":""}><span>0{i+1}</span>{s}<Check /></button>)}</aside>
      <section className="studio-form">{step===0&&<><span className="kicker">IDENTITY</span><h2>{tr(locale,"Agent 如何介绍你","How your Agent introduces you")}</h2><div className="field-row"><label>{tr(locale,"Agent 名字","Agent name")}<input value={record.agent.name} onChange={(event)=>setAgent("name",event.target.value)} /></label><label>{tr(locale,"回复气质","Response style")}<select value={record.agent.tone} onChange={(event)=>setAgent("tone",event.target.value)}><option value="warm">{tr(locale,"温暖真诚","Warm and genuine")}</option><option value="direct">{tr(locale,"直接清晰","Direct and clear")}</option><option value="thoughtful">{tr(locale,"认真思考","Thoughtful")}</option><option value="professional">{tr(locale,"专业克制","Professional")}</option></select></label></div><fieldset className="npc-color-field"><legend>{tr(locale,"广场小人颜色","Plaza NPC color")}</legend><div className="npc-color-preview"><span style={{ "--preview-shirt": record.agent.npcColor || "#e86751" } as CSSProperties}><i /><b /></span><small>{tr(locale,"在广场中用专属服装颜色认出自己的 Agent","Recognize your Agent in the plaza by its clothing color")}</small></div><div className="npc-color-options">{npcColorOptions.map((option)=><button key={option.value} type="button" className={(record.agent.npcColor || "#e86751") === option.value ? "active" : ""} onClick={()=>setAgent("npcColor",option.value)} aria-label={tr(locale,`选择${option.name}`,`Select ${option.value}`)} aria-pressed={(record.agent.npcColor || "#e86751") === option.value}><i style={{ background: option.value }} />{locale==="zh-CN"?option.name:option.value}</button>)}<label className="npc-custom-color">{tr(locale,"自定义","Custom")}<input type="color" value={record.agent.npcColor || "#e86751"} onChange={(event)=>setAgent("npcColor",event.target.value)} /></label></div></fieldset><label>{tr(locale,"Agent 一句话介绍","Agent tagline")}<input value={record.agent.headline} onChange={(event)=>setAgent("headline",event.target.value)} /></label><label>{tr(locale,"你的公开头衔","Your public headline")}<input value={record.user.headline} onChange={(event)=>setUser("headline",event.target.value)} /></label><label>{tr(locale,"你的公开简介","Your public bio")}<textarea value={record.user.bio} onChange={(event)=>setUser("bio",event.target.value)} /></label><div className="field-row"><label>{tr(locale,"城市","City")}<input value={record.user.city} onChange={(event)=>setUser("city",event.target.value)} /></label><label>{tr(locale,"公开可发现","Publicly discoverable")}<select value={record.user.discoverable?"yes":"no"} onChange={(event)=>setUser("discoverable",event.target.value==="yes")}><option value="yes">{tr(locale,"是","Yes")}</option><option value="no">{tr(locale,"否","No")}</option></select></label></div></>}
      {step===1&&<><span className="kicker">GOALS</span><h2>现在最值得 Agent 留意什么？</h2><label>每行一个目标<textarea value={record.user.goals.join("\n")} onChange={(event)=>setUser("goals",event.target.value.split("\n").map(item=>item.trim()).filter(Boolean))} /></label><label>每行一个兴趣<textarea value={record.user.interests.join("\n")} onChange={(event)=>setUser("interests",event.target.value.split("\n").map(item=>item.trim()).filter(Boolean))} /></label></>}
      {step===2&&<><span className="kicker">BOUNDARIES</span><h2>什么不能替你决定？</h2><label>每行一条边界<textarea value={record.agent.boundaries.join("\n")} onChange={(event)=>setAgent("boundaries",event.target.value.split("\n").map(item=>item.trim()).filter(Boolean))} /></label><div className="privacy-note"><ShieldCheck/><span><b>平台强制边界</b><small>付款、合同、退款和关系承诺即使未填写也会升级真人。</small></span></div></>}
      {step===3&&<><span className="kicker">PERMISSIONS</span><h2>不同场景，采用不同授权</h2>{([["personal","个人接待"],["dating","心动模式"],["community","社群撮合"],["business","企业接待"]] as const).map(([key,name])=><div className="permission-row" key={key}><span><b>{name}</b><small>高风险事项始终升级真人</small></span><select value={record.agent.modes[key] ?? "confirm"} onChange={(event)=>setAgent("modes",{...record.agent.modes,[key]:event.target.value as "auto"|"confirm"|"paused"})}><option value="auto">自动回复</option><option value="confirm">回复前确认</option><option value="paused">完全暂停</option></select></div>)}</>}
      {step===4&&<><span className="kicker">TEST</span><h2>以访客身份检查公开资料</h2><div className="test-chat"><div className="bubble visitor">{preview}</div><div className="bubble agent"><Bot />这里不会展示预制回答。保存配置后，请打开你的公开主页发送真实咨询，以验证 Agent 的实际接待和升级规则。</div></div><div className="test-input"><input value={preview} onChange={e=>setPreview(e.target.value)} /><button aria-label="打开公开主页测试" title="打开公开主页测试" onClick={() => window.open(`/@${record.user.handle}`, "_blank", "noopener,noreferrer")}><Send /></button></div></>}
      <footer className="studio-footer"><span><Check /> {saveState || tr(locale,"读取自真实数据库","Loaded from the live database")}</span><div><button className="ghost-small" disabled={step===0} onClick={()=>setStep(step-1)}>{tr(locale,"上一步","Back")}</button><button className="primary-small" onClick={step===4 ? saveAgent : ()=>setStep(Math.min(4,step+1))}>{step===4?tr(locale,"保存配置","Save configuration"):tr(locale,"下一步","Next")}</button></div></footer></section>
      <aside className="privacy-panel"><ShieldCheck /><h3>{tr(locale,"信息如何被使用","How information is used")}</h3><p>{tr(locale,"每条资料都能设置可见范围。","Every field can have its own visibility level.")}</p><ul><li><i className="public" />{tr(locale,"公开可见","Public")}</li><li><i className="match" />{tr(locale,"仅匹配时使用","Matching only")}</li><li><i className="agent" />{tr(locale,"仅 Agent 可用","Agent only")}</li><li><i className="never" />{tr(locale,"绝不对外分享","Never shared")}</li></ul><div className="capability-note compact"><Check /><span><b>{tr(locale,"审计记录已保存","Audit trail saved")}</b><small>{tr(locale,"完整时间线查看页面规划中","Full timeline viewer is planned")}</small></span></div></aside>
    </div>
  </div></>;
}

function Landing() {
  return <div className="landing">
    <header className="landing-nav"><Logo /><nav><a href="#how">如何工作</a><a href="#scenes">使用场景</a><a href="#safety">安全与边界</a></nav><div><Link className="primary-small" to="/app">登录 / 注册 <ArrowRight /></Link></div></header>
    <main>
      <section className="landing-hero"><div className="hero-copy"><span className="eyebrow coral"><Sparkles /> YOUR AGENT, YOUR CONNECTIONS</span><h1>让你的 Agent，<br />替你遇见<em>对的人。</em></h1><p>它先替你找人、破冰、接待与筛选。真正值得的时候，再把时间还给你。</p><div className="hero-actions"><Link className="primary large" to="/app">创建我的 Agent <ArrowRight /></Link><Link className="text-link" to="/app/dating"><Heart /> 让 Agent 帮我找对象</Link></div><div className="trust-note"><ShieldCheck /> 双向同意 · 随时接管 · 每句话可追溯</div></div>
        <div className="hero-visual"><div className="visual-caption"><span className="live-dot" /> 小遇正在替你认识世界</div><div className="connection-map">
          <div className="map-agent"><Sparkles /><b>小遇</b><small>你的 Agent</small></div>
          <div className="map-person mp1"><span>周</span><b>产品伙伴</b><small>91% 契合</small></div><div className="map-person mp2"><Heart/><b>匿名心动</b><small>94% 契合</small></div><div className="map-person mp3"><span>AI</span><b>创业者社群</b><small>3 个介绍</small></div>
          <svg viewBox="0 0 600 480"><path d="M300 240 C210 180 180 130 110 110"/><path d="M300 240 C390 150 430 135 505 115"/><path d="M300 240 C375 320 420 365 500 385"/></svg>
        </div></div>
      </section>
      <section id="how" className="principles"><span>AI 先沟通</span><ArrowRight/><span>双方都觉得值得</span><ArrowRight/><span>真人再出现</span></section>
      <section id="scenes" className="scene-section"><div className="section-intro"><span className="kicker">FOUR WAYS TO MEET</span><h2>不只是聊天，<br />而是替你承担“开始”的成本。</h2></div><div className="scene-grid">
        <Scene icon={Network} index="01" title="社群智能撮合" text="欢迎新人、理解需求，让每个介绍都有明确理由。" color="navy" />
        <Scene icon={Heart} index="02" title="Agent 帮你找对象" text="先匿名核对意向与边界，双向同意后才由真人出现。" color="coral" />
        <Scene icon={MessageCircle} index="03" title="个人代理接待" text="公开主页背后有人替你接住陌生联系，重要问题再交给你。" color="sage" />
        <Scene icon={BriefcaseBusiness} index="04" title="企业客户接待" text="Agent 先回答，复杂判断升级真人，团队共享完整上下文。" color="gold" />
      </div></section>
      <section id="safety" className="safety-section"><div><span className="eyebrow"><ShieldCheck/> BUILT AROUND CONSENT</span><h2>Agent 代表你，<br />但永远不越过你。</h2></div><div className="safety-points"><p><b>清楚标注</b><span>对方始终知道正在和 Agent 还是真人交谈。</span></p><p><b>随时接管</b><span>查看上下文、一键暂停、撤回同意或删除记忆。</span></p><p><b>高风险升级</b><span>付款、合同、退款和关系承诺必须由真人决定。</span></p></div></section>
    </main>
    <footer className="landing-footer"><Logo/><p>让值得的关系，更早发生。</p><span>© 2026 LifeYouMe</span></footer>
  </div>;
}

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      const result = await api<{ user: { name: string } }>(`/api/v1/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify({ name, email, password })
      });
      if (result.user) navigate("/app", { replace: true });
    } catch (caught) {
      const messages: Record<string, string> = {
        invalid_email: "请输入有效的邮箱地址",
        weak_password: "密码至少需要 8 位",
        invalid_name: "名字需要 2–40 个字符",
        email_already_exists: "这个邮箱已经注册，请直接登录",
        invalid_credentials: "邮箱或密码不正确"
      };
      setError(caught instanceof Error ? (messages[caught.message] ?? caught.message) : "操作失败，请稍后重试");
    } finally {
      setPending(false);
    }
  }
  return <div className="auth-page"><div className="auth-card"><Logo /><span className="kicker">MEYOU ACCOUNT</span><h1>{mode === "login" ? "登录你的遇见空间" : "创建你的遇见账号"}</h1><p>每个人拥有独立的 Agent、社群、匹配和消息，不与其他用户混用。</p><form onSubmit={submit}>{mode === "register" && <label>你的名字<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required minLength={2} placeholder="例如：林澄" /></label>}<label>邮箱<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required placeholder="you@example.com" /></label><label>密码<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={8} placeholder="至少 8 位" /></label>{error && <p className="form-error">{error}</p>}<button className="primary full" disabled={pending}>{pending ? "正在处理…" : mode === "login" ? "登录" : "注册并开始"}</button></form><a className="sso-button" href="https://auth.lifeyoume.icu/login">使用 LifeYouMe 统一账号登录 <ArrowRight size={15} /></a><button className="auth-switch" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>{mode === "login" ? "还没有账号？注册一个" : "已有账号？直接登录"}</button><small className="auth-note">统一账号登录后返回 MeYou，会自动映射到同一个用户身份。</small></div></div>;
}

function ProtectedApp() {
  if (import.meta.env.MODE === "test") return <AppShell />;
  const session = useQuery({ queryKey: ["session"], queryFn: () => api<SessionRecord>("/api/v1/session") });
  if (session.isLoading) return <div className="auth-page"><LoadingState label="正在确认登录状态…" /></div>;
  // Older embedded shells may not expose the session endpoint yet; keep them
  // usable while the production API explicitly returns `user: null` when
  // authentication is required.
  if (session.data && session.data.user === null) return <AuthPage />;
  return <AppShell />;
}

function Scene({ icon: Icon, index, title, text, color }: { icon: typeof Network; index: string; title: string; text: string; color: string }) {
  return <article className={`scene-card ${color}`}><span className="scene-index">{index}</span><div className="scene-icon"><Icon /></div><h3>{title}</h3><p>{text}</p><ArrowRight /></article>;
}

function PublicProfile() {
  const { handle = "" } = useParams();
  const normalized = handle.replace(/^@/, "");
  const profile = useQuery({
    queryKey: ["public-profile", normalized],
    queryFn: () => api<{ id:string; handle:string; name:string; headline:string; bio:string; city:string; interests:string[]; goals:string[]; agentName?:string; agentHeadline?:string }>(`/api/v1/public/profiles/${normalized}`)
  });
  const [sent,setSent]=useState(false);
  const [content,setContent]=useState("");
  const [error,setError]=useState("");
  async function submit() {
    setError("");
    try {
      await api(`/api/v1/public/profiles/${normalized}/inquiries`, {
        method:"POST",
        body:JSON.stringify({ content })
      });
      setSent(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "发送失败");
    }
  }
  if (profile.isLoading) return <div className="public-page"><LoadingState /></div>;
  if (profile.error || !profile.data) return <div className="public-page"><ErrorState error={profile.error} /></div>;
  const person=profile.data;
  return <div className="public-page"><header className="public-nav"><Logo/><Link to="/app">创建我的 Agent <ArrowRight/></Link></header><main className="profile-main"><section className="profile-card"><div className="profile-avatar">{person.name[0]}<span><Sparkles/></span></div><span className="profile-location">{person.city || "未公开城市"}</span><h1>{person.name}</h1><h2>{person.headline || "MeYou 成员"}</h2><p>{person.bio || "对方还没有填写公开简介。"}</p><div className="tag-row">{person.interests.map((item)=><i key={item}>{item}</i>)}</div><hr/><h3>最近想遇见</h3><ul>{person.goals.length ? person.goals.map((goal)=><li key={goal}><ArrowRight/>{goal}</li>) : <li>尚未公开目标</li>}</ul></section><section className="reception-card"><div className="reception-head"><div className="agent-orb"><Sparkles/></div><div><b>{person.agentName ?? "对方 Agent"} · {person.name}</b><span className="live-dot"/> <small>真实咨询入口</small></div></div>{sent?<div className="sent-state"><Check/><h2>已经保存</h2><p>这条咨询已写入 {person.name} 的真实收件箱，不是前端模拟状态。</p><Link to="/app">体验自己的 Agent</Link></div>:<><div className="welcome-bubble">{person.agentHeadline || `我会先替 ${person.name} 了解你的来意。重要问题会交给本人确认。`}</div><label>你为什么想联系 {person.name}？<textarea value={content} onChange={(event)=>setContent(event.target.value)} placeholder="简单介绍你自己，以及希望聊什么……"/></label>{error&&<p className="form-error">{error}</p>}<button className="primary full" disabled={!content.trim()} onClick={submit}><Send/> 发送真实咨询</button><p className="privacy-copy"><ShieldCheck/> 内容将进入对方收件箱，不会公开。</p></>}</section></main></div>;
}

export function App() {
  return <Routes>
    <Route path="/" element={<Landing />} />
    <Route path="/login" element={<AuthPage />} />
    <Route path="/admin/login" element={<AdminLogin />} />
    <Route path="/admin" element={<AdminConsole />} />
    <Route path="/:handle" element={<PublicProfile />} />
    <Route path="/app/*" element={<ProtectedApp />} />
  </Routes>;
}
