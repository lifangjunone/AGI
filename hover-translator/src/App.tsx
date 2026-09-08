import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BookOpen,
  Check,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  Languages,
  Minus,
  MousePointer2,
  ScanText,
  Settings2,
  Sparkles,
  Volume2,
  X,
} from 'lucide-react'

const triggerLabels = {
  hover: '悬浮',
  selection: '划词',
  doubleClick: '双击',
  manual: '手动',
}

function ResultContent({ result, compact = false }: { result: TranslationResult; compact?: boolean }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(result.translation || '')
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  if (result.error) {
    return <div className="result-error">{result.error}</div>
  }

  return (
    <div className={compact ? 'result-content compact' : 'result-content'}>
      <div className="result-heading">
        <div>
          <div className="query-line">
            <strong>{result.query}</strong>
            {result.phonetic && <span className="phonetic">{result.phonetic}</span>}
            {result.isWord && (
              <button className="icon-button subtle" title="美式发音" onClick={() => window.translator.speak(result.query)}>
                <Volume2 size={15} />
              </button>
            )}
          </div>
          <div className="translation">{result.translation}</div>
        </div>
        <button className="icon-button subtle" title="复制译文" onClick={copy}>
          {copied ? <Check size={16} /> : <Copy size={16} />}
        </button>
      </div>

      {result.isWord && (
        <div className="word-details">
          <div className="detail-row">
            <span className="detail-label">{result.partOfSpeech}</span>
            <span>{result.definition || result.translation}</span>
          </div>
          {result.example && (
            <div className="detail-row">
              <span className="detail-label">例句</span>
              <span className="example-pair">
                <span>{result.example}</span>
                {result.exampleTranslation && (
                  <span className="example-translation">{result.exampleTranslation}</span>
                )}
              </span>
            </div>
          )}
          {result.root && (
            <div className="detail-row">
              <span className="detail-label">词根</span>
              <span>{result.root}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Overlay() {
  const [result, setResult] = useState<TranslationResult | null>(null)

  useEffect(() => window.translator.onTranslation(setResult), [])

  return (
    <main className="overlay-shell">
      <section className="overlay-card">
        <header className="overlay-header">
          <span className="trigger-badge">
            <ScanText size={13} />
            {result?.trigger ? triggerLabels[result.trigger] : '识别'}
          </span>
          <button className="icon-button subtle" title="关闭" onClick={window.translator.hideWindow}>
            <X size={16} />
          </button>
        </header>
        {result ? <ResultContent result={result} compact /> : <div className="result-loading">正在识别…</div>}
      </section>
    </main>
  )
}

function Pet() {
  const drag = useRef<{ pointerId: number; x: number; y: number; moved: boolean } | null>(null)
  const suppressClick = useRef(false)
  const [state, setState] = useState<AppState>({
    enabled: true,
    autoHideOnHoverLeave: false,
    nativeStatus: 'starting',
    petVisible: true,
    mainVisible: false,
  })

  useEffect(() => {
    window.translator.getState().then(setState)
    return window.translator.onState(setState)
  }, [])

  const unavailable =
    state.nativeStatus === 'permission-required' ||
    state.nativeStatus === 'input-monitoring-required' ||
    state.nativeStatus === 'error'

  return (
    <main
      className={`pet-shell ${state.enabled ? 'awake' : 'sleeping'}`}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        drag.current = {
          pointerId: event.pointerId,
          x: event.screenX,
          y: event.screenY,
          moved: false,
        }
        event.currentTarget.setPointerCapture(event.pointerId)
        window.translator.startPetDrag()
      }}
      onPointerMove={(event) => {
        const active = drag.current
        if (!active || active.pointerId !== event.pointerId) return
        const deltaX = event.screenX - active.x
        const deltaY = event.screenY - active.y
        if (Math.hypot(deltaX, deltaY) > 4) active.moved = true
        if (active.moved) window.translator.movePet(deltaX, deltaY)
      }}
      onPointerUp={(event) => {
        const active = drag.current
        if (!active || active.pointerId !== event.pointerId) return
        suppressClick.current = active.moved
        drag.current = null
        event.currentTarget.releasePointerCapture(event.pointerId)
        window.translator.endPetDrag()
      }}
      onPointerCancel={() => {
        drag.current = null
        window.translator.endPetDrag()
      }}
    >
      <div className="pet-drag-handle" title="拖动位置" />
      <button
        className="desktop-pet"
        aria-label={state.enabled ? '打开翻译台，取词已开启' : '打开翻译台，取词已暂停'}
        title="打开翻译台"
        onClick={() => {
          if (suppressClick.current) {
            suppressClick.current = false
            return
          }
          window.translator.toggleMainWindow()
        }}
        onContextMenu={(event) => {
          event.preventDefault()
          window.translator.showPetMenu()
        }}
      >
        <span className="pet-ear left" />
        <span className="pet-ear right" />
        <span className="pet-face">
          <span className="pet-eye left" />
          <span className="pet-eye right" />
          <span className="pet-nose" />
          <span className="pet-mouth" />
        </span>
        <span className="pet-language">A</span>
        <span className={`pet-status ${unavailable ? 'warning' : ''}`} />
      </button>
    </main>
  )
}

function MainWindow() {
  const [state, setState] = useState<AppState>({
    enabled: true,
    autoHideOnHoverLeave: false,
    nativeStatus: 'starting',
    petVisible: true,
    mainVisible: false,
  })
  const [input, setInput] = useState('Language connects people across cultures.')
  const [result, setResult] = useState<TranslationResult | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    window.translator.getState().then(setState)
    return window.translator.onState(setState)
  }, [])

  const status = useMemo(() => {
    if (state.nativeStatus === 'ready') return { label: '监听中', tone: 'ready' }
    if (state.nativeStatus === 'permission-required') return { label: '需要屏幕录制权限', tone: 'warning' }
    if (state.nativeStatus === 'input-monitoring-required') return { label: '需要输入监控权限', tone: 'warning' }
    if (state.nativeStatus === 'unsupported') return { label: '当前系统不支持', tone: 'warning' }
    if (state.nativeStatus === 'error' || state.nativeStatus === 'stopped') return { label: '监听器已停止', tone: 'warning' }
    return { label: '正在启动', tone: 'pending' }
  }, [state.nativeStatus])

  const runTranslation = async () => {
    if (!input.trim()) return
    setLoading(true)
    try {
      const translated = await window.translator.translate(input)
      setResult({ ...translated, trigger: 'manual' })
    } catch (error) {
      setResult({ query: input, error: error instanceof Error ? error.message : '翻译失败' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="app-shell">
      <header className="titlebar">
        <div className="brand">
          <span className="brand-mark"><Languages size={19} /></span>
          <span>Hover Translator</span>
        </div>
        <div className="window-actions">
          <button className="icon-button" title="最小化" onClick={window.translator.minimizeWindow}><Minus size={17} /></button>
          <button className="icon-button" title="隐藏到菜单栏" onClick={window.translator.hideWindow}><EyeOff size={17} /></button>
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <div className="status-block">
            <div className="status-line">
              <span className={`status-dot ${status.tone}`} />
              <span>{status.label}</span>
            </div>
            <button
              className={`power-switch ${state.enabled ? 'active' : ''}`}
              aria-pressed={state.enabled}
              onClick={() => window.translator.setEnabled(!state.enabled)}
            >
              {state.enabled ? <Eye size={17} /> : <EyeOff size={17} />}
              {state.enabled ? '取词已开启' : '取词已暂停'}
            </button>
            {(state.nativeStatus === 'permission-required' || state.nativeStatus === 'input-monitoring-required') && (
              <button className="permission-button" onClick={() => window.translator.openPermissions(state.nativeStatus)}>
                打开系统设置 <ChevronRight size={15} />
              </button>
            )}
          </div>

          <nav className="mode-list" aria-label="取词方式">
            <div className="mode-item active"><MousePointer2 size={17} /><span>悬浮取词</span><Check size={14} /></div>
            <div className="mode-item"><ScanText size={17} /><span>划词翻译</span><Check size={14} /></div>
            <div className="mode-item"><BookOpen size={17} /><span>双击查词</span><Check size={14} /></div>
          </nav>

          <div className="behavior-settings">
            <span className="settings-label">悬浮行为</span>
            <div className="setting-row">
              <span>离词自动关闭</span>
              <button
                className={`toggle-switch ${state.autoHideOnHoverLeave ? 'active' : ''}`}
                type="button"
                role="switch"
                aria-checked={state.autoHideOnHoverLeave}
                aria-label="鼠标离开单词后自动关闭翻译"
                onClick={() => window.translator.setAutoHideOnHoverLeave(!state.autoHideOnHoverLeave)}
              >
                <span />
              </button>
            </div>
          </div>

          <div className="shortcut">
            <Settings2 size={15} />
            <span>显示窗口</span>
            <kbd>⌘ ⇧ T</kbd>
          </div>
        </aside>

        <section className="content">
          <div className="content-heading">
            <div>
              <span className="eyebrow">TRANSLATION DESK</span>
              <h1>即时翻译</h1>
            </div>
            <span className="language-pair">EN <ChevronRight size={14} /> 中文</span>
          </div>

          <section className="composer">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') runTranslation()
              }}
              spellCheck
              aria-label="待翻译文字"
            />
            <div className="composer-footer">
              <span>{input.length} / 1200</span>
              <button className="translate-button" disabled={loading || !input.trim()} onClick={runTranslation}>
                <Sparkles size={16} />
                {loading ? '翻译中' : '翻译'}
              </button>
            </div>
          </section>

          <section className="result-panel">
            {result ? (
              <ResultContent result={result} />
            ) : (
              <div className="empty-result">
                <Languages size={28} />
                <span>译文将在这里显示</span>
              </div>
            )}
          </section>
        </section>
      </div>
    </main>
  )
}

export default function App() {
  const view = new URLSearchParams(window.location.search).get('view')
  if (view === 'overlay') return <Overlay />
  if (view === 'pet') return <Pet />
  return <MainWindow />
}
