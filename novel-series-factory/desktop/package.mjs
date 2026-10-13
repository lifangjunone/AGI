import { packager } from "@electron/packager";
const paths = await packager({
  dir: new URL("../", import.meta.url).pathname,
  name: "StoryStudio",
  executableName: "StoryStudio",
  appBundleId: "com.novelseries.studio",
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
console.log(paths.join("\n"));
