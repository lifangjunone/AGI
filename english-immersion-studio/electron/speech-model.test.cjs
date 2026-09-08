const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtemp, mkdir, writeFile } = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {
  MODEL_FILENAME,
  findSpeechModel,
  loadSpeechModel
} = require("./speech-model.cjs");

test("loads the bundled speech model from production dist", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "eis-speech-model-"));
  const directory = path.join(root, "dist", "speech");
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, MODEL_FILENAME), Buffer.from("model"));

  assert.equal(
    await findSpeechModel(root),
    path.join(directory, MODEL_FILENAME)
  );
  assert.equal((await loadSpeechModel(root)).toString(), "model");
});

test("prefers public assets while running the Vite development app", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "eis-speech-dev-"));
  for (const directory of ["public", "dist"]) {
    const speechDirectory = path.join(root, directory, "speech");
    await mkdir(speechDirectory, { recursive: true });
    await writeFile(
      path.join(speechDirectory, MODEL_FILENAME),
      Buffer.from(directory)
    );
  }

  assert.equal((await loadSpeechModel(root, true)).toString(), "public");
});
