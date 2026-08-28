import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Archive,
  ArrowRight,
  Bot,
  BrainCircuit,
  Check,
  ChevronRight,
  CirclePause,
  CirclePlay,
  Command,
  GitBranch,
  LayoutDashboard,
  MemoryStick,
  Network,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  X,
  Zap,
} from "lucide-react";
import { initialMission } from "./data";
import { advanceMission, approveTask, resetMission } from "./engine";
import type {
  Agent,
  AutonomyMode,
  Event,
  MissionState,
  Task,
  TaskStatus,
} from "./types";

type View = "command" | "graph" | "team" | "memory";

const STORAGE_KEY = "nexora-mission-v1";

const statusLabels: Record<TaskStatus, string> = {
  backlog: "等待依赖",
  ready: "可执行",
  running: "执行中",
  review: "独立评审",
  approval: "等待批准",
  blocked: "已阻塞",
  done: "已完成",
};

const modeLabels: Record<AutonomyMode, string> = {
  observe: "观察",
  collaborate: "协作",
  autonomous: "自主",
};

const navItems: Array<{ id: View; label: string; icon: typeof Command }> = [
  { id: "command", label: "指挥中心", icon: LayoutDashboard },
  { id: "graph", label: "任务图", icon: GitBranch },
  { id: "team", label: "Agent 团队", icon: Users },
  { id: "memory", label: "共享记忆", icon: BrainCircuit },
];

const readMission = (): MissionState => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? (JSON.parse(saved) as MissionState) : structuredClone(initialMission);
  } catch {
    return structuredClone(initialMission);
  }
};

const agentFor = (agents: Agent[], id: string) =>
  agents.find((agent) => agent.id === id) ?? agents[0];

function AgentAvatar({ agent, small = false }: { agent: Agent; small?: boolean }) {
  return (
    <span
      className={`agent-avatar${small ? " small" : ""}`}
      style={{ "--agent-color": agent.color } as React.CSSProperties}
      title={`${agent.name} · ${agent.role}`}
      aria-label={`${agent.name}，${agent.role}`}
    >
      {agent.initials}
    </span>
  );
}

