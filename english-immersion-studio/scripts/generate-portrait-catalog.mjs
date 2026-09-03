import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = path.join(
  root,
  "src",
  process.env.PORTRAIT_CATALOG_FILE || "portrait-catalog.json"
);
const outputRoot = path.join(
  root,
  "public",
  process.env.PORTRAIT_OUTPUT_DIR || "portraits"
);
const endpoint = "https://ark.cn-beijing.volces.com/api/v3/images/generations";
const envPath = path.join(root, ".env.local");
const sharedDirection = [
  "photorealistic editorial portrait",
  "waist-up composition",
  "confident direct eye contact",
  "realistic skin texture and natural facial detail",
  "tasteful sensual high-fashion styling",
  "form-fitting silhouette with a visible neckline, bare shoulders, open back, elegant side slit, or hosiery where appropriate",
  "glamorous adult styling with intentional skin exposure while remaining opaque and non-explicit",
  "non-explicit",
  "professional luxury campaign lighting",
  "clean cinematic background",
  "clearly an adult over age 21",
  "no text",
  "no logo",
  "no watermark"
].join(", ");

const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
if (!Array.isArray(catalog) || catalog.length !== 26) {
  throw new Error(`Expected 26 portrait entries, found ${catalog.length}.`);
}
const requestedIds = process.env.PORTRAIT_IDS
  ? new Set(process.env.PORTRAIT_IDS.split(",").map((id) => id.trim()))
  : null;
const generationCatalog = requestedIds
  ? catalog.filter((entry) => requestedIds.has(entry.id))
  : catalog;
if (requestedIds && generationCatalog.length !== requestedIds.size) {
  throw new Error("PORTRAIT_IDS contains an unknown catalog entry.");
}

await mkdir(outputRoot, { recursive: true });

const localEnv = Object.fromEntries(
  (await readFile(envPath, "utf8"))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const separator = line.indexOf("=");
      return [line.slice(0, separator), line.slice(separator + 1)];
    })
);
const apiKey = process.env.ARK_API_KEY || localEnv.ARK_API_KEY;
const model =
  process.env.ARK_IMAGE_MODEL ||
  localEnv.ARK_IMAGE_MODEL ||
  "doubao-seedream-5-0-pro-260628";
if (!apiKey) {
  throw new Error("ARK_API_KEY is missing from .env.local.");
}

async function requestImage(prompt, entryId) {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        prompt,
        response_format: "url",
        size: "2K",
        stream: false,
        watermark: false
      }),
      signal: AbortSignal.timeout(600_000)
    });
    if (response.ok) {
      const payload = await response.json();
      const imageUrl = payload?.data?.[0]?.url;
      if (typeof imageUrl === "string" && imageUrl) return imageUrl;
      throw new Error(`${entryId}: image service returned no URL`);
    }
    const detail = await response.text();
    if (attempt === 4 || ![429, 500, 502, 503, 504].includes(response.status)) {
      throw new Error(
        `${entryId}: image service returned ${response.status} ${detail.slice(0, 240)}`
      );
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 5_000));
  }
  throw new Error(`${entryId}: image generation failed`);
}

async function generate(entry) {
  const prompt = `${sharedDirection}, ${entry.prompt}`;
  process.stdout.write(`[portrait] generating ${entry.id}\n`);
  const imageUrl = await requestImage(prompt, entry.id);
  const imageResponse = await fetch(imageUrl, {
    signal: AbortSignal.timeout(180_000)
  });
  if (!imageResponse.ok) {
    throw new Error(`${entry.id}: image download returned ${imageResponse.status}`);
  }
  const bytes = Buffer.from(await imageResponse.arrayBuffer());
  if (bytes.length < 20_000) {
    throw new Error(`${entry.id}: generated image is unexpectedly small`);
  }
  const target = path.join(root, "public", entry.portrait);
  await writeFile(target, bytes);
  const hash = createHash("md5").update(bytes).digest("hex");
  process.stdout.write(
    `[portrait] ${entry.id} ${bytes.length} bytes ${hash}\n`
  );
  return hash;
}

const concurrency = 2;
const hashes = [];
for (let index = 0; index < generationCatalog.length; index += concurrency) {
  hashes.push(
    ...(await Promise.all(
      generationCatalog.slice(index, index + concurrency).map(generate)
    ))
  );
}
if (new Set(hashes).size !== generationCatalog.length) {
  throw new Error("Portrait generation returned duplicate images.");
}
