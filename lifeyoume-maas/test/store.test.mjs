import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { StateStore } from "../src/store.mjs";

test("model verification is deployment scoped and provider edits invalidate every affected test", async context => {
  const directory = await mkdtemp(join(tmpdir(), "maas-scoped-test-"));
  const store = new StateStore(join(directory, "state.json"), "scoped-test-master-key-longer-than-32-characters");
  await store.load();
  await store.bootstrap({ MAAS_BOOTSTRAP_PROVIDER_API_KEY: "isolated-test-key" });
  const a = store.state.deployments.find(item => item.providerId === "provider-ark");
  const b = { ...a, id: "shared-b", upstreamModel: "second-model", health: "unknown" };
  store.state.deployments.push(b);
  await store.recordProviderTest("provider-ark", { ok: true, code: "model_confirmed", message: "confirmed" }, "test", b.id);
  assert.equal(b.lastTestStatus, "healthy");
  assert.equal(a.lastTestStatus, undefined);
  assert.equal(store.state.providers.find(item => item.id === "provider-ark").lastTestStatus, undefined);
  await store.recordProviderTest("provider-ark", { ok: false, code: "model_not_listed", message: "missing" }, "test", a.id);
  assert.equal(a.health, "unknown");
  assert.equal(b.lastTestStatus, "healthy");
  await assert.rejects(() => store.recordProviderTest("provider-ark", { ok: true }, "test"));
  const model = store.state.logicalModels.find(item => item.routes[0]?.deploymentId === a.id);
  const provider = store.state.providers.find(item => item.id === a.providerId);
  await store.saveModel({ name: model.name, providerName: provider.name,
    baseUrl: "https://changed.test/v1", upstreamModel: a.upstreamModel }, "test", model.id);
  assert.equal(b.lastTestStatus, undefined);
  assert.equal(b.health, "unknown");
});

test("service key names are normalized and invalid names cannot mutate state", async () => {
  const directory = await mkdtemp(join(tmpdir(), "maas-key-name-"));
  const store = new StateStore(join(directory, "state.json"), "key-name-test-master-key-over-32-characters");
  await store.load();
  await store.bootstrap({});
  const created = await store.createApplicationKey("staffdeck", "  生产语音服务  ", "tester");
  assert.equal(created.key.name, "生产语音服务");
  const before = JSON.stringify(store.state);
  for (const name of ["x".repeat(81), "bad\nname", "bad\u0000name"]) {
    await assert.rejects(() => store.createApplicationKey("staffdeck", name, "tester"),
      error => error.status === 400 && error.code === "invalid_key_name");
    assert.equal(JSON.stringify(store.state), before);
  }
});

test("provider credentials are encrypted and application keys are hashed", async () => {
  const directory = await mkdtemp(join(tmpdir(), "maas-store-"));
  const store = new StateStore(join(directory, "state.json"), "a-test-master-key-that-is-longer-than-32-characters");
  await store.load();
  await store.bootstrap({
    MAAS_BOOTSTRAP_PROVIDER_API_KEY: "provider-secret",
    MAAS_BOOTSTRAP_MODEL_ID: "upstream-model"
  });
  assert.equal(store.decrypt(store.state.providers[0].secretEncrypted), "provider-secret");
  assert.equal(JSON.stringify(store.state).includes("provider-secret"), false);
  const created = await store.createApplicationKey("meyou", "test", "tester");
  assert.match(created.token, /^lym_srv_meyou_/);
  assert.equal(JSON.stringify(store.state).includes(created.token), false);
  assert.equal(store.authenticateKey(created.token).application.id, "meyou");
});

test("public state never includes encrypted secrets or key hashes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "maas-public-"));
  const store = new StateStore(join(directory, "state.json"), "another-test-master-key-longer-than-32-characters");
  await store.load();
  await store.bootstrap({});
  await store.createApplicationKey("second-me", "test", "tester");
  const exposed = JSON.stringify(store.publicState());
  assert.equal(exposed.includes("secretEncrypted"), false);
  assert.equal(exposed.includes("tokenHash"), false);
  assert.equal(exposed.includes("provider-secret"), false);
});

