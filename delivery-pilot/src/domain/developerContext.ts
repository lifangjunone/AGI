import type { StageName } from './types'

export type DeveloperTab = 'conversation' | 'events' | 'artifacts' | 'evidence' | 'trace' | 'graph'

export const stageDependencies: Record<StageName, { predecessor: StageName | null; evidence: string }> = {
  document_intake: { predecessor: null, evidence: '客户需求' },
  traework_analysis: { predecessor: 'document_intake', evidence: '需求基线' },
  business_approval: { predecessor: 'traework_analysis', evidence: '分析结论' },
  trae_spec: { predecessor: 'business_approval', evidence: '确认口径' },
  spec_approval: { predecessor: 'trae_spec', evidence: '研发规格' },
  implementation: { predecessor: 'spec_approval', evidence: '批准方案' },
  unit_test: { predecessor: 'implementation', evidence: '功能代码' },
  playwright: { predecessor: 'unit_test', evidence: '质量结果' },
  gitlab_pipeline: { predecessor: 'playwright', evidence: '验收证据' },
  k8s_deployment: { predecessor: 'gitlab_pipeline', evidence: '门禁通过' },
  acceptance: { predecessor: 'k8s_deployment', evidence: '运行服务' },
}

export function dependencyForStage(stage: StageName) {
  return stageDependencies[stage]
}

const qualityStages: StageName[] = ['unit_test', 'playwright', 'gitlab_pipeline', 'acceptance']
const graphStages: StageName[] = ['business_approval', 'trae_spec', 'spec_approval']

export function tabsForStage(stage: StageName, hasGraph: boolean): DeveloperTab[] {
  const tabs: DeveloperTab[] = ['conversation', 'events', 'artifacts']
  if (qualityStages.includes(stage)) tabs.push('evidence', 'trace')
  if (hasGraph && graphStages.includes(stage)) tabs.push('graph')
  if (stage === 'k8s_deployment') tabs.push('evidence')
  return tabs
}

export function defaultTabForStage(stage: StageName): DeveloperTab {
  if (stage === 'playwright') return 'trace'
  return 'conversation'
}

const artifactStages: Record<string, StageName[]> = {
  requirement: ['traework_analysis', 'business_approval'],
  'technology-reference': ['business_approval', 'trae_spec'],
  codegraph: ['business_approval', 'trae_spec', 'spec_approval'],
  spec: ['trae_spec', 'spec_approval'],
  tasks: ['trae_spec', 'implementation'],
  checklist: ['spec_approval', 'unit_test', 'gitlab_pipeline'],
  'test-cases': ['unit_test', 'playwright'],
  'test-report': ['playwright', 'acceptance'],
  junit: ['unit_test', 'playwright', 'gitlab_pipeline', 'acceptance'],
  application: ['k8s_deployment', 'acceptance'],
  delivery: ['gitlab_pipeline', 'k8s_deployment', 'acceptance'],
}

export function artifactBelongsToStage(artifactId: string, stage: StageName) {
  return artifactStages[artifactId]?.includes(stage) ?? false
}

export function stageInput(stage: StageName) {
  const inputs: Record<StageName, string> = {
    document_intake: '客户原始需求文档',
    traework_analysis: '原始需求与文档指纹',
    business_approval: '需求分析、业务规则与待确认项',
    trae_spec: '已确认需求与技术参考',
    spec_approval: '研发规格、任务清单与风险',
    implementation: '已确认研发规格与代码仓库',
    unit_test: '功能实现与质量检查规则',
    playwright: '可运行应用与业务测试用例',
    gitlab_pipeline: '测试结果、代码质量与交付清单',
    k8s_deployment: '通过门禁的生产构建',
    acceptance: '运行服务、测试报告与完整证据链',
  }
  return inputs[stage]
}

export function stageOutput(stage: StageName) {
  const outputs: Record<StageName, string> = {
    document_intake: '隔离工作区与不可变需求基线',
    traework_analysis: '需求分析报告',
    business_approval: '确认口径与技术采用决策',
    trae_spec: '研发规格与可执行任务',
    spec_approval: '批准后的实施基线',
    implementation: '功能代码与可运行构建',
    unit_test: '代码质量与单元验证结果',
    playwright: '自动化业务验收轨迹',
    gitlab_pipeline: '交付质量门禁结果',
    k8s_deployment: '可访问的本机运行服务',
    acceptance: '最终交付报告与追踪证据',
  }
  return outputs[stage]
}
