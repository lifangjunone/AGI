import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  appRoot,
  findPackagedRenderer,
  findUnrealEditorExecutable,
  findUnrealEngineRoot,
  isUnrealEditorExecutable,
  lipSyncRoot,
  rendererRoot,
  servicesRoot
} from "./runtime-paths.mjs";

test("keeps runtime services inside the main application", () => {
  assert.equal(servicesRoot, path.join(appRoot, "services"));
  assert.equal(rendererRoot, path.join(servicesRoot, "metahuman-renderer"));
  assert.equal(
    lipSyncRoot,
    path.join(servicesRoot, "metahuman-lipsync-service")
  );
});

test("prefers a configured Unreal Engine root when it is valid", () => {
  const root = mkdtempSync(path.join(tmpdir(), "eis-ue-"));
  try {
    mkdirSync(path.join(root, "Engine", "Build", "BatchFiles"), {
      recursive: true
    });
    assert.equal(
      findUnrealEngineRoot({ EIS_UNREAL_ENGINE_ROOT: root }, "darwin"),
      root
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("preserves an explicitly configured renderer path", () => {
  const executable = "/portable/renderer/EnglishImmersionRenderer";
  assert.equal(
    findPackagedRenderer({ EIS_UNREAL_EXECUTABLE: executable }, "darwin"),
    executable
  );
});

test("recognizes Unreal Editor executables on both platforms", () => {
  assert.equal(
    isUnrealEditorExecutable(
      "/Applications/UnrealEditor.app/Contents/MacOS/UnrealEditor"
    ),
    true
  );
  assert.equal(
    isUnrealEditorExecutable("C:\\Epic\\UE_5.7\\UnrealEditor.exe"),
    true
  );
  assert.equal(
    isUnrealEditorExecutable("/renderer/EnglishImmersionRenderer"),
    false
  );
});

test("finds Unreal Editor inside a configured engine root", () => {
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), "eis-ue-editor-"));
  try {
    const editor = path.join(
      temporaryRoot,
      "Engine",
      "Binaries",
      "Mac",
      "UnrealEditor"
    );
    mkdirSync(path.dirname(editor), { recursive: true });
    mkdirSync(path.join(temporaryRoot, "Engine", "Build", "BatchFiles"), {
      recursive: true
    });
    writeFileSync(editor, "");

    assert.equal(
      findUnrealEditorExecutable(
        { EIS_UNREAL_ENGINE_ROOT: temporaryRoot },
        "darwin"
      ),
      editor
    );
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
