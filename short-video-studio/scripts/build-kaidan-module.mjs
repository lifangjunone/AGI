import { execFileSync } from "node:child_process";
import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.resolve(root, "..", "kaidan-page");
const sourceDist = path.join(source, "dist");
const target = path.join(root, "public", "kaidan");

execFileSync("npm", ["run", "build"], {
  cwd: source,
  stdio: "inherit",
});

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(sourceDist, target, { recursive: true });

console.log(`Kaidan module synced to ${target}`);
