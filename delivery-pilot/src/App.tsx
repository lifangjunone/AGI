import { useEffect, useMemo, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Code2,
  ExternalLink,
  FileText,
  House,
  LibraryBig,
  ListChecks,
  Presentation,
  Radar,
  ScrollText,
  Sparkles,
  UsersRound,
  Wrench,
} from 'lucide-react'
import './App.css'
import { getExecutiveStages, getProgress, getStageProjection } from './domain/projection'
import {
  artifactBelongsToStage,
  defaultTabForStage,
  dependencyForStage,
  stageInput,
  stageOutput,
  tabsForStage,
  type DeveloperTab,
} from './domain/developerContext'
import {
  inferFeatureName,
  inferFeatureNameFromText,
  inferProjectName,
  inferProjectNameFromText,
} from './domain/workspace'
import { stageDefinitions, type AutomationMode, type SourceDocument, type StageName, type TechnologyReferenceConfig } from './domain/types'
import { formatBytes, formatTime } from './shared/format'
import { TechnologyRadar } from './technology/TechnologyRadar'
import {
  useDeliveryStore as useTaskStore,
  defaultTechnologyReference,
  promptForTask,
  type CodeGraphStatus,
  type WorkspaceVersion,
} from './stores/deliveryStore'
import { runtimeLabels, useWorkforceStore } from './stores/workforceStore'
import { DigitalWorkforce, EmployeeAvatar, ProjectSquad, SquadSelector } from './workforce/DigitalWorkforce'
import { currentEmployee, deliveryMembers, employeeForEvent, employeeForStage } from './workforce/assignment'

function Mark({ name }: { name: 'pilot' | 'upload' | 'check' | 'terminal' | 'file' | 'pulse' }) {
  const paths = {
    pilot: <><path d="M12 2 4 6v6c0 5 3.4 8.8 8 10 4.6-1.2 8-5 8-10V6l-8-4Z" /><path d="m8.5 12 2.2 2.2 4.8-5" /></>,
    upload: <><path d="M12 16V4m0 0L7 9m5-5 5 5" /><path d="M4 15v5h16v-5" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    terminal: <><path d="m5 7 4 4-4 4" /><path d="M11 15h8" /></>,
    file: <><path d="M6 2h8l4 4v16H6z" /><path d="M14 2v5h5" /></>,
    pulse: <><path d="M3 12h4l2-5 4 10 2-5h6" /></>,
  }
  return <svg className="mark" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>
}

type HistoryProject = {
  projectId: string
  projectName: string
  versions: WorkspaceVersion[]
}

type RequirementRecommendation = {
  projectName: string
  feature: string
  source: 'model' | 'fallback'
  model: string | null
  reason: string
}

type DemoHandoff = {
  deliveryId: string
  projectId: string
  projectName: string
  summary: string
  requestPath: string
  sourceDocument: SourceDocument
}

type SupervisorEvent = {
  timestampMs: number
  kind: string
  message: string
}

type SupervisorTask = {
  taskId: string
  workspacePath: string
  stage: string
  appName: string
  bundleId: string
  state: string
  health: string
  healthMessage: string
  pid: number
  retryCount: number
  maxRetries: number
  recoveryCount: number
  lastCheckAtMs: number
  lastHealthyAtMs: number
  lastProgressAtMs: number
  nextRetryAtMs: number
  progressPercent: number
  appRunning: boolean
  windowAvailable: boolean
  appBusy: boolean
  taskMatch: boolean
  controllerError: string | null
  lastError: string | null
  events: SupervisorEvent[]
}

type SupervisorRuntime = {
  loopRunning: boolean
  launchAgentLoaded: boolean
  autoRecoveryEnabled: boolean
  autoRecoveryArmed: boolean
  recoveryRequired: boolean
  launchAgentLabel: string
  checkIntervalSeconds: number
  detail: string
}

type ExecutionTool = {
  id: string
  name: string
  kind: string
  transport: string
  status: string
  detail: string
  capabilities: string[]
  activeRuns: number
}

type ExecutionEvent = {
  id: string
  sequence: number
  taskId: string
  toolId: string
  toolName: string
  timestampMs: number
  category: string
  severity: string
  kind: string
  message: string
}

type AttentionItem = {
  id: string
  taskId: string
  severity: string
  title: string
  detail: string
  toolName: string
  workspacePath: string
  createdAtMs: number
  actions: Array<{ id: string; label: string; command: string | null }>
}

type ExecutionControlSnapshot = {
  generatedAtMs: number
  tools: ExecutionTool[]
  runs: Array<{ id: string; state: string; health: string }>
  transcript: ExecutionEvent[]
  attention: AttentionItem[]
}

const supervisorHealthLabels: Record<string, string> = {
  starting: '正在接管',
  healthy: '运行正常',
  task_unverified: '任务确认中',
  offline: '应用已退出',
  stalled: '任务疑似卡住',
  recovering: '正在恢复',
  recovery_pending: '等待恢复',
  recovery_failed: '恢复失败',
  transition_failed: '接续失败',
  controller_unavailable: '控制器异常',
  waiting_unlock: '等待解锁',
  waiting_technology: '等待技术参考',
  retry_exhausted: '需要人工确认',
  completed: '阶段完成',
  stopped: '监督已停止',
}

function MonitoringLogic({
  tasks,
  runtime,
}: {
  tasks: SupervisorTask[]
  runtime: SupervisorRuntime | null
}) {
  const health = new Set(tasks.map((task) => task.health))
  const active = (values: string[]) => values.some((value) => health.has(value))
  return <section className="monitoring-logic" aria-label="监控逻辑">
    <div className="monitoring-logic-head">
      <div><span className="eyebrow">后台决策链</span><h2>监控逻辑</h2></div>
      <span className={runtime?.autoRecoveryArmed ? 'runtime-ready' : 'runtime-warning'}>
        <i />{runtime?.autoRecoveryArmed
          ? '运行中任务受异常恢复保护'
          : runtime?.autoRecoveryEnabled
            ? '当前没有需要恢复的任务'
            : '异常恢复已关闭'}
      </span>
    </div>
    <div className="logic-primary">
      <div className={`logic-node ${runtime?.loopRunning ? 'active' : ''}`}><small>每 10 秒</small><b>后台巡检</b><span>独立于任务页面运行</span></div>
      <i>→</i>
      <div className={`logic-node ${active(['offline']) ? 'warning' : 'active'}`}><small>第一层</small><b>进程与窗口</b><span>软件是否真实可控制</span></div>
      <i>→</i>
      <div className={`logic-node ${active(['task_unverified']) ? 'warning' : 'active'}`}><small>第二层</small><b>当前任务匹配</b><span>窗口与工作区一致</span></div>
      <i>→</i>
      <div className={`logic-node ${active(['stalled']) ? 'danger' : 'active'}`}><small>第三层</small><b>产物心跳</b><span>识别假运行与真实卡死</span></div>
      <i>→</i>
      <div className={`logic-node outcome ${active(['healthy', 'completed']) ? 'active' : ''}`}><small>正常路径</small><b>持续执行</b><span>阶段完成后自动接续</span></div>
    </div>
    <div className="logic-branches">
      <div className={`logic-branch ${active(['waiting_unlock']) ? 'current' : ''}`}><b>锁屏</b><span>保留检查点，等待解锁，不消耗重试</span></div>
      <div className={`logic-branch ${active(['controller_unavailable']) ? 'current danger' : ''}`}><b>控制器异常</b><span>不误判客户软件，不重启，不消耗重试</span></div>
      <div className={`logic-branch ${active(['offline', 'stalled', 'recovery_failed']) ? 'current warning' : ''}`}><b>退出 / 超时 / 卡住</b><span>启动软件 → 读取检查点 → 续跑未完成步骤</span></div>
      <div className={`logic-branch ${active(['retry_exhausted']) ? 'current danger' : ''}`}><b>连续恢复失败</b><span>指数退避，最多 4 次，再转人工确认</span></div>
    </div>
    <div className="logic-footer">
      <span><i className="ok" />绿色：健康路径</span>
      <span><i className="warn" />橙色：正在恢复</span>
      <span><i className="bad" />红色：需要关注</span>
      <code>{runtime?.launchAgentLabel ?? 'com.deliverypilot.supervisor'}</code>
    </div>
  </section>
}

