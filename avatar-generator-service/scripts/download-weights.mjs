#!/usr/bin/env node

import { createWriteStream } from "node:fs";
import {
  appendFile,
  mkdir,
  open,
  readdir,
  rename,
  rm,
  stat
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repository =
  "https://huggingface.co/zimengxiong/hunyuan3d-mlx-paint-large/resolve/main";
const chunkSize = 256 * 1024 * 1024;
const files = [
  ["unet/diffusion_pytorch_model.safetensors", 3924737160],
  ["dinov2/model.safetensors", 4546005432],
  ["vae/diffusion_pytorch_model.safetensors", 167335310],
  ["realesrgan/rrdbnet_mlx.safetensors", 66857885]
];

const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function downloadRangeOnce(remote, destination, start, end) {
  const expectedSize = end - start + 1;
  try {
    const existing = await stat(destination);
    if (existing.size === expectedSize) return;
  } catch {
    // Missing chunks are downloaded below.
  }
  const temporary = `${destination}.incomplete`;
  let downloadedSize = 0;
  try {
    downloadedSize = (await stat(temporary)).size;
    if (downloadedSize > expectedSize) {
      await rm(temporary, { force: true });
      downloadedSize = 0;
    }
  } catch {
    // Start this range from its first byte.
  }
  if (downloadedSize === expectedSize) {
    await rename(temporary, destination);
    return;
  }
  const response = await fetch(remote, {
    headers: { Range: `bytes=${start + downloadedSize}-${end}` },
    redirect: "follow"
  });
  if (response.status !== 206 || !response.body) {
    throw new Error(`${remote} range ${start}-${end} returned ${response.status}.`);
  }
  await pipeline(
    Readable.fromWeb(response.body),
    createWriteStream(temporary, { flags: downloadedSize ? "a" : "w" })
  );
  const downloaded = await stat(temporary);
  if (downloaded.size !== expectedSize) {
    throw new Error(
      `${path.basename(destination)} expected ${expectedSize}, got ${downloaded.size}.`
    );
  }
  await rename(temporary, destination);
}

async function downloadRange(remote, destination, start, end) {
  let lastError;
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    try {
      await downloadRangeOnce(remote, destination, start, end);
      return;
    } catch (error) {
      lastError = error;
      process.stderr.write(
        `Retry ${attempt}/20 for ${path.basename(destination)}: ${error.message}\n`
      );
      await wait(Math.min(30000, attempt * 1500));
    }
  }
  throw lastError;
}

async function assemble(partsDirectory, destination, expectedSize) {
  const parts = (await readdir(partsDirectory))
    .filter((name) => name.endsWith(".part"))
    .sort();
  const temporary = `${destination}.assembling`;
  await rm(temporary, { force: true });
  for (const part of parts) {
    const handle = await open(path.join(partsDirectory, part), "r");
    try {
      for await (const chunk of handle.createReadStream()) {
        await appendFile(temporary, chunk);
      }
    } finally {
      await handle.close();
    }
  }
  const assembled = await stat(temporary);
  if (assembled.size !== expectedSize) {
    throw new Error(
      `${destination} expected ${expectedSize} bytes, got ${assembled.size}.`
    );
  }
  await rename(temporary, destination);
}

async function downloadFile(relativePath, totalSize) {
  const destination = path.join(root, "weights/raw", relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  try {
    if ((await stat(destination)).size === totalSize) return;
  } catch {
    // Continue with a fresh download.
  }

  const partsDirectory = `${destination}.parts`;
  await mkdir(partsDirectory, { recursive: true });
  const ranges = [];
  for (let start = 0; start < totalSize; start += chunkSize) {
    ranges.push([start, Math.min(totalSize - 1, start + chunkSize - 1)]);
  }
  await Promise.all(
    ranges.map(([start, end]) =>
      downloadRange(
        `${repository}/${relativePath}`,
        path.join(
          partsDirectory,
          `${String(start).padStart(12, "0")}-${String(end).padStart(12, "0")}.part`
        ),
        start,
        end
      )
    )
  );
  await assemble(partsDirectory, destination, totalSize);
  await rm(partsDirectory, { recursive: true, force: true });
  process.stdout.write(`${relativePath}: ${totalSize} bytes\n`);
}

await Promise.all(files.map(([relativePath, size]) => downloadFile(relativePath, size)));
