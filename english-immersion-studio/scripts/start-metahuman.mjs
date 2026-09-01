import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const appRoot = path.resolve(import.meta.dirname, "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const cacheRoot =
  process.env.EIS_PIXEL_STREAMING_ROOT ??
  path.join(homedir(), ".english-immersion-studio", "PixelStreamingInfrastructure-UE5.7");
const serverEntry = path.join(cacheRoot, "SignallingWebServer", "dist", "index.js");
const repository =
  "https://github.com/EpicGamesExt/PixelStreamingInfrastructure.git";
const branch = "UE5.7";
const remoteSignalUrl = process.env.EIS_METAHUMAN_SIGNAL_URL?.trim();

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

if (!remoteSignalUrl && !process.env.EIS_UNREAL_EXECUTABLE) {
  fail(
    "Set EIS_UNREAL_EXECUTABLE to a packaged UE 5.7 renderer, or set " +
      "EIS_METAHUMAN_SIGNAL_URL to an existing Windows/Linux renderer."
  );
}

let signalling = null;
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
      "1"
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

const application = spawn(
  process.execPath,
  [path.join(appRoot, "scripts", "bootstrap.mjs"), "--no-install"],
  {
    cwd: appRoot,
    env: {
      ...process.env,
      EIS_PIXEL_STREAMING_URL: signalling
        ? "ws://127.0.0.1:8888"
        : process.env.EIS_PIXEL_STREAMING_URL,
      VITE_METAHUMAN_SIGNAL_URL: signalUrl
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
}

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));

application.on("exit", (code, signal) => {
  signalling?.kill("SIGTERM");
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
