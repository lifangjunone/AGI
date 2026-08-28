const ROLE_DEFINITIONS = Object.freeze([
  {
    id: "conductor",
    name: "交付指挥官",
    department: "交付管理",
    stages: [0, 1, 2, 7],
    skills: ["需求理解", "方案编排", "业务验收"],
    toolRole: "work"
  },
  {
    id: "researcher",
    name: "技术调研员",
    department: "技术情报",
    stages: [2],
    skills: ["开源检索", "技术评估", "代码证据"],
    virtualTool: "Technology Exploration"
  },
  {
    id: "builder",
    name: "系统开发员",
    department: "研发交付",
    stages: [3, 5, 6],
    skills: ["系统开发", "交付构建", "本地部署"],
    toolRole: "code"
  },
  {
    id: "verifier",
    name: "质量验证员",
    department: "质量保障",
    stages: [4, 7],
    skills: ["自动化测试", "质量门禁", "业务验收"],
    virtualTool: "OneOPC QA + CodeGraph"
  }
]);

const DEFAULT_EMPLOYEES = Object.freeze([
  {
    id: "OPC-01",
    name: "领航",
    roleId: "conductor",
    responsibility: "理解需求、编排方案并完成业务验收",
    toolBinding: "Trae Work",
    characterVariant: "conductor"
  },
  {
    id: "OPC-02",
    name: "探知",
    roleId: "researcher",
    responsibility: "检索开源实现并建立需求到代码证据",
    toolBinding: "Technology Exploration",
    characterVariant: "researcher"
  },
  {
    id: "OPC-03",
    name: "构建",
    roleId: "builder",
    responsibility: "实现、交付并部署可直接使用的系统",
    toolBinding: "Trae Code",
    characterVariant: "builder"
  },
  {
    id: "OPC-04",
    name: "守验",
    roleId: "verifier",
    responsibility: "执行测试、验收门禁和回归验证",
    toolBinding: "OneOPC QA + CodeGraph",
    characterVariant: "verifier"
  }
].map((employee) => ({
  ...employee,
  status: "active",
  builtIn: true,
  source: {
    type: "open-source-inspired",
    repository: "https://github.com/multica-ai/multica",
    note: "借鉴开源 Agent 团队的角色分工，由 OneOPC 实现"
  },
  createdAt: "2026-08-17T00:00:00.000Z",
  updatedAt: "2026-08-17T00:00:00.000Z"
})));

function roleDefinition(roleId) {
  return ROLE_DEFINITIONS.find((role) => role.id === roleId) || null;
}

function hydrateEmployee(employee) {
  const role = roleDefinition(employee.roleId);
  if (!role) return null;
  return {
    ...role,
    ...employee,
    roleName: role.name,
    department: employee.department || role.department,
    stages: role.stages,
    skills: Array.isArray(employee.skills) && employee.skills.length
      ? employee.skills
      : role.skills
  };
}

function normalizeRegistry(value) {
  const persisted = Array.isArray(value?.employees) ? value.employees : [];
  const byId = new Map(persisted.map((employee) => [employee.id, employee]));
  for (const employee of DEFAULT_EMPLOYEES) {
    if (!byId.has(employee.id)) byId.set(employee.id, employee);
  }
  return {
    schemaVersion: 1,
    employees: [...byId.values()].map(hydrateEmployee).filter(Boolean)
  };
}

function validateEmployee(input, existing = null) {
  const role = roleDefinition(input.roleId);
  if (!role) throw new Error("不支持的数字员工岗位");
  const name = String(input.name || "").trim();
  if (name.length < 2 || name.length > 12) {
    throw new Error("数字员工名称应为 2-12 个字符");
  }
  const responsibility = String(input.responsibility || "").trim();
  if (responsibility.length < 4 || responsibility.length > 80) {
    throw new Error("岗位职责应为 4-80 个字符");
  }
  const skills = Array.isArray(input.skills)
    ? input.skills
    : String(input.skills || "").split(/[,，]/);
  return hydrateEmployee({
    ...existing,
    name,
    roleId: role.id,
    department: String(input.department || role.department).trim(),
    responsibility,
    skills: skills.map((skill) => String(skill).trim()).filter(Boolean).slice(0, 8),
    toolBinding: String(input.toolBinding || role.virtualTool || "").trim(),
    characterVariant: role.id,
    status: input.status === "inactive" ? "inactive" : "active"
  });
}

function employeeRequirementScore(employee, requirementText = "") {
  const haystack = String(requirementText).toLowerCase();
  if (!haystack) return 0;
  return (employee.skills || []).reduce(
    (score, skill) =>
      haystack.includes(String(skill).toLowerCase()) ? score + 20 : score,
    0
  );
}

function selectProjectTeam(employees, requestedIds = [], requirementText = "") {
  const active = employees.filter((employee) => employee.status === "active");
  const requested = requestedIds
    .map((id) => active.find((employee) => employee.id === id))
    .filter(Boolean);
  return ROLE_DEFINITIONS.map((role) => {
    const candidates = active
      .filter((employee) => employee.roleId === role.id)
      .sort(
        (left, right) =>
          employeeRequirementScore(right, requirementText) -
            employeeRequirementScore(left, requirementText) ||
          Number(right.builtIn) - Number(left.builtIn)
      );
    const employee =
      requested.find((candidate) => candidate.roleId === role.id) ||
      candidates[0];
    return employee
      ? {
          ...employee,
          requirementScore: employeeRequirementScore(employee, requirementText)
        }
      : null;
  }).filter(Boolean);
}

module.exports = {
  DEFAULT_EMPLOYEES,
  ROLE_DEFINITIONS,
  employeeRequirementScore,
  hydrateEmployee,
  normalizeRegistry,
  roleDefinition,
  selectProjectTeam,
  validateEmployee
};
