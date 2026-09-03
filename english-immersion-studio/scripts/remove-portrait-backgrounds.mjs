import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const input = path.join(
  root,
  "public",
  process.env.PORTRAIT_INPUT_DIR || "portraits"
);
const output = path.join(
  root,
  "public",
  process.env.PORTRAIT_CUTOUT_DIR || "portrait-cutouts"
);

await mkdir(output, { recursive: true });

await new Promise((resolve, reject) => {
  const child = spawn(
    "uvx",
    [
      "--from",
      "rembg[cpu,cli]",
      "rembg",
      "p",
      "-m",
      "u2net_human_seg",
      input,
      output
    ],
    { cwd: root, stdio: "inherit" }
  );
  child.once("error", reject);
  child.once("exit", (code) => {
    if (code === 0) resolve();
    else reject(new Error(`Background removal exited with code ${code}`));
  });
});
