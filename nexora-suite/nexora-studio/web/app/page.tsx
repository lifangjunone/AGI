"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addEdge, Background, Controls, Handle, Position, ReactFlow, useEdgesState, useNodesState, type Connection, type Edge, type NodeProps } from "@xyflow/react";
import { AppstoreOutlined, BranchesOutlined, CheckOutlined, CodeOutlined, DatabaseOutlined, DeleteOutlined, ExperimentOutlined, FileTextOutlined, FunctionOutlined, HomeOutlined, LinkOutlined, LogoutOutlined, MenuFoldOutlined, MenuUnfoldOutlined, MessageOutlined, MinusOutlined, PlusOutlined, RadarChartOutlined, RocketOutlined, SearchOutlined, SendOutlined, SettingOutlined, ToolOutlined, UploadOutlined, UserOutlined } from "@ant-design/icons";

type View = "workspace"|"agent"|"chat"|"builder"|"knowledge"|"tools"|"evaluations"|"releases";
type Agent = {ID?:string;id?:string;Name?:string;name?:string;Description?:string;description?:string;Status?:string;status?:string;OwnerID?:string;owner_id?:string;Template?:string;template?:string;Model?:string;model?:string;SystemPrompt?:string;system_prompt?:string;KnowledgeBase?:string[];knowledge_base?:string[];Tools?:string[];tools?:string[];Intents?:string[];intents?:string[];Skills?:string[];skills?:string[];Plugins?:string[];plugins?:string[]};
type Version = {ID?:string;id?:string;Version?:string;version?:string;Endpoint?:string;endpoint?:string;PublishedAt?:string;published_at?:string};
type Resource = {id:string;kind:string;name:string;description:string;status:string;config?:Record<string,unknown>;created_at?:string};
type KnowledgeDraft = {name:string;description:string;sourceType:"file"|"url"|"text";sourceValue:string;files:File[];embedding:string;chunkSize:number;chunkOverlap:number};
type ChatMessage = {id:string;role:"user"|"assistant";content:string;trace?:ChatTrace};
type ChatTrace = {trace_id:string;runtime_mode:string;runtime_notice:string;plan:string[];steps:{id:string;kind:string;name:string;status:string;summary:string;duration_ms:number}[];citations:{resource_id:string;name:string;snippet:string}[];message:{role:string;content:string}};
type ModelRoute = {alias:string;name:string;model:string};
type AgentPage = {items:Agent[];total:number;next_cursor:string;has_more:boolean};
const api = process.env.NEXT_PUBLIC_STUDIO_API ?? "";
const labels = {
  "zh-CN": {workspace:"Agent 工作台",agent:"Agent 详情",chat:"体验与调试",builder:"Agent 编排",knowledge:"知识库",tools:"工具与 MCP",evaluations:"评测",releases:"发布管理",create:"新建 Agent",publish:"发布版本",debug:"运行调试",evaluate:"运行评测",login:"登录已失效，请返回 Nexora Core 重新登录。"},
  "en-US": {workspace:"Agent Workspace",agent:"Agent Overview",chat:"Playground",builder:"Agent Builder",knowledge:"Knowledge",tools:"Tools & MCP",evaluations:"Evaluations",releases:"Releases",create:"New Agent",publish:"Publish",debug:"Run debug",evaluate:"Run evaluation",login:"Your session is missing or expired. Return to Nexora Core and sign in again."}
} as const;

function FlowNode({data}: NodeProps) {
  const kind=String(data.kind).toLowerCase();
  const icons:Record<string,React.ReactNode>={input:<MessageOutlined/>,knowledge:<DatabaseOutlined/>,rag:<DatabaseOutlined/>,model:<span className="node-ai">AI</span>,tool:<ToolOutlined/>,skill:<FunctionOutlined/>,plugin:<AppstoreOutlined/>,intent:<BranchesOutlined/>,output:<SendOutlined/>};
  return <div className={`node node-${kind}`}>
    {kind!=="input"&&<Handle id="input" className="node-port node-port-input" type="target" position={Position.Left} isConnectable title="输入端口"/>}
    <span className="node-icon">{icons[kind]??<CodeOutlined/>}</span><span className="node-copy"><small>{String(data.kind)}</small><strong>{String(data.label)}</strong>{Boolean(data.description)&&<em>{String(data.description)}</em>}</span><span className="node-status"><CheckOutlined/></span>
    {kind!=="output"&&<Handle id="output" className="node-port node-port-output" type="source" position={Position.Right} isConnectable title="输出端口"/>}
  </div>;
}
function AgentFinder({label,help,current,onSearch,onSelect,message}:{label:string;help:string;current?:Agent;onSearch:(query:string,status:string,cursor?:string)=>Promise<AgentPage>;onSelect:(agent:Agent)=>void;message:(zh:string,en:string)=>string}) {
  const [open,setOpen]=useState(false);
  const [query,setQuery]=useState("");
  const [status,setStatus]=useState("");
  const [items,setItems]=useState<Agent[]>([]);
  const [cursor,setCursor]=useState("");
  const [hasMore,setHasMore]=useState(false);
  const [loading,setLoading]=useState(false);
  const [total,setTotal]=useState(0);
  const load=useCallback(async(nextCursor="",append=false)=>{
    setLoading(true);
    try{
      const data=await onSearch(query,status,nextCursor);
      setItems(previous=>append?[...previous,...data.items]:data.items);
      setCursor(data.next_cursor??"");setHasMore(Boolean(data.has_more));setTotal(data.total??0);
    }finally{setLoading(false)}
  },[onSearch,query,status]);
  useEffect(()=>{
    if(!open)return;
    const timer=window.setTimeout(()=>void load(),query?300:0);
    return()=>window.clearTimeout(timer);
  },[open,query,status,load]);
  return <div className="agent-finder"><div className="finder-label"><strong>{label}</strong><small>{help}</small></div>
    <button className="finder-current" aria-label={label} aria-expanded={open} onClick={()=>setOpen(value=>!value)}><span>{current?<><b>{aname(current)}</b><small>{aid(current)} · {astatus(current)}</small></>:<><b>{message("查找 Agent","Find an agent")}</b><small>{message("按名称或 ID 搜索","Search by name or ID")}</small></>}</span><SearchOutlined/></button>
    {open&&<div className="finder-popover"><div className="finder-search"><SearchOutlined/><input autoFocus value={query} placeholder={message("搜索 Agent 名称、ID 或描述","Search name, ID, or description")} onChange={event=>setQuery(event.target.value)}/><select aria-label={message("状态筛选","Status filter")} value={status} onChange={event=>setStatus(event.target.value)}><option value="">{message("全部状态","All statuses")}</option><option value="draft">{message("草稿","Draft")}</option><option value="published">{message("已发布","Published")}</option></select></div>
      <div className="finder-meta"><span>{query?message(`找到 ${total} 个结果`,`${total} results`):message("最近更新的 Agent","Recently updated agents")}</span><small>{message("服务端检索 · 每次最多 20 条","Server search · up to 20 per page")}</small></div>
      <div className="finder-results">{items.map(agent=><button key={aid(agent)} className={current&&aid(current)===aid(agent)?"selected":""} onClick={()=>{onSelect(agent);setOpen(false)}}><span><strong>{aname(agent)}</strong><small>{agent.Description??agent.description??message("暂无描述","No description")}</small><code>{aid(agent)}</code></span><em>{astatus(agent)}</em></button>)}{!loading&&items.length===0&&<div className="finder-empty">{message("没有匹配的 Agent","No matching agents")}</div>}{loading&&<div className="finder-empty">{message("正在查询…","Searching…")}</div>}</div>
      {hasMore&&<button className="finder-more" disabled={loading} onClick={()=>void load(cursor,true)}>{message("加载更多","Load more")}</button>}
    </div>}
  </div>;
}
function ResourcePicker({label,help,kind,resources,selected,onChange}:{label:string;help:string;kind:string|string[];resources:Resource[];selected:string[];onChange:(value:string[])=>void}) {
  const matches=resources.filter(item=>Array.isArray(kind)?kind.includes(item.kind):item.kind===kind);
  const [open,setOpen]=useState(false);
  const [query,setQuery]=useState("");
  const selectedItems=matches.filter(item=>selected.includes(item.id));
  const filtered=matches.filter(item=>`${item.name} ${item.description}`.toLowerCase().includes(query.toLowerCase())).slice(0,20);
  return <div className="resource-picker"><label><span>{label}<small>{help}</small></span></label>
    <div className="selected-resources">{selectedItems.length===0?<span className="resource-none">未绑定资源</span>:selectedItems.map(item=><button key={item.id} onClick={()=>onChange(selected.filter(id=>id!==item.id))}>{item.name} ×</button>)}<button className="resource-add" onClick={()=>setOpen(x=>!x)}>{open?"收起":"添加资源"}</button></div>
    {open&&<div className="resource-popover"><input autoFocus placeholder="搜索名称或描述" value={query} onChange={e=>setQuery(e.target.value)}/>{filtered.length===0?<em className="resource-empty">没有匹配资源</em>:<div className="resource-options">{filtered.map(item=><label key={item.id} className={selected.includes(item.id)?"checked":""}><input type="checkbox" checked={selected.includes(item.id)} onChange={event=>onChange(event.target.checked?[...selected,item.id]:selected.filter(id=>id!==item.id))}/><span><strong>{item.name}</strong><small>{item.description}</small></span></label>)}</div>} {matches.length>20&&<small className="resource-count">共 {matches.length} 个资源，仅显示匹配结果前 20 个</small>}</div>}</div>;
}
function ResourceCenter({title,description,kind,resources,onCreate,message}:{title:string;description:string;kind:string|string[];resources:Resource[];onCreate:(name:string)=>Promise<void>;message:(zh:string,en:string)=>string}) {
  const [name,setName]=useState("");
  const kinds=Array.isArray(kind)?kind:[kind];
  const items=resources.filter(item=>kinds.includes(item.kind));
  const labels:Record<string,string>={knowledge_base:message("知识库","Knowledge base"),tool:message("工具","Tool"),mcp_server:"MCP Server",skill:"Skill",plugin:message("插件","Plugin"),model:message("模型","Model"),intent:message("意图路由","Intent router")};
  return <section className="panel view-panel resource-center"><div className="panelhead"><div><h3>{title}</h3><p className="muted">{description}</p></div><div className="resource-create"><input value={name} placeholder={message("新能力名称","New capability name")} onChange={e=>setName(e.target.value)}/><button className="primary" disabled={!name.trim()} onClick={async()=>{await onCreate(name.trim());setName("")}}><PlusOutlined/> {message("创建","Create")}</button></div></div><div className="capability-grid">{items.map(item=><article className="capability-card" key={item.id}><div><span className="tag">{labels[item.kind]??item.kind}</span><strong>{item.name}</strong><p>{item.description}</p></div><small>{item.status}</small></article>)}</div></section>;
}
function KnowledgeCenter({resources,onOpenCreate,message}:{resources:Resource[];onOpenCreate:()=>void;message:(zh:string,en:string)=>string}) {
  const [query,setQuery]=useState("");
  const items=resources.filter(item=>item.kind==="knowledge_base"&&`${item.name} ${item.description}`.toLowerCase().includes(query.toLowerCase()));
  const number=(value:unknown)=>typeof value==="number"?value:0;
  return <section className="panel view-panel resource-center knowledge-center">
    <div className="panelhead"><div><h3>{message("知识库","Knowledge bases")}</h3><p className="muted">{message("集中管理企业知识数据，完成数据导入、切分和向量索引后，再绑定到 Agent。","Import, chunk, and index enterprise knowledge here, then bind it to an agent.")}</p></div><button className="primary" onClick={onOpenCreate}><PlusOutlined/> {message("创建知识库","Create knowledge base")}</button></div>
    <div className="resource-toolbar"><label><SearchOutlined/><input aria-label={message("搜索知识库","Search knowledge bases")} value={query} placeholder={message("搜索知识库名称或描述","Search by name or description")} onChange={e=>setQuery(e.target.value)}/></label><span>{message(`共 ${items.length} 个知识库`,`${items.length} knowledge bases`)}</span></div>
    {items.length===0?<div className="knowledge-empty"><DatabaseOutlined/><strong>{query?message("没有匹配的知识库","No matching knowledge bases"):message("还没有知识库","No knowledge bases yet")}</strong><p>{query?message("请调整搜索词后重试。","Try a different search term."):message("创建知识库并导入文档、网页或文本，让 Agent 可以检索企业知识。","Create one and import documents, web pages, or text for agent retrieval.")}</p>{!query&&<button className="primary" onClick={onOpenCreate}><PlusOutlined/> {message("创建第一个知识库","Create your first knowledge base")}</button>}</div>:<div className="knowledge-table">
      <div className="knowledge-table-head"><span>{message("名称","Name")}</span><span>{message("数据源","Source")}</span><span>{message("文档","Documents")}</span><span>{message("嵌入模型","Embedding model")}</span><span>{message("状态","Status")}</span></div>
      {items.map(item=><article key={item.id}><span className="knowledge-name"><i><DatabaseOutlined/></i><span><strong>{item.name}</strong><small>{item.description||message("暂无描述","No description")}</small></span></span><span>{String(item.config?.source_type??message("文档","Documents"))}</span><span>{number(item.config?.documents)}</span><span>{String(item.config?.embedding??"bge-m3")}</span><span><b className="status-ready">● {item.status==="ready"?message("可用","Ready"):item.status}</b></span></article>)}
    </div>}
  </section>;
}
const aid=(a:Agent)=>a.ID??a.id??"";
const aname=(a:Agent)=>a.Name??a.name??"Untitled Agent";
const astatus=(a:Agent)=>a.Status??a.status??"draft";

