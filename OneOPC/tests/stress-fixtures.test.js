const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildStressEmployees,
  buildStressRuns
} = require("../src/stress-fixtures");

test("压力运行档案覆盖 20+ 版本、密集事件和任务监管", () => {
  const runs = buildStressRuns([], 72);
  assert.equal(runs.length, 72);
  assert.equal(new Set(runs.map((run) => run.title)).size, 3);
  for (const title of new Set(runs.map((run) => run.title))) {
    assert.equal(
      runs.filter((run) => run.title === title).length,
      24
    );
  }
  assert.equal(runs[0].events.length, 320);
  assert.equal(Object.keys(runs[0].supervision.tools).length, 2);
  assert.equal(runs.every((run) => run.stressFixture), true);
  assert.equal(runs.every((run) => run.techIntelligence), true);
});

test("压力数字员工档案生成 50+ 唯一员工且覆盖四类岗位", () => {
  const employees = buildStressEmployees([], 52);
  assert.equal(employees.length, 52);
  assert.equal(new Set(employees.map((employee) => employee.id)).size, 52);
  assert.deepEqual(
    new Set(employees.map((employee) => employee.roleId)),
    new Set(["conductor", "researcher", "builder", "verifier"])
  );
  assert.equal(employees.every((employee) => employee.skills.length === 4), true);
});

test("压力档案不会修改传入的真实对象", () => {
  const seedRun = {
    id: "REAL",
    title: "真实项目",
    createdAt: "2026-08-18T00:00:00.000Z",
    updatedAt: "2026-08-18T00:00:00.000Z",
    stages: [],
    events: [],
    supervision: { tools: {} }
  };
  const seedEmployee = {
    id: "REAL-EMPLOYEE",
    roleId: "builder",
    skills: ["真实能力"]
  };
  const runSnapshot = structuredClone(seedRun);
  const employeeSnapshot = structuredClone(seedEmployee);

  buildStressRuns([seedRun], 4);
  buildStressEmployees([seedEmployee], 4);

  assert.deepEqual(seedRun, runSnapshot);
  assert.deepEqual(seedEmployee, employeeSnapshot);
});
