import { invoke } from '@tauri-apps/api/core'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { getAutomationTransition } from '../domain/automation'
import type {
  AutomationMode,
  DeliverySquadSnapshot,
  DeliveryTask,
  SourceDocument,
  StageName,
  TaskEvent,
  TechnologyReferenceConfig,
  ViewMode,
} from '../domain/types'

type ExternalRun = {
  pid: number
  appName: string
  bundleId: string
  startedAtMs: number
  sendConfirmed: boolean
  attachmentStatus: string
  confirmation: string
  automationSteps: string[]
}

export type SubmissionStatus = {
  state: 'idle' | 'checking_permission' | 'opening' | 'submitting' | 'confirmed' | 'failed'
  label: string
  steps: string[]
}

export type ExternalStatus = {
  appOnline: boolean
  state: 'offline' | 'idle' | 'working' | 'completed'
  phase: string
  phaseIndex: number
  totalPhases: number
  elapsedSeconds: number
  lastActivityAt: number | null
  lastActivityLabel: string
  changedFiles: string[]
  artifactCount: number
  expectedArtifactCount: number
  progressPercent: number
  selfReported: boolean
  completed: boolean
}

export type TechnologyCandidate = {
  fullName: string
  url: string
  cloneUrl: string
  description: string
  language: string
  stars: number
  license: string
  defaultBranch: string
  fitScore: number
  trendScore: number
  evidenceConfidence: string
  verdict: string
  licenseBlocked: boolean
  matchedTerms: string[]
  coveragePercent?: number
  confidenceLabel?: string
  plainDescription?: string
  plainExplanation?: string
  adoptionAdvice?: string
  riskNotes?: string[]
  implementationPlan?: Array<{
    stage: string
    title: string
    detail: string
  }>
}

export type TechnologyAdvisoryRun = {
  jobId: string
  projectId?: string
  state: string
  requestedTransport: 'computer_use' | 'provider_api'
  actualTransport: 'computer_use' | 'provider_api'
  fallbackUsed: boolean
  workspacePath: string
}

export type TechnologyAdvisoryStatus = {
  jobId: string
  projectId?: string
  state: 'queued' | 'running' | 'completed' | 'failed'
  phase: string
  percent: number
  message: string
  completed: boolean
  continuouslyMonitored?: boolean
  lastScannedAt?: string
  nextScanAt?: string
  result?: {
    summary: string
    recommendation: string | null
    candidates: TechnologyCandidate[]
  }
}

export type RequirementGraphNode = {
  id: string
  label: string
  kind: 'Capability' | 'Repository' | 'Module' | 'Symbol' | 'Risk'
  layer: number
  detail: string
}

export type RequirementGraphEdge = {
  id: string
  from: string
  to: string
  type: string
  confidence: number
}

export type CodeGraphStatus = {
  state: 'queued' | 'running' | 'completed' | 'failed'
  phase: string
  percent: number
  message: string
  candidate: string
  evidencePath: string
  evidence?: {
    discoveryFitScore: number
    verifiedFitScore: number
    coverage: { matchedCapabilities: number; totalCapabilities: number; ratio: number }
    metrics: { fileCount: number; nodeCount: number; edgeCount: number; languages: string[] }
    repository: { fullName: string; url: string; commit: string; license: string }
    nodes: RequirementGraphNode[]
    edges: RequirementGraphEdge[]
    safety: {
      repositoryCodeExecuted: boolean
      installScriptsExecuted: boolean
      indexLocalOnly: boolean
    }
  }
}

export type WorkspaceVersion = {
  projectId: string
  projectName: string
  version: number
  versionLabel: string
  feature: string
  basedOnVersion: string | null
  status: string
  sourceDocumentName: string
  sourceDocumentSha256: string
  workspacePath: string
  createdAt: string
  completedAt: string | null
  deliverySquad?: DeliverySquadSnapshot
}

