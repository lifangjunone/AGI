#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import process from "node:process";

const file = process.argv[2];
if (!file) {
  process.stderr.write("Usage: verify-rigged-glb.mjs <avatar.glb>\n");
  process.exit(2);
}

const data = await readFile(file);
let offset = 12;
let gltf;
while (offset + 8 <= data.length) {
  const length = data.readUInt32LE(offset);
  const type = data.readUInt32LE(offset + 4);
  if (type === 0x4e4f534a) {
    gltf = JSON.parse(
      data
        .subarray(offset + 8, offset + 8 + length)
        .toString("utf8")
        .trim()
    );
  }
  offset += 8 + length;
}
if (!gltf) throw new Error("Missing GLB JSON chunk.");

const primitive = gltf.meshes?.[0]?.primitives?.[0];
const attributes = primitive?.attributes ?? {};
const evidence = {
  bytes: data.length,
  vertices: gltf.accessors?.[attributes.POSITION]?.count ?? 0,
  joints: Number.isInteger(attributes.JOINTS_0),
  weights: Number.isInteger(attributes.WEIGHTS_0),
  morphTargets: primitive?.targets?.length ?? 0,
  skins: gltf.skins?.length ?? 0,
  material: Number.isInteger(primitive?.material)
};
const valid =
  evidence.bytes > 1024 &&
  evidence.vertices > 1000 &&
  evidence.joints &&
  evidence.weights &&
  evidence.morphTargets >= 50 &&
  evidence.skins > 0 &&
  evidence.material;

process.stdout.write(`${JSON.stringify({ valid, ...evidence }, null, 2)}\n`);
if (!valid) process.exitCode = 1;
