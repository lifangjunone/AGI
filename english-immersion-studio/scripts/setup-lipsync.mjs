import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync
} from "node:fs";
import { rename, rm, writeFile } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { Readable } from "node:stream";

import { lipSyncRoot, workspaceRoot } from "./runtime-paths.mjs";

const serviceRoot = lipSyncRoot;
const venvRoot = path.join(serviceRoot, ".venv");
const venvPython = path.join(
  venvRoot,
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python"
);
const requirements = path.join(serviceRoot, "python", "requirements.txt");
const readyMarker = path.join(venvRoot, ".eis-dependencies-ready");
const modelRoot =
  process.env.EIS_LIPSYNC_MODEL_ROOT ??
  path.join(
    process.env.HOME ?? process.env.USERPROFILE ?? workspaceRoot,
    ".english-immersion-studio",
    "models",
    "audio2lipsync"
  );
const modelPath =
  process.env.EIS_LIPSYNC_MODEL ??
  path.join(modelRoot, "best.pt");
const modelUrl =
  "https://huggingface.co/fotonlabs/unreal-audio2lipsync/resolve/main/best.pt";
const modelSha256 =
  "0214a566c2c8cea1fd8091ab41f018ec25054e5b8f4963ba0dc926004e9b7a28";

function fail(message) {
  console.error(`[lipsync-setup] ${message}`);
  process.exit(1);
}

function run(command, args, cwd = serviceRoot) {
  const result = spawnSync(command, args, {
    cwd,
    env: process.env,
    stdio: "inherit"
  });
  if (result.error || result.status !== 0) {
    fail(result.error?.message ?? `${command} exited with ${result.status}.`);
  }
}

function commandWorks(command, args = []) {
  const result = spawnSync(command, args, {
    stdio: "ignore",
    env: process.env
  });
  return !result.error && result.status === 0;
}

function findPython() {
  const candidates = process.env.EIS_PYTHON
    ? [{ command: process.env.EIS_PYTHON, prefix: [] }]
    : process.platform === "win32"
      ? [
          { command: "py", prefix: ["-3.11"] },
          { command: "python", prefix: [] }
        ]
      : [
          { command: "python3.11", prefix: [] },
          { command: "python3", prefix: [] }
        ];

  for (const candidate of candidates) {
    const args = [
      ...candidate.prefix,
      "-c",
      "import sys; raise SystemExit(0 if (3,10) <= sys.version_info[:2] < (3,13) else 1)"
    ];
    if (commandWorks(candidate.command, args)) return candidate;
  }
  return undefined;
}

async function sha256(filePath) {
  const hash = createHash("sha256");
  await pipeline(createReadStream(filePath), hash);
  return hash.digest("hex");
}

async function downloadModel() {
  if (
    existsSync(modelPath) &&
    await sha256(modelPath) === modelSha256
  ) {
    return;
  }

  mkdirSync(path.dirname(modelPath), { recursive: true });
  const partialPath = `${modelPath}.partial`;
  await rm(partialPath, { force: true });
  console.log("[lipsync-setup] Downloading the MIT lip-sync checkpoint...");
  const response = await fetch(modelUrl, {
    redirect: "follow",
    signal: AbortSignal.timeout(10 * 60 * 1000)
  });
  if (!response.ok || !response.body) {
    fail(`Checkpoint download failed with HTTP ${response.status}.`);
  }
  await pipeline(
    Readable.fromWeb(response.body),
    createWriteStream(partialPath)
  );
  if (await sha256(partialPath) !== modelSha256) {
    await rm(partialPath, { force: true });
    fail("Checkpoint checksum did not match the pinned release.");
  }
  await rename(partialPath, modelPath);
}

if (!existsSync(requirements)) {
  fail(`Missing lip-sync service at ${serviceRoot}.`);
}

if (!existsSync(venvPython)) {
  const python = findPython();
  if (!python) {
    fail(
      "Python 3.10-3.12 was not found. Set EIS_PYTHON to a compatible interpreter."
    );
  }
  console.log("[lipsync-setup] Creating an isolated Python environment...");
  if (commandWorks("uv", ["--version"])) {
    run("uv", [
      "venv",
      "--python",
      python.command === "py" ? "3.11" : python.command,
      venvRoot
    ]);
  } else {
    run(python.command, [...python.prefix, "-m", "venv", venvRoot]);
  }
}

if (!existsSync(readyMarker)) {
  console.log("[lipsync-setup] Installing pinned service dependencies...");
  if (commandWorks("uv", ["--version"])) {
    run("uv", [
      "pip",
      "install",
      "--python",
      venvPython,
      "-r",
      requirements
    ]);
  } else {
    run(venvPython, [
      "-m",
      "pip",
      "install",
      "-r",
      requirements
    ]);
  }
  await writeFile(readyMarker, "ready\n");
}

await downloadModel();
console.log(`[lipsync-setup] Python: ${venvPython}`);
console.log(`[lipsync-setup] Model: ${modelPath}`);
