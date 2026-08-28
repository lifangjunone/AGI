import { useMemo, useState } from 'react'
import {
  ArrowLeft,
  Bot,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  CirclePause,
  Plus,
  Radio,
  Trash2,
  UserRoundCog,
  UsersRound,
  Wrench,
  X,
} from 'lucide-react'
import { stageDefinitions, type DeliveryTask, type DigitalEmployee, type EmployeeRuntime, type StageName, type TaskEvent } from '../domain/types'
import { defaultEmployees, runtimeLabels, useWorkforceStore } from '../stores/workforceStore'
import { currentEmployee, employeeForEvent } from './assignment'
import './DigitalWorkforce.css'

const runtimeOptions = Object.entries(runtimeLabels) as Array<[EmployeeRuntime, string]>

function initials(employee: Pick<DigitalEmployee, 'name'>) {
  return employee.name.trim().slice(-2).toUpperCase()
}

export function EmployeeAvatar({
  employee,
  size = 'medium',
  active = false,
}: {
  employee: DigitalEmployee
  size?: 'small' | 'medium' | 'large'
  active?: boolean
}) {
  const [failed, setFailed] = useState(false)
  return <span className={`employee-avatar ${size} ${active ? 'active' : ''}`}>
    {!failed && employee.avatarUrl
      ? <img src={employee.avatarUrl} alt="" onError={() => setFailed(true)} />
      : <b>{initials(employee)}</b>}
    <i className={employee.status} />
  </span>
}

type EmployeeDraft = {
  name: string
  title: string
  department: string
  summary: string
  runtime: EmployeeRuntime
  stages: StageName[]
  capabilities: string
  instructions: string
  appearance: string
}

const emptyDraft: EmployeeDraft = {
  name: '',
  title: '',
  department: '',
  summary: '',
  runtime: 'trae_code',
  stages: ['implementation'],
  capabilities: '',
  instructions: '',
  appearance: '',
}

function CreateEmployeeDialog({ onClose }: { onClose: () => void }) {
  const createEmployee = useWorkforceStore((state) => state.createEmployee)
  const [draft, setDraft] = useState(emptyDraft)
  const canCreate = draft.name.trim() && draft.title.trim() && draft.stages.length > 0
  const toggleStage = (stage: StageName) => setDraft((current) => ({
    ...current,
    stages: current.stages.includes(stage)
      ? current.stages.filter((item) => item !== stage)
      : [...current.stages, stage],
  }))
  const submit = () => {
    if (!canCreate) return
    createEmployee({
      ...draft,
      capabilities: draft.capabilities.split(/[，,]/).map((item) => item.trim()).filter(Boolean),
    })
    onClose()
  }
  return <div className="employee-dialog-backdrop" role="presentation" onMouseDown={(event) => {
    if (event.target === event.currentTarget) onClose()
  }}>
    <section className="employee-dialog" role="dialog" aria-modal="true" aria-labelledby="create-employee-title">
      <header><div><small>数字员工档案</small><h2 id="create-employee-title">新建数字员工</h2></div><button type="button" title="关闭" onClick={onClose}><X /></button></header>
      <div className="employee-form">
        <div className="employee-form-grid">
          <label>姓名<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="例如：顾衡" /></label>
          <label>岗位<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="例如：安全审查员" /></label>
          <label>部门<input value={draft.department} onChange={(event) => setDraft({ ...draft, department: event.target.value })} placeholder="例如：安全治理" /></label>
          <label>执行 Runtime<select value={draft.runtime} onChange={(event) => setDraft({ ...draft, runtime: event.target.value as EmployeeRuntime })}>{runtimeOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        </div>
        <label>岗位简介<textarea value={draft.summary} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} placeholder="描述该员工对交付结果承担什么责任" /></label>
        <fieldset><legend>负责阶段</legend><div className="employee-stage-picker">{stageDefinitions.map((stage) => <button type="button" className={draft.stages.includes(stage.id) ? 'selected' : ''} onClick={() => toggleStage(stage.id)} key={stage.id}>{draft.stages.includes(stage.id) && <Check />}{stage.label}</button>)}</div></fieldset>
        <label>能力标签<input value={draft.capabilities} onChange={(event) => setDraft({ ...draft, capabilities: event.target.value })} placeholder="安全扫描，依赖审计，风险门禁" /></label>
        <label>工作指令<textarea value={draft.instructions} onChange={(event) => setDraft({ ...draft, instructions: event.target.value })} placeholder="定义工作原则、完成条件和交接要求" /></label>
        <label>人物形象<input value={draft.appearance} onChange={(event) => setDraft({ ...draft, appearance: event.target.value })} placeholder="例如：沉稳女性，黑色西装，安全盾徽章，墨绿色背景" /></label>
      </div>
      <footer><button type="button" onClick={onClose}>取消</button><button type="button" className="primary" disabled={!canCreate} onClick={submit}><Plus />创建并上岗</button></footer>
    </section>
  </div>
}

