import { useEffect, useMemo, useState } from 'react'
import {
  Boxes, CheckCircle2, ChevronLeft, ChevronRight, CircleStop, Clock3, Copy,
  Cpu, Database, Download, Film, ImagePlus, Layers3, ListTodo,
  MemoryStick, MessageSquareText, Play, RefreshCw, RotateCcw, Rocket, Settings,
  Sparkles, Square, TerminalSquare, Timer, Video, Workflow, X,
} from 'lucide-react'
import './App.css'

type ModelFile = { name: string; size: number; present: boolean; downloadedBytes: number; absolute: string }
type Model = {
  id: string
  name: string
  kind: 'text' | 'video'
  runtime: string
  version: string
  license: string
  capabilities: string[]
  installed: boolean
  estimatedDiskBytes: number
  files: ModelFile[]
  download?: { status: string; completed: number; total: number; current?: string }
}
type Job = {
  id: string
  type: 'video' | 'text'
  modelId: string
  title: string
  prompt: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  progress: number
  phase: string
  createdAt: string
  startedAt?: string
  finishedAt?: string
  error?: string
  result?: string
  currentStep?: number
  totalSteps?: number
  legacy?: boolean
  output?: { filename: string; subfolder: string; type: string }
  request?: { width?: number; height?: number; frames?: number; duration?: number; segmentCount?: number; fps?: number; steps?: number; cfg?: number }
}
type AppState = {
  system: {
    platform: string
    arch: string
    cpu: string
    cpuCores: number
    cpuLoadPercent: number
    memory: { total: number; used: number; usedPercent: number }
    disk?: { total: number; free: number }
    runtimes: Record<string, boolean>
  }
  models: Model[]
  state: {
    deployments: Record<string, { status: string; endpoint: string; pid?: number }>
    events: Array<{ id: string; at: string; level: string; message: string; modelId?: string }>
    jobs: Job[]
    settings: { comfyPath: string; modelsPath: string; maxMemoryGb: number }
  }
}

const demoState: AppState = {
  system: {
    platform: 'darwin', arch: 'arm64', cpu: 'Apple M5 Pro', cpuCores: 18, cpuLoadPercent: 12,
    memory: { total: 48 * 1024 ** 3, used: 14.2 * 1024 ** 3, usedPercent: 30 },
    disk: { total: 926 * 1024 ** 3, free: 473 * 1024 ** 3 },
    runtimes: { git: true, ffmpeg: true, 'llama-server': false, python3: true },
  },
  models: [],
  state: { deployments: {}, events: [], jobs: [], settings: { comfyPath: 'runtime/ComfyUI', modelsPath: 'runtime/models', maxMemoryGb: 40 } },
}

const nav = [
  { id: 'overview', label: '任务中心', icon: ListTodo },
  { id: 'models', label: '模型仓库', icon: Boxes },
  { id: 'deploy', label: '服务部署', icon: Rocket },
  { id: 'playground', label: '在线测试', icon: Sparkles },
  { id: 'settings', label: '系统配置', icon: Settings },
]

const formatBytes = (bytes = 0) => `${(bytes / 1024 ** 3).toFixed(bytes > 10 * 1024 ** 3 ? 0 : 1)} GB`
const statusLabel: Record<string, string> = {
  running: '运行中', starting: '启动中', installed: '已安装', stopped: '已停止',
  'not-installed': '未安装', degraded: '异常', failed: '失败',
}
const jobStatusLabel: Record<Job['status'], string> = {
  queued: '排队中', running: '生成中', completed: '已完成', failed: '失败', cancelled: '已取消',
}
const terminalJobs = new Set<Job['status']>(['completed', 'failed', 'cancelled'])
const formatClock = (value?: string) => value ? new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '--:--'
const formatElapsed = (job: Job) => {
  const start = Date.parse(job.startedAt || job.createdAt)
  const end = job.finishedAt ? Date.parse(job.finishedAt) : Date.now()
  const seconds = Math.max(0, Math.round((end - start) / 1000))
  return seconds < 60 ? `${seconds} 秒` : `${Math.floor(seconds / 60)}分${seconds % 60}秒`
}
const paginationItems = (current: number, total: number) => {
  if (total <= 5) return Array.from({ length: total }, (_, index) => index + 1)
  const pages = [...new Set([1, total, current - 1, current, current + 1].filter((page) => page >= 1 && page <= total))].sort((a, b) => a - b)
  return pages.flatMap((page, index) => index > 0 && page - pages[index - 1] > 1 ? [`gap-${page}`, page] : [page])
}

