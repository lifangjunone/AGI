"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ApiOutlined, AppstoreOutlined, BarChartOutlined, CheckCircleFilled, CloudServerOutlined,
  CodeOutlined, DatabaseOutlined, DeleteOutlined, DeploymentUnitOutlined, DownOutlined, EditOutlined, GlobalOutlined, HomeOutlined, KeyOutlined,
  LogoutOutlined, PlusOutlined, ReloadOutlined, SearchOutlined, SettingOutlined,
  SyncOutlined, ThunderboltOutlined
} from "@ant-design/icons";

type Locale = "zh-CN" | "en-US";
type View = "overview" | "providers" | "models" | "routes" | "playground" | "usage";
type Provider = { id: string; name: string; kind: string; base_url: string; key_hint: string; auth_type?: string; header_name?: string; status: string; updated_at: string };
type Model = { id: string; provider_id: string; name: string; upstream_model: string; modality: string; context_window: number; input_price_per_mtok: number; output_price_per_mtok: number; status: string };
type Route = { id: string; name: string; alias: string; model_id: string; strategy: string; enabled: boolean };
type Invocation = { id: string; route_id: string; model_id: string; status: string; latency_ms: number; input_tokens: number; output_tokens: number; cost_usd: number; request_id: string; error_code?: string; created_at: string };
type Summary = { active_providers: number; active_models: number; active_routes: number; calls: number; tokens: number; cost_usd: number; errors: number };
type Dialog = "provider" | "model" | "route" | null;
type DiscoveredModel = {id:string;name:string;owned_by?:string};
type ChatMessage = { id: string; role: "user" | "assistant"; content: string; error?: boolean };

const apiBase = process.env.NEXT_PUBLIC_MAAS_API ?? "";