export function DigitalWorkforce({ onClose }: { onClose: () => void }) {
  const employees = useWorkforceStore((state) => state.employees)
  const toggleEmployee = useWorkforceStore((state) => state.toggleEmployee)
  const removeEmployee = useWorkforceStore((state) => state.removeEmployee)
  const [selectedId, setSelectedId] = useState(employees[0]?.id ?? '')
  const [creating, setCreating] = useState(false)
  const selected = employees.find((employee) => employee.id === selectedId) ?? employees[0]
  const activeCount = employees.filter((employee) => employee.status === 'active').length
  const runtimeCount = new Set(employees.filter((employee) => employee.status === 'active').map((employee) => employee.runtime)).size

  return <main className="workforce-shell">
    <header className="workforce-header">
      <div className="workforce-brand"><span><UsersRound /></span><div><b>数字员工</b><small>企业执行人才库</small></div></div>
      <div><button type="button" onClick={onClose}><ArrowLeft />返回工作台</button><button type="button" className="primary" onClick={() => setCreating(true)}><Plus />新建数字员工</button></div>
    </header>
    <section className="workforce-content">
      <div className="workforce-title">
        <div><span className="eyebrow">DIGITAL WORKFORCE</span><h1>你的自主交付团队</h1><p>每位员工都有明确岗位、执行工具、阶段责任和可追溯交接。</p></div>
        <div className="workforce-metrics"><span><b>{employees.length}</b>员工总数</span><span><b>{activeCount}</b>当前在岗</span><span><b>{runtimeCount}</b>执行工具</span></div>
      </div>
      <div className="workforce-layout">
        <section className="employee-roster">
          <header><b>员工名册</b><span>{activeCount} 人可参与项目</span></header>
          <div>{employees.map((employee) => <button type="button" className={`employee-card ${selected?.id === employee.id ? 'selected' : ''}`} onClick={() => setSelectedId(employee.id)} key={employee.id}>
            <EmployeeAvatar employee={employee} size="large" />
            <span className="employee-card-copy"><small>{employee.department}</small><b>{employee.name}</b><em>{employee.title}</em><span><Wrench />{runtimeLabels[employee.runtime]}</span></span>
            <i className={employee.status}>{employee.status === 'active' ? '在岗' : '离岗'}</i>
          </button>)}</div>
        </section>
        {selected && <aside className="employee-profile">
          <div className="employee-profile-hero">
            <EmployeeAvatar employee={selected} size="large" />
            <div><small>{selected.builtIn ? '内置数字员工' : '自定义数字员工'}</small><h2>{selected.name}</h2><b>{selected.title}</b></div>
            <span className={selected.status}><i />{selected.status === 'active' ? '已上岗' : '已离岗'}</span>
          </div>
          <p>{selected.summary}</p>
          <dl><div><dt>执行工具</dt><dd>{runtimeLabels[selected.runtime]}</dd></div><div><dt>所属部门</dt><dd>{selected.department}</dd></div></dl>
          <section><h3>岗位能力</h3><div className="employee-capabilities">{selected.capabilities.map((capability) => <span key={capability}>{capability}</span>)}</div></section>
          <section><h3>负责阶段</h3><div className="employee-stage-list">{selected.stages.map((stage) => <span key={stage}>{stageDefinitions.find((item) => item.id === stage)?.label ?? stage}</span>)}</div></section>
          <section><h3>工作准则</h3><blockquote>{selected.instructions || '尚未设置工作准则'}</blockquote></section>
          <footer><button type="button" onClick={() => toggleEmployee(selected.id)}>{selected.status === 'active' ? <CirclePause /> : <Radio />}{selected.status === 'active' ? '安排离岗' : '重新上岗'}</button>{!selected.builtIn && <button type="button" className="danger" onClick={() => { removeEmployee(selected.id); setSelectedId(employees[0]?.id ?? '') }}><Trash2 />删除员工</button>}</footer>
        </aside>}
      </div>
    </section>
    {creating && <CreateEmployeeDialog onClose={() => setCreating(false)} />}
  </main>
}

