import { describe, expect, it } from 'vitest'
import { getExecutiveStages, getProgress, getStageProjection, nextStage } from './projection'
import type { DeliveryTask } from './types'

const task: DeliveryTask = {
  id: 'task-1',
  projectId: '测试交付',
  name: '测试交付',
  version: 1,
  versionLabel: 'v1-20260814-initial',
  mode: 'demo',
  viewPreference: 'executive',
  status: 'waiting_approval',
  sourceDocument: {
    id: 'document-1',
    name: 'requirement.docx',
    mediaType: 'application/docx',
    byteSize: 1024,
    sha256: 'abc',
  },
  workspacePath: '/tmp/workspace',
  currentStage: 'business_approval',
  createdAt: '2026-08-13T00:00:00.000Z',
  updatedAt: '2026-08-13T00:00:00.000Z',
}

describe('task projection', () => {
  it('projects completed and waiting stages from one task state', () => {
    const stages = getStageProjection(task, [])
    expect(stages.find((stage) => stage.id === 'document_intake')?.status).toBe('completed')
    expect(stages.find((stage) => stage.id === 'business_approval')?.status).toBe('waiting')
    expect(stages.find((stage) => stage.id === 'trae_spec')?.status).toBe('pending')
  })

  it('uses the same state for executive projection', () => {
    const stages = getExecutiveStages(task, [])
    expect(stages.find((stage) => stage.label === '需求输入')?.status).toBe('completed')
    expect(stages.find((stage) => stage.label === '需求确认')?.status).toBe('waiting')
  })

  it('advances stages without passing acceptance', () => {
    expect(nextStage('business_approval')).toBe('trae_spec')
    expect(nextStage('acceptance')).toBe('acceptance')
    expect(getProgress(task)).toBeGreaterThan(0)
  })

  it('projects every stage as completed after end-to-end delivery', () => {
    const completedTask: DeliveryTask = {
      ...task,
      status: 'completed',
      currentStage: 'acceptance',
    }

    expect(getStageProjection(completedTask, []).every((stage) => stage.status === 'completed')).toBe(true)
    expect(getExecutiveStages(completedTask, []).every((stage) => stage.status === 'completed')).toBe(true)
    expect(getProgress(completedTask)).toBe(100)
  })
})
