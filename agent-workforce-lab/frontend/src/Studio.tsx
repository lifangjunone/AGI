import {FormEvent,ReactNode,useDeferredValue,useEffect,useRef,useState} from 'react';
import {readRoute,navigate} from './navigation';

type Account={id:string;name:string;email:string};
type Expert={id:string;name:string;role:string;knowledge_scope:string};
type Twin={id:string;name:string;role_goal:string;expert_id:string;status:string;delegation:string};
type Learning={id:string;expert_id:string;twin_id:string;title:string;source_label:string;work_record:string;status:string;understanding:string;question:string;answer:string;method:string;boundary:string;capability_id?:string|null;active?:boolean;redactions?:number;draft_mode?:string};
type Source={id:string;source_type:'lark_doc'|'oncall_flow';name:string;external_ref:string;related_ref?:string;status:string;cursor?:string;metadata:Record<string,unknown>;redactions:number;last_error?:string;last_success_at?:string;assigned_twin_ids?:string[]};
type Capability={id:string;twin_id:string;name:string;status:string;method:string;boundary:string;level:string;evidence_count:number;accepted_count:number;learning_ids?:string[];revision?:number};
type RuntimeTrace={engine:string;mode:string;citations?:string[];trajectory?:string[];external_execution?:boolean;run_id?:string};
type Trial={id:string;capability_id:string;twin_id:string;status:string;scenario:string;response:string;score:number|null;checks:{label:string;passed:boolean}[];capability_revision?:number;runtime?:RuntimeTrace;last_error?:string};
type Assessment={twin_id:string;twin_name:string;verdict:string;covered:string[];missing:string[];reason:string};
type Task={id:string;title:string;goal:string;expected_output:string;required_capabilities:string[];status:string;member_ids:string[];team_id:string|null;progress:number;assessments:Assessment[]};
type Team={id:string;task_id:string;name:string;member_ids:string[];created_reason:string};
type Update={id:string;task_id:string;twin_id:string;kind:string;summary:string;missing_capability:string};
type Contribution={capability_id:string;twin_id:string;capability_name:string;summary:string;evidence_indexes:number[]};
type Deliverable={id:string;task_id:string;version:number;title:string;content:string;evidence:string[];author_twin_id:string;status:string;feedback?:string;contributions?:Contribution[];runtime?:RuntimeTrace};
type TaskRun={id:string;task_id:string;twin_id:string;status:string;engine:string;mode:string;citations:string[];trajectory:string[];external_execution?:boolean;error?:string};
type Workspace={account:Account;organization:{id:string;name:string;role:string}|null;can_operate?:boolean;experts?:Expert[];twins?:Twin[];sources?:Source[];learning?:Learning[];capabilities?:Capability[];trials?:Trial[];tasks?:Task[];teams?:Team[];updates?:Update[];deliverables?:Deliverable[];task_runs?:TaskRun[];runtime?:{live_available:boolean;live_model:string;fallback:string}};
type View='home'|'sources'|'learn'|'people'|'work';
type Portal='employee'|'operations';
type Run=(action:()=>Promise<unknown>,message:string)=>Promise<void>;

function capabilityForLearning(capabilities:Capability[],learning?:Learning){
 if(!learning)return undefined;
 return capabilities.find(capability=>
  capability.id===learning.capability_id||
  capability.learning_ids?.includes(learning.id)
 );
}

function trialIsForCurrentRevision(capability?:Capability,trial?:Trial){
 return Boolean(capability&&trial&&(capability.revision||1)<=(trial.capability_revision||1));
}

async function api<T>(path:string,body?:unknown):Promise<T>{
 const response=await fetch('/api'+path,{method:body===undefined?'GET':'POST',headers:body===undefined?undefined:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),credentials:'same-origin'});
 if(!response.ok){let message=`请求失败（${response.status}）`;try{message=(await response.json()).detail||message}catch{}throw new Error(message)}
 return response.json();
}

export default function Studio(){
 const[account,setAccount]=useState<Account|null>(null),[data,setData]=useState<Workspace|null>(null);
 const initialRoute=readRoute();
 const[portal,setPortal]=useState<Portal|null>(initialRoute.portal),[view,setView]=useState<View>(initialRoute.view),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('');const[modal,setModal]=useState<ReactNode>(null);
 const[objectId,setObjectId]=useState(initialRoute.objectId);
 const load=async()=>{setLoading(true);try{const auth=await api<{account:Account|null}>('/auth/me');setAccount(auth.account);setData(auth.account?await api<Workspace>(`/v2/workspace?portal=${location.pathname.startsWith('/ops')?'operations':'employee'}`):null)}catch(e){setError(e instanceof Error?e.message:'加载失败')}finally{setLoading(false)}};
 useEffect(()=>{void load()},[]);
 useEffect(()=>{const sync=()=>{const route=readRoute();setPortal(route.portal);setView(route.view);setObjectId(route.objectId);setModal(null)};const back=()=>{sync();setData(null);void load()};addEventListener('popstate',back);addEventListener('awl:navigate',sync);return()=>{removeEventListener('popstate',back);removeEventListener('awl:navigate',sync)}},[]);
 const run:Run=async(action,message)=>{setError('');try{await action();setModal(null);await load();setNotice(message);window.setTimeout(()=>setNotice(''),6000)}catch(e){setError(e instanceof Error?e.message:'操作失败')}};
 if(loading&&!data)return <div className="boot"><span/><b>正在进入分身工场</b></div>;
 if(!account)return <Auth done={load}/>;
 if(error&&!data)return <div className="setup"><section><h1>无法进入当前空间</h1><p>{error}</p><a href="/me">进入我的数字分身</a></section></div>;
 if(location.pathname==='/join')return <JoinWorkspace/>;
 if(!data?.organization)return <Bootstrap run={run}/>;
 const choosePortal=(next:Portal|null)=>{if(next==='operations'&&!data.can_operate)return;history.pushState({},'',next==='employee'?'/me':next==='operations'?'/ops':'/');setPortal(next);setView('home');setData(null);void load();window.scrollTo({top:0})};
 if(!portal)return <PortalGate data={data} choose={choosePortal}/>;
 const go=(v:View,id='')=>{navigate(portal,v,id);window.scrollTo({top:0,behavior:'auto'})};
 const items:View[]=portal==='employee'?['home','sources','learn','people']:['home','people','work'];
 const names:Record<View,string>=portal==='employee'?{home:'分身首页',sources:'学习资料库',learn:'学习空间',people:'成长档案',work:'任务运营'}:{home:'运营总览',sources:'学习资料库',learn:'学习空间',people:'考核准入',work:'任务运营'};
 return <div className={`shell portal-${portal}`}><header className="topbar"><Brand product={portal==='employee'?'我的数字分身':'数字员工运营台'}/><nav>{items.map((id,i)=><button key={id} className={view===id?'active':''} onClick={()=>go(id)}><i>0{i+1}</i>{names[id]}</button>)}</nav><div className="account">{portal==='operations'&&['owner','admin'].includes(data.organization.role)&&<button className="portal-switch" onClick={()=>setModal(<TeamMembers role={data.organization!.role} close={()=>setModal(null)}/>)}>团队成员</button>}<button className="portal-switch" onClick={()=>choosePortal(null)}>切换产品</button><span>{data.organization.name}</span><b>{account.name[0]}</b><button onClick={()=>void run(()=>api('/auth/logout',{}),'已退出')}>退出</button></div></header>
 {(error||notice)&&<div className={`toast ${error?'bad':''}`}>{error||notice}<button onClick={()=>{setError('');setNotice('')}}>×</button></div>}
 <main id="main" data-object-id={objectId}>{view==='home'&&(portal==='employee'?<EmployeeHome data={data} go={go}/>:<Home data={data} go={go} open={setModal} run={run}/>)}
 {view==='sources'&&<SourceLibrary data={data} run={run} open={setModal}/>}
 {view==='learn'&&<LearningRoom data={data} run={run} open={setModal}/>}
 {view==='people'&&<><People data={data} run={run} open={setModal} portal={portal}/>{portal==='employee'&&<EvidenceLinks data={data} open={setModal}/>}</>}
 {view==='work'&&<Work data={data} run={run} open={setModal}/>}</main>{modal}</div>;
}

type Member={id:string;name:string;email:string;role:string};
type Invitation={id:string;email:string;role:string;status:string;expires_at:string};
function TeamMembers({role,close}:{role:string;close:()=>void}){
 const[data,setData]=useState<{members:Member[];invitations:Invitation[]}|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[link,setLink]=useState('');
 const refresh=async()=>setData(await api('/v2/members'));
 useEffect(()=>{void refresh().catch(e=>setError(String(e.message)))},[]);
 const act=async(action:()=>Promise<unknown>)=>{setBusy(true);setError('');try{await action();await refresh()}catch(e){setError(e instanceof Error?e.message:'操作失败')}finally{setBusy(false)}};
 return <Modal title="团队成员与邀请" close={close}><div className="team-panel"><p>员工只培养自己的分身；运营人员负责考核、任务和验收。不会自动发送邮件。</p><form onSubmit={e=>{e.preventDefault();const d=new FormData(e.currentTarget);void act(async()=>{const result=await api<{invite_path:string}>('/v2/member-invitations',{email:d.get('email'),role:d.get('role')});setLink(location.origin+result.invite_path)})}}>
 <label>受邀邮箱<input name="email" type="email" required placeholder="同事的工作邮箱"/></label><label>加入角色<select name="role"><option value="member">员工 — 只培养本人分身</option><option value="operator">运营人员 — 考核、发布与验收</option></select></label><button className="primary" disabled={busy}>{busy?'正在处理…':'生成邀请链接'}</button></form>
 {error&&<p role="alert" className="form-error">{error}</p>}{link&&<section className="invite-link"><label>邀请链接（仅本次显示，7 天有效）<input value={link} readOnly onFocus={e=>e.currentTarget.select()}/></label><button className="secondary" onClick={()=>void navigator.clipboard.writeText(link).catch(()=>setError('无法复制，请选中链接后手动复制'))}>复制邀请链接</button><small>仅分享给受邀同事；本地地址只能在运行该服务的电脑访问。</small></section>}
 <h3>已加入成员</h3>{data?.members.map(m=><article className="member-row" key={m.id}><div><b>{m.name}</b><small>{m.email}</small></div>{role==='owner'&&!['owner','admin'].includes(m.role)?<label>成员角色<select aria-label={`${m.name}的角色`} value={m.role} disabled={busy} onChange={e=>void act(()=>api(`/v2/members/${m.id}/role`,{role:e.target.value}))}><option value="member">员工</option><option value="operator">运营人员</option></select></label>:<span>{({owner:'负责人',admin:'管理员',operator:'运营人员',member:'员工'} as Record<string,string>)[m.role]||m.role}</span>}</article>)}
 <h3>邀请记录</h3>{data?.invitations.map(i=><article className="member-row" key={i.id}><div><b>{i.email}</b><small>{i.role==='member'?'员工':'运营人员'} · {({pending:'待接受',accepted:'已加入',revoked:'已撤销',expired:'已过期'} as Record<string,string>)[i.status]} · {new Date(i.expires_at).toLocaleDateString('zh-CN')} 到期</small></div>{i.status==='pending'&&<button className="secondary" disabled={busy} onClick={()=>void act(()=>api(`/v2/member-invitations/${i.id}/revoke`,{}))}>撤销邀请</button>}</article>)}{data&&!data.invitations.length&&<p>暂无邀请。先生成链接，再由同事确认加入。</p>}</div></Modal>;
}

