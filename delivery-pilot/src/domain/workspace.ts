const removableSuffixes = [
  '需求规格说明书',
  '需求说明书',
  '产品需求文档',
  '需求文档',
  '规格说明书',
  '设计说明书',
]

export function inferProjectName(documentName: string) {
  const withoutExtension = documentName.replace(/\.[^.]+$/, '').trim()
  const inferred = removableSuffixes.reduce(
    (name, suffix) => name.endsWith(suffix) ? name.slice(0, -suffix.length).trim() : name,
    withoutExtension,
  )
  return inferred || withoutExtension || '未命名项目'
}

export function inferFeatureName(documentName: string, projectName: string) {
  const withoutExtension = documentName.replace(/\.[^.]+$/, '').trim()
  const remainder = withoutExtension
    .replace(projectName, '')
    .replace(/需求规格说明书|需求说明书|产品需求文档|需求文档|规格说明书|设计说明书/g, '')
    .replace(/^[-_\s]+|[-_\s]+$/g, '')
  return remainder || '首版交付'
}

export function inferProjectNameFromText(content: string) {
  const firstMeaningfulLine = content
    .split(/\r?\n/)
    .map((line) => line.replace(/^#{1,6}\s*/, '').trim())
    .find(Boolean)
  if (!firstMeaningfulLine) return ''
  return firstMeaningfulLine
    .replace(/[：:。；;，,].*$/, '')
    .replace(/需求说明|需求描述|产品需求|需求文档$/, '')
    .trim()
    .slice(0, 30) || '文本需求项目'
}

export function inferFeatureNameFromText(content: string) {
  const normalized = content.replace(/\s+/g, '')
  const capabilities = [
    ['批量导入', '批量导入'],
    ['审批', '审批流程'],
    ['统一登录', '统一登录'],
    ['单点登录', '单点登录'],
    ['报表', '数据报表'],
    ['搜索', '智能搜索'],
    ['通知', '消息通知'],
    ['预警', '预警能力'],
    ['看板', '业务看板'],
  ] as const
  return capabilities.find(([keyword]) => normalized.includes(keyword))?.[1] ?? '首版交付'
}
