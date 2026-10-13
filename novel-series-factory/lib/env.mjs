import { readFile } from "node:fs/promises";

function parseEnv(source) {
  const values = {};
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      value.length >= 2 &&
      ((value.startsWith("\"") && value.endsWith("\"")) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

async function readEnvFile(path) {
  if (!path) return {};
  try {
    return parseEnv(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

export async function loadProjectEnv(projectRoot) {
  const localPath = `${projectRoot}/.env.local`;
  const local = await readEnvFile(localPath);
  const reference = await readEnvFile(local.REFERENCE_ENV_FILE);
  return {
    ...reference,
    ...local,
    ...process.env,
  };
}
