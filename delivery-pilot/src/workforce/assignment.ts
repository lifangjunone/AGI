import type { DeliveryTask, DigitalEmployee, StageName, TaskEvent } from '../domain/types'
import { defaultEmployees } from '../stores/workforceStore'

export function deliveryMembers(task: DeliveryTask) {
  return task.deliverySquad?.members?.length ? task.deliverySquad.members : defaultEmployees
}
export function employeeForStage(members: DigitalEmployee[], stage: StageName) {
  if (stage === 'traework_analysis') {
    return members.find((employee) => employee.runtime === 'trae_work')
  }
  if (['unit_test', 'playwright', 'acceptance'].includes(stage)) {
    return members.find((employee) => employee.stages.includes('unit_test'))
      ?? members.find((employee) => employee.stages.includes(stage))
  }
  if (['trae_spec', 'implementation', 'gitlab_pipeline', 'k8s_deployment'].includes(stage)) {
    return members.find((employee) => employee.runtime === 'trae_code')
  }
  return members.find((employee) => employee.stages.includes(stage))
    ?? members.find((employee) => employee.runtime === 'supervisor')
    ?? members[0]
}

export function employeeForEvent(members: DigitalEmployee[], event: TaskEvent) {
  const type = event.type.toLowerCase()
  if (type.includes('technology') || type.includes('codegraph')) {
    return members.find((employee) => ['technology_exploration', 'codegraph'].includes(employee.runtime))
  }
  if (type.includes('traework')) {
    return members.find((employee) => employee.runtime === 'trae_work')
  }
  if (['test', 'playwright', 'junit', 'evidence', 'quality'].some((token) => type.includes(token))) {
    return members.find((employee) => employee.stages.includes('unit_test'))
  }
  if (type.includes('traecode')) {
    return members.find((employee) => employee.runtime === 'trae_code')
  }
  return employeeForStage(members, event.stage)
}

export function currentEmployee(task: DeliveryTask, events: TaskEvent[]) {
  const members = deliveryMembers(task)
  const latestCurrentStageEvent = events.findLast((event) => event.stage === task.currentStage)
  return latestCurrentStageEvent
    ? employeeForEvent(members, latestCurrentStageEvent)
    : employeeForStage(members, task.currentStage)
}