type DeliveryState = {
  task: DeliveryTask | null
  events: TaskEvent[]
  view: ViewMode
  selectedTab: 'events' | 'conversation' | 'artifacts' | 'evidence' | 'trace' | 'graph'
  selectedStage: StageName
  externalRun: ExternalRun | null
  externalStatus: ExternalStatus | null
  externalError: string | null
  technologyRun: TechnologyAdvisoryRun | null
  technologyStatus: TechnologyAdvisoryStatus | null
  technologyTransitioning: boolean
  codeGraphStatus: CodeGraphStatus | null
  codeGraphTransitioning: boolean
  submissionStatus: SubmissionStatus
  createTask: (input: {
    name: string
    feature: string
    mode: AutomationMode
    document: SourceDocument
    technologyReference: TechnologyReferenceConfig
    deliverySquad: DeliverySquadSnapshot
  }) => Promise<void>
  openHistoricalVersion: (version: WorkspaceVersion) => void
  startTask: () => Promise<void>
  setView: (view: ViewMode) => void
  setSelectedTab: (tab: DeliveryState['selectedTab']) => void
  setSelectedStage: (stage: StageName) => void
  focusExternalApp: () => Promise<void>
  retryExternalStage: () => Promise<void>
  reconcilePersistedCompletion: () => Promise<void>
  refreshExternalStatus: () => Promise<void>
  refreshTechnologyReference: () => Promise<void>
  refreshCodeGraph: () => Promise<void>
  pauseOrResume: () => void
}

export const defaultTechnologyReference: TechnologyReferenceConfig = {
  enabled: false,
  transport: 'computer_use',
  depth: 'recommend',
  fallbackTransport: 'provider_api',
  failurePolicy: 'continue_without_reference',
}

export const requirementPrompt = `请读取当前任务目录中的客户原始需求文档，输出业务目标、角色、编号为 REQ-* 的需求、编号为 BR-* 的业务规则、验收标准，以及必须确认的问题。严格区分原文事实与 AI 推断，不得补造事实。

这是无人值守交付流程。开始时创建 .delivery-pilot/traework-progress.json，并在每个主要步骤更新：
{"phase":"当前步骤","percent":0到100的整数,"message":"当前正在做什么","completed":false}
将完整分析结果写入 .delivery-pilot/traework-result.md。只有结果文件写完并自检后，才把 traework-progress.json 的 completed 改为 true、percent 改为 100。`

export const specPrompt = `请读取当前工作目录中的原始需求文档和 .delivery-pilot/traework-result.md，并基于 Trae Work 的需求分析生成研发规格。
如果 .delivery-pilot/technology-reference/result.json 存在，可将其中已标明证据和许可证状态的候选作为技术参考；不得执行未知仓库脚本，不得采用 licenseBlocked=true 的候选，也不得把“仅作参考”误写为已验证可复用。

生成：
.trae/specs/delivery/spec.md
.trae/specs/delivery/tasks.md
.trae/specs/delivery/checklist.md
必须包含 REQ-*、BR-*、验收标准、测试要求、部署要求和证据要求。

随后按 tasks.md 在当前工作目录完成可运行实现，补齐与风险匹配的自动化测试，并实际执行项目可用的 lint、测试和构建命令。不得伪造未执行的验证、GitLab 或部署结果。

为了让交付驾驶舱显示真实进度，请在开始时创建 .delivery-pilot/progress.json，并在每个主要步骤更新：
{"phase":"当前步骤","percent":0到100的整数,"message":"当前正在做什么","completed":false}
将实现摘要、变更文件、实际执行的验证命令及结果写入 .delivery-pilot/traecode-result.md。
全部规格、实现、测试和自检完成后，才将 progress.json 的 completed 改为 true、percent 改为 100。`

export function promptForTask(
  task: DeliveryTask,
  stage: 'traework_analysis' | 'trae_spec',
  basePrompt = stage === 'traework_analysis' ? requirementPrompt : specPrompt,
) {
  const members = task.deliverySquad?.members ?? []
  const employee = members.find((member) => stage === 'traework_analysis'
    ? member.runtime === 'trae_work'
    : member.runtime === 'trae_code')
  const leader = members.find((member) => member.id === task.deliverySquad?.leaderId)
  if (!employee) return basePrompt
  return `${basePrompt}

你现在以本项目数字员工“${employee.name}（${employee.title}）”的岗位身份工作。
岗位能力：${employee.capabilities.join('、')}。
工作准则：${employee.instructions}
交付队长：${leader ? `${leader.name}（${leader.title}）` : 'DeliveryPilot Supervisor'}。
完成本阶段时，在结果文件末尾增加“数字员工交接”小节，说明本阶段输入、实际产出、未解决风险和下一责任人所需信息。不得因为角色设定改变证据标准或虚构协作。`
}

