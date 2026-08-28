import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  DeliverySquadSnapshot,
  DigitalEmployee,
  EmployeeRuntime,
  StageName,
} from '../domain/types'

const CREATED_AT = '2026-08-17T00:00:00.000Z'
const AVATAR_ENDPOINT = 'https://copilot-cn.bytedance.net/api/ide/v1/text_to_image'

function avatarUrl(prompt: string) {
  return `${AVATAR_ENDPOINT}?prompt=${encodeURIComponent(prompt)}&image_size=square`
}

export const runtimeLabels: Record<EmployeeRuntime, string> = {
  supervisor: 'DeliveryPilot Supervisor',
  trae_work: 'Trae Work',
  technology_exploration: 'Technology Exploration',
  codegraph: 'CodeGraph',
  trae_code: 'Trae Code',
}

export const defaultEmployees: DigitalEmployee[] = [
  {
    id: 'builtin-delivery-lead',
    name: '林航',
    title: '交付队长',
    department: '交付指挥',
    summary: '把业务目标拆成可执行阶段，协调成员交接，只把真正需要决策的问题交给你。',
    avatarUrl: avatarUrl('professional 2.5D cartoon portrait of a confident Chinese male AI delivery manager in his early 30s, navy technical jacket, subtle headset, calm expression, teal studio background, centered bust, premium enterprise software avatar, clean lighting, no text'),
    status: 'active',
    builtIn: true,
    runtime: 'supervisor',
    stages: ['document_intake', 'business_approval', 'spec_approval', 'acceptance'],
    capabilities: ['目标拆解', '任务调度', '风险决策', '交付验收'],
    instructions: '先确认目标和证据边界，再分派阶段；自动恢复未耗尽前不打扰用户。',
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  },
  {
    id: 'builtin-requirement-analyst',
    name: '沈研',
    title: '需求分析师',
    department: '业务分析',
    summary: '从原始材料中提取需求、业务规则、验收标准与待确认口径，不把推断冒充事实。',
    avatarUrl: avatarUrl('professional 2.5D cartoon portrait of a thoughtful Chinese female business analyst in her late 20s, short dark hair, light gray blazer, holding a digital notebook, coral studio background, centered bust, premium enterprise software avatar, clean lighting, no text'),
    status: 'active',
    builtIn: true,
    runtime: 'trae_work',
    stages: ['traework_analysis'],
    capabilities: ['需求提取', '业务规则', '验收标准', '歧义识别'],
    instructions: '所有结论追溯到原始需求，使用 REQ-* 和 BR-* 编号并显式标记推断。',
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  },
  {
    id: 'builtin-technology-scout',
    name: '唐拓',
    title: '技术侦察员',
    department: '技术情报',
    summary: '搜索热点与开源实现，核验许可证和代码结构，为研发提供可追溯而非跟风的技术建议。',
    avatarUrl: avatarUrl('professional 2.5D cartoon portrait of an energetic Chinese male technology researcher in his late 20s, olive utility overshirt, smart glasses, small radar tablet, golden yellow studio background, centered bust, premium enterprise software avatar, clean lighting, no text'),
    status: 'active',
    builtIn: true,
    runtime: 'technology_exploration',
    stages: ['trae_spec'],
    capabilities: ['开源匹配', '趋势研判', '许可证检查', '代码图谱'],
    instructions: '技术参考不阻断主交付；候选必须给出来源、匹配证据、许可证和采用风险。',
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  },
  {
    id: 'builtin-engineer',
    name: '程筑',
    title: '研发工程师',
    department: '产品研发',
    summary: '把已确认需求转成规格和可运行实现，遵循项目现有架构并实际执行构建验证。',
    avatarUrl: avatarUrl('professional 2.5D cartoon portrait of a focused Chinese female software engineer in her early 30s, dark green hoodie under structured jacket, subtle code terminal pin, cyan studio background, centered bust, premium enterprise software avatar, clean lighting, no text'),
    status: 'active',
    builtIn: true,
    runtime: 'trae_code',
    stages: ['trae_spec', 'implementation', 'gitlab_pipeline', 'k8s_deployment'],
    capabilities: ['研发规格', '功能开发', '缺陷修复', '构建发布'],
    instructions: '优先沿用代码库既有模式，所有完成声明必须对应真实文件、命令和结果。',
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  },
  {
    id: 'builtin-quality-engineer',
    name: '叶证',
    title: '质量工程师',
    department: '质量保障',
    summary: '围绕业务风险设计自动化验证，维护需求到证据的追踪链，并阻止虚假交付。',
    avatarUrl: avatarUrl('professional 2.5D cartoon portrait of a precise Chinese male quality engineer in his early 30s, burgundy overshirt, holding a compact test checklist tablet, muted red studio background, centered bust, premium enterprise software avatar, clean lighting, no text'),
    status: 'active',
    builtIn: true,
    runtime: 'trae_code',
    stages: ['unit_test', 'playwright', 'acceptance'],
    capabilities: ['自动化测试', '业务验收', '证据追踪', '质量门禁'],
    instructions: '按风险决定测试深度，区分已执行、未执行与失败，不允许用构建成功代替业务验收。',
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  },
]

