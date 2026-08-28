const fs = require("node:fs");
const path = require("node:path");

function readArg(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

const runId = readArg("run");
if (!runId) {
  throw new Error("--run is required");
}

const appData = path.join(
  process.env.HOME,
  "Library",
  "Application Support",
  "OneOPC"
);
const runPath = path.join(appData, "work", "runs", runId, "run.json");
const run = JSON.parse(fs.readFileSync(runPath, "utf8"));
const now = new Date().toISOString();
const stage = Number(readArg("stage", run.currentStage));
const progress = Number(readArg("progress", run.progress));
const status = readArg("status", run.status);
const type = readArg("type");
const summary = readArg("summary");
const detail = readArg("detail", "");
const artifact = readArg("artifact");
const outputUrl = readArg("output-url");

run.currentStage = stage;
run.progress = progress;
run.status = status;
run.updatedAt = now;

if (type && summary) {
  run.events.push({
    at: now,
    stage,
    type,
    summary,
    detail,
    ...(artifact ? { artifact } : {})
  });
}

if (outputUrl) {
  run.output = {
    url: outputUrl,
    status: "healthy",
    deployedAt: now
  };
}

fs.writeFileSync(runPath, `${JSON.stringify(run, null, 2)}\n`, "utf8");
console.log(
  JSON.stringify({
    id: run.id,
    status: run.status,
    stage: run.currentStage,
    progress: run.progress,
    events: run.events.length,
    output: run.output
  })
);