function MaterialImport({data,run,close}:{data:Workspace;run:Run;close:()=>void}){
 const[busy,setBusy]=useState(false),[error,setError]=useState('');
 const submit=async(e:FormEvent<HTMLFormElement>)=>{
  e.preventDefault();const form=new FormData(e.currentTarget);setBusy(true);setError('');
  try{
   const response=await fetch('/api/v2/learning/import',{method:'POST',body:form,credentials:'same-origin'});
   const result=await response.json();
   if(!response.ok)throw Error(typeof result.detail==='string'?result.detail:'资料导入失败，请检查格式与大小');
   await run(async()=>result,result.duplicate?'资料已存在，没有重复创建':'资料已导入，待澄清与考核');
  }catch(e){setError(e instanceof Error?e.message:'导入失败，文件选择已保留')}finally{setBusy(false)}
 };
 return <Modal title="导入已有工作资料" close={close}><form className="team-panel" onSubmit={e=>void submit(e)}>
 <p>选择已经写好的复盘或工作记录，只授权给指定分身。当前支持 UTF-8 Markdown/TXT，不会扫描电脑或读取其他文件。</p>
 <label>学习的数字分身<select name="twin_id">{(data.twins||[]).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
 <label>已有资料文件<input type="file" name="file" accept=".md,.txt,text/plain,text/markdown" required/></label>
 <small>256KB 以内、10–20000 字符。常见密钥会遮盖，但不保证识别所有敏感信息；请使用脱敏资料。</small>
 <label className="consent-line"><input type="checkbox" name="consent" value="true" required/>我有权处理该资料，同意仅供所选分身学习。</label>
 {error&&<p className="form-error" role="alert">{error}</p>}
 <button className="primary" disabled={busy}>{busy?'正在接收资料…':'导入并生成学习草稿'}</button>
 </form></Modal>;
}

function SourceConnect({kind,run,close}:{kind:'lark_doc'|'oncall_flow';run:Run;close:()=>void}){
 const isOncall=kind==='oncall_flow';
 const[busy,setBusy]=useState(false),[error,setError]=useState('');
 const submit=async(e:FormEvent<HTMLFormElement>)=>{
  e.preventDefault();if(busy)return;
  const d=new FormData(e.currentTarget);setBusy(true);setError('');
  try{
   const source=await api<Source>('/v2/sources/connect',{
    source_type:kind,name:d.get('name'),external_ref:d.get('external_ref'),
    related_ref:isOncall?d.get('related_ref'):null,
   });
   if(source.status!=='ready')throw Error(source.last_error||'资料读取失败，请检查链接与当前登录权限');
   await run(async()=>source,'资料已读取并进入学习资料库');
  }catch(e){setError(e instanceof Error?e.message:'读取失败，请稍后重试')}finally{setBusy(false)}
 };
 return <Modal title={isOncall?'接入一次 Oncall 处理过程':'接入飞书沉淀文档'} close={close}><form className="form source-connect-form" onSubmit={e=>void submit(e)}>
 <p>{isOncall?'粘贴工单和工单卡片里的关联群链接。系统只读获取已有消息，不要求填写 Token。':'粘贴已有复盘、方案或知识库链接。系统使用当前机器的只读登录态读取正文。'}</p>
 <Field label="这组资料叫什么" name="name" placeholder={isOncall?'例如：HiAgent 长稳压测排查':'例如：压测复盘与验收规范'}/>
 <Field label={isOncall?'Oncall 工单链接':'飞书文档链接'} name="external_ref" placeholder={isOncall?'https://oncall.bytedance.net/...cross_oncall_flow_id=...':'https://bytedance.larkoffice.com/docx/...'}/>
 {isOncall&&<Field label="关联飞书群链接" name="related_ref" placeholder="https://applink.feishu.cn/client/chat/open?openChatId=oc_..."/>}
 <small>读取后先进入资料库并执行常见凭据遮盖；不会自动授予任何分身能力。</small>
 {busy&&<p className="source-reading" role="status"><i/>正在读取群消息并执行脱敏，通常需要几秒，请不要重复点击。</p>}
 {error&&<p className="form-error" role="alert">{error}</p>}
 <button className="primary" disabled={busy}>{busy?'正在读取资料…':'读取并加入资料库'}</button>
 </form></Modal>;
}

function AssignSource({source,data,run,close}:{source:Source;data:Workspace;run:Run;close:()=>void}){
 return <Modal title="交给数字分身学习" close={close}><ModalForm labelText="授权并生成学习草稿" submit={d=>run(()=>api(`/v2/sources/${source.id}/assign`,{twin_id:d.get('twin_id')}),'已生成学习主题，下一步进入学习空间处理')}>
 <p>「{source.name}」将形成一条待澄清的学习主题。采集成功不代表已经学会，仍需确认边界并通过运营考核。</p>
 <label>选择数字分身<select name="twin_id">{(data.twins||[]).map(t=><option key={t.id} value={t.id}>{t.name} · {t.role_goal}</option>)}</select></label>
 </ModalForm></Modal>;
}

function SourceLibrary({data,run,open}:{data:Workspace;run:Run;open:(n:ReactNode)=>void}){
 const sources=data.sources||[];
 return <div className="page"><PageHead eyebrow="真实工作 → 可学习资料" title="学习资料库" text="连接已经发生的工作，把群聊、复盘和文件沉淀为可追溯资料；再由你决定交给哪位分身学习。">
  <button className="secondary" onClick={()=>open(<SourceConnect kind="oncall_flow" run={run} close={()=>open(null)}/>)}>接入 Oncall 处理过程</button>
  <button className="secondary" onClick={()=>open(<SourceConnect kind="lark_doc" run={run} close={()=>open(null)}/>)}>接入飞书文档</button>
  <button className="primary" disabled={!(data.twins||[]).length} onClick={()=>open(<MaterialImport data={data} run={run} close={()=>open(null)}/>)}>上传本地资料</button>
 </PageHead>
 <section className="source-pipeline" aria-label="资料进入学习的流程"><span className="active">1 接入资料</span><i/><span>2 脱敏与整理</span><i/><span>3 授权给分身</span><i/><span>4 学习与考核</span></section>
 <div className="source-grid">{sources.map(source=><article className="source-card" key={source.id}>
  <header><div><span className={`source-kind ${source.source_type}`}>{source.source_type==='lark_doc'?'飞书文档':'Oncall 过程'}</span><h2>{source.name}</h2></div><Pill>{source.status==='ready'?'已读取':source.status==='error'?'读取失败':'读取中'}</Pill></header>
  <dl><div><dt>{source.source_type==='oncall_flow'?'群消息':'正文规模'}</dt><dd>{source.source_type==='oncall_flow'?`${String(source.metadata?.learnable_count??0)} 条可整理`:`${String(source.metadata?.character_count??0)} 字符`}</dd></div><div><dt>敏感信息</dt><dd>{source.redactions?`已遮盖 ${source.redactions} 处`:'未命中常见凭据'}</dd></div><div><dt>已授权分身</dt><dd>{source.assigned_twin_ids?.length||0} 位</dd></div></dl>
  {source.last_error&&<p role="alert" className="form-error">{source.last_error}</p>}
  <small>{source.last_success_at?`最近读取：${new Date(source.last_success_at).toLocaleString('zh-CN')}`:'尚未成功读取'}</small>
  <footer><button className="secondary" onClick={()=>void run(()=>api(`/v2/sources/${source.id}/sync`,{}),'已检查来源更新')}>重新读取</button><button className="primary" disabled={source.status!=='ready'||!(data.twins||[]).length} onClick={()=>open(<AssignSource source={source} data={data} run={run} close={()=>open(null)}/>)}>交给分身学习</button></footer>
 </article>)}{!sources.length&&<section className="source-empty"><h2>先连接一段真实工作</h2><p>推荐从一个完整 Oncall 处理过程和它的复盘文档开始。系统保留来源与读取状态，不会把资料数量当成能力。</p><div><button onClick={()=>open(<SourceConnect kind="oncall_flow" run={run} close={()=>open(null)}/>)}>接入 Oncall</button><button onClick={()=>open(<SourceConnect kind="lark_doc" run={run} close={()=>open(null)}/>)}>接入飞书文档</button></div></section>}</div>
 </div>;
}

function JoinWorkspace(){
 const token=new URLSearchParams(location.hash.slice(1)).get('invite')||'';
 const[preview,setPreview]=useState<{organization_name:string;email:string;role:string}|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{if(!token){setError('邀请链接不完整，请向负责人索取新链接');return}void api<typeof preview>('/v2/invitations/preview',{token}).then(setPreview).catch(e=>setError(e.message))},[token]);
 const accept=async()=>{setBusy(true);setError('');try{await api('/v2/invitations/accept',{token});location.replace('/me')}catch(e){setError(e instanceof Error?e.message:'加入失败')}finally{setBusy(false)}};
 return <div className="setup"><section className="join-panel"><Brand/><h1>加入团队</h1>{preview?<><h2>{preview.organization_name}</h2><p>受邀账号：{preview.email}</p><p>加入身份：{preview.role==='member'?'员工 — 仅培养自己的数字分身':'运营人员 — 考核、发布与验收'}</p><p>加入不会把个人经验自动授权给其他员工。</p><button className="primary" disabled={busy} onClick={()=>void accept()}>{busy?'正在加入…':'接受邀请并进入我的分身'}</button></>:!error&&<p>正在核验邀请…</p>}{error&&<p role="alert" className="form-error">{error}</p>}<a href="/me">暂不加入，返回我的空间</a><button className="secondary" onClick={()=>void api('/auth/logout',{}).then(()=>location.reload())}>登录其他账号</button></section></div>;
}

