import {useState, type ReactNode} from 'react';
import {Person} from './Campus';
import {skills, type Employee, type Mode, type Space, type Task} from './types';

export const labels: Record<string, string> = {
  published: '等待认领', running: '正在协作', generating: '生成成果', waiting: '等待补位',
  paused: '已暂停', error: '运行失败', blocked: '授权影响', review: '待独立评审',
  ready: '待真人验收', completed: '已验收', cancelled: '已取消',
};

export function SectionTabs<T extends string>({items, selected, onSelect, label}: {
  items: {id: T; title: string; count?: number}[]; selected: T; onSelect: (id: T) => void; label: string;
}) {
  return <nav className="section-tabs" aria-label={label}>{items.map(item =>
    <button key={item.id} type="button" aria-pressed={item.id === selected} className={item.id === selected ? 'selected' : ''} onClick={() => onSelect(item.id)}>
      {item.title}{item.count !== undefined && item.count > 0 && <span>{item.count}</span>}
    </button>)}</nav>;
}

export function GrowthPath({stage}: {stage: number}) {
  return <ol className="growth-path" aria-label="员工成长阶段">{['教学', '确认理解', '考试', '试岗', '可接任务'].map((title, index) =>
    <li key={title} className={index < stage ? 'done' : index === stage ? 'current' : ''} aria-current={index === stage ? 'step' : undefined}>
      <b>{index < stage ? '✓' : index + 1}</b><span>{title}</span>
    </li>)}</ol>;
}

export function MissionControl({space, navigate, employee, task, mode}: {
  space: Space; navigate: (space: Space) => void; employee?: Employee; task?: Task; mode: Mode;
}) {
  const ready = employee?.valid_skills[mode].length ? `${employee.name}已有可接技能` : employee ? `${employee.name}还在学习` : '先创建第一位员工';
  const taskState = task ? labels[task.status] : '还没有任务';
  const results = task?.artifacts.filter(artifact => artifact.version === task.artifact_version).length || 0;
  const cards: {id: Space; index: string; title: string; promise: string; state: string; cta: string}[] = [
    {id: 'teach', index: '01', title: '真实员工教数字员工', promise: '它会主动问，你用经验、资料和示范慢慢教。', state: ready, cta: employee ? `继续教${employee.name}` : '创建员工'},
    {id: 'publish', index: '02', title: '发布任务让员工自评', promise: '不用先排团队，先说目标；资格、授权和负载由系统校验。', state: employee?.valid_skills[mode].length ? '已有候选员工' : '需要先完成教学验证', cta: '发布任务'},
    {id: 'delivery', index: '03', title: '看进度、组队和成果', promise: '独立开始，缺能力再拉人；第三位加入时自动建立任务组。', state: `${taskState}${results ? ` · ${results}份成果` : ''}`, cta: '查看交付'},
  ];
  return <section className="mission-control" aria-label="核心工作入口">{cards.map(card =>
    <button key={card.id} type="button" className={space === card.id ? 'active' : ''} aria-pressed={space === card.id} onClick={() => navigate(card.id)}>
      <span className="mission-index">{card.index}</span><span className="mission-copy"><strong>{card.title}</strong><small>{card.promise}</small><em>{card.state}</em></span><span className="mission-cta">{card.cta} →</span>
    </button>)}</section>;
}

export function TeachingDialogue({employee}: {employee: Employee}) {
  return <div className="teaching-dialogue" aria-label="双向教学对话">
    <div className="dialogue-person"><Person avatar={employee.avatar}/><span>{employee.name}</span></div>
    <div className="dialogue-bubble">
      <strong>{employee.name}主动请教</strong>
      <p>{employee.question}</p>
      <small>你回答后，它会复述理解；只有真人确认后的方法卡才进入考试。</small>
    </div>
  </div>;
}

export function DeliveryStory({task}: {task: Task}) {
  const current = task.status === 'completed' ? 5 : task.status === 'ready' || task.status === 'review' ? 4 : task.group_id ? 3 : task.members.length >= 2 ? 2 : task.members.length === 1 ? 1 : 0;
  const steps = ['发布', '独立接单', '双人协作', '三人建组', '成果评审', '真人验收'];
  return <ol className="delivery-story" aria-label="任务协作进化">{steps.map((title, index) =>
    <li key={title} className={index < current ? 'done' : index === current ? 'current' : ''} aria-current={index === current ? 'step' : undefined}>
      <b>{index < current ? '✓' : index + 1}</b><span>{title}</span>
    </li>)}</ol>;
}