export const useDeliveryStore = create<DeliveryState>()(
  persist(
    (set, get) => {
      const appendEvent = (
        type: string,
        summary: string,
        stage: StageName,
        detail?: string,
        level: TaskEvent['level'] = 'info',
      ) => {
        const task = get().task
        if (!task) return
        set((state) => ({
          events: [
            ...state.events,
            {
              id: crypto.randomUUID(),
              taskId: task.id,
              sequence: state.events.length + 1,
              timestamp: new Date().toISOString(),
              type,
              level,
              summary,
              stage,
              detail,
            },
          ],
        }))
      }

      const launchStage = async (
        stage: 'traework_analysis' | 'trae_spec',
        prompt: string,
      ) => {
        const task = get().task
        if (!task?.sourceDocument.path) {
          throw new Error('没有原始文档绝对路径，请返回首页重新选择文档')
        }
        const startedAt = Date.now()
        set({
          submissionStatus: {
            state: 'checking_permission',
            label: '正在检查 macOS 辅助功能权限',
            steps: [],
          },
          externalError: null,
        })
        // #region debug-point A,D:dispatch-start
        fetch('http://127.0.0.1:7777/event', { method: 'POST', body: JSON.stringify({ sessionId: 'trae-progress-invisible', runId: 'post-fix', hypothesisId: 'A,D', location: 'src/stores/deliveryStore.ts:launchStage', msg: '[DEBUG] external stage dispatch started', data: { stage, sourceDocument: task.sourceDocument.path, workspacePath: task.workspacePath }, ts: Date.now() }) }).catch(() => {})
        // #endregion
        try {
          const permission = await invoke<Record<string, string>>('automation_permission', {
            request: true,
          })
          if (permission.accessibility !== 'granted') {
            throw new Error('请在系统设置的“隐私与安全性 → 辅助功能”中允许 DeliveryPilot，然后点击“重试发送”')
          }
          set({
            submissionStatus: {
              state: 'submitting',
              label: stage === 'traework_analysis'
                ? '权限已确认，正在复用现有 Trae Work 窗口'
                : '权限已确认，正在打开 Trae Code 工作区',
              steps: ['Accessibility 权限已确认'],
            },
          })
          const run = await invoke<ExternalRun>('launch_external_stage', {
            stage,
            prompt: promptForTask(task, stage, prompt),
            sourceDocument: task.sourceDocument.path,
            workspacePath: task.workspacePath,
          })
          if (!run.sendConfirmed) {
            throw new Error('Trae 界面未确认接收任务')
          }
          set({
            submissionStatus: {
              state: 'confirmed',
              label: 'Trae 已接收任务，正在执行',
              steps: run.automationSteps,
            },
          })
          // #region debug-point A,D:dispatch-returned
          fetch('http://127.0.0.1:7777/event', { method: 'POST', body: JSON.stringify({ sessionId: 'trae-progress-invisible', runId: 'post-fix', hypothesisId: 'A,D', location: 'src/stores/deliveryStore.ts:launchStage', msg: '[DEBUG] external stage dispatch returned', data: { stage, elapsedMs: Date.now() - startedAt, run }, ts: Date.now() }) }).catch(() => {})
          // #endregion
          return run
        } catch (error) {
          set((state) => ({
            submissionStatus: {
              state: 'failed',
              label: error instanceof Error ? error.message : String(error),
              steps: state.submissionStatus.steps,
            },
          }))
          // #region debug-point A,D:dispatch-failed
          fetch('http://127.0.0.1:7777/event', { method: 'POST', body: JSON.stringify({ sessionId: 'trae-progress-invisible', runId: 'post-fix', hypothesisId: 'A,D', location: 'src/stores/deliveryStore.ts:launchStage', msg: '[DEBUG] external stage dispatch failed', data: { stage, elapsedMs: Date.now() - startedAt, error: String(error) }, ts: Date.now() }) }).catch(() => {})
          // #endregion
          throw error
        }
      }

      const launchTraeCode = async (task: DeliveryTask) => {
        set({
          task: {
            ...task,
            currentStage: 'trae_spec',
            updatedAt: new Date().toISOString(),
          },
          selectedStage: 'trae_spec',
          externalRun: null,
          externalStatus: null,
          externalError: null,
          technologyTransitioning: true,
        })
        appendEvent(
          'app.launch.requested',
          '技术参考支线已结束，自动启动 Trae Code',
          'trae_spec',
          task.workspacePath,
        )
        try {
          const run = await launchStage('trae_spec', specPrompt)
          set({
            externalRun: run,
            externalStatus: null,
            externalError: null,
            technologyTransitioning: false,
          })
          appendEvent(
            'traecode.prompt.sent',
            'Trae Code 已自动接收研发任务',
            'trae_spec',
            `bundle id: ${run.bundleId} · pid ${run.pid} · ${run.confirmation}`,
          )
        } catch (launchError) {
          const message = launchError instanceof Error ? launchError.message : String(launchError)
          set((current) => current.task
            ? {
                task: { ...current.task, status: 'paused' },
                externalError: message,
                technologyTransitioning: false,
              }
            : current)
          appendEvent('task.failed', 'Trae Code 自动启动失败', 'trae_spec', message, 'error')
        }
      }

      const startTechnologyReference = async (task: DeliveryTask) => {
        const config = task.technologyReference ?? defaultTechnologyReference
        set({
          task: {
            ...task,
            currentStage: 'business_approval',
            updatedAt: new Date().toISOString(),
          },
          selectedStage: 'business_approval',
          externalRun: null,
          externalStatus: null,
          technologyStatus: {
            jobId: '',
            state: 'queued',
            phase: 'starting',
            percent: 0,
            message: '正在连接 Technology Exploration',
            completed: false,
          },
        })
        appendEvent(
          'technology.reference.requested',
          `正在通过${config.transport === 'computer_use' ? '可视化操作' : 'Provider API'}获取技术参考`,
          'business_approval',
          `depth=${config.depth} · fallback=${config.fallbackTransport}`,
        )
        try {
          const run = await invoke<TechnologyAdvisoryRun>('technology_advisory_start', {
            request: {
              workspacePath: task.workspacePath,
              requirement: `${task.name}：${task.sourceDocument.name}`,
              businessDomain: '自动识别',
              transport: config.transport,
              depth: config.depth,
              fallbackTransport: config.fallbackTransport,
              maxCandidates: 8,
            },
          })
          set({
            technologyRun: run,
            technologyStatus: {
              jobId: run.jobId,
              state: 'queued',
              phase: 'queued',
              percent: 0,
              message: run.fallbackUsed
                ? `主通道不可用，已降级到 ${run.actualTransport}`
                : 'Technology Exploration 已接收任务',
              completed: false,
            },
          })
          appendEvent(
            run.fallbackUsed ? 'technology.reference.fallback' : 'technology.reference.started',
            run.fallbackUsed ? '技术参考已切换到降级通道' : '技术参考任务已启动',
            'business_approval',
            `${run.actualTransport} · job ${run.jobId}`,
            run.fallbackUsed ? 'warning' : 'info',
          )
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          set({ technologyRun: null, technologyStatus: null, externalError: null })
          appendEvent(
            'technology.reference.skipped',
            '技术参考不可用，按策略继续独立开发',
            'business_approval',
            message,
            'warning',
          )
          await launchTraeCode(task)
        }
      }

      return {
        task: null,
        events: [],
        view: 'executive',
        selectedTab: 'events',
        selectedStage: 'document_intake',
        externalRun: null,
        externalStatus: null,
        externalError: null,
        technologyRun: null,
        technologyStatus: null,
        technologyTransitioning: false,
        codeGraphStatus: null,
        codeGraphTransitioning: false,
        submissionStatus: { state: 'idle', label: '尚未提交外部任务', steps: [] },
        createTask: async ({ name, feature, mode, document, technologyReference, deliverySquad }) => {
          const workspace = await invoke<{
            projectId: string
            projectName: string
            version: number
            versionLabel: string
            workspacePath: string
          }>('workspace_prepare', {
            projectName: name,
            feature,
            sourceDocumentName: document.name,
            sourceDocumentSha256: document.sha256,
            deliverySquad,
          })
          const now = new Date().toISOString()
          const task: DeliveryTask = {
            id: crypto.randomUUID(),
            projectId: workspace.projectId,
            name: workspace.projectName,
            version: workspace.version,
            versionLabel: workspace.versionLabel,
            mode,
            viewPreference: 'executive',
            status: 'draft',
            sourceDocument: document,
            technologyReference,
            deliverySquad,
            workspacePath: workspace.workspacePath,
            currentStage: 'document_intake',
            createdAt: now,
            updatedAt: now,
          }
          set({
            task,
            events: [],
            view: 'executive',
            selectedStage: 'document_intake',
            externalRun: null,
            externalStatus: null,
            externalError: null,
            technologyRun: null,
            technologyStatus: null,
            technologyTransitioning: false,
            codeGraphStatus: null,
            codeGraphTransitioning: false,
            submissionStatus: { state: 'idle', label: '尚未提交外部任务', steps: [] },
          })
          appendEvent('task.created', '已创建交付任务', 'document_intake')
          appendEvent(
            'document.selected',
            `已接收 ${document.name}`,
            'document_intake',
            `${document.path} · sha-256 ${document.sha256}`,
          )
          appendEvent(
            'squad.formed',
            `自主交付小队已组建：${deliverySquad.members.map((member) => member.name).join('、')}`,
            'document_intake',
            `${deliverySquad.members.length} 名数字员工 · 队长 ${deliverySquad.members.find((member) => member.id === deliverySquad.leaderId)?.name ?? '-'}`,
          )
        },
        openHistoricalVersion: (version) => {
          const completed = version.status === 'completed'
          const now = new Date().toISOString()
          const task: DeliveryTask = {
            id: `${version.projectId}-${version.versionLabel}`,
            projectId: version.projectId,
            name: version.projectName,
            version: version.version,
            versionLabel: version.versionLabel,
            mode: 'unattended',
            viewPreference: 'developer',
            status: completed ? 'completed' : 'paused',
            sourceDocument: {
              id: version.sourceDocumentSha256 || version.versionLabel,
              name: version.sourceDocumentName,
              mediaType: 'application/octet-stream',
              byteSize: 0,
              sha256: version.sourceDocumentSha256,
            },
            technologyReference: defaultTechnologyReference,
            deliverySquad: version.deliverySquad,
            workspacePath: version.workspacePath,
            currentStage: completed ? 'acceptance' : 'trae_spec',
            createdAt: version.createdAt || now,
            updatedAt: version.completedAt || version.createdAt || now,
          }
          set({
            task,
            events: [{
              id: crypto.randomUUID(),
              taskId: task.id,
              sequence: 1,
              timestamp: version.completedAt || version.createdAt || now,
              type: 'history.version.opened',
              level: 'info',
              summary: `已打开历史版本 ${version.versionLabel}`,
              stage: task.currentStage,
              detail: version.workspacePath,
            }],
            view: 'developer',
            selectedTab: 'artifacts',
            selectedStage: task.currentStage,
            externalRun: null,
            externalStatus: null,
            externalError: null,
            technologyRun: null,
            technologyStatus: null,
            technologyTransitioning: false,
            codeGraphStatus: null,
            codeGraphTransitioning: false,
            submissionStatus: {
              state: completed ? 'confirmed' : 'idle',
              label: completed ? '历史版本已完成' : '历史版本未完成',
              steps: [],
            },
          })
          void invoke<CodeGraphStatus>('technology_codegraph_status', {
            workspacePath: version.workspacePath,
          }).then((status) => set({ codeGraphStatus: status, selectedTab: 'graph' }))
            .catch(() => undefined)
        },
        startTask: async () => {
          const task = get().task
          if (!task || task.status === 'running') return
          set({
            task: {
              ...task,
              status: 'running',
              currentStage: 'document_intake',
              updatedAt: new Date().toISOString(),
            },
            selectedStage: 'document_intake',
            externalError: null,
          })
          void invoke('workspace_version_status', {
            workspacePath: task.workspacePath,
            status: 'running',
          })
          appendEvent(
            'document.parsed',
            '文档格式与完整性检查通过',
            'document_intake',
            '已保存原始文档绝对路径和 SHA-256',
          )
          set((state) => state.task
            ? { task: { ...state.task, currentStage: 'traework_analysis' } }
            : state)
          appendEvent('app.launch.requested', '正在启动真实 Trae Work', 'traework_analysis')
          try {
            const run = await launchStage('traework_analysis', requirementPrompt)
            set({ externalRun: run, externalStatus: null, selectedStage: 'traework_analysis' })
            appendEvent(
              'app.window.detected',
              '已激活并复用现有 Trae Work 窗口',
              'traework_analysis',
              `bundle id: ${run.bundleId} · pid ${run.pid}`,
            )
            appendEvent(
              'traework.workspace.selected',
              run.attachmentStatus === 'workspace_selected'
                ? '已在 Trae Work 选择需求文档所在目录'
                : '已向 Trae Work 提供需求文件',
              'traework_analysis',
              `${task.sourceDocument.path} · ${run.attachmentStatus}`,
            )
            appendEvent(
              'traework.prompt.sent',
              '真实需求分析任务已发送',
              'traework_analysis',
              `requirement-analysis.v1 · ${run.confirmation}`,
            )
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            void invoke('workspace_version_status', {
              workspacePath: task.workspacePath,
              status: 'failed',
            })
            set((state) => state.task
              ? {
                  task: { ...state.task, status: 'paused' },
                  externalError: message,
                }
              : state)
            appendEvent('task.failed', 'Trae Work 启动失败', 'traework_analysis', message, 'error')
          }
        },
        setView: (view) => set((state) => ({
          view,
          task: state.task ? { ...state.task, viewPreference: view } : null,
        })),
        setSelectedTab: (selectedTab) => set({ selectedTab }),
        setSelectedStage: (selectedStage) => set({ selectedStage }),
        focusExternalApp: async () => {
          const run = get().externalRun
          if (!run) return
          await invoke('focus_external_app', { bundleId: run.bundleId })
        },
        retryExternalStage: async () => {
          const task = get().task
          if (!task) return
          const isWork = task.currentStage === 'traework_analysis'
          const stage = isWork ? 'traework_analysis' : 'trae_spec'
          const prompt = isWork ? requirementPrompt : specPrompt
          set({
            task: { ...task, status: 'running', updatedAt: new Date().toISOString() },
            externalError: null,
          })
          void invoke('workspace_version_status', {
            workspacePath: task.workspacePath,
            status: 'running',
          })
          appendEvent('app.submit.retry', '正在重试真实任务发送', task.currentStage)
          try {
            const run = await launchStage(stage, prompt)
            set({ externalRun: run, externalStatus: null, externalError: null })
            appendEvent(
              isWork ? 'traework.prompt.sent' : 'traecode.prompt.sent',
              isWork ? 'Trae Work 已确认接收需求分析任务' : 'Trae Code 已确认接收研发规格任务',
              task.currentStage,
              `${run.confirmation} · attachment ${run.attachmentStatus}`,
            )
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            void invoke('workspace_version_status', {
              workspacePath: task.workspacePath,
              status: 'failed',
            })
            set((state) => state.task
              ? {
                  task: { ...state.task, status: 'paused' },
                  externalError: message,
                }
              : state)
            appendEvent('task.submit.failed', '真实任务发送失败', task.currentStage, message, 'error')
          }
        },
        reconcilePersistedCompletion: async () => {
          const task = get().task
          if (!task || task.status === 'completed' || task.currentStage !== 'trae_spec') return
          try {
            const status = await invoke<ExternalStatus>('external_status', {
              stage: 'trae_spec',
              workspacePath: task.workspacePath,
              startedAtMs: Date.parse(task.createdAt),
            })
            if (!status.completed || get().task?.id !== task.id) return
            set({
              task: {
                ...task,
                status: 'completed',
                currentStage: 'acceptance',
                updatedAt: new Date().toISOString(),
              },
              selectedStage: 'acceptance',
              externalStatus: status,
              externalError: null,
            })
            void invoke('workspace_version_status', {
              workspacePath: task.workspacePath,
              status: 'completed',
            })
            if (!get().events.some((event) => event.type === 'delivery.completed')) {
              appendEvent(
                'delivery.completed',
                '已从真实交付产物恢复完成状态',
                'acceptance',
                '.delivery-pilot/progress.json · completed=true',
              )
            }
          } catch (error) {
            set({ externalError: error instanceof Error ? error.message : String(error) })
          }
        },
        refreshExternalStatus: async () => {
          const { externalRun, task } = get()
          if (!externalRun || !task) return
          const stage = externalRun.bundleId === 'cn.trae.solo.app'
            ? 'traework_analysis'
            : 'trae_spec'
          try {
            const status = await invoke<ExternalStatus>('external_status', {
              stage,
              workspacePath: task.workspacePath,
              startedAtMs: externalRun.startedAtMs,
            })
            // #region debug-point B,C,D:status-visible
            fetch('http://127.0.0.1:7777/event', { method: 'POST', body: JSON.stringify({ sessionId: 'trae-progress-invisible', runId: 'post-fix', hypothesisId: 'B,C,D', location: 'src/stores/deliveryStore.ts:refreshExternalStatus', msg: '[DEBUG] external status received by UI store', data: { stage, state: status.state, appOnline: status.appOnline, phaseIndex: status.phaseIndex, totalPhases: status.totalPhases, changedFiles: status.changedFiles.length, progressPercent: status.progressPercent }, ts: Date.now() }) }).catch(() => {})
            // #endregion
            set({ externalStatus: status })
            const transition = getAutomationTransition({
              stage: task.currentStage,
              taskStatus: task.status,
              externalCompleted: status.completed,
            })
            if (
              transition === 'launch_trae_code'
              && stage === 'traework_analysis'
              && get().task?.currentStage === 'traework_analysis'
              && get().task?.status === 'running'
            ) {
              const currentTask = get().task!
              appendEvent(
                'traework.response.completed',
                'Trae Work 需求分析已通过产物校验',
                'traework_analysis',
                '.delivery-pilot/traework-result.md · completed=true',
              )
              const config = currentTask.technologyReference ?? defaultTechnologyReference
              if (config.enabled) await startTechnologyReference({
                ...currentTask,
                technologyReference: config,
              })
              else await launchTraeCode(currentTask)
            }
            if (
              transition === 'complete_delivery'
              && stage === 'trae_spec'
              && get().task?.currentStage === 'trae_spec'
              && get().task?.status === 'running'
            ) {
              const completedTask = get().task!
              appendEvent(
                'traecode.delivery.completed',
                'Trae Code 已完成规格、实现和验证',
                'trae_spec',
                `${status.artifactCount}/${status.expectedArtifactCount} 个本次运行产物已校验`,
              )
              set({
                task: {
                  ...completedTask,
                  status: 'completed',
                  currentStage: 'acceptance',
                  updatedAt: new Date().toISOString(),
                },
                selectedStage: 'acceptance',
                externalError: null,
              })
              void invoke('workspace_version_status', {
                workspacePath: completedTask.workspacePath,
                status: 'completed',
              })
              appendEvent(
                'delivery.completed',
                '端到端自动交付已完成',
                'acceptance',
                '.delivery-pilot/traecode-result.md · completed=true',
              )
            }
          } catch (error) {
            set({ externalError: error instanceof Error ? error.message : String(error) })
          }
        },
        refreshTechnologyReference: async () => {
          const { technologyRun, task, technologyStatus, technologyTransitioning } = get()
          if (!technologyRun || !task || technologyTransitioning) return
          if (technologyStatus?.state === 'completed' || technologyStatus?.state === 'failed') return
          try {
            const status = await invoke<TechnologyAdvisoryStatus>('technology_advisory_status', {
              workspacePath: task.workspacePath,
              jobId: technologyRun.jobId,
            })
            const previousPhase = get().technologyStatus?.phase
            set({ technologyStatus: status })
            if (status.phase !== previousPhase) {
              appendEvent(
                `technology.reference.${status.phase}`,
                status.message,
                'business_approval',
                `${status.percent}% · ${technologyRun.actualTransport}`,
              )
            }
            if (status.state === 'completed') {
              set({ technologyTransitioning: true })
              appendEvent(
                'technology.reference.completed',
                status.result?.summary ?? '技术参考分析已完成',
                'business_approval',
                `.delivery-pilot/technology-reference/result.json · ${status.result?.candidates.length ?? 0} 个候选`,
              )
              const config = task.technologyReference ?? defaultTechnologyReference
              const candidate = status.result?.candidates.find((item) => !item.licenseBlocked)
              if (config.depth === 'code_graph' && candidate) {
                try {
                  const graphRun = await invoke<CodeGraphStatus>('technology_codegraph_start', {
                    request: {
                      workspacePath: task.workspacePath,
                      advisoryJobId: technologyRun.jobId,
                      candidate,
                    },
                  })
                  set({ codeGraphStatus: graphRun, codeGraphTransitioning: false })
                  appendEvent(
                    'technology.codegraph.started',
                    `正在为 ${candidate.fullName} 构建代码知识图谱`,
                    'business_approval',
                    '隔离浅克隆 · 固定 Commit · 不执行仓库代码',
                  )
                } catch (error) {
                  appendEvent(
                    'technology.codegraph.skipped',
                    'CodeGraph 验证不可用，保留发现结果并继续',
                    'business_approval',
                    error instanceof Error ? error.message : String(error),
                    'warning',
                  )
                  await launchTraeCode(task)
                }
              } else {
                await launchTraeCode(task)
              }
            } else if (status.state === 'failed') {
              set({ technologyTransitioning: true })
              appendEvent(
                'technology.reference.skipped',
                '技术参考失败，按策略继续独立开发',
                'business_approval',
                status.message,
                'warning',
              )
              await launchTraeCode(task)
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            appendEvent(
              'technology.reference.status_error',
              '技术参考状态读取失败，按策略继续独立开发',
              'business_approval',
              message,
              'warning',
            )
            set({ technologyTransitioning: true })
            await launchTraeCode(task)
          }
        },
        refreshCodeGraph: async () => {
          const { codeGraphStatus, codeGraphTransitioning, task } = get()
          if (!codeGraphStatus || !task || codeGraphTransitioning) return
          if (codeGraphStatus.state === 'completed' || codeGraphStatus.state === 'failed') return
          try {
            const status = await invoke<CodeGraphStatus>('technology_codegraph_status', {
              workspacePath: task.workspacePath,
            })
            const previousPhase = get().codeGraphStatus?.phase
            set({ codeGraphStatus: status })
            if (status.phase !== previousPhase) {
              appendEvent(
                `technology.codegraph.${status.phase}`,
                status.message,
                'business_approval',
                `${status.percent}% · ${status.candidate}`,
              )
            }
            if (status.state === 'completed') {
              set({ codeGraphTransitioning: true })
              appendEvent(
                'technology.codegraph.completed',
                `代码图谱验证完成：${status.evidence?.discoveryFitScore ?? '-'} → ${status.evidence?.verifiedFitScore ?? '-'}`,
                'business_approval',
                `${status.evidence?.metrics.nodeCount ?? 0} 节点 · ${status.evidence?.metrics.edgeCount ?? 0} 关系 · graph-evidence.json`,
              )
              await launchTraeCode(task)
            } else if (status.state === 'failed') {
              set({ codeGraphTransitioning: true })
              appendEvent(
                'technology.codegraph.failed',
                'CodeGraph 验证失败，保留技术发现结果并继续',
                'business_approval',
                status.message,
                'warning',
              )
              await launchTraeCode(task)
            }
          } catch (error) {
            set({ codeGraphTransitioning: true })
            appendEvent(
              'technology.codegraph.status_error',
              'CodeGraph 状态读取失败，继续独立开发',
              'business_approval',
              error instanceof Error ? error.message : String(error),
              'warning',
            )
            await launchTraeCode(task)
          }
        },
        pauseOrResume: () => {
          const task = get().task
          if (!task || task.status === 'waiting_approval' || task.status === 'completed') return
          const paused = task.status === 'paused'
          set({ task: { ...task, status: paused ? 'running' : 'paused' } })
          if (task.currentStage === 'traework_analysis' || task.currentStage === 'trae_spec') {
            void invoke('supervisor_control', {
              taskId: `${task.workspacePath}:${task.currentStage}`,
              action: paused ? 'resume' : 'pause',
            })
          }
          appendEvent(
            paused ? 'task.resumed' : 'task.paused',
            paused ? '任务已恢复' : '任务已暂停',
            task.currentStage,
          )
        },
      }
    },
    {
      name: 'delivery-pilot-task-v9',
      partialize: (state) => ({
        task: state.task,
        events: state.events,
        view: state.view,
        selectedStage: state.selectedStage,
        externalRun: state.externalRun,
        externalStatus: state.externalStatus,
        externalError: state.externalError,
        technologyRun: state.technologyRun,
        technologyStatus: state.technologyStatus,
        technologyTransitioning: state.technologyTransitioning,
        codeGraphStatus: state.codeGraphStatus,
        codeGraphTransitioning: state.codeGraphTransitioning,
        submissionStatus: state.submissionStatus,
      }),
    },
  ),
)
