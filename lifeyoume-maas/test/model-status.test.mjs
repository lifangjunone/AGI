import assert from "node:assert/strict";
import test from "node:test";
import { modelHealth, matchesModelStatus, modelStatusOptions } from "../public/model-status.js";
import { readNavigation, navigationHash } from "../public/navigation.js";

test("health distinguishes enabled from verified and failed connections", () => {
  const model = { enabled: true };
  const deployment = { enabled: true };
  const provider = { hasCredential: true };
  assert.equal(modelHealth(model, deployment, provider).code, "untested");
  assert.equal(modelHealth(model, deployment, { ...provider, lastTestStatus: "failed" }).code, "untested");
  assert.equal(modelHealth(model, { ...deployment, lastTestStatus: "failed" }, provider).code, "failed");
  assert.equal(modelHealth(model, { ...deployment, lastTestStatus: "healthy" }, provider).label, "目录核验通过");
  assert.equal(modelHealth(model, { ...deployment, lastTestCode: "directory_unavailable" }, provider).label, "无法核验");
  assert.equal(modelHealth(model, { ...deployment, lastTestCode: "model_not_listed" }, provider).label, "目录未找到");
  assert.equal(modelHealth({ enabled: false }, deployment, provider).code, "disabled");
  assert.equal(modelHealth(model, deployment, {}).code, "unconfigured");
  assert.equal(modelHealth(model, deployment, { kind: "internal" }).code, "untested");
});

test("every visible status filters consistently and survives URL restoration", () => {
  const model = { enabled: true };
  const provider = { hasCredential: true };
  const cases = [
    [{ enabled: true }, provider, "untested"],
    [{ enabled: true, lastTestStatus: "healthy" }, provider, "healthy"],
    [{ enabled: true, lastTestStatus: "failed" }, provider, "failed"],
    [{ enabled: true, lastTestCode: "model_not_listed" }, provider, "model_not_listed"],
    [{ enabled: true, lastTestCode: "directory_unavailable" }, provider, "directory_unavailable"],
    [{ enabled: true }, {}, "unconfigured"],
    [{ enabled: false, lastTestCode: "model_not_listed" }, provider, "disabled"]
  ];
  for (const [deployment, configuredProvider, code] of cases) {
    for (const [status] of modelStatusOptions) {
      const expected = status === "all" || status === code
        || (status === "enabled" && deployment.enabled)
        || (status === "needs_verification" && ["untested", "model_not_listed", "directory_unavailable"].includes(code));
      assert.equal(matchesModelStatus(status, model, deployment, configuredProvider), Boolean(expected), `${code}/${status}`);
      assert.equal(readNavigation(navigationHash({ view: "models", status, pageSize: 10 })).status, status);
    }
  }
  assert.equal(matchesModelStatus("invalid", model, { enabled: true }, provider), false);
});