function PortalGate({data,choose}:{data:Workspace;choose:(portal:Portal)=>void}){
 const twins=data.twins||[];
 return <div className="portal-gate"><header><Brand/><div><span>{data.organization?.name}</span><b>{data.account.name[0]}</b></div></header><main><h1>选择工作空间</h1><p>培养自己的数字分身，或以运营身份管理团队任务。</p><div className="portal-cards"><button onClick={()=>choose('employee')}><span className="portal-mark person-mark">我</span><small>真实员工</small><h2>我的数字分身</h2><p>只展示与你账号关联的分身、学习记录和能力证据。</p><ul><li>学习与澄清</li><li>成长档案</li></ul><strong>{twins.length?`查看我的 ${twins.length} 位分身`:'创建我的第一个数字分身'}</strong></button><button className="ops" disabled={!data.can_operate} onClick={()=>choose('operations')}><span className="portal-mark ops-mark">运</span><small>专门运营人员</small><h2>数字员工运营台</h2><p>查看团队候选能力，发布任务、处理协作阻塞并验收成果。</p><ul><li>考核准入</li><li>任务调度</li><li>成果验收</li></ul><strong>{data.can_operate?'进入运营工作台':'未获得运营权限，请联系团队负责人'}</strong></button></div></main></div>
}

function EmployeeHome({data,go}:{data:Workspace;go:(view:View)=>void}){
 const twins=data.twins||[],lessons=data.learning||[],caps=data.capabilities||[],twin=twins[0],own=caps.filter(c=>c.twin_id===twin?.id);
 const focus=lessons.find(l=>['needs_clarification','draft'].includes(l.status))||lessons.find(l=>l.status==='ready_for_trial')||lessons.at(-1);
 const capability=capabilityForLearning(caps,focus);
 const trial=capability&&(data.trials||[]).filter(t=>t.capability_id===capability.id).at(-1);
 const currentFailure=trial?.status==='failed'&&trialIsForCurrentRevision(capability,trial);
 const action=focus?.status==='needs_clarification'?{label:'回答一个判断边界',text:focus.question}:focus?.status==='draft'?{label:'确认它复述的方法',text:'检查方法与适用边界，确认后才会进入运营考核。'}:capability?.status==='qualified'?{label:'查看能力证据',text:`${capability.level} · ${capability.accepted_count} 次真实交付已验收。`}:focus?{label:'等待运营考核',text:currentFailure?'上次考核未通过，补学后才能再次考试。':trial?.status==='failed'?'修订已经确认，等待运营安排新一轮考试。':'方法已经确认，考核通过之前不能接任务。'}:null;
 return <div className="page employee-home growth-home">
  {twin&&<header className="growth-home-head"><div><span className="section-label">我的数字分身</span><h1>{twin.name} 的成长路线</h1><p>看清每项能力从哪里学来、目前卡在哪里，以及什么时候真正可以接任务。</p></div><button className="secondary" onClick={()=>go('people')}>查看完整档案</button></header>}
  {twin?<><section className="growth-person"><Avatar name={twin.name}/><div><h2>{twin.name}</h2><p>{twin.role_goal}</p></div><dl><div><dt>学习记录</dt><dd>{lessons.filter(l=>l.twin_id===twin.id).length}</dd></div><div><dt>能力印记</dt><dd>{own.filter(c=>c.status==='qualified').length}</dd></div><div><dt>当前状态</dt><dd>{label(twin.status)}</dd></div></dl></section>
  <div className="growth-home-grid"><aside className={`next-decision ${focus?.status==='needs_clarification'?'needs-action':''}`}><div><span className="section-label">{action&&['needs_clarification','draft'].includes(focus?.status||'')?'需要你处理':'下一道门槛'}</span>{action?<><h2>{action.label}</h2><p>{action.text}</p></>:<><h2>还没有学习主题</h2><p>导入一份已有复盘或工作记录，让分身从真实工作开始学习。</p></>}</div><button className="primary" onClick={()=>action?go(capability?.status==='qualified'?'people':'learn'):go('learn')}>{action?(capability?.status==='qualified'?'检查来源与证据':'进入当前步骤'):'添加第一份资料'}</button></aside><GrowthJourney learning={focus} capability={capability} trial={trial}/></div>
  <section className="growth-evidence-list"><header><div><span className="section-label">已经获得的印记</span><h2>通过考核和交付证明的能力</h2></div><button onClick={()=>go('people')}>查看全部证据</button></header>{own.filter(c=>c.status==='qualified').length?<div>{own.filter(c=>c.status==='qualified').slice(0,3).map(c=><article key={c.id}><span>{c.level}</span><div><b>{c.name}</b><small>{c.accepted_count?`${c.accepted_count} 次真实交付已验收`:'已通过场景考核，尚无真实交付'}</small></div></article>)}</div>:<div className="next-imprint-preview"><ImprintMark tier="新手"/><div><b>第一枚印记从一次真实考核开始</b><p>方法经过场景验证后点亮；完成真实任务后，印记会继续成长。</p></div><button onClick={()=>go('learn')}>开始学习</button></div>}</section></>:<FirstTwinExperience onCreate={()=>go('people')}/>}
 </div>;
}

function ImprintMark({tier='专家'}:{tier?:string}){
 return <span className={`imprint-mark tier-${tier}`} aria-label={`${tier}印记`}><svg viewBox="0 0 80 88" role="img" aria-hidden="true"><path d="M40 3 70 18v35L40 84 10 53V18Z"/><path d="m40 13 21 11v25L40 71 19 49V24Z"/><path d="m27 45 9 9 18-23"/><circle cx="40" cy="43" r="28"/></svg><b>{tier}</b></span>;
}

function FirstTwinExperience({onCreate}:{onCreate:()=>void}){
 return <div className="first-twin-page"><section className="first-twin-experience">
  <div className="first-twin-copy"><span className="preview-kicker">你培养的，不只是一个助手</span><h2>让你的经验，长成一个真正能独立工作的数字分身。</h2><p>它会从你的真实工作中学习，通过考试获得能力印记，再用一次次交付把印记升级。</p><button className="primary" onClick={onCreate}>开始培养我的数字分身</button><small>先建立身份，再由你决定它可以学习哪些资料。</small></div>
  <article className="master-twin-card" aria-label="专家阶数字分身图鉴">
   <header><span>专家阶数字分身图鉴</span><b>每项能力都可回查考试与交付证据</b></header>
   <div className="master-identity"><div className="master-portrait"><span>衡</span><i/><i/><i/></div><div><small>稳定性决策专家</small><h3>知衡</h3><p>完成考试、交付与带队三类成长认证</p></div><strong>专家阶</strong></div>
   <div className="master-impact" aria-label="专家阶解锁条件"><div><b>≥20</b><span>次成果验收</span></div><div><b>≥6</b><span>枚专家印记</span></div><div><b>≥3</b><span>次任务组带队</span></div></div>
   <section className="imprint-vault"><header><b>能力印记</b><span>全部可回查证据</span></header><div><span><ImprintMark/><b>容量规划</b></span><span><ImprintMark/><b>异常归因</b></span><span><ImprintMark/><b>压测决策</b></span><span><ImprintMark tier="高手"/><b>风险止损</b></span><span><ImprintMark tier="高手"/><b>复盘提炼</b></span><span className="locked"><ImprintMark tier="进阶"/><b>演练编排</b></span></div></section>
   <footer><span><i/>代表能力</span><p>独立完成容量评估；发现缺口后召集合格分身建立任务组，并对最终成果负责。</p></footer>
  </article>
  <footer className="growth-promise"><span>从真实工作学习</span><i/><span>考试点亮印记</span><i/><span>交付让印记升级</span></footer>
 </section>
 <section className="twin-levels"><header><span className="section-label">成长等级</span><h2>不是换一个称号，而是获得更大的工作能力。</h2><p>每次升级都要同时满足能力考试、真实交付和风险边界，资料数量不能直接升级。</p></header><div>
  <article><span className="level-index">01</span><ImprintMark tier="新手"/><div><b>新手印记</b><p>通过第一项独立场景考试，可以在明确边界内承担简单任务。</p><small>能力证明：考试通过</small></div></article>
  <article><span className="level-index">02</span><ImprintMark tier="进阶"/><div><b>进阶印记</b><p>完成多次真实交付，能够识别常见异常并主动请求帮助。</p><small>能力证明：考试 + 交付</small></div></article>
  <article><span className="level-index">03</span><ImprintMark tier="高手"/><div><b>高手印记</b><p>可以处理复杂任务，在执行中邀请合适的数字员工补齐缺口。</p><small>能力证明：复杂交付 + 协作</small></div></article>
  <article className="expert-level"><span className="level-index">04</span><ImprintMark/><div><b>专家印记</b><p>能拆解高价值任务、建立任务组，并沉淀可复用的团队经验。</p><small>能力证明：持续交付 + 带队</small></div></article>
 </div></section>
 <section className="twin-value"><div><span className="section-label">成长后的价值</span><h2>它获得的不是“聪明分”，而是可验证的工作权限。</h2></div><div className="value-grid"><article><i>独</i><b>独立接任务</b><p>只领取能力印记、授权范围和当前负载都满足的任务。</p></article><article><i>协</i><b>动态找帮手</b><p>发现能力缺口时，说明缺什么，再邀请具备资格的分身加入。</p></article><article><i>组</i><b>建立任务组</b><p>第三名执行者加入后自动建组，原任务、进度和成果保持连续。</p></article><article><i>长</i><b>用交付继续成长</b><p>真人验收后的贡献回流到具体印记，形成下一次工作的可靠依据。</p></article></div></section>
 <section className="first-twin-cta"><div><span>你的第一枚印记，会从哪项真实能力开始？</span><p>创建分身后，选择一份已经存在的工作资料即可开始。</p></div><button className="primary" onClick={onCreate}>创建我的数字分身</button></section>
 </div>;
}

