import type { StageName, TaskStatus } from './types'

export type AutomationTransition =
  | 'none'
  | 'launch_trae_code'
  | 'complete_delivery'

export function getAutomationTransition(input: {
  stage: StageName
  taskStatus: TaskStatus
  externalCompleted: boolean
}): AutomationTransition {
  if (input.taskStatus !== 'running' || !input.externalCompleted) return 'none'
  if (input.stage === 'traework_analysis') return 'launch_trae_code'
  if (input.stage === 'trae_spec') return 'complete_delivery'
  return 'none'
}
