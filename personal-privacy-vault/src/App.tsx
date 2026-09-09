import {
  ArchiveRestore,
  Check,
  ChevronRight,
  Clipboard,
  Download,
  Eye,
  EyeOff,
  FileHeart,
  Fingerprint,
  Heart,
  KeyRound,
  LockKeyhole,
  LogOut,
  Menu,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createEnvelope,
  isVaultEnvelope,
  unlockEnvelope,
  updateEnvelope,
} from './crypto'
import { clearEnvelope, loadEnvelope, saveEnvelope } from './storage'
import {
  CATEGORIES,
  type Category,
  type VaultData,
  type VaultEntry,
  type VaultEnvelope,
  type VaultField,
} from './types'

type AppMode = 'loading' | 'setup' | 'locked' | 'unlocked'
type EntryDraft = Pick<VaultEntry, 'title' | 'category' | 'favorite' | 'notes' | 'fields'>

const EMPTY_VAULT: VaultData = {
  version: 1,
  entries: [],
  updatedAt: new Date(0).toISOString(),
}

const CATEGORY_META: Record<Category, { short: string; accent: string }> = {
  身份资料: { short: 'ID', accent: '#d8583c' },
  账号凭据: { short: 'KEY', accent: '#256d5b' },
  财务信息: { short: '¥', accent: '#a56a18' },
  医疗健康: { short: 'MED', accent: '#336b8b' },
  家庭档案: { short: 'HOME', accent: '#86604f' },
  私密笔记: { short: 'NOTE', accent: '#625a8e' },
}

const EMPTY_DRAFT: EntryDraft = {
  title: '',
  category: '身份资料',
  favorite: false,
  notes: '',
  fields: [{ id: crypto.randomUUID(), label: '字段名称', value: '', secret: false }],
}

function readableTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function PasswordField({
  value,
  onChange,
  placeholder,
  autoFocus,
  autoComplete = 'current-password',
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  autoFocus?: boolean
  autoComplete?: 'current-password' | 'new-password'
}) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="password-field">
      <input
        aria-label={placeholder}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type={visible ? 'text' : 'password'}
        value={value}
      />
      <button
        aria-label={visible ? '隐藏密码' : '显示密码'}
        className="icon-button quiet"
        onClick={() => setVisible((current) => !current)}
        title={visible ? '隐藏密码' : '显示密码'}
        type="button"
      >
        {visible ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  )
}

function ChangePasswordDialog({
  onClose,
  onChangePassword,
}: {
  onClose: () => void
  onChangePassword: (currentPassword: string, newPassword: string) => Promise<void>
}) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const valid = currentPassword.length > 0
    && newPassword.length >= 10
    && newPassword === confirmation
    && currentPassword !== newPassword

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!valid) return
    setBusy(true)
    setError('')
    try {
      await onChangePassword(currentPassword, newPassword)
      onClose()
    } catch {
      setError('当前主密码不正确，修改未生效。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form
        aria-labelledby="change-password-title"
        className="password-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={submit}
      >
        <header className="editor-header">
          <div>
            <p className="eyebrow">ROTATE ENCRYPTION KEY</p>
            <h2 id="change-password-title">修改主密码</h2>
          </div>
          <button aria-label="关闭" className="icon-button" onClick={onClose} title="关闭" type="button">
            <X size={20} />
          </button>
        </header>
        <div className="password-dialog-body">
          <p>验证当前密码后，系统会使用新盐值重新加密全部档案。</p>
          <PasswordField
            autoFocus
            onChange={setCurrentPassword}
            placeholder="当前主密码"
            value={currentPassword}
          />
          <PasswordField
            autoComplete="new-password"
            onChange={setNewPassword}
            placeholder="新主密码（至少 10 位）"
            value={newPassword}
          />
          <PasswordField
            autoComplete="new-password"
            onChange={setConfirmation}
            placeholder="再次输入新主密码"
            value={confirmation}
          />
          {newPassword && newPassword.length < 10 && (
            <div className="form-error">新主密码至少需要 10 位</div>
          )}
          {confirmation && newPassword !== confirmation && (
            <div className="form-error">两次输入的新密码不一致</div>
          )}
          {currentPassword && newPassword === currentPassword && (
            <div className="form-error">新密码不能与当前密码相同</div>
          )}
          {error && <div className="form-error" role="alert">{error}</div>}
        </div>
        <footer className="editor-footer">
          <button className="secondary-button" onClick={onClose} type="button">取消</button>
          <button className="primary-button compact" disabled={!valid || busy} type="submit">
            <KeyRound size={17} /> {busy ? '正在重加密…' : '确认修改'}
          </button>
        </footer>
      </form>
    </div>
  )
}