function GrowthJourney({learning,capability,trial}:{learning?:Learning;capability?:Capability;trial?:Trial}){
 const current=learning?.status==='needs_clarification'?1:learning?.status==='draft'?2:capability?.status==='qualified'?4:learning?3:0;
 const trialText=trial?.status==='failed'&&!trialIsForCurrentRevision(capability,trial)?'修订已确认 · 等待复考':trial?label(trial.status):current===3?'等待运营安排独立场景':'尚未进入考核';
 const stages=[
  {title:'资料',text:learning?`${learning.source_label} · ${learning.active===false?'授权已撤回':'已授权'}`:'等待加入学习资料'},
  {title:'澄清',text:learning?.status==='needs_clarification'?'有一个判断边界需要回答':current>1?'关键边界已补充':'等待分身提出问题'},
  {title:'方法',text:learning?.status==='draft'?'等待你确认复述与边界':current>2?'方法已经真人确认':'尚未形成可复用方法'},
  {title:'考试',text:trialText},
  {title:'印记',text:capability?.status==='qualified'?`${capability.level} · ${capability.accepted_count} 次交付`:'考核通过后获得'},
 ];
 return <section className="growth-journey" aria-label="能力成长路线"><header><div><span className="section-label">当前能力</span><h2>{learning?.title||'等待第一个学习主题'}</h2></div>{learning&&<Pill>{current===4?'已获得印记':`第 ${current+1} / 5 步`}</Pill>}</header><div className="journey-list">{stages.map((stage,index)=><article key={stage.title} className={index<current?'complete':index===current?'current':'upcoming'} aria-current={index===current?'step':undefined}><i>{index<current?'✓':index+1}</i><div><b>{stage.title}</b><p>{stage.text}</p></div>{index===current&&<span>现在</span>}</article>)}</div><footer>学习不等于会做。只有通过独立考核，才会获得可接任务的能力印记。</footer></section>;
}

function Home({data,go,open,run}:{data:Workspace;go:(v:View,id?:string)=>void;open:(n:ReactNode)=>void;run:Run}){
 const twins=data.twins||[],caps=data.capabilities||[],tasks=data.tasks||[],task=tasks.find(t=>t.status==='blocked')||tasks.find(t=>t.status!=='completed')||tasks[0];
 const members=task?.member_ids.map(id=>twins.find(t=>t.id===id)).filter(Boolean) as Twin[]||[];
 const candidates=caps.filter(c=>c.status==='candidate'),relearning=caps.filter(c=>c.status==='relearning'),blocked=tasks.filter(t=>t.status==='blocked'),reviews=(data.deliverables||[]).filter(d=>d.status==='review');
 return <div className="page"><PageHead eyebrow="组织级数字员工运营台" title="运营总览" text={`当前管理 ${twins.length} 位数字员工。运营人员按组织权限统一处理考试准入、任务调度和成果验收，不与单个员工一对一绑定。`}><button className="primary" onClick={()=>open(<TaskModal data={data} run={run} close={()=>open(null)}/>)}>发布一个任务</button></PageHead>
 <div className="ops-queues"><button onClick={()=>go('people')}><span>待考核能力</span><b>{candidates.length}</b><small>查看候选能力与来源证据</small></button><button onClick={()=>go('work')}><span>需要协作介入</span><b>{blocked.length}</b><small>查看能力缺口与工作记录</small></button><button onClick={()=>go('work')}><span>等待成果验收</span><b>{reviews.length}</b><small>检查交付物，验收或退回</small></button></div>
 <div className="home-grid"><section className="ops-inbox"><header><h2>组织待办队列</h2><span>{candidates.length+relearning.length+blocked.length+reviews.length} 项</span></header>{candidates.map(c=><button key={c.id} onClick={()=>go('people',c.twin_id)}><Pill>能力准入</Pill><b>{c.name}</b><small>{twinName(data,c.twin_id)} · 教学已确认，等待安排或继续考试</small></button>)}{relearning.map(c=><button key={c.id} onClick={()=>go('people',c.twin_id)}><Pill>等待补学</Pill><b>{c.name}</b><small>{twinName(data,c.twin_id)} · 上次考试未通过，等待员工修订方法</small></button>)}{blocked.map(t=><button key={t.id} onClick={()=>go('work',t.id)}><Pill>任务求助</Pill><b>{t.title}</b><small>{t.member_ids.length} 位执行者 · 查看当前能力缺口</small></button>)}{reviews.map(d=><button key={d.id} onClick={()=>go('work',d.task_id)}><Pill>成果验收</Pill><b>{d.title}</b><small>版本 {d.version} · {d.evidence.length} 项证据</small></button>)}{!candidates.length&&!relearning.length&&!blocked.length&&!reviews.length&&<Empty title="暂无待处理事项" text={twins.length?'数字员工完成学习、报告阻塞或提交成果后，会出现在这里。':'先由员工在分身端创建数字分身并完成学习；这里负责后续考核和任务运营。'}/>}</section>
 <Stage task={task} members={members} team={(data.teams||[]).find(t=>t.id===task?.team_id)} onClick={()=>go('work',task?.id)}/></div></div>;
}

function LearningRoom({data,run,open}:{data:Workspace;run:Run;open:(n:ReactNode)=>void}){
 const id=readRoute().objectId,setId=(next:string)=>navigate('employee','learn',next);
 const[filter,setFilter]=useState('all'),[query,setQuery]=useState('');
 const list=(data.learning||[]).filter(l=>(filter==='all'||(filter==='pending'?['needs_clarification','draft'].includes(l.status):l.status==='ready_for_trial'))&&`${l.title} ${l.source_label}`.includes(query));
 const current=list.find(l=>l.id===id)||(!id?list.find(l=>['needs_clarification','draft'].includes(l.status))||list.at(-1):undefined);
 const capability=capabilityForLearning(data.capabilities||[],current);
 const trial=capability&&(data.trials||[]).filter(t=>t.capability_id===capability.id).at(-1);
 return <div className="page"><PageHead eyebrow="真实员工 → 数字员工" title="学习空间" text="导入已有复盘资料，不必重新写教程。资料形成草稿，考核后才能成为可用能力。"><button className="secondary" onClick={()=>open(<ExpertModal run={run} close={()=>open(null)}/>)}>添加真实专家</button><button className="secondary" disabled={!(data.experts||[]).length||!(data.twins||[]).length} onClick={()=>open(<LearningModal data={data} run={run} close={()=>open(null)}/>)}>记录工作经验</button><button className="primary" disabled={!(data.twins||[]).length} onClick={()=>open(<MaterialImport data={data} run={run} close={()=>open(null)}/>)}>导入已有资料</button></PageHead>
 {current&&<div className="learning-source-state"><span>{current.active===false?'授权已撤回 · 正文不再展示':`授权给 ${twinName(data,current.twin_id)} · ${current.redactions||0} 处常见密钥已遮盖 · 规则草稿，非模型学习`}</span>{current.active!==false&&<button className="secondary" onClick={()=>open(<Modal title="撤回学习授权" close={()=>open(null)}><div className="team-panel"><p>撤回「{current.title}」后，相关能力暂停，受影响任务阻塞；保留审计记录，不删除历史数据。</p><button className="primary" onClick={()=>void run(()=>api(`/v2/learning/${current.id}/revoke`,{}),'授权已撤回，相关能力与任务已标记')}>确认撤回授权</button></div></Modal>)}>撤回授权</button>}</div>}
 <div className="learning-toolbar"><label>查找学习记录<input value={query} onChange={e=>{setQuery(e.target.value);setId('')}} placeholder="经验主题或来源"/></label><div role="group" aria-label="学习记录筛选">{[['all','全部'],['pending','需要我处理'],['confirmed','已确认']].map(([value,text])=><button key={value} aria-pressed={filter===value} onClick={()=>{setFilter(value);setId('')}}>{text}</button>)}</div></div>
 <div className="learning-route-layout"><aside><GrowthJourney learning={current} capability={capability} trial={trial}/><section className="route-records"><header><h3>学习主题</h3><span>{list.length}</span></header>{list.map(l=><button className={current?.id===l.id?'selected':''} aria-pressed={current?.id===l.id} key={l.id} onClick={()=>setId(l.id)}><i className={l.status}/><span><b>{l.title}</b><small>{l.source_label} · {label(l.status)}</small></span></button>)}</section></aside><section className="teaching-room route-action">{current?<LearningAction current={current} capability={capability} trial={trial} data={data} run={run}/>:<Empty title={query||filter!=='all'?'没有匹配的学习记录':'还没有学习记录'} text={query||filter!=='all'?'调整关键词或切换到“全部”。':'先建立专家身份与数字分身，再记录已有工作经验。'}/>}</section></div></div>;
}