test("primary deployment can be configured without returning its credential", async () => {
  const directory = await mkdtemp(join(tmpdir(), "maas-config-"));
  const store = new StateStore(join(directory, "state.json"), "configuration-test-master-key-over-32-characters");
  await store.load();
  await store.bootstrap({});
  const result = await store.configurePrimaryDeployment({
    providerName: "Compatible provider",
    baseUrl: "https://models.example.test/v1/",
    upstreamModel: "chat-model",
    apiKey: "new-provider-secret"
  }, "tester");
  assert.equal(result.deployment.enabled, true);
  assert.equal(result.provider.baseUrl, "https://models.example.test/v1");
  assert.equal(JSON.stringify(result).includes("new-provider-secret"), false);
  assert.equal(store.decrypt(store.state.providers[0].secretEncrypted), "new-provider-secret");
});

test("provider credentials can be revealed only through the audited store method", async () => {
  const directory = await mkdtemp(join(tmpdir(), "maas-reveal-"));
  const store = new StateStore(join(directory, "state.json"), "credential-reveal-master-key-over-32-characters");
  await store.load();
  await store.bootstrap({
    MAAS_BOOTSTRAP_PROVIDER_API_KEY: "sk-secret-ending-2614",
    MAAS_BOOTSTRAP_MODEL_ID: "chat-model"
  });
  assert.equal(store.publicState().providers[0].credentialMasked, "sk-se••••••••2614");
  assert.equal(await store.revealProviderCredential("provider-ark", "admin-user"), "sk-secret-ending-2614");
  assert.equal(store.state.audit[0].action, "provider.credential_revealed");
  assert.equal(store.state.audit[0].actor, "admin-user");
  assert.equal(JSON.stringify(store.publicState()).includes("sk-secret-ending-2614"), false);
});

test("replacing a provider credential invalidates the old saved value", async () => {
  const directory = await mkdtemp(join(tmpdir(), "maas-replace-"));
  const store = new StateStore(join(directory, "state.json"), "credential-replacement-key-over-32-characters");
  await store.load();
  await store.bootstrap({
    MAAS_BOOTSTRAP_PROVIDER_API_KEY: "old-provider-key",
    MAAS_BOOTSTRAP_MODEL_ID: "chat-model"
  });
  await store.configurePrimaryDeployment({
    providerName: "Compatible provider",
    baseUrl: "https://models.example.test/v1",
    upstreamModel: "chat-model",
    apiKey: "new-provider-key"
  }, "tester");
  assert.equal(store.decrypt(store.state.providers[0].secretEncrypted), "new-provider-key");
  assert.equal(JSON.stringify(store.state).includes("old-provider-key"), false);
});

test("model registry supports create update disable and cascading delete", async () => {
  const directory = await mkdtemp(join(tmpdir(), "maas-model-crud-"));
  const store = new StateStore(join(directory, "state.json"), "model-registry-crud-master-key-over-32-characters");
  await store.load();
  await store.bootstrap({});
  await store.saveModel({
    logicalModelId: "lym-chat-extra",
    name: "Extra Chat",
    capability: "chat",
    providerName: "Example",
    baseUrl: "https://models.example.test/v1",
    upstreamModel: "example-chat",
    apiKey: "extra-provider-secret"
  }, "tester");
  const created = store.state.logicalModels.find((item) => item.id === "lym-chat-extra");
  const deployment = store.state.deployments.find((item) => item.id === created.routes[0].deploymentId);
  const provider = store.state.providers.find((item) => item.id === deployment.providerId);
  assert.equal(store.decrypt(provider.secretEncrypted), "extra-provider-secret");

  await store.saveModel({
    name: "Renamed Chat",
    capability: "chat",
    providerName: "Example Updated",
    baseUrl: "https://new.example.test/v1",
    upstreamModel: "example-chat-v2",
    timeoutMs: 30_000,
    temperature: 0.2
  }, "tester", created.id);
  assert.equal(created.name, "Renamed Chat");
  assert.equal(deployment.upstreamModel, "example-chat-v2");
  assert.equal(store.decrypt(provider.secretEncrypted), "extra-provider-secret");

  await store.setModelEnabled(created.id, false, "tester");
  assert.equal(created.enabled, false);
  assert.equal(deployment.enabled, false);
  assert.equal(provider.enabled, false);

  await store.recordProviderTest(provider.id, { ok: true, latencyMs: 20, message: "ok" }, "tester");
  await store.saveModel({
    name: "Disabled updated",
    providerName: provider.name,
    baseUrl: "https://changed.example.test/v1",
    upstreamModel: deployment.upstreamModel
  }, "tester", created.id);
  assert.equal(created.enabled, false);
  assert.equal(provider.lastTestStatus, undefined);
  assert.equal(deployment.health, "unknown");

  store.state.applications[0].allowedModels.push(created.id);
  await store.deleteModel(created.id, "tester");
  assert.equal(store.state.logicalModels.some((item) => item.id === created.id), false);
  assert.equal(store.state.deployments.some((item) => item.id === deployment.id), false);
  assert.equal(store.state.providers.some((item) => item.id === provider.id), false);
  assert.equal(store.state.applications[0].allowedModels.includes(created.id), false);
});