function App() {
  const [active, setActive] = useState('overview')
  const [data, setData] = useState<AppState>(demoState)
  const [connected, setConnected] = useState(false)
  const [busy, setBusy] = useState('')
  const [selected, setSelected] = useState<Model | null>(null)
  const [prompt, setPrompt] = useState('请用清晰的结构解释本地部署大模型时，模型注册、运行时和服务端点之间的关系。')
  const [videoPrompt, setVideoPrompt] = useState('雨后的上海街道，一辆复古电车缓慢驶过，电影级光影，镜头平稳向前推进')
  const [videoConfig, setVideoConfig] = useState({ width: 832, height: 480, duration: 5, fps: 16, steps: 20, cfg: 5 })
  const [referenceImage, setReferenceImage] = useState('')
  const [playingJob, setPlayingJob] = useState<Job | null>(null)
  const [memoryLimit, setMemoryLimit] = useState(40)
  const [result, setResult] = useState('')
  const [jobFilter, setJobFilter] = useState<'all' | 'active' | 'completed' | 'failed'>('all')
  const [jobPage, setJobPage] = useState(1)
  const [jobPageSize, setJobPageSize] = useState(() => window.innerWidth > 920 && window.innerHeight >= 960 ? 8 : 5)

  const refresh = async () => {
    try {
      const response = await fetch('/api/state')
      if (!response.ok) throw new Error()
      const payload = await response.json()
      setData(payload)
      setMemoryLimit((current) => current === 40 ? payload.state.settings.maxMemoryGb : current)
      setConnected(true)
    } catch {
      setConnected(false)
    }
  }

  useEffect(() => {
    const initial = window.setTimeout(refresh, 0)
    const timer = window.setInterval(refresh, 1500)
    const resize = () => setJobPageSize(window.innerWidth > 920 && window.innerHeight >= 960 ? 8 : 5)
    window.addEventListener('resize', resize)
    return () => {
      window.clearTimeout(initial)
      window.clearInterval(timer)
      window.removeEventListener('resize', resize)
    }
  }, [])

  const running = useMemo(
    () => Object.values(data.state.deployments).filter((item) => item.status === 'running').length,
    [data],
  )
  const jobs = data.state.jobs || []
  const activeJobs = jobs.filter((job) => job.status === 'running' || job.status === 'queued')
  const completedToday = jobs.filter((job) => {
    if (job.status !== 'completed' || !job.finishedAt) return false
    return new Date(job.finishedAt).toDateString() === new Date().toDateString()
  })
  const queuedJobs = jobs.filter((job) => job.status === 'queued')
  const finishedJobs = jobs.filter((job) => job.status === 'completed' || job.status === 'failed')
  const successRate = finishedJobs.length ? Math.round((jobs.filter((job) => job.status === 'completed').length / finishedJobs.length) * 100) : 100
  const focusJob = activeJobs[0] || jobs.find((job) => job.status === 'completed') || jobs[0]
  const filteredJobs = jobs.filter((job) => {
    if (jobFilter === 'active') return job.status === 'running' || job.status === 'queued'
    if (jobFilter === 'completed') return job.status === 'completed'
    if (jobFilter === 'failed') return job.status === 'failed'
    return true
  })
  const jobPageCount = Math.max(1, Math.ceil(filteredJobs.length / jobPageSize))
  const currentJobPage = Math.min(jobPage, jobPageCount)
  const jobPageStart = (currentJobPage - 1) * jobPageSize
  const visibleJobs = filteredJobs.slice(jobPageStart, jobPageStart + jobPageSize)
  const modelDisk = data.models.reduce((sum, model) => sum + (model.installed ? model.estimatedDiskBytes : 0), 0)

  const action = async (model: Model, command: 'install' | 'start' | 'stop') => {
    setBusy(`${model.id}:${command}`)
    const response = await fetch(`/api/models/${model.id}/${command}`, { method: 'POST' })
    const payload = await response.json()
    if (!response.ok) setResult(payload.error || '操作失败')
    await refresh()
    setBusy('')
  }

  const generateText = async () => {
    setBusy('generate-text')
    setResult('正在等待本地模型响应...')
    const response = await fetch('/api/generate/text', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }),
    })
    const payload = await response.json()
    setResult(payload.choices?.[0]?.message?.content || payload.error || '无返回内容')
    setBusy('')
  }

  const jobAction = async (job: Job, command: 'cancel' | 'retry') => {
    setBusy(`${job.id}:${command}`)
    const response = await fetch(`/api/jobs/${job.id}/${command}`, { method: 'POST' })
    const payload = await response.json()
    if (!response.ok) setResult(payload.error || '任务操作失败')
    await refresh()
    setBusy('')
  }

  const copyEndpoint = async (endpoint: string) => {
    await navigator.clipboard.writeText(endpoint)
    setResult(`已复制端点：${endpoint}`)
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark"><Workflow size={19} /></div>
        <div><b>MODEL OPS</b><span>Local MaaS Control Plane</span></div>
      </div>
      <nav aria-label="主导航">
        {nav.map(({ id, label, icon: Icon }) =>
          <button key={id} className={active === id ? 'active' : ''} onClick={() => setActive(id)}>
            <Icon size={17} /><span>{label}</span>{id === 'overview' && activeJobs.length > 0 && <i>{activeJobs.length}</i>}
          </button>,
        )}
      </nav>
      <div className="node-summary">
        <span className="eyebrow">LOCAL NODE</span>
        <div className="node-title"><span className={`pulse ${connected ? '' : 'off'}`} />{connected ? '控制面在线' : '预览模式'}</div>
        <p>{data.system.cpu.replace(/^Apple /, '')}</p>
        <div className="mini-bars"><span style={{ width: `${data.system.cpuLoadPercent}%` }} /><span style={{ width: `${data.system.memory.usedPercent}%` }} /></div>
      </div>
      <div className="profile"><div>LY</div><span><b>本地管理员</b><small>127.0.0.1</small></span></div>
    </aside>

    <main className={active === 'overview' ? 'task-main' : ''}>
      <header>
        <div><span className="eyebrow">CONTROL PLANE / {active === 'overview' ? 'TASKS' : active.toUpperCase()}</span><h1>{nav.find((item) => item.id === active)?.label}</h1></div>
        <div className="header-actions">
          <span className="platform">{data.system.platform} · {data.system.arch}</span>
          <button className="icon-btn" title="刷新状态" onClick={refresh}><RefreshCw size={17} /></button>
          <button className="primary" onClick={() => setActive('playground')}><Sparkles size={16} /> 新建生成任务</button>
        </div>
      </header>

      {active === 'overview' && <div className="page task-center">
        <section className="task-summary" aria-label="任务摘要">
          <div className="summary-lead"><span className={`live-dot ${activeJobs.length ? 'busy' : ''}`} /><div><b>{activeJobs.length ? '生成引擎工作中' : '生成引擎空闲'}</b><small>{activeJobs.length ? `${activeJobs.length} 个任务占用执行资源` : '可以提交新的生成任务'}</small></div></div>
          <div className="summary-item"><Layers3 size={16} /><span><b>{queuedJobs.length}</b><small>等待队列</small></span></div>
          <div className="summary-item"><CheckCircle2 size={16} /><span><b>{completedToday.length}</b><small>今日完成</small></span></div>
          <div className="summary-item"><Timer size={16} /><span><b>{successRate}%</b><small>任务成功率</small></span></div>
          <button className="primary" onClick={() => setActive('playground')}><Sparkles size={16} />创建任务</button>
        </section>

        <div className="task-layout">
          <section className="panel queue-panel">
            <div className="queue-heading">
              <div><span className="eyebrow">WORKLOAD QUEUE</span><h2>生成任务队列</h2></div>
              <div className="segmented" aria-label="任务筛选">
                {([['all', '全部'], ['active', '执行中'], ['completed', '已完成'], ['failed', '失败']] as const).map(([id, label]) =>
                  <button key={id} className={jobFilter === id ? 'active' : ''} onClick={() => { setJobFilter(id); setJobPage(1) }}>{label}</button>,
                )}
              </div>
            </div>
            <div className="queue-columns"><span>任务</span><span>配置</span><span>进度</span><span>状态</span><span /></div>
            <div className="job-list">
              {visibleJobs.length ? visibleJobs.map((job, index) => <article className={`job-row ${job.status}`} key={job.id}>
                <span className="job-index">{String(jobPageStart + index + 1).padStart(2, '0')}</span>
                <div className={`job-kind ${job.type}`}>{job.type === 'video' ? <Video size={17} /> : <MessageSquareText size={17} />}</div>
                <div className="job-copy"><b>{job.title}</b><p>{job.prompt || '未记录提示词'}</p><small>{formatClock(job.createdAt)} · {job.modelId.includes('wan') ? 'Wan2.2 5B' : 'Qwen3.5 9B'}</small></div>
                <div className="job-config">{job.type === 'video' ? <><b>{job.request?.width || 832}×{job.request?.height || 480}</b><small>{job.request?.duration || Math.max(1, Math.round(((job.request?.frames || 49) - 1) / (job.request?.fps || 16)))} 秒 · {job.request?.steps || 20} steps</small></> : <><b>TEXT</b><small>本地推理</small></>}</div>
                <div className="job-progress"><div><span>{job.phase}</span><b>{Math.round(job.progress || 0)}%</b></div><div className="job-progress-track"><i style={{ width: `${job.progress || 0}%` }} /></div><small>{job.status === 'running' ? `已运行 ${formatElapsed(job)}` : job.finishedAt ? `耗时 ${formatElapsed(job)}` : '等待执行'}</small></div>
                <span className={`job-status ${job.status}`}><i />{jobStatusLabel[job.status]}</span>
                <div className="job-actions">
                  {!terminalJobs.has(job.status) && <button className="icon-btn" title="取消任务" disabled={busy.startsWith(job.id)} onClick={() => jobAction(job, 'cancel')}><Square size={14} /></button>}
                  {job.status === 'completed' && job.output && <button className="icon-btn" title="播放视频" onClick={() => setPlayingJob(job)}><Play size={15} /></button>}
                  {terminalJobs.has(job.status) && !job.legacy && <button className="icon-btn" title="重新运行" disabled={busy.startsWith(job.id)} onClick={() => jobAction(job, 'retry')}><RotateCcw size={14} /></button>}
                </div>
              </article>) : <div className="empty-queue"><ListTodo size={28} /><b>当前没有生成任务</b><p>从在线测试创建第一条文本或视频任务。</p><button onClick={() => setActive('playground')}><Sparkles size={15} />创建任务</button></div>}
            </div>
            {filteredJobs.length > 0 && <footer className="queue-footer">
              <div className="page-summary"><b>{jobPageStart + 1}-{Math.min(jobPageStart + jobPageSize, filteredJobs.length)}</b><span>共 {filteredJobs.length} 个任务</span></div>
              <nav className="pagination" aria-label="任务分页">
                <button className="icon-btn" title="上一页" disabled={currentJobPage === 1} onClick={() => setJobPage(Math.max(1, currentJobPage - 1))}><ChevronLeft size={15} /></button>
                {paginationItems(currentJobPage, jobPageCount).map((item) => typeof item === 'string'
                  ? <span className="page-gap" key={item}>···</span>
                  : <button key={item} className={currentJobPage === item ? 'active' : ''} aria-label={`第 ${item} 页`} aria-current={currentJobPage === item ? 'page' : undefined} onClick={() => setJobPage(item)}>{item}</button>,
                )}
                <button className="icon-btn" title="下一页" disabled={currentJobPage === jobPageCount} onClick={() => setJobPage(Math.min(jobPageCount, currentJobPage + 1))}><ChevronRight size={15} /></button>
              </nav>
            </footer>}
          </section>

          <aside className="task-rail">
            <section className={`panel focus-job ${focusJob?.status || 'idle'}`}>
              <div className="focus-top"><span className="eyebrow">NOW PROCESSING</span>{focusJob && <span className={`job-status ${focusJob.status}`}><i />{jobStatusLabel[focusJob.status]}</span>}</div>
              {focusJob ? <>
                <div className={`focus-icon ${focusJob.type}`}>{focusJob.type === 'video' ? <Film size={22} /> : <MessageSquareText size={22} />}</div>
                <h2>{focusJob.title}</h2><p className="focus-prompt">{focusJob.type === 'text' && focusJob.result ? focusJob.result : focusJob.prompt}</p>
                <div className="focus-number"><strong>{Math.round(focusJob.progress || 0)}</strong><span>%</span></div>
                <div className="focus-track"><i style={{ width: `${focusJob.progress || 0}%` }} /></div>
                <div className="pipeline-stages">
                  {['准备', '模型执行', '解码', '交付'].map((stage, index) => <span className={(focusJob.progress || 0) >= [5, 20, 92, 100][index] ? 'done' : ''} key={stage}><i />{stage}</span>)}
                </div>
                <div className="focus-meta"><span><Clock3 size={13} />{formatElapsed(focusJob)}</span><span>{focusJob.phase}</span></div>
                <div className="focus-actions">
                  {!terminalJobs.has(focusJob.status) && <button onClick={() => jobAction(focusJob, 'cancel')}><Square size={14} />取消任务</button>}
                  {focusJob.status === 'completed' && focusJob.output && <button className="primary" onClick={() => setPlayingJob(focusJob)}><Play size={15} />播放视频</button>}
                  {terminalJobs.has(focusJob.status) && !focusJob.legacy && <button onClick={() => jobAction(focusJob, 'retry')}><RotateCcw size={14} />再次运行</button>}
                </div>
              </> : <div className="focus-empty"><Film size={28} /><h2>等待新任务</h2><p>生成任务会在这里显示实时阶段和采样进度。</p></div>}
            </section>

            <section className="panel resource-panel">
              <div className="resource-title"><div><span className="eyebrow">LOCAL NODE</span><h3>{data.system.cpu.replace(/^Apple /, '')}</h3></div><span className={`status ${running ? 'running' : 'stopped'}`}><i />{running}/{data.models.length} 服务</span></div>
              <div className="resource-row"><span><MemoryStick size={14} />统一内存</span><b>{data.system.memory.usedPercent}%</b></div><div className="resource-track"><i style={{ width: `${data.system.memory.usedPercent}%` }} /></div>
              <div className="resource-row"><span><Database size={14} />模型占用</span><b>{formatBytes(modelDisk)}</b></div>
              {Object.entries(data.state.deployments).map(([id, deployment]) => <div className="service-line" key={id}><span className={`service-dot ${deployment.status}`} /><div><b>{id.includes('wan') ? 'Wan2.2 Video' : 'Qwen3.5 Text'}</b><small>{deployment.endpoint}</small></div><button className="icon-btn" title="复制服务端点" onClick={() => copyEndpoint(deployment.endpoint)}><Copy size={13} /></button></div>)}
            </section>
          </aside>
        </div>

      </div>}

      {active === 'models' && <div className="page">
        <div className="section-intro"><div><span className="eyebrow">MODEL REGISTRY</span><h2>已验证的本地模型配方</h2></div><p>下载固定版本并校验 SHA-256；模型权重不会进入 Git。</p></div>
        <div className="model-grid">{data.models.map((model) => {
          const deploy = data.state.deployments[model.id]
          const progress = model.files.length ? Math.round(model.files.filter((file) => file.present).length / model.files.length * 100) : 0
          return <article className="model-card" key={model.id}>
            <div className="model-card-head"><div className={`model-icon ${model.kind}`}>{model.kind === 'video' ? <Video /> : <MessageSquareText />}</div><span className={`status ${deploy?.status || 'not-installed'}`}><i />{statusLabel[deploy?.status] || statusLabel['not-installed']}</span></div>
            <h3>{model.name}</h3><p>{model.kind === 'video' ? '高质量文生视频与图生视频混合模型' : '中英双语本地文本生成与 OpenAI 兼容服务'}</p>
            <div className="tags">{model.capabilities.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}</div>
            <dl><div><dt>运行时</dt><dd>{model.runtime}</dd></div><div><dt>权重</dt><dd>{model.version}</dd></div><div><dt>磁盘</dt><dd>{formatBytes(model.estimatedDiskBytes)}</dd></div><div><dt>许可</dt><dd>{model.license}</dd></div></dl>
            <div className="progress"><span style={{ width: `${progress}%` }} /></div>
            <div className="card-actions">
              {!model.installed ? <button className="primary" disabled={busy.startsWith(model.id)} onClick={() => action(model, 'install')}><Download size={16} />{model.download?.status === 'running' ? `下载 ${model.download.completed}/${model.download.total}` : '安装模型'}</button> :
                deploy?.status === 'running' ? <button onClick={() => action(model, 'stop')}><CircleStop size={16} />停止</button> : <button className="primary" onClick={() => action(model, 'start')}><Play size={16} />启动服务</button>}
              <button className="icon-btn" title="模型详情" onClick={() => setSelected(model)}><Settings size={16} /></button>
            </div>
          </article>
        })}</div>
      </div>}

      {active === 'deploy' && <div className="page">
        <section className="deploy-flow">
          <div className="flow-copy"><span className="eyebrow">GUIDED DEPLOYMENT</span><h2>从模型到本地端点</h2><p>依次完成运行时、权重校验、服务启动和健康探测。视频与文本模型默认互斥加载，给 48 GB 统一内存留出系统余量。</p></div>
          {data.models.map((model, index) => <article className="deploy-step" key={model.id}>
            <span className="step-no">0{index + 1}</span><div className={`model-icon ${model.kind}`}>{model.kind === 'video' ? <Video /> : <MessageSquareText />}</div>
            <div><h3>{model.name}</h3><p>{model.installed ? '权重已经校验，可以启动服务。' : `需要下载 ${formatBytes(model.estimatedDiskBytes)}。`}</p></div>
            <button className={model.installed ? '' : 'primary'} onClick={() => action(model, model.installed ? 'start' : 'install')} disabled={busy.startsWith(model.id)}>{model.installed ? <Play size={16} /> : <Download size={16} />}{model.installed ? '启动' : '安装'}</button>
          </article>)}
        </section>
      </div>}

      {active === 'playground' && <div className="page playground">
        <section className="panel prompt-panel">
          <div className="panel-title"><div><span className="eyebrow">TEXT / OPENAI COMPATIBLE</span><h2>文本生成</h2></div><MessageSquareText size={18} /></div>
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} />
          <button className="primary" onClick={generateText} disabled={busy === 'generate-text'}><Play size={16} />{busy === 'generate-text' ? '生成中' : '运行推理'}</button>
        </section>
        <section className="panel prompt-panel">
          <div className="panel-title"><div><span className="eyebrow">VIDEO / COMFYUI</span><h2>视频任务</h2></div><Video size={18} /></div>
          <textarea value={videoPrompt} onChange={(event) => setVideoPrompt(event.target.value)} />
          <label className="file-picker"><ImagePlus size={16} />{referenceImage ? '参考图已就绪' : '添加参考图（可选）'}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => {
            const file = event.target.files?.[0]
            if (!file) return setReferenceImage('')
            if (file.size > 7_000_000) {
              setResult('参考图不能超过 7 MB')
              event.target.value = ''
              return
            }
            const reader = new FileReader()
            reader.onload = () => setReferenceImage(String(reader.result || ''))
            reader.readAsDataURL(file)
          }} /></label>
          <div className="duration-field">
            <div className="duration-label"><span>生成时长</span><small>{videoConfig.duration === 5 ? '单段生成' : `${videoConfig.duration / 5} 段续接并自动合并`}</small></div>
            <div className="duration-options" aria-label="生成时长">
              {[5, 10, 30, 60].map((seconds) => <button key={seconds} className={videoConfig.duration === seconds ? 'active' : ''} onClick={() => setVideoConfig({ ...videoConfig, duration: seconds })}>{seconds}s</button>)}
            </div>
          </div>
          <div className="video-controls">
            {([
              ['width', '宽'], ['height', '高'], ['fps', 'FPS'], ['steps', '步数'], ['cfg', 'CFG'],
            ] as const).map(([key, label]) => <label key={key}>{label}<input type="number" value={videoConfig[key]} onChange={(event) => setVideoConfig({ ...videoConfig, [key]: Number(event.target.value) })} /></label>)}
          </div>
          <div className="param-row"><span>Euler</span><span>Simple</span><span>FP16</span><span>Tiled VAE</span></div>
          <button onClick={async () => {
            setBusy('generate-video')
            const response = await fetch('/api/generate/video', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: videoPrompt, imageBase64: referenceImage || undefined, ...videoConfig }) })
            const payload = await response.json()
            setResult(payload.prompt_id ? `任务已入队：${payload.prompt_id}` : payload.error)
            if (payload.prompt_id) {
              await refresh()
              setActive('overview')
            }
            setBusy('')
          }}><Play size={16} />提交生成任务</button>
        </section>
        <section className="panel output"><TerminalSquare size={18} /><pre>{result || '推理结果和错误信息会显示在这里。'}</pre></section>
      </div>}

      {active === 'settings' && <div className="page settings-page">
        <section className="panel"><div className="panel-title"><div><span className="eyebrow">PATHS</span><h2>存储与资源</h2></div><Database size={18} /></div>
          <label>ComfyUI 目录<input value={data.state.settings.comfyPath} readOnly /></label>
          <label>模型目录<input value={data.state.settings.modelsPath} readOnly /></label>
          <label>统一内存上限（GB）<input type="number" min="8" max="256" value={memoryLimit} onChange={(event) => setMemoryLimit(Number(event.target.value))} /></label>
          <button className="save-settings" onClick={async () => {
            const response = await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ maxMemoryGb: memoryLimit }) })
            const payload = await response.json()
            setResult(response.ok ? `内存策略已更新为 ${payload.maxMemoryGb} GB` : payload.error)
            await refresh()
          }}><Settings size={16} />保存策略</button>
        </section>
        <section className="panel policy"><div className="panel-title"><div><span className="eyebrow">MAC POLICY</span><h2>MPS 稳定性策略</h2></div><Cpu size={18} /></div>
          {['禁用 FP8 权重', '固定 Euler sampler', '启用 tiled VAE decode', '失败时降低帧数与分辨率', '本地回环地址绑定'].map((item) => <div className="check" key={item}><i />{item}</div>)}
        </section>
      </div>}
    </main>

    {selected && <div className="drawer-backdrop" onClick={() => setSelected(null)}><aside className="drawer" onClick={(event) => event.stopPropagation()}>
      <button className="icon-btn close" onClick={() => setSelected(null)}><X size={18} /></button>
      <span className="eyebrow">MODEL DETAIL</span><h2>{selected.name}</h2><p>{selected.runtime} · {selected.version}</p>
      <h3>模型文件</h3>{selected.files.map((file) => <div className="file-row" key={file.name}><div><b>{file.name}</b><small>{file.absolute}</small></div><span>{formatBytes(file.size)}</span></div>)}
      <h3>能力</h3><div className="tags">{selected.capabilities.map((item) => <span key={item}>{item}</span>)}</div>
    </aside></div>}
    {playingJob && <div className="video-modal-backdrop" onClick={() => setPlayingJob(null)}>
      <section className="video-modal" onClick={(event) => event.stopPropagation()}>
        <div className="video-modal-head"><div><span className="eyebrow">GENERATED OUTPUT</span><h2>{playingJob.title}</h2></div><button className="icon-btn" title="关闭播放器" onClick={() => setPlayingJob(null)}><X size={18} /></button></div>
        <video src={`/api/jobs/${playingJob.id}/output`} controls autoPlay playsInline />
        <div className="video-modal-meta"><div><b>{playingJob.output?.filename}</b><p>{playingJob.prompt}</p></div><a href={`/api/jobs/${playingJob.id}/output`} download><Download size={15} />下载视频</a></div>
      </section>
    </div>}
  </div>
}

export default App