function LearningAction({current,capability,trial,data,run}:{current:Learning;capability?:Capability;trial?:Trial;data:Workspace;run:Run}){
 const failed=trial?.status==='failed';
 const revisionReady=Boolean(failed&&capability&&(capability.revision||1)>(trial?.capability_revision||1));
 if(failed&&!revisionReady&&current.status!=='draft')return <><header className="route-action-head"><div><span className="section-label">当前要做的事</span><h2>根据考试反馈补学</h2></div><Pill>{label(trial.status)}</Pill></header><section className="trial-recovery" role="status"><h3>上次考试未通过 · {trial.score} 分</h3><p>以下能力点没有在回答中得到证明：</p><ul>{trial.checks.filter(c=>!c.passed).map(c=><li key={c.label}>{c.label}</li>)}</ul><button className="primary" onClick={()=>void run(()=>api(`/v2/learning/${current.id}/rework`,{}),'已进入补学，请修订方法和边界')}>开始补学</button></section></>;
 if(revisionReady&&current.status==='ready_for_trial')return <><header className="route-action-head"><div><span className="section-label">当前要做的事</span><h2>等待运营安排复考</h2></div><Pill>修订已确认</Pill></header><section className="confirmed" role="status"><b>新版本方法已经提交</b><p>上一轮失败只针对旧版本。当前不需要再次补学，运营安排新一轮考试后，数字员工会独立作答。</p></section></>;
 return <><header className="route-action-head"><div><span className="section-label">当前要做的事</span><h2>{current.status==='needs_clarification'?'补充一个判断边界':current.status==='draft'?'确认分身复述的方法':'等待数字员工独立考试'}</h2></div><Pill>{label(current.status)}</Pill></header><details className="source-disclosure" open={current.status==='needs_clarification'}><summary>查看真实工作来源</summary><div className="lesson-source"><h3>{current.title}</h3><p>{current.work_record}</p><small>来源：{current.source_label}</small></div></details><div className="dialog"><Avatar name={twinName(data,current.twin_id)}/><div><b>{twinName(data,current.twin_id)} 的理解</b><p>{current.understanding}</p>{current.status==='needs_clarification'?<strong>{current.question}</strong>:<strong className="resolved-question">判断边界已确认：{current.boundary||current.answer}</strong>}</div></div>{current.status==='needs_clarification'?<InlineForm key={current.id} button="回答并继续" onSubmit={d=>run(()=>api(`/v2/learning/${current.id}/clarify`,{answer:d.get('answer')}),'回答已记录')}><label>只回答它真正不懂的地方<textarea name="answer" required minLength={5} rows={5}/></label></InlineForm>:current.status==='draft'?<InlineForm key={`${current.id}-confirm`} button={failed?'确认修订，重新进入运营考核':'确认方法，交给运营考核'} onSubmit={d=>run(()=>api(`/v2/learning/${current.id}/confirm`,{method:d.get('method'),boundary:d.get('boundary')}),failed?'修订已确认，运营可以安排新一轮考试':'候选能力已进入运营考核队列')}><label>数字员工复述的方法<textarea name="method" required minLength={5} rows={4} defaultValue={current.method||current.understanding}/></label><label>适用边界与必须找人的情况<textarea name="boundary" required minLength={5} rows={4} defaultValue={current.boundary||current.answer}/></label>{failed&&<div className="trial-feedback-inline"><b>请重点补齐</b>{trial.checks.filter(c=>!c.passed).map(c=><span key={c.label}>{c.label}</span>)}</div>}</InlineForm>:<div className="confirmed"><b>方法已经确认</b><p>运营人员只负责启动独立考试；答案由数字员工根据授权知识自主生成，考核通过前不能接单。</p></div>}</>;
}

function People({data,run,open,portal}:{data:Workspace;run:Run;open:(n:ReactNode)=>void;portal:Portal}){
 const twins=data.twins||[],caps=data.capabilities||[],trials=data.trials||[];const id=readRoute().objectId,setId=(next:string)=>navigate(portal,'people',next);const twin=twins.find(t=>t.id===id)||(!id?twins[0]:undefined),own=caps.filter(c=>c.twin_id===twin?.id);
 const employee=portal==='employee';
 if(!employee)return <OperationsAdmissions data={data} run={run} open={open}/>;
 return <div className="page"><PageHead eyebrow="我的成长档案" title="我教过什么，它真正会什么" text="每项能力都能回到你的真实经验、考核结果和禁止范围。">{!(data.experts||[]).length&&<button className="secondary" onClick={()=>open(<ExpertModal run={run} close={()=>open(null)}/>)}>建立我的专家身份</button>}<button className="primary" disabled={!(data.experts||[]).length} onClick={()=>open(<TwinModal data={data} run={run} close={()=>open(null)}/>)}>创建我的数字分身</button></PageHead><div className={`people-layout ${twins.length<=1?'single-twin':''}`}>{twins.length>1&&<aside className="roster" aria-label="切换数字分身">{twins.map(t=><button className={t.id===twin?.id?'active':''} key={t.id} onClick={()=>setId(t.id)}><Avatar name={t.name}/><span><b>{t.name}</b><small>{t.role_goal}</small></span></button>)}</aside>}<section className="dossier">{twin?<><header><div className="person"><Avatar name={twin.name}/><div><b>{twin.name}</b><small>{twin.role_goal}</small></div></div><Pill>{label(twin.status)}</Pill></header><div className="evidence-map"><span>{twin.name}<small>当前放权：{label(twin.delegation)}</small></span>{own.map((c,i)=><article className={`c${i+1}`} key={c.id}><b>{c.name}</b><small>{c.level}</small><p>{c.boundary}</p></article>)}</div><section className="cap-list"><h3>能力印记与证据</h3>{own.length?own.map(c=><CapabilityTrialRow key={c.id} capability={c} trials={trials.filter(t=>t.capability_id===c.id)} employee run={run} open={open}/>):<Empty title="还没有候选能力" text="先在学习空间完成一次真实经验学习与边界确认。"/>}</section></>:<Empty title="还没有数字分身" text="先建立你的专家身份，再创建数字分身。"/>}</section></div></div>;
}

type AdmissionFilter='all'|'action'|'open'|'failed'|'relearning'|'qualified';

function OperationsAdmissions({data,run,open}:{data:Workspace;run:Run;open:(n:ReactNode)=>void}){
 const twins=data.twins||[],caps=data.capabilities||[],trials=data.trials||[],learning=data.learning||[];
 const[filter,setFilter]=useState<AdmissionFilter>('action'),[twinId,setTwinId]=useState('all'),[query,setQuery]=useState('');
 const deferredQuery=useDeferredValue(query.trim().toLowerCase());
 const latest=(capability:Capability)=>trials.filter(t=>t.capability_id===capability.id).at(-1);
 const isAction=(capability:Capability)=>capability.status!=='qualified'&&capability.status!=='revoked';
 const isCurrentFailure=(capability:Capability)=>{const trial=latest(capability);return trial?.status==='failed'&&(capability.revision||1)<=(trial.capability_revision||1)};
 const counts={action:caps.filter(isAction).length,open:caps.filter(c=>latest(c)?.status==='open').length,failed:caps.filter(c=>isCurrentFailure(c)&&c.status!=='relearning').length,relearning:caps.filter(c=>c.status==='relearning').length,qualified:caps.filter(c=>c.status==='qualified').length};
 const visible=caps.filter(capability=>{
  const trial=latest(capability),owner=twins.find(t=>t.id===capability.twin_id);
  const matchesFilter=filter==='all'||filter==='action'&&isAction(capability)||filter==='open'&&trial?.status==='open'||filter==='failed'&&isCurrentFailure(capability)||filter==='relearning'&&capability.status==='relearning'||filter==='qualified'&&capability.status==='qualified';
  return matchesFilter&&(twinId==='all'||capability.twin_id===twinId)&&(!deferredQuery||`${capability.name} ${owner?.name||''} ${capability.method}`.toLowerCase().includes(deferredQuery));
 }).sort((a,b)=>{
  const rank=(c:Capability)=>c.status==='relearning'?0:latest(c)?.status==='failed'?1:latest(c)?.status==='open'?2:c.status==='candidate'?3:c.status==='qualified'?4:5;
  return rank(a)-rank(b);
 });
 return <div className="page admissions-page">
  <header className="admissions-head"><div><span className="section-label">组织数字员工运营</span><h1>考核与准入</h1><p>运营人员统一处理考试、失败反馈与能力放权。先解决待办，再查看已准入能力。</p></div><div className="admissions-scope"><span>管理范围</span><b>{twins.length} 位数字员工</b><small>{caps.length} 项能力记录</small></div></header>
  <section className="admission-metrics" aria-label="考核队列概况">
   <button className={filter==='action'?'active':''} onClick={()=>setFilter('action')}><span>全部待处理</span><b>{counts.action}</b><small>需要运营推进</small></button>
   <button className={filter==='open'?'active':''} onClick={()=>setFilter('open')}><span>待启动考试</span><b>{counts.open}</b><small>场景已经生成</small></button>
   <button className={filter==='failed'?'active':''} onClick={()=>setFilter('failed')}><span>考试未通过</span><b>{counts.failed}</b><small>需要退回补学</small></button>
   <button className={filter==='relearning'?'active':''} onClick={()=>setFilter('relearning')}><span>正在补学</span><b>{counts.relearning}</b><small>等待员工修订</small></button>
   <button className={filter==='qualified'?'active':''} onClick={()=>setFilter('qualified')}><span>已准入能力</span><b>{counts.qualified}</b><small>具备接单资格</small></button>
  </section>
  <section className="admission-toolbar"><div role="group" aria-label="能力状态筛选">{([['action','待处理'],['all','全部能力'],['open','待考试'],['failed','未通过'],['relearning','补学中'],['qualified','已准入']] as [AdmissionFilter,string][]).map(([value,text])=><button key={value} aria-pressed={filter===value} onClick={()=>setFilter(value)}>{text}</button>)}</div><label><span>数字员工</span><select value={twinId} onChange={e=>setTwinId(e.target.value)}><option value="all">全部员工</option>{twins.map(t=><option key={t.id} value={t.id}>{t.name} · {t.role_goal}</option>)}</select></label><label className="admission-search"><span>搜索能力</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="能力名称或员工"/></label></section>
  <section className="admission-queue"><header><div><span className="section-label">{filter==='qualified'?'能力名册':'运营待办'}</span><h2>{filter==='qualified'?'已通过验证的能力':'按优先级推进能力准入'}</h2></div><span role="status" aria-atomic="true">当前显示 {visible.length} 项</span></header>
   <div>{visible.map(capability=><AdmissionCard key={capability.id} capability={capability} owner={twins.find(t=>t.id===capability.twin_id)} learning={learning.find(l=>capability.learning_ids?.includes(l.id))} trials={trials.filter(t=>t.capability_id===capability.id)} run={run} open={open}/>)}{!visible.length&&<Empty title="当前筛选下没有能力记录" text="切换状态或数字员工后再查看。"/>}</div>
  </section>
 </div>;
}