function TaskManager({ onClose }: { onClose: () => void }) {
  const [tasks, setTasks] = useState<SupervisorTask[]>([])
  const [runtime, setRuntime] = useState<SupervisorRuntime | null>(null)
  const [controlCenter, setControlCenter] = useState<ExecutionControlSnapshot | null>(null)
  const [view, setView] = useState<'overview' | 'attention' | 'transcript' | 'tools'>('overview')
  const [showLogic, setShowLogic] = useState(false)
  const [error, setError] = useState('')
  const [workingTask, setWorkingTask] = useState('')
  const [savingRecovery, setSavingRecovery] = useState(false)
  const load = async () => {
    try {
      const [nextTasks, nextRuntime, nextControlCenter] = await Promise.all([
        invoke<SupervisorTask[]>('supervisor_tasks'),
        invoke<SupervisorRuntime>('supervisor_runtime_status'),
        invoke<ExecutionControlSnapshot>('execution_control_snapshot'),
      ])
      setTasks(nextTasks)
      setRuntime(nextRuntime)
      setControlCenter(nextControlCenter)
      setError('')
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError))
    }
  }
  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(), 5000)
    return () => window.clearInterval(timer)
  }, [])
  const control = async (taskId: string, action: string) => {
    setWorkingTask(`${taskId}:${action}`)
    try {
      await invoke('supervisor_control', { taskId, action })
      await load()
    } catch (controlError) {
      setError(controlError instanceof Error ? controlError.message : String(controlError))
    } finally {
      setWorkingTask('')
    }
  }
  const setAutoRecovery = async (enabled: boolean) => {
    setSavingRecovery(true)
    try {
      const nextRuntime = await invoke<SupervisorRuntime>('supervisor_auto_recovery_set', { enabled })
      setRuntime(nextRuntime)
      setError('')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError))
    } finally {
      setSavingRecovery(false)
    }
  }
  const activeCount = tasks.filter((task) => ['monitoring', 'recovering'].includes(task.state)).length
  const attentionCount = controlCenter?.attention.length ?? 0
  return <main className="task-manager-shell">
    <header className="task-manager-header">
      <div className="brand"><span className="brand-icon"><Mark name="pilot" /></span><div><b>DeliveryPilot</b><small>执行控制中心</small></div></div>
      <button type="button" onClick={onClose}>返回工作台</button>
    </header>
    <section className="task-manager-content">
      <div className="task-manager-title">
        <div><span className="eyebrow">GUI · Provider API · CLI</span><h1>执行控制中心</h1><p>统一管理执行工具、任务检查点、异常决策和完整运行记录。</p></div>
        <div className="supervisor-summary"><span><b>{activeCount}</b>受管任务</span><span className={attentionCount ? 'attention' : ''}><b>{attentionCount}</b>待我处理</span><span><b>{runtime?.checkIntervalSeconds ?? 10}s</b>巡检周期</span><button type="button" onClick={() => setShowLogic((value) => !value)}>{showLogic ? '收起逻辑' : '查看监控逻辑'}</button></div>
      </div>
      <div className={`supervisor-runtime ${runtime?.autoRecoveryEnabled && !runtime?.launchAgentLoaded ? 'warning' : 'ready'}`}>
        <i />
        <b>{runtime?.detail ?? '正在确认后台监督状态'}</b>
        <span>{runtime?.autoRecoveryArmed ? '仅异常退出时拉起；主动退出始终保持关闭' : runtime?.recoveryRequired ? '任务仍受应用内巡检保护' : '空闲时不会自动启动应用'}</span>
        <label className="supervisor-recovery-toggle">
          <input
            type="checkbox"
            checked={runtime?.autoRecoveryEnabled ?? false}
            disabled={!runtime || savingRecovery}
            onChange={(event) => void setAutoRecovery(event.target.checked)}
          />
          <span>{savingRecovery ? '保存中' : '异常退出自动恢复'}</span>
        </label>
      </div>
      {showLogic && <MonitoringLogic tasks={tasks} runtime={runtime} />}
      {error && <div className="supervisor-error">{error}</div>}
      <nav className="control-center-tabs" aria-label="执行控制中心视图">
        <button type="button" className={view === 'overview' ? 'active' : ''} onClick={() => setView('overview')}><Activity />总览</button>
        <button type="button" className={view === 'attention' ? 'active attention' : ''} onClick={() => setView('attention')}><AlertTriangle />待我处理{attentionCount > 0 && <b>{attentionCount}</b>}</button>
        <button type="button" className={view === 'transcript' ? 'active' : ''} onClick={() => setView('transcript')}><ScrollText />执行记录</button>
        <button type="button" className={view === 'tools' ? 'active' : ''} onClick={() => setView('tools')}><Wrench />执行工具</button>
      </nav>
      {view === 'overview' && <div className="supervisor-list">
        {tasks.map((task) => {
          const paused = task.state === 'paused'
          const stopped = task.state === 'stopped'
          const completed = task.state === 'completed'
          return <article className={`supervisor-task ${task.health}`} key={task.taskId}>
            <div className="supervisor-task-head">
              <span className="supervisor-app-icon">{task.appName.includes('Work') || task.bundleId.includes('solo') ? 'W' : 'C'}</span>
              <div><small>{task.stage === 'traework_analysis' ? '需求分析' : '研发交付'}</small><h2>{task.appName}</h2><code>{task.workspacePath}</code></div>
              <span className={`supervisor-health ${task.health}`}><i />{supervisorHealthLabels[task.health] ?? task.health}</span>
            </div>
            <div className="supervisor-progress"><i style={{ width: `${task.progressPercent}%` }} /></div>
            <div className="supervisor-facts">
              <span><small>应用进程</small><b className={completed || task.appRunning ? 'ok' : 'bad'}>{completed ? '阶段已归档' : task.appRunning ? `运行中 · PID ${task.pid}` : '未运行'}</b></span>
              <span><small>应用窗口</small><b className={completed || task.windowAvailable ? 'ok' : 'bad'}>{completed ? '无需监控' : task.windowAvailable ? '可访问' : '不可访问'}</b></span>
              <span><small>任务状态</small><b>{completed ? '产物已校验' : task.appBusy ? '正在生成' : task.taskMatch ? '工作区匹配' : '等待心跳确认'}</b></span>
              <span><small>恢复次数</small><b>{task.recoveryCount} 次 · 本轮 {task.retryCount}/{task.maxRetries}</b></span>
              <span><small>最后巡检</small><b>{task.lastCheckAtMs ? new Date(task.lastCheckAtMs).toLocaleTimeString() : '-'}</b></span>
            </div>
            <div className="supervisor-message"><Mark name="pulse" /><span><b>{task.healthMessage}</b>{task.lastError && <small>{task.lastError}</small>}</span></div>
            {task.events.length > 0 && <div className="supervisor-events">{task.events.slice(0, 3).map((event) => <span key={`${event.timestampMs}-${event.kind}`}><time>{new Date(event.timestampMs).toLocaleTimeString()}</time><b>{event.message}</b></span>)}</div>}
            <div className="supervisor-actions">
              {!completed && !stopped && <button type="button" className="recover" disabled={!!workingTask} onClick={() => void control(task.taskId, 'recover_now')}>立即恢复</button>}
              {!completed && !stopped && <button type="button" disabled={!!workingTask} onClick={() => void control(task.taskId, paused ? 'resume' : 'pause')}>{paused ? '继续监督' : '暂停监督'}</button>}
              {task.retryCount >= task.maxRetries && <button type="button" disabled={!!workingTask} onClick={() => void control(task.taskId, 'reset_budget')}>重置重试</button>}
              {!completed && !stopped && <button type="button" className="stop" disabled={!!workingTask} onClick={() => void control(task.taskId, 'stop')}>停止任务</button>}
              {stopped && <button type="button" disabled={!!workingTask} onClick={() => void control(task.taskId, 'resume')}>重新托管</button>}
            </div>
          </article>
        })}
        {tasks.length === 0 && <div className="supervisor-empty"><Mark name="pulse" /><b>还没有受管任务</b><span>Trae Work 或 Trae Code 确认接收任务后，会自动进入这里。</span></div>}
      </div>}
      {view === 'attention' && <section className="attention-inbox">
        {(controlCenter?.attention ?? []).map((item) => <article className={item.severity} key={item.id}>
          <span className="attention-icon"><AlertTriangle /></span>
          <div><small>{item.toolName} · {new Date(item.createdAtMs).toLocaleString()}</small><h2>{item.title}</h2><p>{item.detail}</p><code>{item.workspacePath}</code></div>
          <div className="attention-actions">{item.actions.map((action) => action.command
            ? <button type="button" disabled={!!workingTask} onClick={() => void control(item.taskId, action.command!)} key={action.id}>{action.label}</button>
            : <span key={action.id}>{action.label}</span>)}</div>
        </article>)}
        {attentionCount === 0 && <div className="control-empty"><ListChecks /><b>当前不需要你介入</b><span>可自动恢复的问题由后台处理，不会在这里制造通知噪声。</span></div>}
      </section>}
      {view === 'transcript' && <section className="execution-transcript">
        <header><div><b>执行飞行记录</b><span>跨任务、跨工具按统一序号回放</span></div><code>{controlCenter?.transcript.length ?? 0} events</code></header>
        <div>{(controlCenter?.transcript ?? []).map((event) => <article className={event.severity} key={event.id}>
          <span>#{String(event.sequence).padStart(4, '0')}</span>
          <time>{new Date(event.timestampMs).toLocaleString()}</time>
          <b>{event.toolName}</b>
          <em>{event.category}</em>
          <p>{event.message}</p>
        </article>)}</div>
        {(controlCenter?.transcript.length ?? 0) === 0 && <div className="control-empty"><ScrollText /><b>还没有执行记录</b><span>工具接收任务后，生命周期、进度、恢复和人工操作会统一记录。</span></div>}
      </section>}
      {view === 'tools' && <section className="execution-tools">
        {(controlCenter?.tools ?? []).map((tool) => <article key={tool.id}>
          <header><span>{tool.name.split(' ').map((part) => part[0]).join('').slice(0, 2)}</span><div><small>{tool.kind}</small><h2>{tool.name}</h2></div><em className={tool.status}><i />{tool.status === 'active' ? '执行中' : tool.status === 'ready' ? '已就绪' : tool.status === 'standby' ? '待启动' : tool.status === 'attention' ? '需处理' : '不可用'}</em></header>
          <dl><div><dt>连接方式</dt><dd>{tool.transport}</dd></div><div><dt>活动任务</dt><dd>{tool.activeRuns}</dd></div></dl>
          <p>{tool.detail}</p>
          <footer>{tool.capabilities.map((capability) => <span key={capability}>{capability}</span>)}</footer>
        </article>)}
      </section>}
    </section>
  </main>
}

function HistoryLibrary({
  projects,
  onOpen,
}: {
  projects: HistoryProject[]
  onOpen: (version: WorkspaceVersion) => void
}) {
  const [expanded, setExpanded] = useState<string | null>(projects[0]?.projectId ?? null)
  return <section className="history-library">
    <div className="history-heading">
      <div><span className="eyebrow">本机项目库</span><h1>历史完成项目</h1><p>项目物理隔离，每次执行保留独立版本，可回看产物、证据与自动化轨迹。</p></div>
      <strong>{projects.length}<small>个项目</small></strong>
    </div>
    <div className="history-projects">
      {projects.map((project) => {
        const isExpanded = expanded === project.projectId
        const completed = project.versions.filter((version) => version.status === 'completed').length
        return <article className="history-project" key={project.projectId}>
          <button className="history-project-head" type="button" onClick={() => setExpanded(isExpanded ? null : project.projectId)}>
            <span>DP</span>
            <div><b>{project.projectName}</b><small>{project.projectId}</small></div>
            <em>{completed}/{project.versions.length} 已完成</em>
            <i>{isExpanded ? '−' : '+'}</i>
          </button>
          {isExpanded && <div className="history-versions">{project.versions.map((version) => <button type="button" onClick={() => onOpen(version)} key={version.versionLabel}>
            <span className={`version-state ${version.status}`} />
            <div><b>{version.versionLabel}</b><small>{version.basedOnVersion ? `基于 ${version.basedOnVersion} · ` : ''}{version.sourceDocumentName || '未记录原始需求'}</small></div>
            <em>{version.status === 'completed' ? '已完成' : version.status === 'running' ? '执行中' : version.status === 'legacy' ? '旧版本' : '未完成'}</em>
            <strong>查看 →</strong>
          </button>)}</div>}
        </article>
      })}
      {projects.length === 0 && <div className="history-empty"><Mark name="file" /><b>还没有历史项目</b><span>首次执行后会自动出现在这里</span></div>}
    </div>
  </section>
}

