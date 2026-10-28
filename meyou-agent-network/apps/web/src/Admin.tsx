import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity, ArrowRight, Bot, Check, ChevronRight, CircleAlert, Clock, Eye, EyeOff,
  Gauge, KeyRound, ListChecks, Power, RefreshCw, Save, Server, ShieldCheck,
  SlidersHorizontal, Sparkles, UserRound
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

interface AdminSession {
  admin: { email: string; source?: "platform" | "local" } | null;
  configured: boolean;
  provider?: string;
  localFallbackEnabled?: boolean;
}

interface ModelConfiguration {
  provider: "ark" | "openai-compatible" | "custom";
  baseUrl: string;
  modelId: string;
  apiKeyMasked: string;
  hasApiKey: boolean;
  thinkingEnabled: boolean;
  timeoutMs: number;
  temperature: number;
  enabled: boolean;
  source: "database" | "environment";
  updatedBy: string;
  updatedAt: string | null;
}

interface AdminUsageResponse {
  summary: Array<{ metric: string; total: number; events: number; lastAt: string | null }>;
  daily: Array<{ day: string; total: number }>;
  recent: Array<{
    id: string;
    ownerId: string;
    ownerName: string | null;
    ownerHandle: string | null;
    metric: string;
    amount: number;
    idempotencyKey: string;
    createdAt: string;
  }>;
}

interface AdminAuditResponse {
  summary: Array<{ action: string; total: number; lastAt: string | null }>;
  events: Array<{
    id: string;
    ownerId: string | null;
    ownerName: string | null;
    ownerHandle: string | null;
    organizationId: string | null;
    organizationName: string | null;
    action: string;
    summary: string;
    policyRefs: string[];
    toolCalls: string[];
    confidence: number | null;
    escalationReason: string | null;
    createdAt: string;
  }>;
}

type AdminSection = "model" | "usage" | "audit";

async function adminApi<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body !== undefined && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const response = await fetch(path, {
    credentials: "include",
    ...init,
    headers
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const messages: Record<string, string> = {
      invalid_admin_credentials: "管理员邮箱或密码不正确",
      admin_not_configured: "服务器尚未配置管理员账号",
      admin_authentication_required: "平台管理员会话已失效，请回到底座管理后台登录",
      platform_admin_required: "请先登录 LifeYouMe 平台管理后台，再进入 MeYou 控制台",
      invalid_model_configuration: "请检查模型地址、Model ID 和参数范围",
      api_key_required: "首次保存或测试时必须填写 API Key",
      model_provider_error: "模型服务返回异常",
      model_timeout: "模型连接超时，请检查地址或适当增加超时时间",
      model_connection_failed: "无法连接模型服务，请检查 Endpoint、网络和密钥",
      invalid_model_status: "模型开关状态无效",
      model_configuration_required: "请先保存模型连接配置，再开启服务",
      secret_reveal_origin_denied: "请从 MeYou 管理页面发起查看操作",
      secret_reveal_confirmation_required: "请先确认查看敏感密钥",
      api_key_not_configured: "当前没有已保存的密钥"
    };
    const code = String(body.error ?? "");
    const providerStatus = code.startsWith("model_provider_error:") ? code.split(":")[1] : "";
    throw new Error(providerStatus
      ? `模型服务返回 HTTP ${providerStatus}，请检查密钥、Model ID 和权限`
      : messages[code] ?? "请求未完成，请稍后重试");
  }
  return body as T;
}

function AdminMark() {
  return <Link to="/admin" className="admin-brand" aria-label="MeYou 管理控制台">
    <span><i /><i /><i /></span>
    <b>MeYou<small>CONTROL ROOM</small></b>
  </Link>;
}