function AdmissionCard({capability:c,owner,learning,trials,run,open}:{capability:Capability;owner?:Twin;learning?:Learning;trials:Trial[];run:Run;open:(n:ReactNode)=>void}){
 const trial=trials.at(-1),retryReady=Boolean(trial?.status==='failed'&&c.status==='candidate'&&(c.revision||1)>(trial.capability_revision||1));
 const failedChecks=trial?.checks.filter(check=>!check.passed)||[];
 const currentFailure=Boolean(trial?.status==='failed'&&(c.revision||1)<=(trial.capability_revision||1));
 const state=c.status==='relearning'?'正在补学':retryReady?'等待安排复考':currentFailure?'考试未通过':trial?.status==='open'?'等待启动考试':trial?.status==='running'?'考试进行中':c.status==='qualified'?'已准入':!trial?'等待安排考试':label(c.status);
 const stateKey=c.status==='relearning'?'relearning':retryReady?'retry-ready':trial?.status||c.status;
 return <article className={`admission-card state-${stateKey}`}><header><div className="admission-owner"><Avatar name={owner?.name||'员'}/><span><b>{owner?.name||'未知员工'}</b><small>{owner?.role_goal||'未设置岗位目标'}</small></span></div><span className="admission-state">{state}</span></header><div className="admission-card-body"><section><h3>{c.name}</h3><p className="admission-method">{c.method}</p><dl><div><dt>判断边界</dt><dd>{c.boundary}</dd></div><div><dt>学习来源</dt><dd>{learning?.source_label||`${c.learning_ids?.length||0} 条授权学习记录`}</dd></div></dl>{failedChecks.length>0&&<div className="admission-gaps"><b>本轮未证明</b>{failedChecks.map(check=><span key={check.label}>{check.label}</span>)}</div>}</section><aside>{trial?<><strong>{trial.score??'—'}<small>分</small></strong><span>第 {trials.length} 次考试</span></>:<><strong>—</strong><span>尚未考试</span></>}</aside></div><footer><button className="secondary" onClick={()=>open(<EvidenceDetail id={c.id} close={()=>open(null)}/>)}>查看来源与证据</button><div>{trial?.status==='open'&&<button className="primary" onClick={()=>void run(()=>api(`/v2/trials/${trial.id}/run`,{mode:'auto'}),'数字员工已独立完成考试')}>启动数字员工考试</button>}{trial?.status==='running'&&<span className="next-step">数字员工正在独立作答…</span>}{trial?.status==='failed'&&!retryReady&&c.status==='candidate'&&<button className="primary" disabled={!c.learning_ids?.[0]} onClick={()=>void run(()=>api(`/v2/learning/${c.learning_ids?.[0]}/rework`,{}),'已退回员工端补学')}>退回补学</button>}{trial?.status==='failed'&&c.status==='relearning'&&<span className="next-step">等待员工修订并重新确认</span>}{retryReady&&<button className="primary" onClick={()=>void run(()=>api(`/v2/capabilities/${c.id}/trial`,{}),'新一轮考试已生成')}>安排下一轮考试</button>}{!trial&&c.status!=='qualified'&&<button className="primary" onClick={()=>void run(()=>api(`/v2/capabilities/${c.id}/trial`,{}),'考试场景已生成，等待启动数字员工')}>安排考试</button>}{c.status==='qualified'&&<span className="qualified-note">已获得 {c.level} · {c.accepted_count} 次交付验收</span>}</div></footer></article>;
}

function CapabilityTrialRow({capability:c,trials,employee,run,open}:{capability:Capability;trials:Trial[];employee:boolean;run:Run;open:(n:ReactNode)=>void}){
 const trial=trials.at(-1);
 const retryReady=Boolean(trial?.status==='failed'&&c.status==='candidate'&&(c.revision||1)>(trial.capability_revision||1));
 return <article><div><Pill>{label(c.status)}</Pill><h3>{c.name}</h3><p>{c.method}</p><small>边界：{c.boundary}</small>{trial?.runtime&&<RuntimeTraceView runtime={trial.runtime}/>} {trial?.status==='failed'&&<div className="trial-checks"><b>第 {trials.length} 次考试反馈</b>{trial.checks.map(check=><span key={check.label} className={check.passed?'passed':'failed'}>{check.passed?'通过':'未通过'} · {check.label}</span>)}</div>}</div><aside>{trial?<><b>{trial.score??'—'}</b><small>{label(trial.status)} · 第 {trials.length} 次</small>{!employee&&trial.status==='open'&&<button className="primary" onClick={()=>void run(()=>api(`/v2/trials/${trial.id}/run`,{mode:'auto'}),'数字员工已独立完成考试')}>启动数字员工考试</button>}{!employee&&trial.status==='running'&&<small className="next-step">数字员工正在独立作答…</small>}{!employee&&trial.status==='failed'&&!retryReady&&c.status==='candidate'&&<button onClick={()=>void run(()=>api(`/v2/learning/${c.learning_ids?.[0]}/rework`,{}),'已退回员工端补学')}>退回补学</button>}{!employee&&trial.status==='failed'&&c.status==='relearning'&&<small className="next-step">等待员工修订方法</small>}{!employee&&retryReady&&<button onClick={()=>void run(()=>api(`/v2/capabilities/${c.id}/trial`,{}),'新一轮考试已生成')}>安排下一轮考试</button>}{!employee&&trial.status==='passed'&&<small className="next-step">考试通过 · 已获得新手印记</small>}</>:employee?<small>等待运营启动独立考试</small>:<button onClick={()=>void run(()=>api(`/v2/capabilities/${c.id}/trial`,{}),'考试场景已生成，等待启动数字员工')}>安排考试</button>}{!employee&&trial?.status==='failed'&&<button className="secondary" onClick={()=>open(<EvidenceDetail id={c.id} close={()=>open(null)}/>)}>查看记录</button>}{!employee&&trial?.status==='failed'&&!retryReady&&c.status==='candidate'&&<small>员工补学并重新确认后，才能安排下一轮</small>}</aside></article>;
}

function Work({data,run,open}:{data:Workspace;run:Run;open:(n:ReactNode)=>void}){
 const tasks=data.tasks||[],twins=data.twins||[];const id=readRoute().objectId,setId=(next:string)=>navigate('operations','work',next);const task=tasks.find(t=>t.id===id)||(!id?tasks[0]:undefined),members=task?.member_ids.map(x=>twins.find(t=>t.id===x)).filter(Boolean) as Twin[]||[],latest=(data.deliverables||[]).filter(d=>d.task_id===task?.id).at(-1);
 const activeRun=(data.task_runs||[]).filter(r=>r.task_id===task?.id).at(-1);
 return <div className="page"><PageHead eyebrow="任务与成果" title="运营发布目标，数字员工自主完成" text="运营人员负责目标、权限和验收；数字员工根据已验证能力自主认领、检索授权知识并提交有来源的成果草稿。"><button className="primary" onClick={()=>open(<TaskModal data={data} run={run} close={()=>open(null)}/>)}>发布新任务</button></PageHead><div className={`work-layout ${tasks.length<=1?'single-task':''}`}>{tasks.length>1&&<aside className="task-list" aria-label="切换任务">{tasks.map(t=><button className={t.id===task?.id?'active':''} key={t.id} onClick={()=>setId(t.id)}><i className={t.status}/><span><b>{t.title}</b><small>{label(t.status)} · {t.member_ids.length} 人</small></span></button>)}</aside>}<section className="workroom">{task?<><header><div><Pill>{label(task.status)}</Pill><h2>{task.title}</h2><p>{task.goal}</p></div><b className="progress">{task.progress}%</b></header>{task.status==='assessing'&&<section className="autonomous-launch"><div><span className="section-label">下一步</span><h3>让合格的数字员工自主认领并执行</h3><p>系统将校验能力资格和负载，再读取已授权经验。无真实模型时使用明确标注的本地规则引擎，不会伪造外部系统执行结果。</p></div><button className="primary" onClick={()=>void run(()=>api(`/v2/tasks/${task.id}/run`,{mode:'auto'}),'数字员工已自主认领并提交成果草稿')}>启动数字员工</button></section>}{members.length>0&&<><Stage task={task} members={members} team={(data.teams||[]).find(t=>t.id===task.team_id)} compact/>{activeRun&&<RuntimeTraceView runtime={activeRun}/>} {task.status==='working'&&<div className="work-actions"><button className="primary" onClick={()=>void run(()=>api(`/v2/tasks/${task.id}/run`,{mode:'auto'}),'数字员工已继续执行并提交成果草稿')}>让数字员工继续执行</button><button onClick={()=>open(<UpdateModal task={task} twins={members} run={run} close={()=>open(null)}/>)}>人工校准记录</button><button onClick={()=>open(<InviteModal task={task} data={data} run={run} close={()=>open(null)}/>)}>人工批准协作者</button></div>}</>}{(data.updates||[]).filter(u=>u.task_id===task.id).length>0&&<section className="timeline"><h3>工作记录</h3>{(data.updates||[]).filter(u=>u.task_id===task.id).map(u=><article key={u.id}><i/><div><small>{twinName(data,u.twin_id)} · {u.kind==='help'?'请求帮助':'进展'}</small><p>{u.summary}</p></div></article>)}</section>}{latest&&<Result deliverable={latest} run={run} open={open}/>}</>:<Empty title="还没有任务" text="发布真实目标，让数字员工根据已验证能力决定是否接单。"/>}</section></div></div>;
}

function Stage({task,members,team,onClick,compact=false}:{task?:Task;members:Twin[];team?:Team;onClick?:()=>void;compact?:boolean}){return <section className={`work-stage ${compact?'compact':''}`}><header><div><Eyebrow light>工作现场 · LIVE</Eyebrow><h2>{task?label(task.status):'还没有任务发生'}</h2></div><span className="live"><i/>实时状态</span></header>{task?<><div className="task-chip"><small>{task.id}</small><b>{task.title}</b><span>{task.progress}%</span></div>{team&&<div className="team-formed"><b>{team.name} 已成立</b><span>第三名成员加入 · 原任务、进度与成果保持连续</span></div>}<div className={`workers count-${members.length}`}>{members.map((m,i)=><div className={`worker w${i+1}`} key={m.id}><Avatar name={m.name}/><b>{m.name}</b><small>{i===0?'任务负责人':'协作成员'}</small><em>{m.role_goal}</em></div>)}{!members.length&&<div className="waiting"><b>?</b><p>数字员工正在判断能否接单，以及需要谁来帮忙。</p></div>}</div><footer><span>{team?`${members.length} 位数字员工正在共同推进`:members.length===1?'一人独立执行':members.length===2?'两人协作中':'等待员工认领'}</span>{onClick&&<button onClick={onClick}>进入现场 →</button>}</footer></>:<Empty dark title="发布第一个真实任务" text="员工会解释为什么能接、哪里不会，并在执行中寻找帮手。"/>}</section>}
function RuntimeTraceView({runtime}:{runtime:RuntimeTrace|TaskRun}){return <details className="runtime-trace"><summary>查看数字员工运行依据</summary><div><b>{runtime.engine}</b><small>{runtime.mode==='live'?'服务端真实模型':'本地规则引擎 · 明确标注'}</small>{runtime.external_execution===false&&<p>未连接外部业务系统：这是有来源的执行方案与成果草稿，不代表真实压测或变更已发生。</p>}<ol>{runtime.trajectory?.map((step,index)=><li key={index}>{step}</li>)}</ol><small>引用 {runtime.citations?.length||0} 条授权记录</small></div></details>}
function Result({deliverable,run,open}:{deliverable:Deliverable;run:Run;open:(n:ReactNode)=>void}){return <section className="result"><header><div><Eyebrow>成果 v{deliverable.version}</Eyebrow><h3>{deliverable.title}</h3></div><Pill>{label(deliverable.status)}</Pill></header>{deliverable.runtime&&<RuntimeTraceView runtime={deliverable.runtime}/>}<p className="result-content">{deliverable.content}</p><section className="delivery-evidence"><h4>成果依据</h4>{deliverable.evidence.length?<ol>{deliverable.evidence.map((e,i)=><li key={i}>{e}</li>)}</ol>:<p>未提交依据，请在验收前确认是否足够。</p>}<h4>成员能力贡献</h4>{deliverable.contributions?.length?deliverable.contributions.map(c=><article key={c.capability_id}><b>{c.capability_name}</b><p>{c.summary}</p><ul>{c.evidence_indexes.map(i=><li key={i}>依据 {i+1}：{deliverable.evidence[i]}</li>)}</ul></article>):<p>未关联能力贡献，本次验收不会产生能力成长。</p>}{deliverable.feedback&&<><h4>验收反馈</h4><p>{deliverable.feedback}</p></>}</section>{deliverable.status==='review'&&<div><button onClick={()=>open(<DecisionModal deliverable={deliverable} decision="rework" run={run} close={()=>open(null)}/>)}>退回修订</button><button className="primary" onClick={()=>open(<DecisionModal deliverable={deliverable} decision="accepted" run={run} close={()=>open(null)}/>)}>验收通过</button></div>}</section>}

