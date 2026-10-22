import { packager } from "@electron/packager";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import "./build-icon.mjs";
const exec = promisify(execFile);
const paths = await packager({
  dir: fileURLToPath(new URL("../", import.meta.url)),
  name: "故事片场",
  executableName: "故事片场",
  appBundleId: "com.novelseries.studio",
  appCategoryType: "public.app-category.video",
  icon: fileURLToPath(new URL("./assets/StoryStudio.icns", import.meta.url)),
  extendInfo: {
    CFBundleDisplayName: "故事片场",
    CFBundleName: "故事片场",
  },
  platform: "darwin",
  arch: process.arch,
  out: "dist",
  overwrite: true,
  asar: false,
  ignore: [
    /^\/(?:data|artifacts|tests|docs|deployments|dist|\.git|.*\.log)(?:\/|$)/,
    /^\/\.env(?:\.local|\.production|\.development|\.test)?$/,
    /^\/public\/(?:app\.js|index\.html|styles\.css)$/,
    /^\/desktop\/package\.mjs$/,
  ],
  prune: true,
});
for (const appPath of paths) {
  await exec("/usr/bin/codesign", [
    "--force", "--deep", "--sign", "-", `${appPath}/故事片场.app`,
  ]);
}
console.log(paths.join("\n"));
