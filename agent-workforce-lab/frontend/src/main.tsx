import React, {useEffect, useRef, useState, type ReactNode} from 'react';
import {createRoot} from 'react-dom/client';
import Campus, {Person} from './Campus';
import {SectionTabs, GrowthPath, TaskShelf, EmployeeShelf, ConfirmDialog, MissionControl, TeachingDialogue, DeliveryStory} from './Product';
import {api, skills, type Artifact, type Attempt, type Employee, type Mode, type Skill, type Source, type Space, type Task, type Workspace, type AuthState, type Account} from './types';
import './style.css';

const statusNames: Record<string, string> = {published: '等待认领', running: '正在协作', generating: '生成成果', waiting: '等待补位', paused: '已暂停', error: '运行失败', blocked: '授权影响', review: '待独立评审', ready: '待真人验收', completed: '已验收', cancelled: '已取消'};
const draft = <T,>(key: string, fallback: T): T => {try {return JSON.parse(localStorage.getItem('awl:' + key) || 'null') ?? fallback;} catch {return fallback;}};
function useDraft<T>(key: string, initial: T) {
  const [value, set] = useState<T>(() => draft(key, initial));
  useEffect(() => {localStorage.setItem('awl:' + key, JSON.stringify(value));}, [key, value]);
  return [value, set] as const;
}

function Field({label, children}: {label: string; children: ReactNode}) {return <label className="field"><span>{label}</span>{children}</label>;}
function Button({children, onClick, disabled, secondary = false}: {children: ReactNode; onClick?: () => void; disabled?: boolean; secondary?: boolean}) {
  return <button type="button" className={secondary ? 'secondary' : 'primary'} onClick={onClick} disabled={disabled}>{children}</button>;
}

function AuthScreen({onAuth}: {onAuth: (auth: AuthState) => void}) {
  const [tab, setTab] = useState<'login' | 'register'>('register');
  const [form, setForm] = useDraft('auth', {name: '李芳军', email: 'demo@workforce.local', password: 'demo1234'});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const body = tab === 'register' ? form : {email: form.email, password: form.password};
      onAuth(await api<AuthState>(tab === 'register' ? '/auth/register' : '/auth/login', body));
    } catch (e) {setError(e instanceof Error ? e.message : '账号操作失败');}
    finally {setBusy(false);}
  }
  return <main className="auth-page">
    <section className="auth-hero"><span className="brand-icon">w↗</span><p className="eyebrow">Agent Workforce Lab</p><h1>先进入你的数字校园。</h1><p>注册一个本地账号，开始教数字员工、发布任务、查看组队交付。账号只保存在本项目 SQLite 中，用于 Prototype 演示登录和切换流程。</p><ol><li>真实员工教学数字员工</li><li>考试、试岗后获得资格</li><li>发布任务，员工自评并组队</li></ol></section>
    <section className="auth-card" aria-label="账号入口">
      <div className="auth-tabs"><button className={tab === 'register' ? 'selected' : ''} onClick={() => setTab('register')}>注册</button><button className={tab === 'login' ? 'selected' : ''} onClick={() => setTab('login')}>登录</button></div>
      <h2>{tab === 'register' ? '创建本地演示账号' : '登录已有账号'}</h2>
      <form onSubmit={submit}>
        {tab === 'register' && <Field label="姓名"><input required autoComplete="name" value={form.name} onChange={e => setForm({...form, name: e.target.value})}/></Field>}
        <Field label="邮箱"><input required type="email" autoComplete="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})}/></Field>
        <Field label="密码"><input required type="password" minLength={6} autoComplete={tab === 'register' ? 'new-password' : 'current-password'} value={form.password} onChange={e => setForm({...form, password: e.target.value})}/></Field>
        {error && <p className="warning" role="alert">{error}</p>}
        <button className="primary full" disabled={busy}>{busy ? '正在处理…' : tab === 'register' ? '注册并进入校园 →' : '登录 →'}</button>
      </form>
      <button className="quiet auth-switch" onClick={() => setTab(tab === 'register' ? 'login' : 'register')}>{tab === 'register' ? '已有账号？去登录' : '没有账号？去注册'}</button>
    </section>
  </main>;
}

function AccountMenu({auth, onSwitch, onLogout}: {auth: AuthState; onSwitch: (account?: Account) => void; onLogout: () => void}) {
  return <details className="account-menu"><summary>{auth.account?.name || '未登录'}</summary><div>
    <p>{auth.account?.email}</p>{auth.accounts.filter(account => account.id !== auth.account?.id).slice(0, 5).map(account =>
      <button key={account.id} className="quiet" onClick={() => onSwitch(account)}>切换到 {account.name}</button>)}
    <button className="quiet" onClick={() => onSwitch()}>登录 / 注册其他账号</button><button className="quiet danger-link" onClick={onLogout}>退出登录</button>
  </div></details>;
}

