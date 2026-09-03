import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  findPackagedRenderer,
  isUnrealEditorExecutable,
  rendererProject
} from "./runtime-paths.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const devUrl = "http://127.0.0.1:5173";
const mode = args.has("--web")
  ? "web"
  : args.has("--build")
    ? "build"
    : args.has("--check")
      ? "check"
      : "desktop";

if (args.has("--help")) {
  console.log(`English Immersion Studio bootstrap

Usage:
  npm run bootstrap                 Install dependencies and start Electron
  npm run bootstrap -- --web        Start the browser preview only
  npm run bootstrap -- --build      Create a production build
  npm run bootstrap -- --check      Run type checks and tests
  npm run bootstrap -- --no-install Skip automatic dependency installation

Optional environment:
  EIS_UNREAL_EXECUTABLE  Packaged Unreal renderer executable; auto-detected
                         under services/metahuman-renderer/Build when omitted
  EIS_UNREAL_PROJECT     .uproject passed to Unreal Editor builds`);
  process.exit(0);
}

function fail(message) {
  console.error(`[bootstrap] ${message}`);
  process.exit(1);
}

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    env: process.env,
    stdio: "inherit"
  });
  if (result.error) fail(result.error.message);
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function assertNodeVersion() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  const supported =
    (major === 20 && minor >= 19) ||
    (major === 22 && minor >= 12) ||
    major > 22;
  if (!supported) {
    fail(`Node.js 20.19+ is required; found ${process.versions.node}.`);
  }
}

function installDependencies() {
  if (args.has("--no-install") || existsSync(path.join(root, "node_modules"))) {
    return;
  }

  console.log("[bootstrap] Installing locked npm dependencies...");
  run(npm, ["ci"]);
}

let stopping = false;
let renderer = null;
let rendererRestartTimer = null;

function startUnrealRenderer() {
  const executable = findPackagedRenderer();
  if (!executable) return null;
  if (!existsSync(executable)) {
    fail(`EIS_UNREAL_EXECUTABLE does not exist: ${executable}`);
  }

  const unrealArgs = [];
  const project =
    process.env.EIS_UNREAL_PROJECT ??
    (isUnrealEditorExecutable(executable) ? rendererProject : undefined);
  if (project) {
    if (!existsSync(project)) {
      fail(`EIS_UNREAL_PROJECT does not exist: ${project}`);
    }
    unrealArgs.push(project);
    if (isUnrealEditorExecutable(executable)) {
      unrealArgs.push(
        "-game",
        "-windowed",
        "-ResX=1280",
        "-ResY=720",
        "-stdout",
        "-FullStdOutLogOutput"
      );
    }
  }
  const pixelStreamingUrl = process.env.EIS_PIXEL_STREAMING_URL;
  if (pixelStreamingUrl) {
    unrealArgs.push(`-PixelStreamingURL=${pixelStreamingUrl}`, "-AudioMixer");
  }

  console.log(`[bootstrap] Starting Unreal renderer: ${executable}`);
  const child = spawn(executable, unrealArgs, {
    cwd: project ? path.dirname(project) : path.dirname(executable),
    env: process.env,
    stdio: "inherit"
  });
  child.on("error", (error) => {
    console.error(`[bootstrap] Unreal renderer failed: ${error.message}`);
  });
  child.on("exit", (code, signal) => {
    if (stopping) return;
    console.error(
      `[bootstrap] Unreal renderer exited (${signal ?? code ?? "unknown"}); ` +
        "restarting in 3 seconds."
    );
    rendererRestartTimer = setTimeout(() => {
      renderer = startUnrealRenderer();
    }, 3000);
  });
  return child;
}

async function inspectExistingDevServer() {
  try {
    const response = await fetch(devUrl, {
      signal: AbortSignal.timeout(1500)
    });
    const body = await response.text();
    return {
      running: true,
      isStudio: response.ok && body.includes("<title>English Immersion Studio</title>")
    };
  } catch {
    return { running: false, isStudio: false };
  }
}

assertNodeVersion();
installDependencies();

if (mode === "build") {
  run(npm, ["run", "build"]);
  process.exit(0);
}

if (mode === "check") {
  run(npm, ["run", "typecheck"]);
  run(npm, ["test"]);
  process.exit(0);
}

renderer = startUnrealRenderer();
const existingServer = await inspectExistingDevServer();
if (existingServer.running && !existingServer.isStudio) {
  renderer?.kill("SIGTERM");
  fail(`Port 5173 is occupied by another service. Stop it and run again.`);
}
if (mode === "web" && existingServer.isStudio) {
  console.log(`[bootstrap] Web preview is already running at ${devUrl}`);
  renderer?.kill("SIGTERM");
  process.exit(0);
}

const script = existingServer.isStudio ? "dev:electron" : mode === "web" ? "dev:web" : "dev";
if (existingServer.isStudio) {
  console.log(`[bootstrap] Reusing the existing web server at ${devUrl}`);
}
const application = spawn(npm, ["run", script], {
  cwd: root,
  env: process.env,
  stdio: "inherit"
});

function stop(signal) {
  if (stopping) return;
  stopping = true;
  if (rendererRestartTimer) clearTimeout(rendererRestartTimer);
  application.kill(signal);
  renderer?.kill(signal);
}

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));

application.on("error", (error) => fail(error.message));
application.on("exit", (code, signal) => {
  stopping = true;
  if (rendererRestartTimer) clearTimeout(rendererRestartTimer);
  renderer?.kill("SIGTERM");
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
