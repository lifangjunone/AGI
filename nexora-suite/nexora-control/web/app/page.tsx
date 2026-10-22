"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiOutlined, AuditOutlined, CodeOutlined, DashboardOutlined, HomeOutlined, KeyOutlined, LogoutOutlined, PlusOutlined, RadarChartOutlined, SafetyCertificateOutlined, ThunderboltOutlined, UserOutlined } from "@ant-design/icons";

type View="overview"|"registry"|"policies"|"gateway"|"identities"|"observability"|"audit";
type Agent={ID?:string;id?:string;Name?:string;name?:string;Source?:string;source?:string;Status?:string;status?:string;Version?:string;version?:string;Endpoint?:string;endpoint?:string};
type Trace={ID?:string;id?:string;AgentID?:string;agent_id?:string;LatencyMS?:number;latency_ms?:number;Status?:string;status?:string;CostUSD?:number;cost_usd?:number;RequestID?:string;request_id?:string};
type Policy={ID?:string;id?:string;Name?:string;name?:string;Effect?:string;effect?:string;RateLimitPerMinute?:number;rate_limit_per_minute?:number;Enabled?:boolean;enabled?:boolean};
const api=process.env.NEXT_PUBLIC_CONTROL_API??"";
const aid=(a:Agent)=>a.ID??a.id??"";
const aname=(a:Agent)=>a.Name??a.name??"Untitled Agent";
const status=(a:Agent)=>a.Status??a.status??"pending";