function App() {
  const [auth, setAuth] = useState<AuthState>({account: null, accounts: []});
  const [authChecked, setAuthChecked] = useState(false);
  const [authScreen, setAuthScreen] = useState(false);
  const [data, setData] = useState<Workspace>();
  const [space, setSpace] = useState<Space>((['teach', 'publish', 'delivery'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'teach') as Space);
  const [mode, setMode] = useState<Mode>('demo');
  const [employeeId, setEmployeeId] = useState(localStorage.getItem('awl:employee') || '');
  const [taskId, setTaskId] = useState(localStorage.getItem('awl:task') || '');
  const [sourceId, setSourceId] = useState(localStorage.getItem('awl:source') || '');
  const [teachingTab, setTeachingTab] = useState<'lesson' | 'growth' | 'library'>('lesson');
  const [deliveryTab, setDeliveryTab] = useState<'results' | 'activity'>('results');
  const [showImport, setShowImport] = useState(false);
  const [connected, setConnected] = useState(true);
  const loadVersion = useRef(0);
  const actionLock = useRef(false);
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [modal, setModal] = useState<{title: string; content: ReactNode}>();
  const dialog = useRef<HTMLDialogElement>(null);
  const panel = useRef<HTMLElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const [creating, setCreating] = useState(false);
  const [newEmployee, setNewEmployee] = useDraft('create', {name: '晓禾', role: '客服经验与知识写作', skill: 'writing' as Skill});
  const [teaching, setTeaching] = useDraft('teaching', {title: '', text: '', contributor: '小林', consent: false});
  const [form, setForm] = useDraft('task', {goal: '', output: '', input_text: '', deadline: '', skills: ['writing', 'analysis', 'risk'] as Skill[], consent: false, auto_run: true});
  const [confirm, setConfirm] = useState({method: '', conditions: ''});
  const [confirmSource, setConfirmSource] = useState('');
  const [trialFeedback, setTrialFeedback] = useDraft('trial-feedback', '');
  const [feedback, setFeedback] = useDraft('task-feedback', '');
  const employee = data?.employees.find(e => e.id === employeeId) || data?.employees[0];
  const task = data?.tasks.find(t => t.id === taskId) || data?.tasks.at(-1);
  const source = data?.sources.find(s => s.id === sourceId && s.active);
  const attempts = data?.attempts.filter(a => a.employee_id === employee?.id && a.mode === mode) || [];
  const latestExam = attempts.filter(a => a.kind === 'exam').at(-1);
  const latestTrial = attempts.filter(a => a.kind === 'trial').at(-1);
  const stage = employee?.valid_skills[mode].length ? 4 : latestExam?.passed ? 3 : employee?.sources.length ? 2 : source && !source.confirmed ? 1 : 0;

  useEffect(() => {void api<AuthState>('/auth/me').then(next => {setAuth(next); setAuthScreen(!next.account);}).catch(() => setAuthScreen(true)).finally(() => setAuthChecked(true));}, []);

  async function refresh() {
    const version = ++loadVersion.current;
    const next = await api<Workspace>('/workspace');
    if (version === loadVersion.current) {setData(next); setConnected(true);}
  }
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (actionLock.current || document.hidden) return;
      const version = ++loadVersion.current;
      try {const next = await api<Workspace>('/workspace'); if (!cancelled && version === loadVersion.current) {setData(next); setConnected(true);}}
      catch {if (!cancelled) setConnected(false);}
    };
    void load(); const timer = setInterval(() => void load(), 2500);
    return () => {cancelled = true; clearInterval(timer);};
  }, []);
  useEffect(() => {localStorage.setItem('awl:employee', employeeId);}, [employeeId]);
  useEffect(() => {localStorage.setItem('awl:task', taskId);}, [taskId]);
  useEffect(() => {if (task && ['review', 'ready', 'completed'].includes(task.status)) setDeliveryTab('results');}, [task?.status, task?.id]);
  useEffect(() => {localStorage.setItem('awl:source', sourceId);}, [sourceId]);
  useEffect(() => {if (source) {setConfirm(draft('method:' + source.id, {method: source.method || source.text, conditions: source.conditions})); setConfirmSource(source.id);}}, [source?.id]);
  useEffect(() => {if (confirmSource && confirmSource === source?.id && !source.confirmed) localStorage.setItem('awl:method:' + confirmSource, JSON.stringify(confirm));}, [confirm, confirmSource, source?.id, source?.confirmed]);
  useEffect(() => {if (!notice) return; const timer = setTimeout(() => setNotice(''), 5000); return () => clearTimeout(timer);}, [notice]);
  useEffect(() => {if (modal) dialog.current?.showModal();}, [modal]);
  useEffect(() => {const hash = () => {if (['teach', 'publish', 'delivery'].includes(location.hash.slice(1))) setSpace(location.hash.slice(1) as Space);}; addEventListener('hashchange', hash); return () => removeEventListener('hashchange', hash);}, []);
  async function act<T>(work: () => Promise<T>, message = ''): Promise<T | undefined> {
    if (actionLock.current) return;
    actionLock.current = true; ++loadVersion.current;
    setBusy(true); setError(''); setNotice('');
    try {const result = await work(); await refresh(); setNotice(message); return result;}
    catch (e) {setError(e instanceof Error ? e.message : '操作失败'); await refresh().catch(() => undefined);}
    finally {actionLock.current = false; setBusy(false);}
  }
  function navigate(next: Space) {
    setSpace(next); location.hash = next;
    requestAnimationFrame(() => {panel.current?.focus({preventScroll: true}); if (innerWidth <= 850) panel.current?.scrollIntoView({block: 'start'});});
  }
  function open(title: string, content: ReactNode) {previousFocus.current = document.activeElement as HTMLElement; setModal({title, content});}
  function close() {dialog.current?.close(); setModal(undefined); previousFocus.current?.isConnected && previousFocus.current.focus();}
  async function logout() {await api('/auth/logout', {}); setAuth({account: null, accounts: auth.accounts}); setAuthScreen(true);}
  function showAuth(account?: Account) {setAuthScreen(true); if (account) localStorage.setItem('awl:auth', JSON.stringify({email: account.email, password: ''}));}
  function inspect(e: Employee) {open(e.name + ' · 能力档案', <><div className="profile-detail"><Person avatar={e.avatar}/><div><h3>{e.name}</h3><p>{e.role}</p></div></div><p>已验证技能：{e.valid_skills[mode].map(s => skills[s]).join('、') || '尚未取得此模式的资格'}</p><p>授权知识：{e.sources.length} 条 · 不等于所有知识都已掌握</p><p>数字员工积分：{e.points} · 不兑现金，不映射真人绩效</p>{e.fixture && <p className="warning">预置脱敏演示员工，资格仅在演示模式有效。</p>}<Button onClick={() => {setEmployeeId(e.id); setSourceId(''); close(); navigate('teach');}}>去教这位员工</Button></>);}
  async function taskAction(action: string, extra = {}) {
    if (!task) return;
    return await act(() => api<Task>(`/tasks/${task.id}/action`, {action, version: task.version, ...extra}), '任务状态已保存');
  }
  function confirmAction(title: string, description: ReactNode, confirmLabel: string, work: () => Promise<unknown>) {
    open(title, <ConfirmDialog description={description} confirmLabel={confirmLabel} run={async () => {
      const result = await work(); if (result !== undefined) {close(); return true;} return false;
    }}/>);
  }
  function artifact(a: Artifact) {
    open(a.title + ` · v${a.version}`, <><div className="artifact-toolbar"><p className="muted">{a.author} · {a.mode === 'demo' ? '确定性演示生成' : '真实模型生成'}</p><Button secondary disabled={a.affected} onClick={() => {
      const blob = new Blob([a.content], {type: 'text/markdown;charset=utf-8'});
      const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url;
      link.download = a.title.replace(/[\\/]/g, '-') + `.v${a.version}.md`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }}>下载 Markdown</Button></div>{a.affected && <p className="warning">来源授权已改变；此产物不可作为有效交付继续流转。</p>}<pre>{a.content}</pre><h3>引用来源</h3>{a.citations.map(id => {const s = data?.sources.find(s => s.id === id); return <details key={id} className="source-note"><summary>{s?.title || id} · {s?.active ? '授权有效' : '已撤回'}</summary><p>{s?.active ? s.text : '正文不再用于检索，历史产物已标记受影响。'}</p></details>;})}</>);
  }

  const teachPanel = !employee || creating ? <>
    <p className="eyebrow">教学室 / 创建伙伴</p><h2>先教出一位数字员工。</h2><p className="lead">给它一个名字，告诉它你的工作。日常的一段经验，都可以慢慢教。</p>
    <div className="empty"><div className="portrait"><Person/></div><h3>你的第一位工作伙伴</h3><p>先学习你，再尝试工作。<br/>不懂的地方，它会主动问。</p></div>
    <form onSubmit={e => {e.preventDefault(); void act(async () => {const result = await api<Employee>('/employees', newEmployee); setEmployeeId(result.id); setCreating(false); return result;}, '数字员工已创建，开始教学');}}>
      <Field label="数字员工姓名"><input required value={newEmployee.name} onChange={e => setNewEmployee({...newEmployee, name: e.target.value})}/></Field>
      <Field label="你想教它什么工作？"><input required value={newEmployee.role} onChange={e => setNewEmployee({...newEmployee, role: e.target.value})}/></Field>
      <Field label="第一项考核技能"><select value={newEmployee.skill} onChange={e => setNewEmployee({...newEmployee, skill: e.target.value as Skill})}>{Object.entries(skills).map(([id, title]) => <option key={id} value={id}>{title}</option>)}</select></Field>
      <button className="primary" disabled={busy}>创建我的数字员工 →</button>{employee && <Button secondary onClick={() => setCreating(false)}>返回教学</Button>}
    </form>
  </> : <>
    <div className="panel-top"><p className="eyebrow">教学室 / 我的员工</p><span className="pill">{employee.valid_skills[mode].length ? '可接对应任务' : '持续学习'}</span></div>
    <h2>把你知道的，教给{employee.name}。</h2>
    <div className="teacher-row"><div className="portrait"><Person avatar={employee.avatar}/></div><div><h3>{employee.name}</h3><p>{employee.role} · {employee.fixture ? '演示同事' : '持续教学'}</p></div></div>
    <div className="employee-switch"><Field label="选择要教的员工"><select value={employee.id} onChange={e => {setEmployeeId(e.target.value); setSourceId(''); setTrialFeedback(''); setTeachingTab('lesson');}}>{data?.employees.map(e => <option value={e.id} key={e.id}>{e.name} · {e.role}</option>)}</select></Field><Button secondary onClick={() => {setCreating(true); setSourceId('');}}>＋ 新员工</Button></div>
    <GrowthPath stage={stage}/>
    <SectionTabs label="员工工作空间" selected={teachingTab} onSelect={setTeachingTab} items={[
      {id: 'lesson', title: '教与学'}, {id: 'growth', title: '考试与试岗'}, {id: 'library', title: '知识档案', count: employee.sources.length},
    ]}/>
    <div hidden={teachingTab !== 'lesson'} className="tab-content">
    {source && !source.confirmed ? <>
      <details className="source-note"><summary>教学原文 · {source.title}</summary><p>{source.text}</p></details>
      <div className="question"><strong>{employee.name}的理解与疑问</strong><p className="prewrap">{source.understanding || source.error || '资料已收到，请确认方法'}</p></div>
      <form onSubmit={e => {e.preventDefault(); void act(async () => {
        const result = await api(`/sources/${source.id}/confirm`, confirm);
        localStorage.removeItem('awl:method:' + source.id); setTeachingTab('growth'); return result;
      }, '方法与条件已确认，下一步是考试与试岗');}}>
        <div className="knowledge-draft"><h3>方法卡 · 待真人确认</h3><Field label="方法与判断"><textarea required minLength={5} value={confirm.method} onChange={e => setConfirm({...confirm, method: e.target.value})}/></Field><Field label="适用条件与红线"><textarea required minLength={5} value={confirm.conditions} onChange={e => setConfirm({...confirm, conditions: e.target.value})}/></Field><small>来源：{source.contributor} · {source.id} · 确认不等于取得资格</small></div>
        <button className="primary" disabled={busy}>确认理解，进入练习 →</button><Button secondary onClick={() => setSourceId('')}>继续教其他知识</Button>
      </form>
    </> : <>
      <TeachingDialogue employee={employee}/>
      <form onSubmit={e => {e.preventDefault(); void act(async () => {const result = await api<Source>('/teaching', {...teaching, audience: [employee.id], mode}); setSourceId(result.id); setTeaching({...teaching, title: '', text: '', consent: false}); return result;}, '教学已保存，请核对理解');}}>
        <Field label="这次教什么？"><input required value={teaching.title} onChange={e => setTeaching({...teaching, title: e.target.value})} placeholder="例如：处理政策未说明的反馈"/></Field>
        <Field label="教它一段经验，或示范你的工作"><textarea required minLength={5} value={teaching.text} onChange={e => setTeaching({...teaching, text: e.target.value})} placeholder="怎样做、为什么、什么情况下找真人……"/></Field>
        <details className="teaching-settings"><summary>来源与资料 · {teaching.contributor}</summary>
        <Field label="真实知识贡献者"><input required value={teaching.contributor} onChange={e => setTeaching({...teaching, contributor: e.target.value})}/></Field>
        <p className="muted">知识只授权给当前员工；可在知识档案中调整受众。</p></details>
        <label className="check"><input required type="checkbox" checked={teaching.consent} onChange={e => setTeaching({...teaching, consent: e.target.checked})}/>我有权处理此资料，授权这位员工用于学习与知识工作</label>
        <button className="primary full" disabled={busy}>教给{employee.name} →</button>
        <button type="button" className="quiet import-toggle" aria-expanded={showImport} onClick={() => setShowImport(!showImport)}>＋ 提供简历 / 工作资料</button>
        {showImport && <Field label="或导入资料（TXT / Markdown / PDF / DOCX，最多 5MB）"><input type="file" disabled={busy || !teaching.consent} accept=".txt,.md,.pdf,.docx" onChange={e => {const file = e.target.files?.[0]; if (!file) return; void act(async () => {const body = new FormData(); body.append('file', file); body.append('audience', JSON.stringify([employee.id])); body.append('contributor', teaching.contributor); body.append('consent', String(teaching.consent)); body.append('mode', mode); const response = await fetch('/api/materials/import', {method: 'POST', body}); const result = await response.json(); if (!response.ok) throw new Error(result.detail || '导入失败'); setSourceId(result.id); return result;}, '资料已解析，请确认方法与范围');}}/></Field>}
      </form>
    </>}
    </div>
    <div hidden={teachingTab !== 'growth'} className="tab-content">
    <div className="next-step"><strong>{stage === 4 ? '已经可以尝试对应任务' : stage === 3 ? '接下来：用一个小任务证明能力' : stage === 2 ? '接下来：验证刚学会的方法' : '先教一段经验，并确认方法'}</strong><p>{stage >= 2 ? `考核范围是${skills[employee.skill]}，不是所有领域的通用资格。` : '教学记录确认后，才能进入考试。'}</p></div>
    <details className="learning-box" open>
      <summary>能力成长 · {employee.valid_skills[mode].length ? '已取得对应资格' : '教学后还要考试与试岗'}</summary>
      <p>考核技能：{skills[employee.skill]} · 当前{mode === 'demo' ? '演示' : '真实模型'}资格不跨模式通用</p>
      <div className="actions"><Button disabled={busy || !employee.sources.length} onClick={() => void act(() => api<Attempt>(`/employees/${employee.id}/exam`, {mode}), '考试答案与独立规则检查已保存')}>运行场景考试</Button><Button secondary disabled={busy || !latestExam?.passed} onClick={() => void act(() => api<Attempt>(`/employees/${employee.id}/trial`, {mode}), '试岗成果已生成，等待真人检查')}>运行试岗小任务</Button></div>
      {latestExam && <div className="receipt"><strong>考试：{latestExam.passed ? '规则检查通过' : '未通过'} · {latestExam.score || 0} 分</strong><p>{latestExam.error || '验证引用、未知表达与真人边界；不代表全领域能力。'}</p><Button secondary onClick={() => open('考试答案与证据', <pre>{latestExam.answer || latestExam.error}</pre>)}>查看答卷</Button></div>}
      {latestTrial && <div className="receipt"><strong>试岗：{latestTrial.approved === true ? '真人已批准' : latestTrial.approved === false ? '退回补练' : '等待真人检查'}</strong><Button secondary onClick={() => open('试岗成果', <pre>{latestTrial.answer}</pre>)}>查看试岗成果</Button><Field label="真人试岗反馈"><textarea minLength={3} value={trialFeedback} onChange={e => setTrialFeedback(e.target.value)} placeholder="是否应用方法、依据和边界？"/></Field><div className="actions"><Button disabled={busy || trialFeedback.length < 3} onClick={() => void act(() => api(`/attempts/${latestTrial.id}/approve`, {approved: true, feedback: trialFeedback}), '资格已依据试岗记录授予')}>批准对应技能资格</Button><Button secondary disabled={busy || trialFeedback.length < 3} onClick={() => void act(() => api(`/attempts/${latestTrial.id}/approve`, {approved: false, feedback: trialFeedback}), '试岗退回补练')}>退回补练</Button></div></div>}
    </details>
    {stage === 4 && <Button onClick={() => navigate('publish')}>发布任务，让它试一试 →</Button>}
    </div>
    <div hidden={teachingTab !== 'library'} className="tab-content">
    <details className="source-library" open><summary>知识与授权 · {employee.sources.length} 条已确认</summary>
      {data?.sources.filter(s => s.audience.includes(employee.id)).map(s => <div className="source-card" key={s.id}><strong>{s.title}</strong><small>{s.active ? s.confirmed ? '真人已确认' : '待确认草稿' : '授权已撤回'} · {s.contributor} · v{s.version}</small>
        {s.active && <><Button secondary onClick={() => {setSourceId(s.id); if (s.confirmed) open(s.title, <><pre>{s.method}</pre><p>条件：{s.conditions}</p><p>来源原文：{s.text}</p></>); else setTeachingTab('lesson');}}>查看 / 确认</Button><Button secondary onClick={() => open('调整资料受众', <ShareSource source={s} employees={data?.employees || []} save={async audience => {const result = await act(() => api(`/sources/${s.id}/share`, {audience}), '授权受众已更新，相关产物标记待复核'); if (result) close();}}/>)}>授权给其他员工</Button><Button secondary onClick={() => confirmAction('撤回知识授权', <p>「{s.title}」停止用于后续检索；相关资格将失效，在途任务和历史成果会标记受影响。这不是删除历史记录。</p>, '确认撤回授权', () => act(() => api(`/sources/${s.id}/revoke`, {}), '授权已撤回'))}>撤回授权</Button></>}
      </div>)}
    </details>
    </div>
  </>;

  const publishPanel = <>
    <div className="panel-top"><p className="eyebrow">任务发布台 / 新目标</p><span className="pill">员工自主评估</span></div><h2>说清目标，其他交给员工。</h2><p className="lead">员工按资格、知识授权与负载认领；遇到能力缺口，执行中寻找帮手。</p>
    <div className="composer-example"><span>不确定怎么写？</span><button type="button" onClick={() => setForm({...form, goal: '分析客户反馈，提出知识库改进建议', output: '反馈分类、改进方案与待确认事项', input_text: '客户反馈：找不到流程说明；客户要求承诺处理时间，但资料没有给出时效依据。', consent: false})}>填入脱敏任务例子 →</button></div>
    <form onSubmit={e => {e.preventDefault();
      const key = crypto.randomUUID();
      confirmAction('发布前，确认这项工作', <><h3>{form.goal}</h3><p>希望得到：{form.output}</p><p>所需能力：{form.skills.map(s => skills[s]).join('、')}</p><p>截止时间：{form.deadline.replace('T', ' ')}</p><p>{form.auto_run ? '发布后由后端自动推进，可随时暂停。' : '逐步观察模式，由你推进每个里程碑。'}资料只用于该任务，最终由真人验收。</p></>, '确认发布任务', () => act(async () => {
        const result = await api<Task>('/tasks', {...form, mode}, {'Idempotency-Key': key}); setTaskId(result.id); setDeliveryTab('activity'); navigate('delivery'); return result;
      }, '任务已发布，服务端开始评估'));
    }}>
      <Field label="希望完成什么？"><textarea required minLength={5} value={form.goal} onChange={e => setForm({...form, goal: e.target.value})} placeholder="分析客户反馈，提出知识库改进方案"/></Field>
      <Field label="希望拿到什么成果？"><input required minLength={3} value={form.output} onChange={e => setForm({...form, output: e.target.value})} placeholder="分类清单、方案草稿和风险事项"/></Field>
      <Field label="任务资料与输入"><textarea required minLength={5} value={form.input_text} onChange={e => setForm({...form, input_text: e.target.value})} placeholder="粘贴脱敏问题、业务背景和已知条件；不会自动拉取外部资料"/></Field>
      <Field label="期望完成时间"><input required type="datetime-local" value={form.deadline} onChange={e => setForm({...form, deadline: e.target.value})}/></Field>
      <fieldset><legend>这项任务需要的能力</legend>{(Object.keys(skills) as Skill[]).map(skill => <label className="check" key={skill}><input type="checkbox" checked={form.skills.includes(skill)} onChange={e => setForm({...form, skills: e.target.checked ? [...form.skills, skill] : form.skills.filter(s => s !== skill)})}/>{skills[skill]}</label>)}</fieldset>
      <label className="check"><input type="checkbox" checked={form.auto_run} onChange={e => setForm({...form, auto_run: e.target.checked})}/>让运行引擎自动推进，关闭后可逐步观察</label>
      <label className="check"><input required type="checkbox" checked={form.consent} onChange={e => setForm({...form, consent: e.target.checked})}/>我确认任务资料可提供给认领成员，最终由真人验收</label>
      <button className="primary full" disabled={busy || !form.skills.length}>检查并发布任务 →</button>
    </form>
    <div className="availability"><strong>这些能力，当前谁能接？</strong>{form.skills.map(skill => {
      const ready = data?.employees.filter(e => e.valid_skills[mode].includes(skill)) || [];
      return <div key={skill}><span>{skills[skill]}</span><span>{ready.length ? ready.map(e => e.name).join('、') : '尚无合格员工，可先教学补位'}</span></div>;
    })}<small>资格只是第一关；认领时还会检查实时负载与资料授权。</small></div>
  </>;

  const deliveryPanel = !task ? <>
    <p className="eyebrow">交付大厅 / 进度与成果</p><h2>进度与成果，都在这里。</h2><div className="empty"><h3>还没有发布任务</h3><p>不用先组好团队，先说清目标与希望结果。</p></div><Button onClick={() => navigate('publish')}>发布一个任务</Button>
  </> : <>
    <div className="panel-top"><p className="eyebrow">交付大厅 / 当前工作</p><span className={`pill ${task.status === 'error' || task.affected ? 'danger' : ''}`}>{statusNames[task.status]}</span></div>
    <Field label="查看任务"><select value={task.id} onChange={e => setTaskId(e.target.value)}>{data?.tasks.map(t => <option key={t.id} value={t.id}>{t.goal} · {statusNames[t.status]}</option>)}</select></Field>
    <h2>{task.goal}</h2><p className="lead">{task.output}<br/>{task.mode === 'demo' ? '确定性演示运行' : '真实模型运行'} · 成果版本 v{task.artifact_version}</p>
    <div className={`next-step ${['waiting', 'blocked', 'error'].includes(task.status) ? 'needs-help' : ''}`}><strong>{({
      published: '正在等待第一位合格员工', running: task.members.length < task.skills.length ? '工作中发现缺口，下一步寻找伙伴' : '分工已就绪，准备交付成果',
      generating: '员工正在按各自授权知识生成成果', waiting: '需要你的帮助：补齐员工能力', paused: '检查点已保存，恢复后继续原任务',
      error: '这一步未完成，可以重试', blocked: '先处理知识授权影响', review: '接下来：打开成果，进行独立评审',
      ready: '接下来：由你验收当前版本', completed: '成果已接受，可以把经验教回去', cancelled: '任务已停止，员工负载已释放',
    } as Record<string, string>)[task.status]}</strong><p>{task.error || (task.status === 'review' || task.status === 'ready' ? '成果与来源可直接检查；有问题就退回修订，不重新创建任务。' : `需要${task.skills.map(s => skills[s]).join('、')} · 当前${task.members.length}位执行成员`)}</p></div>
    <DeliveryStory task={task}/>
    <div className="team-evolution">{['1 人 · 独立', '2 人 · 分工', '3 人 · 建组'].map((s, i) => <span key={s} className={task.members.length === i + 1 ? 'selected' : ''}>{s}</span>)}</div>
    <div className="members">{task.members.map(m => <button key={m.employee_id} onClick={() => {const e = data?.employees.find(e => e.id === m.employee_id); if (e) inspect(e);}}>{m.name} · {skills[m.skill]}</button>)}</div>
    {task.group_id && <div className="receipt"><strong>{task.members.length}人任务组 · 分工继续</strong><small>第三位执行成员加入后建立，已有工作与成果保持连续。</small></div>}
    {task.error && <div className="warning" role="status">{task.error}</div>}
    {task.affected && <div className="warning">来源授权受影响，相关资格与产物不可继续当作有效证据。</div>}
    <div className="actions">
      {['published', 'running', 'waiting'].includes(task.status) && <Button disabled={busy} onClick={() => void taskAction('step')}>推进下一步</Button>}
      {['published', 'running', 'generating', 'waiting'].includes(task.status) && <Button secondary disabled={busy} onClick={() => void taskAction('pause')}>暂停运行</Button>}
      {['paused', 'error', 'waiting'].includes(task.status) && <Button disabled={busy} onClick={() => void taskAction(task.status === 'error' ? 'retry' : 'resume')}>恢复 / 重试</Button>}
      {!['completed', 'cancelled'].includes(task.status) && <Button secondary disabled={busy} onClick={() => confirmAction('停止这项任务？', <p>「{task.goal}」将停止运行并释放员工负载。已有成果、讨论与历史记录保留；不会抹掉已发积分。</p>, '确认取消任务', () => taskAction('cancel'))}>取消任务</Button>}
    </div>
    <SectionTabs label="任务工作空间" selected={deliveryTab} onSelect={setDeliveryTab} items={[
      {id: 'results', title: '成果与验收', count: task.artifacts.filter(a => a.version === task.artifact_version).length}, {id: 'activity', title: '协作记录'},
    ]}/>
    <div hidden={deliveryTab !== 'activity'} className="tab-content">
    <details className="task-identifiers"><summary>任务标识与追踪</summary><p>原任务：{task.id}</p>{task.group_id && <p>任务组：{task.group_id}</p>}</details>
    <div className="division-list">{task.members.map(m => <div key={m.employee_id}><strong>{m.name} · {skills[m.skill]}</strong><p>{m.reason}</p><small>加入时间：{new Date(m.joined_at).toLocaleString('zh-CN')}</small></div>)}</div>
    <details className="work-record" open={!task.artifacts.length}><summary>工作记录 · 邀请、分工与阻塞</summary><div className="timeline">{task.events.map(event => <div className="event" key={event.seq}><b>{event.seq}</b><div>{event.detail.message || event.action}<small>{new Date(event.created_at).toLocaleTimeString()} · {event.actor}</small></div></div>)}</div></details>
    </div>
    <div hidden={deliveryTab !== 'results'} className="tab-content">
    {!task.artifacts.some(a => a.version === task.artifact_version) && <div className="results-empty"><strong>这一版本还没有成果</strong><p>{task.feedback ? '修订意见已保存，旧版仍可回查；新成果提交后出现在这里。' : '员工完成职责工作后，成果会在这里出现。你可以先查看协作记录。'}</p><Button secondary onClick={() => setDeliveryTab('activity')}>查看正在发生的工作</Button></div>}
    {task.artifacts.filter(a => a.version === task.artifact_version).map(a => <div className="result" key={a.id}><div><strong>{a.title}</strong><small>{a.author} · v{a.version} · {a.citations.length} 个来源</small></div><Button secondary onClick={() => artifact(a)}>打开 →</Button></div>)}
    {task.artifacts.some(a => a.version < task.artifact_version) && <details className="source-library"><summary>历史成果版本</summary>{task.artifacts.filter(a => a.version < task.artifact_version).map(a => <div className="result" key={a.id}>{a.title} · v{a.version}<Button secondary onClick={() => artifact(a)}>打开历史</Button></div>)}</details>}
    {['review', 'ready'].includes(task.status) && <div className="review-banner"><strong>独立评审 → 真人验收</strong><p>执行员工不能自评通过或自行发奖。</p>{task.review && <div className="review-checks">{Object.entries(task.review.checks).map(([k, v]) => <span key={k}>{v ? '✓' : '×'} {({outputs: '职责成果齐全', citations: '引用有效', no_affected_sources: '授权未受影响', task_alignment: '目标一致'} as Record<string, string>)[k] || k}</span>)}</div>}<div className="actions">{task.status === 'review' && <Button disabled={busy} onClick={() => void taskAction('review')}>运行独立规则评审</Button>}{task.status === 'ready' && <Button disabled={busy} onClick={() => confirmAction('接受这一版本的成果', <><h3>{task.goal}</h3><p>接受版本：v{task.artifact_version} · {task.artifacts.filter(a => a.version === task.artifact_version).length} 份成果</p><p>请检查目标、引用、未知事项与实际业务质量。确认后总计100不可兑现积分一次入账；规则评审不替代真人判断。</p></>, '确认验收并入账', () => taskAction('accept', {artifact_version: task.artifact_version}))}>接受当前版本成果</Button>}</div><Field label="退回修订意见"><textarea minLength={3} value={feedback} onChange={e => setFeedback(e.target.value)} placeholder="指出要改进的产物或条件"/></Field><Button secondary disabled={busy || feedback.length < 3} onClick={() => void taskAction('return', {feedback})}>退回修订，保留原任务</Button></div>}
    {task.status === 'completed' && <div className="receipt"><strong>已验收 · 积分只入账一次</strong><p>{task.rewards.map(r => `${data?.employees.find(e => e.id === r.employee_id)?.name || '员工'} ${r.points} 积分`).join(' · ')}</p><Button disabled={busy || task.affected} onClick={() => void act(async () => {const result = await api<Source>(`/tasks/${task.id}/experience`, {}); setEmployeeId(task.members[0].employee_id); setSourceId(result.id); setTeachingTab('lesson'); navigate('teach'); return result;}, '经验候选已回流，需真人确认')}>把反馈带回教学室</Button></div>}
    </div>
  </>;

  return <>
    {!authChecked ? <p className="loading">正在检查账号状态……</p> : authScreen && <AuthScreen onAuth={next => {setAuth(next); setAuthScreen(false);}}/>}
    {authChecked && !authScreen && <>
    <a className="skip" href="#main">跳到操作面板</a>
    <header><a className="brand" href="#teach"><span className="brand-icon">w↗</span>Workforce <span>Lab</span></a><span className="workspace-name">{auth.account?.name}的数字校园</span><div className="header-end"><AccountMenu auth={auth} onSwitch={showAuth} onLogout={() => void logout()}/><label className="mode-switch">运行模式<select aria-label="运行模式" value={mode} onChange={e => setMode(e.target.value as Mode)}><option value="demo">无密钥演示</option><option value="live" disabled={!data?.health.model.live_available}>真实模型</option></select></label><button className="quiet" onClick={() => open('本地系统边界', <><p>React + FastAPI + SQLite + Semantica，数据保存在本项目 runtime 目录。</p><p>演示使用确定性规则与模板；真实模式仅使用服务端凭据，不会静默回退。</p><p>首版仅本地单工作空间，无生产身份认证。请使用脱敏资料，不自动扫描电脑，不外发、不运行任意命令。</p><p>知识图：{data?.health.knowledge.status} · Semantica {data?.health.knowledge.version}</p></>)}>使用说明</button></div></header>
    <div className="page-title"><div><p className="eyebrow">我的数字校园</p><h1>教出伙伴，一起把工作做好。</h1></div><button className="quiet" disabled={busy} onClick={() => void act(() => api('/demo/colleagues', {}), '知远与青岚演示同事已加入；明确为预置夹具')}>＋ 加入两位演示同事</button></div>
    <div className="workspace-guide"><span>{!data?.employees.length ? '从第一位员工开始：教方法，再验证，最后把任务交给它。' : space === 'teach' ? '把经验慢慢教给它；不懂的地方，留给你确认。' : space === 'publish' ? '你定义目标，员工按自己的能力寻找合适的伙伴。' : '关注当前进度、缺口与成果，不用等待人物动画。'}</span><span className={connected ? 'connection' : 'connection offline'}>{connected ? '本地服务已连接' : '连接中断 · 保留当前输入'}</span></div>
    <MissionControl space={space} navigate={navigate} employee={employee} task={task} mode={mode}/>
    {!data && !error && <p className="loading">正在连接本地工作空间……</p>}
    <div className="workspace"><Campus space={space} navigate={navigate} employees={data?.employees || []} employee={employee} task={space === 'delivery' ? task : undefined} mode={mode} paused={paused} setPaused={setPaused} inspect={inspect}/><main id="main" ref={panel} tabIndex={-1} className="panel" aria-label="当前空间操作" aria-busy={busy}>
      {error && <div className="error-banner" role="alert">{error}<button className="quiet" onClick={() => void act(refresh)}>重试连接</button></div>}
      {notice && <div className="saved" role="status">{notice}</div>}
      {busy && <p className="pending" role="status">正在处理并保存，请稍候……</p>}
      {space === 'teach' ? teachPanel : space === 'publish' ? publishPanel : deliveryPanel}
    </main></div>
    {data && data.tasks.length > 0 && <TaskShelf tasks={data.tasks} selected={task?.id} select={selected => {setTaskId(selected.id); setDeliveryTab(selected.artifacts.length ? 'results' : 'activity'); navigate('delivery');}}/>}
    {data && data.employees.length > 0 && <EmployeeShelf employees={data.employees} mode={mode} select={selected => {setEmployeeId(selected.id); setSourceId(''); setCreating(false); setTeachingTab('lesson'); navigate('teach');}}/>}
    <footer><span>Workforce Lab · 数字员工校园</span><span>本地单工作空间 · {mode === 'demo' ? '确定性演示，不是模型学习' : '真实模型调用'} · 使用脱敏资料</span></footer>
    <dialog ref={dialog} aria-labelledby="modal-title" onCancel={close} onClose={() => {setModal(undefined); previousFocus.current?.isConnected && previousFocus.current.focus();}}><div className="modal-head"><h2 id="modal-title">{modal?.title}</h2><button className="close" aria-label="关闭弹窗" onClick={close}>×</button></div><div className="modal-copy">{modal?.content}</div></dialog>
    </>}
  </>;
}

function ShareSource({source, employees, save}: {source: Source; employees: Employee[]; save: (audience: string[]) => Promise<void>}) {
  const [audience, setAudience] = useState(source.audience);
  const [saving, setSaving] = useState(false);
  return <><p>只向以下员工提供此资料。团队加入不会自动扩大个人知识授权。</p>{employees.map(e => <label className="check" key={e.id}><input type="checkbox" checked={audience.includes(e.id)} onChange={event => setAudience(event.target.checked ? [...audience, e.id] : audience.filter(id => id !== e.id))}/>{e.name} · {e.role}</label>)}<Button disabled={saving || !audience.length} onClick={() => {setSaving(true); void save(audience).finally(() => setSaving(false));}}>确认授权范围</Button></>;
}

class ErrorBoundary extends React.Component<{children: ReactNode}, {error: boolean}> {
  state = {error: false};
  static getDerivedStateFromError() {return {error: true};}
  render() {return this.state.error ? <main className="panel"><h2>页面遇到问题</h2><p>业务数据保存在服务端，可刷新恢复。</p><button onClick={() => location.reload()}>刷新页面</button></main> : this.props.children;}
}
createRoot(document.getElementById('root')!).render(<ErrorBoundary><App/></ErrorBoundary>);
