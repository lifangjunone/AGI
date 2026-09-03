import { createHash } from "node:crypto";
import {
  createReadStream,
  createWriteStream,
  existsSync
} from "node:fs";
import {
  mkdir,
  readFile,
  rename,
  rm,
  writeFile
} from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

import { rendererRoot } from "./runtime-paths.mjs";

const manifestPath = path.join(
  rendererRoot,
  "EnvironmentAssets",
  "polyhaven-assets.json"
);
const outputRoot =
  process.env.EIS_ENVIRONMENT_ASSET_ROOT?.trim() ||
  path.join(rendererRoot, "ExternalAssets", "PolyHaven");
const userAgent = "EnglishImmersionStudio/1.0";

function fail(message) {
  console.error(`[environment-setup] ${message}`);
  process.exit(1);
}

async function md5(filePath) {
  const hash = createHash("md5");
  await pipeline(createReadStream(filePath), hash);
  return hash.digest("hex");
}

function safeRelativePath(value) {
  if (
    typeof value !== "string" ||
    !value ||
    path.isAbsolute(value) ||
    value.split(/[\\/]/).includes("..")
  ) {
    fail(`Rejected unsafe asset path: ${String(value)}`);
  }
  return value.replaceAll("/", path.sep);
}

async function downloadFile({ url, destination, expectedMd5 }) {
  if (existsSync(destination) && (await md5(destination)) === expectedMd5) {
    return "cached";
  }

  await mkdir(path.dirname(destination), { recursive: true });
  const partialPath = `${destination}.partial`;
  await rm(partialPath, { force: true });
  const response = await fetch(url, {
    headers: { "User-Agent": userAgent },
    redirect: "follow",
    signal: AbortSignal.timeout(10 * 60 * 1000)
  });
  if (!response.ok || !response.body) {
    fail(`Download failed with HTTP ${response.status}: ${url}`);
  }
  await pipeline(
    Readable.fromWeb(response.body),
    createWriteStream(partialPath)
  );
  const actualMd5 = await md5(partialPath);
  if (actualMd5 !== expectedMd5) {
    await rm(partialPath, { force: true });
    fail(
      `Checksum mismatch for ${url}: expected ${expectedMd5}, got ${actualMd5}`
    );
  }
  await rename(partialPath, destination);
  return "downloaded";
}

function validateManifest(value) {
  if (
    !value ||
    value.version !== 1 ||
    value.provider !== "Poly Haven" ||
    value.license !== "CC0-1.0" ||
    value.format !== "gltf" ||
    !value.resolution ||
    !Array.isArray(value.assets) ||
    value.assets.length === 0
  ) {
    fail("Environment asset manifest is invalid.");
  }

  const ids = new Set();
  for (const asset of value.assets) {
    if (
      !asset ||
      typeof asset.id !== "string" ||
      !asset.id ||
      !Array.isArray(asset.scenes) ||
      asset.scenes.length === 0 ||
      typeof asset.purpose !== "string" ||
      !asset.purpose
    ) {
      fail("Every environment asset needs an id, scene list, and purpose.");
    }
    if (ids.has(asset.id)) {
      fail(`Duplicate environment asset id: ${asset.id}`);
    }
    ids.add(asset.id);
  }
  return value;
}

async function resolveAsset(manifest, asset) {
  const filesUrl = `${manifest.apiBase}/files/${encodeURIComponent(asset.id)}`;
  const response = await fetch(filesUrl, {
    headers: { "User-Agent": userAgent },
    signal: AbortSignal.timeout(60_000)
  });
  if (!response.ok) {
    fail(`Poly Haven metadata failed for ${asset.id}: HTTP ${response.status}`);
  }
  const metadata = await response.json();
  const descriptor =
    metadata?.[manifest.format]?.[manifest.resolution]?.[manifest.format];
  if (
    !descriptor ||
    typeof descriptor.url !== "string" ||
    typeof descriptor.md5 !== "string" ||
    typeof descriptor.size !== "number"
  ) {
    fail(
      `${asset.id} does not provide ${manifest.resolution} ${manifest.format}`
    );
  }

  const assetRoot = path.join(outputRoot, asset.id);
  const primaryName = decodeURIComponent(
    new URL(descriptor.url).pathname.split("/").at(-1)
  );
  const files = [
    {
      relativePath: primaryName,
      url: descriptor.url,
      md5: descriptor.md5,
      size: descriptor.size
    },
    ...Object.entries(descriptor.include ?? {}).map(
      ([relativePath, included]) => ({
        relativePath,
        url: included.url,
        md5: included.md5,
        size: included.size
      })
    )
  ];

  let downloaded = 0;
  for (const file of files) {
    if (
      typeof file.url !== "string" ||
      typeof file.md5 !== "string" ||
      typeof file.size !== "number"
    ) {
      fail(`Invalid file descriptor for ${asset.id}/${file.relativePath}`);
    }
    const destination = path.join(
      assetRoot,
      safeRelativePath(file.relativePath)
    );
    const result = await downloadFile({
      url: file.url,
      destination,
      expectedMd5: file.md5
    });
    if (result === "downloaded") downloaded += 1;
  }

  console.log(
    `[environment-setup] ${asset.id}: ${downloaded} downloaded, ` +
      `${files.length - downloaded} cached`
  );
  return {
    id: asset.id,
    scenes: asset.scenes,
    purpose: asset.purpose,
    entryFile: path.relative(outputRoot, path.join(assetRoot, primaryName)),
    files: files.map((file) => ({
      path: path.join(asset.id, safeRelativePath(file.relativePath)),
      md5: file.md5,
      size: file.size,
      url: file.url
    }))
  };
}

let manifest;
try {
  manifest = validateManifest(
    JSON.parse(await readFile(manifestPath, "utf8"))
  );
} catch (error) {
  fail(`Unable to read ${manifestPath}: ${error.message}`);
}

await mkdir(outputRoot, { recursive: true });
const resolvedAssets = [];
for (const asset of manifest.assets) {
  resolvedAssets.push(await resolveAsset(manifest, asset));
}

const lock = {
  version: 1,
  provider: manifest.provider,
  license: manifest.license,
  format: manifest.format,
  resolution: manifest.resolution,
  generatedAt: new Date().toISOString(),
  assets: resolvedAssets
};
const lockPath = path.join(outputRoot, "resolved-assets.json");
await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
console.log(`[environment-setup] Ready: ${resolvedAssets.length} assets`);
console.log(`[environment-setup] Lock: ${lockPath}`);
