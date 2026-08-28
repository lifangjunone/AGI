import { describe, expect, it } from 'vitest'
import type { DeliveryTask } from '../domain/types'
import { promptForTask } from './deliveryStore'
import { createSquadSnapshot, defaultEmployees } from './workforceStore'

describe('digital workforce', () => {
  it('ships a complete default delivery team', () => {
    expect(defaultEmployees).toHaveLength(5)
    expect(new Set(defaultEmployees.map((employee) => employee.runtime))).toEqual(new Set([
      'supervisor',
      'trae_work',
      'technology_exploration',
      'trae_code',
    ]))
    expect(defaultEmployees.every((employee) => employee.status === 'active')).toBe(true)
  })

  it('creates an immutable project squad snapshot', () => {
    const source = defaultEmployees.map((employee) => ({
      ...employee,
      capabilities: [...employee.capabilities],
      stages: [...employee.stages],
    }))
    const snapshot = createSquadSnapshot(
      source,
      source.map((employee) => employee.id),
      '设备检修工单',
    )
    source[0].name = '后来修改的名字'
    source[0].capabilities.push('后来增加的能力')

    expect(snapshot.name).toBe('设备检修工单自主交付小队')
    expect(snapshot.members[0].name).toBe('林航')
    expect(snapshot.members[0].capabilities).not.toContain('后来增加的能力')
    expect(snapshot.leaderId).toBe('builtin-delivery-lead')
  })

  it('binds the responsible employee and handoff contract into the real prompt', () => {
    const squad = createSquadSnapshot(
      defaultEmployees,
      defaultEmployees.map((employee) => employee.id),
      '交付项目',
    )
    const task: DeliveryTask = {
      id: 'task-1',
      projectId: 'project-1',
      name: '交付项目',
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
        path: '/tmp/requirements.pdf',
      },
      deliverySquad: squad,
      workspacePath: '/tmp/project',
      currentStage: 'traework_analysis',
      createdAt: '2026-08-17T00:00:00Z',
      updatedAt: '2026-08-17T00:00:00Z',
    }

    const requirement = promptForTask(task, 'traework_analysis', 'base requirement')
    const engineering = promptForTask(task, 'trae_spec', 'base engineering')
    expect(requirement).toContain('沈研（需求分析师）')
    expect(engineering).toContain('程筑（研发工程师）')
    expect(requirement).toContain('数字员工交接')
    expect(requirement).toContain('林航（交付队长）')
  })
})