export function TaskShelf({tasks, selected, select}: {tasks: Task[]; selected?: string; select: (task: Task) => void}) {
  const [filter, setFilter] = useState<'all' | 'attention' | 'active' | 'completed'>('all');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);
  const needsAttention = (task: Task) => ['review', 'ready', 'waiting', 'blocked', 'error', 'paused'].includes(task.status);
  const shown = [...tasks].reverse().filter(task =>
    task.goal.toLowerCase().includes(query.toLowerCase()) &&
    (filter === 'all' || filter === 'attention' && needsAttention(task) ||
      filter === 'completed' && task.status === 'completed' ||
      filter === 'active' && ['published', 'running', 'generating'].includes(task.status)));
  const visible = expanded || query || filter !== 'all' ? shown : shown.slice(0, 6);
  return <section className="task-shelf" aria-label="任务浏览">
    <div className="shelf-heading"><div><h2>工作正在发生</h2><p>找到任务，直接看进度与结果。</p></div><span>{tasks.length} 项任务</span></div>
    <div className="shelf-tools"><SectionTabs label="任务筛选" selected={filter} onSelect={setFilter} items={[
      {id: 'all', title: '全部'}, {id: 'attention', title: '待我处理', count: tasks.filter(needsAttention).length},
      {id: 'active', title: '进行中'}, {id: 'completed', title: '已完成'},
    ]}/><input aria-label="搜索任务" type="search" placeholder="搜索任务目标…" value={query} onChange={event => setQuery(event.target.value)}/></div>
    <div className="task-list">{shown.length ? visible.map(task =>
      <button className={`task-row ${task.id === selected ? 'selected' : ''}`} onClick={() => select(task)} key={task.id}>
        <span className={`status-dot ${task.status}`} aria-hidden="true"/>
        <span className="task-row-main"><strong>{task.goal}</strong><small>{task.members.map(member => member.name).join('、') || '等待合格员工'} · {task.group_id ? '任务组' : task.members.length === 2 ? '双人协作' : '独立任务'}</small></span>
        <span className="task-row-state">{labels[task.status]}<small>{task.artifacts.filter(a => a.version === task.artifact_version).length} 份成果</small></span><span aria-hidden="true">→</span>
      </button>) : <p className="shelf-empty">没有符合条件的任务，试试其他筛选。</p>}</div>
    {shown.length > visible.length && <button className="shelf-more" type="button" onClick={() => setExpanded(true)}>展开剩余 {shown.length - visible.length} 项任务</button>}
    {expanded && !query && filter === 'all' && shown.length > 6 && <button className="shelf-more secondary-more" type="button" onClick={() => setExpanded(false)}>收起任务列表</button>}
  </section>;
}

export function EmployeeShelf({employees, mode, select}: {employees: Employee[]; mode: Mode; select: (employee: Employee) => void}) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);
  const shown = employees.filter(employee => `${employee.name} ${employee.role} ${skills[employee.skill]}`.toLowerCase().includes(query.toLowerCase()));
  const visible = expanded || query ? shown : shown.slice(0, 6);
  return <section className="employee-shelf" aria-label="员工名册"><div className="shelf-heading"><div><h2>你的工作伙伴</h2><p>每位员工都有自己的知识与成长记录。</p></div><span>{employees.length} 位员工</span></div>
    <div className="shelf-tools compact"><input aria-label="搜索员工" type="search" placeholder="搜索姓名、岗位或技能…" value={query} onChange={event => setQuery(event.target.value)}/></div>
    <div className="employee-roster">
    {visible.map(employee => <button onClick={() => select(employee)} key={employee.id}>
      <Person avatar={employee.avatar}/><span><strong>{employee.name}</strong><small>{skills[employee.skill]} · {employee.valid_skills[mode].length ? '已验证，可接任务' : '等待教学与验证'}</small></span><span className="roster-arrow" aria-hidden="true">→</span>
    </button>)}
    {!visible.length && <p className="shelf-empty">没有找到这位员工。</p>}
  </div>
  {shown.length > visible.length && <button className="shelf-more" type="button" onClick={() => setExpanded(true)}>展开剩余 {shown.length - visible.length} 位员工</button>}
  {expanded && !query && shown.length > 6 && <button className="shelf-more secondary-more" type="button" onClick={() => setExpanded(false)}>收起员工名册</button>}
  </section>;
}

export function ConfirmDialog({description, confirmLabel, run}: {description: ReactNode; confirmLabel: string; run: () => Promise<boolean>}) {
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <><div className="confirmation-description">{description}</div><label className="check">
    <input type="checkbox" checked={checked} onChange={event => setChecked(event.target.checked)}/>我已了解影响，确认继续
  </label>{error && <p className="warning" role="alert">{error}</p>}
    <button className="primary full" disabled={!checked || busy} onClick={async () => {
      setBusy(true); setError('');
      try {if (!await run()) setError('操作未完成，请查看工作台错误说明，关闭后重试。');}
      catch {setError('操作失败，数据未被确认。请关闭后重试。');}
      finally {setBusy(false);}
    }}>{busy ? '正在保存…' : confirmLabel}</button></>;
}
