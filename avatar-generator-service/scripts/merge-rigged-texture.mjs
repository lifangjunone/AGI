#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

function parseGlb(data) {
  if (data.readUInt32LE(0) !== 0x46546c67 || data.readUInt32LE(4) !== 2) {
    throw new Error("Expected a glTF 2.0 binary file.");
  }

  let offset = 12;
  let json;
  let binary;
  while (offset + 8 <= data.length) {
    const length = data.readUInt32LE(offset);
    const type = data.readUInt32LE(offset + 4);
    const chunk = data.subarray(offset + 8, offset + 8 + length);
    if (type === JSON_CHUNK) {
      json = JSON.parse(chunk.toString("utf8").replace(/\0+$/u, "").trimEnd());
    } else if (type === BIN_CHUNK) {
      binary = Buffer.from(chunk);
    }
    offset += 8 + length;
  }
  if (!json || !binary) throw new Error("GLB is missing its JSON or BIN chunk.");
  return { json, binary };
}

function pad(buffer, fill = 0) {
  const padding = (4 - (buffer.length % 4)) % 4;
  return padding ? Buffer.concat([buffer, Buffer.alloc(padding, fill)]) : buffer;
}

function encodeGlb(json, binary) {
  const jsonChunk = pad(Buffer.from(JSON.stringify(json)), 0x20);
  const binaryChunk = pad(binary);
  const output = Buffer.alloc(
    12 + 8 + jsonChunk.length + 8 + binaryChunk.length
  );
  output.writeUInt32LE(0x46546c67, 0);
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(jsonChunk.length, 12);
  output.writeUInt32LE(JSON_CHUNK, 16);
  jsonChunk.copy(output, 20);
  const binaryHeader = 20 + jsonChunk.length;
  output.writeUInt32LE(binaryChunk.length, binaryHeader);
  output.writeUInt32LE(BIN_CHUNK, binaryHeader + 4);
  binaryChunk.copy(output, binaryHeader + 8);
  return output;
}

function firstPrimitive(gltf) {
  const primitive = gltf.meshes?.[0]?.primitives?.[0];
  if (!primitive) throw new Error("GLB has no first mesh primitive.");
  return primitive;
}

function accessorCount(gltf, accessorIndex) {
  return gltf.accessors?.[accessorIndex]?.count ?? 0;
}