function Intake({
  onOpenRadar,
  onOpenWorkforce,
  onOpenTasks,
  onOpenCurrent,
  onTaskCreated,
  onOpenHistorical,
  initialSection,
}: {
  onOpenRadar: () => void
  onOpenWorkforce: () => void
  onOpenTasks: () => void
  onOpenCurrent: () => void
  onTaskCreated: () => void
  onOpenHistorical: (version: WorkspaceVersion) => void
  initialSection: 'new' | 'history'
}) {
  const currentTask = useTaskStore((state) => state.task)
  const createTask = useTaskStore((state) => state.createTask)
  const startTask = useTaskStore((state) => state.startTask)
  const employees = useWorkforceStore((state) => state.employees)
  const buildSquadSnapshot = useWorkforceStore((state) => state.buildSquadSnapshot)
  const [requirementMode, setRequirementMode] = useState<'file' | 'text'>('file')
  const [document, setDocument] = useState<SourceDocument | null>(null)
  const [requirementText, setRequirementText] = useState('')
  const [name, setName] = useState('')
  const nameValue = useRef('')
  nameValue.current = name
  const automaticName = useRef('')
  const [feature, setFeature] = useState('首版交付')
  const featureValue = useRef('首版交付')
  featureValue.current = feature
  const automaticFeature = useRef('首版交付')
  const recommendationRequest = useRef(0)
  const recommendationAttempt = useRef(0)
  const latestRecommendation = useRef<RequirementRecommendation | null>(null)
  const [recommendation, setRecommendation] = useState<RequirementRecommendation | null>(null)
  const [recommendationState, setRecommendationState] = useState<'idle' | 'loading' | 'ready'>('idle')
  const [workspaceRoot, setWorkspaceRoot] = useState('')
  const [mode, setMode] = useState<AutomationMode>('demo')
  const [technologyReference, setTechnologyReference] = useState<TechnologyReferenceConfig>({
    ...defaultTechnologyReference,
  })
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState(() => employees
    .filter((employee) => employee.status === 'active')
    .map((employee) => employee.id))
  const [showSquadSelector, setShowSquadSelector] = useState(false)
  const [error, setError] = useState('')
  const [hashing, setHashing] = useState(false)
  const [launching, setLaunching] = useState(false)
  const [showHistory, setShowHistory] = useState(initialSection === 'history')
  const [history, setHistory] = useState<HistoryProject[]>([])
  const recommendedName = recommendation?.projectName ?? ''
  const recommendedFeature = recommendation?.feature ?? '首版交付'
  const hasRequirement = requirementMode === 'file'
    ? Boolean(document)
    : requirementText.trim().length >= 10

  useEffect(() => {
    void invoke<string>('workspace_default')
      .then(setWorkspaceRoot)
      .catch((workspaceError) => {
        setError(workspaceError instanceof Error ? workspaceError.message : String(workspaceError))
      })
    void invoke<HistoryProject[]>('workspace_history')
      .then(setHistory)
      .catch((historyError) => {
        setError(historyError instanceof Error ? historyError.message : String(historyError))
      })
  }, [])

  const requestRecommendation = (
    attempt: number,
    forceApply: boolean,
    previous: RequirementRecommendation | null,
  ) => {
    const requestId = recommendationRequest.current + 1
    recommendationRequest.current = requestId
    setRecommendationState('loading')
    return invoke<RequirementRecommendation>('requirement_recommend', {
      content: requirementMode === 'text' ? requirementText : null,
      documentPath: requirementMode === 'file' ? document?.path ?? null : null,
      documentName: requirementMode === 'file' ? document?.name ?? null : null,
      attempt,
      previousProjectName: previous?.projectName ?? null,
      previousFeature: previous?.feature ?? null,
    }).catch((recommendationError) => {
      const fallbackName = requirementMode === 'file' && document
        ? inferProjectName(document.name)
        : inferProjectNameFromText(requirementText)
      const inferredFeature = requirementMode === 'file' && document
        ? inferFeatureName(document.name, fallbackName)
        : inferFeatureNameFromText(requirementText)
      const fallbackFeature = previous?.feature === inferredFeature
        ? `${inferredFeature}${['闭环', '提效', '协同', '升级'][attempt % 4]}`
        : inferredFeature
      return {
        projectName: fallbackName,
        feature: fallbackFeature,
        source: 'fallback' as const,
        model: null,
        reason: recommendationError instanceof Error
          ? recommendationError.message
          : '模型服务调用失败，已使用本地规则',
      }
    }).then((result) => {
      if (recommendationRequest.current !== requestId) return
      latestRecommendation.current = result
      setRecommendation(result)
      setRecommendationState('ready')
      if (forceApply || !nameValue.current.trim() || nameValue.current === automaticName.current) {
        setName(result.projectName)
        automaticName.current = result.projectName
      }
      if (forceApply || !featureValue.current.trim() || featureValue.current === automaticFeature.current) {
        setFeature(result.feature)
        automaticFeature.current = result.feature
      }
    })
  }

  useEffect(() => {
    if (!hasRequirement) {
      recommendationRequest.current += 1
      recommendationAttempt.current = 0
      latestRecommendation.current = null
      setRecommendation(null)
      setRecommendationState('idle')
      return
    }
    recommendationAttempt.current = 0
    latestRecommendation.current = null
    recommendationRequest.current += 1
    setRecommendationState('loading')
    const timer = window.setTimeout(() => {
      void requestRecommendation(0, false, null)
    }, requirementMode === 'text' ? 350 : 0)
    return () => window.clearTimeout(timer)
  }, [document, hasRequirement, requirementMode, requirementText])

  const pickDocument = async () => {
    setError('')
    setHashing(true)
    try {
      const selected = await invoke<Omit<SourceDocument, 'id'> | null>('document_pick')
      if (selected) {
        setRequirementMode('file')
        setDocument({ ...selected, id: crypto.randomUUID() })
      }
    } catch (pickError) {
      setError(pickError instanceof Error ? pickError.message : String(pickError))
    } finally {
      setHashing(false)
    }
  }
  const regenerateRecommendations = () => {
    const attempt = recommendationAttempt.current + 1
    recommendationAttempt.current = attempt
    void requestRecommendation(attempt, true, latestRecommendation.current)
  }
  const launch = async () => {
    if ((requirementMode === 'file' && !document) || (requirementMode === 'text' && requirementText.trim().length < 10) || !name.trim() || selectedEmployeeIds.length === 0) return
    setError('')
    setLaunching(true)
    try {
      const sourceDocument = requirementMode === 'text'
        ? {
            ...await invoke<Omit<SourceDocument, 'id'>>('document_create_from_text', {
              content: requirementText,
            }),
            id: crypto.randomUUID(),
          }
        : document!
      await createTask({
        name: name.trim(),
        feature: feature.trim() || 'iteration',
        mode,
        document: sourceDocument,
        technologyReference,
        deliverySquad: buildSquadSnapshot(selectedEmployeeIds, name.trim()),
      })
      await startTask()
      onTaskCreated()
    } catch (launchError) {
      setError(launchError instanceof Error ? launchError.message : String(launchError))
      setLaunching(false)
    }
  }

  return (
    <main className="intake-shell">
      <header className="intake-header">
        <div className="brand"><span className="brand-icon"><Mark name="pilot" /></span><div><b>DeliveryPilot</b><small>AI 研发交付驾驶舱</small></div></div>
        <div className="home-environment"><span className="status-dot" /><span>环境就绪</span><b>6/8</b></div>
        <div className="intake-actions">
          <nav className="primary-navigation" aria-label="项目导航">
            <button className={!showHistory ? 'active' : ''} type="button" title="首页" aria-label="首页" aria-current={!showHistory ? 'page' : undefined} onClick={() => setShowHistory(false)}><House /><span>首页</span></button>
            <button className={showHistory ? 'active' : ''} type="button" title="项目库" aria-label={`项目库，${history.length} 个项目`} aria-current={showHistory ? 'page' : undefined} onClick={() => setShowHistory(true)}><LibraryBig /><span>项目库</span><b className="navigation-count">{history.length}</b></button>
            <button type="button" title="任务管理" aria-label="任务管理" onClick={onOpenTasks}><Activity /><span>任务管理</span></button>
          </nav>
          <nav className="capability-navigation" aria-label="能力模块">
            <button className="workforce" type="button" title="数字员工人才库" onClick={onOpenWorkforce}><UsersRound /><span>数字员工</span></button>
            <button className="radar" type="button" title="技术雷达" onClick={onOpenRadar}><Radar /><span>技术雷达</span></button>
          </nav>
          {currentTask && <button className="current-task-context" type="button" title="打开当前任务" onClick={onOpenCurrent}><i className={currentTask.status} /><span>当前任务</span></button>}
        </div>
      </header>
      {showHistory ? <HistoryLibrary projects={history} onOpen={onOpenHistorical} /> : <section className="intake-content">
        <div className="hero-copy">
          <span className="eyebrow">从需求到上线，一个入口完成</span>
          <h1>把需求交给 AI，<br /><em>让交付过程看得见。</em></h1>
          <p>上传客户原始需求，自动完成需求分析、研发规格、代码测试与环境交付。所有动作、产物与确认记录在同一个任务中。</p>
          <div className="trust-row">
            <span><Mark name="check" />本机运行</span>
            <span><Mark name="check" />过程可追溯</span>
            <span><Mark name="check" />关键节点人工确认</span>
          </div>
          {currentTask && <button className="current-task-card" type="button" onClick={onOpenCurrent}>
            <span className={`current-task-state ${currentTask.status}`}><Mark name={currentTask.status === 'completed' ? 'check' : 'pulse'} /></span>
            <span><small>{currentTask.status === 'completed' ? '最近完成项目' : '当前执行任务'}</small><b>{currentTask.name}</b><em>{currentTask.versionLabel} · {currentTask.status === 'completed' ? '交付已完成' : '继续查看进度'}</em></span>
            <strong>打开任务 →</strong>
          </button>}
        </div>
        <div className="create-card">
          <div className="card-kicker">新建交付任务</div>
          <div className="requirement-mode-switch" role="tablist" aria-label="需求输入方式">
            <button type="button" role="tab" aria-selected={requirementMode === 'file'} className={requirementMode === 'file' ? 'active' : ''} onClick={() => setRequirementMode('file')}><FileText />上传文档</button>
            <button type="button" role="tab" aria-selected={requirementMode === 'text'} className={requirementMode === 'text' ? 'active' : ''} onClick={() => setRequirementMode('text')}><ScrollText />输入文字</button>
          </div>
          {requirementMode === 'file' ? <button className={`drop-zone ${document ? 'has-file' : ''}`} type="button" onClick={() => void pickDocument()}>
              {document ? (
                <>
                  <span className="file-tile"><Mark name="file" /></span>
                  <span className="drop-text"><b>{document.name}</b><small>{formatBytes(document.byteSize)} · sha-256 {document.sha256.slice(0, 12)}…</small></span>
                  <span className="replace">更换</span>
                </>
              ) : (
                <>
                  <span className="upload-ring"><Mark name="upload" /></span>
                  <span className="drop-text"><b>{hashing ? '正在计算文档指纹' : '拖入需求文档，或点击选择'}</b><small>支持 PDF、DOCX、TXT、MD、XLSX</small></span>
                </>
              )}
            </button> : <div className="requirement-text-input">
              <textarea
                value={requirementText}
                maxLength={2 * 1024 * 1024}
                placeholder="直接描述需要交付的系统、使用角色、业务流程、规则和验收标准…"
                onChange={(event) => {
                  setRequirementText(event.target.value)
                }}
              />
              <footer><span>{requirementText.trim().length < 10 ? '至少输入 10 个字符' : '提交后固化为 requirement.md 并计算 SHA-256'}</span><b>{requirementText.length} 字符</b></footer>
            </div>}
          {error && <p className="form-error">{error}</p>}
          {hasRequirement && <div className={`recommendation-banner ${recommendation?.source ?? recommendationState}`}><span><Sparkles /><span><b>{
            recommendationState === 'loading'
              ? 'AI 正在理解完整需求…'
              : recommendation?.source === 'model'
                ? 'AI 模型已生成推荐值'
                : 'AI 响应超时或失败，已使用本地兜底'
          }</b><small>{
            recommendation
              ? `${recommendation.projectName} · ${recommendation.feature} · ${recommendation.reason || recommendation.model || '隔离版本库'}`
              : '模型调用最多等待 3 秒'
          }</small></span></span><button type="button" disabled={!recommendation || recommendationState === 'loading'} title="再次点击会换一个推荐方案" onClick={regenerateRecommendations}>一键填写</button></div>}
          <label><span className="field-heading"><span>项目名称</span>{recommendedName && <button type="button" onClick={() => {
            setName(recommendedName)
            automaticName.current = recommendedName
          }}>推荐：{recommendedName}</button>}</span><input value={name} onChange={(event) => {
            setName(event.target.value)
            automaticName.current = ''
          }} /></label>
          <label><span className="field-heading"><span>本次版本特性</span>{recommendation && <button type="button" onClick={() => {
            setFeature(recommendedFeature)
            automaticFeature.current = recommendedFeature
          }}>推荐：{recommendedFeature}</button>}</span><input value={feature} onChange={(event) => {
            setFeature(event.target.value)
            automaticFeature.current = ''
          }} placeholder="例如：批量导入" /></label>
          <label><span className="field-heading"><span>项目库</span><em>推荐默认 · 版本隔离</em></span><div className="path-input"><input value={workspaceRoot ? `${workspaceRoot}/projects/{项目}/versions/vN-日期-${feature || 'feature'}` : '正在创建项目库…'} readOnly /><button type="button" disabled>隔离存放</button></div></label>
          <label>自动化级别
            <div className="mode-grid">
              {([
                ['demo', '演示模式', '关键动作可见'],
                ['standard', '标准模式', '确认点暂停'],
                ['unattended', '无人值守', '自动执行'],
              ] as const).map(([value, title, hint]) => (
                <button type="button" className={mode === value ? 'selected' : ''} onClick={() => setMode(value)} key={value}><b>{title}</b><small>{hint}</small></button>
              ))}
            </div>
          </label>
          <div className="squad-intake-config">
            <div><span className="squad-intake-icon"><UsersRound /></span><span><b>自主交付小队</b><small>{selectedEmployeeIds.length} 名员工参与本项目</small></span></div>
            <div className="squad-intake-avatars">{employees.filter((employee) => selectedEmployeeIds.includes(employee.id)).slice(0, 5).map((employee) => <EmployeeAvatar employee={employee} size="small" key={employee.id} />)}</div>
            <button type="button" onClick={() => setShowSquadSelector(true)}>调整成员</button>
          </div>
          <div className={`technology-reference-config ${technologyReference.enabled ? 'enabled' : ''}`}>
            <div className="technology-reference-head">
              <span><Mark name="pulse" /><span><b>技术参考</b><small>可选，不影响主交付</small></span></span>
              <button
                type="button"
                role="switch"
                aria-checked={technologyReference.enabled}
                onClick={() => setTechnologyReference((current) => ({
                  ...current,
                  enabled: !current.enabled,
                }))}
              ><i /></button>
            </div>
            {technologyReference.enabled && <>
              <div className="technology-option"><span>使用方式</span><div>
                <button
                  type="button"
                  className={technologyReference.transport === 'computer_use' ? 'selected' : ''}
                  onClick={() => setTechnologyReference((current) => ({
                    ...current,
                    transport: 'computer_use',
                    fallbackTransport: 'provider_api',
                  }))}
                >可视化操作<small>默认 · 过程可见</small></button>
                <button
                  type="button"
                  className={technologyReference.transport === 'provider_api' ? 'selected' : ''}
                  onClick={() => setTechnologyReference((current) => ({
                    ...current,
                    transport: 'provider_api',
                    fallbackTransport: 'computer_use',
                  }))}
                >Provider API<small>后台 · 无人值守</small></button>
              </div></div>
              <div className="technology-option depth"><span>分析深度</span><div>
                {([
                  ['recommend', '快速建议'],
                  ['verify', '工程验证'],
                  ['code_graph', '代码图谱'],
                ] as const).map(([value, label]) => <button
                  type="button"
                  className={technologyReference.depth === value ? 'selected' : ''}
                  onClick={() => setTechnologyReference((current) => ({ ...current, depth: value }))}
                  key={value}
                >{label}</button>)}
              </div></div>
            </>}
          </div>
          <button className="primary-action" type="button" disabled={(requirementMode === 'file' ? !document : requirementText.trim().length < 10) || hashing || launching || !workspaceRoot || !name.trim() || selectedEmployeeIds.length === 0} onClick={() => void launch()}>{launching ? requirementMode === 'text' ? '正在固化需求并创建版本…' : '正在创建独立版本…' : '开始 AI 交付'} <span>→</span></button>
          <p className="safety-note"><span>◆</span> 默认全自动执行；证据不足或真实失败时停止并提示人工接管</p>
        </div>
      </section>}
      <footer className="intake-footer"><span>本地任务与证据仅保存在此设备</span><span>DeliveryPilot preview · macOS Apple Silicon</span></footer>
      {showSquadSelector && <SquadSelector selectedIds={selectedEmployeeIds} onChange={setSelectedEmployeeIds} onClose={() => setShowSquadSelector(false)} />}
    </main>
  )
}