function StatusPill({ status }: { status: TaskStatus }) {
  return <span className={`status-pill status-${status}`}>{statusLabels[status]}</span>;
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function TaskRow({
  task,
  agents,
  onApprove,
}: {
  task: Task;
  agents: Agent[];
  onApprove: (taskId: string) => void;
}) {
  const agent = agentFor(agents, task.agentId);
  return (
    <article className={`task-row task-${task.status}`}>
      <div className="task-state" aria-hidden="true">
        {task.status === "done" ? <Check size={14} /> : task.id.replace("T-", "")}
      </div>
      <div className="task-copy">
        <div className="task-title-line">
          <strong>{task.title}</strong>
          <StatusPill status={task.status} />
        </div>
        <p>{task.summary}</p>
        <div className="task-meta">
          <span><AgentAvatar agent={agent} small />{agent.name}</span>
          <span>风险 {task.risk}</span>
          <span>置信度 {task.confidence}%</span>
          {task.artifact && <span className="artifact">{task.artifact}</span>}
        </div>
      </div>
      <div className="task-action">
        {task.status === "approval" ? (
          <button className="approve-button" onClick={() => onApprove(task.id)}>
            <ShieldCheck size={15} />
            批准
          </button>
        ) : (
          <div className="progress-ring" style={{ "--progress": task.progress } as React.CSSProperties}>
            <span>{task.progress}%</span>
          </div>
        )}
      </div>
    </article>
  );
}

function EventItem({ event, agents }: { event: Event; agents: Agent[] }) {
  const fallback: Agent = {
    id: "human",
    name: "负责人",
    initials: "HU",
    role: "人类负责人",
    specialty: "",
    color: "#ffffff",
    status: "idle",
    trust: 100,
    load: 0,
    memoryCount: 0,
  };
  const agent = agents.find((candidate) => candidate.id === event.agentId) ?? fallback;

  return (
    <li className="event-item">
      <AgentAvatar agent={agent} small />
      <div>
        <div className="event-head">
          <strong>{agent.name}</strong>
          <span>周期 {event.cycle}</span>
        </div>
        <p>{event.message}</p>
      </div>
    </li>
  );
}

function GraphView({
  mission,
  onApprove,
}: {
  mission: MissionState;
  onApprove: (taskId: string) => void;
}) {
  const layers = useMemo(() => {
    const depth = new Map<string, number>();
    const findDepth = (task: Task): number => {
      if (depth.has(task.id)) return depth.get(task.id)!;
      const value = task.dependsOn.length
        ? Math.max(
            ...task.dependsOn.map((id) => {
              const parent = mission.tasks.find((candidate) => candidate.id === id);
              return parent ? findDepth(parent) + 1 : 0;
            }),
          )
        : 0;
      depth.set(task.id, value);
      return value;
    };
    mission.tasks.forEach(findDepth);
    return Array.from({ length: Math.max(...depth.values()) + 1 }, (_, index) =>
      mission.tasks.filter((task) => depth.get(task.id) === index),
    );
  }, [mission.tasks]);

  return (
    <section className="graph-view" aria-label="任务依赖图">
      <header className="section-heading">
        <div>
          <span className="eyebrow">EXECUTION GRAPH</span>
          <h2>可解释的自主执行路径</h2>
        </div>
        <div className="legend">
          <span><i className="legend-dot running" />执行中</span>
          <span><i className="legend-dot review" />门禁</span>
          <span><i className="legend-dot done" />已验证</span>
        </div>
      </header>
      <div className="graph-canvas">
        {layers.map((layer, layerIndex) => (
          <div className="graph-layer" key={layerIndex}>
            <span className="layer-label">L{layerIndex + 1}</span>
            <div className="layer-tasks">
              {layer.map((task) => {
                const agent = agentFor(mission.agents, task.agentId);
                return (
                  <article className={`graph-node task-${task.status}`} key={task.id}>
                    <div className="node-head">
                      <span>{task.id}</span>
                      <StatusPill status={task.status} />
                    </div>
                    <h3>{task.title}</h3>
                    <p>{task.summary}</p>
                    <div className="node-foot">
                      <span><AgentAvatar agent={agent} small />{agent.name}</span>
                      <strong>{task.progress}%</strong>
                    </div>
                    {task.status === "approval" && (
                      <button className="approve-button full" onClick={() => onApprove(task.id)}>
                        <ShieldCheck size={15} />批准门禁
                      </button>
                    )}
                  </article>
                );
              })}
            </div>
            {layerIndex < layers.length - 1 && <ChevronRight className="layer-arrow" size={20} />}
          </div>
        ))}
      </div>
    </section>
  );
}

function TeamView({ mission }: { mission: MissionState }) {
  return (
    <section>
      <header className="section-heading">
        <div>
          <span className="eyebrow">PERSISTENT TEAM</span>
          <h2>身份、能力与当前负载</h2>
        </div>
        <span className="section-note">角色随经验进化，权限保持显式</span>
      </header>
      <div className="team-list">
        {mission.agents.map((agent) => (
          <article className="agent-row" key={agent.id}>
            <AgentAvatar agent={agent} />
            <div className="agent-identity">
              <strong>{agent.name}</strong>
              <span>{agent.role}</span>
            </div>
            <p>{agent.specialty}</p>
            <div className="agent-stat">
              <span>信任</span><strong>{agent.trust}</strong>
            </div>
            <div className="agent-stat">
              <span>记忆</span><strong>{agent.memoryCount}</strong>
            </div>
            <div className="load-meter">
              <span>负载 {agent.load}%</span>
              <i><b style={{ width: `${agent.load}%` }} /></i>
            </div>
            <span className={`presence ${agent.status}`}>{agent.status}</span>
          </article>
        ))}
      </div>
    </section>
  );
}

function MemoryView({ mission }: { mission: MissionState }) {
  return (
    <section>
      <header className="section-heading">
        <div>
          <span className="eyebrow">SHARED MEMORY</span>
          <h2>经验证的团队经验</h2>
        </div>
        <label className="memory-search">
          <Search size={15} />
          <input aria-label="搜索共享记忆" placeholder="检索记忆" />
        </label>
      </header>
      <div className="memory-list">
        {mission.memories.map((memory) => {
          const agent = agentFor(mission.agents, memory.agentId);
          return (
            <article className="memory-item" key={memory.id}>
              <div className="memory-score">{memory.importance}</div>
              <div>
                <span className="memory-source"><AgentAvatar agent={agent} small />{agent.name} · 周期 {memory.cycle}</span>
                <h3>{memory.title}</h3>
                <p>{memory.detail}</p>
                <div className="tag-row">
                  {memory.tags.map((tag) => <span key={tag}>{tag}</span>)}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function CreateMissionDialog({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (title: string, objective: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [objective, setObjective] = useState("");
  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-mission-title"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          onCreate(title, objective);
          setTitle("");
          setObjective("");
        }}
      >
        <div className="modal-head">
          <div>
            <span className="eyebrow">NEW MISSION</span>
            <h2 id="new-mission-title">定义自主任务</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </div>
        <label>
          任务名称
          <input
            autoFocus
            required
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="例如：完成新产品从研究到发布"
          />
        </label>
        <label>
          完成标准
          <textarea
            required
            value={objective}
            onChange={(event) => setObjective(event.target.value)}
            placeholder="描述结果、约束和必须提供的证据"
          />
        </label>
        <div className="modal-actions">
          <button type="button" className="text-button" onClick={onClose}>取消</button>
          <button type="submit" className="primary-button"><Sparkles size={16} />生成任务图</button>
        </div>
      </form>
    </div>
  );
}

export default function App() {
  const [mission, setMission] = useState<MissionState>(readMission);
  const [view, setView] = useState<View>("command");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mission));
  }, [mission]);

  useEffect(() => {
    if (!mission.running) return;
    const timer = window.setInterval(() => {
      setMission((current) => advanceMission(current));
    }, 1500);
    return () => window.clearInterval(timer);
  }, [mission.running]);

  const done = mission.tasks.filter((task) => task.status === "done").length;
  const active = mission.tasks.filter((task) => task.status === "running").length;
  const approvals = mission.tasks.filter((task) => task.status === "approval").length;
  const progress = Math.round(
    mission.tasks.reduce((sum, task) => sum + task.progress, 0) / mission.tasks.length,
  );

  const setMode = (mode: AutonomyMode) =>
    setMission((current) => ({ ...current, mode }));

  const approve = (taskId: string) =>
    setMission((current) => approveTask(current, taskId));

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark"><Network size={19} /></span>
          <div><strong>NEXORA</strong><span>AGENT OPERATIONS</span></div>
        </div>
        <button className="new-mission" onClick={() => setCreating(true)}>
          <Plus size={16} />新建任务
        </button>
        <nav aria-label="主导航">
          <span className="nav-label">工作区</span>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={view === item.id ? "active" : ""}
                onClick={() => setView(item.id)}
              >
                <Icon size={17} />
                {item.label}
                {item.id === "graph" && active > 0 && <i>{active}</i>}
              </button>
            );
          })}
        </nav>
        <div className="runtime">
          <div className="runtime-head"><span><Zap size={14} />本地运行时</span><i /></div>
          <strong>5 / 5 Agent 在线</strong>
          <span>事件账本已同步</span>
        </div>
        <button
          className="reset-button"
          onClick={() => setMission(structuredClone(initialMission))}
          title="恢复演示数据"
        >
          <RotateCcw size={15} />恢复演示
        </button>
      </aside>

      <main>
        <header className="topbar">
          <div className="mission-id">
            <span>{mission.id}</span>
            <strong>{mission.title}</strong>
          </div>
          <div className="topbar-actions">
            <button
              className="icon-button mobile-create"
              onClick={() => setCreating(true)}
              aria-label="新建任务"
              title="新建任务"
            >
              <Plus size={17} />
            </button>
            <div className="mode-control" aria-label="自治模式">
              {(Object.keys(modeLabels) as AutonomyMode[]).map((mode) => (
                <button
                  key={mode}
                  className={mission.mode === mode ? "active" : ""}
                  onClick={() => setMode(mode)}
                >
                  {modeLabels[mode]}
                </button>
              ))}
            </div>
            <button
              className={`run-button${mission.running ? " running" : ""}`}
              onClick={() => setMission((current) => ({ ...current, running: !current.running }))}
            >
              {mission.running ? <CirclePause size={17} /> : <CirclePlay size={17} />}
              {mission.running ? "暂停" : "启动"}
            </button>
          </div>
        </header>

        <div className="content">
          {view === "command" && (
            <>
              <section className="mission-overview">
                <div className="mission-copy">
                  <span className="eyebrow"><Activity size={13} /> LIVE MISSION · CYCLE {mission.cycle}</span>
                  <h1>{mission.title}</h1>
                  <p>{mission.objective}</p>
                  <div className="progress-track" aria-label={`总进度 ${progress}%`}>
                    <i style={{ width: `${progress}%` }} />
                  </div>
                </div>
                <div className="metrics">
                  <Metric label="总进度" value={`${progress}%`} detail={`${done}/${mission.tasks.length} 已验证`} />
                  <Metric label="并行任务" value={`${active}`} detail="无资源冲突" />
                  <Metric label="待批准" value={`${approvals}`} detail="高风险门禁" />
                  <Metric label="风险预算" value={`${mission.riskBudget}`} detail="阈值内运行" />
                </div>
              </section>

              <div className="command-grid">
                <section className="task-panel">
                  <header className="panel-head">
                    <div><span className="eyebrow">ACTIVE WORK</span><h2>任务执行</h2></div>
                    <button className="icon-button" onClick={() => setView("graph")} title="打开任务图">
                      <ArrowRight size={18} />
                    </button>
                  </header>
                  <div className="task-list">
                    {mission.tasks.map((task) => (
                      <TaskRow key={task.id} task={task} agents={mission.agents} onApprove={approve} />
                    ))}
                  </div>
                </section>

                <aside className="activity-panel">
                  <header className="panel-head">
                    <div><span className="eyebrow">EVENT LEDGER</span><h2>协作动态</h2></div>
                    <Archive size={17} />
                  </header>
                  <ul className="event-list">
                    {mission.events.slice(0, 8).map((event) => (
                      <EventItem key={event.id} event={event} agents={mission.agents} />
                    ))}
                  </ul>
                </aside>
              </div>
            </>
          )}
          {view === "graph" && <GraphView mission={mission} onApprove={approve} />}
          {view === "team" && <TeamView mission={mission} />}
          {view === "memory" && <MemoryView mission={mission} />}
        </div>
      </main>
      <CreateMissionDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreate={(title, objective) => {
          setMission(resetMission(initialMission, title, objective));
          setCreating(false);
          setView("graph");
        }}
      />
    </div>
  );
}
