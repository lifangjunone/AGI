import test from "node:test";
import assert from "node:assert/strict";
import projects from "../data/projects.json" with { type: "json" };
import { createProjectInsight, localInsight, rankProjects } from "../src/insight-engine.mjs";

test("rankProjects filters by category and query", () => {
  const result = rankProjects(projects, { query: "Agent", category: "Agent 基础设施" });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "buzon");
});

test("localInsight creates a practical fallback", () => {
  const insight = localInsight(projects[0], "做成中文小游戏");
  assert.equal(insight.source, "local");
  assert.ok(insight.title.includes(projects[0].name));
  assert.ok(insight.verdict.includes("中文小游戏"));
  assert.ok(insight.buildPlan.length >= 3);
});

test("createProjectInsight falls back without MAAS key", async () => {
  const insight = await createProjectInsight(projects[1], {
    userAngle: "",
    env: {
      MAAS_BASE_URL: "https://maas.lifeyoume.icu/v1",
      MAAS_MODEL_ID: "lym-chat-quality",
      MAAS_SERVICE_KEY: ""
    }
  });
  assert.equal(insight.source, "local");
});
