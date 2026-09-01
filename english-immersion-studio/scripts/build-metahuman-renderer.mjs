import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const appRoot = path.resolve(import.meta.dirname, "..");
const projectRoot = path.resolve(appRoot, "..", "metahuman-renderer");
const projectFile = path.join(projectRoot, "EnglishImmersionRenderer.uproject");
const packageBuild = process.argv.includes("--package");

function findEngineRoot() {
  const configured = process.env.EIS_UNREAL_ENGINE_ROOT;
  const candidates = [
    configured,
    process.platform === "darwin"
      ? "/Users/Shared/Epic Games/UE_5.7"
      : "C:\\Program Files\\Epic Games\\UE_5.7"
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate));
}

function fail(message) {
  console.error(`[metahuman-build] ${message}`);
  process.exit(1);
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    env: process.env,
    stdio: "inherit"
  });
  if (result.error) fail(result.error.message);
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const engineRoot = findEngineRoot();
if (!engineRoot) {
  fail(
    "Unreal Engine 5.7 was not found. Install it with MetaHuman Creator Core Data, " +
      "or set EIS_UNREAL_ENGINE_ROOT."
  );
}
if (!existsSync(projectFile)) fail(`Missing Unreal project: ${projectFile}`);

const isMac = process.platform === "darwin";
const batchRoot = path.join(engineRoot, "Engine", "Build", "BatchFiles");
const buildTool = isMac
  ? path.join(batchRoot, "Mac", "Build.sh")
  : path.join(batchRoot, "Build.bat");
if (!existsSync(buildTool)) fail(`Missing Unreal build tool: ${buildTool}`);

const platform = isMac ? "Mac" : "Win64";
console.log(`[metahuman-build] Building UE 5.7 editor target for ${platform}...`);
run(buildTool, [
  "EnglishImmersionRendererEditor",
  platform,
  "Development",
  projectFile,
  "-waitmutex"
]);

if (packageBuild) {
  const runUat = isMac
    ? path.join(batchRoot, "RunUAT.command")
    : path.join(batchRoot, "RunUAT.bat");
  const archive = path.join(projectRoot, "Build", platform);
  if (!existsSync(runUat)) fail(`Missing Unreal Automation Tool: ${runUat}`);
  console.log(`[metahuman-build] Packaging renderer to ${archive}...`);
  run(runUat, [
    "BuildCookRun",
    `-project=${projectFile}`,
    "-noP4",
    `-platform=${platform}`,
    "-clientconfig=Development",
    "-build",
    "-cook",
    "-stage",
    "-pak",
    "-archive",
    `-archivedirectory=${archive}`
  ]);
}
