import type {Employee, Mode, Space, Task} from './types';

export function Person({avatar = 0}: {avatar?: number}) {
  const shirt = ['#8c7e9f', '#71969c', '#b88b57'][avatar % 3];
  return <svg viewBox="0 0 60 88" aria-hidden="true">
    <ellipse cx="30" cy="83" rx="21" ry="5" fill="#5f72552a"/>
    <path d="M20 60 18 80m21-20 3 20" stroke={shirt} strokeWidth="8" strokeLinecap="round"/>
    <path d="m17 39-8 22m33-22 8 22" stroke="#dab18d" strokeWidth="6" strokeLinecap="round"/>
    <rect x="16" y="31" width="29" height="34" rx="11" fill={shirt}/>
    <rect x="18" y="7" width="25" height="28" rx="11" fill="#dab18d"/>
    <path d="M18 17V11q12-17 25 0v8" fill="#554338"/>
    <path d="m27 26 5 2 4-3" stroke="#75533c" strokeWidth="1.8" fill="none"/>
    {avatar % 3 === 0 ? <><path d="m36 47 12-3v20l-12 3Z" fill="#fbf5e4"/><path d="m40 51 5-1m-5 5 5-1" stroke="#b6a886"/></> :
      avatar % 3 === 1 ? <><path d="m9 47 18 3 12-7 14 6-11 11-28-4Z" fill="#f9f5e5"/><path d="m27 50 1 9" stroke="#b6b7a8"/></> :
        <><path d="M17 20h10m7 0h10m-17 0h7" stroke="#48594a" strokeWidth="2"/><path d="m38 39 9 6-8 15-9-6Z" fill="#faf1d8"/></>}
  </svg>;
}

function Building({color, light, side}: {color: string; light: string; side: string}) {
  return <svg viewBox="0 0 200 180" aria-hidden="true">
    <ellipse cx="103" cy="153" rx="76" ry="15" fill="#61755626"/>
    <path d="m22 75 80-37 77 37-80 40Z" fill={color}/>
    <path d="M22 75v56l77 37v-53Z" fill={light}/>
    <path d="M99 115v53l80-37V75Z" fill={side}/>
    <path d="m14 75 88-48 86 48-89 43Z" fill={color}/>
    <path d="m38 95 14 7v19l-14-7m27-6 15 8v18l-15-7m50-11 22-11v34l-22 11Z" fill="#fff9ed"/>
    <path d="m90 51 14-7 17 8-15 8Z" fill="#f8e6d5"/>
  </svg>;
}

