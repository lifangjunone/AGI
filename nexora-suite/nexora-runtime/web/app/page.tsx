"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, ConfigProvider, Empty, Form, Input, Modal, Select, Skeleton, Tag } from "antd";
import { AppstoreOutlined, ArrowLeftOutlined, CloudServerOutlined, HistoryOutlined, HomeOutlined, LogoutOutlined, PlusOutlined, ReloadOutlined, SafetyOutlined, ThunderboltOutlined } from "@ant-design/icons";

type View = "profiles" | "packages" | "deployments" | "tasks" | "security";
type Profile = { id: string; name: string; adapter_id: string; endpoint: string; permission_profile: string; deployment_mode: string; status: string; package_id?: string; current_version?: string; deployment_status?: string };
type Package = { id: string; display_name: string; description: string; capabilities: string[]; protocol: string };
type Event = { type: string; data: unknown; occurred_at: string };
type Task = { id: string; agent_id: string; profile_id: string; input: string; status: string; trace_id: string; latency_ms?: number; error?: string; events?: Event[] };
type Deployment = { id: string; profile_id: string; version: string; status: string; stage: string; message?: string };
type Version = { version: string; channel: string; installed: boolean; verified: boolean };
type Adapter = { id: string; name: string; built_in: boolean };
const api = process.env.NEXT_PUBLIC_RUNTIME_API ?? "";

