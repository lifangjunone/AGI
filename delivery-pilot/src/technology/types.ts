export type Domain = {
  id: string
  name: string
  icon: string
  description: string
  keywords: string[]
}

export type TechnologyMatch = {
  name: string
  fullName: string
  description: string
  url: string
  language: string
  stars: number
  forks: number
  openIssues: number
  updatedAt: string
  license: string
  topics: string[]
  score: number
  breakdown: {
    relevance: number
    popularity: number
    activity: number
    health: number
  }
  matchedReasons: string[]
  source: string
}

export type MatchResponse = {
  query: string
  domain: string
  generatedAt: string
  realtime: boolean
  results: TechnologyMatch[]
  notice?: string
}

export type SolutionComponent = {
  role: string
  technology: TechnologyMatch
  responsibility: string
}

export type ArchitectureNode = {
  id: string
  label: string
  kind: string
  detail: string
  column: number
}

export type ArchitectureEdge = {
  from: string
  to: string
  label: string
}

export type SolutionResponse = {
  title: string
  summary: string
  domain: string
  confidence: number
  components: SolutionComponent[]
  phases: string[]
  risks: string[]
  nodes: ArchitectureNode[]
  edges: ArchitectureEdge[]
  generatedAt: string
  realtime: boolean
}

export type TrendItem = {
  title: string
  description: string
  url: string
  source: string
  heat: number
  signal: string
  publishedAt: string
  tags: string[]
}

export type TrendResponse = {
  scope: string
  generatedAt: string
  realtime: boolean
  items: TrendItem[]
  notice?: string
}

export type ApiStatus = {
  online: boolean
  baseUrl: string
  version: string
}

export type DataSourceView = {
  id: string
  name: string
  kind: 'builtin' | 'technology_exploration' | 'http'
  enabled: boolean
  priority: number
  capabilities: string[]
  location: string
  apiKeyConfigured: boolean
  locked: boolean
}

export type DataSourceInput = Omit<DataSourceView, 'apiKeyConfigured' | 'locked'> & {
  apiKey: string
}

export type SourceTestResult = {
  id: string
  ok: boolean
  message: string
  itemCount: number
  checkedAt: string
}
