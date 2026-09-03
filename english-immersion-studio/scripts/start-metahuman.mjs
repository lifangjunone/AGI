import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import {
  findPackagedRenderer,
  findUnrealEditorExecutable,
  lipSyncRoot
} from "./runtime-paths.mjs";

const appRoot = path.resolve(import.meta.dirname, "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const cacheRoot =
  process.env.EIS_PIXEL_STREAMING_ROOT ??
  path.join(homedir(), ".english-immersion-studio", "PixelStreamingInfrastructure-UE5.7");
const serverEntry = path.join(cacheRoot, "SignallingWebServer", "dist", "index.js");
const serverWebRoot = path.join(cacheRoot, "SignallingWebServer", "www");
const lipSyncPython = path.join(
  lipSyncRoot,
  ".venv",
  process.platform === "win32" ? "Scripts" : "bin",
  process.platform === "win32" ? "python.exe" : "python"
);
const lipSyncModel =
  process.env.EIS_LIPSYNC_MODEL ??
  path.join(
    homedir(),
    ".english-immersion-studio",
    "models",
    "audio2lipsync",
    "best.pt"
  );
const lipSyncUrl =
  process.env.EIS_LIPSYNC_URL?.trim() || "http://127.0.0.1:8765";
const repository =
  "https://github.com/EpicGamesExt/PixelStreamingInfrastructure.git";
const branch = "UE5.7";
const remoteSignalUrl = process.env.EIS_METAHUMAN_SIGNAL_URL?.trim();
const rendererExecutable =
  findPackagedRenderer() ?? findUnrealEditorExecutable();

function fail(message) {
  console.error(`[metahuman] ${message}`);
  process.exit(1);
}

function run(command, args, cwd = appRoot) {
  const result = spawnSync(command, args, {
    cwd,
    env: process.env,
    stdio: "inherit"
  });
  if (result.error) fail(result.error.message);
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function prepareInfrastructure() {
  if (!existsSync(path.join(cacheRoot, ".git"))) {
    mkdirSync(path.dirname(cacheRoot), { recursive: true });
    console.log("[metahuman] Downloading Epic Pixel Streaming Infrastructure UE5.7...");
    run("git", ["clone", "--depth", "1", "--branch", branch, repository, cacheRoot]);
  }

  if (!existsSync(serverEntry)) {
    console.log("[metahuman] Building the signalling service...");
    run(npm, ["install"], cacheRoot);
    run(npm, ["run", "build:all:cjs"], cacheRoot);
  }
}

function waitForServer(processHandle, timeoutMs = 30000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const check = async () => {
      if (processHandle.exitCode !== null) {
        reject(new Error("Pixel Streaming signalling service exited early."));
        return;
      }
      try {
        await fetch("http://127.0.0.1:8080", {
          signal: AbortSignal.timeout(1000)
        });
        resolve();
      } catch {
        if (Date.now() - started >= timeoutMs) {
          reject(new Error("Timed out waiting for Pixel Streaming signalling."));
          return;
        }
        setTimeout(check, 400);
      }
    };
    void check();
  });
}

async function isLipSyncReady() {
  try {
    const response = await fetch(`${lipSyncUrl}/health`, {
      signal: AbortSignal.timeout(1500)
    });
    if (!response.ok) return false;
    return (await response.json()).status === "ready";
  } catch {
    return false;
  }
}

async function waitForLipSync(processHandle, timeoutMs = 5 * 60 * 1000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (processHandle?.exitCode !== null) {
      throw new Error("Audio-driven lip-sync service exited early.");
    }
    if (await isLipSyncReady()) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("Timed out waiting for the audio-driven lip-sync service.");
}

if (!remoteSignalUrl && !rendererExecutable) {
  fail(
    "No packaged renderer or local Unreal Editor 5.7 was found. Run " +
      "npm run metahuman:package, set EIS_UNREAL_EXECUTABLE, or set " +
      "EIS_METAHUMAN_SIGNAL_URL to an existing renderer."
  );
}

let signalling = null;
let lipSync = null;
let signalUrl = remoteSignalUrl;
if (!signalUrl) {
  prepareInfrastructure();
  signalling = spawn(
    process.execPath,
    [
      serverEntry,
      "--player_port",
      "8080",
      "--streamer_port",
      "8888",
      "--max_players",
      "4",
      "--serve",
      "--http_root",
      serverWebRoot,
      "--homepage",
      "player.html"
    ],
    {
      cwd: path.dirname(serverEntry),
      env: process.env,
      stdio: "inherit"
    }
  );

  try {
    await waitForServer(signalling);
  } catch (error) {
    signalling.kill("SIGTERM");
    fail(error instanceof Error ? error.message : String(error));
  }
  signalUrl = "ws://127.0.0.1:8080";
  console.log(`[metahuman] Signalling ready on ${signalUrl}`);
}

if (process.env.EIS_DISABLE_LIPSYNC !== "1") {
  if (await isLipSyncReady()) {
    console.log(`[metahuman] Reusing lip-sync service at ${lipSyncUrl}`);
  } else if (process.env.EIS_LIPSYNC_URL) {
    fail(`Configured lip-sync service is unavailable at ${lipSyncUrl}.`);
  } else {
    run(process.execPath, [
      path.join(appRoot, "scripts", "setup-lipsync.mjs")
    ]);
    lipSync = spawn(
      lipSyncPython,
      [
        path.join(lipSyncRoot, "python", "src", "server.py"),
        "--ckpt",
        lipSyncModel,
        "--stats-dir",
        path.join(lipSyncRoot, "python", "stats"),
        "--device",
        process.env.EIS_LIPSYNC_DEVICE?.trim() || "auto"
      ],
      {
        cwd: lipSyncRoot,
        env: {
          ...process.env,
          PYTHONUNBUFFERED: "1"
        },
        stdio: "inherit"
      }
    );
    try {
      await waitForLipSync(lipSync);
    } catch (error) {
      lipSync.kill("SIGTERM");
      signalling?.kill("SIGTERM");
      fail(error instanceof Error ? error.message : String(error));
    }
    console.log(`[metahuman] Audio-driven lip sync ready on ${lipSyncUrl}`);
  }
}

const application = spawn(
  process.execPath,
  [path.join(appRoot, "scripts", "bootstrap.mjs"), "--no-install"],
  {
    cwd: appRoot,
    env: {
      ...process.env,
      EIS_UNREAL_EXECUTABLE:
        rendererExecutable ?? process.env.EIS_UNREAL_EXECUTABLE,
      EIS_PIXEL_STREAMING_URL: signalling
        ? "ws://127.0.0.1:8888"
        : process.env.EIS_PIXEL_STREAMING_URL,
      VITE_METAHUMAN_SIGNAL_URL: signalUrl,
      EIS_LIPSYNC_URL: lipSyncUrl
    },
    stdio: "inherit"
  }
);

let stopping = false;
function stop(signal) {
  if (stopping) return;
  stopping = true;
  application.kill(signal);
  signalling?.kill(signal);
  lipSync?.kill(signal);
}

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));

application.on("exit", (code, signal) => {
  signalling?.kill("SIGTERM");
  lipSync?.kill("SIGTERM");
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