export default function Campus({space, navigate, employees, employee, task, paused, setPaused, inspect, mode}: {
  space: Space; navigate: (space: Space) => void; employees: Employee[]; employee?: Employee;
  task?: Task; paused: boolean; setPaused: (paused: boolean) => void; inspect: (employee: Employee) => void; mode: Mode;
}) {
  const rooms: {space: Space; title: string; subtitle: string; color: string; light: string; side: string; status: string}[] = [
    {space: 'teach', title: '教学室', subtitle: '把你的经验教给它', color: '#608981', light: '#d5e2d9', side: '#91b4a5', status: employee ? `${employee.name} · ${employee.valid_skills[mode].length ? '可接对应任务' : '学习中'}` : '从一位员工开始'},
    {space: 'publish', title: '任务发布台', subtitle: '目标交给合适的员工', color: '#bf9c5a', light: '#f0dfbd', side: '#cdb387', status: '发布目标，自主接单'},
    {space: 'delivery', title: '交付大厅', subtitle: '进度与成果，一处看清', color: '#bf8065', light: '#f0d3bf', side: '#d6ab94', status: task ? task.status === 'completed' ? '成果已验收' : `${task.members.length}人参与当前任务` : '还没有任务'},
  ];
  const members = task?.members.length ? task.members.map(m => employees.find(e => e.id === m.employee_id)).filter((e): e is Employee => !!e) : employee ? [employee] : [];
  const positions = task?.members.length ? task.members.length === 1 ? [[46, 57]] : task.members.length === 2 ? [[40, 62], [54, 61]] : [[33, 66], [45, 65], [56, 72]] : [[35, 55]];
  return <section className={`campus ${paused ? 'motion-paused' : ''}`} aria-label="数字员工校园">
    <div className="campus-head"><span><i className="dot"/> 我的校园 <small>{employees.length} 位数字员工</small></span><button className="quiet" onClick={() => setPaused(!paused)} aria-pressed={paused}>{paused ? '恢复动效' : '暂停动效'}</button></div>
    <div className="map">
      <svg className="landscape" viewBox="0 0 1000 680" preserveAspectRatio="none" aria-hidden="true">
        <defs><pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#d3dcd0"/></pattern></defs>
        <rect width="1000" height="680" fill="#e8eee1"/><rect width="1000" height="680" fill="url(#grid)" opacity=".4"/>
        <path d="M40 235Q170 85 432 101Q733 67 956 214L1000 470Q821 640 524 630Q219 650 20 476Z" fill="#f5f1e3"/>
        <path d="M202 265Q355 349 484 365Q690 438 836 329M484 365Q408 502 277 548M484 365Q619 505 782 550" stroke="#fffdf3" strokeWidth="44" fill="none" strokeLinecap="round"/>
        <path d="M200 220Q470 91 803 212Q1000 378 789 568Q470 675 191 532Q50 376 200 220Z" fill="none" stroke="#c9d3c0" strokeWidth="3" strokeDasharray="7 14"/>
        <ellipse cx="500" cy="386" rx="137" ry="69" fill="#e2e8d7" stroke="#c5d2b9" strokeWidth="2"/>
        <ellipse cx="500" cy="378" rx="84" ry="41" fill="#f7f5e9" stroke="#ced8c0" strokeWidth="2"/>
        <ellipse cx="500" cy="383" rx="29" ry="14" fill="#8fae9d"/><ellipse cx="500" cy="374" rx="25" ry="12" fill="#c3d9cf"/>
        {[[103, 285], [791, 205], [868, 505], [143, 540], [541, 608]].map(([x, y]) => <g key={x} transform={`translate(${x},${y})`}><ellipse cy="8" rx="24" ry="8" fill="#cad1be"/><path d="M0 0v-24" stroke="#958263" strokeWidth="7"/><circle cy="-30" r="18" fill="#8ba88b"/><circle cx="-10" cy="-21" r="13" fill="#8ba88b"/><circle cx="14" cy="-20" r="12" fill="#8ba88b"/></g>)}
      </svg>
      {rooms.map(room => <button key={room.space} className={`building ${room.space} ${space === room.space ? 'active' : ''}`} aria-pressed={space === room.space} onClick={() => navigate(room.space)}>
        <Building {...room}/><strong>{room.title}</strong><small>{room.subtitle}</small><span className="place-status">{room.status}</span>
      </button>)}
      <div className="plaza-label"><strong>协作广场</strong><span>独立开始 · 需要时找到伙伴</span></div>
      {members.map((member, i) => <button key={member.id} className="employee" style={{left: `${positions[i]?.[0] || 58}%`, top: `${positions[i]?.[1] || 70}%`}} onClick={() => inspect(member)}>
        <span className="bubble">{task?.members.length ? task.status === 'completed' ? '已完成' : member.role : member.valid_skills[mode].length ? '可接对应任务' : '向你请教'}</span><Person avatar={member.avatar}/><strong>{member.name}</strong>
      </button>)}
      {task?.group_id && <button className="project-room" onClick={() => navigate('delivery')}><svg viewBox="0 0 300 120" aria-hidden="true"><path d="m10 58 140-50 140 50-140 52Z" fill="#ddd5e6" stroke="#b7a6c4" strokeWidth="2"/><path d="m50 58 100-36 100 36-100 35Z" fill="#fffaf0"/><path d="m95 55 55-20 55 20-55 22Z" fill="#9a8aab"/></svg><strong>项目室 · {task.members.length}人任务组</strong><small>第三人加入，原任务继续</small></button>}
      <div className="campus-caption">{task ? task.group_id ? '第三人加入，原任务继续' : '任务由服务端持续推进' : '知识从教学室出发，工作在交付大厅完成。'}</div>
    </div>
    <nav className="quick-nav" aria-label="三个核心功能">{(['teach', 'publish', 'delivery'] as Space[]).map((s, i) => <button key={s} onClick={() => navigate(s)} className={space === s ? 'active' : ''} aria-pressed={space === s}><b>0{i + 1}</b><span>{['教我的数字员工', '发布任务', '看进度与成果'][i]}</span>→</button>)}</nav>
  </section>;
}
