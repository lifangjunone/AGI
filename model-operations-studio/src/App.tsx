import { useEffect, useMemo, useState } from 'react'
import {
  Activity, Boxes, ChevronRight, CircleStop, Cpu, Database, Download,
  Gauge, HardDrive, LayoutDashboard, MemoryStick, MessageSquareText,
  Play, RefreshCw, Rocket, ServerCog, Settings, Sparkles, TerminalSquare,
  Video, Workflow, X,
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
  state: { deployments: {}, events: [], settings: { comfyPath: 'runtime/ComfyUI', modelsPath: 'runtime/models', maxMemoryGb: 40 } },
}

const nav = [
  { id: 'overview', label: '总览', icon: LayoutDashboard },
  { id: 'models', label: '模型仓库', icon: Boxes },
  { id: 'deploy', label: '部署', icon: Rocket },
  { id: 'playground', label: '在线测试', icon: Sparkles },
  { id: 'settings', label: '系统配置', icon: Settings },
]

const formatBytes = (bytes = 0) => `${(bytes / 1024 ** 3).toFixed(bytes > 10 * 1024 ** 3 ? 0 : 1)} GB`
const statusLabel: Record<string, string> = {
  running: '运行中', starting: '启动中', installed: '已安装', stopped: '已停止',
  'not-installed': '未安装', degraded: '异常', failed: '失败',
}

function Metric({ label, value, note, icon: Icon, tone = 'mint' }: {
  label: string; value: string; note: string; icon: typeof Cpu; tone?: string
}) {
  return <section className={`metric ${tone}`}>
    <div className="metric-head"><span>{label}</span><Icon size={17} /></div>
    <strong>{value}</strong><small>{note}</small>
  </section>
}

