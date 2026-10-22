"use client";

import { useEffect, useState } from "react";
import { ApartmentOutlined, AppstoreOutlined, ArrowRightOutlined, CheckCircleFilled, CloudServerOutlined, CodeOutlined, DeleteOutlined, DeploymentUnitOutlined, EditOutlined, LogoutOutlined, PlusOutlined, RadarChartOutlined, SafetyCertificateOutlined, TeamOutlined } from "@ant-design/icons";

const copy = {
  "zh-CN": {
    eyebrow: "企业智能体基础设施",
    title: "让每一个智能体，都建立在可信的星核之上。",
    lead: "统一身份、租户、权限、密钥与审计。一个账号安全进入 Nexora 全产品，并始终保持组织边界清晰。",
    signIn: "登录 Nexora", email: "邮箱", password: "密码", button: "安全登录",
    products: "你的工作空间", studio: "Nexora Studio · 星铸", studioDesc: "设计、调试、评测并发布生产级 Agent",
    control: "Nexora Control · 星域", controlDesc: "统一注册、治理、观测所有 Agent",
    maas: "Nexora MaaS · 星模", maasDesc: "统一接入、路由、计量并观测企业模型",
    signed: "已登录。访问令牌已安全保存在当前浏览器。"
  },
  "en-US": {
    eyebrow: "Enterprise agent infrastructure",
    title: "Give every agent a trusted core.",
    lead: "Unified identity, tenancy, authorization, secrets, and audit. One secure account across Nexora with strong organizational boundaries.",
    signIn: "Sign in to Nexora", email: "Email", password: "Password", button: "Secure sign in",
    products: "Your workspace", studio: "Nexora Studio", studioDesc: "Design, debug, evaluate, and publish production agents",
    control: "Nexora Control", controlDesc: "Register, govern, and observe every agent",
    maas: "Nexora MaaS", maasDesc: "Connect, route, meter, and observe enterprise models",
    signed: "Signed in. Your access token is stored in this browser."
  }
} as const;

type Locale = keyof typeof copy;
type Organization = { id: string; name: string; description: string; member_count: number };
type Member = { id: string; name: string; email: string; organization_id: string; roles: string[]; status: string; last_active_at?: string };
type Role = { id: string; name: string; description: string; permissions: string[]; system: boolean; member_count: number };
type AuditEvent = { id: string; action: string; resource: string; occurred_at: string; metadata?: Record<string, unknown> };

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="dialog-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <section className="dialog" role="dialog" aria-modal="true" aria-label={title}>
      <header><h2>{title}</h2><button aria-label="Close" onClick={onClose}>×</button></header>
      {children}
    </section>
  </div>;
}

