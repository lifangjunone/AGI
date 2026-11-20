import { completeWithMaas, maasConfiguration } from "./maas-client.mjs";

const CATEGORY_HINTS = {
  "网页小游戏": "优先验证一个反转玩法，不要一开始做关卡编辑器。",
  "互动玩具": "先把手感和视觉记忆点做出来，功能可以非常少。",
  "前端微动效": "适合先做可复制的 npm/脚本接入，再补官网演示。",
  "AI 角色体验": "要把模型能力藏在体验后面，别做成又一个聊天壳。",
  "Agent 基础设施": "先服务自己的自动化工作流，再抽象成通用工具。",
  "开发者效率": "通知要克制，核心价值是减少切窗口和复制日志。",
  "内容结构化": "先找一个小社群的小数据源，做出索引和筛选。",
  "AI 可见性": "报告要给行动建议，不只是罗列 HTTP 状态。",
  "工程安全": "最好能接入 CI，用失败条件表达清楚风险。",
  "教育练习": "题目质量和反馈节奏比课程包装更重要。"
};

export function localInsight(project, userAngle = "") {
  const base = CATEGORY_HINTS[project.category] || "先做一个 1 小时内能体验到价值的薄切片。";
  const angle = userAngle ? `结合你的方向“${userAngle}”，` : "";
  return {
    source: "local",
    title: `${project.name} 可以复刻的不是外壳，而是“${project.signals?.[0] || project.category}”`,
    verdict: `${angle}${base}`,
    buildPlan: [
      `第 1 天：复刻最小闭环——${project.cloneAngle}`,
      "第 2 天：加一个能截图传播的细节，例如动效、排行、报告或分享卡片。",
      "第 3 天：找 5 个真实用户试用，只记录他们愿不愿意第二次打开。"
    ],
    risks: [
      "别一开始做账号、订阅、后台；先证明这个小动作本身好玩或有用。",
      "如果数据依赖第三方页面，先准备静态样例和降级展示。"
    ],
    monetization: "个人项目早期先不急着收费；更适合做成作品集、流量入口或后续工具包的 lead magnet。"
  };
}

function parseJsonObject(text) {
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
      } catch {}
    }
  }
  throw new Error("model_json_parse_failed");
}

function normalizeInsight(value, fallback) {
  const buildPlan = Array.isArray(value.buildPlan) ? value.buildPlan.map(String).slice(0, 4) : fallback.buildPlan;
  const risks = Array.isArray(value.risks) ? value.risks.map(String).slice(0, 3) : fallback.risks;
  return {
    source: "maas",
    title: String(value.title || fallback.title).slice(0, 120),
    verdict: String(value.verdict || fallback.verdict).slice(0, 420),
    buildPlan,
    risks,
    monetization: String(value.monetization || fallback.monetization).slice(0, 260)
  };
}

export async function createProjectInsight(project, { userAngle = "", env = process.env } = {}) {
  const fallback = localInsight(project, userAngle);
  const configuration = maasConfiguration(env);
  if (!configuration) return fallback;

  const prompt = {
    project: {
      name: project.name,
      category: project.category,
      tagline: project.tagline,
      why: project.why,
      cloneAngle: project.cloneAngle,
      difficulty: project.difficulty,
      signals: project.signals,
      stack: project.stack
    },
    userAngle
  };

  try {
    const content = await completeWithMaas(configuration, [
      {
        role: "system",
        content: [
          "你是一个中文个人项目孵化顾问。",
          "你的任务是把一个已存在的小项目拆成可复刻、可二创、可三天启动的方案。",
          "只输出 JSON 对象，不要 Markdown。",
          "字段：title 字符串；verdict 字符串；buildPlan 字符串数组；risks 字符串数组；monetization 字符串。",
          "语言要短、具体、有一点灵气，但不要夸张承诺收益。"
        ].join("")
      },
      {
        role: "user",
        content: JSON.stringify(prompt)
      }
    ]);
    return normalizeInsight(parseJsonObject(content), fallback);
  } catch (error) {
    return { ...fallback, source: "fallback", error: error.message || "model_failed" };
  }
}

export function rankProjects(projects, filters = {}) {
  const query = String(filters.query || "").trim().toLowerCase();
  const category = String(filters.category || "").trim();
  return projects
    .map((project) => {
      const haystack = [
        project.name,
        project.tagline,
        project.category,
        project.why,
        project.cloneAngle,
        ...(project.signals || []),
        ...(project.stack || [])
      ].join(" ").toLowerCase();
      let score = 0;
      if (!query || haystack.includes(query)) score += 4;
      if (category && project.category === category) score += 4;
      score += (project.signals || []).length;
      if (project.difficulty === "低" || project.difficulty === "低中") score += 2;
      if (project.source === "V2EX") score += 1;
      return { ...project, score };
    })
    .filter((project) => project.score > 0 && (!category || project.category === category))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "zh-Hans-CN"));
}