function mergeTexture(original, painted) {
  const originalPrimitive = firstPrimitive(original.json);
  const paintedPrimitive = firstPrimitive(painted.json);
  const originalCount = accessorCount(
    original.json,
    originalPrimitive.attributes?.POSITION
  );
  const paintedCount = accessorCount(
    painted.json,
    paintedPrimitive.attributes?.POSITION
  );
  const originalUvCount = accessorCount(
    original.json,
    originalPrimitive.attributes?.TEXCOORD_0
  );
  const paintedUvCount = accessorCount(
    painted.json,
    paintedPrimitive.attributes?.TEXCOORD_0
  );

  if (
    !originalCount ||
    originalCount !== paintedCount ||
    originalCount !== originalUvCount ||
    originalCount !== paintedUvCount
  ) {
    throw new Error(
      `Unsafe topology change: original=${originalCount}, painted=${paintedCount}, ` +
        `originalUV=${originalUvCount}, paintedUV=${paintedUvCount}.`
    );
  }
  if (!originalPrimitive.targets?.length) {
    throw new Error("Original avatar has no facial morph targets to preserve.");
  }
  if (
    !original.json.nodes?.some(
      (node) => node.mesh === 0 && Number.isInteger(node.skin)
    )
  ) {
    throw new Error("Original avatar mesh is not attached to a skeleton.");
  }

  const output = structuredClone(original.json);
  output.bufferViews ??= [];
  output.images ??= [];
  output.samplers ??= [];
  output.textures ??= [];
  output.materials ??= [];
  let binary = pad(original.binary);

  const maps = {
    bufferViews: new Map(),
    images: new Map(),
    samplers: new Map(),
    textures: new Map()
  };

  const copyBufferView = (sourceIndex) => {
    if (!Number.isInteger(sourceIndex)) return undefined;
    if (maps.bufferViews.has(sourceIndex)) return maps.bufferViews.get(sourceIndex);
    const source = painted.json.bufferViews[sourceIndex];
    const start = source.byteOffset ?? 0;
    const bytes = painted.binary.subarray(start, start + source.byteLength);
    const targetIndex = output.bufferViews.length;
    output.bufferViews.push({
      ...structuredClone(source),
      buffer: 0,
      byteOffset: binary.length
    });
    binary = pad(Buffer.concat([binary, bytes]));
    maps.bufferViews.set(sourceIndex, targetIndex);
    return targetIndex;
  };

  const copySampler = (sourceIndex) => {
    if (!Number.isInteger(sourceIndex)) return undefined;
    if (maps.samplers.has(sourceIndex)) return maps.samplers.get(sourceIndex);
    const targetIndex = output.samplers.length;
    output.samplers.push(structuredClone(painted.json.samplers[sourceIndex]));
    maps.samplers.set(sourceIndex, targetIndex);
    return targetIndex;
  };

  const copyImage = (sourceIndex) => {
    if (!Number.isInteger(sourceIndex)) return undefined;
    if (maps.images.has(sourceIndex)) return maps.images.get(sourceIndex);
    const source = structuredClone(painted.json.images[sourceIndex]);
    if (Number.isInteger(source.bufferView)) {
      source.bufferView = copyBufferView(source.bufferView);
    }
    const targetIndex = output.images.length;
    output.images.push(source);
    maps.images.set(sourceIndex, targetIndex);
    return targetIndex;
  };

  const copyTexture = (sourceIndex) => {
    if (!Number.isInteger(sourceIndex)) return undefined;
    if (maps.textures.has(sourceIndex)) return maps.textures.get(sourceIndex);
    const source = structuredClone(painted.json.textures[sourceIndex]);
    source.source = copyImage(source.source);
    source.sampler = copySampler(source.sampler);
    const targetIndex = output.textures.length;
    output.textures.push(source);
    maps.textures.set(sourceIndex, targetIndex);
    return targetIndex;
  };

  if (!Number.isInteger(paintedPrimitive.material)) {
    throw new Error("Painted GLB has no material.");
  }
  const material = structuredClone(
    painted.json.materials[paintedPrimitive.material]
  );
  const textureSlots = [
    material.pbrMetallicRoughness?.baseColorTexture,
    material.pbrMetallicRoughness?.metallicRoughnessTexture,
    material.normalTexture,
    material.occlusionTexture,
    material.emissiveTexture
  ].filter(Boolean);
  for (const slot of textureSlots) slot.index = copyTexture(slot.index);
  material.name = "Local AI identity material";
  const materialIndex = output.materials.length;
  output.materials.push(material);
  output.meshes[0].primitives[0].material = materialIndex;
  output.buffers[0].byteLength = binary.length;
  output.asset.generator = `${output.asset.generator ?? "glTF"} + local MLX identity`;

  return {
    json: output,
    binary,
    evidence: {
      vertices: originalCount,
      morphTargets: originalPrimitive.targets.length,
      skins: output.skins?.length ?? 0,
      animations: output.animations?.length ?? 0,
      material: materialIndex
    }
  };
}

async function main() {
  const [originalPath, paintedPath, outputPath] = process.argv.slice(2);
  if (!originalPath || !paintedPath || !outputPath) {
    throw new Error(
      "Usage: merge-rigged-texture.mjs <original.glb> <painted.glb> <output.glb>"
    );
  }
  const [originalData, paintedData] = await Promise.all([
    readFile(originalPath),
    readFile(paintedPath)
  ]);
  const merged = mergeTexture(parseGlb(originalData), parseGlb(paintedData));
  await writeFile(outputPath, encodeGlb(merged.json, merged.binary));
  process.stdout.write(
    `${path.basename(outputPath)} ${JSON.stringify(merged.evidence)}\n`
  );
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
