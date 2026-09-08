const { access, readFile } = require("node:fs/promises");
const path = require("node:path");

const MODEL_FILENAME = "vosk-model-small-en-us-0.15.tar.gz";

async function findSpeechModel(appPath, development = false) {
  const roots = development
    ? ["public", "dist"]
    : ["dist", "public"];
  for (const root of roots) {
    const candidate = path.join(appPath, root, "speech", MODEL_FILENAME);
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Continue to the packaged/development fallback.
    }
  }
  throw new Error("Bundled offline speech model is missing.");
}

async function loadSpeechModel(appPath, development = false) {
  const modelPath = await findSpeechModel(appPath, development);
  return readFile(modelPath);
}

function registerSpeechModelHandlers(ipcMain, app) {
  ipcMain.handle("speech:model", () =>
    loadSpeechModel(app.getAppPath(), Boolean(process.env.VITE_DEV_SERVER_URL))
  );
}

module.exports = {
  MODEL_FILENAME,
  findSpeechModel,
  loadSpeechModel,
  registerSpeechModelHandlers
};
