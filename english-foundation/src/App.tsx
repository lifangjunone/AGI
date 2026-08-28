import { useEffect, useState } from 'react'
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Flame,
  Gauge,
  GraduationCap,
  Headphones,
  Home,
  Languages,
  LibraryBig,
  ListRestart,
  RotateCcw,
  Settings,
  Sparkles,
  Target,
  Volume2,
  X,
} from 'lucide-react'
import { grammarLessons, sentences, words } from './data'
import type { GrammarLesson } from './data'
import {
  dailyTaskIds,
  dailyCompletion,
  defaultProgress,
  markActivity,
  normalizeProgress,
  setWordState,
} from './progress'
import type { LearningProgress } from './progress'

type View = 'today' | 'words' | 'sentences' | 'grammar' | 'review'
const storageKey = 'foundation-learning-progress-v1'

function loadProgress(): LearningProgress {
  try {
    const saved = localStorage.getItem(storageKey)
    return normalizeProgress(saved ? JSON.parse(saved) : defaultProgress)
  } catch {
    return defaultProgress
  }
}

function speak(text: string, rate = 0.88) {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'en-US'
  utterance.rate = rate
  window.speechSynthesis.speak(utterance)
}

const navItems: { id: View; label: string; icon: typeof Home }[] = [
  { id: 'today', label: '今日学习', icon: Home },
  { id: 'words', label: '词汇', icon: LibraryBig },
  { id: 'sentences', label: '句子', icon: Languages },
  { id: 'grammar', label: '语法', icon: GraduationCap },
  { id: 'review', label: '复习', icon: ListRestart },
]