function Auth({done}:{done:()=>Promise<void>}){const[mode,setMode]=useState<'register'|'login'>('register'),[error,setError]=useState('');const submit=async(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const d=new FormData(e.currentTarget);try{await api(`/auth/${mode}`,mode==='register'?{name:d.get('name'),email:d.get('email'),password:d.get('password')}:{email:d.get('email'),password:d.get('password')});await done()}catch(x){setError(x instanceof Error?x.message:'无法继续')}};return <div className="auth"><section><Brand light/><div><Eyebrow light>不是创建聊天机器人</Eyebrow><h1>从真实工作里，<br/>孵化真正会做事的数字员工。</h1><p>它会主动问不懂的地方，通过试岗证明能力，在任务中寻找协作者。</p></div><ol><li><b>01</b>从真实工作学习</li><li><b>02</b>通过试岗获得能力</li><li><b>03</b>独立接单与动态组队</li></ol></section><main><form onSubmit={submit}><Eyebrow>{mode==='register'?'创建工作区账号':'欢迎回来'}</Eyebrow><h2>{mode==='register'?'开始孵化数字员工':'登录分身工场'}</h2><div className="tabs"><button type="button" className={mode==='register'?'active':''} onClick={()=>setMode('register')}>注册</button><button type="button" className={mode==='login'?'active':''} onClick={()=>setMode('login')}>登录</button></div>{mode==='register'&&<Field label="你的姓名" name="name" placeholder="例如：李芳军"/>}<Field label="工作邮箱" name="email" type="email" placeholder="name@company.com"/><Field label="密码" name="password" type="password" placeholder="至少 6 位"/>{error&&<p className="form-error">{error}</p>}<button className="primary">继续进入产品</button></form></main></div>}
function Bootstrap({run}:{run:Run}){return <div className="setup"><form onSubmit={e=>{e.preventDefault();const d=new FormData(e.currentTarget);void run(()=>api('/v2/bootstrap',{organization_name:d.get('name')}),'团队空间已创建')}}><Eyebrow>建立团队空间</Eyebrow><h1>从一位真实专家，<br/>孵化第一位数字员工。</h1><p>团队空间是经验授权、数字员工、任务和成果的共同边界。</p><Field label="团队或组织名称" name="name" placeholder="例如：稳定性工程团队"/><button className="primary">建立空间并开始</button></form></div>}