function StageRail() {
  const task = useTaskStore((state) => state.task)
  const events = useTaskStore((state) => state.events)
  const selectedStage = useTaskStore((state) => state.selectedStage)
  const setSelectedStage = useTaskStore((state) => state.setSelectedStage)
  if (!task) return null
  const stages = getExecutiveStages(task, events)
  const members = deliveryMembers(task)
  const activeEmployee = currentEmployee(task, events)
  const selectedLabel = stageDefinitions.find((stage) => stage.id === selectedStage)?.executiveLabel
  const actualLabel = stageDefinitions.find((stage) => stage.id === task.currentStage)?.executiveLabel
  return <div className="stage-rail">{stages.map((stage, index) => {
    const owner = ['running', 'waiting', 'failed'].includes(stage.status)
      ? activeEmployee ?? employeeForStage(members, stage.id)
      : employeeForStage(members, stage.id)
    return <button
      type="button"
      className={`rail-step ${stage.status} ${stage.label === selectedLabel ? 'selected' : ''} ${stage.label === actualLabel ? 'actual' : ''}`}
      aria-current={stage.label === selectedLabel ? 'step' : undefined}
      onClick={() => setSelectedStage(stage.id)}
      key={stage.label}
    >
      {owner
        ? <span className="rail-owner"><EmployeeAvatar employee={owner} size="small" active={stage.status === 'running'} />{stage.status === 'completed' && <em>✓</em>}</span>
        : <span className="rail-index">{index + 1}</span>}
      <span className="rail-label"><b>{stage.label}</b><small>{stage.label === actualLabel ? '执行中 · ' : ''}{owner?.name ?? '待分派'}</small></span>
      {index < stages.length - 1 && <i />}
    </button>
  })}</div>
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return minutes > 0 ? `${minutes}分${rest}秒` : `${rest}秒`
}

type DeliveryArtifact = {
  id: string
  title: string
  description: string
  category: string
  relativePath: string
  available: boolean
}

type AutomationTestCase = {
  name: string
  traceability: string
  scenario: string
  durationSeconds: number
  status: 'passed' | 'failed'
}

type DeliveryEvidence = {
  artifacts: DeliveryArtifact[]
  tests: AutomationTestCase[]
  testTotal: number
  testPassed: number
  testFailed: number
  testDurationSeconds: number
}

type DeliveryAccess = {
  available: boolean
  kind: 'deployed' | 'local_runtime' | 'unavailable'
  formallyDeployed: boolean
  label: string
  address: string
  displayAddress: string
}

function EventTimeline({
  events,
  selectedId,
  onSelect,
}: {
  events: ReturnType<typeof useTaskStore.getState>['events']
  selectedId?: string
  onSelect?: (event: ReturnType<typeof useTaskStore.getState>['events'][number]) => void
}) {
  return <div className="timeline">
    {events.map((event) => <button type="button" className={`event-row ${event.level} ${selectedId === event.id ? 'selected' : ''}`} onClick={() => onSelect?.(event)} key={event.id}>
      <time>{formatTime(event.timestamp)}</time>
      <span className="event-node"><i /></span>
      <div><div><code>{event.type}</code><span>#{event.sequence}</span></div><h3>{event.summary}</h3>{event.detail && <p>{event.detail}</p>}<small>{event.stage}</small></div>
    </button>)}
    {events.length === 0 && <div className="empty-state">该阶段尚无事件</div>}
  </div>
}

function ArtifactGallery({
  evidence,
  artifacts,
  selectedId,
  onSelect,
}: {
  evidence: DeliveryEvidence | null
  artifacts?: DeliveryArtifact[]
  selectedId?: string
  onSelect: (artifact: DeliveryArtifact) => void
}) {
  if (!evidence) return <div className="evidence-loading">正在读取真实交付产物...</div>
  const visibleArtifacts = artifacts ?? evidence.artifacts
  return <div className="artifact-gallery">
    <div className="evidence-summary-line"><b>{visibleArtifacts.filter((item) => item.available).length}</b><span>个阶段产物可查看</span><em>全部来自当前 .workspace</em></div>
    <div className="artifact-grid">{visibleArtifacts.map((artifact) => <button
      type="button"
      className={`artifact-card ${artifact.available ? 'available' : 'missing'} ${selectedId === artifact.id ? 'selected' : ''}`}
      onClick={() => onSelect(artifact)}
      key={artifact.id}
    >
      <span className="artifact-icon"><Mark name={artifact.category === '测试' ? 'pulse' : 'file'} /></span>
      <span><small>{artifact.category}</small><b>{artifact.title}</b><em>{artifact.description}</em><code>{artifact.relativePath}</code></span>
      <i>{artifact.available ? '查看详情' : '未生成'}</i>
    </button>)}</div>
    {visibleArtifacts.length === 0 && <div className="empty-state">该阶段尚未定义独立产物</div>}
  </div>
}

function AutomationTrace({ evidence, active }: { evidence: DeliveryEvidence | null; active: boolean }) {
  const [cursor, setCursor] = useState(-1)
  const [playing, setPlaying] = useState(false)
  const tests = evidence?.tests ?? []

  useEffect(() => {
    if (!active || tests.length === 0) return
    setCursor(-1)
    setPlaying(true)
  }, [active, tests.length])

  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => {
      setCursor((current) => {
        if (current >= tests.length - 1) {
          setPlaying(false)
          return current
        }
        return current + 1
      })
    }, 650)
    return () => window.clearInterval(timer)
  }, [playing, tests.length])

  if (!evidence) return <div className="evidence-loading">正在解析自动化测试报告...</div>
  const visiblePassed = tests.slice(0, cursor + 1).filter((test) => test.status === 'passed').length
  const visibleFailed = tests.slice(0, cursor + 1).filter((test) => test.status === 'failed').length
  const replay = () => {
    setCursor(-1)
    setPlaying(true)
  }
  return <div className="automation-trace">
    <div className="trace-hero">
      <div><span className={`trace-pulse ${playing ? 'playing' : ''}`}><Mark name="pulse" /></span><div><small>真实自动化测试</small><h3>业务场景验收轨迹</h3><p>逐条回放自动化测试执行的业务操作与结果校验</p></div></div>
      <button type="button" onClick={replay}>{playing ? '正在播放' : '重新播放'}</button>
    </div>
    <div className="trace-metrics">
      <span><b>{Math.max(0, cursor + 1)}/{evidence.testTotal}</b> 已执行</span>
      <span className="passed"><b>{visiblePassed}</b> 通过</span>
      <span className={visibleFailed ? 'failed' : ''}><b>{visibleFailed}</b> 失败</span>
      <span><b>{evidence.testDurationSeconds.toFixed(1)}s</b> 总耗时</span>
    </div>
    <div className="trace-progress"><i style={{ width: `${tests.length ? ((cursor + 1) / tests.length) * 100 : 0}%` }} /></div>
    <div className="trace-list">{tests.map((test, index) => {
      const state = index < cursor || (index === cursor && !playing)
        ? test.status
        : index === cursor
          ? 'running'
          : 'pending'
      return <article className={`trace-case ${state}`} key={test.name}>
        <span className="case-state">{state === 'pending' ? index + 1 : state === 'running' ? '▶' : state === 'passed' ? '✓' : '!'}</span>
        <div><div className="trace-chain">{test.traceability.split('→').map((item) => <code key={item}>{item.trim()}</code>)}</div><h4>{test.scenario}</h4></div>
        <time>{test.durationSeconds.toFixed(2)}s</time>
      </article>
    })}</div>
  </div>
}

function EvidenceOverview({ evidence }: { evidence: DeliveryEvidence | null }) {
  if (!evidence) return <div className="evidence-loading">正在汇总执行证据...</div>
  const available = evidence.artifacts.filter((artifact) => artifact.available)
  const groups = ['需求', '设计', '质量', '测试', '交付']
  return <div className="evidence-overview">
    <div className="evidence-score"><strong>{evidence.testFailed === 0 ? '证据完整' : '存在失败'}</strong><span>所有结论均可回到本地文件和测试报告</span></div>
    <div className="evidence-lanes">{groups.map((group, index) => {
      const count = available.filter((artifact) => artifact.category === group).length
      return <div className={count > 0 ? 'complete' : 'empty'} key={group}><i>{count > 0 ? '✓' : '!'}</i><b>{group}</b><span>{count} 份证据</span>{index < groups.length - 1 && <em />}</div>
    })}</div>
    <div className="evidence-facts">
      <span><b>{available.length}</b> 可打开产物</span>
      <span><b>{evidence.testPassed}/{evidence.testTotal}</b> 自动化场景通过</span>
      <span><b>{evidence.testFailed}</b> 自动化失败</span>
      <span><b>100%</b> Agent 自报完成</span>
    </div>
  </div>
}

function SubmissionProgress({ compact = false }: { compact?: boolean }) {
  const submission = useTaskStore((state) => state.submissionStatus)
  const completed = useTaskStore((state) => state.task?.status === 'completed')
  const retryExternalStage = useTaskStore((state) => state.retryExternalStage)
  if (submission.state === 'idle') return null
  const label = completed ? 'Trae Code 已完成任务并通过产物校验' : submission.label
  return <div className={`submission-progress ${submission.state} ${completed ? 'completed' : ''} ${compact ? 'compact' : ''}`}>
    <div className="submission-head">
      <span className="activity-dot" />
      <b>{label}</b>
      <em>{submission.state === 'confirmed' ? '已确认' : submission.state === 'failed' ? '需处理' : '进行中'}</em>
    </div>
    {submission.steps.length > 0 && <ol>
      {submission.steps.map((step) => <li key={step}><span>✓</span>{step}</li>)}
    </ol>}
    {submission.state === 'failed' && <button type="button" onClick={() => void retryExternalStage()}>重试发送</button>}
  </div>
}