function App() {
  const [view, setView] = useState<View>('today')
  const [progress, setProgress] = useState(loadProgress)
  const [showSettings, setShowSettings] = useState(false)
  const [comfortable, setComfortable] = useState(false)

  useEffect(() => localStorage.setItem(storageKey, JSON.stringify(progress)), [progress])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey && event.shiftKey && event.key.toLowerCase() === 'd') {
        event.preventDefault()
        setComfortable((value) => !value)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const complete = (id: string, xp: number) =>
    setProgress((current) => markActivity(current, id, xp))

  return (
    <main className={comfortable ? 'app comfortable' : 'app'}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><BookOpen size={19} /></div>
          <div><strong>Foundation</strong><span>英语基础训练</span></div>
        </div>
        <nav aria-label="主导航">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              className={view === id ? 'nav-item active' : 'nav-item'}
              key={id}
              onClick={() => setView(id)}
            >
              <Icon size={18} strokeWidth={1.8} />
              <span>{label}</span>
              {id === 'review' && progress.reviewWords.length > 0 && (
                <b className="nav-count">{progress.reviewWords.length}</b>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        <div className="level-card">
          <div className="level-head"><span>基础进阶</span><b>A1 → A2</b></div>
          <div className="level-track"><i style={{ width: `${Math.min(100, 28 + progress.xp / 20)}%` }} /></div>
          <small>再获得 {Math.max(0, 600 - progress.xp)} XP 升级</small>
        </div>
        <button className="nav-item settings-button" onClick={() => setShowSettings(true)}>
          <Settings size={18} /><span>学习设置</span>
        </button>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="route-title">{navItems.find((item) => item.id === view)?.label}</div>
          <div className="top-stats">
            <div><Flame size={17} className="flame" /><strong>{progress.streak}</strong><span>天连续</span></div>
            <div><Sparkles size={17} className="spark" /><strong>{progress.xp}</strong><span>XP</span></div>
            <button className="avatar" aria-label="学习者资料">LF</button>
          </div>
        </header>
        <div className="content">
          {view === 'today' && <TodayView progress={progress} onNavigate={setView} />}
          {view === 'words' && (
            <WordView progress={progress} onProgress={setProgress} onComplete={complete} />
          )}
          {view === 'sentences' && <SentenceView onComplete={complete} />}
          {view === 'grammar' && (
            <GrammarView progress={progress} onProgress={setProgress} onComplete={complete} />
          )}
          {view === 'review' && (
            <ReviewView progress={progress} onNavigate={setView} onProgress={setProgress} />
          )}
        </div>
      </section>
      {showSettings && (
        <SettingsPanel
          comfortable={comfortable}
          onComfortable={setComfortable}
          onClose={() => setShowSettings(false)}
        />
      )}
    </main>
  )
}

function TodayView({
  progress,
  onNavigate,
}: {
  progress: LearningProgress
  onNavigate: (view: View) => void
}) {
  const percentage = dailyCompletion(progress)
  const completedTasks = dailyTaskIds.filter((id) => progress.completedToday.includes(id)).length
  const tasks = [
    { id: 'word-confident', title: '掌握 5 个核心词', detail: '音形义 · 例句 · 词族', time: '6 分钟', icon: LibraryBig, view: 'words' as View, tone: 'coral' },
    { id: 'sentence-daily-progress', title: '拆解一个实用句', detail: '语块排序 · 句型迁移', time: '5 分钟', icon: Languages, view: 'sentences' as View, tone: 'blue' },
    { id: 'grammar-present-simple', title: '攻克一般现在时', detail: '规则对比 · 即时练习', time: '7 分钟', icon: GraduationCap, view: 'grammar' as View, tone: 'green' },
  ]
  return (
    <>
      <section className="welcome">
        <div>
          <p className="eyebrow">FRIDAY · 28 AUGUST</p>
          <h1>下午好，今天把基础再夯实一点。</h1>
          <p>18 分钟，完成词汇、句子和语法的完整训练。</p>
        </div>
        <div className="daily-ring" style={{ '--progress': `${percentage * 3.6}deg` } as React.CSSProperties}>
          <div><strong>{percentage}%</strong><span>今日进度</span></div>
        </div>
      </section>

      <section className="today-grid">
        <div className="plan-panel">
          <div className="section-heading">
            <div><span className="section-index">01</span><h2>今日学习路径</h2></div>
            <span>{completedTasks}/3 已完成</span>
          </div>
          <div className="task-list">
            {tasks.map((task, index) => {
              const Icon = task.icon
              const done = progress.completedToday.includes(task.id)
              return (
                <button className={`task-row ${done ? 'done' : ''}`} key={task.id} onClick={() => onNavigate(task.view)}>
                  <span className="task-number">{done ? <Check size={17} /> : index + 1}</span>
                  <span className={`task-icon ${task.tone}`}><Icon size={20} /></span>
                  <span className="task-copy"><strong>{task.title}</strong><small>{task.detail}</small></span>
                  <span className="task-time">{done ? '已完成' : task.time}</span>
                  <ArrowRight size={17} />
                </button>
              )
            })}
          </div>
        </div>
        <aside className="insight-panel">
          <div className="section-heading"><div><span className="section-index">02</span><h2>学习洞察</h2></div></div>
          <div className="insight-main">
            <div className="mini-orbit"><Target size={22} /></div>
            <span>当前优先项</span>
            <strong>第三人称单数</strong>
            <p>你已掌握基本语序，下一步重点减少动词词尾遗漏。</p>
          </div>
          <div className="week-bars" aria-label="本周学习活跃度">
            {[62, 88, 42, 78, percentage, 0, 0].map((height, index) => (
              <div key={index}><i style={{ height: `${height}%` }} className={index === 4 ? 'current' : ''} /><span>{'一二三四五六日'[index]}</span></div>
            ))}
          </div>
        </aside>
      </section>
    </>
  )
}

function WordView({
  progress,
  onProgress,
  onComplete,
}: {
  progress: LearningProgress
  onProgress: (progress: LearningProgress) => void
  onComplete: (id: string, xp: number) => void
}) {
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const word = words[index]
  const choose = (state: 'mastered' | 'review') => {
    onProgress(setWordState(progress, word.id, state))
    onComplete(`word-${word.id}`, state === 'mastered' ? 12 : 6)
    if (index < words.length - 1) {
      setIndex(index + 1)
      setRevealed(false)
    }
  }
  return (
    <section className="lesson-shell">
      <LessonHeader
        eyebrow="VOCABULARY · CORE WORDS"
        title="先理解，再牢牢记住"
        description="用音标、词性、词族和真实语境建立完整词义。"
        current={index + 1}
        total={words.length}
      />
      <div className="word-layout">
        <div className="word-card">
          <div className="word-card-top">
            <span className="word-number">{String(index + 1).padStart(2, '0')}</span>
            <button className="sound-button" onClick={() => speak(word.word)} aria-label={`朗读 ${word.word}`} title="朗读单词">
              <Volume2 size={20} />
            </button>
          </div>
          <div className="word-core">
            <div className="word-label"><span>{word.part}</span><span>高频核心词</span></div>
            <h2>{word.word}</h2>
            <p className="phonetic">{word.phonetic}</p>
          </div>
          {!revealed ? (
            <button className="reveal-button" onClick={() => setRevealed(true)}>
              显示释义与例句 <ArrowRight size={17} />
            </button>
          ) : (
            <div className="word-details">
              <div><span>中文释义</span><strong>{word.meaning}</strong></div>
              <div><span>记忆线索</span><p>{word.memory}</p></div>
              <div className="family"><span>词族</span>{word.family.map((item) => <b key={item}>{item}</b>)}</div>
            </div>
          )}
        </div>
        <div className="example-panel">
          <span className="micro-label">CONTEXT · 真实语境</span>
          <blockquote>{word.example}</blockquote>
          <p>{word.exampleZh}</p>
          <button className="listen-row" onClick={() => speak(word.example, 0.82)}>
            <Headphones size={18} /><span>听完整例句</span><i>0.8×</i>
          </button>
          <div className="self-check">
            <span>这个词你记住了吗？</span>
            <div>
              <button className="secondary-action" onClick={() => choose('review')}><RotateCcw size={17} />还需复习</button>
              <button className="primary-action" onClick={() => choose('mastered')}><Check size={17} />已经掌握</button>
            </div>
          </div>
        </div>
      </div>
      <LessonPager index={index} total={words.length} onIndex={(next) => { setIndex(next); setRevealed(false) }} />
    </section>
  )
}

function SentenceView({ onComplete }: { onComplete: (id: string, xp: number) => void }) {
  const [index, setIndex] = useState(0)
  const [chosen, setChosen] = useState<string[]>([])
  const [result, setResult] = useState<'correct' | 'wrong' | null>(null)
  const sentence = sentences[index]
  const available = sentence.scramble.filter((part) => !chosen.includes(part))
  const check = () => {
    const assembled = chosen.join(' ').replace(' .', '.').replace(' ?', '?')
    const correct = assembled === sentence.text
    setResult(correct ? 'correct' : 'wrong')
    if (correct) onComplete(`sentence-${sentence.id}`, 18)
  }
  const move = (next: number) => {
    setIndex(next)
    setChosen([])
    setResult(null)
  }
  return (
    <section className="lesson-shell">
      <LessonHeader
        eyebrow="SENTENCE LAB · CHUNKING"
        title="看清句子骨架，才能自由表达"
        description="先理解语块功能，再把它们组合成自然英语。"
        current={index + 1}
        total={sentences.length}
      />
      <div className="sentence-stage">
        <div className="sentence-hero">
          <button className="sound-button" onClick={() => speak(sentence.text, 0.82)} aria-label="朗读句子"><Volume2 size={20} /></button>
          <p>{sentence.translation}</p>
          <h2>{sentence.text}</h2>
          <div className="pattern"><span>句型骨架</span><strong>{sentence.pattern}</strong><i>{sentence.scene}</i></div>
        </div>
        <div className="chunk-grid">
          {sentence.chunks.map((chunk) => (
            <div className={`chunk ${chunk.tone}`} key={chunk.text}>
              <span>{chunk.role}</span><strong>{chunk.text}</strong>
            </div>
          ))}
        </div>
        <div className="reorder-area">
          <div className="reorder-heading"><strong>重新组句</strong><span>按正确顺序点击语块</span></div>
          <div className="answer-line">
            {chosen.length === 0 && <span className="placeholder">你的句子会出现在这里</span>}
            {chosen.map((part) => <button key={part} onClick={() => { setChosen(chosen.filter((item) => item !== part)); setResult(null) }}>{part}</button>)}
          </div>
          <div className="word-bank">
            {available.map((part) => <button key={part} onClick={() => setChosen([...chosen, part])}>{part}</button>)}
          </div>
          <div className="check-row">
            {result && <Feedback result={result} text={result === 'correct' ? '语序正确，句子骨架已经掌握。' : '再看一眼上方语块：主语在前，时间状语可放在主语后。'} />}
            <button className="primary-action" disabled={available.length > 0} onClick={check}>检查答案 <ArrowRight size={17} /></button>
          </div>
        </div>
      </div>
      <LessonPager index={index} total={sentences.length} onIndex={move} />
    </section>
  )
}

function GrammarView({
  progress,
  onProgress,
  onComplete,
}: {
  progress: LearningProgress
  onProgress: (progress: LearningProgress) => void
  onComplete: (id: string, xp: number) => void
}) {
  const [index, setIndex] = useState(0)
  const [answer, setAnswer] = useState<number | null>(null)
  const lesson = grammarLessons[index]
  const chooseAnswer = (option: number) => {
    setAnswer(option)
    if (option === lesson.answer) {
      if (!progress.completedGrammar.includes(lesson.id)) {
        onProgress({ ...progress, completedGrammar: [...progress.completedGrammar, lesson.id] })
      }
      onComplete(`grammar-${lesson.id}`, 20)
    }
  }
  const move = (next: number) => { setIndex(next); setAnswer(null) }
  return (
    <section className="lesson-shell">
      <LessonHeader
        eyebrow="GRAMMAR · FOUNDATION"
        title="把规则变成表达习惯"
        description="通过最小对比理解规则，用即时练习确认掌握。"
        current={index + 1}
        total={grammarLessons.length}
      />
      <GrammarContent lesson={lesson} answer={answer} onAnswer={chooseAnswer} />
      <LessonPager index={index} total={grammarLessons.length} onIndex={move} />
    </section>
  )
}

function GrammarContent({
  lesson,
  answer,
  onAnswer,
}: {
  lesson: GrammarLesson
  answer: number | null
  onAnswer: (answer: number) => void
}) {
  return (
    <div className="grammar-layout">
      <section className="rule-panel">
        <span className="level-tag">{lesson.level}</span>
        <h2>{lesson.title}</h2>
        <p className="rule-subtitle">{lesson.subtitle}</p>
        <div className="rule-box"><span>核心规则</span><p>{lesson.rule}</p></div>
        <div className="contrast">
          <div className="wrong"><X size={17} /><span>{lesson.contrast.wrong}</span></div>
          <div className="right"><Check size={17} /><span>{lesson.contrast.right}</span></div>
          <p>{lesson.contrast.note}</p>
        </div>
      </section>
      <section className="quiz-panel">
        <span className="micro-label">QUICK CHECK · 即时检测</span>
        <h3>{lesson.question}</h3>
        <div className="options">
          {lesson.options.map((option, index) => {
            const selected = answer === index
            const correct = answer !== null && index === lesson.answer
            const wrong = selected && index !== lesson.answer
            return (
              <button
                key={option}
                className={`${selected ? 'selected' : ''} ${correct ? 'correct' : ''} ${wrong ? 'wrong' : ''}`}
                onClick={() => onAnswer(index)}
                disabled={answer !== null}
              >
                <i>{String.fromCharCode(65 + index)}</i><span>{option}</span>{correct && <Check size={18} />}{wrong && <X size={18} />}
              </button>
            )
          })}
        </div>
        {answer !== null && (
          <Feedback
            result={answer === lesson.answer ? 'correct' : 'wrong'}
            text={lesson.explanation}
          />
        )}
      </section>
    </div>
  )
}

function ReviewView({
  progress,
  onNavigate,
  onProgress,
}: {
  progress: LearningProgress
  onNavigate: (view: View) => void
  onProgress: (progress: LearningProgress) => void
}) {
  const reviewList = words.filter((word) => progress.reviewWords.includes(word.id))
  return (
    <section className="lesson-shell">
      <LessonHeader
        eyebrow="REVIEW · SPACED PRACTICE"
        title="复习真正薄弱的地方"
        description="系统只收集你主动标记的难点，掌握后即可移出。"
        current={reviewList.length}
        total={Math.max(reviewList.length, 1)}
      />
      {reviewList.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon"><Check size={30} /></div>
          <h2>当前没有待复习内容</h2>
          <p>学习词汇时选择“还需复习”，内容会自动汇集到这里。</p>
          <button className="primary-action" onClick={() => onNavigate('words')}>继续学习词汇 <ArrowRight size={17} /></button>
        </div>
      ) : (
        <div className="review-list">
          <div className="review-summary"><Gauge size={21} /><span>待巩固词汇</span><strong>{reviewList.length}</strong></div>
          {reviewList.map((word) => (
            <div className="review-row" key={word.id}>
              <button className="sound-button small" onClick={() => speak(word.word)} aria-label={`朗读 ${word.word}`}><Volume2 size={17} /></button>
              <div><strong>{word.word}</strong><span>{word.phonetic} · {word.part}</span></div>
              <p>{word.meaning}</p>
              <button className="secondary-action" onClick={() => onProgress(setWordState(progress, word.id, 'mastered'))}><Check size={16} />移出复习</button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function LessonHeader({
  eyebrow,
  title,
  description,
  current,
  total,
}: {
  eyebrow: string
  title: string
  description: string
  current: number
  total: number
}) {
  return (
    <header className="lesson-header">
      <div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>
      <div className="lesson-progress">
        <span><b>{current}</b> / {total}</span>
        <div><i style={{ width: `${Math.min(100, current / total * 100)}%` }} /></div>
      </div>
    </header>
  )
}

function LessonPager({ index, total, onIndex }: { index: number; total: number; onIndex: (index: number) => void }) {
  return (
    <div className="lesson-pager">
      <button disabled={index === 0} onClick={() => onIndex(index - 1)} aria-label="上一个"><ChevronLeft size={19} /></button>
      <span>{Array.from({ length: total }, (_, item) => <i className={item === index ? 'active' : ''} key={item} />)}</span>
      <button disabled={index === total - 1} onClick={() => onIndex(index + 1)} aria-label="下一个"><ChevronRight size={19} /></button>
    </div>
  )
}

function Feedback({ result, text }: { result: 'correct' | 'wrong'; text: string }) {
  return (
    <div className={`feedback ${result}`}>
      {result === 'correct' ? <Check size={18} /> : <CircleHelp size={18} />}
      <span>{text}</span>
    </div>
  )
}

function SettingsPanel({
  comfortable,
  onComfortable,
  onClose,
}: {
  comfortable: boolean
  onComfortable: (value: boolean) => void
  onClose: () => void
}) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="settings-panel" onMouseDown={(event) => event.stopPropagation()}>
        <header><div><span className="micro-label">PREFERENCES</span><h2>学习设置</h2></div><button onClick={onClose} aria-label="关闭"><X size={20} /></button></header>
        <div className="setting-row">
          <div><strong>舒适密度</strong><span>增大间距，适合长时间学习</span></div>
          <button role="switch" aria-checked={comfortable} className={comfortable ? 'toggle on' : 'toggle'} onClick={() => onComfortable(!comfortable)}><i /></button>
        </div>
        <div className="setting-note"><Sparkles size={18} /><p>所有学习进度仅保存在本机，不会上传到网络。</p></div>
      </section>
    </div>
  )
}

export default App