function Modal({title,close,children}:{title:string;close:()=>void;children:ReactNode}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;const dialog=ref.current;dialog?.showModal();return()=>{dialog?.close();if(previous?.isConnected)previous.focus()}},[]);
 return <dialog ref={ref} className="modal native-modal" aria-label={title} onCancel={e=>{e.preventDefault();close()}} onClick={e=>{if(e.target===e.currentTarget){const rect=e.currentTarget.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)close()}}}><header><h2>{title}</h2><button aria-label="关闭弹窗" onClick={close}>×</button></header>{children}</dialog>;
}
type EvidenceBundle={capability:{name:string;level:string;status:string};sources:{id:string;title:string;source_label:string;active:boolean;text:string|null;confirmed_method:string|null;confirmed_boundary:string|null;confirmed_by:string|null}[];trials:Trial[];qualification_note:string;delivery_note:string;accepted_count:number};
function EvidenceLinks({data,open}:{data:Workspace;open:(node:ReactNode)=>void}){
 const selected=readRoute().objectId||data.twins?.[0]?.id;
 const capabilities=(data.capabilities||[]).filter(c=>c.twin_id===selected);
 return <section className="page evidence-links"><h2>能力依据</h2><p>打开具体能力，检查来源、确认内容与考核，不用根据等级猜测可信度。</p>{capabilities.map(c=><button className="secondary" key={c.id} onClick={()=>open(<EvidenceDetail id={c.id} close={()=>open(null)}/>)}>{c.name} · 查看证据</button>)}</section>;
}
function EvidenceDetail({id,close}:{id:string;close:()=>void}){
 const[data,setData]=useState<EvidenceBundle|null>(null),[error,setError]=useState('');
 useEffect(()=>{let active=true;void api<EvidenceBundle>(`/v2/capabilities/${id}/evidence`).then(d=>{if(active)setData(d)}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[id]);
 return <Modal title="能力证据" close={close}><div className="team-panel evidence-detail">{error&&<p role="alert" className="form-error">{error}</p>}{!data&&!error&&<p>正在读取能力依据…</p>}{data&&<><h2>{data.capability.name}</h2><Pill>{label(data.capability.status)}</Pill><h3>来源资料与真人确认</h3>{data.sources.map(s=><section key={s.id}><h3>{s.title}</h3><p>来源：{s.source_label}</p>{s.active?<><details><summary>查看来源原文</summary><pre>{s.text}</pre></details><h4>真人确认的方法</h4><p>{s.confirmed_method}</p><h4>真人确认的边界</h4><p>{s.confirmed_boundary}</p><small>确认记录属于真实账号；不等于通过考核。</small></>:<p className="form-error">授权已撤回，正文与确认内容停止展示。</p>}</section>)}<h3>考核记录</h3><p>{data.qualification_note}</p>{data.trials.length?data.trials.map(t=><details key={t.id}><summary>{label(t.status)} · {t.score??'未评分'} 分</summary><p>{t.scenario}</p><pre>{t.response||'尚未提交作答'}</pre>{t.checks.map(c=><p key={c.label}>{c.passed?'通过':'未通过'}：{c.label}</p>)}</details>):<p>暂无可用考核记录。</p>}<h3>交付证据</h3><p>{data.delivery_note}</p><CapabilityCredits id={id}/></>}</div></Modal>;
}
type CapabilityCredit={id:string;task_title:string;deliverable_title:string;version:number;summary:string;evidence:string[];feedback:string;reviewed_by:string};
function CapabilityCredits({id}:{id:string}){
 const[credits,setCredits]=useState<CapabilityCredit[]|null>(null),[error,setError]=useState('');
 useEffect(()=>{let active=true;void api<{deliveries:CapabilityCredit[]}>(`/v2/capabilities/${id}/evidence`).then(d=>{if(active)setCredits(d.deliveries)}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[id]);
 return <div className="credit-list">{error&&<p role="alert">{error}</p>}{credits===null&&!error&&<p>正在读取贡献记录…</p>}{credits?.length===0&&<p>暂无逐能力验收证据；历史计数不用于证明本项能力。</p>}{credits?.map(c=><article key={c.id}><b>{c.task_title}</b><small>{c.deliverable_title} · 版本 {c.version}</small><p>实际贡献：{c.summary}</p><ul>{c.evidence.map((e,i)=><li key={i}>{e}</li>)}</ul><p>真人验收：{c.feedback}</p><small>验收账号：{c.reviewed_by}</small></article>)}</div>;
}
function ModalForm({children,submit,labelText='确认并继续'}:{children:ReactNode;submit:(d:FormData)=>Promise<void>;labelText?:string}){return <form className="form" onSubmit={e=>{e.preventDefault();void submit(new FormData(e.currentTarget))}}>{children}<button className="primary">{labelText}</button></form>}
function ExpertModal({run,close}:{run:Run;close:()=>void}){return <Modal title="添加真实专家" close={close}><ModalForm submit={d=>run(()=>api('/v2/experts',{name:d.get('name'),role:d.get('role'),knowledge_scope:d.get('scope')}),'真实专家已添加')}><Field label="姓名" name="name" placeholder="例如：李芳军"/><Field label="岗位与专长" name="role" placeholder="稳定性专家"/><label>允许数字员工学习的范围<textarea name="scope" required minLength={3} rows={4}/></label></ModalForm></Modal>}
function TwinModal({data,run,close}:{data:Workspace;run:Run;close:()=>void}){return <Modal title="创建数字员工" close={close}><ModalForm submit={d=>run(()=>api('/v2/twins',{name:d.get('name'),role_goal:d.get('goal'),expert_id:d.get('expert')}),'数字员工已创建')}><Field label="数字员工姓名" name="name" placeholder="例如：晓禾"/><label>从谁的工作中学习<select name="expert">{(data.experts||[]).map(x=><option value={x.id} key={x.id}>{x.name} · {x.role}</option>)}</select></label><label>岗位目标<textarea name="goal" required minLength={3} rows={4}/></label></ModalForm></Modal>}
function LearningModal({data,run,close}:{data:Workspace;run:Run;close:()=>void}){return <Modal title="记录一段真实工作" close={close}><ModalForm submit={d=>run(()=>api('/v2/learning',{expert_id:d.get('expert'),twin_id:d.get('twin'),title:d.get('title'),source_label:d.get('source'),work_record:d.get('record')}),'学习记录已生成')}><label>真实员工<select name="expert">{(data.experts||[]).map(x=><option value={x.id} key={x.id}>{x.name}</option>)}</select></label><label>数字员工<select name="twin">{(data.twins||[]).map(x=><option value={x.id} key={x.id}>{x.name}</option>)}</select></label><Field label="这段经验是什么" name="title" placeholder="例如：压测异常诊断"/><Field label="已有工作来源" name="source" placeholder="Oncall 群 + 复盘文档"/><label>已经发生的工作过程<textarea name="record" required minLength={10} rows={8}/></label></ModalForm></Modal>}
function TrialModal({trial,run,close}:{trial:Trial;run:Run;close:()=>void}){return <Modal title="能力试岗" close={close}><div className="scenario">{trial.scenario}</div><ModalForm labelText="提交试岗并评分" submit={d=>run(()=>api(`/v2/trials/${trial.id}/submit`,{response:d.get('response')}),'试岗已评分')}><label>数字员工的判断与行动计划<textarea name="response" required minLength={10} rows={9}/></label></ModalForm></Modal>}
function TaskModal({data,run,close}:{data:Workspace;run:Run;close:()=>void}){const names=(data.capabilities||[]).filter(c=>c.status==='qualified').map(c=>c.name);const submit=(d:FormData)=>api('/v2/tasks',{title:d.get('title'),goal:d.get('goal'),expected_output:d.get('output'),required_capabilities:String(d.get('capabilities')).split(/[、,，]/).map(x=>x.trim()).filter(Boolean)});return <Modal title="发布新任务" close={close}><ModalForm submit={d=>run(()=>submit(d),'任务已发布')}><Field label="任务名称" name="title" placeholder="完成 48 小时长稳压测"/><label>任务目标<textarea name="goal" required minLength={5} rows={4}/></label><Field label="期望成果" name="output" placeholder="压测报告、结论与风险"/><Field label="需要的能力（逗号分隔）" name="capabilities" placeholder={names.join('、')||'例如：压测异常诊断'}/></ModalForm></Modal>}
function UpdateModal({task,twins,run,close}:{task:Task;twins:Twin[];run:Run;close:()=>void}){return <Modal title="更新工作进展" close={close}><ModalForm submit={d=>run(()=>api(`/v2/tasks/${task.id}/updates`,{twin_id:d.get('twin'),kind:d.get('kind'),summary:d.get('summary'),missing_capability:d.get('missing')}),'工作状态已更新')}><label>执行员工<select name="twin">{twins.map(x=><option value={x.id} key={x.id}>{x.name}</option>)}</select></label><label>更新类型<select name="kind"><option value="progress">正常进展</option><option value="help">发现能力缺口，需要帮助</option></select></label><label>发生了什么<textarea name="summary" required minLength={3} rows={5}/></label><Field label="缺少的能力（求助时填写）" name="missing" placeholder="数据库连接池分析"/></ModalForm></Modal>}
function InviteModal({task,data,run,close}:{task:Task;data:Workspace;run:Run;close:()=>void}){const candidates=(data.twins||[]).filter(t=>!task.member_ids.includes(t.id));return <Modal title="邀请数字员工加入" close={close}><ModalForm submit={d=>run(()=>api(`/v2/tasks/${task.id}/invite`,{twin_id:d.get('twin'),reason:d.get('reason')}),'协作者已加入')}><label>邀请谁<select name="twin">{candidates.map(x=><option value={x.id} key={x.id}>{x.name} · {x.role_goal}</option>)}</select></label><label>为什么需要它<textarea name="reason" required minLength={3} rows={5}/></label><p className="hint">第三名执行成员加入时自动建立任务组。</p></ModalForm></Modal>}
function DeliverableModal({task,twins,run,close}:{task:Task;twins:Twin[];run:Run;close:()=>void}){
 const[caps,setCaps]=useState<Capability[]>([]),[rows,setRows]=useState([{key:0,capabilityId:''}]),[error,setError]=useState('');
 useEffect(()=>{let active=true;void api<Workspace>('/v2/workspace?portal=operations').then(w=>{if(active)setCaps((w.capabilities||[]).filter(c=>c.status==='qualified'&&task.member_ids.includes(c.twin_id)))}).catch(e=>setError(e.message));return()=>{active=false}},[task.id]);
 return <Modal title="提交任务成果" close={close}><ModalForm submit={d=>run(()=>api(`/v2/tasks/${task.id}/deliverables`,{
  twin_id:d.get('twin'),title:d.get('title'),content:d.get('content'),
  evidence:String(d.get('evidence')).split('\n').map(x=>x.trim()).filter(Boolean),
  contributions:rows.filter(r=>r.capabilityId).map(r=>({capability_id:r.capabilityId,summary:d.get(`contribution_summary_${r.key}`),
   evidence_indexes:String(d.get(`indexes_${r.key}`)).split(/[,，]/).map(x=>Number(x.trim())-1)})),
 }),'成果已提交，贡献将在真人验收后回流')}>
 <label>提交人<select name="twin">{twins.map(x=><option value={x.id} key={x.id}>{x.name}</option>)}</select></label>
 <Field label="成果名称" name="title" placeholder="长稳压测报告 v1"/>
 <label>成果内容<textarea name="content" required minLength={10} rows={7}/></label>
 <label>成果证据（每行一项，顺序编号从 1 开始）<textarea name="evidence" rows={4}/></label>
 <section className="contribution-form"><h3>能力贡献</h3><p>只为有证据的实际贡献记账。暂不关联也可提交，但不会产生能力成长。</p>
 {rows.map((r,index)=><fieldset className="contribution-row" key={r.key}><legend>贡献 {index+1}</legend><label>关联哪项能力<select value={r.capabilityId} onChange={e=>setRows(items=>items.map(item=>item.key===r.key?{...item,capabilityId:e.target.value}:item))}><option value="">暂不关联能力</option>{caps.filter(c=>c.id===r.capabilityId||!rows.some(item=>item.capabilityId===c.id)).map(c=><option value={c.id} key={c.id}>{twins.find(t=>t.id===c.twin_id)?.name} · {c.name}</option>)}</select></label>
 {r.capabilityId&&<><label>这项能力实际贡献了什么<textarea name={`contribution_summary_${r.key}`} required minLength={5} rows={3}/></label><label>引用上方证据编号<input name={`indexes_${r.key}`} required placeholder="例如：1,2" pattern="[0-9]+([,，][ ]*[0-9]+)*"/></label></>}
 {rows.length>1&&<button type="button" className="secondary" onClick={()=>setRows(items=>items.filter(item=>item.key!==r.key))}>移除贡献 {index+1}</button>}</fieldset>)}
 <button type="button" className="secondary" disabled={rows.length>=caps.length||rows.length>=30} onClick={()=>setRows(items=>[...items,{key:Math.max(...items.map(r=>r.key))+1,capabilityId:''}])}>添加一项成员贡献</button>
 {error&&<p role="alert" className="form-error">{error}</p>}</section>
 </ModalForm></Modal>;
}
function DecisionModal({deliverable,decision,run,close}:{deliverable:Deliverable;decision:'accepted'|'rework';run:Run;close:()=>void}){return <Modal title={decision==='accepted'?'验收成果':'退回修订'} close={close}><ModalForm labelText={decision==='accepted'?'确认验收，经验回流':'退回并保留原任务'} submit={d=>run(()=>api(`/v2/deliverables/${deliverable.id}/decision`,{decision,feedback:d.get('feedback')}),decision==='accepted'?'成果已验收':'成果已退回')}><label>{decision==='accepted'?'验收说明':'需要修改什么'}<textarea name="feedback" required minLength={3} rows={6}/></label></ModalForm></Modal>}

function Brand({light=false,product}:{light?:boolean;product?:string}){return <div className={`brand ${light?'light':''}`}><span><i/><i/><i/></span><div><b>{product||'分身工场'}</b><small>AGENT WORKFORCE LAB</small></div></div>}
function Eyebrow({children,light=false}:{children:ReactNode;light?:boolean}){return <span className={`eyebrow ${light?'light':''}`}>{children}</span>}
function PageHead({eyebrow,title,text,children}:{eyebrow:string;title:string;text:string;children?:ReactNode}){return <header className="page-head"><div><Eyebrow>{eyebrow}</Eyebrow><h1>{title}</h1><p>{text}</p></div><aside>{children}</aside></header>}
function Action({n,hint,title,onClick}:{n:string;hint:string;title:string;onClick:()=>void}){return <button onClick={onClick}><i>{n}</i><span><small>{hint}</small><b>{title}</b></span><em>→</em></button>}
function Avatar({name}:{name:string}){return <span className="avatar">{name[0]}<i/></span>}
function Pill({children}:{children:ReactNode}){return <span className="pill">{children}</span>}
function Empty({title,text,action,onClick,dark=false}:{title:string;text:string;action?:string;onClick?:()=>void;dark?:boolean}){return <div className={`empty ${dark?'dark':''}`}><i>＋</i><b>{title}</b><p>{text}</p>{action&&<button onClick={onClick}>{action}</button>}</div>}
function Field({label,name,placeholder,type='text'}:{label:string;name:string;placeholder:string;type?:string}){return <label>{label}<input name={name} placeholder={placeholder} type={type} required minLength={type==='password'?6:1}/></label>}
function InlineForm({children,onSubmit,button}:{children:ReactNode;onSubmit:(d:FormData)=>Promise<void>;button:string}){return <form className="inline-form" onSubmit={e=>{e.preventDefault();void onSubmit(new FormData(e.currentTarget))}}>{children}<button className="primary">{button}</button></form>}
function twinName(data:Workspace,id:string){return data.twins?.find(t=>t.id===id)?.name||'数字员工'}
function label(value:string){return ({apprentice:'学徒期',available:'可接任务',observe:'观察学习',recommend:'只读建议',needs_clarification:'等待专家回答',draft:'等待确认方法',ready_for_trial:'待考试',candidate:'候选能力',relearning:'补学中',qualified:'已验证能力',open:'等待启动',running:'自主运行中',passed:'考试通过',failed:'需要补学',assessing:'等待自主认领',working:'执行中',blocked:'请求帮助',review:'等待真人验收',completed:'已验收',accepted:'已接受',rework:'退回修订'} as Record<string,string>)[value]||value}
