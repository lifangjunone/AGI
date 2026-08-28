export type ViewMode = 'executive' | 'developer'
export type AutomationMode = 'demo' | 'standard' | 'unattended'
export type TaskStatus =
  | 'draft'
  | 'preflight'
  | 'running'
  | 'waiting_approval'
  | 'paused'
  | 'failed'
  | 'cancelled'
  | 'completed'

export type StageName =
  | 'document_intake'
  | 'traework_analysis'
  | 'business_approval'
  | 'trae_spec'
  | 'spec_approval'
  | 'implementation'
  | 'unit_test'
  | 'playwright'
  | 'gitlab_pipeline'
  | 'k8s_deployment'
  | 'acceptance'

export type StageStatus = 'pending' | 'running' | 'waiting' | 'completed' | 'failed'
export type TechnologyTransport = 'computer_use' | 'provider_api'
export type TechnologyDepth = 'recommend' | 'verify' | 'code_graph'

export type TechnologyReferenceConfig = {
  enabled: boolean
  transport: TechnologyTransport
  depth: TechnologyDepth
  fallbackTransport: TechnologyTransport
  failurePolicy: 'continue_without_reference'
}

export type EmployeeRuntime =
  | 'supervisor'
  | 'trae_work'
  | 'technology_exploration'
  | 'codegraph'
  | 'trae_code'

export type DigitalEmployee = {
  id: string
  name: string
  title: string
  department: string
  summary: string
  avatarUrl: string
  status: 'active' | 'off_duty'
  builtIn: boolean
  runtime: EmployeeRuntime
  stages: StageName[]
  capabilities: string[]
  instructions: string
  createdAt: string
  updatedAt: string
}

export type DeliverySquadSnapshot = {
  id: string
  name: string
  memberIds: string[]
  leaderId: string
  members: DigitalEmployee[]
  createdAt: string
}

export type SourceDocument = {
  id: string
  name: string
  mediaType: string
  byteSize: number
  sha256: string
  path?: string
}

export type TaskEvent = {
  id: string
  taskId: string
  sequence: number
  timestamp: string
  type: string
  level: 'info' | 'warning' | 'error'
  summary: string
  stage: StageName
  detail?: string
}

export type DeliveryTask = {
  id: string
  projectId: string
  name: string
  version: number
  versionLabel: string
  mode: AutomationMode
  viewPreference: ViewMode
  status: TaskStatus
  sourceDocument: SourceDocument
  technologyReference?: TechnologyReferenceConfig
  deliverySquad?: DeliverySquadSnapshot
  workspacePath: string
  currentStage: StageName
  createdAt: string
  updatedAt: string
}

export type StageProjection = {
  id: StageName
  label: string
  executiveLabel: string
  status: StageStatus
  duration?: string
  retryCount: number
}

export const stageDefinitions: Omit<StageProjection, 'status' | 'retryCount'>[] = [
  { id: 'document_intake', label: '原始需求', executiveLabel: '需求输入' },
  { id: 'traework_analysis', label: '需求分析', executiveLabel: '需求分析' },
  { id: 'business_approval', label: '需求确认', executiveLabel: '需求确认' },
  { id: 'trae_spec', label: '研发方案', executiveLabel: '方案设计' },
  { id: 'spec_approval', label: '方案确认', executiveLabel: '方案设计' },
  { id: 'implementation', label: '功能开发', executiveLabel: '功能开发' },
  { id: 'unit_test', label: '代码质量检查', executiveLabel: '质量验证' },
  { id: 'playwright', label: '自动化业务验收', executiveLabel: '质量验证' },
  { id: 'gitlab_pipeline', label: '交付质量门禁', executiveLabel: '交付检查' },
  { id: 'k8s_deployment', label: '发布准备', executiveLabel: '发布准备' },
  { id: 'acceptance', label: '交付结果', executiveLabel: '交付结果' },
]
