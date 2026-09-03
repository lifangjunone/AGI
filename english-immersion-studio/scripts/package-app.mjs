import { spawnSync } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, {
    env,
    stdio: "inherit",
    shell: false
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(npmCommand, ["run", "build"]);
run(
  npmCommand,
  ["exec", "--", "electron-builder", "--dir"],
  process.platform === "darwin"
    ? { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: "false" }
    : process.env
);
