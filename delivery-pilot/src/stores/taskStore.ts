import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { nextStage } from '../domain/projection'
import type { AutomationMode, DeliveryTask, SourceDocument, TaskEvent, ViewMode } from '../domain/types'

type TaskState = {
  task: DeliveryTask | null
  events: TaskEvent[]
  view: ViewMode
  selectedTab: 'events' | 'conversation' | 'artifacts' | 'evidence' | 'trace'
  isRunningMock: boolean
  createTask: (input: { name: string; mode: AutomationMode; workspacePath: string; document: SourceDocument }) => void
  startTask: () => Promise<void>
  submitApproval: (decision: 'approved' | 'rejected') => void
  setView: (view: ViewMode) => void
  setSelectedTab: (tab: TaskState['selectedTab']) => void
  pauseOrResume: () => void
  reset: () => void
}

const wait = (duration: number) => new Promise((resolve) => window.setTimeout(resolve, duration))

export async function fileToDocument(file: File): Promise<SourceDocument> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  return {
    id: crypto.randomUUID(),
    name: file.name,
    mediaType: file.type || 'application/octet-stream',
    byteSize: file.size,
    sha256,
  }
}

export const useTaskStore = create<TaskState>()(
  persist(
    (set, get) => {
      const appendEvent = (
        type: string,
        summary: string,
        stage: TaskEvent['stage'],
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

      return {
        task: null,
        events: [],
        view: 'executive',
        selectedTab: 'events',
        isRunningMock: false,
        createTask: ({ name, mode, workspacePath, document }) => {
          const now = new Date().toISOString()
          const task: DeliveryTask = {
            id: crypto.randomUUID(),
            projectId: name,
            name,
            version: 1,
            versionLabel: 'v1-legacy',
            mode,
            viewPreference: 'executive',
            status: 'draft',
            sourceDocument: document,
            workspacePath,
            currentStage: 'document_intake',
            createdAt: now,
            updatedAt: now,
          }
          set({ task, events: [], view: 'executive' })
          appendEvent('task.created', '已创建交付任务', 'document_intake')
          appendEvent('document.selected', `已接收 ${document.name}`, 'document_intake', `sha-256 ${document.sha256}`)
        },
        startTask: async () => {
          const task = get().task
          if (!task || get().isRunningMock) return
          set({
            isRunningMock: true,
            task: { ...task, status: 'running', currentStage: 'document_intake', updatedAt: new Date().toISOString() },
          })
          appendEvent('document.parsed', '文档格式与完整性检查通过', 'document_intake', '已提取正文、表格和基础元数据')
          await wait(650)
          set((state) => state.task ? { task: { ...state.task, currentStage: 'traework_analysis' } } : state)
          appendEvent('app.launch.requested', '正在启动 TraeWork', 'traework_analysis')
          await wait(700)
          appendEvent('app.window.detected', '已识别 TraeWork 工作窗口', 'traework_analysis', 'bundle id: cn.trae.solo.app')
          await wait(650)
          appendEvent('traework.task.created', '已创建独立需求分析任务', 'traework_analysis')
          await wait(600)
          appendEvent('traework.attachment.added', 'AI 已读取客户需求原件', 'traework_analysis', task.sourceDocument.name)
          await wait(700)
          appendEvent('traework.prompt.sent', 'AI 正在提取业务目标、角色和规则', 'traework_analysis', 'requirement-analysis.v1')
          await wait(900)
          appendEvent('requirement.rule.extracted', '已识别 7 条业务规则', 'traework_analysis', '覆盖工单创建、流转、验收和审计')
          await wait(800)
          appendEvent('traework.response.completed', '需求分析完成', 'traework_analysis', '形成 7 条需求、7 条规则和 3 个待确认口径')
          set((state) => state.task ? {
            isRunningMock: false,
            task: {
              ...state.task,
              status: 'waiting_approval',
              currentStage: 'business_approval',
              updatedAt: new Date().toISOString(),
            },
          } : state)
          appendEvent('approval.required', '有 3 个业务口径需要确认', 'business_approval', '优先级、超时升级策略、验收关闭权限', 'warning')
        },
        submitApproval: (decision) => {
          const task = get().task
          if (!task || task.status !== 'waiting_approval') return
          if (decision === 'approved') {
            appendEvent('approval.approved', '业务口径已确认', task.currentStage)
            set((state) => state.task ? {
              task: {
                ...state.task,
                status: 'running',
                currentStage: nextStage(state.task.currentStage),
                updatedAt: new Date().toISOString(),
              },
            } : state)
            appendEvent('spec.generation.ready', '已准备进入 Trae Spec', 'trae_spec', '正在装配已确认需求、任务与质量检查清单')
          } else {
            appendEvent('approval.rejected', '业务确认已退回修改', task.currentStage, '保留本次分析记录并创建新的阶段运行', 'warning')
            set((state) => state.task ? {
              task: { ...state.task, status: 'paused', currentStage: 'traework_analysis' },
            } : state)
          }
        },
        setView: (view) => set((state) => ({
          view,
          task: state.task ? { ...state.task, viewPreference: view } : null,
        })),
        setSelectedTab: (selectedTab) => set({ selectedTab }),
        pauseOrResume: () => {
          const task = get().task
          if (!task || task.status === 'waiting_approval') return
          const paused = task.status === 'paused'
          set({ task: { ...task, status: paused ? 'running' : 'paused' } })
          appendEvent(paused ? 'task.resumed' : 'task.paused', paused ? '任务已恢复' : '任务已暂停', task.currentStage)
        },
        reset: () => set({ task: null, events: [], view: 'executive', isRunningMock: false }),
      }
    },
    {
      name: 'delivery-pilot-task',
      partialize: (state) => ({ task: state.task, events: state.events, view: state.view }),
    },
  ),
)