function ExternalProgress({ compact = false }: { compact?: boolean }) {
  const status = useTaskStore((state) => state.externalStatus)
  const run = useTaskStore((state) => state.externalRun)
  if (!run) return null
  if (!status) return <div className="external-progress loading"><span className="activity-dot" />正在连接真实运行状态...</div>
  const determinate = status.selfReported || status.completed
  return <div className={`external-progress ${status.state} ${compact ? 'compact' : ''}`}>
    <div className="external-progress-head">
      <div><span className="activity-dot" /><b>{run.appName}</b><em>{status.appOnline ? '应用在线' : '应用离线'}</em></div>
      <strong>{determinate ? `${status.progressPercent}%` : '监测中'}</strong>
    </div>
    <div className={`external-progress-bar ${determinate ? '' : 'indeterminate'}`}><i style={{ width: determinate ? `${status.progressPercent}%` : '35%' }} /></div>
    <div className="external-progress-phase"><span>{status.phase}</span><em>证据阶段 {status.phaseIndex}/{status.totalPhases} · {formatDuration(status.elapsedSeconds)}</em></div>
    <p>{status.lastActivityLabel}</p>
    {!compact && <div className="external-evidence">
      <span>状态 <b>{status.state}</b></span>
      <span>产物 <b>{status.expectedArtifactCount > 0 ? `${status.artifactCount}/${status.expectedArtifactCount}` : '等待人工核对'}</b></span>
      <span>进度来源 <b>{status.selfReported ? 'Agent 自报' : '日志与文件'}</b></span>
    </div>}
    {!compact && status.changedFiles.length > 0 && <div className="changed-files">
      <small>最近工作区变更</small>
      {status.changedFiles.slice(0, 4).map((file) => <code key={file}>{file}</code>)}
    </div>}
  </div>
}

function TechnologyReferenceProgress({ compact = false }: { compact?: boolean }) {
  const run = useTaskStore((state) => state.technologyRun)
  const status = useTaskStore((state) => state.technologyStatus)
  if (!run && !status) return null
  const candidates = status?.result?.candidates ?? []
  const top = candidates[0]
  const working = status?.state === 'queued' || status?.state === 'running'
  return <div className={`technology-reference-progress ${status?.state ?? 'queued'} ${compact ? 'compact' : ''}`}>
    <div className="technology-reference-progress-head">
      <span><Mark name="pulse" /></span>
      <div><small>可选技术参考 · {run?.actualTransport === 'provider_api' ? 'Provider API' : '可视化操作'}</small><b>{status?.message ?? '正在连接 Technology Exploration'}</b></div>
      <strong>{status?.percent ?? 0}%</strong>
    </div>
    <div className="technology-reference-progress-bar"><i style={{ width: `${status?.percent ?? 0}%` }} /></div>
    {top && <div className="technology-reference-candidate">
      <span><b>{top.fullName}</b><small>{top.plainExplanation ?? `${top.verdict} · ${top.license}`}</small></span>
      <em>{top.fitScore}</em>
    </div>}
    {!compact && <div className="technology-reference-meta">
      <span>{working ? '真实分析中' : `${candidates.length} 个候选`}</span>
      <span>{status?.continuouslyMonitored ? '每 5 分钟持续监控' : run?.fallbackUsed ? '已使用降级通道' : '主通道正常'}</span>
      {status?.nextScanAt && <span>下次扫描 {new Date(status.nextScanAt).toLocaleTimeString()}</span>}
      {run?.actualTransport === 'computer_use' && <button type="button" onClick={() => void invoke('focus_external_app', {
        bundleId: 'com.local.technology-exploration',
      })}>查看真实操作</button>}
    </div>}
  </div>
}

