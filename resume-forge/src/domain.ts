export type Experience = {
  id: string;
  company: string;
  role: string;
  period: string;
  bullets: string[];
};

export type ResumeData = {
  name: string;
  targetRole: string;
  email: string;
  phone: string;
  city: string;
  summary: string;
  skills: string[];
  education: string;
  jobDescription: string;
  experiences: Experience[];
};

const KEYWORDS = [
  "产品规划",
  "用户研究",
  "需求分析",
  "项目管理",
  "数据分析",
  "增长",
  "商业化",
  "跨部门",
  "团队管理",
  "用户体验",
  "竞品分析",
  "产品策略",
  "流程优化",
  "客户成功",
  "解决方案",
  "人工智能",
  "大模型",
  "机器学习",
  "SQL",
  "Python",
  "Java",
  "React",
  "TypeScript",
  "Figma",
  "Axure",
  "A/B",
  "OKR",
  "ROI",
  "SaaS",
  "ToB",
  "ToC",
  "B端",
  "C端",
  "AI",
] as const;

const ACTION_WORDS = [
  "负责",
  "主导",
  "推动",
  "设计",
  "搭建",
  "优化",
  "交付",
  "建立",
  "制定",
  "协调",
  "实现",
  "完成",
  "提升",
  "降低",
  "增长",
  "Led",
  "Built",
  "Designed",
  "Improved",
];

const IMPACT_WORDS = [
  "提升",
  "增长",
  "降低",
  "节省",
  "缩短",
  "转化",
  "收入",
  "成本",
  "效率",
  "满意度",
  "交付",
  "覆盖",
];

export const sampleResume: ResumeData = {
  name: "林晓",
  targetRole: "高级产品经理",
  email: "linxiao@example.com",
  phone: "138 0000 0000",
  city: "上海",
  summary:
    "8 年 ToB 产品经验，聚焦 AI 产品落地与复杂项目交付，擅长把客户需求转化为可验证的产品方案。",
  skills: ["产品规划", "用户研究", "数据分析", "项目管理", "AI", "ToB"],
  education: "华东理工大学 · 信息管理与信息系统 · 本科 · 2014-2018",
  jobDescription:
    "负责企业级 AI 产品规划与需求分析，主导大模型解决方案落地；具备用户研究、数据分析、项目管理和跨部门协作经验，能够制定产品策略并推动商业化增长。",
  experiences: [
    {
      id: "exp-1",
      company: "远望科技",
      role: "高级产品经理",
      period: "2022.03 - 至今",
      bullets: [
        "主导企业 AI 助手从 0 到 1 产品规划，覆盖 6 个业务部门，首年服务 1,200 名员工。",
        "建立需求分级与验收机制，将跨部门项目平均交付周期从 10 周缩短至 6 周。",
        "推动客户成功与研发联合复盘，核心功能季度活跃率提升 34%。",
      ],
    },
    {
      id: "exp-2",
      company: "矩阵网络",
      role: "产品经理",
      period: "2018.07 - 2022.02",
      bullets: [
        "负责 SaaS 数据分析产品迭代，通过用户研究重构关键路径，试用转化率提升 21%。",
        "协调销售、设计与研发完成 4 个行业解决方案，支撑年度新增收入 800 万元。",
      ],
    },
  ],
};

export const emptyResume: ResumeData = {
  name: "",
  targetRole: "",
  email: "",
  phone: "",
  city: "",
  summary: "",
  skills: [],
  education: "",
  jobDescription: "",
  experiences: [
    {
      id: "exp-1",
      company: "",
      role: "",
      period: "",
      bullets: [""],
    },
  ],
};

export function normalizeResume(value: Partial<ResumeData> | null | undefined): ResumeData {
  return {
    ...emptyResume,
    ...value,
    skills: Array.isArray(value?.skills) ? value.skills : [],
    experiences:
      Array.isArray(value?.experiences) && value.experiences.length
        ? value.experiences.map((experience, index) => ({
            id: experience.id || `exp-${index + 1}`,
            company: experience.company || "",
            role: experience.role || "",
            period: experience.period || "",
            bullets: Array.isArray(experience.bullets) && experience.bullets.length
              ? experience.bullets
              : [""],
          }))
        : emptyResume.experiences,
  };
}

function includesKeyword(text: string, keyword: string) {
  return text.toLowerCase().includes(keyword.toLowerCase());
}

export function extractKeywords(jobDescription: string) {
  const text = jobDescription.trim();
  if (!text) return [];
  return KEYWORDS.filter((keyword) => includesKeyword(text, keyword)).slice(0, 14);
}

export function resumePlainText(resume: ResumeData) {
  return [
    resume.targetRole,
    resume.summary,
    resume.skills.join(" "),
    resume.education,
    ...resume.experiences.flatMap((experience) => [
      experience.company,
      experience.role,
      ...experience.bullets,
    ]),
  ].join(" ");
}