export default function Maas() {
  const [locale, setLocale] = useState<Locale>("zh-CN");
  const [view, setView] = useState<View>("overview");
  const [providers, setProviders] = useState<Provider[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [invocations, setInvocations] = useState<Invocation[]>([]);
  const [summary, setSummary] = useState<Summary>({ active_providers: 0, active_models: 0, active_routes: 0, calls: 0, tokens: 0, cost_usd: 0, errors: 0 });
  const [notice, setNotice] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [discoveryProvider, setDiscoveryProvider] = useState("");
  const [discoveredModels, setDiscoveredModels] = useState<DiscoveredModel[]>([]);
  const [selectedDiscovered, setSelectedDiscovered] = useState<string[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState("");
  const [prompt, setPrompt] = useState("用三点说明企业为什么需要统一模型网关。");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const conversationRef = useRef<HTMLDivElement>(null);
  const msg = (zh: string, en: string) => locale === "zh-CN" ? zh : en;
  const suiteURL = (port: number, path = "/") => typeof window === "undefined" ? "" : `${window.location.protocol}//${window.location.hostname}:${port}${path}`;
  const productURL = (port: number) => {
    if (typeof window === "undefined") return "#";
    const url = new URL(suiteURL(port));
    const token = localStorage.getItem("nexora_token");
    if (token) url.searchParams.set("token", token);
    url.searchParams.set("locale", locale);
    return url.toString();
  };
  const titles: Record<View, string> = {
    overview: msg("模型运营总览", "Model operations"),
    providers: msg("模型供应商", "Model providers"),
    models: msg("模型目录", "Model catalog"),
    routes: msg("模型路由", "Model routing"),
    playground: msg("调用测试", "Playground"),
    usage: msg("用量与成本", "Usage & cost")
  };
  const headers = useCallback(() => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${localStorage.getItem("nexora_token") ?? ""}`
  }), []);
  async function request(path: string, init?: RequestInit) {
    const response = await fetch(`${apiBase}${path}`, { ...init, headers: { ...headers(), ...(init?.headers ?? {}) } });
    const data = response.status === 204 ? null : await response.json().catch(() => ({}));
    if (response.status === 401) {
      localStorage.removeItem("nexora_token");
      window.location.replace(`${suiteURL(3000)}?reason=session_expired`);
      throw new Error(msg("登录已过期。", "Session expired."));
    }
    if (!response.ok) throw new Error(data?.error?.message ?? `Request failed (${response.status})`);
    return data;
  }
  const load = useCallback(async () => {
    try {
      const [p, m, r, i, s] = await Promise.all([
        request("/api/v1/providers"), request("/api/v1/models"), request("/api/v1/routes"),
        request("/api/v1/invocations"), request("/api/v1/summary")
      ]);
      setProviders(p.items ?? []); setModels(m.items ?? []); setRoutes(r.items ?? []);
      setInvocations(i.items ?? []); setSummary(s);
      if (!selectedRoute && r.items?.[0]) setSelectedRoute(r.items[0].alias);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Load failed"); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const nextLocale = params.get("locale");
    if (params.get("logout") === "1") {
      localStorage.removeItem("nexora_token");
      if (params.get("embedded") !== "1") window.location.replace(suiteURL(3000, "/?logout=1"));
      return;
    }
    if (token) {
      localStorage.setItem("nexora_token", token); params.delete("token");
      window.history.replaceState({}, "", `${window.location.pathname}${params.size ? `?${params}` : ""}`);
    }
    if (nextLocale === "zh-CN" || nextLocale === "en-US") setLocale(nextLocale);
    if (!token && !localStorage.getItem("nexora_token")) {
      window.location.replace(`${suiteURL(3000)}?reason=login_required`); return;
    }
    void load();
  }, [load]);
  useEffect(() => {
    if (!menuOpen) return;
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);
  useEffect(() => {
    if (view !== "playground") return;
    conversationRef.current?.scrollTo({ top: conversationRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy, view]);
  function logout() {
    localStorage.removeItem("nexora_token"); localStorage.removeItem("nexora_locale");
    setLoggingOut(true); setMenuOpen(false);
    window.setTimeout(() => window.location.replace(suiteURL(3000, "/?logout=1")), 450);
  }
  function closeDialog() {
    setDialog(null);
    setEditingProvider(null);
    setDiscoveryProvider("");
    setDiscoveredModels([]);
    setSelectedDiscovered([]);
    setDiscovering(false);
  }
  function openProviderDialog(item?: Provider) {
    setEditingProvider(item ?? null);
    setDialog("provider");
  }
  function openModelDialog(providerID = "") {
    setDialog("model");
    setDiscoveredModels([]);
    setSelectedDiscovered([]);
    if (providerID) void discoverModels(providerID);
    else setDiscoveryProvider("");
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      if (dialog === "provider") {
        const payload = {
          name: data.get("name"), kind: data.get("kind"), base_url: data.get("base_url"), api_key: data.get("api_key"),
          auth_type: data.get("auth_type"), header_name: data.get("header_name")
        };
        await request(editingProvider ? `/api/v1/providers/${editingProvider.id}` : "/api/v1/providers", {
          method: editingProvider ? "PATCH" : "POST",
          body: JSON.stringify(payload)
        });
      }
      if (dialog === "model") {
        if (selectedDiscovered.length) await request("/api/v1/models/import", { method: "POST", body: JSON.stringify({
          provider_id: data.get("provider_id"), model_ids: selectedDiscovered, context_window: Number(data.get("context_window"))
        }) });
        else await request("/api/v1/models", { method: "POST", body: JSON.stringify({
          name: data.get("name"), provider_id: data.get("provider_id"), upstream_model: data.get("upstream_model"),
          modality: "text", context_window: Number(data.get("context_window")), input_price_per_mtok: Number(data.get("input_price")),
          output_price_per_mtok: Number(data.get("output_price"))
        }) });
      }
      if (dialog === "route") await request("/api/v1/routes", { method: "POST", body: JSON.stringify({
        name: data.get("name"), alias: data.get("alias"), model_id: data.get("model_id"), strategy: "primary"
      }) });
      setNotice(dialog === "provider" ? editingProvider ? msg("供应商配置已更新。", "Provider configuration updated.") : msg("供应商已安全接入。", "Provider connected securely.") : dialog === "model" ? msg("模型已加入目录。", "Model added to catalog.") : msg("模型路由已创建。", "Model route created."));
      closeDialog(); await load();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Create failed"); } finally { setBusy(false); }
  }
  async function discoverModels(providerID:string) {
    setDiscoveryProvider(providerID); setDiscoveredModels([]); setSelectedDiscovered([]);
    if (!providerID) return;
    setDiscovering(true);
    try {
      const data = await request(`/api/v1/providers/${providerID}/models`);
      setDiscoveredModels(data.items ?? []);
      setSelectedDiscovered((data.items ?? []).map((item:DiscoveredModel)=>item.id));
      if (!(data.items ?? []).length) setNotice(msg("端点连接成功，但没有发现模型。你仍可手工登记模型 ID。", "Endpoint connected, but no models were discovered. You can still register an ID manually."));
    } catch (error) { setNotice(error instanceof Error ? error.message : "Discovery failed"); }
    finally { setDiscovering(false); }
  }
  async function testProvider(id: string) {
    setNotice(msg("正在检查供应商连接…", "Checking provider connection…"));
    try {
      const result = await request(`/api/v1/providers/${id}/test`, { method: "POST", body: "{}" });
      setNotice(msg(`连接正常，延迟 ${result.latency_ms} ms。`, `Connection healthy, ${result.latency_ms} ms.`));
    } catch (error) { setNotice(error instanceof Error ? error.message : "Connection failed"); }
  }
  function openProviderPlayground(item: Provider) {
    const providerModels = models.filter(model => model.provider_id === item.id && model.status === "active");
    const route = routes.find(candidate => candidate.enabled && providerModels.some(model => model.id === candidate.model_id));
    if (route) {
      setSelectedRoute(route.alias);
      setPrompt(msg("请用三句话介绍你自己的能力，并说明你当前是通过 Nexora MaaS 哪条模型路由被调用的。", "In three sentences, introduce your capabilities and explain that you are being invoked through a Nexora MaaS model route."));
      setMessages([]);
      setNotice(msg(`已切换到调用测试，并选择路由 ${route.alias}。输入问题后会真实请求模型。`, `Opened Playground with route ${route.alias}. Your question will call the real model.`));
      setView("playground");
      return;
    }
    if (providerModels.length) {
      setNotice(msg("这个供应商已有模型，但还没有可用路由。请先为模型创建稳定调用别名，再进行问答测试。", "This provider has models but no enabled route. Create a stable model alias before live testing."));
      setView("routes");
      return;
    }
    setNotice(msg("这个供应商还没有导入模型。请先发现并导入模型，再创建路由进行调用测试。", "This provider has no imported models. Discover and import models, then create a route for live testing."));
    openModelDialog(item.id);
  }
  async function toggleProvider(item: Provider) {
    try {
      await request(`/api/v1/providers/${item.id}`, { method: "PATCH", body: JSON.stringify({ status: item.status === "active" ? "disabled" : "active" }) });
      setNotice(item.status === "active" ? msg("供应商已停用，相关模型路由将不可用。", "Provider disabled; related routes are unavailable.") : msg("供应商已启用。", "Provider enabled."));
      await load();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Update failed"); }
  }
  async function deleteProvider(item: Provider) {
    if (!window.confirm(msg(`确定删除供应商「${item.name}」？已有模型绑定时会被拒绝。`, `Delete provider "${item.name}"? The request is rejected if models still use it.`))) return;
    try {
      await request(`/api/v1/providers/${item.id}`, { method: "DELETE" });
      setNotice(msg("供应商已删除。", "Provider deleted."));
      await load();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Delete failed"); }
  }
  async function toggleModel(item: Model) {
    try {
      await request(`/api/v1/models/${item.id}`, { method: "PATCH", body: JSON.stringify({
        status: item.status === "active" ? "disabled" : "active",
        input_price_per_mtok: item.input_price_per_mtok, output_price_per_mtok: item.output_price_per_mtok
      }) }); await load();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Update failed"); }
  }
  async function toggleRoute(item: Route) {
    try { await request(`/api/v1/routes/${item.id}`, { method: "PATCH", body: JSON.stringify({ enabled: !item.enabled }) }); await load(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Update failed"); }
  }
  async function invoke() {
    const question = prompt.trim();
    if (!selectedRoute || !question) return;
    setBusy(true); setNotice("");
    setMessages(value => [...value, { id: `usr-${Date.now()}`, role: "user", content: question }]);
    setPrompt("");
    try {
      const result = await request("/v1/chat/completions", { method: "POST", body: JSON.stringify({
        model: selectedRoute, messages: [{ role: "user", content: question }], temperature: 0.3
      }) });
      setMessages(value => [...value, { id: `asst-${Date.now()}`, role: "assistant", content: result.choices?.[0]?.message?.content ?? JSON.stringify(result, null, 2) }]);
      await load();
    } catch (error) {
      const text = error instanceof Error ? error.message : "Invocation failed";
      setMessages(value => [...value, { id: `err-${Date.now()}`, role: "assistant", content: text, error: true }]);
      setNotice(text);
    } finally { setBusy(false); }
  }
  const filteredProviders = useMemo(() => providers.filter(x => `${x.name} ${x.kind} ${x.base_url}`.toLowerCase().includes(search.toLowerCase())), [providers, search]);
  const filteredModels = useMemo(() => models.filter(x => `${x.name} ${x.upstream_model}`.toLowerCase().includes(search.toLowerCase())), [models, search]);
  const providerName = (id: string) => providers.find(x => x.id === id)?.name ?? id;
  const modelName = (id: string) => models.find(x => x.id === id)?.name ?? id;
  const nav: [View, React.ReactNode][] = [
    ["overview", <AppstoreOutlined key="o" />], ["providers", <CloudServerOutlined key="p" />],
    ["models", <DatabaseOutlined key="m" />], ["routes", <DeploymentUnitOutlined key="r" />],
    ["playground", <CodeOutlined key="g" />], ["usage", <BarChartOutlined key="u" />]
  ];
  return <div className="app">
    {loggingOut && <div className="logout-frames" aria-hidden="true"><iframe src={suiteURL(3001, "/?logout=1&embedded=1")} title="Studio logout" /><iframe src={suiteURL(3002, "/?logout=1&embedded=1")} title="Control logout" /></div>}
    <aside className="side">
      <div className="brand"><b>M</b><span>Nexora MaaS<small>{msg("统一模型服务平台", "Model service platform")}</small></span></div>
      <nav>{nav.map(([key, icon]) => <button key={key} className={view === key ? "active" : ""} onClick={() => { setView(key); setSearch(""); }}>{icon}<span>{titles[key]}</span></button>)}</nav>
      <div className="foundation"><KeyOutlined /><span><strong>Nexora Core</strong><small>{msg("统一身份与租户边界", "Identity & tenancy")}</small></span><CheckCircleFilled /></div>
    </aside>
    <main className="main">
      <header className="topbar">
        <div><small>NEXORA MAAS · 星模</small><h1>{titles[view]}</h1></div>
        <div className="top-actions">
          <div className="user-menu" ref={menuRef}>
            <button className={`account-trigger${menuOpen ? " open" : ""}`} onClick={() => setMenuOpen(x => !x)} aria-label={msg("打开账户与产品菜单", "Open account and product menu")} aria-haspopup="menu" aria-expanded={menuOpen}>
              <span className="account-avatar">NA</span>
              <span className="account-copy"><strong>Nexora Admin</strong><small>{msg("企业管理员", "Workspace admin")}</small></span>
              <DownOutlined className="account-chevron" />
            </button>
            {menuOpen && <div className="popover" role="menu">
              <div className="account-summary"><span className="summary-avatar">NA</span><span><strong>Nexora Admin</strong><small>admin@nexora.local</small></span></div>
              <section className="menu-section">
                <small className="menu-label">{msg("产品切换", "SWITCH PRODUCT")}</small>
                <a href={suiteURL(3000)} role="menuitem"><HomeOutlined /><span><strong>{msg("统一门户", "Nexora Portal")}</strong><small>Nexora Core · 星核</small></span></a>
                <a href={productURL(3001)} role="menuitem"><CodeOutlined /><span><strong>Nexora Studio</strong><small>{msg("智能体开发平台", "Agent development")}</small></span></a>
                <a href={productURL(3002)} role="menuitem"><AppstoreOutlined /><span><strong>Nexora Control</strong><small>{msg("Agent 统一纳管", "Agent governance")}</small></span></a>
                <div className="current-product"><DeploymentUnitOutlined /><span><strong>Nexora MaaS</strong><small>{msg("当前产品", "Current product")}</small></span><CheckCircleFilled /></div>
              </section>
              <section className="menu-section preference-section">
                <span className="preference-label"><GlobalOutlined />{msg("界面语言", "Language")}</span>
                <div className="locale-switch" aria-label={msg("界面语言", "Language")}>
                  <button className={locale === "zh-CN" ? "active" : ""} onClick={() => setLocale("zh-CN")}>中文</button>
                  <button className={locale === "en-US" ? "active" : ""} onClick={() => setLocale("en-US")}>EN</button>
                </div>
              </section>
              <button className="signout-item" role="menuitem" onClick={logout}><LogoutOutlined /><span>{msg("退出全部产品", "Sign out of all products")}</span></button>
            </div>}
          </div>
        </div>
      </header>
      {notice && <div className="notice"><span>{notice}</span><button onClick={() => setNotice("")}>×</button></div>}
      {view === "overview" && <Overview summary={summary} invocations={invocations} providers={providers} models={models} routes={routes} locale={locale} setView={setView} open={setDialog} />}
      {view === "providers" && <section className="workspace"><Toolbar search={search} setSearch={setSearch} placeholder={msg("搜索名称、类型或地址", "Search name, kind, or endpoint")} action={msg("接入供应商", "Connect provider")} onAction={() => openProviderDialog()} hideAction={!providers.length} />
        <div className="table"><div className="thead"><span>{msg("供应商", "Provider")}</span><span>{msg("接口地址", "Endpoint")}</span><span>{msg("凭据", "Credential")}</span><span>{msg("状态", "Status")}</span><span>{msg("操作", "Action")}</span></div>
          {filteredProviders.length ? filteredProviders.map(item => <div className="trow" key={item.id}><span className="name-cell"><i>{item.name.slice(0, 1).toUpperCase()}</i><b>{item.name}<small>{item.kind} · {item.auth_type || "bearer"}</small></b></span><code>{item.base_url}</code><span>{item.key_hint || msg("无鉴权", "No auth")}</span><Status active={item.status === "active"} text={item.status} /><div className="row-actions"><button className="link" onClick={() => openProviderDialog(item)}><EditOutlined /> {msg("编辑", "Edit")}</button><button className="link" onClick={() => openModelDialog(item.id)}><SyncOutlined /> {msg("发现模型", "Discover")}</button><button className="link" onClick={() => void testProvider(item.id)}><ThunderboltOutlined /> {msg("连通性", "Connectivity")}</button><button className="link strong" onClick={() => openProviderPlayground(item)}><CodeOutlined /> {msg("调用测试", "Playground")}</button><button className="link" onClick={() => void toggleProvider(item)}>{item.status === "active" ? msg("停用", "Disable") : msg("启用", "Enable")}</button><button className="link danger" onClick={() => void deleteProvider(item)}><DeleteOutlined /> {msg("删除", "Delete")}</button></div></div>) : <Empty title={msg("还没有模型供应商", "No providers connected")} text={msg("接入 OpenAI、Claude、Gemini、DeepSeek 或任意 OpenAI-compatible 服务。", "Connect OpenAI, Claude, Gemini, DeepSeek, or any OpenAI-compatible endpoint.")} action={msg("接入第一个供应商", "Connect first provider")} onAction={() => openProviderDialog()} />}</div>
      </section>}
      {view === "models" && <section className="workspace"><Toolbar search={search} setSearch={setSearch} placeholder={msg("搜索模型名称或上游 ID", "Search model or upstream ID")} action={msg("发现/添加模型", "Discover/Add model")} onAction={() => openModelDialog()} disabled={!providers.length} hideAction={!models.length} />
        <div className="model-grid">{filteredModels.length ? filteredModels.map(item => <article className="model-card" key={item.id}><header><span className="model-symbol">AI</span><Status active={item.status === "active"} text={item.status} /></header><h3>{item.name}</h3><p>{item.upstream_model}</p><dl><div><dt>{msg("供应商", "Provider")}</dt><dd>{providerName(item.provider_id)}</dd></div><div><dt>{msg("上下文", "Context")}</dt><dd>{item.context_window ? `${Math.round(item.context_window / 1000)}K` : "—"}</dd></div><div><dt>{msg("输入价格", "Input price")}</dt><dd>${item.input_price_per_mtok}/M</dd></div><div><dt>{msg("输出价格", "Output price")}</dt><dd>${item.output_price_per_mtok}/M</dd></div></dl><button className="button full" onClick={() => void toggleModel(item)}>{item.status === "active" ? msg("停用模型", "Disable model") : msg("启用模型", "Enable model")}</button></article>) : <Empty title={msg("模型目录为空", "Model catalog is empty")} text={providers.length ? msg("添加供应商提供的模型，配置上下文窗口与计价。", "Add a provider model with context and pricing.") : msg("需要先接入模型供应商。", "Connect a provider first.")} action={providers.length ? msg("发现/添加模型", "Discover/Add model") : msg("接入供应商", "Connect provider")} onAction={() => providers.length ? openModelDialog() : openProviderDialog()} />}</div>
      </section>}
      {view === "routes" && <section className="workspace"><div className="section-head"><div><h2>{msg("稳定别名与上游模型解耦", "Decouple stable aliases from upstream models")}</h2><p>{msg("Agent 只调用稳定别名；切换供应商或模型时无需修改 Agent。", "Agents call stable aliases, so upstream changes require no agent changes.")}</p></div>{routes.length > 0 && <button className="button primary" disabled={!models.length} onClick={() => setDialog("route")}><PlusOutlined /> {msg("创建路由", "Create route")}</button>}</div>
        <div className="route-list">{routes.length ? routes.map(item => <article key={item.id}><span className="route-icon"><ApiOutlined /></span><div><strong>{item.name}</strong><code>{item.alias}</code></div><span className="arrow">→</span><div><small>{msg("当前模型", "Current model")}</small><b>{modelName(item.model_id)}</b></div><Status active={item.enabled} text={item.enabled ? "active" : "disabled"} /><button className="switch" aria-pressed={item.enabled} onClick={() => void toggleRoute(item)}><i /></button></article>) : <Empty title={msg("还没有模型路由", "No model routes")} text={models.length ? msg("创建一个稳定调用别名并绑定模型。", "Create a stable alias and bind it to a model.") : msg("添加模型后才能创建路由。", "Add a model before creating a route.")} action={models.length ? msg("创建路由", "Create route") : msg("添加模型", "Add model")} onAction={() => models.length ? setDialog("route") : providers.length ? openModelDialog() : openProviderDialog()} />}</div>
      </section>}
      {view === "playground" && <section className="playground"><div className="playground-config"><h2>{msg("调用配置", "Invocation")}</h2><label>{msg("模型路由", "Model route")}<select value={selectedRoute} onChange={e => setSelectedRoute(e.target.value)}><option value="">{msg("选择可用路由", "Choose a route")}</option>{routes.filter(x => x.enabled).map(x => <option key={x.id} value={x.alias}>{x.alias} · {modelName(x.model_id)}</option>)}</select></label><label>Temperature<input type="range" min="0" max="1" step=".1" defaultValue=".3" /></label><div className="endpoint"><small>OpenAI-compatible API</small><code>POST /v1/chat/completions</code></div></div><div className="playground-chat"><header><div><span className="live-dot" /><strong>{msg("真实模型调用测试", "Live model invocation")}</strong></div><button className="button" onClick={() => setMessages([])}>{msg("清空", "Clear")}</button></header><div className="conversation" ref={conversationRef}>{messages.length ? <div className="message-stack">{messages.map(item => <div className={`chat-message ${item.role}${item.error ? " error" : ""}`} key={item.id}><span>{item.role === "user" ? "你" : "M"}</span><p>{item.content}</p></div>)}{busy && <div className="chat-message assistant pending"><span>M</span><p>{msg("模型正在返回…", "Model is responding…")}</p></div>}</div> : <div className="playground-empty"><ApiOutlined /><strong>{msg("验证路由、凭据与模型响应", "Verify routing, credentials, and model response")}</strong><p>{msg("请求会真实发送到当前路由绑定的供应商，不使用模拟回答。", "Requests are sent to the selected provider; no response is simulated.")}</p></div>}</div><div className="composer"><textarea value={prompt} onChange={e => setPrompt(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void invoke(); }} aria-label={msg("测试提示词", "Test prompt")} placeholder={msg("输入问题，Ctrl/⌘ + Enter 发送", "Ask a question, Ctrl/⌘ + Enter to send")} /><button disabled={busy || !selectedRoute || !prompt.trim()} onClick={() => void invoke()}>{busy ? "…" : "↑"}</button></div></div></section>}
      {view === "usage" && <section className="workspace"><div className="metric-strip"><Metric label={msg("累计调用", "Calls")} value={summary.calls.toLocaleString()} /><Metric label="Tokens" value={summary.tokens.toLocaleString()} /><Metric label={msg("估算成本", "Estimated cost")} value={`$${summary.cost_usd.toFixed(4)}`} /><Metric label={msg("失败调用", "Failed")} value={summary.errors.toLocaleString()} /></div><div className="table usage-table"><div className="thead"><span>{msg("时间", "Time")}</span><span>{msg("请求 ID", "Request ID")}</span><span>{msg("模型", "Model")}</span><span>{msg("延迟", "Latency")}</span><span>Tokens</span><span>{msg("成本", "Cost")}</span><span>{msg("状态", "Status")}</span></div>{invocations.length ? invocations.map(item => <div className="trow" key={item.id}><time>{new Date(item.created_at).toLocaleString(locale)}</time><code>{item.request_id}</code><span>{modelName(item.model_id)}</span><span>{item.latency_ms} ms</span><span>{item.input_tokens + item.output_tokens}</span><span>${item.cost_usd.toFixed(5)}</span><Status active={item.status === "success"} text={item.status} /></div>) : <Empty title={msg("暂无调用记录", "No invocations yet")} text={msg("在调用测试中发起真实请求后，这里会展示用量、延迟与成本。", "Live requests will appear here with usage, latency, and cost.")} action={msg("前往调用测试", "Open playground")} onAction={() => setView("playground")} />}</div></section>}
    </main>
    {dialog && <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && closeDialog()}><form className="modal" onSubmit={submit}><header><div><small>NEXORA MAAS</small><h2>{dialog === "provider" ? editingProvider ? msg("编辑模型供应商", "Edit provider") : msg("接入模型供应商", "Connect provider") : dialog === "model" ? msg("发现并导入模型", "Discover and import models") : msg("创建模型路由", "Create route")}</h2></div><button type="button" aria-label={msg("关闭", "Close")} onClick={closeDialog}>×</button></header>
      {dialog === "provider" && <><div className="connection-choice"><strong>{editingProvider ? msg("修改供应商连接、认证与状态", "Update provider connection and authentication") : msg("接入哪一类模型服务？", "What are you connecting?")}</strong><span>{msg("云厂商 API 与企业私有化推理端点都可以统一纳管。保存后可立即测试连接并发现模型。", "Manage cloud APIs and private inference endpoints through one gateway. After saving, test connectivity and discover models.")}</span></div><label>{msg("显示名称", "Display name")}<input name="name" required autoFocus defaultValue={editingProvider?.name ?? ""} placeholder={msg("例如：生产环境 Qwen 集群", "e.g. Production Qwen cluster")} /></label><label>{msg("服务类型", "Service type")}<select name="kind" defaultValue={editingProvider?.kind ?? "qwen"}><optgroup label={msg("公有云模型厂商", "Cloud model providers")}><option value="qwen">通义千问 / Alibaba Qwen</option><option value="deepseek">DeepSeek</option><option value="openai">OpenAI</option><option value="anthropic">Anthropic Claude</option><option value="gemini">Google Gemini</option><option value="doubao">火山方舟 / Doubao</option><option value="hunyuan">腾讯混元 / Hunyuan</option><option value="zhipu">智谱 GLM</option><option value="moonshot">Moonshot / Kimi</option><option value="minimax">MiniMax</option><option value="baichuan">百川智能</option><option value="siliconflow">硅基流动 / SiliconFlow</option></optgroup><optgroup label={msg("私有化部署与自建服务", "Private deployment & self-hosted")}><option value="vllm">vLLM</option><option value="sglang">SGLang</option><option value="ollama">Ollama</option><option value="tgi">Hugging Face TGI</option><option value="lmdeploy">LMDeploy</option><option value="openai-compatible">自建 OpenAI-compatible Endpoint</option></optgroup></select></label><label>{msg("API 基础地址", "Base URL")}<input name="base_url" type="url" required defaultValue={editingProvider?.base_url ?? ""} placeholder="http://model-gateway.internal:8000/v1" /><small>{msg("私有部署填写集群可访问地址，通常以 /v1 结尾。", "Use the cluster-reachable endpoint, usually ending in /v1.")}</small></label><label>{msg("认证方式", "Authentication")}<select name="auth_type" defaultValue={editingProvider?.auth_type ?? "bearer"}><option value="bearer">Bearer API Key</option><option value="none">{msg("无鉴权（可信内网）", "No authentication (trusted network)")}</option><option value="header">{msg("自定义 Header", "Custom header")}</option></select></label><label>{editingProvider ? msg("新 API Key / Header 值（留空保持不变）", "New API key / header value (leave blank to keep)") : msg("API Key / Header 值", "API key / header value")}<input name="api_key" type="password" autoComplete="new-password" placeholder="sk-••••••••" /><small>{msg("服务端加密保存；无鉴权端点可留空。", "Encrypted server-side; leave empty for unauthenticated endpoints.")}</small></label><label>{msg("自定义 Header 名称（可选）", "Custom header name (optional)")}<input name="header_name" defaultValue={editingProvider?.header_name ?? ""} placeholder="X-API-Key" /></label></>}
      {dialog === "model" && <><label>{msg("供应商或私有端点", "Provider or private endpoint")}<select name="provider_id" required value={discoveryProvider} onChange={e=>void discoverModels(e.target.value)}><option value="">{msg("选择后自动发现模型", "Select to discover models")}</option>{providers.filter(x => x.status === "active").map(x => <option value={x.id} key={x.id}>{x.name} · {x.kind}</option>)}</select></label>{discovering?<div className="discovery-state">{msg("正在读取上游 /models…", "Discovering from upstream /models…")}</div>:discoveredModels.length>0?<div className="discovered-models"><header><span><strong>{msg(`发现 ${discoveredModels.length} 个模型`,`Discovered ${discoveredModels.length} models`)}</strong><small>{msg("选择需要纳入星模目录的模型", "Choose models to import into the MaaS catalog")}</small></span><button type="button" onClick={()=>setSelectedDiscovered(selectedDiscovered.length===discoveredModels.length?[]:discoveredModels.map(item=>item.id))}>{selectedDiscovered.length===discoveredModels.length?msg("取消全选","Clear"):msg("全选","Select all")}</button></header><div>{discoveredModels.map(item=><label key={item.id} className={selectedDiscovered.includes(item.id)?"selected":""}><input type="checkbox" checked={selectedDiscovered.includes(item.id)} onChange={e=>setSelectedDiscovered(value=>e.target.checked?[...value,item.id]:value.filter(id=>id!==item.id))}/><span><strong>{item.name}</strong><code>{item.id}</code></span></label>)}</div></div>:<div className="manual-model"><strong>{msg("手工登记模型", "Manual registration")}</strong><label>{msg("模型名称", "Model name")}<input name="name" required={!selectedDiscovered.length} placeholder="Qwen3 32B" /></label><label>{msg("上游模型 ID", "Upstream model ID")}<input name="upstream_model" required={!selectedDiscovered.length} placeholder="Qwen/Qwen3-32B" /></label></div>}<div className="form-grid"><label>{msg("上下文窗口", "Context window")}<input name="context_window" type="number" min="1" defaultValue="32768" /></label><label>{msg("输入 $/M Tokens", "Input $/M tokens")}<input name="input_price" type="number" min="0" step=".01" defaultValue="0" /></label><label>{msg("输出 $/M Tokens", "Output $/M tokens")}<input name="output_price" type="number" min="0" step=".01" defaultValue="0" /></label></div></>}
      {dialog === "route" && <><label>{msg("路由名称", "Route name")}<input name="name" required autoFocus placeholder={msg("Agent 默认模型", "Agent default model")} /></label><label>{msg("调用别名", "Model alias")}<input name="alias" required pattern="[a-zA-Z0-9._-]+" placeholder="agent-default" /><small>{msg("调用 API 时作为 model 参数使用。", "Used as the model field in API requests.")}</small></label><label>{msg("绑定模型", "Bound model")}<select name="model_id" required>{models.filter(x => x.status === "active").map(x => <option value={x.id} key={x.id}>{x.name} · {providerName(x.provider_id)}</option>)}</select></label></>}
      <footer><button type="button" className="button" onClick={closeDialog}>{msg("取消", "Cancel")}</button><button className="button primary" disabled={busy||dialog==="model"&&(!discoveryProvider||discoveredModels.length>0&&!selectedDiscovered.length)}>{busy ? "…" : dialog==="provider"&&editingProvider?msg("保存修改", "Save changes"):dialog==="model"&&selectedDiscovered.length?msg(`导入 ${selectedDiscovered.length} 个模型`,`Import ${selectedDiscovered.length} models`):msg("确认创建", "Create")}</button></footer>
    </form></div>}
  </div>;
}

function Overview({ summary, invocations, providers, models, routes, locale, setView, open }: { summary: Summary; invocations: Invocation[]; providers: Provider[]; models: Model[]; routes: Route[]; locale: Locale; setView: (v: View) => void; open: (v: Dialog) => void }) {
  const zh = locale === "zh-CN";
  const modelName = (id: string) => models.find(x => x.id === id)?.name ?? id;
  return <div className="overview">
    <section className="metric-grid"><Metric label={zh ? "可用供应商" : "Active providers"} value={summary.active_providers} note={zh ? "凭据隔离接入" : "Credential-isolated"} /><Metric label={zh ? "在线模型" : "Active models"} value={summary.active_models} note={zh ? "统一模型目录" : "Unified catalog"} /><Metric label={zh ? "生效路由" : "Active routes"} value={summary.active_routes} note={zh ? "稳定调用别名" : "Stable aliases"} /><Metric label={zh ? "累计调用" : "Total calls"} value={summary.calls} note={`${summary.tokens.toLocaleString()} Tokens`} /></section>
    <section className="flow-card"><div className="flow-head"><div><small>{zh ? "模型服务链路" : "MODEL SERVICE FLOW"}</small><h2>{zh ? "一次接入，统一供给所有 AI 应用" : "Connect once, serve every AI application"}</h2></div><span><i /> {zh ? "网关运行正常" : "Gateway operational"}</span></div><div className="flow-steps"><button onClick={() => providers.length ? setView("providers") : open("provider")}><b>1</b><span><strong>{zh ? "接入供应商" : "Connect provider"}</strong><small>{providers.length} {zh ? "个已接入" : "connected"}</small></span></button><i>→</i><button onClick={() => models.length ? setView("models") : open(providers.length ? "model" : "provider")}><b>2</b><span><strong>{zh ? "登记模型" : "Register model"}</strong><small>{models.length} {zh ? "个模型" : "models"}</small></span></button><i>→</i><button onClick={() => routes.length ? setView("routes") : open(models.length ? "route" : providers.length ? "model" : "provider")}><b>3</b><span><strong>{zh ? "配置路由" : "Configure route"}</strong><small>{routes.length} {zh ? "个稳定别名" : "stable aliases"}</small></span></button><i>→</i><button onClick={() => setView("playground")}><b>4</b><span><strong>{zh ? "统一调用" : "Invoke uniformly"}</strong><small>OpenAI-compatible</small></span></button></div></section>
    <section className="overview-grid"><div className="panel"><header><div><h3>{zh ? "模型供给状态" : "Model supply"}</h3><p>{zh ? "供应商、模型与路由的实时可用性" : "Live availability across providers, models, and routes"}</p></div><button className="icon-button" onClick={() => setView("models")}><ReloadOutlined /></button></header>{models.length ? models.slice(0, 5).map(item => <div className="supply-row" key={item.id}><span className="model-symbol">AI</span><div><strong>{item.name}</strong><small>{providers.find(x => x.id === item.provider_id)?.name ?? item.provider_id}</small></div><span>{item.context_window ? `${Math.round(item.context_window / 1000)}K` : "—"}</span><Status active={item.status === "active"} text={item.status} /></div>) : <Empty title={zh ? "等待接入模型" : "Waiting for models"} text={zh ? "完成供应商和模型配置后即可统一供给。" : "Connect a provider and register a model to begin."} action={zh ? "开始接入" : "Get started"} onAction={() => open("provider")} />}</div><div className="panel"><header><div><h3>{zh ? "最近调用" : "Recent invocations"}</h3><p>{zh ? "真实网关请求与成本" : "Live gateway traffic and cost"}</p></div><button className="link" onClick={() => setView("usage")}>{zh ? "查看全部" : "View all"}</button></header>{invocations.length ? invocations.slice(0, 6).map(item => <div className="call-row" key={item.id}><span className={item.status === "success" ? "success-dot" : "error-dot"} /><div><strong>{modelName(item.model_id)}</strong><small>{item.request_id}</small></div><span>{item.latency_ms} ms</span><b>${item.cost_usd.toFixed(5)}</b></div>) : <div className="quiet-empty"><BarChartOutlined /><span><strong>{zh ? "尚无调用流量" : "No traffic yet"}</strong><small>{zh ? "创建路由后可在调用测试中验证" : "Create a route, then verify it in Playground"}</small></span></div>}</div></section>
  </div>;
}
function Toolbar({ search, setSearch, placeholder, action, onAction, disabled, hideAction }: { search: string; setSearch: (s: string) => void; placeholder: string; action: string; onAction: () => void; disabled?: boolean; hideAction?: boolean }) {
  return <div className="toolbar"><label><SearchOutlined /><input value={search} onChange={e => setSearch(e.target.value)} placeholder={placeholder} /></label>{!hideAction && <button className="button primary" disabled={disabled} onClick={onAction}><PlusOutlined /> {action}</button>}</div>;
}
function Metric({ label, value, note }: { label: string; value: string | number; note?: string }) { return <article className="metric"><small>{label}</small><strong>{value}</strong>{note && <span>{note}</span>}</article>; }
function Status({ active, text }: { active: boolean; text: string }) { return <span className={`status ${active ? "active" : "inactive"}`}><i />{text}</span>; }
function Empty({ title, text, action, onAction }: { title: string; text: string; action: string; onAction: () => void }) { return <div className="empty"><span><SettingOutlined /></span><strong>{title}</strong><p>{text}</p><button className="button primary" onClick={onAction}><PlusOutlined /> {action}</button></div>; }
