import type { Agent, Event, Memory, MissionState, Task } from "./types";

const progressStep = (task: Task, cycle: number) =>
  14 + ((task.id.charCodeAt(task.id.length - 1) + cycle) % 13);

const makeEvent = (
  cycle: number,
  agentId: string,
  kind: Event["kind"],
  message: string,
): Event => ({
  id: `E-${cycle}-${agentId}-${kind}`,
  cycle,
  agentId,
  kind,
  message,
});

const allDependenciesDone = (task: Task, tasks: Task[]) =>
  task.dependsOn.every(
    (dependencyId) =>
      tasks.find((candidate) => candidate.id === dependencyId)?.status === "done",
  );

const deriveAgentState = (agents: Agent[], tasks: Task[]) =>
  agents.map((agent) => {
    const assigned = tasks.filter((task) => task.agentId === agent.id);
    const active = assigned.find((task) => task.status === "running");
    const reviewing = assigned.find(
      (task) => task.status === "review" || task.status === "approval",
    );
    const load = active ? Math.max(54, active.progress) : reviewing ? 48 : 18;

    return {
      ...agent,
      status: active ? ("working" as const) : reviewing ? ("reviewing" as const) : ("idle" as const),
      load,
    };
  });

export const advanceMission = (state: MissionState): MissionState => {
  if (!state.running) return state;

  const cycle = state.cycle + 1;
  const events: Event[] = [];
  const memories: Memory[] = [];

  let tasks = state.tasks.map((task) => {
    if (task.status !== "running") return task;

    const progress = Math.min(100, task.progress + progressStep(task, cycle));
    if (progress < 100) {
      if (progress >= 50 && task.progress < 50) {
        events.push(
          makeEvent(
            cycle,
            task.agentId,
            "progress",
            `${task.title} 已通过中段检查，置信度 ${task.confidence}%。`,
          ),
        );
      }
      return { ...task, progress };
    }

    events.push(
      makeEvent(
        cycle,
        task.agentId,
        "handoff",
        `${task.title} 已提交独立评审，产物：${task.artifact ?? "待归档"}`,
      ),
    );
    return { ...task, progress: 100, status: "review" as const };
  });

  tasks = tasks.map((task) => {
    if (task.status !== "review") return task;
    if (task.requiresApproval) {
      events.push(
        makeEvent(
          cycle,
          task.agentId,
          "review",
          `${task.title} 已通过自动门禁，等待人类批准高风险动作。`,
        ),
      );
      return { ...task, status: "approval" as const };
    }

    events.push(
      makeEvent(
        cycle,
        "warden",
        "review",
        `${task.title} 通过独立评审，证据与产物引用完整。`,
      ),
    );
    memories.push({
      id: `M-${cycle}-${task.id}`,
      agentId: task.agentId,
      title: `${task.title}执行经验`,
      detail: `${task.summary} 产物已通过独立质量门禁，可被后续任务检索和复用。`,
      importance: task.confidence,
      cycle,
      tags: ["verified", task.id.toLowerCase()],
    });
    return { ...task, status: "done" as const };
  });

  tasks = tasks.map((task) => {
    if (task.status !== "backlog" || !allDependenciesDone(task, tasks)) return task;
    events.push(
      makeEvent(cycle, task.agentId, "claim", `${task.title} 依赖已满足，进入可执行队列。`),
    );
    return { ...task, status: "ready" as const };
  });

  const busyAgents = new Set(
    tasks.filter((task) => task.status === "running").map((task) => task.agentId),
  );
  tasks = tasks.map((task) => {
    if (task.status !== "ready" || busyAgents.has(task.agentId)) return task;
    busyAgents.add(task.agentId);
    events.push(
      makeEvent(cycle, task.agentId, "claim", `已自主认领 ${task.title}，开始执行。`),
    );
    return {
      ...task,
      status: "running" as const,
      attempts: task.attempts + 1,
      progress: Math.max(8, task.progress),
    };
  });

  const complete = tasks.every((task) => task.status === "done");
  if (complete) {
    events.push(
      makeEvent(cycle, "atlas", "system", "任务图全部完成，发布收据已锁定。"),
    );
  }

  return {
    ...state,
    cycle,
    running: complete ? false : state.running,
    tasks,
    agents: deriveAgentState(state.agents, tasks),
    events: [...events.reverse(), ...state.events].slice(0, 40),
    memories: [...memories, ...state.memories].slice(0, 30),
  };
};

export const approveTask = (state: MissionState, taskId: string): MissionState => {
  const task = state.tasks.find((candidate) => candidate.id === taskId);
  if (!task || task.status !== "approval") return state;

  const cycle = state.cycle + 1;
  const tasks = state.tasks.map((candidate) =>
    candidate.id === taskId ? { ...candidate, status: "done" as const } : candidate,
  );
  const event = makeEvent(
    cycle,
    "human",
    "review",
    `${task.title} 已由人类负责人批准，决策写入事件账本。`,
  );

  return {
    ...state,
    cycle,
    tasks,
    agents: deriveAgentState(state.agents, tasks),
    events: [event, ...state.events],
  };
};

export const resetMission = (
  template: MissionState,
  title?: string,
  objective?: string,
): MissionState => ({
  ...structuredClone(template),
  id: `NX-${Math.floor(100 + Math.random() * 899)}`,
  title: title?.trim() || template.title,
  objective: objective?.trim() || template.objective,
  cycle: 1,
  running: false,
  tasks: template.tasks.map((task, index) => ({
    ...task,
    status: index === 0 ? ("ready" as const) : ("backlog" as const),
    progress: 0,
    attempts: 0,
  })),
  events: [
    makeEvent(1, "atlas", "system", "新任务图已生成，等待启动授权。"),
  ],
  memories: template.memories,
});