export function analyzeMatch(resume: ResumeData) {
  const keywords = extractKeywords(resume.jobDescription);
  const text = resumePlainText(resume);
  const matched = keywords.filter((keyword) => includesKeyword(text, keyword));
  const missing = keywords.filter((keyword) => !includesKeyword(text, keyword));
  const completenessChecks = [
    resume.name.trim(),
    resume.targetRole.trim(),
    resume.email.trim() || resume.phone.trim(),
    resume.summary.trim(),
    resume.skills.length >= 3,
    resume.education.trim(),
    resume.experiences.some(
      (experience) =>
        experience.company.trim() &&
        experience.role.trim() &&
        experience.bullets.some((bullet) => bullet.trim()),
    ),
  ];
  const completeness = completenessChecks.filter(Boolean).length / completenessChecks.length;
  const keywordCoverage = keywords.length ? matched.length / keywords.length : 0;
  const score = Math.round((keywordCoverage * 0.72 + completeness * 0.28) * 100);
  return {
    score,
    keywords,
    matched,
    missing,
    completeness: Math.round(completeness * 100),
    keywordCoverage: Math.round(keywordCoverage * 100),
  };
}

export function analyzeBullet(bullet: string) {
  const text = bullet.trim();
  const hasAction = ACTION_WORDS.some((word) => includesKeyword(text, word));
  const hasMetric = /(?:\d+(?:\.\d+)?%|\d+(?:\.\d+)?\s*(?:万|亿|人|个|家|次|天|周|月|年|小时|分钟)|从.+到.+)/.test(
    text,
  );
  const hasImpact = IMPACT_WORDS.some((word) => text.includes(word));
  const concise = text.length >= 18 && text.length <= 90;
  const score = [hasAction, hasMetric, hasImpact, concise].filter(Boolean).length * 25;
  return {
    score,
    checks: [
      { label: "动作明确", passed: hasAction },
      { label: "包含数字", passed: hasMetric },
      { label: "体现结果", passed: hasImpact },
      { label: "长度适中", passed: concise },
    ],
  };
}

export function buildEvidenceBullet(input: {
  action: string;
  task: string;
  metric: string;
  result: string;
}) {
  const action = input.action.trim();
  const task = input.task.trim();
  const metric = input.metric.trim();
  const result = input.result.trim();
  return [action && task ? `${action}${task}` : action || task, metric, result]
    .filter(Boolean)
    .join("，")
    .replace(/[，。]+$/, "")
    .concat(action || task ? "。" : "");
}

export function documentHealth(resume: ResumeData) {
  const bullets = resume.experiences.flatMap((experience) =>
    experience.bullets.filter((bullet) => bullet.trim()),
  );
  const averageBulletScore = bullets.length
    ? Math.round(
        bullets.reduce((sum, bullet) => sum + analyzeBullet(bullet).score, 0) /
          bullets.length,
      )
    : 0;
  const characterCount = resumePlainText(resume).length;
  return {
    bulletCount: bullets.length,
    averageBulletScore,
    characterCount,
    onePageLikely: characterCount <= 1500 && bullets.length <= 8,
  };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function exportResumeHtml(resume: ResumeData) {
  const skills = resume.skills.map((skill) => `<span>${escapeHtml(skill)}</span>`).join("");
  const experiences = resume.experiences
    .map(
      (experience) => `<section><header><div><h2>${escapeHtml(experience.company)}</h2><b>${escapeHtml(experience.role)}</b></div><time>${escapeHtml(experience.period)}</time></header><ul>${experience.bullets
        .filter(Boolean)
        .map((bullet) => `<li>${escapeHtml(bullet)}</li>`)
        .join("")}</ul></section>`,
    )
    .join("");
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(resume.name)}-简历</title><style>@page{size:A4;margin:14mm}*{box-sizing:border-box}body{width:182mm;margin:0 auto;color:#191919;font-family:"PingFang SC","Microsoft YaHei",sans-serif;font-size:10.5pt;line-height:1.55}h1{margin:0;font-size:25pt;letter-spacing:0}h2{margin:0;font-size:12pt}p{margin:5px 0}.head{display:flex;justify-content:space-between;border-bottom:2px solid #202020;padding-bottom:12px}.role{color:#a33729;font-weight:700}.contact{text-align:right;font-size:9pt}.summary{margin:14px 0}.label{margin:16px 0 8px;color:#a33729;font-size:9pt;font-weight:800;text-transform:uppercase}section{break-inside:avoid;margin-bottom:12px}section header{display:flex;justify-content:space-between;gap:16px}section header b{display:block;margin-top:2px;font-weight:500}time{font-size:9pt;white-space:nowrap}ul{margin:6px 0;padding-left:18px}li{margin:3px 0}.skills{display:flex;flex-wrap:wrap;gap:6px}.skills span{border:1px solid #bbb;padding:3px 7px}@media print{body{width:auto}}@media(max-width:700px){body{width:auto;padding:18px}.head{display:block}.contact{text-align:left;margin-top:8px}}</style><main><header class="head"><div><h1>${escapeHtml(resume.name)}</h1><p class="role">${escapeHtml(resume.targetRole)}</p></div><div class="contact">${escapeHtml(resume.phone)}<br>${escapeHtml(resume.email)}<br>${escapeHtml(resume.city)}</div></header><p class="summary">${escapeHtml(resume.summary)}</p><h3 class="label">Experience / 工作经历</h3>${experiences}<h3 class="label">Skills / 专业技能</h3><div class="skills">${skills}</div><h3 class="label">Education / 教育经历</h3><p>${escapeHtml(resume.education)}</p></main></html>`;
}