type CreateEmployeeInput = {
  name: string
  title: string
  department: string
  summary: string
  runtime: EmployeeRuntime
  stages: StageName[]
  capabilities: string[]
  instructions: string
  appearance: string
}

type WorkforceState = {
  employees: DigitalEmployee[]
  createEmployee: (input: CreateEmployeeInput) => string
  updateEmployee: (id: string, patch: Partial<Omit<DigitalEmployee, 'id' | 'builtIn' | 'createdAt'>>) => void
  toggleEmployee: (id: string) => void
  removeEmployee: (id: string) => void
  buildSquadSnapshot: (memberIds: string[], projectName: string) => DeliverySquadSnapshot
}

function mergeDefaults(saved: DigitalEmployee[] | undefined) {
  const byId = new Map((saved ?? []).map((employee) => [employee.id, employee]))
  for (const employee of defaultEmployees) {
    if (!byId.has(employee.id)) byId.set(employee.id, employee)
  }
  return Array.from(byId.values())
}

export function createSquadSnapshot(
  employees: DigitalEmployee[],
  memberIds: string[],
  projectName: string,
): DeliverySquadSnapshot {
  const members = employees.filter((employee) => memberIds.includes(employee.id))
  const leader = members.find((employee) => employee.runtime === 'supervisor') ?? members[0]
  return {
    id: crypto.randomUUID(),
    name: `${projectName}自主交付小队`,
    memberIds: members.map((employee) => employee.id),
    leaderId: leader?.id ?? '',
    members: members.map((employee) => ({
      ...employee,
      stages: [...employee.stages],
      capabilities: [...employee.capabilities],
    })),
    createdAt: new Date().toISOString(),
  }
}

export const useWorkforceStore = create<WorkforceState>()(
  persist(
    (set, get) => ({
      employees: defaultEmployees,
      createEmployee: (input) => {
        const id = crypto.randomUUID()
        const now = new Date().toISOString()
        const appearance = input.appearance.trim() || `${input.title}, modern professional workwear`
        const employee: DigitalEmployee = {
          id,
          name: input.name.trim(),
          title: input.title.trim(),
          department: input.department.trim() || '自定义岗位',
          summary: input.summary.trim(),
          avatarUrl: avatarUrl(`professional 2.5D cartoon portrait of a Chinese digital employee, ${appearance}, centered bust, premium enterprise software avatar, clean solid studio background, no text`),
          status: 'active',
          builtIn: false,
          runtime: input.runtime,
          stages: input.stages,
          capabilities: input.capabilities.filter(Boolean),
          instructions: input.instructions.trim(),
          createdAt: now,
          updatedAt: now,
        }
        set((state) => ({ employees: [...state.employees, employee] }))
        return id
      },
      updateEmployee: (id, patch) => set((state) => ({
        employees: state.employees.map((employee) => employee.id === id
          ? { ...employee, ...patch, updatedAt: new Date().toISOString() }
          : employee),
      })),
      toggleEmployee: (id) => set((state) => ({
        employees: state.employees.map((employee) => employee.id === id
          ? {
              ...employee,
              status: employee.status === 'active' ? 'off_duty' : 'active',
              updatedAt: new Date().toISOString(),
            }
          : employee),
      })),
      removeEmployee: (id) => set((state) => ({
        employees: state.employees.filter((employee) => employee.id !== id || employee.builtIn),
      })),
      buildSquadSnapshot: (memberIds, projectName) => createSquadSnapshot(
        get().employees,
        memberIds,
        projectName,
      ),
    }),
    {
      name: 'delivery-pilot-workforce',
      version: 1,
      merge: (persisted, current) => {
        const saved = persisted as Partial<WorkforceState>
        return { ...current, ...saved, employees: mergeDefaults(saved.employees) }
      },
      partialize: (state) => ({ employees: state.employees }) as WorkforceState,
    },
  ),
)
