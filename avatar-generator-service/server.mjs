#!/usr/bin/env node

import { createServer } from "node:http";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { Readable } from "node:stream";

const root = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(root, "..");
const port = Number(process.env.AVATAR_GENERATOR_PORT ?? 4782);
const modelRoot = path.join(
  projectRoot,
  "english-immersion-studio/public/models"
);
const templates = {
  executive: "real-executive.glb",
  doctor: "medical.glb",
  nurse: "real-nurse.glb",
  cabin: "real-uniform.glb",
  hanfu: "real-casual.glb",
  teacher: "real-executive.glb",
  academy: "real-casual.glb",
  turtleneck: "real-executive.glb",
  editorial: "real-casual.glb",
  anime: "real-casual.glb"
};
const requiredWeights = [
  ["unet/diffusion_pytorch_model.safetensors", 3924737160],
  ["dinov2/model.safetensors", 4546005432],
  ["vae/diffusion_pytorch_model.safetensors", 167335310],
  ["realesrgan/rrdbnet_mlx.safetensors", 66857885]
];
let activeJob = Promise.resolve();

async function weightsReady() {
  const checks = await Promise.all(
    requiredWeights.map(async ([relativePath, expectedSize]) => {
      try {
        return (
          (await stat(path.join(root, "weights/raw", relativePath))).size ===
          expectedSize
        );
      } catch {
        return false;
      }
    })
  );
  return checks.every(Boolean);
}

function send(response, status, body, contentType = "application/json") {
  response.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
    "Content-Type": contentType
  });
  response.end(body);
}

function runGenerator(source, image, output) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      path.join(root, "scripts/generate-avatar.sh"),
      [source, image, output],
      { cwd: root, env: process.env }
    );
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      process.stderr.write(chunk);
    });
    child.stdout.pipe(process.stdout);
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `Generator exited with ${code}.`));
    });
  });
}

const server = createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Origin": "*"
    });
    response.end();
    return;
  }

  if (request.method === "GET" && request.url === "/api/health") {
    const ready = await weightsReady();
    send(
      response,
      ready ? 200 : 503,
      JSON.stringify({
        ready,
        engine: "Hunyuan3D-Swift MLX",
        local: true,
        state: ready ? "ready" : "weights_required"
      })
    );
    return;
  }

  if (request.method !== "POST" || request.url !== "/api/avatar") {
    send(response, 404, JSON.stringify({ error: "Not found." }));
    return;
  }

  let work;
  try {
    if (!(await weightsReady())) {
      send(
        response,
        503,
        JSON.stringify({
          error: "模型权重尚未就绪，请运行 scripts/download-weights.mjs。"
        })
      );
      return;
    }
    const requestType = request.headers["content-type"] ?? "";
    if (!requestType.includes("multipart/form-data")) {
      send(response, 400, JSON.stringify({ error: "Multipart form data is required." }));
      return;
    }
    const webRequest = new Request(`http://127.0.0.1:${port}${request.url}`, {
      method: "POST",
      headers: request.headers,
      body: Readable.toWeb(request),
      duplex: "half"
    });
    const form = await webRequest.formData();
    const image = form.get("image");
    if (!(image instanceof File) || !image.type.startsWith("image/")) {
      send(response, 400, JSON.stringify({ error: "A portrait image is required." }));
      return;
    }
    if (image.size > 20 * 1024 * 1024) {
      send(response, 413, JSON.stringify({ error: "Image exceeds 20 MB." }));
      return;
    }
    const requestedTemplate = String(form.get("template") ?? "academy");
    const templateName = templates[requestedTemplate] ?? templates.academy;
    const template = path.resolve(
      process.env.AVATAR_TEMPLATE_GLB ?? path.join(modelRoot, templateName)
    );

    const imageBytes = Buffer.from(await image.arrayBuffer());
    const identityHash = createHash("sha256")
      .update(imageBytes)
      .update("\0")
      .update(templateName)
      .digest("hex");
    const cacheDirectory = path.join(root, "cache");
    const cachedOutput = path.join(cacheDirectory, `${identityHash}.glb`);
    try {
      const cached = await readFile(cachedOutput);
      send(response, 200, cached, "model/gltf-binary");
      return;
    } catch {
      // Generate and cache this identity below.
    }

    work = await mkdtemp(path.join(tmpdir(), "avatar-generator-"));
    const extension = image.type === "image/png" ? ".png" : ".jpg";
    const input = path.join(work, `portrait${extension}`);
    const output = path.join(work, "avatar.glb");
    await writeFile(input, imageBytes);

    const job = activeJob.then(() => runGenerator(template, input, output));
    activeJob = job.catch(() => undefined);
    await job;
    const glb = await readFile(output);
    await mkdir(cacheDirectory, { recursive: true });
    await writeFile(cachedOutput, glb);
    send(response, 200, glb, "model/gltf-binary");
  } catch (error) {
    send(
      response,
      500,
      JSON.stringify({
        error: error instanceof Error ? error.message : "Avatar generation failed."
      })
    );
  } finally {
    if (work) await rm(work, { recursive: true, force: true });
  }
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(
    `Local avatar generator listening on http://127.0.0.1:${port}\n`
  );
});
