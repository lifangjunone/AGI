import { mkdirSync, writeFileSync } from "node:fs";
import { StateStore } from "/app/src/store.mjs";

const statePath = process.env.MAAS_DATA_PATH || "/data/state.json";
const masterKey = process.env.MAAS_MASTER_KEY || "";
const outputPath = process.env.NIUMA_ENV_PATH || "/out/app.env";
const applicationId = "niuma-mouthpiece";
const modelId = "lym-chat-quality";

if (masterKey.length < 32) throw new Error("MAAS_MASTER_KEY missing or too short.");

const store = new StateStore(statePath, masterKey);
await store.load();
await store.bootstrap({});

let application = store.state.applications.find((item) => item.id === applicationId);
if (!application) {
  await store.mutate("application.created", "niuma-mouthpiece-deploy", (state) => {
    state.applications.push({
      id: applicationId,
      name: "牛马嘴替",
      enabled: true,
      allowedModels: [modelId],
      rpm: 60,
      monthlyBudgetCny: 100,
      createdAt: new Date().toISOString()
    });
  });
  application = store.state.applications.find((item) => item.id === applicationId);
}

if (!application.allowedModels.includes(modelId)) {
  await store.setApplicationModels(applicationId, {
    allowedModels: [...application.allowedModels, modelId],
    expectedAllowedModels: application.allowedModels
  }, "niuma-mouthpiece-deploy");
}

const created = await store.createApplicationKey(applicationId, "niuma-mouthpiece production", "niuma-mouthpiece-deploy");

mkdirSync("/out", { recursive: true });
writeFileSync(outputPath, [
  "HOST=0.0.0.0",
  "PORT=45410",
  "MAAS_BASE_URL=http://127.0.0.1:43280/v1",
  `MAAS_MODEL_ID=${modelId}`,
  `MAAS_SERVICE_KEY=${created.token}`,
  "MODEL_TIMEOUT_MS=45000",
  ""
].join("\n"), { mode: 0o600 });

console.log(JSON.stringify({
  ok: true,
  applicationId,
  allowedModels: [modelId],
  keyId: created.key.id,
  tokenWritten: true
}));
