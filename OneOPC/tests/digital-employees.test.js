const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_EMPLOYEES,
  normalizeRegistry,
  selectProjectTeam,
  validateEmployee
} = require("../src/digital-employees");

test("首次启动内置四岗位开源模式数字员工", () => {
  const registry = normalizeRegistry(null);
  assert.equal(registry.employees.length, 4);
  assert.deepEqual(
    registry.employees.map((employee) => employee.roleId),
    ["conductor", "researcher", "builder", "verifier"]
  );
  assert.ok(
    registry.employees.every(
      (employee) =>
        employee.builtIn &&
        employee.source.repository === "https://github.com/multica-ai/multica"
    )
  );
});

test("客户可创建具备岗位技能和工位的数字员工", () => {
  const employee = validateEmployee({
    name: "筑梦",
    roleId: "builder",
    responsibility: "负责系统开发与自动化部署",
    skills: "系统开发，自动部署",
    toolBinding: "Trae Code"
  });
  assert.equal(employee.roleName, "系统开发员");
  assert.deepEqual(employee.skills, ["系统开发", "自动部署"]);
  assert.equal(employee.status, "active");
});

test("项目优先选聘指定员工并自动补齐四岗位", () => {
  const custom = validateEmployee({
    id: "OPC-CUSTOM",
    name: "筑梦",
    roleId: "builder",
    responsibility: "负责系统开发与自动化部署",
    skills: ["系统开发"],
    status: "active"
  });
  custom.id = "OPC-CUSTOM";
  const team = selectProjectTeam(
    [...DEFAULT_EMPLOYEES, custom],
    ["OPC-CUSTOM"],
    "需要完成系统开发和自动化部署"
  );
  assert.equal(team.length, 4);
  assert.equal(
    team.find((employee) => employee.roleId === "builder").id,
    "OPC-CUSTOM"
  );
  assert.equal(
    team.find((employee) => employee.roleId === "builder").requirementScore,
    20
  );
});