function App() {
  const [active, setActive] = useState('overview')
  const [data, setData] = useState<AppState>(demoState)
  const [connected, setConnected] = useState(false)
  const [busy, setBusy] = useState('')
  const [selected, setSelected] = useState<Model | null>(null)
  const [prompt, setPrompt] = useState('请用清晰的结构解释本地部署大模型时，模型注册、运行时和服务端点之间的关系。')
  const [videoPrompt, setVideoPrompt] = useState('雨后的上海街道，一辆复古电车缓慢驶过，电影级光影，镜头平稳向前推进')
  const [videoConfig, setVideoConfig] = useState({ width: 832, height: 480, frames: 49, fps: 16, steps: 20, cfg: 5 })
  const [memoryLimit, setMemoryLimit] = useState(40)
  const [result, setResult] = useState('')

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
    const timer = window.setInterval(refresh, 4000)
    return () => {
      window.clearTimeout(initial)
      window.clearInterval(timer)
    }
  }, [])

  const running = useMemo(
    () => Object.values(data.state.deployments).filter((item) => item.status === 'running').length,
    [data],
  )

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

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark"><Workflow size={19} /></div>
        <div><b>MODEL OPS</b><span>Local MaaS Control Plane</span></div>
      </div>
      <nav aria-label="主导航">
        {nav.map(({ id, label, icon: Icon }) =>
          <button key={id} className={active === id ? 'active' : ''} onClick={() => setActive(id)}>
            <Icon size={17} /><span>{label}</span>{id === 'models' && <i>{data.models.length}</i>}
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

    <main>
      <header>
        <div><span className="eyebrow">CONTROL PLANE / {active.toUpperCase()}</span><h1>{nav.find((item) => item.id === active)?.label}</h1></div>
        <div className="header-actions">
          <span className="platform">{data.system.platform} · {data.system.arch}</span>
          <button className="icon-btn" title="刷新状态" onClick={refresh}><RefreshCw size={17} /></button>
          <button className="primary" onClick={() => setActive('deploy')}><Rocket size={16} /> 部署模型</button>
        </div>
      </header>

      {active === 'overview' && <div className="page">
        <div className="metrics">
          <Metric label="活跃服务" value={`${running} / ${data.models.length || 2}`} note="本地推理端点" icon={ServerCog} />
          <Metric label="统一内存" value={`${data.system.memory.usedPercent}%`} note={`${formatBytes(data.system.memory.used)} / ${formatBytes(data.system.memory.total)}`} icon={MemoryStick} tone="amber" />
          <Metric label="系统负载" value={`${data.system.cpuLoadPercent}%`} note={`${data.system.cpuCores} 核可用`} icon={Gauge} tone="blue" />
          <Metric label="模型空间" value={formatBytes((data.system.disk?.total || 0) - (data.system.disk?.free || 0))} note={`${formatBytes(data.system.disk?.free)} 可用`} icon={HardDrive} tone="rose" />
        </div>
        <div className="split">
          <section className="panel deployments">
            <div className="panel-title"><div><span className="eyebrow">DEPLOYMENTS</span><h2>模型服务</h2></div><button className="text-btn" onClick={() => setActive('models')}>查看全部 <ChevronRight size={15} /></button></div>
            {(data.models.length ? data.models : [
              { id: 'wan22-ti2v-5b-fp16', name: 'Wan2.2 TI2V 5B', kind: 'video', runtime: 'ComfyUI', version: 'FP16', installed: false, capabilities: [], files: [], estimatedDiskBytes: 22_775_459_193, license: 'Apache-2.0' },
              { id: 'qwen35-9b-q4', name: 'Qwen3.5 9B', kind: 'text', runtime: 'llama.cpp', version: 'Q4_K_M', installed: false, capabilities: [], files: [], estimatedDiskBytes: 5_680_522_464, license: 'Apache-2.0' },
            ] as Model[]).map((model) => {
              const deploy = data.state.deployments[model.id] || { status: 'not-installed', endpoint: '未分配' }
              return <article className="deployment-row" key={model.id} onClick={() => setSelected(model)}>
                <div className={`model-icon ${model.kind}`}>{model.kind === 'video' ? <Video size={20} /> : <MessageSquareText size={20} />}</div>
                <div className="model-main"><b>{model.name}</b><span>{model.runtime} · {model.version}</span></div>
                <div className="endpoint"><span>端点</span><code>{deploy.endpoint}</code></div>
                <div className={`status ${deploy.status}`}><i />{statusLabel[deploy.status] || deploy.status}</div>
                <button className="icon-btn" title="查看模型"><ChevronRight size={17} /></button>
              </article>
            })}
          </section>
          <section className="panel events">
            <div className="panel-title"><div><span className="eyebrow">ACTIVITY</span><h2>运行事件</h2></div><Activity size={18} /></div>
            {(data.state.events.length ? data.state.events : [
              { id: '1', level: 'info', message: '控制面已就绪，等待部署首个模型', at: new Date().toISOString() },
              { id: '2', level: 'success', message: 'Apple Metal 运行环境可用', at: new Date().toISOString() },
            ]).slice(0, 6).map((item) => <div className="event" key={item.id}>
              <i className={item.level} /><div><p>{item.message}</p><time>{new Date(item.at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</time></div>
            </div>)}
          </section>
        </div>
        <section className="panel runtime-strip">
          <div><span className="eyebrow">RUNTIME READINESS</span><h2>运行时检查</h2></div>
          {Object.entries(data.system.runtimes).map(([name, ok]) => <div className="runtime" key={name}><i className={ok ? 'ok' : ''} /><span>{name}</span><b>{ok ? '就绪' : '待安装'}</b></div>)}
        </section>
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
          <div className="video-controls">
            {([
              ['width', '宽'], ['height', '高'], ['frames', '帧'], ['fps', 'FPS'], ['steps', '步数'], ['cfg', 'CFG'],
            ] as const).map(([key, label]) => <label key={key}>{label}<input type="number" value={videoConfig[key]} onChange={(event) => setVideoConfig({ ...videoConfig, [key]: Number(event.target.value) })} /></label>)}
          </div>
          <div className="param-row"><span>Euler</span><span>Simple</span><span>FP16</span><span>Tiled VAE</span></div>
          <button onClick={async () => {
            setBusy('generate-video')
            const response = await fetch('/api/generate/video', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: videoPrompt, ...videoConfig }) })
            const payload = await response.json(); setResult(payload.prompt_id ? `任务已入队：${payload.prompt_id}` : payload.error); setBusy('')
          }}><Play size={16} />提交基准任务</button>
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
  </div>
}

export default App
