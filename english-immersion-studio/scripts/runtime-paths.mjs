import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

export const appRoot = path.resolve(import.meta.dirname, "..");
export const workspaceRoot = path.resolve(appRoot, "..");
export const servicesRoot = path.join(appRoot, "services");
export const rendererRoot = path.join(servicesRoot, "metahuman-renderer");
export const lipSyncRoot = path.join(
  servicesRoot,
  "metahuman-lipsync-service"
);
export const rendererProject = path.join(
  rendererRoot,
  "EnglishImmersionRenderer.uproject"
);

function firstExisting(candidates, validate = existsSync) {
  return candidates.filter(Boolean).find((candidate) => validate(candidate));
}

export function findUnrealEngineRoot(
  env = process.env,
  platform = process.platform
) {
  const candidates = [env.EIS_UNREAL_ENGINE_ROOT];
  if (platform === "darwin") {
    candidates.push(
      "/Users/Shared/Epic Games/UE_5.7",
      "/Applications/Epic Games/UE_5.7"
    );
  } else if (platform === "win32") {
    for (const programFiles of [
      env.ProgramW6432,
      env.ProgramFiles,
      "C:\\Program Files"
    ]) {
      if (programFiles) {
        candidates.push(path.join(programFiles, "Epic Games", "UE_5.7"));
      }
    }
  }

  return firstExisting(candidates, (candidate) =>
    existsSync(path.join(candidate, "Engine", "Build", "BatchFiles"))
  );
}

function findFile(root, expectedName, maxDepth) {
  if (!existsSync(root) || maxDepth < 0) return undefined;

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const candidate = path.join(root, entry.name);
    if (entry.isFile() && entry.name === expectedName) return candidate;
    if (entry.isDirectory()) {
      const match = findFile(candidate, expectedName, maxDepth - 1);
      if (match) return match;
    }
  }
  return undefined;
}

export function findPackagedRenderer(
  env = process.env,
  platform = process.platform
) {
  if (env.EIS_UNREAL_EXECUTABLE) return env.EIS_UNREAL_EXECUTABLE;

  const buildRoot = path.join(
    rendererRoot,
    "Build",
    platform === "darwin" ? "Mac" : "Win64"
  );
  const executableName =
    platform === "darwin"
      ? "EnglishImmersionRenderer"
      : "EnglishImmersionRenderer.exe";

  return findFile(buildRoot, executableName, 6);
}

export function findUnrealEditorExecutable(
  env = process.env,
  platform = process.platform
) {
  const engineRoot = findUnrealEngineRoot(env, platform);
  if (!engineRoot) return undefined;
  const candidates =
    platform === "darwin"
      ? [
          path.join(
            engineRoot,
            "Engine",
            "Binaries",
            "Mac",
            "UnrealEditor.app",
            "Contents",
            "MacOS",
            "UnrealEditor"
          ),
          path.join(engineRoot, "Engine", "Binaries", "Mac", "UnrealEditor")
        ]
      : [
          path.join(
            engineRoot,
            "Engine",
            "Binaries",
            "Win64",
            "UnrealEditor.exe"
          )
        ];
  return firstExisting(candidates);
}

export function isUnrealEditorExecutable(executable) {
  const name = executable.split(/[\\/]/).at(-1) ?? "";
  return name.toLowerCase().startsWith("unrealeditor");
}