function RequirementGraph({
  evidence,
  onSelectNode,
}: {
  evidence: NonNullable<CodeGraphStatus['evidence']>
  onSelectNode?: (node: NonNullable<CodeGraphStatus['evidence']>['nodes'][number]) => void
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const nodes = useMemo(() => evidence.nodes.filter((node) => (
    ['Capability', 'Repository', 'Symbol', 'Module', 'Risk'].includes(node.kind)
  )).slice(0, 28), [evidence.nodes])
  const positions = useMemo(() => {
    const groups = new Map<number, typeof nodes>()
    nodes.forEach((node) => groups.set(node.layer, [...(groups.get(node.layer) ?? []), node]))
    const layerOrder = [...groups.keys()].sort((left, right) => left - right)
    const map = new Map<string, { x: number; y: number }>()
    layerOrder.forEach((layer, layerIndex) => {
      const group = groups.get(layer) ?? []
      const verticalStep = group.length > 1 ? 340 / (group.length - 1) : 0
      group.forEach((node, index) => map.set(node.id, {
        x: 90 + layerIndex * (660 / Math.max(1, layerOrder.length - 1)),
        y: group.length > 1 ? 50 + index * verticalStep : 220,
      }))
    })
    return map
  }, [nodes])
  const visibleIds = new Set(nodes.map((node) => node.id))
  const edges = evidence.edges.filter((edge) => visibleIds.has(edge.from) && visibleIds.has(edge.to)).slice(0, 48)
  const selected = nodes.find((node) => node.id === selectedId)
  return <div className="requirement-graph">
    <div className="requirement-graph-metrics">
      <span><b>{evidence.discoveryFitScore}</b>发现匹配</span>
      <i>→</i>
      <span className="verified"><b>{evidence.verifiedFitScore}</b>代码验证</span>
      <span><b>{evidence.coverage.matchedCapabilities}/{evidence.coverage.totalCapabilities}</b>能力覆盖</span>
      <span><b>{evidence.metrics.nodeCount}</b>代码节点</span>
      <span><b>{evidence.metrics.edgeCount}</b>代码关系</span>
    </div>
    <div className="requirement-graph-canvas">
      <svg viewBox="0 0 840 440" role="img" aria-label="需求到代码匹配图谱">
        <defs><marker id="graph-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" /></marker></defs>
        {edges.map((edge) => {
          const from = positions.get(edge.from)
          const to = positions.get(edge.to)
          if (!from || !to) return null
          return <g key={edge.id}><path d={`M ${from.x + 52} ${from.y} C ${from.x + 110} ${from.y}, ${to.x - 110} ${to.y}, ${to.x - 52} ${to.y}`} markerEnd="url(#graph-arrow)" /><text x={(from.x + to.x) / 2} y={(from.y + to.y) / 2 - 4}>{edge.type}</text></g>
        })}
      </svg>
      {nodes.map((node) => {
        const position = positions.get(node.id)!
        return <button
          type="button"
          className={`graph-node ${node.kind.toLowerCase()} ${selectedId === node.id ? 'selected' : ''}`}
          style={{ left: `${(position.x / 840) * 100}%`, top: `${(position.y / 440) * 100}%` }}
          onClick={() => {
            setSelectedId(node.id)
            onSelectNode?.(node)
          }}
          title={node.detail}
          key={node.id}
        ><small>{node.kind}</small><b>{node.label}</b></button>
      })}
      {selected && <aside className="graph-detail"><small>{selected.kind}</small><b>{selected.label}</b><p>{selected.detail}</p></aside>}
    </div>
    <div className="requirement-graph-proof"><span>Commit <code>{evidence.repository.commit.slice(0, 12)}</code></span><span>{evidence.repository.license}</span><span>{evidence.metrics.languages.join(' · ')}</span><strong>本地索引 · 未执行仓库代码</strong></div>
  </div>
}

function CodeGraphProgress({
  compact = false,
  onSelectNode,
}: {
  compact?: boolean
  onSelectNode?: (node: NonNullable<CodeGraphStatus['evidence']>['nodes'][number]) => void
}) {
  const status = useTaskStore((state) => state.codeGraphStatus)
  const [showGraph, setShowGraph] = useState(true)
  if (!status) return null
  return <div className={`codegraph-progress ${status.state} ${compact ? 'compact' : ''}`}>
    <div className="codegraph-progress-head">
      <span>CG</span><div><small>CodeGraph · 本地代码知识图谱</small><b>{status.message}</b></div><strong>{status.percent}%</strong>
    </div>
    <div className="codegraph-progress-bar"><i style={{ width: `${status.percent}%` }} /></div>
    {status.evidence && !compact && <>
      <button className="codegraph-toggle" type="button" onClick={() => setShowGraph((value) => !value)}>{showGraph ? '收起需求图谱' : '展开需求图谱'}</button>
      {showGraph && <RequirementGraph evidence={status.evidence} onSelectNode={onSelectNode} />}
    </>}
  </div>
}

function ExecutiveView() {
  const task = useTaskStore((state) => state.task)!
  const events = useTaskStore((state) => state.events)
  const selectedStage = useTaskStore((state) => state.selectedStage)
  const focusExternalApp = useTaskStore((state) => state.focusExternalApp)
  const externalRun = useTaskStore((state) => state.externalRun)
  const externalError = useTaskStore((state) => state.externalError)
  const [deliveryAccess, setDeliveryAccess] = useState<DeliveryAccess | null>(null)
  const [accessError, setAccessError] = useState('')
  const [addressCopied, setAddressCopied] = useState(false)
  const completed = task.status === 'completed'
  const members = deliveryMembers(task)
  const projections = getStageProjection(task, events)
  const selectedProjection = projections.find((stage) => stage.id === selectedStage) ?? projections[0]
  const selectedEvents = events.filter((event) => event.stage === selectedProjection.id)
  const selectedEmployee = employeeForStage(members, selectedProjection.id) ?? members[0]
  const selectedEvent = selectedEvents.findLast((event) => (
    employeeForEvent(members, event)?.id === selectedEmployee?.id
  )) ?? selectedEvents.at(-1)
  const selectedIndex = stageDefinitions.findIndex((stage) => stage.id === selectedProjection.id)
  const nextStageDefinition = stageDefinitions[selectedIndex + 1]
  const nextEmployee = nextStageDefinition ? employeeForStage(members, nextStageDefinition.id) : undefined
  const isActualStage = selectedProjection.id === task.currentStage
  const isDeliveryStage = ['k8s_deployment', 'acceptance'].includes(selectedProjection.id)
  const contributions = members.map((employee) => ({
    employee,
    count: selectedEvents.filter((event) => employeeForEvent(members, event)?.id === employee.id).length,
  }))
  const progress = getProgress(task)
  const waiting = selectedProjection.status === 'waiting'
  const currentTitle = `${selectedProjection.label} · ${stageOutput(selectedProjection.id)}`
  const statusLabel = selectedProjection.status === 'completed'
    ? '已完成'
    : selectedProjection.status === 'running'
      ? '正在执行'
      : selectedProjection.status === 'waiting'
        ? '等待决策'
        : selectedProjection.status === 'failed'
          ? '执行失败'
          : '待执行'

  useEffect(() => {
    if (!completed) {
      setDeliveryAccess(null)
      return
    }
    void invoke<DeliveryAccess>('delivery_access', { workspacePath: task.workspacePath })
      .then(setDeliveryAccess)
      .catch((error) => setAccessError(error instanceof Error ? error.message : String(error)))
  }, [completed, task.workspacePath])

  const openDelivery = () => {
    setAccessError('')
    void invoke('open_delivery_access', { workspacePath: task.workspacePath })
      .catch((error) => setAccessError(error instanceof Error ? error.message : String(error)))
  }

  const copyAddress = async () => {
    if (!deliveryAccess?.address) return
    try {
      await navigator.clipboard.writeText(deliveryAccess.address)
      setAddressCopied(true)
      window.setTimeout(() => setAddressCopied(false), 1400)
    } catch (error) {
      setAccessError(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <section className="executive-view">
      <StageRail />
      <div className="executive-grid">
        <article className="now-card">
          <div className="section-heading"><div><span className="eyebrow">{isActualStage ? '当前执行阶段' : selectedProjection.status === 'completed' ? '历史阶段回放' : '阶段预览'}</span><h2>{currentTitle}</h2></div><span className={`live-badge ${waiting ? 'waiting' : ''} ${selectedProjection.status === 'completed' ? 'completed' : ''}`}><i />{statusLabel}</span></div>
          <div className="process-stage">
            {selectedEmployee && <div className={`active-employee-visual ${isActualStage ? 'actual' : 'reviewing'}`}>
              <span className="employee-aura" />
              <EmployeeAvatar employee={selectedEmployee} size="large" active={isActualStage && !completed} />
              <span className="employee-live-state"><i />{isActualStage && !completed ? waiting ? '等待你确认' : '正在工作' : selectedProjection.status === 'completed' ? '阶段已完成' : '计划负责人'}</span>
            </div>}
            <div className="active-employee-copy">
              <small>{isActualStage ? '当前责任人' : '阶段责任人'} · {runtimeLabels[selectedEmployee.runtime]}</small>
              <h3>{selectedEmployee.name}<em>{selectedEmployee.title}</em></h3>
              <strong>{selectedEvent?.summary ?? stageOutput(selectedProjection.id)}</strong>
              <p>{selectedEvent?.detail ?? selectedEmployee.summary}</p>
              <div className="employee-handoff-status">
                <span><b>本阶段输入</b>{stageInput(selectedProjection.id)}</span>
                <i>→</i>
                <span><b>下一棒</b>{nextEmployee ? `${nextEmployee.name} · ${nextEmployee.title}` : '交付完成'}</span>
              </div>
            </div>
          </div>
          {isActualStage && <SubmissionProgress />}
          {isActualStage && <ExternalProgress />}
          {['business_approval', 'trae_spec'].includes(selectedProjection.id) && <TechnologyReferenceProgress />}
          {['business_approval', 'trae_spec', 'spec_approval'].includes(selectedProjection.id) && <CodeGraphProgress />}
          {isActualStage && externalError && <div className="execution-error">{externalError}</div>}
          {isActualStage && externalRun && <div className="execution-actions">
            <button type="button" onClick={() => void focusExternalApp()}>打开 {externalRun.appName}</button>
          </div>}
          <div className="event-strip">{selectedEvents.slice(-3).map((event) => {
            const owner = employeeForEvent(members, event)
            return <div key={event.id}>{owner ? <EmployeeAvatar employee={owner} size="small" /> : <span className="mini-check">✓</span>}<p>{event.summary}<small>{owner ? `${owner.name} · ` : ''}{formatTime(event.timestamp)}</small></p></div>
          })}{selectedEvents.length === 0 && <div className="executive-empty-event"><span className="mini-check">·</span><p>该阶段尚未产生执行证据<small>任务状态未改变</small></p></div>}</div>
        </article>
        <aside className="outcome-card">
          <div className="section-heading"><div><span className="eyebrow">{selectedProjection.label}</span><h2>阶段执行证据</h2></div><span className="confidence">模式 <b>{isActualStage ? 'LIVE' : 'REPLAY'}</b></span></div>
          {isDeliveryStage && completed && deliveryAccess?.available && <div className="delivery-launch">
            <div className="delivery-launch-head"><span><Mark name="check" /></span><div><small>{deliveryAccess.formallyDeployed ? '正式部署地址已通过访问验证' : '项目 HTTP 服务已启动 · 仅本机可访问'}</small><b>{deliveryAccess.label}</b></div><em>{deliveryAccess.formallyDeployed ? 'DEPLOYED' : 'LOCAL SERVICE'}</em></div>
            <div className="delivery-address"><code title={deliveryAccess.displayAddress}>{deliveryAccess.displayAddress}</code><button type="button" onClick={() => void copyAddress()}>{addressCopied ? '已复制' : '复制地址'}</button></div>
            <button className="experience-action" type="button" onClick={openDelivery}>立即打开体验 <span>↗</span></button>
            {!deliveryAccess.formallyDeployed && <p className="deployment-disclaimer">未执行正式环境部署；关闭 DeliveryPilot 后本机服务会停止。</p>}
          </div>}
          {isDeliveryStage && completed && deliveryAccess && !deliveryAccess.available && <div className="delivery-unavailable"><Mark name="file" /><span><b>{deliveryAccess.label}</b><small>{deliveryAccess.displayAddress}</small></span></div>}
          {accessError && <div className="delivery-access-error">{accessError}</div>}
          <div className="metric-grid">
            <div><strong>{selectedEvents.filter((event) => event.type.endsWith('.prompt.sent')).length}</strong><span>阶段 AI 任务</span></div>
            <div><strong>{selectedEvents.filter((event) => event.level === 'warning').length}</strong><span>人工确认节点</span></div>
            <div><strong>{selectedProjection.retryCount}</strong><span>阶段重试</span></div>
            <div><strong>{selectedEvents.length}</strong><span>阶段过程证据</span></div>
          </div>
          <div className="quality-bar"><span><b>{stageInput(selectedProjection.id)}</b><em>{selectedProjection.status === 'completed' ? '已校验' : '待验证'}</em></span><i><b style={{ width: selectedProjection.status === 'completed' ? '100%' : selectedProjection.status === 'running' ? '58%' : '8%' }} /></i></div>
          <div className="squad-contribution">
            <div><span><b>自主交付小队</b><small>{selectedProjection.label} · 真实事件归属</small></span><em>{selectedProjection.status === 'completed' ? '阶段已收工' : isActualStage ? '协作中' : '计划中'}</em></div>
            <div>{contributions.map(({ employee, count }) => <span className={employee.id === selectedEmployee?.id ? 'active' : ''} key={employee.id}>
              <EmployeeAvatar employee={employee} size="small" active={isActualStage && employee.id === selectedEmployee?.id} />
              <i><b>{employee.name}</b><small>{count} 条贡献</small></i>
            </span>)}</div>
          </div>
          <div className="source-line"><Mark name="file" /><span><b>原始需求</b><small>{task.sourceDocument.name}</small></span><button type="button">查看</button></div>
        </aside>
      </div>
      <div className="executive-bottom">
        <div><span>总进度</span><b>{progress}%</b><i><em style={{ width: `${progress}%` }} /></i></div>
        <div><span>已节省人工步骤</span><b>{Math.max(1, Math.floor(events.length * .7))}</b></div>
        <div><span>过程证据</span><b>{events.length}</b></div>
        <div><span>任务状态</span><b className="state-text">{completed ? '已完成' : waiting ? '等待确认' : '运行中'}</b></div>
      </div>
    </section>
  )
}

type DeveloperSelection =
  | { kind: 'stage' }
  | { kind: 'event'; event: ReturnType<typeof useTaskStore.getState>['events'][number] }
  | { kind: 'artifact'; artifact: DeliveryArtifact }
  | { kind: 'graph'; node: NonNullable<CodeGraphStatus['evidence']>['nodes'][number] }

function StageOverview({
  task,
  stage,
  events,
  artifacts,
  onSelectEvent,
  onSelectArtifact,
}: {
  task: NonNullable<ReturnType<typeof useTaskStore.getState>['task']>
  stage: ReturnType<typeof getStageProjection>[number]
  events: ReturnType<typeof useTaskStore.getState>['events']
  artifacts: DeliveryArtifact[]
  onSelectEvent: (event: ReturnType<typeof useTaskStore.getState>['events'][number]) => void
  onSelectArtifact: (artifact: DeliveryArtifact) => void
}) {
  const members = deliveryMembers(task)
  const owner = employeeForStage(members, stage.id)
  const latest = events.at(-1)
  return <div className="stage-workspace-overview">
    <section className="stage-contract">
      <div className="stage-owner-card">
        {owner && <EmployeeAvatar employee={owner} size="large" active={stage.status === 'running'} />}
        <div><small>阶段责任人</small><h3>{owner?.name ?? '等待分派'}<em>{owner?.title}</em></h3><p>{owner?.summary ?? '当前阶段尚未绑定数字员工。'}</p><span>{owner ? runtimeLabels[owner.runtime] : 'DeliveryPilot Supervisor'}</span></div>
      </div>
      <div className="stage-io-flow">
        <span><small>输入</small><b>{stageInput(stage.id)}</b></span>
        <i>→</i>
        <span><small>输出</small><b>{stageOutput(stage.id)}</b></span>
      </div>
    </section>
    <section className="stage-workspace-metrics">
      <span><b>{events.length}</b>阶段事件</span>
      <span><b>{artifacts.filter((artifact) => artifact.available).length}/{artifacts.length}</b>可用产物</span>
      <span><b>{stage.retryCount}</b>重试次数</span>
      <span><b>{stage.status === 'completed' ? '通过' : stage.status === 'running' ? '执行中' : stage.status === 'waiting' ? '待确认' : '未开始'}</b>阶段状态</span>
    </section>
    <div className="stage-workspace-grid">
      <section className="stage-latest-events">
        <header><div><b>阶段动态</b><small>点击事件查看完整参数和证据</small></div><span>{events.length}</span></header>
        <div>{events.slice(-5).reverse().map((event) => <button type="button" onClick={() => onSelectEvent(event)} key={event.id}><i className={event.level} /><span><b>{event.summary}</b><small>{event.type} · {formatTime(event.timestamp)}</small></span><em>查看</em></button>)}</div>
        {events.length === 0 && <div className="stage-overview-empty">该阶段尚未产生真实执行事件</div>}
      </section>
      <section className="stage-artifact-preview">
        <header><div><b>阶段产物</b><small>只展示当前阶段相关文件</small></div><span>{artifacts.length}</span></header>
        <div>{artifacts.slice(0, 5).map((artifact) => <button type="button" onClick={() => onSelectArtifact(artifact)} key={artifact.id}><FileText /><span><b>{artifact.title}</b><small>{artifact.available ? artifact.relativePath : '尚未生成'}</small></span><i className={artifact.available ? 'available' : ''} /></button>)}</div>
        {artifacts.length === 0 && <div className="stage-overview-empty">该阶段没有独立文件产物</div>}
      </section>
    </div>
    {latest && <footer className="stage-latest-proof"><span>最近证据</span><b>{latest.summary}</b><time>{formatTime(latest.timestamp)}</time></footer>}
  </div>
}

function DeveloperInspector({
  task,
  stage,
  selection,
  onOpenArtifact,
}: {
  task: NonNullable<ReturnType<typeof useTaskStore.getState>['task']>
  stage: ReturnType<typeof getStageProjection>[number]
  selection: DeveloperSelection
  onOpenArtifact: (artifact: DeliveryArtifact) => void
}) {
  const members = deliveryMembers(task)
  const owner = employeeForStage(members, stage.id)
  const header = selection.kind === 'stage'
    ? { eyebrow: '阶段详情', title: stage.label, icon: <ListChecks /> }
    : selection.kind === 'event'
      ? { eyebrow: '事件详情', title: selection.event.summary, icon: <Activity /> }
      : selection.kind === 'artifact'
        ? { eyebrow: '产物详情', title: selection.artifact.title, icon: <FileText /> }
        : { eyebrow: '图谱节点', title: selection.node.label, icon: <Radar /> }
  return <aside className="developer-inspector">
    <header><span>{header.icon}</span><div><small>{header.eyebrow}</small><h2>{header.title}</h2></div></header>
    {selection.kind === 'stage' && <>
      <section className="inspector-owner">{owner && <EmployeeAvatar employee={owner} size="medium" active={stage.status === 'running'} />}<div><small>责任员工</small><b>{owner?.name ?? '未分派'}</b><span>{owner?.title ?? '-'}</span></div></section>
      <dl>
        <div><dt>阶段状态</dt><dd className={stage.status}>{stage.status}</dd></div>
        <div><dt>执行工具</dt><dd>{owner ? runtimeLabels[owner.runtime] : 'Supervisor'}</dd></div>
        <div><dt>阶段输入</dt><dd>{stageInput(stage.id)}</dd></div>
        <div><dt>预期输出</dt><dd>{stageOutput(stage.id)}</dd></div>
        <div><dt>重试次数</dt><dd>{stage.retryCount}</dd></div>
      </dl>
      <section className="inspector-guidance"><small>完成条件</small><p>真实产物已写入版本目录，相关事件可回放，状态与证据一致后才允许进入下一阶段。</p></section>
    </>}
    {selection.kind === 'event' && <>
      <section className="inspector-event-summary"><code>{selection.event.type}</code><span className={selection.event.level}>{selection.event.level}</span></section>
      <dl>
        <div><dt>事件序号</dt><dd>#{selection.event.sequence}</dd></div>
        <div><dt>发生时间</dt><dd>{new Date(selection.event.timestamp).toLocaleString()}</dd></div>
        <div><dt>所属阶段</dt><dd>{stageDefinitions.find((item) => item.id === selection.event.stage)?.label}</dd></div>
        <div><dt>责任员工</dt><dd>{employeeForEvent(members, selection.event)?.name ?? '-'}</dd></div>
      </dl>
      <section className="inspector-detail-text"><small>事件详情</small><p>{selection.event.detail ?? '该事件没有额外详情，摘要即为完整记录。'}</p></section>
    </>}
    {selection.kind === 'artifact' && <>
      <section className={`inspector-artifact-state ${selection.artifact.available ? 'available' : ''}`}><FileText /><div><small>{selection.artifact.category}</small><b>{selection.artifact.available ? '文件已生成' : '等待生成'}</b></div></section>
      <dl>
        <div><dt>说明</dt><dd>{selection.artifact.description}</dd></div>
        <div><dt>相对路径</dt><dd className="path">{selection.artifact.relativePath}</dd></div>
        <div><dt>证据状态</dt><dd>{selection.artifact.available ? '可验证' : '缺失'}</dd></div>
      </dl>
      <button className="inspector-primary-action" type="button" disabled={!selection.artifact.available} onClick={() => onOpenArtifact(selection.artifact)}><ExternalLink />打开真实产物</button>
    </>}
    {selection.kind === 'graph' && <>
      <section className="inspector-graph-kind"><Radar /><div><small>节点类型</small><b>{selection.node.kind}</b></div></section>
      <section className="inspector-detail-text"><small>匹配证据</small><p>{selection.node.detail}</p></section>
      <dl><div><dt>图谱层级</dt><dd>{selection.node.layer}</dd></div><div><dt>节点 ID</dt><dd className="path">{selection.node.id}</dd></div></dl>
    </>}
  </aside>
}

function RuntimeDrawer() {
  const task = useTaskStore((state) => state.task)!
  const events = useTaskStore((state) => state.events)
  const externalRun = useTaskStore((state) => state.externalRun)
  const submissionStatus = useTaskStore((state) => state.submissionStatus)
  const externalError = useTaskStore((state) => state.externalError)
  const focusExternalApp = useTaskStore((state) => state.focusExternalApp)
  const [expanded, setExpanded] = useState(false)
  const [tab, setTab] = useState<'application' | 'status'>('application')
  return <section className={`runtime-drawer ${expanded ? 'expanded' : ''}`}>
    <header>
      <button type="button" className="runtime-drawer-toggle" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>{expanded ? <ChevronDown /> : <ChevronUp />}<span><b>运行与工具</b><small>{externalRun ? `${externalRun.appName} · LIVE` : submissionStatus.state === 'idle' ? '当前没有外部工具运行' : submissionStatus.label}</small></span></button>
      <div><span className={externalRun ? 'online' : ''}><i />{externalRun ? '应用在线' : '待命'}</span>{externalRun && <button type="button" onClick={() => void focusExternalApp()}><ExternalLink />打开应用</button>}</div>
    </header>
    {expanded && <div className="runtime-drawer-body">
      <div className="runtime-drawer-tabs"><button type="button" className={tab === 'application' ? 'active' : ''} onClick={() => setTab('application')}>真实应用</button><button type="button" className={tab === 'status' ? 'active' : ''} onClick={() => setTab('status')}>运行状态</button></div>
      {tab === 'application' ? <div className="runtime-application-view">
        <div className="runtime-window"><div className="window-bar"><span><i /><i /><i /></span><b>{externalRun?.appName ?? '等待启动'}</b><em>{externalRun ? 'LIVE' : 'IDLE'}</em></div><div><Mark name="pilot" /><span><b>{externalRun ? '真实应用已确认接收任务' : '尚未启动外部任务'}</b><small>{externalRun ? `${externalRun.bundleId} · pid ${externalRun.pid}` : task.sourceDocument.name}</small></span></div></div>
        <dl><div><dt>应用</dt><dd>{externalRun?.bundleId ?? '-'}</dd></div><div><dt>适配器</dt><dd>macOS Accessibility</dd></div><div><dt>发送确认</dt><dd>{externalRun?.sendConfirmed ? externalRun.confirmation : '-'}</dd></div><div><dt>真实动作</dt><dd>{events.filter((event) => event.type.startsWith('trae') || event.type.startsWith('app.')).length}</dd></div></dl>
      </div> : <div className="runtime-status-view"><SubmissionProgress compact /><ExternalProgress compact /><TechnologyReferenceProgress compact /><CodeGraphProgress compact />{externalError && <p className="external-error">{externalError}</p>}</div>}
    </div>}
  </section>
}

function StageDependencyMap({
  task,
  stages,
  selectedStage,
  onSelect,
}: {
  task: NonNullable<ReturnType<typeof useTaskStore.getState>['task']>
  stages: ReturnType<typeof getStageProjection>
  selectedStage: StageName
  onSelect: (stage: ReturnType<typeof getStageProjection>[number]) => void
}) {
  const members = deliveryMembers(task)
  const completedCount = stages.filter((stage) => stage.status === 'completed').length
  return <nav className="stage-dependency-map" aria-label="交付阶段依赖图">
    <header><span><b>交付依赖链</b><small>产物驱动下一阶段</small></span><em>{completedCount}/{stages.length}</em></header>
    <div className="dependency-chain">{stages.map((stage, index) => {
      const dependency = dependencyForStage(stage.id)
      const owner = employeeForStage(members, stage.id)
      const edgeState = stage.status === 'completed'
        ? 'completed'
        : stage.status === 'running'
          ? 'flowing'
          : stage.status === 'waiting'
            ? 'waiting'
            : stage.status === 'failed'
              ? 'failed'
              : 'pending'
      return <div className={`dependency-step ${stage.status} ${stage.id === selectedStage ? 'selected' : ''}`} key={stage.id}>
        {index > 0 && <div className={`dependency-edge ${edgeState}`} aria-label={`依赖 ${dependency.evidence}`}>
          <i><span /></i><em>{dependency.evidence}</em>
        </div>}
        <button
          type="button"
          aria-current={stage.id === selectedStage ? 'step' : undefined}
          aria-label={`${stage.label}，依赖 ${dependency.evidence}，${stage.status}`}
          onClick={() => onSelect(stage)}
        >
          <span className={`dependency-node ${stage.status}`}>
            {stage.status === 'completed' ? '✓' : stage.status === 'running' ? <i /> : stage.status === 'waiting' ? '!' : index + 1}
          </span>
          <span className="dependency-copy">
            <b>{stage.label}</b>
            <small>{owner?.name ?? '待分派'} · {stage.status === 'completed' ? '已产出' : stage.status === 'running' ? '正在执行' : stage.status === 'waiting' ? '等待确认' : stage.status === 'failed' ? '执行失败' : '等待依赖'}</small>
          </span>
          {stage.retryCount > 0 && <em className="dependency-retry">{stage.retryCount}</em>}
          <span className="dependency-open">›</span>
        </button>
      </div>
    })}</div>
    <footer><span className="complete" />已满足<span className="flowing" />传递中<span className="pending" />待依赖</footer>
  </nav>
}

function DeveloperView() {
  const task = useTaskStore((state) => state.task)!
  const events = useTaskStore((state) => state.events)
  const selectedTab = useTaskStore((state) => state.selectedTab) as DeveloperTab
  const selectedStage = useTaskStore((state) => state.selectedStage)
  const setSelectedTab = useTaskStore((state) => state.setSelectedTab)
  const setSelectedStage = useTaskStore((state) => state.setSelectedStage)
  const [evidence, setEvidence] = useState<DeliveryEvidence | null>(null)
  const [evidenceError, setEvidenceError] = useState('')
  const [selection, setSelection] = useState<DeveloperSelection>({ kind: 'stage' })
  const stages = getStageProjection(task, events)
  const selectedProjection = stages.find((stage) => stage.id === selectedStage) ?? stages[0]
  const selectedEvents = events.filter((event) => event.stage === selectedStage)
  const selectedArtifacts = (evidence?.artifacts ?? []).filter((artifact) => (
    artifactBelongsToStage(artifact.id, selectedStage)
  ))
  const availableTabs = tabsForStage(selectedStage, Boolean(useTaskStore.getState().codeGraphStatus))
  const tabLabels: Record<DeveloperTab, string> = {
    conversation: '阶段概览',
    events: '过程事件',
    artifacts: '阶段产物',
    evidence: '质量证据',
    trace: '自动化轨迹',
    graph: '技术图谱',
  }

  useEffect(() => {
    void invoke<DeliveryEvidence>('delivery_evidence', { workspacePath: task.workspacePath })
      .then(setEvidence)
      .catch((error) => setEvidenceError(error instanceof Error ? error.message : String(error)))
  }, [task.workspacePath])

  useEffect(() => {
    const nextTab = tabsForStage(selectedStage, Boolean(useTaskStore.getState().codeGraphStatus))
    if (!nextTab.includes(selectedTab)) setSelectedTab(defaultTabForStage(selectedStage))
    setSelection({ kind: 'stage' })
  }, [selectedStage, selectedTab, setSelectedTab])

  const openArtifact = (artifact: DeliveryArtifact) => {
    void invoke('open_delivery_artifact', {
      workspacePath: task.workspacePath,
      relativePath: artifact.relativePath,
    }).catch((error) => setEvidenceError(error instanceof Error ? error.message : String(error)))
  }

  const chooseStage = (stage: typeof stages[number]) => {
    setSelectedStage(stage.id)
    setSelectedTab(defaultTabForStage(stage.id))
    setSelection({ kind: 'stage' })
  }

  const chooseTab = (tab: DeveloperTab) => {
    setSelectedTab(tab)
    setSelection({ kind: 'stage' })
  }

  return (
    <section className="developer-view">
      <aside className="dev-sidebar">
        <div className="sidebar-title"><span>项目与阶段</span><button type="button" title="阶段视图选项">•••</button></div>
        <div className="project-chip"><span>DP</span><div><b>{task.name}</b><small>{task.versionLabel || task.id.slice(0, 8)}</small></div></div>
        <StageDependencyMap task={task} stages={stages} selectedStage={selectedStage} onSelect={chooseStage} />
      </aside>
      <main className="dev-main">
        <div className="dev-breadcrumb"><span>{task.name}</span><i>/</i><b>{selectedProjection.label}</b><em>{stageDefinitions.findIndex((stage) => stage.id === selectedStage) + 1}/{stageDefinitions.length}</em></div>
        <div className="dev-tabs">{availableTabs.map((id) => <button type="button" className={selectedTab === id ? 'active' : ''} onClick={() => chooseTab(id)} key={id}>{tabLabels[id]}{id === 'events' && <span>{selectedEvents.length}</span>}{id === 'artifacts' && <span>{selectedArtifacts.length}</span>}</button>)}</div>
        <div className="run-heading"><div><span className="run-icon"><Mark name={selectedTab === 'trace' ? 'pulse' : 'terminal'} /></span><div><small>{selectedProjection.executiveLabel} · {tabLabels[selectedTab]}</small><h2>{selectedProjection.label}</h2></div></div><span className={`run-status ${selectedProjection.status}`}><i />{selectedProjection.status}</span></div>
        {evidenceError && <div className="evidence-error">{evidenceError}</div>}
        {selectedTab === 'conversation' && <StageOverview task={task} stage={selectedProjection} events={selectedEvents} artifacts={selectedArtifacts} onSelectEvent={(event) => setSelection({ kind: 'event', event })} onSelectArtifact={(artifact) => setSelection({ kind: 'artifact', artifact })} />}
        {selectedTab === 'events' && <EventTimeline events={selectedEvents} selectedId={selection.kind === 'event' ? selection.event.id : undefined} onSelect={(event) => setSelection({ kind: 'event', event })} />}
        {selectedTab === 'artifacts' && <ArtifactGallery evidence={evidence} artifacts={selectedArtifacts} selectedId={selection.kind === 'artifact' ? selection.artifact.id : undefined} onSelect={(artifact) => setSelection({ kind: 'artifact', artifact })} />}
        {selectedTab === 'evidence' && <EvidenceOverview evidence={evidence} />}
        {selectedTab === 'trace' && <AutomationTrace evidence={evidence} active />}
        {selectedTab === 'graph' && <div className="developer-graph-view"><CodeGraphProgress onSelectNode={(node) => setSelection({ kind: 'graph', node })} /></div>}
      </main>
      <DeveloperInspector task={task} stage={selectedProjection} selection={selection} onOpenArtifact={openArtifact} />
      <RuntimeDrawer />
    </section>
  )
}

function AppHeader({
  onOpenRadar,
  onOpenWorkforce,
  onOpenSquad,
  onOpenTasks,
  onHome,
  onHistory,
}: {
  onOpenRadar: () => void
  onOpenWorkforce: () => void
  onOpenSquad: () => void
  onOpenTasks: () => void
  onHome: () => void
  onHistory: () => void
}) {
  const task = useTaskStore((state) => state.task)!
  const view = useTaskStore((state) => state.view)
  const setView = useTaskStore((state) => state.setView)
  const statusLabel = task.status === 'completed'
    ? '交付已完成'
    : task.status === 'waiting_approval'
      ? '等待确认'
      : task.status === 'paused'
        ? '已暂停'
        : '任务运行中'
  return <header className="app-header">
    <div className="brand compact"><span className="brand-icon"><Mark name="pilot" /></span><div><b>DeliveryPilot</b><small>{task.name} · {task.versionLabel || '旧任务'}</small></div></div>
    <div className="header-center"><span className={`header-status ${task.status}`}><i />{statusLabel}</span><span className="task-code">DP-{task.id.slice(0, 6).toUpperCase()}</span></div>
    <div className="header-actions">
      <nav className="primary-navigation" aria-label="项目导航">
        <button type="button" title="返回首页" onClick={onHome}><House /><span>首页</span></button>
        <button type="button" title="打开项目库" onClick={onHistory}><LibraryBig /><span>项目库</span></button>
        <button type="button" title="打开任务管理" onClick={onOpenTasks}><Activity /><span>任务管理</span></button>
      </nav>
      <nav className="capability-navigation" aria-label="能力模块">
        <button className="workforce" type="button" title="数字员工人才库" onClick={onOpenWorkforce}><UsersRound /><span>数字员工</span></button>
        <button className="squad" type="button" title="当前项目交付小队" onClick={onOpenSquad}><UsersRound /><span>交付小队</span></button>
        <button className="radar" type="button" title="技术雷达" onClick={onOpenRadar}><Radar /><span>技术雷达</span></button>
      </nav>
      <div className="view-switch" role="group" aria-label="工作视角">
        <button type="button" title="领导视角" aria-pressed={view === 'executive'} className={view === 'executive' ? 'active' : ''} onClick={() => setView('executive')}><Presentation /><span>领导</span></button>
        <button type="button" title="开发者视角" aria-pressed={view === 'developer'} className={view === 'developer' ? 'active' : ''} onClick={() => setView('developer')}><Code2 /><span>开发</span></button>
      </div>
    </div>
  </header>
}

function StatusBar() {
  const task = useTaskStore((state) => state.task)!
  const events = useTaskStore((state) => state.events)
  const externalRun = useTaskStore((state) => state.externalRun)
  const focusExternalApp = useTaskStore((state) => state.focusExternalApp)
  const pauseOrResume = useTaskStore((state) => state.pauseOrResume)
  return <footer className="status-bar"><div><span className="status-brand"><i /> real execution</span><span>阶段 <b>{task.currentStage}</b></span><span>agent <b>Trae agent</b></span><span>工具 <b>{externalRun?.appName ?? '-'}</b></span><span>事件 <b>{events.length}</b></span></div><div><button type="button" onClick={pauseOrResume} disabled={task.status === 'waiting_approval' || task.status === 'completed'}>{task.status === 'completed' ? '已完成' : task.status === 'paused' ? '继续' : '暂停'}</button><button type="button" disabled={!externalRun} onClick={() => void focusExternalApp()}>人工接管</button></div></footer>
}

export default function App() {
  const [page, setPage] = useState<'home' | 'task' | 'radar' | 'tasks' | 'workforce' | 'squad'>('home')
  const [radarReturnPage, setRadarReturnPage] = useState<'home' | 'task'>('home')
  const [workforceReturnPage, setWorkforceReturnPage] = useState<'home' | 'task'>('home')
  const [homeSection, setHomeSection] = useState<'new' | 'history'>('new')
  const task = useTaskStore((state) => state.task)
  const events = useTaskStore((state) => state.events)
  const createTask = useTaskStore((state) => state.createTask)
  const startTask = useTaskStore((state) => state.startTask)
  const openHistoricalVersion = useTaskStore((state) => state.openHistoricalVersion)
  const view = useTaskStore((state) => state.view)
  const externalRun = useTaskStore((state) => state.externalRun)
  const technologyRun = useTaskStore((state) => state.technologyRun)
  const codeGraphStatus = useTaskStore((state) => state.codeGraphStatus)
  const reconcilePersistedCompletion = useTaskStore((state) => state.reconcilePersistedCompletion)
  const refreshExternalStatus = useTaskStore((state) => state.refreshExternalStatus)
  const refreshTechnologyReference = useTaskStore((state) => state.refreshTechnologyReference)
  const refreshCodeGraph = useTaskStore((state) => state.refreshCodeGraph)
  const employees = useWorkforceStore((state) => state.employees)
  const buildSquadSnapshot = useWorkforceStore((state) => state.buildSquadSnapshot)
  const [handoffPath, setHandoffPath] = useState('')
  const acceptedHandoffs = useRef(new Set<string>())
  useEffect(() => {
    let disposed = false
    let unlisten: (() => void) | undefined
    const processHandoff = async (payload: DemoHandoff) => {
      if (disposed || acceptedHandoffs.current.has(payload.deliveryId)) return
      acceptedHandoffs.current.add(payload.deliveryId)
      try {
        await invoke('demo_handoff_update', {
          requestPath: payload.requestPath,
          patch: {
            state: 'receiving',
            phase: 'DeliveryPilot 正在创建交付项目',
            percent: 5,
            message: '已接收 Technology Exploration Demo 交付事件',
          },
        })
        await createTask({
          name: payload.projectName,
          feature: 'technology-demo',
          mode: 'unattended',
          document: payload.sourceDocument,
          technologyReference: {
            ...defaultTechnologyReference,
            enabled: true,
            transport: 'provider_api',
            depth: 'code_graph',
          },
          deliverySquad: buildSquadSnapshot(
            employees.filter((employee) => employee.status === 'active').map((employee) => employee.id),
            payload.projectName,
          ),
        })
        setHandoffPath(payload.requestPath)
        setPage('task')
        await startTask()
      } catch (error) {
        await invoke('demo_handoff_update', {
          requestPath: payload.requestPath,
          patch: {
            state: 'failed',
            phase: 'DeliveryPilot 接管失败',
            message: error instanceof Error ? error.message : String(error),
          },
        }).catch(() => undefined)
      }
    }
    const poll = () => {
      void invoke<DemoHandoff[]>('demo_handoff_pending')
        .then((items) => items.forEach((item) => void processHandoff(item)))
        .catch(() => undefined)
    }
    void listen<DemoHandoff>('demo-handoff', ({ payload }) => {
      void processHandoff(payload)
    }).then((dispose) => {
      if (disposed) dispose()
      else unlisten = dispose
    })
    poll()
    const timer = window.setInterval(poll, 3000)
    return () => {
      disposed = true
      window.clearInterval(timer)
      unlisten?.()
    }
  }, [buildSquadSnapshot, createTask, employees, startTask])
  useEffect(() => {
    if (!handoffPath || !task) return
    const sync = async () => {
      let previewUrl: string | null = null
      if (task.status === 'completed') {
        previewUrl = await invoke<{ address?: string }>('delivery_access', {
          workspacePath: task.workspacePath,
        }).then((access) => access.address || null).catch(() => null)
      }
      await invoke('demo_handoff_update', {
        requestPath: handoffPath,
        patch: {
          state: task.status === 'completed' ? 'completed' : task.status === 'failed' ? 'failed' : 'running',
          phase: stageDefinitions.find((stage) => stage.id === task.currentStage)?.executiveLabel || task.currentStage,
          percent: getProgress(task),
          message: task.status === 'completed' ? 'Demo 已完成交付' : 'DeliveryPilot 正在执行真实研发流程',
          workspacePath: task.workspacePath,
          previewUrl,
        },
      })
    }
    void sync()
    const timer = window.setInterval(() => void sync(), 5000)
    return () => window.clearInterval(timer)
  }, [handoffPath, task?.id, task?.status, task?.currentStage, task?.workspacePath])
  useEffect(() => {
    if (!task || !externalRun || task.status !== 'running') return
    const stage = externalRun.bundleId === 'cn.trae.solo.app'
      ? 'traework_analysis'
      : 'trae_spec'
    void invoke('supervisor_adopt', {
      request: {
        workspacePath: task.workspacePath,
        stage,
        appName: externalRun.appName,
        bundleId: externalRun.bundleId,
        sourceDocument: task.sourceDocument.path,
        prompt: promptForTask(task, stage),
        pid: externalRun.pid,
      },
    })
  }, [task, externalRun])
  useEffect(() => {
    void reconcilePersistedCompletion()
  }, [task?.id, task?.status, task?.currentStage, reconcilePersistedCompletion])
  useEffect(() => {
    if (!externalRun) return
    void refreshExternalStatus()
    const timer = window.setInterval(() => void refreshExternalStatus(), 2000)
    return () => window.clearInterval(timer)
  }, [externalRun, refreshExternalStatus])
  useEffect(() => {
    if (!technologyRun) return
    void refreshTechnologyReference()
    const timer = window.setInterval(() => void refreshTechnologyReference(), 1200)
    return () => window.clearInterval(timer)
  }, [technologyRun, refreshTechnologyReference])
  useEffect(() => {
    if (!codeGraphStatus || ['completed', 'failed'].includes(codeGraphStatus.state)) return
    void refreshCodeGraph()
    const timer = window.setInterval(() => void refreshCodeGraph(), 1200)
    return () => window.clearInterval(timer)
  }, [codeGraphStatus, refreshCodeGraph])
  const goHome = (section: 'new' | 'history') => {
    setHomeSection(section)
    setPage('home')
  }
  const openRadar = (returnPage: 'home' | 'task') => {
    setRadarReturnPage(returnPage)
    setPage('radar')
  }
  const openWorkforce = (returnPage: 'home' | 'task') => {
    setWorkforceReturnPage(returnPage)
    setPage('workforce')
  }
  if (page === 'radar') return <TechnologyRadar onClose={() => setPage(radarReturnPage)} />
  if (page === 'workforce') return <DigitalWorkforce onClose={() => setPage(workforceReturnPage)} />
  if (page === 'squad' && task) return <ProjectSquad task={task} events={events} onClose={() => setPage('task')} />
  if (page === 'tasks') return <TaskManager onClose={() => setPage(task ? 'task' : 'home')} />
  if (page === 'home' || !task) return <Intake
    key={homeSection}
    initialSection={homeSection}
    onOpenRadar={() => openRadar('home')}
    onOpenWorkforce={() => openWorkforce('home')}
    onOpenTasks={() => setPage('tasks')}
    onOpenCurrent={() => setPage('task')}
    onTaskCreated={() => setPage('task')}
    onOpenHistorical={(version) => {
      openHistoricalVersion(version)
      setPage('task')
    }}
  />
  return <div className={`task-shell ${view}`}><AppHeader onOpenRadar={() => openRadar('task')} onOpenWorkforce={() => openWorkforce('task')} onOpenSquad={() => setPage('squad')} onOpenTasks={() => setPage('tasks')} onHome={() => goHome('new')} onHistory={() => goHome('history')} />{view === 'executive' ? <ExecutiveView /> : <DeveloperView />}<StatusBar /></div>
}
