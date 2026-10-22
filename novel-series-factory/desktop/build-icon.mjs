import { mkdir, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const exec = promisify(execFile);
const desktopDir = dirname(fileURLToPath(import.meta.url));
const source = join(desktopDir, "assets", "story-studio-icon.svg");
const iconset = join(desktopDir, "assets", "StoryStudio.iconset");
const output = join(desktopDir, "assets", "StoryStudio.icns");
const variants = [
  [16, "icon_16x16.png"],
  [32, "icon_16x16@2x.png"],
  [32, "icon_32x32.png"],
  [64, "icon_32x32@2x.png"],
  [128, "icon_128x128.png"],
  [256, "icon_128x128@2x.png"],
  [256, "icon_256x256.png"],
  [512, "icon_256x256@2x.png"],
  [512, "icon_512x512.png"],
  [1024, "icon_512x512@2x.png"],
];

await rm(iconset, { recursive: true, force: true });
await mkdir(iconset, { recursive: true });
for (const [size, filename] of variants) {
  await sharp(source, { density: 192 })
    .resize(size, size)
    .png()
    .toFile(join(iconset, filename));
}
await exec("/usr/bin/iconutil", ["-c", "icns", iconset, "-o", output]);
await rm(iconset, { recursive: true, force: true });
console.log(output);
