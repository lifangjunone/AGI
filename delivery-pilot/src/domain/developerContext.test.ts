import { describe, expect, it } from 'vitest'
import {
  artifactBelongsToStage,
  defaultTabForStage,
  dependencyForStage,
  tabsForStage,
} from './developerContext'

describe('developer stage context', () => {
  it('only exposes graph where it belongs', () => {
    expect(tabsForStage('trae_spec', true)).toContain('graph')
    expect(tabsForStage('implementation', true)).not.toContain('graph')
    expect(tabsForStage('playwright', true)).not.toContain('graph')
  })

  it('opens automation acceptance on its most useful view', () => {
    expect(defaultTabForStage('playwright')).toBe('trace')
    expect(tabsForStage('playwright', false)).toEqual([
      'conversation',
      'events',
      'artifacts',
      'evidence',
      'trace',
    ])
  })

  it('maps artifacts to actual delivery stages', () => {
    expect(artifactBelongsToStage('requirement', 'traework_analysis')).toBe(true)
    expect(artifactBelongsToStage('test-report', 'playwright')).toBe(true)
    expect(artifactBelongsToStage('test-report', 'trae_spec')).toBe(false)
    expect(artifactBelongsToStage('application', 'acceptance')).toBe(true)
  })

  it('forms one explicit evidence dependency chain', () => {
    expect(dependencyForStage('document_intake').predecessor).toBeNull()
    expect(dependencyForStage('implementation')).toEqual({
      predecessor: 'spec_approval',
      evidence: '批准方案',
    })
    expect(dependencyForStage('acceptance').predecessor).toBe('k8s_deployment')
  })
})