export function SquadSelector({
  selectedIds,
  onChange,
  onClose,
}: {
  selectedIds: string[]
  onChange: (ids: string[]) => void
  onClose: () => void
}) {
  const employees = useWorkforceStore((state) => state.employees).filter((employee) => employee.status === 'active')
  const toggle = (id: string) => onChange(selectedIds.includes(id)
    ? selectedIds.filter((item) => item !== id)
    : [...selectedIds, id])
  const selected = employees.filter((employee) => selectedIds.includes(employee.id))
  const hasAnalysis = selected.some((employee) => employee.runtime === 'trae_work')
  const hasEngineering = selected.some((employee) => employee.runtime === 'trae_code')
  const hasLead = selected.some((employee) => employee.runtime === 'supervisor')
  const coverage = [hasLead, hasAnalysis, hasEngineering].filter(Boolean).length
  return <div className="employee-dialog-backdrop" role="presentation" onMouseDown={(event) => {
    if (event.target === event.currentTarget) onClose()
  }}>
    <section className="squad-selector" role="dialog" aria-modal="true" aria-labelledby="squad-selector-title">
      <header><div><small>项目级人员配置</small><h2 id="squad-selector-title">组建自主交付小队</h2></div><button type="button" title="关闭" onClick={onClose}><X /></button></header>
      <div className="squad-coverage"><span><b>{selected.length}</b>已选员工</span><span className={coverage === 3 ? 'complete' : 'warning'}><b>{coverage}/3</b>核心职责覆盖</span></div>
      <div className="squad-options">{employees.map((employee) => {
        const checked = selectedIds.includes(employee.id)
        return <button type="button" className={checked ? 'selected' : ''} onClick={() => toggle(employee.id)} key={employee.id}>
          <EmployeeAvatar employee={employee} size="medium" />
          <span><small>{employee.department}</small><b>{employee.name}</b><em>{employee.title}</em><i>{runtimeLabels[employee.runtime]}</i></span>
          <strong>{checked ? <Check /> : <Plus />}</strong>
        </button>
      })}</div>
      <footer><p>{coverage < 3 ? '缺少核心职责会降低自主交付完整度。' : '需求分析、研发执行和交付协调均已覆盖。'}</p><button type="button" onClick={onClose}>完成组队</button></footer>
    </section>
  </div>
}

function employeeState(
  employee: DigitalEmployee,
  task: DeliveryTask,
  events: TaskEvent[],
  currentEmployeeId: string | undefined,
  members: DigitalEmployee[],
) {
  if (task.status === 'completed') return 'completed'
  if (currentEmployeeId === employee.id) return task.status === 'waiting_approval' ? 'waiting' : 'working'
  if (events.some((event) => employeeForEvent(members, event)?.id === employee.id)) return 'handed_off'
  return 'standby'
}

const employeeStateLabels: Record<string, string> = {
  completed: '已交付',
  waiting: '等待确认',
  working: '工作中',
  handed_off: '已交接',
  standby: '待命',
}

