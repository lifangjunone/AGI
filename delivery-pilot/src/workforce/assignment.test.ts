import { describe, expect, it } from 'vitest'
import type { DeliveryTask, TaskEvent } from '../domain/types'
import { createSquadSnapshot, defaultEmployees } from '../stores/workforceStore'
import { currentEmployee, employeeForEvent, employeeForStage } from './assignment'

const squad = createSquadSnapshot(
  defaultEmployees,
  defaultEmployees.map((employee) => employee.id),
  '测试项目',
)

const task: DeliveryTask = {
  id: 'task-1',
  projectId: 'project-1',
  name: '测试项目',
  version: 1,
  versionLabel: 'v1',
  mode: 'unattended',
  viewPreference: 'executive',
  status: 'running',
  sourceDocument: {
    id: 'doc-1',
    name: 'requirements.pdf',
    mediaType: 'application/pdf',
    byteSize: 1,
    sha256: 'abc',
  },
  deliverySquad: squad,
  workspacePath: '/tmp/project',
  currentStage: 'trae_spec',
  createdAt: '2026-08-17T00:00:00Z',
  updatedAt: '2026-08-17T00:00:00Z',
}

function event(type: string, stage: TaskEvent['stage']): TaskEvent {
  return {
    id: type,
    taskId: task.id,
    sequence: 1,
    timestamp: '2026-08-17T00:00:00Z',
    type,
    level: 'info',
    summary: type,
    stage,
  }
}

describe('employee assignment', () => {
  it('maps core delivery stages to visible employee owners', () => {
    expect(employeeForStage(squad.members, 'traework_analysis')?.title).toBe('需求分析师')
    expect(employeeForStage(squad.members, 'trae_spec')?.title).toBe('研发工程师')
    expect(employeeForStage(squad.members, 'playwright')?.title).toBe('质量工程师')
  })

  it('lets event semantics override a shared stage', () => {
    expect(employeeForEvent(
      squad.members,
      event('technology.codegraph.started', 'business_approval'),
    )?.title).toBe('技术侦察员')
    expect(employeeForEvent(
      squad.members,
      event('traecode.prompt.sent', 'trae_spec'),
    )?.title).toBe('研发工程师')
  })

  it('ignores an unrelated latest history event when selecting the current employee', () => {
    const events = [
      event('traecode.prompt.sent', 'trae_spec'),
      event('history.version.opened', 'document_intake'),
    ]
    expect(currentEmployee(task, events)?.title).toBe('研发工程师')
  })
})
