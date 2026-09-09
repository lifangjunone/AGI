import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = path.join(root, ".env.local");
const targetDirectory = path.join(os.homedir(), "Library", "Application Support", "长卷制片厂");
const target = path.join(targetDirectory, ".env.local");

async function findExecutable(name) {
  const candidates = [
    ...(process.env.PATH || "").split(path.delimiter).filter(Boolean).map((directory) => path.join(directory, name)),
    `/opt/homebrew/bin/${name}`,
    `/usr/local/bin/${name}`,
    `/Users/bytedance/Desktop/projects/.tools/homebrew/bin/${name}`
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

const content = await readFile(source, "utf8").catch(() => {
  throw new Error("缺少 .env.local，请先从 .env.example 创建配置");
});
const [ffmpeg, ffprobe] = await Promise.all([findExecutable("ffmpeg"), findExecutable("ffprobe")]);
const additions = [
  ffmpeg && `FFMPEG_PATH=${ffmpeg}`,
  ffprobe && `FFPROBE_PATH=${ffprobe}`
].filter(Boolean);

await mkdir(targetDirectory, { recursive: true, mode: 0o700 });
await writeFile(target, `${content.trim()}\n${additions.join("\n")}\n`, { mode: 0o600 });
console.log(`Desktop configuration installed: ${target}`);