export function ProjectSquad({ task, events, onClose }: { task: DeliveryTask; events: TaskEvent[]; onClose: () => void }) {
  const members = task.deliverySquad?.members ?? defaultEmployees
  const assignments = useMemo(() => events
    .map((event) => ({ event, employee: employeeForEvent(members, event) }))
    .filter((item): item is { event: TaskEvent; employee: DigitalEmployee } => Boolean(item.employee))
    .slice(-18)
    .reverse(), [events, members])
  const activeEmployee = currentEmployee(task, events)
  const latest = assignments.find((item) => item.employee.id === activeEmployee?.id)

  return <main className="squad-command-shell">
    <header className="workforce-header">
      <div className="workforce-brand"><span><UsersRound /></span><div><b>自主交付小队</b><small>{task.name} · {task.versionLabel}</small></div></div>
      <div><button type="button" onClick={onClose}><ArrowLeft />返回项目</button></div>
    </header>
    <section className="squad-command-content">
      <div className="squad-command-title">
        <div><span className="eyebrow">PROJECT SQUAD</span><h1>{task.deliverySquad?.name ?? `${task.name}默认交付小队`}</h1><p>{members.length} 名数字员工正在按真实交付阶段协作{task.deliverySquad ? '。' : '（旧项目采用默认编制）。'}</p></div>
        <div className={`squad-live ${task.status}`}><i /><span><small>当前责任人</small><b>{activeEmployee ? `${activeEmployee.name} · ${activeEmployee.title}` : '等待分派'}</b></span></div>
      </div>
      <section className="collaboration-stage">
        <div className="collaboration-grid" aria-label="数字员工协作轨迹">
          {members.map((employee, index) => {
            const state = employeeState(employee, task, events, activeEmployee?.id, members)
            const isCurrent = activeEmployee?.id === employee.id
            return <div className={`collaboration-member ${state} ${isCurrent ? 'current' : ''}`} key={employee.id}>
              <div className="employee-workstation">
                <EmployeeAvatar employee={employee} size="large" active={isCurrent} />
                <span className="workstation-tool"><Bot />{runtimeLabels[employee.runtime]}</span>
                {isCurrent && <span className="employee-signal"><i /><i /><i /></span>}
              </div>
              <small>{employee.department}</small><h2>{employee.name}</h2><b>{employee.title}</b>
              <em><i />{employeeStateLabels[state]}</em>
              {isCurrent && <p>{latest?.event.summary ?? `正在处理${stageDefinitions.find((stage) => stage.id === task.currentStage)?.label ?? '当前阶段'}`}</p>}
              {index < members.length - 1 && <span className={`handoff-line ${['handed_off', 'completed'].includes(state) ? 'passed' : ''}`}><i /><ChevronRight /></span>}
            </div>
          })}
        </div>
      </section>
      <div className="squad-command-lower">
        <section className="squad-track">
          <header><div><b>实时工作轨迹</b><span>来自项目真实事件，按员工责任归属</span></div><strong><Radio /> LIVE</strong></header>
          <div>{assignments.map(({ event, employee }) => <article key={event.id}>
            <EmployeeAvatar employee={employee} size="small" />
            <div><span><b>{employee.name}</b><em>{runtimeLabels[employee.runtime]}</em><time>{new Date(event.timestamp).toLocaleTimeString()}</time></span><p>{event.summary}</p>{event.detail && <small>{event.detail}</small>}</div>
          </article>)}
          {assignments.length === 0 && <div className="squad-track-empty"><BriefcaseBusiness /><b>等待项目启动</b><span>任务事件产生后会自动归属到对应员工。</span></div>}</div>
        </section>
        <aside className="squad-handoff">
          <header><UserRoundCog /><div><b>协作契约</b><span>当前项目版本固定快照</span></div></header>
          <dl><div><dt>队长</dt><dd>{members.find((employee) => employee.id === (task.deliverySquad?.leaderId ?? 'builtin-delivery-lead'))?.name ?? '-'}</dd></div><div><dt>成员</dt><dd>{members.length} 人</dd></div><div><dt>项目状态</dt><dd>{task.status === 'completed' ? '已完成' : task.status === 'waiting_approval' ? '等待决策' : '执行中'}</dd></div></dl>
          <section><h3>本轮职责</h3>{members.map((employee) => <span key={employee.id}><EmployeeAvatar employee={employee} size="small" /><b>{employee.name}</b><em>{employee.stages.map((stage) => stageDefinitions.find((item) => item.id === stage)?.label).filter(Boolean).join(' / ')}</em></span>)}</section>
        </aside>
      </div>
    </section>
  </main>
}