function Gate({
  mode,
  error,
  busy,
  onCreate,
  onUnlock,
  onImport,
  onReset,
  onOpenPasswordChange,
}: {
  mode: 'setup' | 'locked'
  error: string
  busy: boolean
  onCreate: (password: string) => Promise<void>
  onUnlock: (password: string) => Promise<void>
  onImport: (file: File) => Promise<void>
  onReset: () => Promise<void>
  onOpenPasswordChange: () => void
}) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (mode === 'setup') {
      if (password.length < 10 || password !== confirmation) return
      await onCreate(password)
    } else {
      await onUnlock(password)
    }
  }

  return (
    <main className="gate-shell">
      <section className="gate-copy" aria-labelledby="gate-title">
        <div className="brand-mark large"><Fingerprint size={30} /></div>
        <p className="eyebrow">LOCAL ENCRYPTED ARCHIVE</p>
        <h1 id="gate-title">隐匣</h1>
        <p className="gate-lead">只在这台设备保存，只由你的主密码打开。</p>
        <div className="security-notes">
          <span><ShieldCheck size={17} /> AES-256-GCM 加密</span>
          <span><LockKeyhole size={17} /> 无服务器、无账号、无追踪</span>
          <span><FileHeart size={17} /> 加密备份可由你自行保管</span>
        </div>
      </section>

      <form className="gate-panel" onSubmit={submit}>
        <div className="panel-number">{mode === 'setup' ? '01' : '∕∕'}</div>
        <h2>{mode === 'setup' ? '建立你的保险库' : '保险库已锁定'}</h2>
        <p>
          {mode === 'setup'
            ? '主密码无法找回。请使用至少 10 位、只属于此保险库的密码。'
            : '输入主密码，本地完成解密。'}
        </p>
        <PasswordField
          autoFocus
          onChange={setPassword}
          placeholder="主密码"
          value={password}
        />
        {mode === 'setup' && (
          <PasswordField
            onChange={setConfirmation}
            placeholder="再次输入主密码"
            value={confirmation}
          />
        )}
        {mode === 'setup' && password && (
          <div className={`password-rule ${password.length >= 10 ? 'valid' : ''}`}>
            {password.length >= 10 ? <Check size={15} /> : <X size={15} />}
            至少 10 位
          </div>
        )}
        {mode === 'setup' && confirmation && password !== confirmation && (
          <div className="form-error">两次输入的密码不一致</div>
        )}
        {error && <div className="form-error" role="alert">{error}</div>}
        <button
          className="primary-button"
          disabled={busy || !password || (mode === 'setup' && (password.length < 10 || password !== confirmation))}
          type="submit"
        >
          <KeyRound size={18} />
          {busy ? '正在处理…' : mode === 'setup' ? '创建并进入' : '解锁保险库'}
        </button>
        <label className="import-link">
          <Upload size={16} />
          从加密备份恢复
          <input
            accept=".pvault,application/json"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void onImport(file)
              event.target.value = ''
            }}
            ref={inputRef}
            type="file"
          />
        </label>
        {mode === 'locked' && (
          <div className="gate-secondary-actions">
            <button className="change-link" onClick={onOpenPasswordChange} type="button">
              <KeyRound size={15} /> 修改主密码
            </button>
            <button className="reset-link" onClick={() => void onReset()} type="button">
              <Trash2 size={15} /> 清除此设备的保险库
            </button>
          </div>
        )}
      </form>
      <div className="gate-index" aria-hidden="true">PRIVATE / 001</div>
    </main>
  )
}