function OrganizationManagement({ locale, api }: { locale: Locale; api: (path: string, options?: RequestInit) => Promise<unknown> }) {
  const zh = locale === "zh-CN";
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [dialog, setDialog] = useState<"organization" | "member" | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [orgData, memberData, roleData] = await Promise.all([
        api("/api/v1/organizations"), api("/api/v1/members"), api("/api/v1/roles")
      ]) as [{ items: Organization[] }, { items: Member[] }, { items: Role[] }];
      setOrganizations(orgData.items ?? []); setMembers(memberData.items ?? []); setRoles(roleData.items ?? []);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Load failed"); } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function createOrganization(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    const values = new FormData(event.currentTarget);
    try {
      await api("/api/v1/organizations", { method: "POST", body: JSON.stringify({ name: values.get("name"), description: values.get("description") }) });
      setDialog(null); setMessage(zh ? "组织已创建并写入审计日志。" : "Organization created and audited."); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Create failed"); } finally { setBusy(false); }
  }
  async function createMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    const values = new FormData(event.currentTarget);
    try {
      await api("/api/v1/members", { method: "POST", body: JSON.stringify({ name: values.get("name"), email: values.get("email"), organization_id: values.get("organization_id"), roles: [values.get("role")] }) });
      setDialog(null); setMessage(zh ? "邀请已创建，成员状态为“待接受”。" : "Invitation created with invited status."); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Invite failed"); } finally { setBusy(false); }
  }
  async function updateMember(member: Member, patch: Partial<Member>) {
    try {
      await api(`/api/v1/members/${member.id}`, { method: "PATCH", body: JSON.stringify({ name: member.name, organization_id: member.organization_id, roles: member.roles, status: member.status, ...patch }) });
      setMessage(zh ? "成员信息已更新。" : "Member updated."); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Update failed"); }
  }
  async function removeMember(member: Member) {
    if (!window.confirm(zh ? `确定移除 ${member.name}？` : `Remove ${member.name}?`)) return;
    try { await api(`/api/v1/members/${member.id}`, { method: "DELETE" }); setMessage(zh ? "成员已移除。" : "Member removed."); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Remove failed"); }
  }

  const active = members.filter(item => item.status === "active").length;
  return <div className="management-page">
    <div className="management-heading">
      <div><small>NEXORA CORE · ORGANIZATION</small><h1>{zh ? "组织与成员" : "Organization & members"}</h1><p>{zh ? "维护企业组织边界，邀请成员并分配访问角色。" : "Maintain organization boundaries, invite members, and assign access roles."}</p></div>
      <div className="heading-actions"><button className="secondary-button" onClick={() => setDialog("organization")} disabled={loading}><ApartmentOutlined /> {zh ? "新建组织" : "New organization"}</button><button className="action-button" onClick={() => setDialog("member")} disabled={loading || !organizations.length}><PlusOutlined /> {zh ? "邀请成员" : "Invite member"}</button></div>
    </div>
    {message && <div className="operation-message">{message}<button onClick={() => setMessage("")}>×</button></div>}
    <section className="metric-row">
      <article><small>{zh ? "组织单元" : "ORGANIZATIONS"}</small><strong>{organizations.length}</strong><span>{zh ? "独立权限边界" : "Access boundaries"}</span></article>
      <article><small>{zh ? "全部成员" : "MEMBERS"}</small><strong>{members.length}</strong><span>{zh ? "含待接受邀请" : "Including invitations"}</span></article>
      <article><small>{zh ? "活跃账号" : "ACTIVE ACCOUNTS"}</small><strong>{active}</strong><span>{zh ? "可登录套件" : "Can access suite"}</span></article>
      <article><small>{zh ? "可用角色" : "ROLES"}</small><strong>{roles.length}</strong><span>RBAC</span></article>
    </section>
    <section className="management-card">
      <header><div><h2>{zh ? "组织结构" : "Organization structure"}</h2><p>{zh ? "成员必须归属于一个组织单元" : "Every member belongs to an organization unit"}</p></div></header>
      <div className="organization-grid">{organizations.map(item => <article key={item.id} className="organization-item"><span className="organization-icon"><TeamOutlined /></span><div><strong>{item.name}</strong><p>{item.description || (zh ? "暂无描述" : "No description")}</p><small>{item.member_count} {zh ? "名成员" : "members"}</small></div></article>)}</div>
    </section>
    <section className="management-card member-card">
      <header><div><h2>{zh ? "成员目录" : "Member directory"}</h2><p>{zh ? "角色或状态变更会立即生效并记录审计" : "Role and status changes take effect immediately and are audited"}</p></div></header>
      <div className="data-table-wrap"><table className="data-table"><thead><tr><th>{zh ? "成员" : "Member"}</th><th>{zh ? "组织" : "Organization"}</th><th>{zh ? "角色" : "Role"}</th><th>{zh ? "状态" : "Status"}</th><th>{zh ? "操作" : "Actions"}</th></tr></thead><tbody>
        {members.map(member => <tr key={member.id}><td><div className="member-cell"><span>{member.name.split(" ").map(word => word[0]).join("").slice(0, 2).toUpperCase()}</span><div><strong>{member.name}</strong><small>{member.email}</small></div></div></td>
          <td><select aria-label={`${member.name} organization`} value={member.organization_id} onChange={event => void updateMember(member, { organization_id: event.target.value })}>{organizations.map(org => <option key={org.id} value={org.id}>{org.name}</option>)}</select></td>
          <td><select aria-label={`${member.name} role`} value={member.roles[0] ?? ""} onChange={event => void updateMember(member, { roles: [event.target.value] })}>{roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</select></td>
          <td><button className={`status-pill ${member.status}`} onClick={() => void updateMember(member, { status: member.status === "suspended" ? "active" : "suspended" })}>{member.status === "active" ? (zh ? "已启用" : "Active") : member.status === "invited" ? (zh ? "待接受" : "Invited") : (zh ? "已停用" : "Suspended")}</button></td>
          <td><button className="table-icon danger" aria-label={`${zh ? "移除" : "Remove"} ${member.name}`} disabled={member.id === "usr_admin"} onClick={() => void removeMember(member)}><DeleteOutlined /></button></td></tr>)}
      </tbody></table></div>
    </section>
    {dialog === "organization" && <Dialog title={zh ? "新建组织" : "New organization"} onClose={() => setDialog(null)}><form className="dialog-form" onSubmit={createOrganization}>{message && <div className="dialog-error">{message}</div>}<label>{zh ? "组织名称" : "Name"}<input name="name" required placeholder={zh ? "例如：安全治理部" : "e.g. Security Governance"} /></label><label>{zh ? "组织职责" : "Description"}<textarea name="description" rows={3} placeholder={zh ? "说明该组织负责的工作" : "Describe this organization"} /></label><div className="dialog-actions"><button type="button" onClick={() => setDialog(null)}>{zh ? "取消" : "Cancel"}</button><button className="action-button" disabled={busy}>{zh ? "创建组织" : "Create"}</button></div></form></Dialog>}
    {dialog === "member" && <Dialog title={zh ? "邀请成员" : "Invite member"} onClose={() => setDialog(null)}><form className="dialog-form" onSubmit={createMember}>{message && <div className="dialog-error">{message}</div>}<div className="form-grid"><label>{zh ? "姓名" : "Name"}<input name="name" required /></label><label>{zh ? "邮箱" : "Email"}<input name="email" type="email" required /></label></div><label>{zh ? "所属组织" : "Organization"}<select name="organization_id">{organizations.map(org => <option key={org.id} value={org.id}>{org.name}</option>)}</select></label><label>{zh ? "初始角色" : "Initial role"}<select name="role">{roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label><div className="dialog-actions"><button type="button" onClick={() => setDialog(null)}>{zh ? "取消" : "Cancel"}</button><button className="action-button" disabled={busy}>{zh ? "发送邀请" : "Send invite"}</button></div></form></Dialog>}
  </div>;
}

function IdentityManagement({ locale, api }: { locale: Locale; api: (path: string, options?: RequestInit) => Promise<unknown> }) {
  const zh = locale === "zh-CN";
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [audits, setAudits] = useState<AuditEvent[]>([]);
  const [selected, setSelected] = useState("");
  const [draft, setDraft] = useState<string[]>([]);
  const [showRole, setShowRole] = useState(false);
  const [message, setMessage] = useState("");
  async function load(preferred?: string) {
    try {
      const [roleData, permissionData, auditData] = await Promise.all([api("/api/v1/roles"), api("/api/v1/permissions"), api("/api/v1/audit-events")]) as [{ items: Role[] }, { items: string[] }, { items: AuditEvent[] }];
      setRoles(roleData.items ?? []); setPermissions(permissionData.items ?? []); setAudits(auditData.items ?? []);
      const id = preferred ?? selected ?? roleData.items?.[0]?.id ?? ""; setSelected(id);
      setDraft(roleData.items?.find(item => item.id === id)?.permissions ?? []);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Load failed"); }
  }
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const current = roles.find(item => item.id === selected);
  function selectRole(role: Role) { setSelected(role.id); setDraft(role.permissions); }
  async function savePermissions() {
    if (!current) return;
    try { await api(`/api/v1/roles/${current.id}`, { method: "PATCH", body: JSON.stringify({ name: current.name, description: current.description, permissions: draft }) }); setMessage(zh ? "角色权限已保存并记录审计。" : "Role permissions saved and audited."); await load(current.id); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Save failed"); }
  }
  async function createRole(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const values = new FormData(event.currentTarget);
    try { const role = await api("/api/v1/roles", { method: "POST", body: JSON.stringify({ name: values.get("name"), description: values.get("description"), permissions: ["product.access"] }) }) as Role; setShowRole(false); setMessage(zh ? "自定义角色已创建。" : "Custom role created."); await load(role.id); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Create failed"); }
  }
  const permissionLabels: Record<string, string> = { organization: zh ? "组织管理" : "Organization", member: zh ? "成员管理" : "Members", role: zh ? "角色权限" : "Roles", audit: zh ? "审计日志" : "Audit", product: zh ? "产品访问" : "Products", agent: zh ? "Agent 能力" : "Agent capabilities" };
  return <div className="management-page">
    <div className="management-heading"><div><small>NEXORA CORE · IAM</small><h1>{zh ? "身份与权限" : "Identity & access"}</h1><p>{zh ? "通过角色和细粒度权限控制 Core、Studio 与 Control 的访问边界。" : "Control access boundaries across Core, Studio, and Control with roles and granular permissions."}</p></div><button className="action-button" onClick={() => setShowRole(true)}><PlusOutlined /> {zh ? "新建角色" : "New role"}</button></div>
    {message && <div className="operation-message">{message}<button onClick={() => setMessage("")}>×</button></div>}
    <section className="iam-layout">
      <div className="management-card role-list"><header><div><h2>{zh ? "角色" : "Roles"}</h2><p>{roles.length} {zh ? "个可用角色" : "available roles"}</p></div></header>{roles.map(role => <button key={role.id} className={selected === role.id ? "selected" : ""} onClick={() => selectRole(role)}><span className="role-symbol"><SafetyCertificateOutlined /></span><span><strong>{role.name}</strong><small>{role.description}</small><i>{role.member_count} {zh ? "名成员" : "members"}{role.system ? ` · ${zh ? "系统" : "System"}` : ""}</i></span><ArrowRightOutlined /></button>)}</div>
      <div className="management-card permission-editor"><header><div><h2>{current?.name ?? (zh ? "选择角色" : "Select a role")}</h2><p>{zh ? "勾选该角色被允许执行的操作" : "Select the actions this role may perform"}</p></div>{current && <button className="action-button" disabled={current.id === "owner"} onClick={() => void savePermissions()}>{zh ? "保存权限" : "Save permissions"}</button>}</header>
        {current && <div className="permission-groups">{Object.entries(permissionLabels).map(([prefix, label]) => <section key={prefix}><h3>{label}</h3>{permissions.filter(permission => permission.startsWith(prefix + ".")).map(permission => <label key={permission} className={current.id === "owner" ? "disabled" : ""}><input type="checkbox" checked={current.id === "owner" || draft.includes(permission)} disabled={current.id === "owner"} onChange={event => setDraft(event.target.checked ? [...draft, permission] : draft.filter(item => item !== permission))} /><span><strong>{permission.split(".")[1] === "read" ? (zh ? "查看" : "Read") : permission.split(".")[1] === "write" ? (zh ? "管理" : "Manage") : permission.split(".")[1]}</strong><small>{permission}</small></span></label>)}</section>)}</div>}
      </div>
    </section>
    <section className="management-card audit-card"><header><div><h2>{zh ? "最近审计事件" : "Recent audit events"}</h2><p>{zh ? "组织、成员与权限的管理操作不可静默修改" : "Administrative changes remain traceable"}</p></div><button className="secondary-button" onClick={() => void load(selected)}>{zh ? "刷新" : "Refresh"}</button></header><div className="audit-list">{audits.slice(0, 8).map(event => <div key={event.id}><span className="audit-dot" /><strong>{event.action}</strong><code>{event.resource}</code><time>{new Date(event.occurred_at).toLocaleString(locale)}</time></div>)}</div></section>
    {showRole && <Dialog title={zh ? "新建自定义角色" : "New custom role"} onClose={() => setShowRole(false)}><form className="dialog-form" onSubmit={createRole}><label>{zh ? "角色名称" : "Role name"}<input name="name" required placeholder={zh ? "例如：Agent 运营人员" : "e.g. Agent Operator"} /></label><label>{zh ? "角色说明" : "Description"}<textarea name="description" rows={3} required /></label><p className="form-hint">{zh ? "创建后可在权限矩阵中配置具体权限。" : "Configure granular permissions after creation."}</p><div className="dialog-actions"><button type="button" onClick={() => setShowRole(false)}>{zh ? "取消" : "Cancel"}</button><button className="action-button">{zh ? "创建角色" : "Create role"}</button></div></form></Dialog>}
  </div>;
}

function SuiteRelationshipDiagram({ locale, portal = false }: { locale: keyof typeof copy; portal?: boolean }) {
  const zh = locale === "zh-CN";
  return <section className={`suite-relationship${portal ? " relationship-portal" : ""}`} aria-label={zh ? "Nexora 产品协作关系" : "How Nexora products work together"}>
    <div className="relationship-heading">
      <div>
        <small>{zh ? "产品协作关系" : "PRODUCT COLLABORATION"}</small>
        <strong>{zh ? "开发、治理与运行反馈形成闭环" : "A closed loop from building to governance"}</strong>
      </div>
      <span className="independent-badge">{zh ? "独立部署 · 按需组合" : "Independent · Composable"}</span>
    </div>

    <div className="relationship-products">
      <article className="relationship-product relationship-studio">
        <div className="relationship-product-title">
          <span><CodeOutlined /></span>
          <div><small>BUILD</small><strong>Nexora Studio <i>星铸</i></strong></div>
        </div>
        <p>{zh ? "智能体开发平台" : "Agent development platform"}</p>
        <div className="relationship-capabilities">
          <span>{zh ? "编排" : "Orchestrate"}</span><span>{zh ? "调试" : "Debug"}</span><span>{zh ? "评测" : "Evaluate"}</span><span>{zh ? "发布" : "Publish"}</span>
        </div>
      </article>

      <div className="relationship-flows" aria-label={zh ? "双向协作链路" : "Bidirectional collaboration"}>
        <div className="flow flow-forward">
          <span>{zh ? "发布到治理" : "Publish to govern"}</span>
          <i />
          <small>Agent · Version · API</small>
        </div>
        <div className="flow flow-back">
          <small>Policy · Trace · Risk</small>
          <i />
          <span>{zh ? "运行反馈" : "Runtime feedback"}</span>
        </div>
      </div>

      <article className="relationship-product relationship-control">
        <div className="external-agent"><b>+</b> {zh ? "外部 Agent 也可直接接入" : "External agents connect directly"}</div>
        <div className="relationship-product-title">
          <span><RadarChartOutlined /></span>
          <div><small>GOVERN</small><strong>Nexora Control <i>星域</i></strong></div>
        </div>
        <p>{zh ? "Agent 统一纳管平台" : "Unified agent control plane"}</p>
        <div className="relationship-capabilities">
          <span>{zh ? "注册" : "Registry"}</span><span>{zh ? "策略" : "Policy"}</span><span>{zh ? "网关" : "Gateway"}</span><span>{zh ? "观测" : "Observe"}</span>
        </div>
      </article>
    </div>

    <div className="relationship-maas">
      <span><DeploymentUnitOutlined /></span>
      <div><small>MODEL SERVICE</small><strong>Nexora MaaS <i>星模</i></strong></div>
      <p>{zh ? "统一接入模型供应商，为 Studio 与企业 AI 应用提供稳定模型路由" : "Connect model providers once and serve Studio and enterprise AI applications through stable routes"}</p>
      <div><b>{zh ? "模型目录" : "Catalog"}</b><b>{zh ? "统一路由" : "Routing"}</b><b>{zh ? "用量成本" : "Usage & cost"}</b></div>
    </div>

    <div className="core-foundation">
      <div className="core-identity"><span className="core-mark">N</span><div><small>{zh ? "统一可信底座" : "TRUSTED FOUNDATION"}</small><strong>Nexora Core <i>星核</i></strong></div></div>
      <div className="core-services">
        <span>{zh ? "统一身份" : "Identity"}</span><span>{zh ? "多租户" : "Tenancy"}</span><span>RBAC</span><span>{zh ? "密钥" : "Secrets"}</span><span>{zh ? "审计" : "Audit"}</span>
      </div>
      <p>{zh ? "为上层独立产品提供共同的身份与组织边界，不共享业务数据库" : "One identity and organization boundary for independent upper-layer products — without shared business data"}</p>
    </div>

    <div className="deployment-options">
      <span><CheckCircleFilled /> Core + Studio</span>
      <span><CheckCircleFilled /> Core + Control</span>
      <span><CheckCircleFilled /> Core + MaaS</span>
      <span><CheckCircleFilled /> {zh ? "完整套件" : "Full Suite"}</span>
    </div>
  </section>;
}

export default function Home() {
  const [locale, setLocale] = useState<keyof typeof copy>("zh-CN");
  const [email, setEmail] = useState("admin@nexora.local");
  const [password, setPassword] = useState("Nexora123!");
  const [status, setStatus] = useState("");
  const [products, setProducts] = useState<string[]>([]);
  const [productURLs, setProductURLs] = useState<Record<string, string>>({});
  const [loggingOut, setLoggingOut] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [section, setSection] = useState<"workspace" | "organization" | "identity">("workspace");
  const t = copy[locale];
  const suiteURL = (port: number, path = "/") => typeof window === "undefined" ? "" : `${window.location.protocol}//${window.location.hostname}:${port}${path}`;
  const productURL = (product: string, fallback: string) => {
    const token = typeof window === "undefined" ? "" : localStorage.getItem("nexora_token") ?? "";
    const url = new URL(productURLs[product] ?? fallback, typeof window === "undefined" ? "http://localhost" : window.location.href);
    if (token) url.searchParams.set("token", token);
    url.searchParams.set("locale", locale);
    return url.toString();
  };
  async function api(path: string, options: RequestInit = {}) {
    const token = localStorage.getItem("nexora_token");
    const response = await fetch(path, {
      ...options,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...options.headers }
    });
    if (response.status === 204) return null;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error?.message ?? `Request failed (${response.status})`);
    return data;
  }

  async function restoreSession() {
    const existingToken = localStorage.getItem("nexora_token");
    if (!existingToken) return;
    const refreshResponse = await fetch("/api/v1/auth/refresh", {
      method: "POST",
      headers: { Authorization: `Bearer ${existingToken}` }
    });
    if (!refreshResponse.ok) {
      localStorage.removeItem("nexora_token");
      return;
    }
    const refreshed = await refreshResponse.json();
    const token = refreshed.access_token as string;
    localStorage.setItem("nexora_token", token);
    const response = await fetch("/api/v1/products", {headers:{Authorization:`Bearer ${token}`}});
    if (!response.ok) {
      localStorage.removeItem("nexora_token");
      return;
    }
    const data = await response.json();
    setProducts((data.items ?? []).map((item:{id:string})=>item.id));
    setProductURLs(Object.fromEntries((data.items ?? []).map((item:{id:string;url:string})=>[item.id,item.url])));
    setAuthenticated(true);
    setStatus(t.signed);
  }
  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    const reason=params.get("reason");
    if(reason==="login_required"||reason==="session_expired"){
      setStatus(locale==="zh-CN"?(reason==="session_expired"?"登录已过期，请重新登录。":"请先登录，再进入 Nexora 产品。"):(reason==="session_expired"?"Your session expired. Sign in again.":"Sign in before opening a Nexora product."));
      window.history.replaceState({},"",window.location.pathname);
      return;
    }
    if(params.get("logout")==="1"){
      localStorage.removeItem("nexora_token");
      localStorage.removeItem("nexora_locale");
      setProducts([]);setProductURLs({});setLoggingOut(true);
      setAuthenticated(false);
      setStatus(locale==="zh-CN"?"已安全退出 Nexora 全部产品。":"Signed out of all Nexora products.");
      window.history.replaceState({},"",window.location.pathname);
      const timer=window.setTimeout(()=>setLoggingOut(false),1800);
      return ()=>window.clearTimeout(timer);
    }
    void restoreSession();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  function logout(){
    localStorage.removeItem("nexora_token");
    localStorage.removeItem("nexora_locale");
    setProducts([]);setProductURLs({});setLoggingOut(true);
    setAuthenticated(false);
    setStatus(locale==="zh-CN"?"已安全退出 Nexora 全部产品。":"Signed out of all Nexora products.");
    window.setTimeout(()=>setLoggingOut(false),1800);
  }

  async function login() {
    setStatus("...");
    try {
      const res = await fetch(process.env.NEXT_PUBLIC_CORE_API ?? "/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? "Login failed");
      localStorage.setItem("nexora_token", data.access_token);
      localStorage.setItem("nexora_locale", locale);
      setProducts(data.products ?? []);
      const productsResponse = await fetch("/api/v1/products", {
        headers: { Authorization: `Bearer ${data.access_token}` }
      });
      if (productsResponse.ok) {
        const productData = await productsResponse.json();
        setProductURLs(Object.fromEntries((productData.items ?? []).map((item: {id: string; url: string}) => [item.id, item.url])));
      }
      setAuthenticated(true);
      setStatus(t.signed);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Login failed");
    }
  }

  if(authenticated)return <main className="portal-shell">
    <aside className="portal-side">
      <div className="brand portal-brand"><span className="mark">N</span><span>Nexora<small>星原智能体套件</small></span></div>
      <nav className="portal-nav">
        <button className={section==="workspace"?"active":""} onClick={()=>setSection("workspace")}><AppstoreOutlined/> {locale==="zh-CN"?"产品工作台":"Product workspace"}</button>
        <button className={section==="organization"?"active":""} onClick={()=>setSection("organization")}><ApartmentOutlined/> {locale==="zh-CN"?"组织与成员":"Organization"}</button>
        <button className={section==="identity"?"active":""} onClick={()=>setSection("identity")}><SafetyCertificateOutlined/> {locale==="zh-CN"?"身份与权限":"Identity & access"}</button>
      </nav>
      <div className="tenant-card"><small>{locale==="zh-CN"?"当前租户":"CURRENT TENANT"}</small><strong>Nexora Demo</strong><span><CheckCircleFilled/> {locale==="zh-CN"?"企业版 · 运行正常":"Enterprise · Healthy"}</span></div>
    </aside>
    <section className="portal-main">
      <header className="portal-top">
        <div><span className="mobile-brand">Nexora</span></div>
        <div className="top-actions"><button className="locale" onClick={()=>setLocale(locale==="zh-CN"?"en-US":"zh-CN")}>{locale==="zh-CN"?"EN":"中文"}</button><div className="account"><span>NA</span><div><strong>Nexora Admin</strong><small>admin@nexora.local</small></div></div><button className="icon-logout" aria-label={locale==="zh-CN"?"退出登录":"Sign out"} onClick={logout}><LogoutOutlined/></button></div>
      </header>
      {loggingOut&&<div className="logout-frames" aria-hidden="true"><iframe src={suiteURL(3001,"/?logout=1&embedded=1")} title="Studio logout"/><iframe src={suiteURL(3002,"/?logout=1&embedded=1")} title="Control logout"/><iframe src={suiteURL(3003,"/?logout=1&embedded=1")} title="MaaS logout"/></div>}
      <div className="portal-content">
        {section==="workspace"&&<><div className="portal-heading"><div><small>NEXORA SUITE</small><h1>{locale==="zh-CN"?"企业 AI 产品工作台":"Enterprise AI workspace"}</h1><p>{locale==="zh-CN"?"统一模型供给、智能体开发与治理，共享身份和组织边界。":"Unify model supply, agent development, and governance under one identity boundary."}</p></div><div className="health"><i/><span><strong>{locale==="zh-CN"?"套件运行正常":"Suite operational"}</strong><small>Core · MaaS · Studio · Control</small></span></div></div>
          <SuiteRelationshipDiagram locale={locale} portal />
          <section className="suite-grid">
            {products.includes("studio")&&<a className="suite-product studio-product" href={productURL("studio","http://localhost:3001")}><div className="product-icon"><CodeOutlined/></div><div className="product-copy"><div className="product-kicker">BUILD</div><h2>Nexora Studio <span>星铸</span></h2><p>{locale==="zh-CN"?"面向开发团队的智能体开发平台。编排工作流、连接模型与知识、调试评测并发布生产版本。":"The agent development platform for building, testing, evaluating, and publishing production agents."}</p><div className="capabilities"><span>{locale==="zh-CN"?"可视化编排":"Visual builder"}</span><span>RAG</span><span>Tools & MCP</span><span>{locale==="zh-CN"?"评测发布":"Evaluation"}</span></div></div><div className="enter">{locale==="zh-CN"?"进入 Studio":"Open Studio"} <ArrowRightOutlined/></div></a>}
            {products.includes("control")&&<a className="suite-product control-product" href={productURL("control","http://localhost:3002")}><div className="product-icon"><RadarChartOutlined/></div><div className="product-copy"><div className="product-kicker">GOVERN</div><h2>Nexora Control <span>星域</span></h2><p>{locale==="zh-CN"?"面向平台与安全团队的 Agent 统一纳管平台。登记身份、执行策略、统一调用并持续观测风险。":"The governance plane for registering identities, enforcing policy, routing calls, and observing risk."}</p><div className="capabilities"><span>Registry</span><span>{locale==="zh-CN"?"策略中心":"Policies"}</span><span>Gateway</span><span>Observability</span></div></div><div className="enter">{locale==="zh-CN"?"进入 Control":"Open Control"} <ArrowRightOutlined/></div></a>}
            {products.includes("maas")&&<a className="suite-product maas-product" href={productURL("maas","http://localhost:3003")}><div className="product-icon"><DeploymentUnitOutlined/></div><div className="product-copy"><div className="product-kicker">MODEL SERVICE</div><h2>Nexora MaaS <span>星模</span></h2><p>{locale==="zh-CN"?"面向 AI 平台团队的统一模型服务平台。接入供应商、维护模型目录、稳定路由并观测用量成本。":"The model service plane for provider access, model catalog, stable routing, usage, and cost."}</p><div className="capabilities"><span>Providers</span><span>{locale==="zh-CN"?"模型目录":"Catalog"}</span><span>{locale==="zh-CN"?"路由":"Routing"}</span><span>{locale==="zh-CN"?"成本":"Cost"}</span></div></div><div className="enter">{locale==="zh-CN"?"进入 MaaS":"Open MaaS"} <ArrowRightOutlined/></div></a>}
          </section>
          <section className="foundation-card"><div className="foundation-icon"><CloudServerOutlined/></div><div><small>NEXORA CORE · 星核</small><h3>{locale==="zh-CN"?"统一底座正在为已购买产品提供服务":"The shared foundation powering your products"}</h3><p>{locale==="zh-CN"?"统一身份、多租户、组织权限、密钥与审计能力已启用。各产品独立部署，不共享业务数据库。":"Identity, tenancy, authorization, secrets, and audit are active. Products deploy independently without sharing business data."}</p></div><div className="foundation-stats"><span><b>1</b>{locale==="zh-CN"?"租户":"Tenant"}</span><span><b>{products.length}</b>{locale==="zh-CN"?"已启用产品":"Products"}</span><span><b>2</b>{locale==="zh-CN"?"语言":"Locales"}</span></div></section></>}
        {section==="organization"&&<OrganizationManagement locale={locale} api={api}/>}
        {section==="identity"&&<IdentityManagement locale={locale} api={api}/>}
      </div>
    </section>
  </main>;

  return <main className="shell">
    <header className="topbar">
      <div className="brand"><span className="mark">N</span> NEXORA <span style={{color:"#756ad2"}}>· 星原</span></div>
      <div className="top-actions"><button className="locale" onClick={() => setLocale(locale === "zh-CN" ? "en-US" : "zh-CN")}>{locale === "zh-CN" ? "EN" : "中文"}</button></div>
    </header>
    {loggingOut&&<div className="logout-frames" aria-hidden="true"><iframe src={suiteURL(3001,"/?logout=1&embedded=1")} title="Studio logout"/><iframe src={suiteURL(3002,"/?logout=1&embedded=1")} title="Control logout"/><iframe src={suiteURL(3003,"/?logout=1&embedded=1")} title="MaaS logout"/></div>}
    <section className="main auth-main">
      <div className="auth-layout">
        <section className="auth-intro">
          <div className="eyebrow">{t.eyebrow}</div>
          <h1>{locale==="zh-CN"?"企业 AI，从模型供给到智能体治理":"Enterprise AI, from model supply to agent governance"}</h1>
          <p className="lead">{locale==="zh-CN"?"Nexora 以统一身份与组织权限为底座，连接模型服务、智能体开发和统一纳管。按需购买，独立部署。":"Nexora connects model services, agent development, and governance through one identity foundation. Buy and deploy only what you need."}</p>
          <SuiteRelationshipDiagram locale={locale} />
        </section>
        <section className="panel login-panel">
          <div className="login-heading"><span className="login-mark"><SafetyCertificateOutlined/></span><div><h2>{t.signIn}</h2><p>{locale==="zh-CN"?"登录后进入已购买的产品工作台":"Access the products enabled for your organization"}</p></div></div>
          <label className="field">{t.email}<input value={email} onChange={e=>setEmail(e.target.value)} /></label>
          <label className="field">{t.password}<input type="password" value={password} onChange={e=>setPassword(e.target.value)} /></label>
          <button className="primary" onClick={login}>{t.button}</button>
          {status && <div className="status">{status}</div>}
        </section>
      </div>
    </section>
  </main>;
}
