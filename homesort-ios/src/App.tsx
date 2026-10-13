import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Download,
  FolderOpen,
  Grid2X2,
  Layers3,
  LayoutGrid,
  ListChecks,
  LoaderCircle,
  RotateCcw,
  ScanLine,
  Sparkles,
  X,
} from 'lucide-react'

type Strategy = 'frequency' | 'scene' | 'minimal'
type Stage = 'idle' | 'scanning' | 'ready'
type View = 'layout' | 'folders' | 'execute'

type AppItem = {
  name: string
  glyph: string
  color: string
  category: string
}

const apps: AppItem[] = [
  { name: '微信', glyph: '微', color: '#32b65b', category: '沟通' },
  { name: '相机', glyph: '◉', color: '#323237', category: '创作' },
  { name: '地图', glyph: '⌁', color: '#6e9d78', category: '出行' },
  { name: '音乐', glyph: '♫', color: '#eb4c6d', category: '娱乐' },
  { name: '飞书', glyph: '飞', color: '#3278f6', category: '工作' },
  { name: '日历', glyph: '29', color: '#f7f5ef', category: '效率' },
  { name: '小红书', glyph: 'RED', color: '#ff3040', category: '娱乐' },
  { name: '照片', glyph: '✣', color: '#f5f4ee', category: '创作' },
  { name: '备忘录', glyph: '≡', color: '#f3c844', category: '效率' },
  { name: '抖音', glyph: '♪', color: '#17171a', category: '娱乐' },
  { name: '银行', glyph: '¥', color: '#d94235', category: '生活' },
  { name: '健康', glyph: '♥', color: '#f6f5f1', category: '生活' },
  { name: '邮件', glyph: '✉', color: '#3482ee', category: '沟通' },
  { name: '天气', glyph: '☀', color: '#3e8de5', category: '生活' },
  { name: '播客', glyph: '◍', color: '#a75ad6', category: '娱乐' },
  { name: '设置', glyph: '⚙', color: '#7b7d82', category: '工具' },
]

const strategyCopy: Record<Strategy, { title: string; short: string; result: string }> = {
  frequency: { title: '顺手优先', short: '高频应用放进拇指区', result: '每天预计少滑 18 次' },
  scene: { title: '场景分区', short: '工作、生活、娱乐分开', result: '形成 4 个清晰场景' },
  minimal: { title: '极简首屏', short: '只留下每天必用应用', result: '首屏精简到 8 个应用' },
}

const categories: Record<string, AppItem[]> = {
  '工作效率': apps.filter((app) => ['工作', '效率'].includes(app.category)),
  '生活服务': apps.filter((app) => ['生活', '出行'].includes(app.category)),
  '影音娱乐': apps.filter((app) => app.category === '娱乐'),
  '创作工具': apps.filter((app) => ['创作', '工具'].includes(app.category)),
}

const navigation: { id: View; label: string; icon: typeof LayoutGrid }[] = [
  { id: 'layout', label: '方案', icon: LayoutGrid },
  { id: 'folders', label: '分组', icon: FolderOpen },
  { id: 'execute', label: '执行', icon: ListChecks },
]

function AppIcon({ app, compact = false }: { app: AppItem; compact?: boolean }) {
  return (
    <div className={`app-item ${compact ? 'compact' : ''}`}>
      <div className="app-icon" style={{ background: app.color }}>
        <span className={['#17171a', '#323237'].includes(app.color) ? 'light' : ''}>{app.glyph}</span>
      </div>
      {!compact && <small>{app.name}</small>}
    </div>
  )
}

function FolderIcon({ title, items, onOpen }: { title: string; items: AppItem[]; onOpen: () => void }) {
  return (
    <button className="folder-item" onClick={onOpen} aria-label={`查看${title}`}>
      <span className="folder-grid">
        {items.slice(0, 9).map((app) => (
          <span key={app.name} style={{ background: app.color }}>{app.glyph.slice(0, 1)}</span>
        ))}
      </span>
      <small>{title}</small>
    </button>
  )
}