function EntryEditor({
  initial,
  onClose,
  onSave,
}: {
  initial?: VaultEntry
  onClose: () => void
  onSave: (draft: EntryDraft) => void
}) {
  const [draft, setDraft] = useState<EntryDraft>(() => initial
    ? {
        title: initial.title,
        category: initial.category,
        favorite: initial.favorite,
        notes: initial.notes,
        fields: initial.fields,
      }
    : { ...EMPTY_DRAFT, fields: [{ ...EMPTY_DRAFT.fields[0], id: crypto.randomUUID() }] })

  const updateField = (id: string, patch: Partial<VaultField>) => {
    setDraft((current) => ({
      ...current,
      fields: current.fields.map((field) => field.id === id ? { ...field, ...patch } : field),
    }))
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form
        aria-labelledby="editor-title"
        className="editor"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault()
          if (draft.title.trim()) onSave({ ...draft, title: draft.title.trim() })
        }}
      >
        <header className="editor-header">
          <div>
            <p className="eyebrow">{initial ? 'EDIT RECORD' : 'NEW RECORD'}</p>
            <h2 id="editor-title">{initial ? '编辑记录' : '添加隐私记录'}</h2>
          </div>
          <button aria-label="关闭" className="icon-button" onClick={onClose} title="关闭" type="button">
            <X size={20} />
          </button>
        </header>

        <div className="editor-body">
          <label className="field-label">
            记录名称
            <input
              autoFocus
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              placeholder="例如：身份证、常用邮箱、医保资料"
              value={draft.title}
            />
          </label>
          <label className="field-label">
            分类
            <select
              onChange={(event) => setDraft({ ...draft, category: event.target.value as Category })}
              value={draft.category}
            >
              {CATEGORIES.map((category) => <option key={category}>{category}</option>)}
            </select>
          </label>

          <div className="fields-heading">
            <span>信息字段</span>
            <button
              className="text-button"
              onClick={() => setDraft({
                ...draft,
                fields: [...draft.fields, {
                  id: crypto.randomUUID(),
                  label: '',
                  value: '',
                  secret: false,
                }],
              })}
              type="button"
            >
              <Plus size={15} /> 添加字段
            </button>
          </div>

          <div className="custom-fields">
            {draft.fields.map((field) => (
              <div className="custom-field" key={field.id}>
                <input
                  aria-label="字段名称"
                  onChange={(event) => updateField(field.id, { label: event.target.value })}
                  placeholder="字段名称"
                  value={field.label}
                />
                <input
                  aria-label="字段内容"
                  onChange={(event) => updateField(field.id, { value: event.target.value })}
                  placeholder="字段内容"
                  type={field.secret ? 'password' : 'text'}
                  value={field.value}
                />
                <button
                  aria-label={field.secret ? '显示此字段' : '隐藏此字段'}
                  className={`icon-button field-action ${field.secret ? 'active' : ''}`}
                  onClick={() => updateField(field.id, { secret: !field.secret })}
                  title={field.secret ? '显示此字段' : '设为私密字段'}
                  type="button"
                >
                  {field.secret ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
                <button
                  aria-label="删除字段"
                  className="icon-button field-action"
                  disabled={draft.fields.length === 1}
                  onClick={() => setDraft({
                    ...draft,
                    fields: draft.fields.filter((item) => item.id !== field.id),
                  })}
                  title="删除字段"
                  type="button"
                >
                  <Trash2 size={17} />
                </button>
              </div>
            ))}
          </div>

          <label className="field-label">
            备注
            <textarea
              onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
              placeholder="补充说明，仅在解锁后可见"
              rows={4}
              value={draft.notes}
            />
          </label>
          <label className="favorite-toggle">
            <input
              checked={draft.favorite}
              onChange={(event) => setDraft({ ...draft, favorite: event.target.checked })}
              type="checkbox"
            />
            <Heart size={17} />
            标记为常用
          </label>
        </div>
        <footer className="editor-footer">
          <button className="secondary-button" onClick={onClose} type="button">取消</button>
          <button className="primary-button compact" disabled={!draft.title.trim()} type="submit">
            <Check size={17} /> 加密保存
          </button>
        </footer>
      </form>
    </div>
  )
}