export function AdminLogin() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("admin@lifeyoume.local");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const session = useQuery({
    queryKey: ["admin-session"],
    queryFn: () => adminApi<AdminSession>("/api/v1/admin/session"),
    retry: false
  });

  async function login(event: React.FormEvent) {
    event.preventDefault();
    setLoginError("");
    setLoggingIn(true);
    try {
      await adminApi("/api/v1/admin/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      await queryClient.invalidateQueries({ queryKey: ["admin-session"] });
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "登录未完成");
    } finally {
      setLoggingIn(false);
    }
  }

  return <main className="admin-login-page">
    <section className="admin-login-story">
      <AdminMark />
      <div>
        <span className="admin-kicker"><ShieldCheck /> LIFEYOUME PLATFORM ACCESS</span>
        <h1>MeYou 管理端<br />接入<span>统一底座。</span></h1>
        <p>管理员身份由 LifeYouMe 底座统一校验；MeYou 只接收受信任管理声明，用于模型配置、密钥保存和审计记录。</p>
      </div>
      <footer><span><ShieldCheck /> 平台管理员</span><span><KeyRound /> 密钥不回显</span><span><Activity /> 真实连接测试</span></footer>
    </section>
    <section className="admin-login-panel">
      {session.data?.localFallbackEnabled && !session.data.admin ? <form onSubmit={login}>
        <header><span>LOCAL DEVELOPMENT</span><h2>本地管理员登录</h2><p>仅在开发环境启用，用于配置和测试模型；线上仍由 LifeYouMe 统一鉴权。</p></header>
        <label>管理员邮箱<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required /></label>
        <label>管理员密码<span className="admin-password-input">
          <input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password" required />
          <button type="button" aria-label={showPassword ? "隐藏密码" : "显示密码"} onClick={() => setShowPassword((value) => !value)}>
            {showPassword ? <EyeOff /> : <Eye />}
          </button>
        </span></label>
        {loginError && <div className="admin-form-error"><CircleAlert />{loginError}</div>}
        <button className="admin-primary" type="submit" disabled={loggingIn || !email.trim() || !password}>
          {loggingIn ? <RefreshCw className="spin" /> : <ShieldCheck />}{loggingIn ? "正在登录…" : "进入本地控制台"}
        </button>
        <small className="admin-login-note"><ShieldCheck /> 本地账号只存在于当前开发进程。</small>
      </form> : <div className="admin-platform-card">
        <header><span>UNIFIED ADMIN</span><h2>从 LifeYouMe 管理后台进入</h2><p>MeYou 不再维护独立管理员账号和密码。</p></header>
        {session.isLoading ? <div className="admin-alert success"><RefreshCw className="spin" /><span>正在检查平台管理员会话…</span></div>
          : session.data?.admin ? <div className="admin-alert success"><Check /><span><b>已识别平台管理员</b><small>{session.data.admin.email}</small></span></div>
            : <div className="admin-alert danger"><CircleAlert /><span><b>尚未检测到平台管理员会话</b><small>请先在 LifeYouMe 底座管理后台完成登录，再打开 MeYou 控制台。</small></span></div>}
        <a className="admin-primary" href="/admin">
          已登录，进入 MeYou 控制台 <ArrowRight />
        </a>
        <a className="admin-secondary" href="https://lifeyoume.icu/admin/">
          打开 LifeYouMe 管理后台 <ArrowRight />
        </a>
        <small className="admin-login-note"><ShieldCheck /> 管理员会话、退出和权限统一由 LifeYouMe 底座管理。</small>
      </div>}
    </section>
  </main>;
}

function formatAdminDate(value: string | null) {
  return value ? new Date(value).toLocaleString("zh-CN") : "-";
}

function metricLabel(metric: string) {
  const labels: Record<string, string> = {
    agent_reply: "Agent 自动回复",
    plaza_reply: "广场公开回复",
    mission_run: "持续搜索任务",
    customer_thread: "客户会话"
  };
  return labels[metric] ?? metric;
}

function actorName(item: { ownerName?: string | null; ownerHandle?: string | null; organizationName?: string | null }) {
  return item.ownerName || item.organizationName || (item.ownerHandle ? `@${item.ownerHandle}` : "系统 / 管理端");
}

function AdminEmptyState({ icon, title, copy }: { icon: React.ReactNode; title: string; copy: string }) {
  return <div className="admin-empty-panel">{icon}<b>{title}</b><span>{copy}</span></div>;
}