export default function Studio() {
  const[locale,setLocale]=useState<keyof typeof labels>("zh-CN");
  const[view,setView]=useState<View>("workspace");
  const[agents,setAgents]=useState<Agent[]>([]);
  const[agentTotal,setAgentTotal]=useState(0);
  const[agentCursor,setAgentCursor]=useState("");
  const[agentsHaveMore,setAgentsHaveMore]=useState(false);
  const[workspaceQuery,setWorkspaceQuery]=useState("");
  const[workspaceStatus,setWorkspaceStatus]=useState("");
  const[agentsLoading,setAgentsLoading]=useState(false);
  const[sidebarCollapsed,setSidebarCollapsed]=useState(false);
  const workspacePageSize=6;
  const agentLoadMoreRef=useRef<HTMLDivElement|null>(null);
  const[selected,setSelected]=useState("");
  const[selectedAgent,setSelectedAgent]=useState<Agent|undefined>(undefined);
  const[notice,setNotice]=useState("");
  const[output,setOutput]=useState<unknown>(null);
  const[versions,setVersions]=useState<Version[]>([]);
  const[datasetCount,setDatasetCount]=useState(0);
  const[tools,setTools]=useState<string[]>(["Customer CRM API","Nexora Web Search"]);
  const[resources,setResources]=useState<Resource[]>([]);
  const[modelRoutes,setModelRoutes]=useState<ModelRoute[]>([]);
  const[menuOpen,setMenuOpen]=useState(false);
  const[embedded,setEmbedded]=useState(false);
  const[loggingOut,setLoggingOut]=useState(false);
  const[createOpen,setCreateOpen]=useState(false);
  const[agentName,setAgentName]=useState("");
  const[agentDescription,setAgentDescription]=useState("");
  const[agentTemplate,setAgentTemplate]=useState("customer-support");
  const[toolOpen,setToolOpen]=useState(false);
  const[toolName,setToolName]=useState("");
  const[knowledgeOpen,setKnowledgeOpen]=useState(false);
  const[knowledgeStep,setKnowledgeStep]=useState<1|2>(1);
  const[knowledgeDraft,setKnowledgeDraft]=useState<KnowledgeDraft>({name:"",description:"",sourceType:"file",sourceValue:"",files:[],embedding:"bge-m3",chunkSize:800,chunkOverlap:100});
  const[config,setConfig]=useState<{model:string;prompt:string;knowledge:string[];tools:string[];intents:string[];skills:string[];plugins:string[]}>({model:"",prompt:"",knowledge:[],tools:[],intents:[],skills:[],plugins:[]});
  const[chatInput,setChatInput]=useState("");
  const[chatMessages,setChatMessages]=useState<ChatMessage[]>([]);
  const[chatRunning,setChatRunning]=useState(false);
  const[traceOpen,setTraceOpen]=useState<string>("");
  const[builderSettingsOpen,setBuilderSettingsOpen]=useState(false);
  const[builderTestOpen,setBuilderTestOpen]=useState(false);
  const[connecting,setConnecting]=useState(false);
  const[connectionNotice,setConnectionNotice]=useState("");
  const[selectedNode,setSelectedNode]=useState("model");
  const[selectedEdge,setSelectedEdge]=useState("");
  const[saveState,setSaveState]=useState<"saved"|"saving"|"dirty">("saved");
  const t=labels[locale];
  const message=(zh:string,en:string)=>locale==="zh-CN"?zh:en;
  const current=selectedAgent??agents.find(a=>aid(a)===selected);
  useEffect(()=>{
    if(!current)return;
    setConfig({
      model:current.Model??current.model??"",
      prompt:current.SystemPrompt??current.system_prompt??"",
      knowledge:current.KnowledgeBase??current.knowledge_base??[],
      tools:current.Tools??current.tools??[],
      intents:current.Intents??current.intents??[],
      skills:current.Skills??current.skills??[],
      plugins:current.Plugins??current.plugins??[]
    });
  },[selected, current]);
  const nodeTypes=useMemo(()=>({nexora:FlowNode}),[]);
  const initialNodes=useMemo(()=>[
    {id:"start",type:"nexora",position:{x:80,y:220},data:{kind:"INPUT",label:message("用户输入","User input"),description:message("接收消息或任务","Receive request")}},
    {id:"intent",type:"nexora",position:{x:330,y:220},data:{kind:"INTENT",label:message("意图识别","Intent router"),description:message("判断请求类型","Classify request")}},
    {id:"knowledge",type:"nexora",position:{x:590,y:90},data:{kind:"KNOWLEDGE",label:message("知识检索","Knowledge retrieval"),description:message("检索已绑定知识库","Search bound knowledge")}},
    {id:"model",type:"nexora",position:{x:590,y:340},data:{kind:"MODEL",label:modelRoutes.find(route=>route.alias===config.model)?.model||message("选择 MaaS 模型","Choose MaaS model"),description:message("通过星模统一路由推理","Reason through MaaS routing")}},
    {id:"output",type:"nexora",position:{x:870,y:220},data:{kind:"OUTPUT",label:message("回复用户","Reply"),description:message("输出最终结果","Return result")}}
  ],[locale,modelRoutes,config.model]);
  const initialEdges=useMemo<Edge[]>(()=>[
    {id:"a",source:"start",target:"intent",animated:true},{id:"b",source:"intent",target:"knowledge"},{id:"c",source:"intent",target:"model"},
    {id:"d",source:"knowledge",target:"model",animated:true},{id:"e",source:"model",target:"output",animated:true}
  ],[]);
  const[nodes,setNodes,onNodesChange]=useNodesState(initialNodes);
  const[edges,setEdges,onEdgesChange]=useEdgesState(initialEdges);
  useEffect(()=>{setNodes(initialNodes);setEdges(initialEdges)},[initialNodes,initialEdges,setNodes,setEdges]);
  const auth=useCallback(()=>({"Content-Type":"application/json","Authorization":`Bearer ${localStorage.getItem("nexora_token")??""}`}),[]);
  const suiteURL=(port:number,path="/")=>typeof window==="undefined"?"":`${window.location.protocol}//${window.location.hostname}:${port}${path}`;
  const productURL=(port:number)=>{
    if(typeof window==="undefined")return "#";
    const url=new URL(suiteURL(port));
    const token=localStorage.getItem("nexora_token");
    if(token)url.searchParams.set("token",token);
    url.searchParams.set("locale",locale);
    return url.toString();
  };

  async function request(path:string, init?:RequestInit) {
    const res=await fetch(`${api}${path}`,{...init,headers:{...auth(),...(init?.headers??{})}});
    const data=res.status===204?{}:await res.json().catch(()=>({}));
    if(res.status===401){
      localStorage.removeItem("nexora_token");
      window.location.replace(`${suiteURL(3000)}?reason=session_expired`);
      throw new Error(t.login);
    }
    if(!res.ok) throw new Error(data?.error?.message??`Request failed (${res.status})`);
    return data;
  }
  const searchAgents=useCallback(async(query="",status="",cursor="",limit=20):Promise<AgentPage>=>{
    const params=new URLSearchParams({limit:String(limit)});
    if(query.trim())params.set("q",query.trim());
    if(status)params.set("status",status);
    if(cursor)params.set("cursor",cursor);
    return request(`/api/v1/agents?${params}`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  async function loadAgents(cursor="",append=false,query=workspaceQuery,status=workspaceStatus){
    if(agentsLoading)return;
    setAgentsLoading(true);
    try {
      const data:AgentPage=await searchAgents(query,status,cursor,workspacePageSize);
      const items=data.items??[];
      setAgents(previous=>{
        if(!append)return items;
        return Array.from(new Map([...previous,...items].map(item=>[aid(item),item])).values());
      });
      setAgentTotal(data.total??0);
      setAgentCursor(data.next_cursor??"");
      setAgentsHaveMore(Boolean(data.has_more));
    } catch(e){setNotice(e instanceof Error?e.message:t.login)}
    finally{setAgentsLoading(false)}
  }
  function chooseAgent(agent:Agent){
    setAgents(previous=>[agent,...previous.filter(item=>aid(item)!==aid(agent))]);
    setSelected(aid(agent));
    setSelectedAgent(agent);
    setChatMessages([]);
    setNotice("");
  }
  const isAgentReady=(agent?:Agent)=>Boolean((agent?.Model??agent?.model)?.trim()&&(agent?.SystemPrompt??agent?.system_prompt)?.trim());
  const enterAgent=(agent:Agent)=>{
    chooseAgent(agent);
    if(isAgentReady(agent)){
      setView("chat");
      return;
    }
    setBuilderSettingsOpen(true);
    setSelectedNode("model");
    setView("builder");
    setNotice(message("完成模型和系统提示词配置后，即可开始对话。","Configure a model and system prompt to start chatting."));
  };
  async function loadResources(){
    try{const data=await request("/api/v1/resources?limit=50");setResources(data.items??[])}catch(e){setNotice(e instanceof Error?e.message:t.login)}
  }
  async function loadModelRoutes(){
    try{const data=await request("/api/v1/model-routes");setModelRoutes(data.items??[])}
    catch(e){setNotice(e instanceof Error?e.message:"Error")}
  }
  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    if(params.get("logout")==="1"){
      localStorage.removeItem("nexora_token");localStorage.removeItem("nexora_locale");
      if(params.get("embedded")==="1")setEmbedded(true);
      else window.location.replace(suiteURL(3000,"/?logout=1"));
      return;
    }
    const token=params.get("token");
    const nextLocale=params.get("locale");
    if(token){localStorage.setItem("nexora_token",token);params.delete("token");window.history.replaceState({}, "", `${window.location.pathname}${params.size?`?${params}`:""}`)}
    if(nextLocale==="zh-CN"||nextLocale==="en-US")setLocale(nextLocale);
    if(!token&&!localStorage.getItem("nexora_token")){
      window.location.replace(`${suiteURL(3000)}?reason=login_required`);
      return;
    }
    void loadResources();
    void loadModelRoutes();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  useEffect(()=>{
    if(!localStorage.getItem("nexora_token"))return;
    const timer=window.setTimeout(()=>void loadAgents("",false,workspaceQuery,workspaceStatus),workspaceQuery?300:0);
    return()=>window.clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[workspaceQuery,workspaceStatus]);
  useEffect(()=>{
    const target=agentLoadMoreRef.current;
    if(view!=="workspace"||!target||!agentsHaveMore||agentsLoading)return;
    const root=document.querySelector(".main");
    const observer=new IntersectionObserver(entries=>{
      if(entries[0]?.isIntersecting)void loadAgents(agentCursor,true,workspaceQuery,workspaceStatus);
    },{root,rootMargin:"0px",threshold:.5});
    observer.observe(target);
    return()=>observer.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[view,agentsHaveMore,agentsLoading,agentCursor,workspaceQuery,workspaceStatus]);
  function logout(){
    localStorage.removeItem("nexora_token");localStorage.removeItem("nexora_locale");setMenuOpen(false);setLoggingOut(true);
    window.setTimeout(()=>window.location.replace(suiteURL(3000,"/?logout=1")),500);
  }
  function openCreateAgent(){
    setAgentName("");
    setAgentDescription("");
    setAgentTemplate("customer-support");
    setCreateOpen(true);
  }
  function openCreateKnowledge(){
    setKnowledgeStep(1);
    setKnowledgeDraft({name:"",description:"",sourceType:"file",sourceValue:"",files:[],embedding:"bge-m3",chunkSize:800,chunkOverlap:100});
    setKnowledgeOpen(true);
  }
  async function createKnowledge(){
    if(!knowledgeDraft.name.trim())return;
    const sources=knowledgeDraft.sourceType==="file"?knowledgeDraft.files.map(file=>file.name):(knowledgeDraft.sourceValue.trim()?[knowledgeDraft.sourceValue.trim()]:[]);
    try{
      const created=await request("/api/v1/resources",{method:"POST",body:JSON.stringify({
        kind:"knowledge_base",
        name:knowledgeDraft.name.trim(),
        description:knowledgeDraft.description.trim(),
        config:{source_type:knowledgeDraft.sourceType,sources,documents:sources.length,embedding:knowledgeDraft.embedding,chunk_size:knowledgeDraft.chunkSize,chunk_overlap:knowledgeDraft.chunkOverlap}
      })});
      if(knowledgeDraft.sourceType==="file"&&knowledgeDraft.files.length>0){
        const form=new FormData();
        knowledgeDraft.files.forEach(file=>form.append("files",file));
        const upload=await fetch(`${api}/api/v1/resources/${created.id}/documents`,{method:"POST",headers:{"Authorization":`Bearer ${localStorage.getItem("nexora_token")??""}`},body:form});
        if(!upload.ok){const detail=await upload.json().catch(()=>({}));throw new Error(detail?.error?.message??message("文档上传失败。","Document upload failed."))}
      }
      setKnowledgeOpen(false);
      await loadResources();
      setNotice(message("知识库已创建并完成基础索引配置，可在 Agent 编排中绑定。","Knowledge base created with its indexing configuration. It is ready to bind in the agent builder."));
    }catch(e){setNotice(e instanceof Error?e.message:"Error")}
  }
  async function createAgent(){
    const name=agentName.trim();
    if(!name){setNotice(message("请输入 Agent 名称。","Enter an agent name."));return}
    try{
      const templateLabel={blank:"Blank","customer-support":"Customer Support",rag:"Knowledge Q&A"}[agentTemplate]??agentTemplate;
      const description=agentDescription.trim()||message(`基于 ${templateLabel} 模板创建`,`Created from the ${templateLabel} template`);
      const data=await request("/api/v1/agents",{method:"POST",body:JSON.stringify({name,description})});
      setCreateOpen(false);chooseAgent(data);setAgentTotal(total=>total+1);setBuilderSettingsOpen(true);setSelectedNode("model");setView("builder");setNotice(message("Agent 已创建。请先选择模型并填写系统提示词。","Agent created. Choose a model and add a system prompt first."));
    }catch(e){setNotice(e instanceof Error?e.message:"Error")}
  }
  async function run(action:"debug"|"evaluate"|"publish"){
    if(!selected){setNotice(message("请先创建或选择 Agent。","Create or select an agent first."));return}
    try{
      const init:RequestInit={method:"POST"};
      if(action==="debug")init.body=JSON.stringify({input:message("请总结客户最近的问题","Summarize the customer's recent issue")});
      const data=await request(`/api/v1/agents/${selected}/${action}`,init);
      setOutput(data);setNotice(action==="publish"?message("版本已发布；如已购买 Control，已自动同步。","Version published and synced to Control when entitled."):message("操作成功。","Completed successfully."));
      if(action==="publish"){setAgents(items=>items.map(item=>aid(item)===selected?{...item,Status:"published",status:"published"}:item));setSelectedAgent(agent=>agent?{...agent,Status:"published",status:"published"}:agent);await loadVersions();setView("releases")}
    }catch(e){setNotice(e instanceof Error?e.message:"Error")}
  }
  async function saveConfig(){
    if(!selected)return false;
    setSaveState("saving");
    try{
      const payload={model:config.model,system_prompt:config.prompt,knowledge_base:config.knowledge,tools:config.tools,intents:config.intents,skills:config.skills,plugins:config.plugins};
      const data=await request(`/api/v1/agents/${selected}`,{method:"PUT",body:JSON.stringify(payload)});
      setAgents(items=>items.map(item=>aid(item)===selected?data:item));
      setSelectedAgent(data);
      setSaveState("saved");
      setNotice(message("配置已保存，调试和发布将使用这些设置。","Configuration saved. Debug and publish will use these settings."));
      return true;
    }catch(e){setSaveState("dirty");setNotice(e instanceof Error?e.message:"Error");return false}
  }
  const addBuilderNode=(kind:string,label:string)=>{
    const id=`${kind.toLowerCase()}-${Date.now()}`;
    setNodes(items=>[...items,{id,type:"nexora",position:{x:390+items.length*24,y:130+(items.length%4)*120},data:{kind,label,description:message("点击配置此节点","Select to configure")}}]);
    setSelectedNode(id);setSaveState("dirty");
  };
  const removeSelectedNode=()=>{
    if(["start","output"].includes(selectedNode))return;
    setNodes(items=>items.filter(item=>item.id!==selectedNode));
    setEdges(items=>items.filter(item=>item.source!==selectedNode&&item.target!==selectedNode));
    setSelectedNode("");setSaveState("dirty");
  };
  const selectEdge=(edge:Edge)=>{
    setSelectedEdge(edge.id);
    setSelectedNode("");
    setEdges(items=>items.map(item=>({...item,selected:item.id===edge.id})));
    setConnectionNotice(message("已选择连线，可删除或点击画布取消选择","Connection selected. Delete it or click the canvas to clear selection."));
  };
  const clearCanvasSelection=()=>{
    setSelectedEdge("");
    setEdges(items=>items.map(item=>item.selected?{...item,selected:false}:item));
  };
  const removeSelectedEdge=()=>{
    if(!selectedEdge)return;
    setEdges(items=>items.filter(item=>item.id!==selectedEdge));
    setSelectedEdge("");
    setSaveState("dirty");
    setConnectionNotice(message("连线已删除，保存后生效","Connection removed. Save to apply."));
  };
  const connectNodes=useCallback((connection:Connection)=>{
    if(!connection.source||!connection.target||connection.source===connection.target){
      setConnectionNotice(message("不能连接节点自身","A node cannot connect to itself"));return;
    }
    setEdges(items=>{
      const duplicate=items.some(item=>item.source===connection.source&&item.target===connection.target&&item.sourceHandle===connection.sourceHandle&&item.targetHandle===connection.targetHandle);
      if(duplicate){setConnectionNotice(message("这两个端口已经连接","These ports are already connected"));return items}
      const id=`edge-${connection.source}-${connection.target}-${Date.now()}`;
      setSelectedEdge(id);
      setConnectionNotice(message("连线已创建并选中，保存后生效","Connection created and selected. Save to apply."));
      const edge:Edge={...connection,id,animated:false,type:"smoothstep",selected:true};
      return addEdge(edge,items.map(item=>({...item,selected:false})));
    });
    setSaveState("dirty");
  },[setEdges,locale]);
  async function sendChat(){
    const input=chatInput.trim();
    if(!selected||!input||chatRunning)return;
    const userMessage:ChatMessage={id:`user-${Date.now()}`,role:"user",content:input};
    const next=[...chatMessages,userMessage];
    setChatMessages(next);setChatInput("");setChatRunning(true);
    const assistantID=`assistant-${Date.now()}`;
    setChatMessages(items=>[...items,{id:assistantID,role:"assistant",content:""}]);
    try{
      const res=await fetch(`${api}/api/v1/agents/${selected}/chat/stream`,{method:"POST",headers:auth(),body:JSON.stringify({input,messages:next.map(item=>({role:item.role,content:item.content}))})});
      if(!res.ok){const detail=await res.json().catch(()=>({}));throw new Error(detail?.error?.message??`Request failed (${res.status})`)}
      if(!res.body)throw new Error(message("浏览器未收到流式响应。","No streaming response body."));
      const reader=res.body.getReader();
      const decoder=new TextDecoder();
      let buffer="";let streamed="";let trace:ChatTrace|undefined;
      const consume=(block:string)=>{
        const event=block.split("\n").find(line=>line.startsWith("event:"))?.slice(6).trim();
        const raw=block.split("\n").filter(line=>line.startsWith("data:")).map(line=>line.slice(5).trim()).join("");
        if(!raw)return;
        const data=JSON.parse(raw);
        if(event==="delta"&&data.content){
          streamed+=data.content;
          setChatMessages(items=>items.map(item=>item.id===assistantID?{...item,content:streamed}:item));
        }
        if(event==="done"){trace=data;setChatMessages(items=>items.map(item=>item.id===assistantID?{...item,content:data.message?.content??streamed,trace:data}:item));setTraceOpen(data.trace_id)}
        if(event==="error")throw new Error(data.message??"Streaming failed");
      };
      while(true){
        const{done,value}=await reader.read();
        buffer+=decoder.decode(value??new Uint8Array(),{stream:!done});
        const blocks=buffer.split("\n\n");buffer=blocks.pop()??"";
        blocks.filter(Boolean).forEach(consume);
        if(done)break;
      }
      if(buffer.trim())consume(buffer);
      if(!streamed&&!trace)throw new Error(message("模型没有返回内容。","The model returned no content."));
    }catch(e){setChatMessages(items=>[...items,{id:`error-${Date.now()}`,role:"assistant",content:e instanceof Error?e.message:"Error"}])}
    finally{setChatMessages(items=>items.filter(item=>item.id!==assistantID||item.content||item.trace));setChatRunning(false)}
  }
  async function loadVersions(){
    if(!selected){setVersions([]);return}
    try{const data=await request(`/api/v1/agents/${selected}/versions`);setVersions(data.items??[])}catch(e){setNotice(e instanceof Error?e.message:"Error")}
  }
  useEffect(()=>{if(view==="releases")void loadVersions()},[view,selected]);
  const openAgent=(agent:Agent)=>enterAgent(agent);
  const requireAgent=(target:View)=>{
    if(current){setView(target);return}
    setView("workspace");setNotice(message("请先从 Agent 项目列表或查找器中明确选择一个 Agent。","Choose an agent explicitly from the project list or finder first."));
  };
  const AgentContext=({purpose}:{purpose:"builder"|"evaluation"|"release"})=>{
    const labels={
      builder:[message("正在编排的 Agent","Agent being built"),message("画布、调试输入与节点配置都属于该 Agent。","The canvas, debug input, and node settings belong to this agent.")],
      evaluation:[message("评测对象","Evaluation target"),message("评分将针对该 Agent 当前的工作流与配置运行。","Scores run against this agent's current workflow and configuration.")],
      release:[message("发布对象","Release target"),message("发布会为该 Agent 生成不可变版本并同步到 Control。","Publishing creates an immutable version for this agent and syncs it to Control.")]
    } as const;
    const[label,help]=labels[purpose];
    return <div className="agent-context"><AgentFinder label={label} help={help} current={current} onSearch={searchAgents} onSelect={chooseAgent} message={message}/>{current&&<em>{astatus(current)}</em>}</div>
  };
  const EmptyAgent=({purpose}:{purpose:string})=><div className="agent-empty"><span><FunctionOutlined/></span><strong>{message(`还没有可${purpose}的 Agent`,`No agent is available`)}</strong><p>{message("先创建 Agent 项目，创建完成后会直接进入可视化编排器。","Create an agent project first. You will continue directly in the visual builder.")}</p><button className="primary" onClick={openCreateAgent}><PlusOutlined/> {t.create}</button></div>;
  const agentScoped=(["agent","chat","builder","evaluations","releases"] as View[]).includes(view)&&Boolean(current);
  if(embedded)return <div className="signed-out">{message("已退出 Studio","Studio signed out")}</div>;
  return <div className={`app view-${view}${sidebarCollapsed?" sidebar-collapsed":""}`}>
    {loggingOut&&<div className="logout-frames" aria-hidden="true"><iframe src={suiteURL(3002,"/?logout=1&embedded=1")} title="Control logout"/></div>}
    <aside className="side">
      <div className="side-brand"><button className="side-collapse" aria-label={sidebarCollapsed?message("展开侧边栏","Expand sidebar"):message("收起侧边栏","Collapse sidebar")} onClick={()=>setSidebarCollapsed(value=>!value)}>{sidebarCollapsed?<MenuUnfoldOutlined/>:<MenuFoldOutlined/>}</button><span className="side-logo">N</span><span className="side-brand-copy"><strong>Nexora Studio</strong><small>{message("智能体开发平台","Agent Development")}</small></span></div>
      <div className="side-space"><span><AppstoreOutlined/></span><span><strong>{message("默认项目空间","Default workspace")}</strong><small>Nexora Demo</small></span></div>
      <nav className="nav side-nav">
        {agentScoped&&current?<section className="side-agent-context side-agent-mode"><small>{message("Agent 项目导航","AGENT PROJECT")}</small>
          <button title={message("返回全部 Agent","Back to all agents")} className="agent-back-button" onClick={()=>setView("workspace")}><AppstoreOutlined/><span>{message("返回全部 Agent","Back to all agents")}</span></button>
          <button title={message(`与 ${aname(current)} 对话`,`Chat with ${aname(current)}`)} className={view==="chat"?"active agent-context-button":"agent-context-button"} onClick={()=>setView("chat")}><span className="side-agent-avatar">{aname(current).trim().slice(0,1).toUpperCase()||"N"}</span><span className="side-agent-name"><b>{aname(current)}</b><i>{astatus(current)==="published"?message("已发布","Published"):message("开发中","In development")}</i></span></button>
          <div className="agent-nav-divider"/>
          <button title={t.chat} className={view==="chat"?"active":""} onClick={()=>setView("chat")}><MessageOutlined/><span>{t.chat}</span></button>
          <button title={t.builder} className={view==="builder"?"active":""} onClick={()=>setView("builder")}><BranchesOutlined/><span>{t.builder}</span></button>
          <button title={t.evaluations} className={view==="evaluations"?"active":""} onClick={()=>setView("evaluations")}><ExperimentOutlined/><span>{t.evaluations}</span></button>
          <button title={t.releases} className={view==="releases"?"active":""} onClick={()=>setView("releases")}><RocketOutlined/><span>{t.releases}</span></button>
        </section>:<>
          <section><small>{message("智能体开发","AGENT DEVELOPMENT")}</small>
            <button title={t.workspace} className={view==="workspace"?"active":""} onClick={()=>setView("workspace")}><AppstoreOutlined/><span>{message("Agent 项目","Agent projects")}</span></button>
          </section>
          <section><small>{message("资源中心","RESOURCE CENTER")}</small>
            <button title={t.knowledge} className={view==="knowledge"?"active":""} onClick={()=>setView("knowledge")}><DatabaseOutlined/><span>{t.knowledge}</span></button>
            <button title={t.tools} className={view==="tools"?"active":""} onClick={()=>setView("tools")}><ToolOutlined/><span>{t.tools}</span></button>
          </section>
        </>}
      </nav>
      <div className="side-bottom">
        <div className="side-product-links"><a title={message("返回统一门户","Back to Core")} href={suiteURL(3000)}><HomeOutlined/><span>{message("统一门户","Core portal")}</span></a><a title={message("切换到治理平台","Switch to Control")} href={productURL(3002)}><RadarChartOutlined/><span>Nexora Control</span></a></div>
        <div className="side-user"><span>NA</span><span><strong>Nexora Admin</strong><small>admin@nexora.local</small></span><button title={message("退出全部产品","Sign out")} aria-label={message("退出全部产品","Sign out")} onClick={logout}><LogoutOutlined/></button></div>
      </div>
    </aside>
    <main className="main">
      <header className="header"><div>{view!=="workspace"&&<><small className="muted">NEXORA / STUDIO</small><h1>{t[view]}</h1></>}</div><div className="actions">
        <button className="ghost" onClick={()=>setLocale(locale==="zh-CN"?"en-US":"zh-CN")}>{locale==="zh-CN"?"EN":"中文"}</button>
        <div className="user-menu"><button className="avatar-button" aria-label={message("用户菜单","User menu")} onClick={()=>setMenuOpen(x=>!x)}><UserOutlined/> <span>NA</span></button>{menuOpen&&<div className="menu-popover">
          <div className="menu-profile"><strong>Nexora Admin</strong><small>admin@nexora.local</small></div>
          <a href={suiteURL(3000)}><HomeOutlined/> {message("返回统一门户","Back to Core portal")}</a>
          <a href={productURL(3002)}><RadarChartOutlined/> {message("切换到 Control","Switch to Control")}</a>
          <button onClick={logout}><LogoutOutlined/> {message("退出全部产品","Sign out of all products")}</button>
        </div>}</div>
      </div></header>
      {notice&&<div className="notice banner">{notice}</div>}
      {view==="workspace"&&<section className="agent-center">
        <header className="agent-center-hero"><div><h2>{message("Agent 项目","Agent projects")}</h2><span>{message(`${agentTotal} 个 Agent`,`${agentTotal} agents`)}</span></div><button className="primary agent-create" onClick={openCreateAgent}><PlusOutlined/> {t.create}</button></header>
        <section className="agent-catalog">
          <div className="agent-catalog-toolbar"><label className="agent-search"><SearchOutlined/><input aria-label={message("搜索 Agent","Search agents")} value={workspaceQuery} placeholder={message("按名称、描述或 Agent ID 搜索","Search by name, description, or Agent ID")} onChange={event=>setWorkspaceQuery(event.target.value)}/>{workspaceQuery&&<button aria-label={message("清空搜索","Clear search")} onClick={()=>setWorkspaceQuery("")}>×</button>}</label><select aria-label={message("状态筛选","Status filter")} value={workspaceStatus} onChange={event=>setWorkspaceStatus(event.target.value)}><option value="">{message("全部状态","All statuses")}</option><option value="draft">{message("草稿","Draft")}</option><option value="published">{message("已发布","Published")}</option></select><span>{agentsLoading?message("正在查询…","Searching…"):message(`${agentTotal} 个结果`,`${agentTotal} results`)}</span></div>
          {agentsLoading&&agents.length===0?<div className="agent-catalog-empty"><span className="catalog-loader"/><strong>{message("正在加载 Agent","Loading agents")}</strong></div>:agents.length===0?<div className="agent-catalog-empty"><span><FunctionOutlined/></span><strong>{workspaceQuery||workspaceStatus?message("没有匹配的 Agent","No matching agents"):message("创建你的第一个 Agent","Create your first agent")}</strong><p>{workspaceQuery||workspaceStatus?message("尝试调整搜索词或状态筛选。","Try another search term or status filter."):message("从模板或空白工作流开始，配置模型、知识库、Skill、插件与工具。","Start from a template or blank workflow, then configure models, knowledge, skills, plugins, and tools.")}</p>{!workspaceQuery&&!workspaceStatus&&<button className="primary" onClick={openCreateAgent}><PlusOutlined/> {t.create}</button>}</div>:<div className="agent-project-grid">{agents.map(a=>{
            const capabilityCount=(a.KnowledgeBase??a.knowledge_base??[]).length+(a.Tools??a.tools??[]).length+(a.Skills??a.skills??[]).length+(a.Plugins??a.plugins??[]).length;
            const status=astatus(a);
            const ready=isAgentReady(a);
            return <article className="agent-project-card" key={aid(a)}><button className="agent-card-open" aria-label={ready?message(`与 ${aname(a)} 对话`,`Chat with ${aname(a)}`):message(`配置 ${aname(a)}`,`Configure ${aname(a)}`)} onClick={()=>openAgent(a)}>
              <span className="agent-card-head"><i>{aname(a).trim().slice(0,1).toUpperCase()||"N"}</i><span><strong>{aname(a)}</strong><code>{aid(a)}</code></span><em className={`agent-status status-${status}`}>{status==="published"?message("已发布","Published"):message("草稿","Draft")}</em></span>
              <p>{a.Description??a.description??message("暂无描述。打开项目补充定位与使用说明。","No description yet. Open the project to define its purpose.")}</p>
              <dl><div><dt>{message("模型","Model")}</dt><dd>{a.Model??a.model??message("待配置","Not configured")}</dd></div><div><dt>{message("已绑定能力","Capabilities")}</dt><dd>{capabilityCount}</dd></div><div><dt>{message("负责人","Owner")}</dt><dd>{a.OwnerID??a.owner_id??"Nexora Admin"}</dd></div></dl>
            </button><footer><button className="open-project" onClick={()=>openAgent(a)}>{ready?<><MessageOutlined/> {message("开始对话","Start chat")}</>:<><SettingOutlined/> {message("完成配置","Finish setup")}</>} →</button><button onClick={()=>{chooseAgent(a);setView("builder")}}><FunctionOutlined/> {message("编排配置","Build & configure")}</button></footer></article>;
          })}</div>}
          {agentTotal>0&&<div ref={agentLoadMoreRef} className="agent-scroll-status" aria-live="polite">{agentsLoading?<><span className="catalog-loader"/><b>{message("正在加载更多 Agent…","Loading more agents…")}</b></>:agentsHaveMore?<><span>↓</span><b>{message("继续向下滚动加载更多","Keep scrolling to load more")}</b></>:<><CheckOutlined/><b>{message(`已加载全部 ${agentTotal} 个 Agent`,`All ${agentTotal} agents loaded`)}</b></>}</div>}
        </section>
      </section>}
      {view==="agent"&&(current?<section className="agent-overview">
        <button className="agent-overview-back" onClick={()=>setView("workspace")}>← {message("全部 Agent","All agents")}</button>
        <header className="agent-overview-hero">
          <div className="agent-overview-title"><span className="agent-project-icon">{aname(current).trim().slice(0,1).toUpperCase()||"N"}</span><div><span className="agent-overview-state"><i/>{astatus(current)==="published"?message("已发布","Published"):message("草稿 · 开发中","Draft · In progress")}</span><h2>{aname(current)}</h2><p>{current.Description??current.description??message("暂无描述","No description")}</p></div></div>
          <div className="agent-overview-actions"><button className="ghost" onClick={()=>requireAgent("chat")}><MessageOutlined/>{message("体验 Agent","Test agent")}</button><button className="primary" onClick={()=>requireAgent("builder")}><FunctionOutlined/>{message("继续编排","Continue building")} <span>→</span></button></div>
        </header>
        <dl className="agent-overview-meta"><div><dt>Agent ID</dt><dd><code>{aid(current)}</code></dd></div><div><dt>{message("负责人","Owner")}</dt><dd>{current.OwnerID??current.owner_id??"Nexora Admin"}</dd></div><div><dt>{message("当前模型","Current model")}</dt><dd>{current.Model??current.model??message("尚未配置","Not configured")}</dd></div><div><dt>{message("已绑定能力","Capabilities")}</dt><dd>{(current.KnowledgeBase??current.knowledge_base??[]).length+(current.Tools??current.tools??[]).length+(current.Skills??current.skills??[]).length+(current.Plugins??current.plugins??[]).length}</dd></div></dl>
        <div className="agent-overview-workspace">
          <section className="agent-current-task">
            <span className="agent-section-kicker">{message("当前任务 · 第 2 / 5 步","CURRENT TASK · STEP 2 OF 5")}</span>
            <h3>{message("完成 Agent 的编排与配置","Build the agent before testing")}</h3>
            <p>{message("先确定 Agent 如何思考、使用哪些知识与能力。配置完成后，再用真实问题验证执行效果。","Define how the agent reasons and which knowledge and capabilities it can use. Then validate it with real tasks.")}</p>
            <div className="agent-configuration-list">
              <button onClick={()=>requireAgent("builder")}><span className={(current.Model??current.model)?"ready":""}>{(current.Model??current.model)?<CheckOutlined/>:"1"}</span><span><strong>{message("模型与生成参数","Model & generation")}</strong><small>{current.Model??current.model??message("选择模型并设置温度、最大输出等参数","Choose a model and tune its generation settings")}</small></span><em>{(current.Model??current.model)?message("已配置","Ready"):message("去配置","Configure")} →</em></button>
              <button onClick={()=>requireAgent("builder")}><span className={(current.SystemPrompt??current.system_prompt)?"ready":""}>{(current.SystemPrompt??current.system_prompt)?<CheckOutlined/>:"2"}</span><span><strong>{message("角色与系统提示词","Instructions & prompt")}</strong><small>{(current.SystemPrompt??current.system_prompt)?message("Agent 的角色和行为边界已设置","Role and behavior are defined"):message("定义角色、目标、规则与回答方式","Define the role, goals, rules, and response style")}</small></span><em>{(current.SystemPrompt??current.system_prompt)?message("已配置","Ready"):message("去配置","Configure")} →</em></button>
              <button onClick={()=>requireAgent("builder")}><span>{(current.KnowledgeBase??current.knowledge_base??[]).length||"3"}</span><span><strong>{message("知识与 RAG","Knowledge & RAG")}</strong><small>{message("绑定知识库并设置检索策略","Bind knowledge bases and configure retrieval")}</small></span><em>{(current.KnowledgeBase??current.knowledge_base??[]).length?message("查看","Review"):message("添加","Add")} →</em></button>
              <button onClick={()=>requireAgent("builder")}><span>{(current.Tools??current.tools??[]).length+(current.Skills??current.skills??[]).length+(current.Plugins??current.plugins??[]).length||"4"}</span><span><strong>{message("工具、MCP、Skill 与插件","Tools, MCP, skills & plugins")}</strong><small>{message("赋予 Agent 执行任务所需的外部能力","Give the agent the capabilities it needs to act")}</small></span><em>{(current.Tools??current.tools??[]).length+(current.Skills??current.skills??[]).length+(current.Plugins??current.plugins??[]).length?message("查看","Review"):message("添加","Add")} →</em></button>
            </div>
            <button className="agent-task-primary" onClick={()=>requireAgent("builder")}>{message("打开可视化编排器","Open visual builder")} <span>→</span></button>
          </section>
          <aside className="agent-progress-panel">
            <header><span><small>{message("开发进度","DEVELOPMENT PROGRESS")}</small><strong>{astatus(current)==="published"?"100%":"20%"}</strong></span><i><b style={{width:astatus(current)==="published"?"100%":"20%"}}/></i></header>
            <nav>
              <button className="done" disabled><b><CheckOutlined/></b><span><strong>{message("创建项目","Create")}</strong><small>{message("身份与负责人已就绪","Identity is ready")}</small></span></button>
              <button className="current" onClick={()=>requireAgent("builder")}><b>2</b><span><strong>{message("编排配置","Build")}</strong><small>{message("正在进行","In progress")}</small></span></button>
              <button onClick={()=>requireAgent("chat")}><b>3</b><span><strong>{message("体验调试","Test")}</strong><small>{message("用真实任务验证","Validate with real tasks")}</small></span></button>
              <button onClick={()=>requireAgent("evaluations")}><b>4</b><span><strong>{message("运行评测","Evaluate")}</strong><small>{message("质量与安全门禁","Quality and safety gates")}</small></span></button>
              <button className={astatus(current)==="published"?"done":""} onClick={()=>requireAgent("releases")}><b>{astatus(current)==="published"?<CheckOutlined/>:"5"}</b><span><strong>{message("发布治理","Release")}</strong><small>{message("发布后同步到 Control","Sync to Control")}</small></span></button>
            </nav>
            <footer><strong>{message("下一里程碑","NEXT MILESTONE")}</strong><span>{message("完成配置后，使用体验与调试运行第一个真实任务。","Run the first real task in Playground after configuration.")}</span><button onClick={()=>requireAgent("chat")}>{message("前往体验与调试","Go to Playground")} →</button></footer>
          </aside>
        </div>
      </section>:<section className="panel view-panel"><EmptyAgent purpose={message("管理","manage")}/></section>)}
      {(["chat","evaluations","releases"] as View[]).includes(view)&&current&&<div className="agent-scope-bar"><button onClick={()=>setView("workspace")}>← {message("全部 Agent","All agents")}</button><span><small>{message("当前 Agent","Current agent")}</small><strong>{aname(current)}</strong><code>{aid(current)}</code></span><nav aria-label={message("Agent 功能","Agent sections")}><button className={view==="chat"?"active":""} onClick={()=>setView("chat")}>{message("问答体验","Chat")}</button><button className={view==="builder"?"active":""} onClick={()=>setView("builder")}>{message("编排配置","Build")}</button><button className={view==="evaluations"?"active":""} onClick={()=>setView("evaluations")}>{message("评测","Evaluate")}</button><button className={view==="releases"?"active":""} onClick={()=>setView("releases")}>{message("发布","Release")}</button></nav><em>{astatus(current)}</em></div>}
      {view==="chat"&&(!current?<section className="panel view-panel"><EmptyAgent purpose={message("体验","test")}/></section>:<section className="playground">
        <aside className="playground-agents"><AgentFinder label={message("切换 Agent","Switch agent")} help={message("按名称或 ID 从服务端查找","Search server-side by name or ID")} current={current} onSearch={searchAgents} onSelect={agent=>{chooseAgent(agent);if(!isAgentReady(agent)){setBuilderSettingsOpen(true);setView("builder")}}} message={message}/><div className="agent-capabilities"><strong>{message("运行能力","Runtime capabilities")}</strong><span><DatabaseOutlined/>{message("知识库","Knowledge")} <b>{current?.KnowledgeBase?.length??current?.knowledge_base?.length??0}</b></span><span><ToolOutlined/>{message("工具 / MCP","Tools / MCP")} <b>{current?.Tools?.length??current?.tools?.length??0}</b></span><span><FunctionOutlined/>Skills <b>{current?.Skills?.length??current?.skills?.length??0}</b></span><span><AppstoreOutlined/>{message("插件","Plugins")} <b>{current?.Plugins?.length??current?.plugins?.length??0}</b></span></div>{((current?.KnowledgeBase?.length??current?.knowledge_base?.length??0)+(current?.Tools?.length??current?.tools?.length??0)+(current?.Skills?.length??current?.skills?.length??0)+(current?.Plugins?.length??current?.plugins?.length??0)===0)&&<div className="capability-hint"><span>i</span><p>{message("当前仅使用模型与提示词。可按需添加知识库、工具、Skill 或插件。","This agent currently uses only its model and prompt. Add knowledge, tools, skills, or plugins when needed.")}</p></div>}<button className="ghost full" onClick={()=>setView("builder")}>{message("编排配置","Build & configure")}</button></aside>
        <div className="chat-shell"><header><div><span className="agent-online"><MessageOutlined/></span><span><strong>{current?aname(current):message("Agent 对话","Agent chat")}</strong><small>{message("输入问题或任务，查看 Agent 的规划、检索和能力调用过程","Ask a question or give a task, then inspect planning, retrieval, and capability calls")}</small></span></div><button className="ghost" disabled={chatMessages.length===0} onClick={()=>setChatMessages([])}>{message("清空对话","Clear")}</button></header>
          <div className="chat-stream">{chatMessages.length===0?<div className="chat-welcome"><span><MessageOutlined/></span><strong>{message("现在可以直接与 Agent 对话","Start a conversation with your agent")}</strong><p>{message("你可以提出问题，或交给它一个需要规划和执行的任务。运行结果会明确展示知识库、Skill、插件和工具的调用情况。","Ask a question or give it a task to plan and execute. The result will show knowledge, skills, plugins, and tool calls.")}</p><div>{[message("根据产品知识库介绍 Nexora","Explain Nexora using the product knowledge base"),message("规划一个客户投诉处理任务","Plan a customer complaint workflow"),message("查询售后政策并判断是否需要转人工","Check after-sales policy and decide whether to hand off")].map(prompt=><button key={prompt} onClick={()=>setChatInput(prompt)}>{prompt}</button>)}</div></div>:chatMessages.map(item=><article className={`chat-message ${item.role}`} key={item.id}><span>{item.role==="user"?message("我","Me"):"N"}</span><div><p>{item.content}</p>{item.trace&&<><button className="trace-toggle" onClick={()=>setTraceOpen(traceOpen===item.id?"":item.id)}>{traceOpen===item.id?message("收起运行过程","Hide execution"):message("查看运行过程","View execution")} · {item.trace.steps.length} {message("步","steps")}</button>{traceOpen===item.id&&<div className="execution-trace"><div className="runtime-notice"><b>{message("运行模式","Runtime")}: {item.trace.runtime_mode}</b><span>{item.trace.runtime_notice}</span></div><ol>{item.trace.steps.map(step=><li key={step.id} className={step.status}><i>{step.status==="completed"?"✓":"–"}</i><span><strong>{step.name}</strong><small>{step.summary}</small></span><em>{step.kind}</em></li>)}</ol>{item.trace.citations.length>0&&<div className="trace-citations"><strong>{message("知识引用","Knowledge citations")}</strong>{item.trace.citations.map(source=><blockquote key={`${source.resource_id}-${source.snippet}`}>{source.snippet}<cite>{source.name}</cite></blockquote>)}</div>}</div>}</>}</div></article>)}{chatRunning&&<article className="chat-message assistant"><span>N</span><div className="thinking"><i/><i/><i/>{message("正在规划与执行…","Planning and executing…")}</div></article>}</div>
          <footer className="chat-composer"><textarea aria-label={message("输入问题或任务","Enter a question or task")} value={chatInput} placeholder={message("输入问题或任务，Enter 发送，Shift + Enter 换行","Ask a question or give a task. Enter to send, Shift + Enter for a new line")} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();void sendChat()}}}/><button aria-label={message("发送","Send")} disabled={!chatInput.trim()||chatRunning} onClick={()=>void sendChat()}><SendOutlined/></button><small>{message("Agent 的输出可能不准确，请核验重要信息。","Agent output may be inaccurate. Verify important information.")}</small></footer>
        </div>
      </section>)}
      {view==="builder"&&(!current?<section className="panel view-panel"><EmptyAgent purpose={message("编排","build")}/></section>:<section className="agent-builder">
        <header className="builder-toolbar"><div className="builder-identity"><button onClick={()=>{setNotice("");setBuilderSettingsOpen(false);setView(isAgentReady(current)?"chat":"workspace")}}>←</button><span><strong>{aname(current)}</strong><small>{message("工作流编排","Workflow builder")} · {aid(current)}</small></span><em>{astatus(current)}</em></div><div className="builder-actions"><span className={`save-state ${saveState}`}>{saveState==="saving"?message("保存中…","Saving…"):saveState==="dirty"?message("有未保存更改","Unsaved changes"):message("已保存","Saved")}</span><button className="ghost" onClick={()=>setBuilderSettingsOpen(x=>!x)}><SettingOutlined/> {message("Agent 设置","Agent settings")}</button><button className="ghost" onClick={()=>void saveConfig()}><CheckOutlined/> {message("保存","Save")}</button><button className="primary" disabled={!config.model.trim()||!config.prompt.trim()} onClick={()=>setBuilderTestOpen(true)}><SendOutlined/> {message("试运行","Test run")}</button></div></header>
        <div className="builder-workspace">
          <aside className="builder-library"><div><strong>{message("能力节点","Blocks")}</strong><small>{message("点击添加到画布","Click to add to canvas")}</small></div><label><SearchOutlined/><input placeholder={message("搜索节点","Search blocks")}/></label><nav>
            <p>{message("基础","Core")}</p><button onClick={()=>addBuilderNode("MODEL","LLM")}><span className="block-purple">AI</span><span><strong>{message("大模型","LLM")}</strong><small>{message("理解并生成内容","Reason and generate")}</small></span><PlusOutlined/></button><button onClick={()=>addBuilderNode("INTENT",message("意图识别","Intent router"))}><span className="block-blue"><BranchesOutlined/></span><span><strong>{message("意图识别","Intent router")}</strong><small>{message("分类并路由请求","Classify and route")}</small></span><PlusOutlined/></button>
            <p>{message("知识与行动","Knowledge & actions")}</p><button onClick={()=>addBuilderNode("KNOWLEDGE",message("知识检索","Knowledge retrieval"))}><span className="block-green"><DatabaseOutlined/></span><span><strong>{message("知识检索","Knowledge retrieval")}</strong><small>RAG</small></span><PlusOutlined/></button><button onClick={()=>addBuilderNode("TOOL",message("工具调用","Tool call"))}><span className="block-orange"><ToolOutlined/></span><span><strong>{message("工具 / MCP","Tools / MCP")}</strong><small>{message("调用外部服务","Call services")}</small></span><PlusOutlined/></button><button onClick={()=>addBuilderNode("SKILL","Skill")}><span className="block-cyan"><FunctionOutlined/></span><span><strong>Skill</strong><small>{message("复用专业能力","Reusable capability")}</small></span><PlusOutlined/></button><button onClick={()=>addBuilderNode("PLUGIN",message("插件","Plugin"))}><span className="block-gray"><AppstoreOutlined/></span><span><strong>{message("插件","Plugin")}</strong><small>{message("安全与扩展","Safety and extension")}</small></span><PlusOutlined/></button>
            <p>{message("流程控制","Flow control")}</p><button onClick={()=>addBuilderNode("CONDITION",message("条件分支","Condition"))}><span className="block-gray"><BranchesOutlined/></span><span><strong>{message("条件分支","Condition")}</strong><small>{message("按规则分流","Branch by rules")}</small></span><PlusOutlined/></button>
          </nav></aside>
          <main className={`builder-canvas${connecting?" is-connecting":""}`}><div className="canvas-toolbar"><span>{message("主流程","Main flow")}</span><div><button title={message("自动布局","Auto layout")}>⌘</button><button title={message("缩小","Zoom out")}><MinusOutlined/></button><button title={message("放大","Zoom in")}><PlusOutlined/></button></div></div><ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={connectNodes} onConnectStart={()=>{setConnecting(true);setConnectionNotice(message("拖到另一个节点左侧的输入端口","Drag to the input port on the left of another node"))}} onConnectEnd={()=>setConnecting(false)} onEdgeClick={(_,edge)=>selectEdge(edge)} onPaneClick={clearCanvasSelection} onNodeClick={(_,node)=>{clearCanvasSelection();setSelectedNode(node.id)}} edgesFocusable edgesReconnectable={false} isValidConnection={connection=>Boolean(connection.source&&connection.target&&connection.source!==connection.target&&!edges.some(edge=>edge.source===connection.source&&edge.target===connection.target&&edge.sourceHandle===connection.sourceHandle&&edge.targetHandle===connection.targetHandle))} fitView minZoom={.35} maxZoom={1.5} connectionLineStyle={{stroke:"#635bdb",strokeWidth:2}} defaultEdgeOptions={{type:"smoothstep",interactionWidth:24,style:{stroke:"#8f88dc",strokeWidth:1.6}}}><Background gap={24} size={1}/><Controls showInteractive={false}/></ReactFlow>{selectedEdge&&(()=>{const edge=edges.find(item=>item.id===selectedEdge);const source=nodes.find(item=>item.id===edge?.source);const target=nodes.find(item=>item.id===edge?.target);return edge?<div className="selected-edge-toolbar"><span><LinkOutlined/><b>{String(source?.data.label??edge.source)}</b><i>→</i><b>{String(target?.data.label??edge.target)}</b></span><button aria-label={message("删除选中连线","Delete selected connection")} onClick={removeSelectedEdge}><DeleteOutlined/> {message("删除连线","Delete")}</button></div>:null})()}{connectionNotice&&!selectedEdge&&<div className={`connection-notice${connecting?" active":""}`}>{connecting?<LinkOutlined/>:<CheckOutlined/>}{connectionNotice}</div>}<div className="canvas-hint">{message("点击连线可选择 · 从输出端口拖到输入端口创建连线","Click a connection to select · drag output to input to connect")}</div></main>
          <aside className="builder-inspector">{selectedNode?<><header><span><small>{message("节点配置","Node settings")}</small><strong>{String(nodes.find(node=>node.id===selectedNode)?.data.label??selectedNode)}</strong></span>{![ "start","output"].includes(selectedNode)&&<button aria-label={message("删除节点","Delete node")} onClick={removeSelectedNode}><DeleteOutlined/></button>}</header><div className="inspector-body">{selectedNode==="model"?<><label>{message("星模路由","MaaS route")}<select value={config.model} onChange={e=>{setConfig(x=>({...x,model:e.target.value}));setSaveState("dirty")}}><option value="">{message("请选择星模中的可用路由","Choose an active MaaS route")}</option>{modelRoutes.map(route=><option key={route.alias} value={route.alias}>{route.model||route.name} · {route.alias}</option>)}</select></label>{modelRoutes.length===0&&<div className="setup-requirements"><span>{message("星模中暂无生效路由，请先前往 MaaS 完成供应商、模型和路由配置。","No active MaaS route. Configure a provider, model, and route in MaaS first.")}</span></div>}<div className="field-grid"><label>{message("温度","Temperature")}<input defaultValue="0.3"/></label><label>Max tokens<input defaultValue="2048"/></label></div><label>{message("节点指令","Node instruction")}<textarea value={config.prompt} onChange={e=>{setConfig(x=>({...x,prompt:e.target.value}));setSaveState("dirty")}}/></label></>:selectedNode==="knowledge"?<ResourcePicker label={message("知识库","Knowledge bases")} help={message("选择本节点检索的数据源","Select sources for this node")} kind="knowledge_base" resources={resources} selected={config.knowledge} onChange={value=>{setConfig(x=>({...x,knowledge:value}));setSaveState("dirty")}}/>:selectedNode==="intent"?<ResourcePicker label={message("意图路由","Intent router")} help={message("选择分类器与路由规则","Choose classifier and routes")} kind="intent" resources={resources} selected={config.intents} onChange={value=>{setConfig(x=>({...x,intents:value}));setSaveState("dirty")}}/>:<><div className="node-summary"><span className="node-icon-large"><FunctionOutlined/></span><strong>{message("配置此节点的输入与输出","Configure node input and output")}</strong><p>{message("连接上游节点后，变量会显示在这里。","Upstream variables appear after connection.")}</p></div><label>{message("节点名称","Node name")}<input value={String(nodes.find(node=>node.id===selectedNode)?.data.label??"")} readOnly/></label></>}</div></>:<div className="inspector-empty"><FunctionOutlined/><strong>{message("选择一个节点","Select a node")}</strong><p>{message("在画布中选择节点后配置属性。","Select a node on the canvas to edit its settings.")}</p></div>}</aside>
        </div>
        {builderSettingsOpen&&<div className="builder-drawer"><header><span><small>{isAgentReady(current)?message("AGENT 设置","AGENT SETTINGS"):message("开始前完成配置","SET UP TO START")}</small><strong>{isAgentReady(current)?message("全局设置","Global settings"):message("让 Agent 可以开始对话","Make this agent ready to chat")}</strong></span><button aria-label={message("关闭","Close")} onClick={()=>setBuilderSettingsOpen(false)}>×</button></header><div>{!isAgentReady(current)&&<div className="setup-requirements"><strong>{message("需要完成 2 项","Two required settings")}</strong><span className={config.model.trim()?"ready":""}>{config.model.trim()?<CheckOutlined/>:"1"} {message("选择星模路由","Choose a MaaS route")}</span><span className={config.prompt.trim()?"ready":""}>{config.prompt.trim()?<CheckOutlined/>:"2"} {message("填写系统提示词","Add a system prompt")}</span></div>}<label>{message("星模路由","MaaS route")}<select value={config.model} onChange={e=>{setConfig(x=>({...x,model:e.target.value}));setSaveState("dirty")}}><option value="">{message("请选择星模中的可用路由","Choose an active MaaS route")}</option>{modelRoutes.map(route=><option key={route.alias} value={route.alias}>{route.model||route.name} · {route.alias}</option>)}</select></label><label>{message("系统提示词","System prompt")}<textarea value={config.prompt} placeholder={message("说明 Agent 的角色、目标、行为规则和回答方式","Define the agent's role, goals, rules, and response style")} onChange={e=>{setConfig(x=>({...x,prompt:e.target.value}));setSaveState("dirty")}}/></label><button className="primary full" disabled={!config.model.trim()||!config.prompt.trim()||saveState==="saving"} onClick={async()=>{if(await saveConfig()){setBuilderSettingsOpen(false);setView("chat")}}}><MessageOutlined/> {message("保存并开始对话","Save and start chatting")}</button><ResourcePicker label={message("全局插件（可选）","Global plugins (optional)")} help={message("不影响开始对话，可稍后添加","Optional. You can add these later.")} kind="plugin" resources={resources} selected={config.plugins} onChange={value=>{setConfig(x=>({...x,plugins:value}));setSaveState("dirty")}}/></div></div>}
        {builderTestOpen&&<div className="builder-test-drawer"><header><span><small>PLAYGROUND</small><strong>{message("试运行当前草稿","Test current draft")}</strong></span><button onClick={()=>setBuilderTestOpen(false)}>×</button></header><div className="mini-chat"><MessageOutlined/><strong>{message("输入一条消息验证流程","Enter a message to test the flow")}</strong><textarea value={chatInput} onChange={e=>setChatInput(e.target.value)} placeholder={message("例如：如何申请退款？","e.g. How can I request a refund?")}/><button className="primary" disabled={!chatInput.trim()} onClick={()=>{setBuilderTestOpen(false);setView("chat");void sendChat()}}><SendOutlined/> {message("运行","Run")}</button></div></div>}
      </section>)}
      {view==="knowledge"&&<KnowledgeCenter resources={resources} onOpenCreate={openCreateKnowledge} message={message}/>}
      {view==="tools"&&<ResourceCenter title={t.tools} description={message("统一配置工具、MCP Server、Skill 和插件，再由 Agent 按需绑定。","Configure tools, MCP servers, skills, and plugins once, then bind them to agents.")} kind={["tool","mcp_server","skill","plugin"]} resources={resources} onCreate={async(name)=>{await request("/api/v1/resources",{method:"POST",body:JSON.stringify({kind:"tool",name,description:"由 Studio 创建的工具"})});await loadResources();setNotice(message("能力已创建，可回到 Agent 编排绑定。","Capability created. Bind it from the agent builder."))}} message={message}/>}
      {view==="evaluations"&&<section className="panel view-panel narrow">{!current?<EmptyAgent purpose={message("评测","evaluate")}/>:<><h3>{t.evaluations}</h3><p className="muted">{message("验证 Agent 的相关性、事实一致性与回答质量。","Validate relevance, groundedness, and response quality.")}</p><AgentContext purpose="evaluation"/><button className="primary" disabled={!selected} onClick={()=>void run("evaluate")}>{t.evaluate}</button>{output!==null&&<pre>{JSON.stringify(output,null,2)}</pre>}</>}</section>}
      {view==="releases"&&<section className="panel view-panel">{!current?<EmptyAgent purpose={message("发布","publish")}/>:<><div className="panelhead"><div><h3>{t.releases}</h3><p className="muted">{message("生成不可变版本，并将 Agent 身份与端点同步到治理平台。","Create immutable versions and sync agent identity and endpoints to governance.")}</p></div><button className="primary" disabled={!selected} onClick={()=>void run("publish")}>{t.publish}</button></div><AgentContext purpose="release"/>{versions.length===0?<div className="empty">{message("该 Agent 暂无已发布版本。","This agent has no published versions yet.")}</div>:versions.map((v,i)=><div className="list-row static" key={v.ID??v.id??i}><span><strong>v{v.Version??v.version}</strong><small>{v.Endpoint??v.endpoint}</small></span><span className="tag">{message("不可变","Immutable")}</span></div>)}</>}</section>}
    </main>
    {createOpen&&<div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setCreateOpen(false)}}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="create-agent-title">
      <div className="modal-head"><div><small>NEXORA STUDIO</small><h2 id="create-agent-title">{message("创建 Agent","Create agent")}</h2><p>{message("填写基本信息，创建后进入可视化编排器。","Add the basics, then continue in the visual builder.")}</p></div><button className="modal-close" aria-label={message("关闭","Close")} onClick={()=>setCreateOpen(false)}>×</button></div>
      <label className="form-field"><span>{message("Agent 名称","Agent name")} <em>*</em></span><input autoFocus value={agentName} maxLength={80} placeholder={message("例如：客户服务助手","e.g. Customer Support Assistant")} onChange={e=>setAgentName(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")void createAgent()}}/><small>{agentName.length}/80</small></label>
      <label className="form-field"><span>{message("描述","Description")}</span><textarea value={agentDescription} maxLength={300} placeholder={message("说明这个 Agent 解决什么问题","Describe what this agent is designed to solve")} onChange={e=>setAgentDescription(e.target.value)}/></label>
      <label className="form-field"><span>{message("起始模板","Starter template")}</span><select value={agentTemplate} onChange={e=>setAgentTemplate(e.target.value)}><option value="customer-support">{message("客户服务","Customer support")}</option><option value="rag">{message("知识问答 RAG","Knowledge Q&A (RAG)")}</option><option value="blank">{message("空白工作流","Blank workflow")}</option></select></label>
      <div className="modal-actions"><button className="ghost" onClick={()=>setCreateOpen(false)}>{message("取消","Cancel")}</button><button className="primary" disabled={!agentName.trim()} onClick={()=>void createAgent()}><PlusOutlined/> {message("创建并开始编排","Create and start building")}</button></div>
    </section></div>}
    {knowledgeOpen&&<div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setKnowledgeOpen(false)}}><section className="modal knowledge-modal" role="dialog" aria-modal="true" aria-labelledby="create-knowledge-title">
      <div className="modal-head"><div><small>NEXORA KNOWLEDGE</small><h2 id="create-knowledge-title">{message("创建知识库","Create knowledge base")}</h2><p>{message("建立可复用的企业知识源，创建后可绑定到多个 Agent。","Build a reusable enterprise knowledge source that can be bound to multiple agents.")}</p></div><button className="modal-close" aria-label={message("关闭","Close")} onClick={()=>setKnowledgeOpen(false)}>×</button></div>
      <div className="wizard-steps"><span className={knowledgeStep===1?"active":"done"}><b>1</b>{message("基本信息与数据源","Basics & source")}</span><i/><span className={knowledgeStep===2?"active":""}><b>2</b>{message("切分与索引","Chunking & indexing")}</span></div>
      {knowledgeStep===1?<div className="wizard-body">
        <label className="form-field"><span>{message("知识库名称","Knowledge base name")} <em>*</em></span><input autoFocus maxLength={80} value={knowledgeDraft.name} placeholder={message("例如：产品帮助中心","e.g. Product Help Center")} onChange={e=>setKnowledgeDraft(x=>({...x,name:e.target.value}))}/><small>{knowledgeDraft.name.length}/80</small></label>
        <label className="form-field"><span>{message("描述","Description")}</span><textarea maxLength={300} value={knowledgeDraft.description} placeholder={message("说明知识范围、使用场景和维护负责人","Describe its scope, use cases, and owner")} onChange={e=>setKnowledgeDraft(x=>({...x,description:e.target.value}))}/></label>
        <fieldset className="source-picker"><legend>{message("选择数据源","Choose a data source")}</legend><div>
          <button className={knowledgeDraft.sourceType==="file"?"active":""} onClick={()=>setKnowledgeDraft(x=>({...x,sourceType:"file"}))}><UploadOutlined/><span><strong>{message("上传文件","Upload files")}</strong><small>PDF · DOCX · TXT · MD</small></span></button>
          <button className={knowledgeDraft.sourceType==="url"?"active":""} onClick={()=>setKnowledgeDraft(x=>({...x,sourceType:"url"}))}><LinkOutlined/><span><strong>{message("网页链接","Web page")}</strong><small>{message("抓取指定网页内容","Import a web page")}</small></span></button>
          <button className={knowledgeDraft.sourceType==="text"?"active":""} onClick={()=>setKnowledgeDraft(x=>({...x,sourceType:"text"}))}><FileTextOutlined/><span><strong>{message("粘贴文本","Paste text")}</strong><small>{message("直接录入知识内容","Enter content directly")}</small></span></button>
        </div></fieldset>
        {knowledgeDraft.sourceType==="file"&&<label className="upload-zone"><UploadOutlined/><strong>{message("选择本地文档","Choose local documents")}</strong><span>{message("支持 PDF、DOCX、TXT、Markdown；单文件不超过 50 MB","PDF, DOCX, TXT, and Markdown; up to 50 MB per file")}</span><input type="file" multiple accept=".pdf,.doc,.docx,.txt,.md" onChange={e=>setKnowledgeDraft(x=>({...x,files:Array.from(e.target.files??[])}))}/>{knowledgeDraft.files.length>0&&<small>{message(`已选择 ${knowledgeDraft.files.length} 个文件：`,`${knowledgeDraft.files.length} files selected: `)}{knowledgeDraft.files.map(file=>file.name).join("、")}</small>}</label>}
        {knowledgeDraft.sourceType==="url"&&<label className="form-field"><span>{message("网页地址","Web page URL")}</span><input type="url" value={knowledgeDraft.sourceValue} placeholder="https://docs.example.com/guide" onChange={e=>setKnowledgeDraft(x=>({...x,sourceValue:e.target.value}))}/></label>}
        {knowledgeDraft.sourceType==="text"&&<label className="form-field"><span>{message("知识内容","Knowledge content")}</span><textarea className="knowledge-text" value={knowledgeDraft.sourceValue} placeholder={message("在此粘贴或输入知识内容…","Paste or enter knowledge content here…")} onChange={e=>setKnowledgeDraft(x=>({...x,sourceValue:e.target.value}))}/></label>}
      </div>:<div className="wizard-body">
        <div className="index-summary"><DatabaseOutlined/><span><strong>{knowledgeDraft.name}</strong><small>{message("系统会按以下规则解析、切分并建立向量索引。","Content will be parsed, chunked, and indexed using these settings.")}</small></span></div>
        <label className="form-field"><span>{message("嵌入模型","Embedding model")}</span><select value={knowledgeDraft.embedding} onChange={e=>setKnowledgeDraft(x=>({...x,embedding:e.target.value}))}><option value="bge-m3">BGE-M3</option><option value="text-embedding-3-small">OpenAI text-embedding-3-small</option><option value="multilingual-e5-large">Multilingual E5 Large</option></select></label>
        <div className="form-grid"><label className="form-field"><span>{message("分段长度（字符）","Chunk size (characters)")}</span><input type="number" min={200} max={4000} value={knowledgeDraft.chunkSize} onChange={e=>setKnowledgeDraft(x=>({...x,chunkSize:Number(e.target.value)}))}/></label><label className="form-field"><span>{message("重叠长度（字符）","Chunk overlap (characters)")}</span><input type="number" min={0} max={1000} value={knowledgeDraft.chunkOverlap} onChange={e=>setKnowledgeDraft(x=>({...x,chunkOverlap:Number(e.target.value)}))}/></label></div>
        <div className="index-note"><strong>{message("处理流程","Processing pipeline")}</strong><span>{message("内容解析 → 智能切分 → 向量化 → 建立检索索引","Parse → semantic chunking → embedding → retrieval index")}</span></div>
      </div>}
      <div className="modal-actions"><button className="ghost" onClick={()=>knowledgeStep===1?setKnowledgeOpen(false):setKnowledgeStep(1)}>{knowledgeStep===1?message("取消","Cancel"):message("上一步","Back")}</button>{knowledgeStep===1?<button className="primary" disabled={!knowledgeDraft.name.trim()} onClick={()=>setKnowledgeStep(2)}>{message("下一步：配置索引","Next: configure indexing")}</button>:<button className="primary" onClick={()=>void createKnowledge()}><PlusOutlined/> {message("创建并开始索引","Create and start indexing")}</button>}</div>
    </section></div>}
    {toolOpen&&<div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setToolOpen(false)}}><section className="modal compact-modal" role="dialog" aria-modal="true"><div className="modal-head"><div><small>TOOLS & MCP</small><h2>{message("添加工具","Add tool")}</h2></div><button className="modal-close" onClick={()=>setToolOpen(false)}>×</button></div><label className="form-field"><span>{message("工具名称","Tool name")}</span><input autoFocus value={toolName} placeholder="Order MCP Server" onChange={e=>setToolName(e.target.value)}/></label><div className="modal-actions"><button className="ghost" onClick={()=>setToolOpen(false)}>{message("取消","Cancel")}</button><button className="primary" disabled={!toolName.trim()} onClick={()=>{setTools(x=>[...x,toolName.trim()]);setToolOpen(false);setNotice(message("工具已添加。","Tool added."))}}>{message("添加","Add")}</button></div></section></div>}
  </div>;
}