function App() {
  const [mode, setMode] = useState<AppMode>('loading')
  const [envelope, setEnvelope] = useState<VaultEnvelope | null>(null)
  const [key, setKey] = useState<CryptoKey | null>(null)
  const [vault, setVault] = useState<VaultData>(EMPTY_VAULT)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<Category | '全部' | '常用'>('全部')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editing, setEditing] = useState<VaultEntry | 'new' | null>(null)
  const [changingPassword, setChangingPassword] = useState(false)
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [toast, setToast] = useState('')
  const inactivityTimer = useRef<number | null>(null)

  useEffect(() => {
    void loadEnvelope()
      .then((saved) => {
        setEnvelope(saved)
        setMode(saved ? 'locked' : 'setup')
      })
      .catch(() => {
        setError('无法读取本地存储，请检查浏览器隐私设置。')
        setMode('setup')
      })
  }, [])

  const lock = useCallback(() => {
    setKey(null)
    setVault(EMPTY_VAULT)
    setSelectedId(null)
    setRevealed(new Set())
    setEditing(null)
    setChangingPassword(false)
    setMode(envelope ? 'locked' : 'setup')
  }, [envelope])

  useEffect(() => {
    if (mode !== 'unlocked') return
    const reset = () => {
      if (inactivityTimer.current) window.clearTimeout(inactivityTimer.current)
      inactivityTimer.current = window.setTimeout(lock, 5 * 60 * 1000)
    }
    const events = ['pointerdown', 'keydown', 'scroll']
    events.forEach((event) => window.addEventListener(event, reset, { passive: true }))
    reset()
    return () => {
      events.forEach((event) => window.removeEventListener(event, reset))
      if (inactivityTimer.current) window.clearTimeout(inactivityTimer.current)
    }
  }, [lock, mode])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 2400)
    return () => window.clearTimeout(timer)
  }, [toast])

  const createVault = async (password: string) => {
    setBusy(true)
    setError('')
    try {
      const created = await createEnvelope(password, {
        ...EMPTY_VAULT,
        updatedAt: new Date().toISOString(),
      })
      await saveEnvelope(created.envelope)
      setEnvelope(created.envelope)
      setKey(created.key)
      setVault({ ...EMPTY_VAULT, updatedAt: created.envelope.updatedAt })
      setMode('unlocked')
    } catch {
      setError('创建失败，请确认浏览器允许本地存储。')
    } finally {
      setBusy(false)
    }
  }

  const unlock = async (password: string) => {
    if (!envelope) return
    setBusy(true)
    setError('')
    try {
      const unlocked = await unlockEnvelope(password, envelope)
      setKey(unlocked.key)
      setVault(unlocked.vault)
      setSelectedId(unlocked.vault.entries[0]?.id ?? null)
      setMode('unlocked')
    } catch {
      setError('主密码不正确，或备份文件已损坏。')
    } finally {
      setBusy(false)
    }
  }

  const persistVault = async (next: VaultData) => {
    if (!key || !envelope) return
    const timestamped = { ...next, updatedAt: new Date().toISOString() }
    const updated = await updateEnvelope(envelope, key, timestamped)
    await saveEnvelope(updated)
    setVault(timestamped)
    setEnvelope(updated)
  }

  const saveEntry = async (draft: EntryDraft) => {
    const now = new Date().toISOString()
    const entry: VaultEntry = editing && editing !== 'new'
      ? { ...editing, ...draft, updatedAt: now }
      : { ...draft, id: crypto.randomUUID(), createdAt: now, updatedAt: now }
    const entries = editing && editing !== 'new'
      ? vault.entries.map((item) => item.id === entry.id ? entry : item)
      : [entry, ...vault.entries]
    await persistVault({ ...vault, entries })
    setSelectedId(entry.id)
    setEditing(null)
    setToast('已加密保存')
  }

  const deleteEntry = async (entry: VaultEntry) => {
    if (!window.confirm(`确认删除“${entry.title}”？此操作无法撤销。`)) return
    const entries = vault.entries.filter((item) => item.id !== entry.id)
    await persistVault({ ...vault, entries })
    setSelectedId(entries[0]?.id ?? null)
    setToast('记录已删除')
  }

  const importBackup = async (file: File) => {
    setError('')
    try {
      const imported = JSON.parse(await file.text()) as unknown
      if (!isVaultEnvelope(imported)) throw new Error('INVALID_BACKUP')
      if (envelope && !window.confirm('恢复备份会替换当前保险库。确认继续？')) return
      await saveEnvelope(imported)
      setKey(null)
      setVault(EMPTY_VAULT)
      setSelectedId(null)
      setRevealed(new Set())
      setEnvelope(imported)
      setMode('locked')
      setToast('备份已载入，请用原主密码解锁')
    } catch {
      setError('无法识别此备份文件。')
    }
  }

  const resetVault = async () => {
    if (!window.confirm('这会永久删除此设备上的保险库。请确认你已保存所需备份。')) return
    await clearEnvelope()
    setEnvelope(null)
    setKey(null)
    setVault(EMPTY_VAULT)
    setSelectedId(null)
    setRevealed(new Set())
    setError('')
    setMode('setup')
  }

  const changePassword = async (currentPassword: string, newPassword: string) => {
    if (!envelope) throw new Error('MISSING_VAULT')
    const verified = await unlockEnvelope(currentPassword, envelope)
    const rotated = await createEnvelope(newPassword, verified.vault)
    await saveEnvelope(rotated.envelope)
    setEnvelope(rotated.envelope)
    if (mode === 'unlocked') {
      setKey(rotated.key)
      setVault(verified.vault)
    } else {
      setKey(null)
      setVault(EMPTY_VAULT)
    }
    setToast('主密码已修改，保险库已重新加密')
  }

  const exportBackup = () => {
    if (!envelope) return
    const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' })
    const anchor = document.createElement('a')
    anchor.href = URL.createObjectURL(blob)
    anchor.download = `隐匣备份-${new Date().toISOString().slice(0, 10)}.pvault`
    anchor.click()
    URL.revokeObjectURL(anchor.href)
    setToast('加密备份已导出')
  }

  const filteredEntries = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    return vault.entries
      .filter((entry) => category === '全部'
        || (category === '常用' ? entry.favorite : entry.category === category))
      .filter((entry) => !normalized || [
        entry.title,
        entry.category,
        entry.notes,
        ...entry.fields.flatMap((field) => [field.label, field.value]),
      ].some((value) => value.toLocaleLowerCase().includes(normalized)))
      .sort((a, b) => Number(b.favorite) - Number(a.favorite)
        || b.updatedAt.localeCompare(a.updatedAt))
  }, [category, query, vault.entries])

  const selected = vault.entries.find((entry) => entry.id === selectedId)
    ?? filteredEntries[0]
    ?? null

  const copyValue = async (value: string) => {
    await navigator.clipboard.writeText(value)
    setToast('已复制到剪贴板')
  }

  if (mode === 'loading') {
    return <main className="loading-screen"><div className="brand-mark large"><Fingerprint size={30} /></div></main>
  }

  if (mode === 'setup' || mode === 'locked') {
    return (
      <>
        <Gate
          busy={busy}
          error={error}
          mode={mode}
          onCreate={createVault}
          onImport={importBackup}
          onOpenPasswordChange={() => setChangingPassword(true)}
          onReset={resetVault}
          onUnlock={unlock}
        />
        {changingPassword && mode === 'locked' && (
          <ChangePasswordDialog
            onChangePassword={changePassword}
            onClose={() => setChangingPassword(false)}
          />
        )}
        {toast && <div className="toast">{toast}</div>}
      </>
    )
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <button
            aria-label="打开分类"
            className="icon-button mobile-only"
            onClick={() => setSidebarOpen(true)}
            title="打开分类"
          >
            <Menu size={20} />
          </button>
          <div className="brand-mark"><Fingerprint size={21} /></div>
          <div><strong>隐匣</strong><span>本地隐私档案</span></div>
        </div>
        <div className="topbar-status"><ShieldCheck size={16} /> 已加密 · 5 分钟自动锁定</div>
        <div className="topbar-actions">
          <button
            aria-label="修改主密码"
            className="icon-button change-password-button"
            onClick={() => setChangingPassword(true)}
            title="修改主密码"
          >
            <KeyRound size={19} />
          </button>
          <button className="icon-button" onClick={exportBackup} title="导出加密备份" aria-label="导出加密备份">
            <Download size={19} />
          </button>
          <label className="icon-button" title="恢复加密备份" aria-label="恢复加密备份">
            <ArchiveRestore size={19} />
            <input
              accept=".pvault,application/json"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void importBackup(file)
                event.target.value = ''
              }}
              type="file"
            />
          </label>
          <button className="lock-button" onClick={lock}><LogOut size={17} /> 立即锁定</button>
        </div>
      </header>

      <div className="workspace">
        {sidebarOpen && <button className="sidebar-scrim" aria-label="关闭分类" onClick={() => setSidebarOpen(false)} />}
        <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
          <div className="sidebar-heading">
            <span>档案分类</span>
            <button className="icon-button mobile-only" onClick={() => setSidebarOpen(false)} aria-label="关闭分类"><X size={19} /></button>
          </div>
          <nav aria-label="档案分类">
            <button
              className={category === '全部' ? 'active' : ''}
              onClick={() => { setCategory('全部'); setSidebarOpen(false) }}
            >
              <span className="category-code">ALL</span>
              <span>全部记录</span>
              <b>{vault.entries.length}</b>
            </button>
            <button
              className={category === '常用' ? 'active' : ''}
              onClick={() => { setCategory('常用'); setSidebarOpen(false) }}
            >
              <Heart size={16} />
              <span>常用记录</span>
              <b>{vault.entries.filter((entry) => entry.favorite).length}</b>
            </button>
            <div className="nav-rule" />
            {CATEGORIES.map((item) => (
              <button
                className={category === item ? 'active' : ''}
                key={item}
                onClick={() => { setCategory(item); setSidebarOpen(false) }}
              >
                <span className="category-code" style={{ color: CATEGORY_META[item].accent }}>
                  {CATEGORY_META[item].short}
                </span>
                <span>{item}</span>
                <b>{vault.entries.filter((entry) => entry.category === item).length}</b>
              </button>
            ))}
          </nav>
          <div className="privacy-seal">
            <LockKeyhole size={20} />
            <div><strong>离线保险库</strong><span>数据未离开此设备</span></div>
          </div>
        </aside>

        <section className="record-list" aria-label="记录列表">
          <div className="list-header">
            <div>
              <p className="eyebrow">ARCHIVE INDEX</p>
              <h1>{category === '全部' ? '全部记录' : category}</h1>
            </div>
            <button className="primary-button compact" onClick={() => setEditing('new')}>
              <Plus size={18} /> 新建记录
            </button>
          </div>
          <div className="search-box">
            <Search size={18} />
            <input
              aria-label="搜索记录"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索标题、字段或备注"
              value={query}
            />
            {query && (
              <button aria-label="清除搜索" className="icon-button quiet" onClick={() => setQuery('')} title="清除搜索">
                <X size={16} />
              </button>
            )}
          </div>
          <div className="entries">
            {filteredEntries.length ? filteredEntries.map((entry) => (
              <button
                className={`entry-row ${selected?.id === entry.id ? 'active' : ''}`}
                key={entry.id}
                onClick={() => setSelectedId(entry.id)}
              >
                <span className="entry-code" style={{ borderColor: CATEGORY_META[entry.category].accent }}>
                  {CATEGORY_META[entry.category].short}
                </span>
                <span className="entry-summary">
                  <strong>{entry.title}</strong>
                  <small>{entry.category} · {readableTime(entry.updatedAt)}</small>
                </span>
                {entry.favorite && <Heart className="favorite-icon" fill="currentColor" size={14} />}
                <ChevronRight size={17} />
              </button>
            )) : (
              <div className="empty-list">
                <FileHeart size={27} />
                <strong>{query ? '没有匹配记录' : '这里还没有记录'}</strong>
                <span>{query ? '尝试其他关键词' : '新建第一条隐私档案'}</span>
              </div>
            )}
          </div>
        </section>

        <section className="record-detail" aria-label="记录详情">
          {selected ? (
            <>
              <header className="detail-header">
                <div>
                  <p className="eyebrow">{CATEGORY_META[selected.category].short} / RECORD</p>
                  <h2>{selected.title}</h2>
                  <span>{selected.category} · 更新于 {readableTime(selected.updatedAt)}</span>
                </div>
                <div className="detail-actions">
                  <button className="secondary-button" onClick={() => setEditing(selected)}>编辑</button>
                  <button
                    aria-label="删除记录"
                    className="icon-button danger"
                    onClick={() => void deleteEntry(selected)}
                    title="删除记录"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </header>
              <div className="detail-body">
                <div className="detail-meta">
                  <span>字段</span>
                  <b>{selected.fields.length.toString().padStart(2, '0')}</b>
                  <span>创建</span>
                  <b>{new Date(selected.createdAt).toLocaleDateString('zh-CN')}</b>
                </div>
                <div className="detail-fields">
                  {selected.fields.map((field) => {
                    const hidden = field.secret && !revealed.has(field.id)
                    return (
                      <div className="detail-field" key={field.id}>
                        <span>{field.label || '未命名字段'}</span>
                        <strong>{hidden ? '••••••••••••' : field.value || '—'}</strong>
                        <div>
                          {field.secret && (
                            <button
                              aria-label={hidden ? '显示字段' : '隐藏字段'}
                              className="icon-button quiet"
                              onClick={() => setRevealed((current) => {
                                const next = new Set(current)
                                if (next.has(field.id)) next.delete(field.id)
                                else next.add(field.id)
                                return next
                              })}
                              title={hidden ? '显示字段' : '隐藏字段'}
                            >
                              {hidden ? <Eye size={17} /> : <EyeOff size={17} />}
                            </button>
                          )}
                          <button
                            aria-label="复制字段"
                            className="icon-button quiet"
                            onClick={() => void copyValue(field.value)}
                            title="复制字段"
                          >
                            <Clipboard size={17} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
                {selected.notes && (
                  <div className="notes">
                    <span>备注</span>
                    <p>{selected.notes}</p>
                  </div>
                )}
              </div>
              <footer className="detail-footer">
                <ShieldCheck size={17} />
                此记录以 AES-256-GCM 加密存储
              </footer>
            </>
          ) : (
            <div className="empty-detail">
              <div className="empty-emblem"><Fingerprint size={52} /></div>
              <p className="eyebrow">PRIVATE BY DEFAULT</p>
              <h2>你的资料，只属于你</h2>
              <p>添加身份、账号、财务或健康记录。所有内容在写入设备前完成加密。</p>
              <button className="primary-button compact" onClick={() => setEditing('new')}>
                <Plus size={18} /> 新建第一条记录
              </button>
            </div>
          )}
        </section>
      </div>

      {editing && (
        <EntryEditor
          initial={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSave={(draft) => void saveEntry(draft)}
        />
      )}
      {changingPassword && (
        <ChangePasswordDialog
          onChangePassword={changePassword}
          onClose={() => setChangingPassword(false)}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

export default App