export function AdminConsole() {
  const queryClient = useQueryClient();
  const session = useQuery({
    queryKey: ["admin-session"],
    queryFn: () => adminApi<AdminSession>("/api/v1/admin/session"),
    retry: false
  });
  const configuration = useQuery({
    queryKey: ["admin-model-config"],
    queryFn: () => adminApi<{ configuration: ModelConfiguration }>("/api/v1/admin/model-config"),
    enabled: Boolean(session.data?.admin),
    retry: false
  });
  const [form, setForm] = useState({
    provider: "ark" as ModelConfiguration["provider"],
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    modelId: "",
    apiKey: "",
    thinkingEnabled: true,
    timeoutMs: 1_800_000,
    temperature: 0.35,
    enabled: true
  });
  const [section, setSection] = useState<AdminSection>("model");
  const [showKey, setShowKey] = useState(false);
  const [revealConfirm, setRevealConfirm] = useState(false);
  const [revealedKey, setRevealedKey] = useState("");
  const [revealing, setRevealing] = useState(false);
  const [revealError, setRevealError] = useState("");
  const revealVersion = useRef(0);
  function clearRevealedKey() {
    revealVersion.current += 1;
    setRevealedKey("");
    setRevealConfirm(false);
    setRevealing(false);
  }
  useEffect(() => {
    clearRevealedKey();
  }, [section, configuration.data]);
  useEffect(() => {
    if (!revealedKey) return;
    const timer = setTimeout(clearRevealedKey, 30_000);
    return () => clearTimeout(timer);
  }, [revealedKey]);
  useEffect(() => {
    const hide = () => { if (document.hidden) clearRevealedKey(); };
    const blur = () => clearRevealedKey();
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("blur", blur);
    window.addEventListener("pagehide", blur);
    return () => {
      revealVersion.current += 1;
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("blur", blur);
      window.removeEventListener("pagehide", blur);
    };
  }, []);
  async function revealSavedKey() {
    if (revealing) return;
    const version = ++revealVersion.current;
    setRevealing(true); setRevealError("");
    try {
      const result = await adminApi<{ apiKey: string }>("/api/v1/admin/model-config/reveal-key", {
        method: "POST",
        body: JSON.stringify({ confirmation: "reveal-saved-model-key" }),
        cache: "no-store"
      });
      if (version === revealVersion.current && !document.hidden) {
        setRevealedKey(result.apiKey);
        setRevealConfirm(false);
      }
    } catch (error) {
      if (version === revealVersion.current) setRevealError(error instanceof Error ? error.message : "查看失败");
    } finally {
      if (version === revealVersion.current) setRevealing(false);
    }
  }
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [disableConfirmOpen, setDisableConfirmOpen] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [testResult, setTestResult] = useState<{ latencyMs: number; responsePreview: string } | null>(null);
  const configurationReady = Boolean(configuration.data?.configuration);
  const usage = useQuery({
    queryKey: ["admin-usage"],
    queryFn: () => adminApi<AdminUsageResponse>("/api/v1/admin/usage"),
    enabled: Boolean(session.data?.admin) && section === "usage",
    retry: false
  });
  const audit = useQuery({
    queryKey: ["admin-audit"],
    queryFn: () => adminApi<AdminAuditResponse>("/api/v1/admin/audit"),
    enabled: Boolean(session.data?.admin) && section === "audit",
    retry: false
  });

  useEffect(() => {
    const value = configuration.data?.configuration;
    if (!value) return;
    setForm((current) => ({
      ...current,
      provider: value.provider,
      baseUrl: value.baseUrl,
      modelId: value.modelId,
      apiKey: "",
      thinkingEnabled: value.thinkingEnabled,
      timeoutMs: value.timeoutMs,
      temperature: value.temperature,
      enabled: value.enabled
    }));
  }, [configuration.data]);

  if (session.isLoading) return <div className="admin-loading"><Sparkles />正在验证管理权限…</div>;
  if (!session.data?.admin) return <AdminLogin />;

  const current = configuration.data?.configuration;
  const payload = () => ({
    ...form,
    timeoutMs: Number(form.timeoutMs),
    temperature: Number(form.temperature)
  });

  async function save() {
    setSaving(true);
    setNotice(null);
    try {
      await adminApi("/api/v1/admin/model-config", {
        method: "PUT",
        body: JSON.stringify(payload())
      });
      setForm((value) => ({ ...value, apiKey: "" }));
      setNotice({ type: "success", text: "模型配置已加密保存，并立即对新任务生效。" });
      await queryClient.invalidateQueries({ queryKey: ["admin-model-config"] });
    } catch (caught) {
      setNotice({ type: "error", text: caught instanceof Error ? caught.message : "保存失败" });
    } finally {
      setSaving(false);
    }
  }

  async function testConnection() {
    setTesting(true);
    setNotice(null);
    setTestResult(null);
    try {
      const result = await adminApi<{ ok: boolean; latencyMs: number; responsePreview: string }>(
        "/api/v1/admin/model-config/test",
        { method: "POST", body: JSON.stringify(payload()) }
      );
      setTestResult(result);
      setNotice({ type: "success", text: "连接成功，模型已返回有效响应。" });
    } catch (caught) {
      setNotice({ type: "error", text: caught instanceof Error ? caught.message : "连接测试失败" });
    } finally {
      setTesting(false);
    }
  }

  async function updateModelStatus(enabled: boolean) {
    setStatusUpdating(true);
    setNotice(null);
    try {
      await adminApi("/api/v1/admin/model-config/status", {
        method: "PATCH",
        body: JSON.stringify({ enabled })
      });
      setForm((value) => ({ ...value, enabled }));
      setDisableConfirmOpen(false);
      setNotice({
        type: "success",
        text: enabled
          ? "模型服务已开启，新模型任务可以开始调用。"
          : "模型服务已关闭，后续新模型任务将停止调用。"
      });
      await configuration.refetch();
      await queryClient.invalidateQueries({ queryKey: ["admin-audit"] });
    } catch (caught) {
      setNotice({ type: "error", text: caught instanceof Error ? caught.message : "模型开关更新失败" });
    } finally {
      setStatusUpdating(false);
    }
  }

  function returnToPlatform() {
    queryClient.setQueryData<AdminSession>(["admin-session"], {
      admin: null,
      configured: session.data?.configured ?? true,
      provider: "lifeyoume-platform"
    });
    queryClient.removeQueries({ queryKey: ["admin-model-config"] });
    window.location.href = "https://lifeyoume.icu/admin/";
  }

  return <div className="admin-shell">
    <aside className="admin-sidebar">
      <AdminMark />
      <nav>
        <span>CONTROL</span>
        <button className={section === "model" ? "active" : ""} onClick={() => setSection("model")}><Bot />模型配置<ChevronRight /></button>
        <button className={section === "usage" ? "active" : ""} onClick={() => setSection("usage")}><Gauge />调用与配额<ChevronRight /></button>
        <button className={section === "audit" ? "active" : ""} onClick={() => setSection("audit")}><ShieldCheck />安全审计<ChevronRight /></button>
      </nav>
      <div className="admin-account">
        <span>{session.data.admin.email.slice(0, 1).toUpperCase()}</span>
        <div><b>LifeYouMe 平台管理员</b><small>{session.data.admin.email}</small></div>
        <button onClick={returnToPlatform} aria-label="返回 LifeYouMe 平台管理后台"><ArrowRight /></button>
      </div>
    </aside>
    <main className="admin-main">
      <header className="admin-topbar">
        <div><span>{section === "model" ? "MODEL INFRASTRUCTURE" : section === "usage" ? "USAGE & QUOTA" : "SECURITY AUDIT"}</span><h1>{section === "model" ? "模型控制台" : section === "usage" ? "调用与配额" : "安全审计"}</h1></div>
        {section === "model" && <div className={`admin-model-power ${current?.enabled ? "on" : "off"}`}>
          <div><i /><span><b>{current?.enabled ? "模型服务运行中" : "模型服务已关闭"}</b><small>{current?.enabled ? "新任务允许调用" : "新任务不会调用模型"}</small></span></div>
          <button type="button" role="switch" aria-checked={Boolean(current?.enabled)}
            aria-label={current?.enabled ? "关闭模型服务" : "开启模型服务"}
            disabled={!configurationReady || statusUpdating}
            onClick={() => current?.enabled ? setDisableConfirmOpen(true) : void updateModelStatus(true)}>
            <span /><em>{statusUpdating ? "更新中" : current?.enabled ? "关闭" : "开启"}</em>
          </button>
        </div>}
      </header>
      <div className="admin-content">
        <section className="admin-status-strip">
          <div><span className="admin-status-icon"><Server /></span><p><small>当前来源</small><b>{current?.source === "database" ? "管理端配置" : "服务器环境变量"}</b></p></div>
          <div><span className="admin-status-icon"><Bot /></span><p><small>当前模型</small><b>{current?.modelId || "尚未配置"}</b></p></div>
          <div><span className="admin-status-icon"><KeyRound /></span><p><small>API Key</small><b>{current?.apiKeyMasked || "尚未配置"}</b>
            {section === "model" && current?.hasApiKey && <button className="admin-secret-trigger" type="button" onClick={() => { setRevealError(""); setRevealConfirm(true); }}>查看已保存密钥</button>}
          </p></div>
          <div><span className="admin-status-icon"><Activity /></span><p><small>最近更新</small><b>{current?.updatedAt ? new Date(current.updatedAt).toLocaleString("zh-CN") : "跟随环境配置"}</b></p></div>
        </section>
        {section === "model" && revealedKey && <section className="admin-secret-panel" aria-label="已保存的模型密钥">
          <header><b>已保存的 API Key</b><button className="admin-secondary" type="button" onClick={clearRevealedKey}><EyeOff />立即隐藏</button></header>
          <code>{revealedKey}</code><p>30 秒后自动隐藏，切换窗口或离开页面也会清除。请勿截图或分享。</p>
        </section>}
        {section === "model" && revealConfirm && <section className="admin-secret-panel" aria-label="确认查看模型密钥">
          <b>确认查看完整密钥？</b><p>此操作将重新校验你的管理员会话并记录审计。完整密钥可访问模型服务，请确认周围没有旁观者。</p>
          {revealError && <p role="alert">{revealError}</p>}
          <div><button className="admin-secondary" type="button" onClick={clearRevealedKey}>取消</button><button className="admin-primary" type="button" disabled={revealing} onClick={() => void revealSavedKey()}>{revealing ? "正在验证…" : "确认查看，30 秒后隐藏"}</button></div>
        </section>}

        {section === "model" && <section className="admin-workspace">
          <div className="admin-config-card">
            <header><span><SlidersHorizontal /></span><div><h2>模型连接配置</h2><p>配置会加密保存在服务端，新模型任务会立即读取最新生效项。</p></div></header>
            <div className="admin-form-grid">
              <label>供应商
                <select value={form.provider} onChange={(event) => setForm({ ...form, provider: event.target.value as ModelConfiguration["provider"] })}>
                  <option value="ark">火山方舟 Ark</option>
                  <option value="openai-compatible">OpenAI Compatible</option>
                  <option value="custom">自定义兼容端点</option>
                </select>
              </label>
              <label>Model ID
                <input value={form.modelId} onChange={(event) => setForm({ ...form, modelId: event.target.value })}
                  placeholder="deepseek-v4-flash-ga-260731" />
              </label>
              <label className="wide">API Endpoint
                <input value={form.baseUrl} onChange={(event) => setForm({ ...form, baseUrl: event.target.value })}
                  placeholder="https://ark.cn-beijing.volces.com/api/v3" />
                <small>填写到 API 版本路径，系统会自动调用 `/chat/completions`。</small>
              </label>
              <label className="wide">API Key
                <span className="admin-password-input">
                  <input type={showKey ? "text" : "password"} autoComplete="off" value={form.apiKey}
                    onChange={(event) => setForm({ ...form, apiKey: event.target.value })}
                    placeholder={current?.hasApiKey ? `保持当前密钥（${current.apiKeyMasked}）` : "输入 API Key"} />
                  <button type="button" onClick={() => setShowKey((value) => !value)}
                    aria-label={showKey ? "隐藏新输入的密钥" : "显示新输入的密钥"}>{showKey ? <EyeOff /> : <Eye />}</button>
                </span>
                <small>留空表示继续使用当前密钥。密钥只会发送到 MeYou 服务端。</small>
              </label>
              <label>请求超时
                <select value={form.timeoutMs} onChange={(event) => setForm({ ...form, timeoutMs: Number(event.target.value) })}>
                  <option value={120000}>2 分钟</option>
                  <option value={600000}>10 分钟</option>
                  <option value={1800000}>30 分钟</option>
                </select>
              </label>
              <label>Temperature
                <input type="number" min={0} max={2} step={0.05} value={form.temperature}
                  onChange={(event) => setForm({ ...form, temperature: Number(event.target.value) })} />
              </label>
            </div>
            <div className="admin-switches single">
              <label><input type="checkbox" checked={form.thinkingEnabled}
                onChange={(event) => setForm({ ...form, thinkingEnabled: event.target.checked })} />
                <span><b>默认开启深度思考</b><small>任务可按自身需求显式关闭</small></span></label>
            </div>
            {notice && <div className={`admin-alert ${notice.type}`}>
              {notice.type === "success" ? <Check /> : <CircleAlert />}<span>{notice.text}</span>
            </div>}
            <footer>
              <button className="admin-secondary" onClick={testConnection} disabled={!configurationReady || testing || saving}>
                {!configurationReady ? <><RefreshCw className="spin" />正在读取配置…</>
                  : testing ? <><RefreshCw className="spin" />正在测试…</> : <><Activity />测试连接</>}
              </button>
              <button className="admin-primary" onClick={save} disabled={!configurationReady || saving || testing}>
                {saving ? <><RefreshCw className="spin" />正在保存…</> : <><Save />保存并生效</>}
              </button>
            </footer>
          </div>

          <aside className="admin-side-stack">
            <section className="admin-test-card">
              <span className="admin-kicker"><Activity /> LIVE CHECK</span>
              <h3>连接健康</h3>
              {testResult ? <div className="admin-test-success">
                <span><Check /></span><b>{testResult.latencyMs} ms</b><small>模型响应正常</small>
                <p>{testResult.responsePreview || "OK"}</p>
              </div> : <div className="admin-test-empty">
                <Activity /><p>保存前也可以先验证 Endpoint、Model ID 与密钥是否可用。</p>
              </div>}
            </section>
            <section className="admin-security-card">
              <span className="admin-kicker"><ShieldCheck /> SECURITY</span>
              <h3>密钥与权限边界</h3>
              <ul>
                <li><Check />API Key 使用 AES-256-GCM 加密保存</li>
                <li><Check />默认仅显示掩码，管理员确认后可短暂查看</li>
                <li><Check />每次查看密钥记录审计，30 秒后自动隐藏</li>
                <li><Check />平台管理员身份由 LifeYouMe 底座统一校验</li>
                <li><Check />每次配置变更写入审计记录</li>
              </ul>
            </section>
          </aside>
        </section>}

        {section === "usage" && <section className="admin-data-view">
          {usage.isLoading ? <div className="admin-loading-inline"><RefreshCw className="spin" />正在读取真实调用数据…</div> : usage.data && <>
            <div className="admin-metric-grid">
              <article><Gauge /><span>总调用量</span><b>{usage.data.summary.reduce((sum, item) => sum + item.total, 0)}</b><small>来自 usage_ledger</small></article>
              <article><Activity /><span>流水条数</span><b>{usage.data.summary.reduce((sum, item) => sum + item.events, 0)}</b><small>真实幂等记录</small></article>
              <article><ListChecks /><span>指标类型</span><b>{usage.data.summary.length}</b><small>当前已产生的 metric</small></article>
              <article><Clock /><span>近 30 天</span><b>{usage.data.daily.reduce((sum, item) => sum + item.total, 0)}</b><small>按创建时间统计</small></article>
            </div>
            <section className="admin-table-card">
              <header><div><h2>指标汇总</h2><p>按真实 usage_ledger.metric 聚合，不包含演示数据。</p></div></header>
              {usage.data.summary.length ? <div className="admin-table-scroll"><table><thead><tr><th>指标</th><th>调用量</th><th>事件数</th><th>最近发生</th></tr></thead><tbody>{usage.data.summary.map((item) => <tr key={item.metric}><td><b>{metricLabel(item.metric)}</b><small>{item.metric}</small></td><td>{item.total}</td><td>{item.events}</td><td>{formatAdminDate(item.lastAt)}</td></tr>)}</tbody></table></div>
                : <AdminEmptyState icon={<Gauge />} title="还没有调用记录" copy="真实用户或 Agent 产生模型调用后，这里会自动出现用量。" />}
            </section>
            <section className="admin-table-card">
              <header><div><h2>最近调用流水</h2><p>展示最近 40 条真实额度扣减与模型调用记录。</p></div></header>
              {usage.data.recent.length ? <div className="admin-table-scroll"><table><thead><tr><th>时间</th><th>用户</th><th>指标</th><th>数量</th><th>幂等键</th></tr></thead><tbody>{usage.data.recent.map((item) => <tr key={item.id}><td>{formatAdminDate(item.createdAt)}</td><td><b>{actorName(item)}</b><small>{item.ownerHandle ? `@${item.ownerHandle}` : item.ownerId}</small></td><td>{metricLabel(item.metric)}</td><td>{item.amount}</td><td><code>{item.idempotencyKey}</code></td></tr>)}</tbody></table></div>
                : <AdminEmptyState icon={<Activity />} title="暂无流水" copy="这里不会用假数据制造热闹；真实调用发生后才会展示。" />}
            </section>
          </>}
        </section>}

        {section === "audit" && <section className="admin-data-view">
          {audit.isLoading ? <div className="admin-loading-inline"><RefreshCw className="spin" />正在读取真实审计记录…</div> : audit.data && <>
            <div className="admin-metric-grid">
              <article><ShieldCheck /><span>审计事件</span><b>{audit.data.events.length}</b><small>最近 80 条</small></article>
              <article><ListChecks /><span>动作类型</span><b>{audit.data.summary.length}</b><small>按 action 聚合</small></article>
              <article><CircleAlert /><span>升级记录</span><b>{audit.data.events.filter((item) => item.escalationReason).length}</b><small>含升级原因</small></article>
              <article><Bot /><span>工具调用</span><b>{audit.data.events.filter((item) => item.toolCalls.length).length}</b><small>模型或队列痕迹</small></article>
            </div>
            <section className="admin-table-card">
              <header><div><h2>动作汇总</h2><p>按真实 audit_events.action 聚合。</p></div></header>
              {audit.data.summary.length ? <div className="admin-table-scroll"><table><thead><tr><th>动作</th><th>次数</th><th>最近发生</th></tr></thead><tbody>{audit.data.summary.map((item) => <tr key={item.action}><td><code>{item.action}</code></td><td>{item.total}</td><td>{formatAdminDate(item.lastAt)}</td></tr>)}</tbody></table></div>
                : <AdminEmptyState icon={<ShieldCheck />} title="暂无审计事件" copy="任何 Agent 决策、管理配置和关键自动化都会写入这里。" />}
            </section>
            <section className="admin-table-card">
              <header><div><h2>审计时间线</h2><p>最近 80 条真实审计事件，包含策略、工具调用和升级原因。</p></div></header>
              {audit.data.events.length ? <div className="admin-audit-list">{audit.data.events.map((item) => <article key={item.id}>
                <div><span><Clock />{formatAdminDate(item.createdAt)}</span><code>{item.action}</code></div>
                <h3>{item.summary}</h3>
                <p><UserRound />{actorName(item)}{item.confidence !== null ? ` · 置信度 ${item.confidence}` : ""}</p>
                <div className="admin-chip-row">{item.policyRefs.map((value) => <i key={`p-${item.id}-${value}`}>{value}</i>)}{item.toolCalls.map((value) => <i key={`t-${item.id}-${value}`}>{value}</i>)}{item.escalationReason && <i className="danger">{item.escalationReason}</i>}</div>
              </article>)}</div>
                : <AdminEmptyState icon={<ShieldCheck />} title="暂无审计时间线" copy="这里不会展示 mock；真实 Agent 行为和管理操作发生后才会出现。" />}
            </section>
          </>}
        </section>}
      </div>
      {disableConfirmOpen && <div className="admin-confirm-layer" role="dialog" aria-modal="true" aria-labelledby="disable-model-title">
        <button className="admin-confirm-backdrop" aria-label="取消关闭模型服务" onClick={() => setDisableConfirmOpen(false)} />
        <section className="admin-confirm-card">
          <span className="admin-confirm-icon"><Power /></span>
          <small>GLOBAL MODEL SWITCH</small>
          <h2 id="disable-model-title">关闭模型服务？</h2>
          <p>关闭后，广场群聊、自动回复、持续搜索等所有后续新模型任务都会停止调用。已经产生的历史消息不会删除。</p>
          <div>
            <button className="admin-secondary" onClick={() => setDisableConfirmOpen(false)} disabled={statusUpdating}>取消</button>
            <button className="admin-danger" onClick={() => void updateModelStatus(false)} disabled={statusUpdating}>
              <Power />{statusUpdating ? "正在关闭…" : "确认关闭"}
            </button>
          </div>
        </section>
      </div>}
    </main>
  </div>;
}
