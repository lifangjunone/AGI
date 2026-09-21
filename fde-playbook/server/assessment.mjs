import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(
  readFileSync(resolve(HERE, "../shared/assessment-data.json"), "utf8"),
);

const PLAYBOOK = {
  value: {
    diagnosis: "项目仍在讨论“做什么功能”，还没有锁定必须改善的业务结果。",
    impact: "范围会持续膨胀，最终只能用演示效果代替真实收益。",
    action: "约一次 45 分钟范围会，只保留“一个角色、一个动作、一个业务数字”。",
    script: "先不聊模型。如果三个月后项目算成功，您会用哪个业务数字判断？",
    evidence: ["业务现状基线", "一期范围说明", "业务负责人确认记录"],
  },
  acceptance: {
    diagnosis: "验收口径不完整，项目结束时很可能出现双方各说各话。",
    impact: "即使模型效果不错，也可能因为业务价值无法证明而无法续约或扩点。",
    action: "把业务结果、系统质量、真实采纳三类指标写进同一张验收表。",
    script: "如果上线四周后要决定是否继续投入，我们今天就把判断标准写下来。",
    evidence: ["指标基线与目标值", "评测数据来源", "验收责任人签字"],
  },
  data: {
    diagnosis: "真实数据链路或合规授权尚未闭环，当前结果无法代表生产环境。",
    impact: "项目可能在模型已完成后才发现数据拿不到，造成整体停摆。",
    action: "建立最小字段清单，并让数据、安全、业务三方确认用途与留存期限。",
    script: "我不需要全部数据。我们只围绕这个判断真正依赖的最小字段集合申请。",
    evidence: ["最小字段清单", "权限审批记录", "脱敏与留存方案"],
  },
  production: {
    diagnosis: "Demo 与生产之间缺少监控、降级、回滚或人工确认机制。",
    impact: "技术演示可以成功，但业务方仍不敢把真实流量交给系统。",
    action: "按数据、权限、监控、回滚、运维五项建立生产差距清单并分配负责人。",
    script: "POC 的目标不是证明它聪明，而是提前暴露所有让它不敢上线的东西。",
    evidence: ["生产差距清单", "灰度与回滚方案", "监控告警截图"],
  },
  alignment: {
    diagnosis: "客户对能力边界和项目节奏缺少一致认知，信任正在被不确定性消耗。",
    impact: "范围和承诺会在项目中途漂移，坏消息最终集中在验收阶段爆发。",
    action: "发布“能做 / 不能做 / 需要人确认”三栏边界，并固定每周风险同步。",
    script: "这个目标可以探索，但不建议写进本阶段验收，我不想用做不到的承诺换今天的高兴。",
    evidence: ["能力边界清单", "周度风险记录", "关键决策纪要"],
  },
  handoff: {
    diagnosis: "客户侧尚未形成独立运行能力，项目价值依赖交付团队持续在场。",
    impact: "项目结束后使用率会快速下降，也难以形成续约和口碑案例。",
    action: "让客户责任人独立完成一次操作、一次异常处置和一次结果复盘。",
    script: "验收当天请你们团队独立跑一遍，我在旁边不代劳，能跑通才算交接成功。",
    evidence: ["运行与应急手册", "客户实操记录", "支持窗口与升级路径"],
  },
};

const LEVELS = [
  { min: 75, key: "controlled", label: "风险可控", summary: "基础条件较完整，重点是把证据固化并推进灰度。" },
  { min: 55, key: "warning", label: "存在明显风险", summary: "项目可以继续，但必须先处理最高风险项再扩大投入。" },
  { min: 35, key: "high", label: "高风险", summary: "当前方案很可能在验收或上线阶段受阻，应立即收敛范围。" },
  { min: 0, key: "critical", label: "极高风险", summary: "项目尚不具备继续投入条件，建议暂停开发并重做立项。" },
];

export function getAssessmentCatalog() {
  return catalog;
}

export function assessProject(answers) {
  if (!answers || typeof answers !== "object") {
    throw new Error("answers must be an object");
  }

  const totals = new Map(catalog.dimensions.map((dimension) => [dimension.id, []]));
  const normalizedAnswers = {};

  for (const question of catalog.questions) {
    const raw = answers[question.id];
    const score = Number(raw);
    const allowed = question.options.some((option) => option.score === score);
    if (!allowed) throw new Error(`invalid answer: ${question.id}`);
    totals.get(question.dimension).push(score);
    normalizedAnswers[question.id] = score;
  }

  const dimensions = catalog.dimensions.map((dimension) => {
    const scores = totals.get(dimension.id);
    const score = Math.round(
      (scores.reduce((sum, value) => sum + value, 0) / (scores.length * 3)) * 100,
    );
    return {
      ...dimension,
      score,
      ...PLAYBOOK[dimension.id],
    };
  });

  const overall = Math.round(
    dimensions.reduce((sum, dimension) => sum + dimension.score, 0) /
      dimensions.length,
  );
  const level = LEVELS.find((item) => overall >= item.min);
  const risks = [...dimensions].sort((a, b) => a.score - b.score);
  const topRisks = risks.slice(0, 3);

  return {
    overall,
    level,
    dimensions,
    topRisks,
    answers: normalizedAnswers,
    preview: {
      overall,
      level,
      topRisks: topRisks.map(({ id, name, score, diagnosis }) => ({
        id,
        name,
        score,
        diagnosis,
      })),
      immediateAction: topRisks[0].action,
    },
    fullReport: {
      executiveSummary: `${level.label}：${level.summary} 当前最优先处理“${topRisks[0].name}”，再依次解决“${topRisks[1].name}”和“${topRisks[2].name}”。`,
      dimensions,
      priorities: topRisks.map((risk, index) => ({
        rank: index + 1,
        ...risk,
      })),
      sevenDayPlan: topRisks.map((risk, index) => ({
        day: index === 0 ? "第 1–2 天" : index === 1 ? "第 3–4 天" : "第 5–7 天",
        title: risk.name,
        action: risk.action,
        evidence: risk.evidence,
      })),
      meetingScripts: topRisks.map(({ name, script }) => ({ name, script })),
    },
  };
}
