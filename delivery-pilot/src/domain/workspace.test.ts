import { describe, expect, it } from 'vitest'
import {
  inferFeatureName,
  inferFeatureNameFromText,
  inferProjectName,
  inferProjectNameFromText,
} from './workspace'

describe('workspace naming', () => {
  it('derives a project name from the requirement document', () => {
    expect(inferProjectName('设备检修工单管理需求说明书.pdf')).toBe('设备检修工单管理')
    expect(inferProjectName('客户门户产品需求文档.docx')).toBe('客户门户')
  })

  it('keeps meaningful names and derives an iteration feature', () => {
    expect(inferProjectName('库存预警-v2-批量导入.md')).toBe('库存预警-v2-批量导入')
    expect(inferFeatureName('库存预警-v2-批量导入.md', '库存预警')).toBe('v2-批量导入')
    expect(inferFeatureName('设备检修工单管理需求说明书.pdf', '设备检修工单管理')).toBe('首版交付')
  })

  it('derives a concise project name from requirement text', () => {
    expect(inferProjectNameFromText('# 设备检修工单管理\n需要支持审批。')).toBe('设备检修工单管理')
    expect(inferProjectNameFromText('客户门户需求说明：支持统一登录')).toBe('客户门户')
    expect(inferProjectNameFromText('   \n')).toBe('')
  })

  it('recommends a concrete version feature from requirement text', () => {
    expect(inferFeatureNameFromText('需要支持工单创建和主管审批')).toBe('审批流程')
    expect(inferFeatureNameFromText('客户资料支持批量导入')).toBe('批量导入')
    expect(inferFeatureNameFromText('构建一个简单的新系统')).toBe('首版交付')
  })
})
