import { mkdirSync, writeFileSync } from "node:fs";
import { StateStore } from "/maas/src/store.mjs";

const statePath = process.env.MAAS_DATA_PATH || "/data/state.json";
const masterKey = process.env.MAAS_MASTER_KEY || "";
const outputPath = process.env.ASTRO_FATE_ENV_PATH || "/out/app.env";

if (masterKey.length < 32) throw new Error("MAAS_MASTER_KEY missing or too short.");

const store = new StateStore(statePath, masterKey);
await store.load();
await store.bootstrap({});

let application = store.state.applications.find((item) => item.id === "astro-fate");
if (!application) {
  await store.mutate("application.created", "astro-fate-deploy", (state) => {
    state.applications.push({
      id: "astro-fate",
      name: "星命矩阵",
      enabled: true,
      allowedModels: ["lym-chat-quality"],
      rpm: 30,
      monthlyBudgetCny: 100,
      createdAt: new Date().toISOString()
    });
  });
  application = store.state.applications.find((item) => item.id === "astro-fate");
}

if (!application.allowedModels.includes("lym-chat-quality")) {
  await store.setApplicationModels("astro-fate", {
    allowedModels: [...application.allowedModels, "lym-chat-quality"],
    expectedAllowedModels: application.allowedModels
  }, "astro-fate-deploy");
}

const created = await store.createApplicationKey("astro-fate", "astro-fate production", "astro-fate-deploy");

mkdirSync("/out", { recursive: true });
writeFileSync(outputPath, [
  "HOST=0.0.0.0",
  "PORT=45330",
  "MAAS_BASE_URL=http://127.0.0.1:43280/v1",
  "MAAS_MODEL_ID=lym-chat-quality",
  `MAAS_SERVICE_KEY=${created.token}`,
  "MODEL_TIMEOUT_MS=120000",
  ""
].join("\n"), { mode: 0o600 });

console.log(JSON.stringify({
  ok: true,
  applicationId: "astro-fate",
  allowedModels: ["lym-chat-quality"],
  keyId: created.key.id,
  tokenWritten: true
}));