export default function Control(){
  const[locale,setLocale]=useState<"zh-CN"|"en-US">("zh-CN");
  const[view,setView]=useState<View>("overview");
  const[agents,setAgents]=useState<Agent[]>([]);
  const[traces,setTraces]=useState<Trace[]>([]);
  const[policies,setPolicies]=useState<Policy[]>([]);
  const[selected,setSelected]=useState("");
  const[notice,setNotice]=useState("");
  const[result,setResult]=useState<unknown>(null);
  const[secret,setSecret]=useState("");
  const[menuOpen,setMenuOpen]=useState(false);
  const[embedded,setEmbedded]=useState(false);
  const[loggingOut,setLoggingOut]=useState(false);
  const[formMode,setFormMode]=useState<"register"|"policy"|null>(null);
  const[formName,setFormName]=useState("");
  const msg=(zh:string,en:string)=>locale==="zh-CN"?zh:en;
  const suiteURL=(port:number,path="/")=>typeof window==="undefined"?"":`${window.location.protocol}//${window.location.hostname}:${port}${path}`;
  const productURL=(port:number)=>{
    if(typeof window==="undefined")return "#";
    const url=new URL(suiteURL(port));
    const token=localStorage.getItem("nexora_token");
    if(token)url.searchParams.set("token",token);
    url.searchParams.set("locale",locale);
    return url.toString();
  };
  const title:Record<View,string>={
    overview:msg("Agent 统一治理中心","Unified Agent Governance"),registry:"Agent Registry",policies:msg("策略中心","Policy Center"),gateway:"Agent Gateway",
    identities:msg("Agent 身份与凭据","Agent Identities"),observability:msg("运行观测","Observability"),audit:msg("风险与审计","Risk & Audit")
  };
  const headers=useCallback(()=>({"Content-Type":"application/json","Authorization":`Bearer ${localStorage.getItem("nexora_token")??""}`}),[]);
  async function request(path:string,init?:RequestInit){
    const res=await fetch(`${api}${path}`,{...init,headers:{...headers(),...(init?.headers??{})}});
    const data=res.status===204?{}:await res.json().catch(()=>({}));
    if(res.status===401){
      localStorage.removeItem("nexora_token");
      window.location.replace(`${suiteURL(3000)}?reason=session_expired`);
      throw new Error(msg("登录已过期。","Session expired."));
    }
    if(!res.ok)throw new Error(data?.error?.message??`Request failed (${res.status})`);
    return data;
  }
  async function load(){
    try{
      const[ar,tr,pr]=await Promise.all([request("/api/v1/agents"),request("/api/v1/traces"),request("/api/v1/policies")]);
      const items=ar.items??[];setAgents(items);setTraces(tr.items??[]);setPolicies(pr.items??[]);
      if(!selected&&items[0])setSelected(aid(items[0]));
    }catch(e){setNotice(e instanceof Error?e.message:msg("请从 Core 重新登录。","Sign in again from Core."))}
  }
  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);const token=params.get("token");const nextLocale=params.get("locale");
    if(params.get("logout")==="1"){
      localStorage.removeItem("nexora_token");localStorage.removeItem("nexora_locale");
      if(params.get("embedded")==="1")setEmbedded(true);
      else window.location.replace(suiteURL(3000,"/?logout=1"));
      return;
    }
    if(token){localStorage.setItem("nexora_token",token);params.delete("token");window.history.replaceState({},"",`${window.location.pathname}${params.size?`?${params}`:""}`)}
    if(nextLocale==="zh-CN"||nextLocale==="en-US")setLocale(nextLocale);
    if(!token&&!localStorage.getItem("nexora_token")){
      window.location.replace(`${suiteURL(3000)}?reason=login_required`);
      return;
    }
    void load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  function logout(){
    localStorage.removeItem("nexora_token");localStorage.removeItem("nexora_locale");setMenuOpen(false);setLoggingOut(true);
    window.setTimeout(()=>window.location.replace(suiteURL(3000,"/?logout=1")),500);
  }
  async function register(){
    const name=formName.trim();if(!name)return;
    try{await request("/api/v1/agents",{method:"POST",body:JSON.stringify({external_id:`ext-${Date.now()}`,name,source:"external",version:"1.0.0",endpoint:"https://agent.example.com/invoke",capabilities:["chat"]})});setFormMode(null);setNotice(msg("外部 Agent 已登记，等待审核。","External agent registered for approval."));await load();setView("registry")}catch(e){setNotice(e instanceof Error?e.message:"Error")}
  }
  async function lifecycle(id:string,next:string){
    try{await request(`/api/v1/agents/${id}/lifecycle`,{method:"POST",body:JSON.stringify({status:next})});setNotice(msg(`状态已更新为 ${next}。`,`Status updated to ${next}.`));await load()}catch(e){setNotice(e instanceof Error?e.message:"Error")}
  }
  async function createPolicy(){
    const name=formName.trim();if(!name)return;
    if(!selected){setNotice(msg("请先在表单中选择策略适用的 Agent。","Choose the agent this policy applies to."));return}
    try{await request("/api/v1/policies",{method:"POST",body:JSON.stringify({name,effect:"allow",agent_id:selected,environment:"production",rate_limit_per_minute:60})});setFormMode(null);setNotice(msg("策略已创建并启用。","Policy created and enabled."));await load()}catch(e){setNotice(e instanceof Error?e.message:"Error")}
  }
  async function issueCredential(){
    if(!selected){setNotice(msg("请先选择 Agent。","Select an agent first."));return}
    try{const data=await request(`/api/v1/agents/${selected}/credentials`,{method:"POST",body:"{}"});setSecret(data.secret);setResult(data);setNotice(msg("凭据签发成功，请立即复制；仅显示一次。","Credential issued. Copy it now; it is shown only once."))}catch(e){setNotice(e instanceof Error?e.message:"Error")}
  }
  async function invoke(){
    if(!selected){setNotice(msg("请先选择 Agent。","Select an agent first."));return}
    try{const data=await request(`/api/v1/gateway/agents/${selected}/invoke`,{method:"POST",body:JSON.stringify({input:msg("检查订单 2026-001 的状态","Check the status of order 2026-001")})});setResult(data);setNotice(msg("网关调用成功。","Gateway invocation succeeded."));await load()}catch(e){setNotice(e instanceof Error?e.message:"Error")}
  }
  const nav:[View,React.ReactNode][]=[["overview",<DashboardOutlined key="i"/>],["registry",<RadarChartOutlined key="i"/>],["policies",<SafetyCertificateOutlined key="i"/>],["gateway",<ApiOutlined key="i"/>],["identities",<KeyOutlined key="i"/>],["observability",<ThunderboltOutlined key="i"/>],["audit",<AuditOutlined key="i"/>]];
  const current=agents.find(a=>aid(a)===selected);
  const AgentTarget=({purpose}:{purpose:"gateway"|"credential"|"policy"})=>{
    const labels={
      gateway:[msg("调用目标 Agent","Invocation target"),msg("本次网关请求将路由到该 Agent。","This gateway request will be routed to this agent.")],
      credential:[msg("凭据所属 Agent","Credential owner"),msg("新凭据将绑定到该 Agent，可单独轮换或吊销。","The credential will be bound to this agent for rotation and revocation.")],
      policy:[msg("策略适用 Agent","Policy target"),msg("访问控制与速率限制只对该 Agent 生效。","Access and rate limits will apply only to this agent.")]
    } as const;
    const [label,help]=labels[purpose];
    return <label className="agent-target"><span><strong>{label}</strong><small>{help}</small></span><select aria-label={label} value={selected} onChange={e=>setSelected(e.target.value)}><option value="">{agents.length?msg("请选择目标 Agent","Choose a target agent"):msg("暂无可选 Agent","No agents available")}</option>{agents.map(a=><option value={aid(a)} key={aid(a)}>{aname(a)} · {status(a)}</option>)}</select>{current&&<em className={`target-status ${status(current)==="pending"?"warn":""}`}>{status(current)}</em>}</label>
  };
  const AgentRows=()=> <>{agents.length===0?<div className="empty-state"><span className="empty-icon"><RadarChartOutlined/></span><strong>{msg("还没有纳管任何 Agent","No agents are managed yet")}</strong><p>{msg("你可以注册已有的外部 Agent，也可以从 Nexora Studio 发布后自动进入这里。","Register an existing external agent, or publish one from Nexora Studio to have it appear here automatically.")}</p><div><button className="button primary" onClick={()=>{setFormName("");setFormMode("register")}}><PlusOutlined/> {msg("注册外部 Agent","Register external agent")}</button><a className="button" href={productURL(3001)}>{msg("前往 Studio","Open Studio")}</a></div></div>:agents.map(a=><div className={`agent ${selected===aid(a)?"selected":""}`} key={aid(a)} onClick={()=>setSelected(aid(a))}><div><strong>{aname(a)}</strong><br/><small>v{a.Version??a.version??"1.0.0"} · {a.Endpoint??a.endpoint??"No endpoint"}</small></div><span className="source">{a.Source??a.source}</span><span className={`status ${status(a)==="pending"?"warn":""}`}>{status(a)}</span>{status(a)==="pending"&&<button className="button compact" onClick={e=>{e.stopPropagation();void lifecycle(aid(a),"approved")}}>{msg("批准","Approve")}</button>}</div>)}</>;
  if(embedded)return <div className="signed-out">{msg("已退出 Control","Control signed out")}</div>;
  return <div className="app">
    {loggingOut&&<div className="logout-frames" aria-hidden="true"><iframe src={suiteURL(3001,"/?logout=1&embedded=1")} title="Studio logout"/></div>}
    <aside className="side"><div className="brand"><b>N</b> Nexora Control</div><nav className="nav">{nav.map(([key,icon])=><button className={view===key?"active":""} key={key} onClick={()=>setView(key)}>{icon} {title[key]}</button>)}</nav></aside>
    <main className="main"><header className="header"><div><small className="muted">NEXORA / CONTROL</small><h1>{title[view]}</h1></div><div className="actions"><button className="button" onClick={()=>setLocale(locale==="zh-CN"?"en-US":"zh-CN")}>{locale==="zh-CN"?"EN":"中文"}</button><button className="button primary" onClick={()=>{setFormName("");setFormMode("register")}}><PlusOutlined/> {msg("注册外部 Agent","Register external agent")}</button><div className="user-menu"><button className="avatar-button" aria-label={msg("用户菜单","User menu")} onClick={()=>setMenuOpen(x=>!x)}><UserOutlined/><span>NA</span></button>{menuOpen&&<div className="menu-popover">
      <div className="menu-profile"><strong>Nexora Admin</strong><small>admin@nexora.local</small></div>
      <a href={suiteURL(3000)}><HomeOutlined/> {msg("返回统一门户","Back to Core portal")}</a>
      <a href={productURL(3001)}><CodeOutlined/> {msg("切换到 Studio","Switch to Studio")}</a>
      <button onClick={logout}><LogoutOutlined/> {msg("退出全部产品","Sign out of all products")}</button>
    </div>}</div></div></header>
      {notice&&<div className="notice banner">{notice}</div>}
      {view==="overview"&&<><section className="journey"><div className="journey-head"><div><strong>{msg("Agent 治理生命周期","Agent governance lifecycle")}</strong><small>{msg("从登记、审核到安全调用与持续观测","From registration and approval to governed invocation and observation")}</small></div><span>{msg("治理闭环","Governance loop")}</span></div><div className="journey-steps">
        <button className={agents.length?"done":"current"} onClick={()=>{setFormName("");setFormMode("register")}}><b>1</b><span>{msg("登记 Agent","Register")}<small>{msg("Studio 或外部来源","Studio or external")}</small></span></button>
        <button className={agents.some(a=>status(a)==="pending")?"current":agents.length?"done":""} onClick={()=>setView("registry")}><b>2</b><span>{msg("审核身份","Approve")}<small>{msg("负责人和生命周期","Identity & lifecycle")}</small></span></button>
        <button className={policies.length?"done":""} onClick={()=>setView("policies")}><b>3</b><span>{msg("配置策略","Policy")}<small>{msg("访问与速率限制","Access & rate limits")}</small></span></button>
        <button onClick={()=>setView("gateway")}><b>4</b><span>{msg("安全调用","Invoke")}<small>{msg("网关鉴权与路由","Gateway enforcement")}</small></span></button>
        <button className={traces.length?"done":""} onClick={()=>setView("observability")}><b>5</b><span>{msg("观测审计","Observe")}<small>{msg("Trace、成本与风险","Trace, cost, risk")}</small></span></button>
      </div></section><section className="stats"><div className="card"><small>{msg("纳管 Agent","Managed agents")}</small><div className="metric">{agents.length}</div></div><div className="card"><small>{msg("已批准/发布","Approved / published")}</small><div className="metric">{agents.filter(a=>["approved","published"].includes(status(a))).length}</div></div><div className="card"><small>{msg("调用 Trace","Invocation traces")}</small><div className="metric">{traces.length}</div></div><div className="card"><small>{msg("风险事件","Risk events")}</small><div className="metric">{agents.filter(a=>["quarantined","disabled"].includes(status(a))).length}</div></div></section><section className="grid"><div className="panel"><div className="panelhead"><h3>Agent Registry</h3><span className="muted"><span className="pulse"/>Gateway healthy</span></div><AgentRows/></div><TracePanel traces={traces} locale={locale} refresh={load}/></section></>}
      {view==="registry"&&<section className="panel view-panel"><div className="panelhead"><div><h3>Agent Registry</h3><p className="muted">{msg("统一登记 Studio 与外部 Agent，并管理完整生命周期。","Register Studio and external agents and manage their lifecycle.")}</p></div><button className="button" onClick={load}>↻</button></div><AgentRows/></section>}
      {view==="policies"&&<section className="panel view-panel"><div className="panelhead"><div><h3>{title.policies}</h3><p className="muted">{msg("按租户、环境和 Agent 执行访问与速率策略。","Enforce tenant, environment, agent access, and rate policies.")}</p></div><button className="button primary" disabled={!agents.length} title={!agents.length?msg("请先注册 Agent","Register an agent first"):undefined} onClick={()=>{setFormName("");setFormMode("policy")}}><PlusOutlined/> {msg("新建策略","New policy")}</button></div>{policies.length===0?<div className="empty">{agents.length?msg("暂无策略。创建后将绑定到指定 Agent。","No policies yet. New policies will be bound to a specific agent."):msg("注册 Agent 后即可配置访问与速率策略。","Register an agent before configuring access and rate policies.")}</div>:policies.map((p,i)=><div className="policy" key={p.ID??p.id??i}><div><strong>{p.Name??p.name}</strong><small>{p.Effect??p.effect} · {p.RateLimitPerMinute??p.rate_limit_per_minute??0} req/min</small></div><span className="status">{(p.Enabled??p.enabled)!==false?"Enabled":"Disabled"}</span></div>)}</section>}
      {view==="gateway"&&<section className="panel view-panel narrow"><h3>Agent Gateway</h3><p className="muted">{msg("鉴权、策略执行、路由与统一 Trace。仅已批准或已发布 Agent 可调用。","Authentication, policy enforcement, routing, and unified tracing. Only approved or published agents can be invoked.")}</p><AgentTarget purpose="gateway"/><textarea aria-label={msg("调用输入","Invocation input")} defaultValue={msg("检查订单 2026-001 的状态","Check the status of order 2026-001")}/><button className="button primary" disabled={!selected} onClick={invoke}><ApiOutlined/> {msg("通过网关调用","Invoke through gateway")}</button>{!agents.length&&<p className="inline-help">{msg("暂无调用目标，请先注册并审核 Agent。","No invocation target is available. Register and approve an agent first.")}</p>}{result!==null&&<pre>{JSON.stringify(result,null,2)}</pre>}</section>}
      {view==="identities"&&<section className="panel view-panel narrow"><h3>{title.identities}</h3><p className="muted">{msg("为 Agent 签发稳定运行凭据，支持轮换与吊销。","Issue stable runtime credentials with rotation and revocation.")}</p><AgentTarget purpose="credential"/><button className="button primary" disabled={!selected} onClick={issueCredential}><KeyOutlined/> {msg("签发凭据","Issue credential")}</button>{!agents.length&&<p className="inline-help">{msg("暂无可绑定对象，请先完成 Agent 注册。","No agent is available for credential binding. Register an agent first.")}</p>}{secret&&<div className="secret"><small>{msg("仅显示一次","Shown once")}</small><code>{secret}</code><button className="button" onClick={()=>void navigator.clipboard.writeText(secret)}>{msg("复制","Copy")}</button></div>}</section>}
      {view==="observability"&&<section className="view-panel"><TracePanel traces={traces} locale={locale} refresh={load}/></section>}
      {view==="audit"&&<section className="panel view-panel"><div className="panelhead"><div><h3>{title.audit}</h3><p className="muted">{msg("从生命周期与调用数据派生的风险视图。","A derived risk view based on lifecycle and invocation data.")}</p></div><span className="tag">Derived view</span></div>{agents.filter(a=>["pending","quarantined","disabled"].includes(status(a))).length===0?<div className="empty">{msg("当前无待处理风险。","No actionable risk at this time.")}</div>:agents.filter(a=>["pending","quarantined","disabled"].includes(status(a))).map(a=><div className="risk" key={aid(a)}><AuditOutlined/><span><strong>{aname(a)}</strong><small>{status(a)==="pending"?msg("等待治理审核","Awaiting governance approval"):msg("Agent 当前不可调用","Agent is currently unavailable")}</small></span><span className="status warn">{status(a)}</span></div>)}</section>}
    </main>
    {formMode&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setFormMode(null)}}><section className="modal" role="dialog" aria-modal="true"><div className="modal-head"><div><small>NEXORA CONTROL</small><h2>{formMode==="register"?msg("注册外部 Agent","Register external agent"):msg("新建策略","New policy")}</h2><p>{formMode==="register"?msg("登记身份、端点和能力，提交后进入审核。","Register identity, endpoint, and capabilities for approval."):msg("指定策略作用对象，并配置生产环境访问控制。","Choose the target agent and configure production access control.")}</p></div><button className="modal-close" aria-label={msg("关闭","Close")} onClick={()=>setFormMode(null)}>×</button></div>{formMode==="policy"&&<AgentTarget purpose="policy"/>}<label className="form-field"><span>{formMode==="register"?msg("Agent 名称","Agent name"):msg("策略名称","Policy name")}</span><input autoFocus value={formName} placeholder={formMode==="register"?"Enterprise Support Agent":"Production allow policy"} onChange={e=>setFormName(e.target.value)}/></label><div className="modal-actions"><button className="button" onClick={()=>setFormMode(null)}>{msg("取消","Cancel")}</button><button className="button primary" disabled={!formName.trim()||(formMode==="policy"&&!selected)} onClick={()=>void (formMode==="register"?register():createPolicy())}>{msg("确认创建","Create")}</button></div></section></div>}
  </div>
}

function TracePanel({traces,locale,refresh}:{traces:Trace[];locale:"zh-CN"|"en-US";refresh:()=>Promise<void>}){
  return <div className="panel"><div className="panelhead"><h3>{locale==="zh-CN"?"实时调用 Trace":"Live invocation traces"}</h3><button className="button" onClick={()=>void refresh()}>↻</button></div>{traces.length===0?<div className="empty">{locale==="zh-CN"?"暂无调用 Trace":"No traces yet"}</div>:traces.map((x,i)=><div className="trace" key={x.ID??x.id??i}><div className="tracehead"><span>{x.AgentID??x.agent_id}</span><span className="status">{x.Status??x.status}</span></div><small className="muted">{x.LatencyMS??x.latency_ms} ms · ${(x.CostUSD??x.cost_usd??0).toFixed(5)} · {x.RequestID??x.request_id}</small><div className="bar"><i style={{width:`${Math.min(100,(x.LatencyMS??x.latency_ms??10)/3)}%`}}/></div></div>)}</div>
}