test("managed runtime models cannot be modified or deleted", async () => {
  const directory = await mkdtemp(join(tmpdir(), "maas-managed-model-"));
  const store = new StateStore(join(directory, "state.json"), "managed-model-protection-key-over-32-characters");
  await store.load();
  await store.bootstrap({});
  await assert.rejects(
    () => store.deleteModel("lym-tts-realtime", "tester"),
    /managed_model_cannot_be_deleted/
  );
  await assert.rejects(
    () => store.setModelEnabled("lym-tts-realtime", false, "tester"),
    /managed_model_read_only/
  );
});

test("revoked application keys stop authenticating immediately", async () => {
  const directory = await mkdtemp(join(tmpdir(), "maas-revoke-"));
  const store = new StateStore(join(directory, "state.json"), "revocation-test-master-key-over-32-characters");
  await store.load();
  await store.bootstrap({});
  const created = await store.createApplicationKey("meyou", "test", "tester");
  assert.ok(store.authenticateKey(created.token));
  await store.revokeApplicationKey(created.key.id, "tester");
  assert.equal(store.authenticateKey(created.token), null);
});

test("existing state is upgraded with a real TTS runtime route without replacing keys", async () => {
  const directory = await mkdtemp(join(tmpdir(), "maas-tts-upgrade-"));
  const store = new StateStore(join(directory, "state.json"), "tts-upgrade-test-master-key-over-32-characters");
  await store.load();
  await store.bootstrap({});
  const created = await store.createApplicationKey("second-me", "test", "tester");
  store.state.providers = store.state.providers.filter((item) => item.id !== "provider-tts-runtime");
  store.state.deployments = store.state.deployments.filter((item) => item.id !== "deployment-tts-cpu");
  const ttsModel = store.state.logicalModels.find((item) => item.id === "lym-tts-realtime");
  ttsModel.routes = [];
  delete ttsModel.managed;
  await store.persist();

  const upgraded = new StateStore(store.path, "tts-upgrade-test-master-key-over-32-characters");
  await upgraded.load();
  await upgraded.bootstrap({ MAAS_TTS_BASE_URL: "http://tts-runtime:43281/v1" });

  assert.equal(upgraded.authenticateKey(created.token).application.id, "second-me");
  assert.equal(upgraded.state.providers.find((item) => item.id === "provider-tts-runtime").kind, "internal");
  assert.equal(upgraded.state.deployments.find((item) => item.id === "deployment-tts-cpu").enabled, true);
  assert.deepEqual(
    upgraded.state.logicalModels.find((item) => item.id === "lym-tts-realtime").routes,
    [{ deploymentId: "deployment-tts-cpu", priority: 1, weight: 100 }]
  );
  assert.equal(upgraded.state.logicalModels.find((item) => item.id === "lym-tts-realtime").managed, true);
});
