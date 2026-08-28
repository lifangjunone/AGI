const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {
  analyzeTechnology,
  buildQueryProfile,
  readRecentReports
} = require("../src/tech-intelligence");

test("设备检修需求生成工作流与工单检索词", () => {
  const profile = buildQueryProfile({
    id: "OP-TEST",
    title: "设备检修工单管理需求说明书",
    input: { name: "设备检修工单管理需求说明书.pdf" }
  });
  assert.ok(profile.capabilities.includes("work order"));
  assert.ok(profile.capabilities.includes("workflow"));
  assert.ok(profile.capabilities.includes("工单"));
  assert.equal(profile.constraints.external_data_upload, false);
});

test("损坏报告被隔离且有效报告仍可召回 GitHub 候选", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "oneopc-intelligence-")
  );
  try {
    await fs.writeFile(path.join(directory, "broken.json"), "{", "utf8");
    await fs.writeFile(
      path.join(directory, "valid.json"),
      JSON.stringify({
        generated_at: new Date().toISOString(),
        items: [
          {
            title: "Open maintenance workflow engine",
            url: "https://github.com/example/maintenance-flow",
            source: "GitHub Trending",
            summary: "Work order workflow and state machine for maintenance",
            evidence: "GitHub daily trend",
            score: 72,
            total_stars: 1200
          }
        ],
        source_status: [
          { source: "GitHub Trending", status: "ok", items: 1 }
        ]
      }),
      "utf8"
    );

    const reports = await readRecentReports(directory, 7);
    assert.equal(reports.length, 1);

    const result = await analyzeTechnology({
      run: {
        id: "OP-TEST",
        title: "设备检修工单",
        input: { name: "设备检修工单.pdf" }
      },
      mode: "smart",
      reportRoot: directory,
      maxCandidates: 5
    });
    assert.equal(result.status, "completed");
    assert.equal(result.candidates.length, 1);
    assert.equal(
      result.candidates[0].canonical_id,
      "github.com/example/maintenance-flow"
    );
    assert.equal(result.candidates[0].decision, "reference");
    assert.equal(result.candidates[0].verification.build, "not_run");
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("没有报告时返回 unavailable 而不是抛错", async () => {
  const result = await analyzeTechnology({
    run: {
      id: "OP-EMPTY",
      title: "普通业务系统",
      input: { name: "普通业务系统.md" }
    },
    mode: "smart",
    reportRoot: path.join(os.tmpdir(), "missing-oneopc-report-root"),
    maxCandidates: 5
  });
  assert.equal(result.status, "unavailable");
  assert.equal(result.candidates.length, 0);
});
