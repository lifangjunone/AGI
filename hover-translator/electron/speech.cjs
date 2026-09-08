const { spawn } = require("node:child_process");

function normalizeSpeechText(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 500);
}

function createSpeechService(spawnImpl = spawn) {
  let activeProcess;

  function stop() {
    activeProcess?.kill();
    activeProcess = undefined;
  }

  function speak(value) {
    const text = normalizeSpeechText(value);
    if (!text) return false;

    stop();
    const process = spawnImpl(
      "/usr/bin/say",
      ["-v", "Samantha", "-r", "165", "--", text],
      { stdio: "ignore" },
    );
    activeProcess = process;
    process.once("exit", () => {
      if (activeProcess === process) activeProcess = undefined;
    });
    return true;
  }

  return { speak, stop };
}

module.exports = { createSpeechService, normalizeSpeechText };
