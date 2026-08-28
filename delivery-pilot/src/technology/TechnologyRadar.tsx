import { useEffect, useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import {
  Activity,
  ArrowLeft,
  Boxes,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  CircleGauge,
  Cloud,
  Code2,
  Copy,
  Cpu,
  Database,
  ExternalLink,
  Flame,
  GitFork,
  Globe2,
  Layers3,
  LoaderCircle,
  Network,
  Plus,
  PlugZap,
  Radar,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  TrendingUp,
  Workflow,
  X,
} from 'lucide-react'
import type {
  ApiStatus,
  ArchitectureNode,
  DataSourceInput,
  DataSourceView,
  Domain,
  MatchResponse,
  SolutionResponse,
  SourceTestResult,
  TechnologyMatch,
  TrendResponse,
} from './types'
import './TechnologyRadar.css'

type RadarTab = 'match' | 'solution' | 'domain' | 'global' | 'architecture'

const domainIcons = {
  spark: Sparkles,
  briefcase: BriefcaseBusiness,
  database: Database,
  cloud: Cloud,
  cpu: Cpu,
  shield: ShieldCheck,
  code: Code2,
}

const tabs: Array<[RadarTab, string, typeof Search]> = [
  ['match', '技术匹配', Search],
  ['solution', '开源方案', Boxes],
  ['domain', '领域热榜', TrendingUp],
  ['global', '热点脉搏', Flame],
  ['architecture', '行业架构', Network],
]

const examples = [
  '设备检修工单、审批流程和移动端',
  '企业知识库与智能问答',
  '实时数据分析与经营驾驶舱',
]

function compactCount(value: number) {
  return new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

function MatchRow({ item, rank, onOpen }: { item: TechnologyMatch; rank: number; onOpen: (url: string) => void }) {
  return <article className="tech-match-row">
    <div className="tech-rank">{String(rank).padStart(2, '0')}</div>
    <div className="tech-repo-main">
      <div className="tech-repo-title">
        <span className="repo-mark"><Code2 size={15} /></span>
        <div><b>{item.fullName}</b><span>{item.language} · {item.license} · <em>{item.source}</em></span></div>
      </div>
      <p>{item.description}</p>
      <div className="tech-reasons">{item.matchedReasons.slice(0, 3).map((reason) => <span key={reason}><Check size={11} />{reason}</span>)}</div>
    </div>
    <div className="tech-signals">
      <span><Star size={12} />{compactCount(item.stars)}</span>
      <span><GitFork size={12} />{compactCount(item.forks)}</span>
      <time>{item.updatedAt.slice(0, 10)}</time>
    </div>
    <div className="match-score">
      <strong>{item.score}</strong><small>匹配分</small>
      <div><i style={{ width: `${item.score}%` }} /></div>
    </div>
    <button className="tech-icon-button" type="button" title="打开 GitHub 项目" onClick={() => onOpen(item.url)}><ExternalLink size={15} /></button>
  </article>
}

function MatchView({ data, loading, onOpen }: { data: MatchResponse | null; loading: boolean; onOpen: (url: string) => void }) {
  if (loading) return <LoadingState label="正在检索 GitHub 并计算匹配分" />
  if (!data) return <EmptyState icon={Search} title="描述你的技术诉求" detail="技术雷达会检索开源项目，并解释每一分从哪里来。" />
  return <section className="radar-result">
    <ResultHeader title={`${data.domain} · 匹配榜`} realtime={data.realtime} meta={`${data.results.length} 个候选项目`} />
    {data.notice && <div className="radar-notice">{data.notice}</div>}
    <div className="score-legend"><span>匹配分构成</span><i className="relevance" />需求相关 45<i className="popularity" />社区热度 25<i className="activity" />近期活跃 15<i className="health" />工程健康 15</div>
    <div className="tech-match-list">{data.results.map((item, index) => <MatchRow item={item} rank={index + 1} onOpen={onOpen} key={item.fullName} />)}</div>
  </section>
}

function SolutionView({ data, loading, onOpen }: { data: SolutionResponse | null; loading: boolean; onOpen: (url: string) => void }) {
  if (loading) return <LoadingState label="正在编排可落地的开源组合" />
  if (!data) return <EmptyState icon={Boxes} title="先搜索一个业务诉求" detail="系统会从匹配项目中选择互补组件，而不是简单堆叠高星项目。" />
  return <section className="radar-result">
    <ResultHeader title={data.title} realtime={data.realtime} meta={`方案可信度 ${data.confidence}%`} />
    <p className="solution-summary">{data.summary}</p>
    <div className="solution-stack">
      {data.components.map((component, index) => <article className="solution-component" key={component.technology.fullName}>
        <span className="component-index">{index + 1}</span>
        <div className="component-role"><small>{component.role}</small><b>{component.technology.fullName}</b><p>{component.responsibility}</p></div>
        <div className="component-fit"><strong>{component.technology.score}</strong><span>匹配</span></div>
        <button className="tech-icon-button" type="button" title="打开项目" onClick={() => onOpen(component.technology.url)}><ExternalLink size={15} /></button>
      </article>)}
    </div>
    <div className="solution-details">
      <div><h3><Workflow size={15} />落地节奏</h3>{data.phases.map((phase) => <p key={phase}>{phase}</p>)}</div>
      <div><h3><ShieldCheck size={15} />实施边界</h3>{data.risks.map((risk) => <p key={risk}>{risk}</p>)}</div>
    </div>
  </section>
}

function TrendView({ data, loading, onOpen }: { data: TrendResponse | null; loading: boolean; onOpen: (url: string) => void }) {
  if (loading) return <LoadingState label="正在刷新当前技术热度" />
  if (!data) return <EmptyState icon={TrendingUp} title="选择一个领域" detail="查看近 90 天受到社区关注的新项目。" />
  return <section className="radar-result">
    <ResultHeader title={data.scope} realtime={data.realtime} meta={`${data.items.length} 条实时信号`} />
    {data.notice && <div className="radar-notice">{data.notice}</div>}
    <div className="trend-list">{data.items.map((item, index) => <button type="button" onClick={() => onOpen(item.url)} key={`${item.source}-${item.title}`}>
      <span className="trend-order">{index + 1}</span>
      <div><b>{item.title}</b><p>{item.description}</p><span className="trend-tags">{item.tags.slice(0, 4).map((tag) => <em key={tag}>{tag}</em>)}</span></div>
      <div className="trend-heat"><Flame size={14} /><strong>{compactCount(item.heat)}</strong><small>{item.source}</small></div>
      <ExternalLink size={14} />
    </button>)}</div>
  </section>
}

function ArchitectureView({ data, loading }: { data: SolutionResponse | null; loading: boolean }) {
  if (loading) return <LoadingState label="正在生成技术架构与实施路径" />
  if (!data) return <EmptyState icon={Network} title="架构等待业务输入" detail="搜索后会生成技术组件、数据流向和质量保障架构。" />
  const columns = [1, 2, 3, 4].map((column) => data.nodes.filter((node) => node.column === column))
  return <section className="radar-result architecture-view">
    <ResultHeader title={`${data.domain}解决方案架构`} realtime={data.realtime} meta={`${data.nodes.length} 个架构节点`} />
    <div className="architecture-canvas">
      {columns.map((nodes, columnIndex) => <div className="architecture-column" key={columnIndex}>
        <span className="architecture-layer">{['业务入口', '接入与安全', '开源能力组合', '数据与运营'][columnIndex]}</span>
        <div className="architecture-nodes">{nodes.map((node) => <ArchitectureCard node={node} key={node.id} />)}</div>
        {columnIndex < columns.length - 1 && <div className="architecture-arrow"><ChevronRight size={18} /></div>}
      </div>)}
    </div>
    <div className="architecture-flow">
      {data.edges.map((edge) => <span key={`${edge.from}-${edge.to}`}><code>{edge.from}</code><ChevronRight size={11} />{edge.label}<ChevronRight size={11} /><code>{edge.to}</code></span>)}
    </div>
  </section>
}

function ArchitectureCard({ node }: { node: ArchitectureNode }) {
  const Icon = node.kind === 'channel' ? BriefcaseBusiness : node.kind === 'gateway' ? ShieldCheck : node.kind === 'data' ? Database : node.kind === 'ops' ? Activity : Boxes
  return <article className={`architecture-node ${node.kind}`}><Icon size={16} /><div><b>{node.label}</b><small>{node.detail}</small></div></article>
}

function ResultHeader({ title, realtime, meta }: { title: string; realtime: boolean; meta: string }) {
  return <div className="radar-result-header"><div><span className={realtime ? 'live-source' : 'fallback-source'}><i />{realtime ? '实时数据' : '离线候选'}</span><h2>{title}</h2></div><span>{meta}</span></div>
}

function LoadingState({ label }: { label: string }) {
  return <div className="radar-loading"><LoaderCircle size={28} /><b>{label}</b><span>正在连接实时数据源</span></div>
}

function EmptyState({ icon: Icon, title, detail }: { icon: typeof Search; title: string; detail: string }) {
  return <div className="radar-empty"><Icon size={28} /><b>{title}</b><span>{detail}</span></div>
}

const capabilityLabels: Record<string, string> = {
  match: '技术匹配',
  domain_trends: '领域热榜',
  global_trends: '热点脉搏',
}

function SourceManager({
  sources,
  onClose,
  onRefresh,
}: {
  sources: DataSourceView[]
  onClose: () => void
  onRefresh: () => Promise<void>
}) {
  const [editing, setEditing] = useState<DataSourceInput | null>(null)
  const [testing, setTesting] = useState('')
  const [testResults, setTestResults] = useState<Record<string, SourceTestResult>>({})
  const [message, setMessage] = useState('')
  const enabledCount = sources.filter((source) => source.enabled).length

  const draft = (source?: DataSourceView): DataSourceInput => source ? {
    id: source.id,
    name: source.name,
    kind: source.kind,
    enabled: source.enabled,
    priority: source.priority,
    capabilities: source.capabilities,
    location: source.location,
    apiKey: '',
  } : {
    id: '',
    name: '',
    kind: 'http',
    enabled: true,
    priority: Math.max(30, ...sources.map((source) => source.priority + 10)),
    capabilities: ['match', 'domain_trends', 'global_trends'],
    location: '',
    apiKey: '',
  }

  const save = async (source: DataSourceInput) => {
    setMessage('')
    try {
      await invoke('technology_source_save', { source })
      setEditing(null)
      await onRefresh()
    } catch (saveError) {
      setMessage(String(saveError))
    }
  }

  const toggle = async (source: DataSourceView) => {
    await save({ ...draft(source), enabled: !source.enabled })
  }

  const test = async (id: string) => {
    setTesting(id)
    setMessage('')
    try {
      const result = await invoke<SourceTestResult>('technology_source_test', { id })
      setTestResults((current) => ({ ...current, [id]: result }))
    } catch (testError) {
      setMessage(String(testError))
    } finally {
      setTesting('')
    }
  }

  const remove = async (source: DataSourceView) => {
    setMessage('')
    try {
      await invoke('technology_source_delete', { id: source.id })
      await onRefresh()
    } catch (deleteError) {
      setMessage(String(deleteError))
    }
  }

  return <div className="source-overlay">
    <button className="source-dismiss" type="button" onClick={onClose} aria-label="关闭数据源管理" />
    <aside className="source-drawer">
      <header><div><span>DATA SOURCES</span><h2>技术情报来源</h2><p>{enabledCount} 个来源正在参与匹配与趋势聚合</p></div><button type="button" onClick={onClose} title="关闭"><X size={17} /></button></header>
      <div className="source-toolbar"><div><i />配置会自动保存到本机</div><button type="button" onClick={() => setEditing(draft())}><Plus size={14} />接入第三方</button></div>
      {message && <div className="source-message">{message}</div>}
      <div className="source-list">
        {sources.map((source) => {
          const result = testResults[source.id]
          const SourceIcon = source.kind === 'builtin' ? Radar : source.kind === 'technology_exploration' ? PlugZap : Globe2
          return <article className={`source-item ${source.enabled ? 'enabled' : ''}`} key={source.id}>
            <div className="source-item-head"><span className="source-kind"><SourceIcon size={16} /></span><div><b>{source.name}</b><small>{source.kind === 'builtin' ? '内置实时服务' : source.kind === 'technology_exploration' ? '本地报告适配器' : '第三方 HTTP API'}</small></div><button className={`source-switch ${source.enabled ? 'on' : ''}`} type="button" onClick={() => void toggle(source)} aria-label={`${source.enabled ? '停用' : '启用'} ${source.name}`}><i /></button></div>
            <div className="source-location">{source.location || 'GitHub Search · Hacker News'}</div>
            <div className="source-capabilities">{source.capabilities.map((capability) => <span key={capability}>{capabilityLabels[capability] ?? capability}</span>)}</div>
            {result && <div className={`source-test-result ${result.ok ? 'ok' : ''}`}><Check size={11} />{result.message}</div>}
            <footer><span>优先级 {source.priority}{source.apiKeyConfigured ? ' · 已配置凭证' : ''}</span><div><button type="button" disabled={testing === source.id} onClick={() => void test(source.id)}>{testing === source.id ? <LoaderCircle className="spin" size={12} /> : <PlugZap size={12} />}测试</button><button type="button" onClick={() => setEditing(draft(source))}><Settings2 size={12} />配置</button>{!source.locked && <button className="danger" type="button" onClick={() => void remove(source)} title="删除数据源"><Trash2 size={12} /></button>}</div></footer>
          </article>
        })}
      </div>
      <div className="source-contract"><b>统一适配契约</b><p>第三方服务提供 <code>/health</code>、<code>/match</code>、<code>/trends/domain</code> 和 <code>/trends/global</code>。返回结构与技术雷达 API 一致。</p></div>
    </aside>
    {editing && <div className="source-editor">
      <header><div><span>{editing.id ? 'EDIT SOURCE' : 'NEW SOURCE'}</span><h3>{editing.id ? '配置数据源' : '接入第三方技术源'}</h3></div><button type="button" onClick={() => setEditing(null)}><X size={16} /></button></header>
      <label>来源名称<input value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} placeholder="例如：企业技术情报中心" /></label>
      <label>适配类型<select value={editing.kind} disabled={editing.kind === 'builtin'} onChange={(event) => setEditing({ ...editing, kind: event.target.value as DataSourceInput['kind'] })}><option value="http">第三方 HTTP API</option><option value="technology_exploration">本地 Technology Exploration</option><option value="builtin">默认内置源</option></select></label>
      {editing.kind !== 'builtin' && <label>{editing.kind === 'http' ? 'API Base URL' : '本地项目目录'}<input value={editing.location} onChange={(event) => setEditing({ ...editing, location: event.target.value })} placeholder={editing.kind === 'http' ? 'https://example.com/api/v1' : '/Users/.../technology-intelligence'} /></label>}
      {editing.kind === 'http' && <label>Bearer Token<input type="password" value={editing.apiKey} onChange={(event) => setEditing({ ...editing, apiKey: event.target.value })} placeholder="留空则保留已有凭证" /></label>}
      <label>调用优先级<input type="number" min="1" max="999" value={editing.priority} onChange={(event) => setEditing({ ...editing, priority: Number(event.target.value) })} /></label>
      <fieldset><legend>参与能力</legend>{Object.entries(capabilityLabels).map(([capability, label]) => <label key={capability}><input type="checkbox" checked={editing.capabilities.includes(capability)} onChange={(event) => setEditing({ ...editing, capabilities: event.target.checked ? [...editing.capabilities, capability] : editing.capabilities.filter((item) => item !== capability) })} />{label}</label>)}</fieldset>
      <div className="source-editor-actions"><button type="button" onClick={() => setEditing(null)}>取消</button><button className="save" type="button" disabled={!editing.name.trim()} onClick={() => void save(editing)}>保存配置</button></div>
    </div>}
  </div>
}

export function TechnologyRadar({ onClose }: { onClose: () => void }) {
  const [domains, setDomains] = useState<Domain[]>([])
  const [selectedDomain, setSelectedDomain] = useState('enterprise')
  const [tab, setTab] = useState<RadarTab>('match')
  const [requirement, setRequirement] = useState('建设一个设备检修工单管理平台，支持审批流程、移动端和智能知识库')
  const [matches, setMatches] = useState<MatchResponse | null>(null)
  const [solution, setSolution] = useState<SolutionResponse | null>(null)
  const [domainTrends, setDomainTrends] = useState<TrendResponse | null>(null)
  const [globalTrends, setGlobalTrends] = useState<TrendResponse | null>(null)
  const [api, setApi] = useState<ApiStatus | null>(null)
  const [sources, setSources] = useState<DataSourceView[]>([])
  const [showSources, setShowSources] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const activeDomain = useMemo(() => domains.find((domain) => domain.id === selectedDomain), [domains, selectedDomain])

  useEffect(() => {
    void Promise.all([
      invoke<Domain[]>('technology_domains'),
      invoke<ApiStatus>('technology_api_status'),
      invoke<DataSourceView[]>('technology_sources'),
    ]).then(([nextDomains, status, nextSources]) => {
      setDomains(nextDomains)
      setApi(status)
      setSources(nextSources)
    }).catch((loadError) => setError(String(loadError)))
  }, [])

  const refreshSources = async () => {
    setSources(await invoke<DataSourceView[]>('technology_sources'))
    setMatches(null)
    setSolution(null)
    setDomainTrends(null)
    setGlobalTrends(null)
  }

  const search = async () => {
    if (!requirement.trim()) return
    setLoading(true)
    setError('')
    try {
      const request = { requirement: requirement.trim(), domain: selectedDomain, limit: 8 }
      const [nextMatches, nextSolution] = await Promise.all([
        invoke<MatchResponse>('technology_match', { request }),
        invoke<SolutionResponse>('technology_solution', { request }),
      ])
      setMatches(nextMatches)
      setSolution(nextSolution)
      setTab('match')
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : String(searchError))
    } finally {
      setLoading(false)
    }
  }

  const loadDomainTrends = async (domain = selectedDomain) => {
    setLoading(true)
    setError('')
    try {
      setDomainTrends(await invoke<TrendResponse>('technology_domain_trends', { domain, limit: 10 }))
      setTab('domain')
    } catch (trendError) {
      setError(String(trendError))
    } finally {
      setLoading(false)
    }
  }

  const loadGlobalTrends = async () => {
    setLoading(true)
    setError('')
    try {
      setGlobalTrends(await invoke<TrendResponse>('technology_global_trends', { limit: 10 }))
      setTab('global')
    } catch (trendError) {
      setError(String(trendError))
    } finally {
      setLoading(false)
    }
  }

  const changeTab = (next: RadarTab) => {
    if (next === 'domain' && !domainTrends) void loadDomainTrends()
    else if (next === 'global' && !globalTrends) void loadGlobalTrends()
    else setTab(next)
  }

  const changeDomain = (domain: string) => {
    setSelectedDomain(domain)
    setDomainTrends(null)
    if (tab === 'domain') void loadDomainTrends(domain)
  }

  const openUrl = (url: string) => void invoke('technology_open_url', { url })
  const copyApi = async () => {
    if (!api) return
    await navigator.clipboard.writeText(api.baseUrl)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  return <main className="technology-radar">
    <header className="radar-header">
      <button className="radar-back" type="button" onClick={onClose} title="返回交付中心"><ArrowLeft size={17} /></button>
      <div className="radar-brand"><span><Radar size={19} /></span><div><b>技术雷达</b><small>开源技术发现与行业方案</small></div></div>
      <div className="radar-api">
        <span><i />API {api?.online ? '在线' : '启动中'}</span>
        <code>{api?.baseUrl ?? '127.0.0.1:43127/api/v1'}</code>
        <button type="button" onClick={() => void copyApi()} title="复制 API 地址">{copied ? <Check size={14} /> : <Copy size={14} />}</button>
      </div>
      <button className="source-manager-button" type="button" onClick={() => setShowSources(true)}><Settings2 size={15} /><span>数据源</span><b>{sources.filter((source) => source.enabled).length}</b></button>
    </header>
    <div className="radar-workspace">
      <aside className="domain-sidebar">
        <div className="sidebar-label">业务领域</div>
        <nav>{domains.map((domain) => {
          const Icon = domainIcons[domain.icon as keyof typeof domainIcons] ?? Layers3
          return <button className={domain.id === selectedDomain ? 'active' : ''} type="button" onClick={() => changeDomain(domain.id)} key={domain.id}>
            <Icon size={16} /><span><b>{domain.name}</b><small>{domain.description}</small></span><ChevronRight size={13} />
          </button>
        })}</nav>
        <div className="domain-insight"><CircleGauge size={18} /><b>领域视角</b><p>先确定业务问题，再比较技术。热度只是一项信号，不代替适配性判断。</p></div>
      </aside>
      <section className="radar-main">
        <div className="radar-query">
          <div className="query-heading"><div><span>当前领域 · {activeDomain?.name ?? '自动识别'}</span><h1>你想解决什么问题？</h1></div><em>{sources.filter((source) => source.enabled).map((source) => source.name).join(' + ') || '等待启用数据源'}</em></div>
          <div className="query-box"><Search size={20} /><textarea value={requirement} onChange={(event) => setRequirement(event.target.value)} rows={2} placeholder="描述业务场景、关键约束和期望结果…" /><button type="button" disabled={loading || !requirement.trim()} onClick={() => void search()}>{loading ? <LoaderCircle className="spin" size={17} /> : <Sparkles size={17} />}智能匹配</button></div>
          <div className="query-examples"><span>试试</span>{examples.map((example) => <button type="button" onClick={() => setRequirement(example)} key={example}>{example}</button>)}</div>
        </div>
        <nav className="radar-tabs">{tabs.map(([id, label, Icon]) => <button className={tab === id ? 'active' : ''} type="button" onClick={() => changeTab(id)} key={id}><Icon size={15} />{label}</button>)}</nav>
        {error && <div className="radar-error">{error}</div>}
        <div className="radar-content">
          {tab === 'match' && <MatchView data={matches} loading={loading} onOpen={openUrl} />}
          {tab === 'solution' && <SolutionView data={solution} loading={loading} onOpen={openUrl} />}
          {tab === 'domain' && <TrendView data={domainTrends} loading={loading} onOpen={openUrl} />}
          {tab === 'global' && <TrendView data={globalTrends} loading={loading} onOpen={openUrl} />}
          {tab === 'architecture' && <ArchitectureView data={solution} loading={loading} />}
        </div>
      </section>
    </div>
    {showSources && <SourceManager sources={sources} onClose={() => setShowSources(false)} onRefresh={refreshSources} />}
  </main>
}