export default function RuntimeHome() {
  const [locale, setLocale] = useState("en-US");
  const [view, setView] = useState<View>("profiles");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [adapters, setAdapters] = useState<Adapter[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [ready, setReady] = useState(false);
  const [detail, setDetail] = useState<Task | Profile | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [catalogSource, setCatalogSource] = useState("");
  const [editor, setEditor] = useState<Profile | "new" | null>(null);
  const [form] = Form.useForm();
  const mainRef = useRef<HTMLElement>(null);
  const requestSequence = useRef(0);
  const zh = locale === "zh-CN";
  const t = (cn: string, en: string) => zh ? cn : en;
  const portal = () => `${window.location.protocol}//${window.location.hostname}:3000/`;
  const request = useCallback(async (path: string, init?: RequestInit) => {
    const response = await fetch(`${api}${path}`, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("nexora_token") ?? ""}`, ...init?.headers } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error?.message ?? `HTTP ${response.status}`);
    return body;
  }, []);
  function navigate(next: View, id = "") {
    setView(next); setDetail(null); setVersions([]);
    const params = new URLSearchParams({ view: next, locale });
    if (id) params.set("id", id);
    window.history.pushState({}, "", `?${params}`);
    if (id) void openDetail(next, id);
    mainRef.current?.focus();
  }
  async function openDetail(next: View, id: string) {
    setLoading(true); setError("");
    try {
      const item = await request(next === "tasks" ? `/api/v1/tasks/${encodeURIComponent(id)}` : `/api/v1/runtime-profiles/${encodeURIComponent(id)}`);
      setDetail(item);
      if (next === "profiles" && item.package_id) {
        const catalog = await request(`/api/v1/runtime-packages/${encodeURIComponent(item.package_id)}/versions`);
        setVersions(catalog.items ?? []); setCatalogSource(catalog.source);
      }
    } catch (e) { setError(String(e instanceof Error ? e.message : e)); }
    finally { setLoading(false); }
  }
  const load = useCallback(async () => {
    const sequence = ++requestSequence.current;
    setLoading(true); setError("");
    try {
      const paths: Record<View, string> = { profiles: `/api/v1/runtime-profiles?q=${encodeURIComponent(query)}`, packages: "/api/v1/runtime-packages", tasks: "/api/v1/tasks?limit=100", deployments: "/api/v1/deployments", security: "/api/v1/tasks?limit=1" };
      const data = await request(paths[view]);
      if (sequence !== requestSequence.current) return;
      if (view === "profiles") setProfiles(data.items ?? []);
      if (view === "packages") setPackages(data.items ?? []);
      if (view === "tasks") setTasks(data.items ?? []);
      if (view === "deployments") setDeployments(data.items ?? []);
    } catch (e) { if (sequence === requestSequence.current) setError(e instanceof Error ? e.message : String(e)); }
    finally { if (sequence === requestSequence.current) setLoading(false); }
  }, [view, query, request]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("logout") === "1") { localStorage.removeItem("nexora_token"); window.location.replace(`${portal()}?logout=1`); return; }
    const token = params.get("token");
    if (token) { localStorage.setItem("nexora_token", token); params.delete("token"); window.history.replaceState({}, "", `?${params}`); }
    if (!localStorage.getItem("nexora_token")) { window.location.replace(`${portal()}?reason=login_required`); return; }
    const restore = () => {
      const p = new URLSearchParams(window.location.search);
      const next = p.get("view") as View;
      const safe = ["profiles", "packages", "deployments", "tasks", "security"].includes(next) ? next : "profiles";
      setView(safe); setDetail(null);
      if (p.get("id") && (safe === "tasks" || safe === "profiles")) void openDetail(safe, p.get("id")!);
    };
    setLocale(params.get("locale") ?? localStorage.getItem("nexora_locale") ?? "en-US");
    restore(); setReady(true);
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
    // Initial authentication and history binding intentionally run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (!ready || detail) return; const timer = setTimeout(() => void load(), 250); return () => clearTimeout(timer); }, [ready, detail, load]);
  useEffect(() => {
    if (!editor) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) setEditor(null);
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [editor, busy]);
  async function edit(item: Profile | "new") {
    setEditor(item); setError("");
    try {
      const data = await request("/api/v1/adapters"); setAdapters(data.items ?? []);
      form.setFieldsValue(item === "new" ? { name: "", adapter_id: "custom", endpoint: "", permission_profile: "tools_only", deployment_mode: "private_server" } : item);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }
  async function save(values: Record<string, string>) {
    setBusy(true); setError("");
    try {
      const path = editor === "new" ? "/api/v1/runtime-profiles" : `/api/v1/runtime-profiles/${(editor as Profile).id}`;
      await request(path, { method: editor === "new" ? "POST" : "PATCH", body: JSON.stringify(values) });
      setEditor(null); setSuccess(t("配置已保存，请执行连接测试。", "Configuration saved. Run a connection test."));
      setDetail(null); await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  async function test(item: Profile) {
    setBusy(true); setError(""); setSuccess("");
    try { const result = await request(`/api/v1/runtime-profiles/${item.id}/test`, { method: "POST" }); setSuccess(t(`连接验证通过：${result.latency_ms}ms。这不代表全部能力已验证。`, `Connection verified in ${result.latency_ms}ms. This does not certify all capabilities.`)); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  const nav: { id: View; cn: string; en: string; icon: React.ReactNode }[] = [
    { id: "profiles", cn: "运行环境", en: "Environments", icon: <CloudServerOutlined /> },
    { id: "packages", cn: "运行包", en: "Runtime packages", icon: <AppstoreOutlined /> },
    { id: "deployments", cn: "部署记录", en: "Deployments", icon: <HistoryOutlined /> },
    { id: "tasks", cn: "任务运行", en: "Task runs", icon: <ThunderboltOutlined /> },
    { id: "security", cn: "审批与安全", en: "Approvals & security", icon: <SafetyOutlined /> },
  ];
  const title = nav.find(item => item.id === view)!;
  return <ConfigProvider theme={{ token: { colorPrimary: "#2563eb", borderRadius: 8, fontSize: 14, controlHeight: 40, fontFamily: 'Inter, "PingFang SC", system-ui, sans-serif' } }}>
    <div className="runtime-app">
      <aside className="side"><a className="brand" href={ready ? portal() : "#"}><span>R</span><div><strong>Nexora Runtime</strong><small>{t("企业智能体执行平台", "Enterprise agent execution")}</small></div></a>
        <nav aria-label={t("产品导航", "Product navigation")}>{nav.map(item => <button key={item.id} aria-current={view === item.id ? "page" : undefined} className={view === item.id ? "active" : ""} onClick={() => navigate(item.id)}>{item.icon}{t(item.cn, item.en)}</button>)}</nav>
        <div className="side-bottom"><a href={ready ? portal() : "#"}><HomeOutlined />{t("统一门户", "Core portal")}</a><Button type="text" icon={<LogoutOutlined />} onClick={() => { localStorage.removeItem("nexora_token"); window.location.replace(`${portal()}?logout=1`); }}>{t("退出登录", "Sign out")}</Button></div>
      </aside>
      <main ref={mainRef} tabIndex={-1}>
        <header className="top"><div><small>NEXORA / RUNTIME</small><h1>{t(title.cn, title.en)}</h1></div><div><Button onClick={() => { const next = zh ? "en-US" : "zh-CN"; setLocale(next); localStorage.setItem("nexora_locale", next); }}>{zh ? "English" : "简体中文"}</Button><Button icon={<ReloadOutlined />} loading={loading} onClick={() => detail ? void openDetail(view, detail.id) : void load()}>{t("刷新", "Refresh")}</Button>{view === "profiles" && !detail && <Button type="primary" icon={<PlusOutlined />} onClick={() => void edit("new")}>{t("接入运行环境", "Connect runtime")}</Button>}</div></header>
        <section className="content">
          {error && <Alert type="error" showIcon message={error} closable onClose={() => setError("")} />}
          {success && <Alert type="success" showIcon message={success} closable onClose={() => setSuccess("")} />}
          {detail && <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(view)}>{t("返回列表", "Back to list")}</Button>}
          {loading ? <Skeleton active paragraph={{ rows: 6 }} /> : detail ? (
            view === "tasks" ? <article className="detail"><h2>{detail.id}</h2><Tag>{detail.status}</Tag><p>{(detail as Task).input}</p>{(detail as Task).error && <Alert type="error" message={(detail as Task).error} />}{detail.status === "running" && <Button danger loading={busy} onClick={async () => { setBusy(true); try { await request(`/api/v1/tasks/${detail.id}/cancel`, { method: "POST" }); await openDetail("tasks", detail.id); } catch (e) { setError(String(e)); } finally { setBusy(false); } }}>{t("取消任务", "Cancel task")}</Button>}<h3>{t("真实执行事件", "Recorded execution events")}</h3>{(detail as Task).events?.length ? (detail as Task).events!.map((event, index) => <details key={index} className="event"><summary><Tag>{event.type}</Tag><time>{new Date(event.occurred_at).toLocaleString(locale)}</time></summary><pre>{JSON.stringify(event.data, null, 2)}</pre></details>) : <Empty description={t("没有已记录事件；旧任务没有历史轨迹。", "No recorded events. Legacy runs have no event history.")} />}</article>
              : <article className="detail"><h2>{(detail as Profile).name}</h2><Tag>{detail.status}</Tag><dl><dt>{t("端点", "Endpoint")}</dt><dd>{(detail as Profile).endpoint}</dd><dt>{t("记录版本", "Recorded version")}</dt><dd>{(detail as Profile).current_version ?? "—"}</dd><dt>{t("权限档位", "Permission profile")}</dt><dd>{(detail as Profile).permission_profile}</dd></dl><div className="actions"><Button loading={busy} onClick={() => void test(detail as Profile)}>{t("连接测试", "Test connection")}</Button><Button onClick={() => void edit(detail as Profile)}>{t("编辑配置", "Edit configuration")}</Button></div>{versions.length > 0 && <><h3>{t("引擎版本", "Engine versions")}</h3><Alert type="warning" showIcon message={t("隔离镜像部署尚未配置，升级已禁用。历史版本目录不等于通过兼容验证。", "Isolated image deployment is not configured; upgrades are disabled. A catalog entry is not a compatibility certification.")} /><p className="muted">{catalogSource === "bundled_catalog" ? t("当前为随产品提供的目录，无法确认上游最新版本。", "Bundled catalog: upstream latest version cannot be confirmed.") : t("来源：上游目录", "Source: upstream catalog")}</p>{versions.map(version => <div className="version-row" key={version.version}><strong>v{version.version}</strong><Tag>{version.channel}</Tag><Tag>{version.installed ? t("制品存在", "Artifact present") : t("未安装", "Not installed")}</Tag><Tag color={version.verified ? "green" : "default"}>{version.verified ? t("已验证", "Verified") : t("待验证", "Unverified")}</Tag></div>)}</>}</article>
          ) : <>
            {view === "profiles" && <><div className="intro"><h2>{t("管理执行环境，而不是静态能力标签", "Operate execution environments")}</h2><p>{t("接入端点、验证连接，再从 Studio 运行 AgentLoop。", "Connect an endpoint, verify its connection, then run AgentLoop from Studio.")}</p></div><Input.Search aria-label={t("搜索运行环境", "Search environments")} placeholder={t("搜索名称或类型", "Search name or type")} value={query} onChange={event => setQuery(event.target.value)} allowClear />{profiles.length ? <div className="profile-grid">{profiles.map(item => <article className="profile" key={item.id}><header><CloudServerOutlined /><div><h3>{item.name}</h3><small>{item.package_id ?? item.adapter_id}</small></div><Tag>{item.status}</Tag></header><dl><dt>{t("记录版本", "Recorded version")}</dt><dd>{item.current_version ?? "—"}</dd><dt>{t("部署模式", "Deployment mode")}</dt><dd>{item.deployment_mode}</dd></dl><p>{item.endpoint}</p><footer><Button type="primary" ghost onClick={() => navigate("profiles", item.id)}>{t("查看环境", "Open environment")}</Button><Button loading={busy} onClick={() => void test(item)}>{t("连接测试", "Test connection")}</Button></footer></article>)}</div> : <Empty description={t("没有匹配的运行环境", "No matching environments")} />}</>}
            {view === "packages" && <><Alert type="info" showIcon message={t("目录中的能力是声明，不是验证结果。厂商私有协议需要对应 Bridge。", "Capabilities are declarations, not certifications. Vendor-private protocols require a bridge.")} /><div className="profile-grid">{packages.map(item => <article className="profile" key={item.id}><h3>{item.display_name}</h3><p>{item.description}</p><Tag>{item.protocol}</Tag><div className="chips">{item.capabilities.map(cap => <Tag key={cap}>{cap}</Tag>)}</div></article>)}</div></>}
            {view === "tasks" && (tasks.length ? <div className="records">{tasks.map(item => <article key={item.id}><div><Button type="link" onClick={() => navigate("tasks", item.id)}>{item.id}</Button><p>{item.input}</p><small>{item.profile_id}</small></div><Tag>{item.status}</Tag><span>{item.latency_ms == null ? "—" : `${item.latency_ms} ms`}</span></article>)}</div> : <Empty description={t("暂无任务，在 Studio 中运行 AgentLoop 后查看执行记录。", "No runs yet. Start an AgentLoop in Studio to inspect its execution.")} />)}
            {view === "deployments" && <><Alert type="warning" showIcon message={t("此页展示旧部署记录；容器与 Kubernetes 部署驱动尚未交付。", "Legacy deployment records. Container and Kubernetes deployment drivers are not yet delivered.")} />{deployments.length ? <div className="records">{deployments.map(item => <article key={item.id}><div><strong>{item.profile_id} · v{item.version}</strong><p>{item.message}</p></div><Tag>{item.status}</Tag><span>{item.stage}</span></article>)}</div> : <Empty description={t("暂无部署记录", "No deployment records")} />}</>}
            {view === "security" && <article className="detail"><h2>{t("安全能力交付状态", "Security delivery status")}</h2><Alert type="warning" showIcon message={t("逐次审批和容器隔离尚未闭环。写入、Shell 和设备控制请求已在控制面拒绝。", "Per-action approvals and container isolation are not complete. Write, shell, and device-control requests are rejected by the control plane.")} /><p>{t("仅保留现有只读执行能力。请勿将开发环境视为生产安全边界。", "Only existing read-only execution is retained. Do not treat this development deployment as a production security boundary.")}</p><p>{t("待交付：审批队列、审计关联、连接器身份、服务端细粒度授权。", "Pending: approval queue, linked audits, connector identity, fine-grained authorization.")}</p></article>}
          </>}
        </section>
      </main>
      <Modal open={!!editor} title={editor === "new" ? t("接入外部 Runtime", "Connect external runtime") : t("编辑运行环境", "Edit environment")} onCancel={() => setEditor(null)} footer={null} destroyOnHidden>
        {error && <Alert type="error" showIcon message={error} />}
        <Form form={form} layout="vertical" onFinish={save}><Form.Item name="name" label={t("名称", "Name")} rules={[{ required: true }]}><Input autoFocus /></Form.Item><Form.Item name="adapter_id" label={t("协议适配器", "Protocol adapter")} rules={[{ required: true }]}><Select disabled={editor !== "new"} options={adapters.filter(a => editor !== "new" || !a.built_in).map(a => ({ label: a.name, value: a.id }))} /></Form.Item><Form.Item name="endpoint" label={t("执行端点", "Execution endpoint")} rules={[{ required: true }, { type: "url" }]} help={t("必须实现健康检查和 Nexora 流式任务协议；不是模型 Base URL。", "Must implement health and Nexora streaming task protocol, not a model Base URL.")}><Input disabled={editor !== "new" && (editor as Profile)?.id === "nexora-native"} /></Form.Item><Form.Item name="permission_profile" label={t("权限档位", "Permissions")} rules={[{ required: true }]}><Select options={[{ value: "tools_only", label: t("只读工具", "Read-only tools") }, { value: "workspace_read", label: t("工作区只读", "Workspace read-only") }]} /></Form.Item><Form.Item name="deployment_mode" hidden><Input /></Form.Item><div className="actions"><Button onClick={() => setEditor(null)}>{t("取消", "Cancel")}</Button><Button htmlType="submit" type="primary" loading={busy}>{t("保存", "Save")}</Button></div></Form>
      </Modal>
    </div>
  </ConfigProvider>;
}
