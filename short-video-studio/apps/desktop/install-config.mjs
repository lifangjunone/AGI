import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourcePath = path.join(projectRoot, ".env.local");
const targetDirectory = path.join(os.homedir(), "Library", "Application Support", "FRAME 60");
const targetPath = path.join(targetDirectory, ".env.local");

async function findExecutable(name) {
  const candidates = [
    ...String(process.env.PATH || "")
      .split(path.delimiter)
      .filter(Boolean)
      .map((directory) => path.join(directory, name)),
    `/opt/homebrew/bin/${name}`,
    `/usr/local/bin/${name}`
  ];

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Continue through executable candidates.
    }
  }
  return undefined;
}

const source = await readFile(sourcePath, "utf8").catch(() => {
  throw new Error("Missing .env.local. Create it from .env.example before installing desktop config.");
});
const [ffmpegPath, ffprobePath] = await Promise.all([
  findExecutable("ffmpeg"),
  findExecutable("ffprobe")
]);

const additions = [
  ffmpegPath && `FFMPEG_PATH=${ffmpegPath}`,
  ffprobePath && `FFPROBE_PATH=${ffprobePath}`
].filter(Boolean);

await mkdir(targetDirectory, { recursive: true, mode: 0o700 });
await writeFile(targetPath, `${source.trim()}\n${additions.join("\n")}\n`, { mode: 0o600 });
console.log(`Desktop configuration installed: ${targetPath}`);
