const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const specPath = path.join(
  root,
  ".trae",
  "specs",
  "work-order-approval",
  "SPEC.md"
);
const casesPath = path.join(root, "docs", "testing", "业务测试用例.md");
const e2ePath = path.join(root, "e2e", "work-orders.spec.js");

const spec = fs.readFileSync(specPath, "utf8");
const cases = fs.readFileSync(casesPath, "utf8");
const e2e = fs.readFileSync(e2ePath, "utf8");
const errors = [];

for (let index = 1; index <= 8; index += 1) {
  const suffix = String(index).padStart(3, "0");
  const ids = {
    req: `REQ-WO-${suffix}`,
    br: `BR-WO-${suffix}`,
    tc: `TC-WO-${suffix}`,
    e2e: `E2E-WO-${suffix}`
  };
  if (!spec.includes(ids.req) || !spec.includes(ids.br)) {
    errors.push(`${ids.req} / ${ids.br} 缺少规格映射`);
  }
  const mapping = `${ids.req} | ${ids.br} | ${ids.tc} | ${ids.e2e}`;
  if (!cases.includes(mapping)) {
    errors.push(`${mapping} 缺少测试用例映射`);
  }
  const titlePattern = new RegExp(
    `${ids.req}.*${ids.br}.*${ids.tc}.*${ids.e2e}`
  );
  if (!titlePattern.test(e2e)) {
    errors.push(`${ids.e2e} 标题未包含完整四级编号`);
  }
}

const idPattern = /(REQ|BR|TC|E2E)-WO-\d{3}/g;
const mappedIds = cases.match(idPattern) || [];
const counts = mappedIds.reduce((result, id) => {
  result[id] = (result[id] || 0) + 1;
  return result;
}, {});
for (const [id, count] of Object.entries(counts)) {
  if (count !== 1) errors.push(`${id} 在测试映射中出现 ${count} 次`);
}

if (mappedIds.length !== 32) {
  errors.push(`追踪映射应包含 32 个编号，实际 ${mappedIds.length}`);
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("追踪门禁通过：8 REQ → 8 BR → 8 TC → 8 E2E，编号唯一且无孤儿");
