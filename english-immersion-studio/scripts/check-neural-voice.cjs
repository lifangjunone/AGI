const { synthesizeSpeech } = require("../electron/tts.cjs");

async function main() {
  const startedAt = Date.now();
  const result = await synthesizeSpeech({
    text: "Welcome back. Let us make this conversation feel completely natural.",
    voiceId: process.argv[2] || "ava-sweet",
    speed: 0.9
  });
  const bytes = Buffer.from(result.audioBase64, "base64").length;
  console.log(`Neural voice ready: ${bytes} bytes in ${Date.now() - startedAt} ms`);
}

main().catch((error) => {
  console.error(`Neural voice check failed: ${error.message}`);
  process.exitCode = 1;
});