function Phone({
  organized,
  page,
  onPageChange,
  onOpenFolder,
}: {
  organized: boolean
  page: number
  onPageChange: (page: number) => void
  onOpenFolder: (name: string) => void
}) {
  const unsortedPages = [apps.slice(0, 12), [...apps.slice(12), ...apps.slice(4, 12)]]
  const visibleApps = unsortedPages[page]

  return (
    <div className="phone-shell">
      <div className="phone-screen">
        <div className="dynamic-island" />
        <div className="phone-status"><span>9:41</span><span>● ︽ ▰</span></div>
        <div className="date-widget">
          <span>9月29日 星期二</span>
          <strong>{organized ? (page === 0 ? '专注工作' : '轻松生活') : '你的桌面'}</strong>
          <small>{organized ? '下一步，只做重要的事' : '应用散落在多个页面'}</small>
        </div>

        <div className={`phone-grid ${organized ? 'organized' : ''}`}>
          {organized ? (
            page === 0 ? (
              <>
                {apps.slice(0, 6).map((app) => <AppIcon key={app.name} app={app} />)}
                <FolderIcon title="工作效率" items={categories['工作效率']} onOpen={() => onOpenFolder('工作效率')} />
                <FolderIcon title="创作工具" items={categories['创作工具']} onOpen={() => onOpenFolder('创作工具')} />
              </>
            ) : (
              <>
                <FolderIcon title="生活服务" items={categories['生活服务']} onOpen={() => onOpenFolder('生活服务')} />
                <FolderIcon title="影音娱乐" items={categories['影音娱乐']} onOpen={() => onOpenFolder('影音娱乐')} />
                {apps.slice(8, 14).map((app) => <AppIcon key={app.name} app={app} />)}
              </>
            )
          ) : visibleApps.map((app, index) => <AppIcon key={`${app.name}-${index}`} app={app} />)}
        </div>

        <div className="page-dots" aria-label="桌面分页">
          {[0, 1].map((dot) => (
            <button
              key={dot}
              className={page === dot ? 'active' : ''}
              onClick={() => onPageChange(dot)}
              aria-label={`第 ${dot + 1} 页`}
            />
          ))}
        </div>
        <div className="phone-dock">
          {apps.slice(0, 4).map((app) => <AppIcon key={app.name} app={app} compact />)}
        </div>
        <div className="home-indicator" />
      </div>
    </div>
  )
}

