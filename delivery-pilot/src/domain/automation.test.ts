import { describe, expect, it } from 'vitest'
import { getAutomationTransition } from './automation'

describe('getAutomationTransition', () => {
  it('does not advance without externally verified completion', () => {
    expect(getAutomationTransition({
      stage: 'traework_analysis',
      taskStatus: 'running',
      externalCompleted: false,
    })).toBe('none')
  })

  it('launches Trae Code after Trae Work completion', () => {
    expect(getAutomationTransition({
      stage: 'traework_analysis',
      taskStatus: 'running',
      externalCompleted: true,
    })).toBe('launch_trae_code')
  })

  it('completes delivery after Trae Code completion', () => {
    expect(getAutomationTransition({
      stage: 'trae_spec',
      taskStatus: 'running',
      externalCompleted: true,
    })).toBe('complete_delivery')
  })

  it('does not relaunch after the task is paused or completed', () => {
    expect(getAutomationTransition({
      stage: 'traework_analysis',
      taskStatus: 'paused',
      externalCompleted: true,
    })).toBe('none')
    expect(getAutomationTransition({
      stage: 'trae_spec',
      taskStatus: 'completed',
      externalCompleted: true,
    })).toBe('none')
  })
})
