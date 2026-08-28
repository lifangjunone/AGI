import { stageDefinitions, type DeliveryTask, type StageName, type StageProjection, type TaskEvent } from './types'

const stageOrder = stageDefinitions.map((stage) => stage.id)

export function getStageProjection(task: DeliveryTask, events: TaskEvent[]): StageProjection[] {
  const currentIndex = stageOrder.indexOf(task.currentStage)

  return stageDefinitions.map((stage, index) => {
    let status: StageProjection['status'] = 'pending'
    if (index < currentIndex) status = 'completed'
    if (index === currentIndex) {
      status = task.status === 'completed'
        ? 'completed'
        : task.status === 'waiting_approval'
          ? 'waiting'
          : task.status === 'failed'
            ? 'failed'
            : 'running'
    }

    const retries = events.filter(
      (event) => event.stage === stage.id && event.type === 'stage.retry_requested',
    ).length

    return { ...stage, status, retryCount: retries }
  })
}

export function getProgress(task: DeliveryTask): number {
  const index = stageOrder.indexOf(task.currentStage)
  if (task.status === 'completed') return 100
  return Math.max(8, Math.round((index / (stageOrder.length - 1)) * 100))
}

export function getExecutiveStages(task: DeliveryTask, events: TaskEvent[]) {
  const projections = getStageProjection(task, events)
  const labels = [...new Set(stageDefinitions.map((stage) => stage.executiveLabel))]

  return labels.map((label) => {
    const stages = projections.filter((stage) => stage.executiveLabel === label)
    const hasActive = stages.some((stage) => ['running', 'waiting', 'failed'].includes(stage.status))
    const allComplete = stages.length > 0 && stages.every((stage) => stage.status === 'completed')
    return {
      id: stages[0].id,
      label,
      status: hasActive ? stages.find((stage) => stage.status !== 'completed')?.status ?? 'running' : allComplete ? 'completed' : 'pending',
    }
  })
}

export function nextStage(stage: StageName): StageName {
  const index = stageOrder.indexOf(stage)
  return stageOrder[Math.min(index + 1, stageOrder.length - 1)]
}