function App() {
  const [strategy, setStrategy] = useState<Strategy>('frequency')
  const [stage, setStage] = useState<Stage>('idle')
  const [view, setView] = useState<View>('layout')
  const [page, setPage] = useState(0)
  const [showAfter, setShowAfter] = useState(false)
  const [folder, setFolder] = useState<string | null>(null)
  const [completedSteps, setCompletedSteps] = useState<number[]>([])
  const organized = stage === 'ready'

  useEffect(() => {
    if (stage !== 'scanning') return
    const timer = window.setTimeout(() => {
      setStage('ready')
      setShowAfter(true)
      setPage(0)
    }, 1200)
    return () => window.clearTimeout(timer)
  }, [stage])

  const stats = useMemo(() => {
    if (!organized) return [
      ['16', '示例应用'],
      ['5', '当前页面'],
      ['46', '秩序分'],
    ]
    return [
      ['2', '桌面页'],
      ['4', '文件夹'],
      ['92', '秩序分'],
    ]
  }, [organized])

  const startPlan = () => {
    if (organized) {
      setStage('idle')
      setShowAfter(false)
      setCompletedSteps([])
      return
    }
    setStage('scanning')
  }

  const exportPlan = () => {
    const lines = [
      'HomeSort iPhone 桌面整理方案',
      `策略：${strategyCopy[strategy].title}`,
      '',
      '第 1 页：微信、相机、地图、音乐、飞书、日历、工作效率、创作工具',
      '第 2 页：生活服务、影音娱乐、备忘录、抖音、银行、健康、邮件、天气',
      '',
      'iOS 不允许第三方应用直接移动桌面图标，请按应用内步骤手动执行。',
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'HomeSort-桌面整理方案.txt'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const goTo = (nextView: View) => {
    if (nextView !== 'layout' && !organized) return
    setView(nextView)
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setView('layout')} aria-label="返回方案">
          <span className="brand-mark"><Grid2X2 size={19} strokeWidth={2.4} /></span>
          <span>HomeSort</span>
        </button>
        <nav className="desktop-nav" aria-label="整理流程">
          {navigation.map((item, index) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                className={view === item.id ? 'active' : ''}
                disabled={item.id !== 'layout' && !organized}
                onClick={() => goTo(item.id)}
              >
                <span>{index + 1}</span>
                <Icon size={16} />
                {item.label}
              </button>
            )
          })}
        </nav>
        <span className="ios-badge">iPhone</span>
      </header>

      <div className="viewport">
        <section className={`view layout-view ${view === 'layout' ? 'active' : ''}`}>
          <div className="plan-panel">
            <div className="panel-heading">
              <span className="step-kicker">01 · 选择整理方式</span>
              <h1>先让桌面<br />符合你的习惯。</h1>
              <p>当前使用示例应用清单，尚未读取手机数据。</p>
            </div>

            <div className="strategy-control" role="radiogroup" aria-label="整理方式">
              {(Object.keys(strategyCopy) as Strategy[]).map((key) => (
                <button
                  key={key}
                  role="radio"
                  aria-checked={strategy === key}
                  className={strategy === key ? 'selected' : ''}
                  onClick={() => {
                    setStrategy(key)
                    if (organized) {
                      setStage('idle')
                      setShowAfter(false)
                    }
                  }}
                >
                  <span className="radio-mark">{strategy === key && <Check size={13} />}</span>
                  <strong>{strategyCopy[key].title}</strong>
                </button>
              ))}
            </div>
            <p className="strategy-description">{strategyCopy[strategy].short}</p>

            <div className="plan-summary" aria-live="polite">
              <div>
                <span>{organized ? '推荐结果' : '预计变化'}</span>
                <strong>{organized ? strategyCopy[strategy].result : '5 页整理为 2 页'}</strong>
              </div>
              <Layers3 size={19} />
            </div>

            <button
              className={`primary-action ${stage === 'scanning' ? 'loading' : ''}`}
              onClick={startPlan}
              disabled={stage === 'scanning'}
            >
              {stage === 'scanning' ? (
                <><LoaderCircle className="spin" size={19} /> 正在生成布局</>
              ) : organized ? (
                <><RotateCcw size={19} /> 重新选择方案</>
              ) : (
                <><Sparkles size={19} /> 生成整理方案 <ArrowRight size={19} /></>
              )}
            </button>
          </div>

          <div className="preview-panel">
            <div className="preview-toolbar">
              <div>
                <span className={`status-dot ${organized ? 'done' : ''}`} />
                <strong>{organized ? '方案已生成' : '示例布局'}</strong>
              </div>
              <div className="comparison-control">
                <button className={!showAfter ? 'active' : ''} onClick={() => setShowAfter(false)}>整理前</button>
                <button className={showAfter ? 'active' : ''} onClick={() => organized && setShowAfter(true)} disabled={!organized}>整理后</button>
              </div>
            </div>

            <div className="phone-stage">
              <button className="page-arrow left" onClick={() => setPage(0)} disabled={page === 0} aria-label="上一页">
                <ChevronLeft size={20} />
              </button>
              <Phone organized={organized && showAfter} page={page} onPageChange={setPage} onOpenFolder={setFolder} />
              <button className="page-arrow right" onClick={() => setPage(1)} disabled={page === 1} aria-label="下一页">
                <ChevronRight size={20} />
              </button>
              {stage === 'scanning' && (
                <div className="scan-overlay">
                  <ScanLine size={28} />
                  <strong>正在计算布局</strong>
                  <span>应用频率 · 拇指热区 · 场景分组</span>
                </div>
              )}
            </div>

            <div className="mobile-stats">
              {stats.map(([value, label]) => (
                <div key={label}><strong>{value}</strong><span>{label}</span></div>
              ))}
            </div>
            {organized && (
              <button className="next-action" onClick={() => setView('folders')}>
                查看 4 个推荐分组 <ArrowRight size={18} />
              </button>
            )}
          </div>
        </section>

        <section className={`view folders-view ${view === 'folders' ? 'active' : ''}`}>
          <div className="view-heading">
            <span className="step-kicker">02 · 确认应用分组</span>
            <h2>四个文件夹，<br />覆盖日常场景。</h2>
            <p>{strategyCopy[strategy].result}</p>
          </div>
          <div className="folder-board">
            {Object.entries(categories).map(([name, items], index) => (
              <button key={name} className="folder-card" onClick={() => setFolder(name)}>
                <span className="folder-number">0{index + 1}</span>
                <span className="large-folder">
                  {items.slice(0, 4).map((app) => <i key={app.name} style={{ background: app.color }} />)}
                </span>
                <span className="folder-copy">
                  <strong>{name}</strong>
                  <small>{items.map((app) => app.name).join(' · ')}</small>
                </span>
                <ChevronRight size={20} />
              </button>
            ))}
          </div>
          <div className="view-actions">
            <button className="secondary-action" onClick={() => setView('layout')}><ChevronLeft size={18} /> 返回方案</button>
            <button className="primary-action" onClick={() => setView('execute')}>开始执行 <ArrowRight size={18} /></button>
          </div>
        </section>

        <section className={`view execute-view ${view === 'execute' ? 'active' : ''}`}>
          <div className="execution-preview">
            <div className="score-ring">
              <strong>{Math.round((completedSteps.length / 3) * 100)}</strong>
              <span>%</span>
            </div>
            <span>执行进度</span>
            <h2>{completedSteps.length === 3 ? '桌面整理完成' : '照着方案，三步完成。'}</h2>
            <button className="export-button" onClick={exportPlan}><Download size={17} /> 导出方案</button>
          </div>

          <div className="checklist">
            {[
              ['进入编辑模式', '长按桌面空白处，等待图标轻晃。'],
              ['完成应用分组', '按推荐清单创建四个文件夹。'],
              ['收起多余页面', '保留两页，并检查 Dock 应用。'],
            ].map(([title, copy], index) => {
              const done = completedSteps.includes(index)
              return (
                <button
                  key={title}
                  className={done ? 'done' : ''}
                  onClick={() => setCompletedSteps((current) => (
                    done ? current.filter((item) => item !== index) : [...current, index]
                  ))}
                >
                  <span className="check-control">{done ? <Check size={18} /> : index + 1}</span>
                  <span><strong>{title}</strong><small>{copy}</small></span>
                  {done && <CircleCheck size={21} />}
                </button>
              )
            })}
            <p className="system-limit">iOS 不允许第三方 App 直接移动桌面图标，执行步骤需要由你确认。</p>
          </div>
        </section>
      </div>

      <nav className="mobile-tabbar" aria-label="整理流程">
        {navigation.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.id}
              className={view === item.id ? 'active' : ''}
              disabled={item.id !== 'layout' && !organized}
              onClick={() => goTo(item.id)}
            >
              <Icon size={20} />
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>

      {folder && (
        <div className="modal-backdrop" onClick={() => setFolder(null)}>
          <div className="folder-modal" onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setFolder(null)} aria-label="关闭"><X size={19} /></button>
            <span className="large-folder">
              {categories[folder].slice(0, 4).map((app) => <i key={app.name} style={{ background: app.color }} />)}
            </span>
            <h2>{folder}</h2>
            <p>{categories[folder].length} 个应用</p>
            <div className="folder-apps">
              {categories[folder].map((app) => <AppIcon key={app.name} app={app} />)}
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

export default App
