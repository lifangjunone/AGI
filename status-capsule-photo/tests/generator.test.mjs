import test from "node:test";
import assert from "node:assert/strict";
import { buildGeneration, publicTemplates } from "../src/generator.mjs";

const tinyPng = "data:image/png;base64," + Buffer.alloc(1200, 7).toString("base64");

test("publicTemplates hides raw prompts", () => {
  const templates = publicTemplates();
  assert.ok(templates.length >= 6);
  assert.equal(Object.hasOwn(templates[0], "prompt"), false);
});

test("buildGeneration creates prompt jobs without retaining image", async () => {
  const result = await buildGeneration({
    photoDataUrl: tinyPng,
    templateIds: ["workday-box", "starry-oil"],
    vibe: "轻松快乐",
    outfitHint: "黑色毛衣"
  });
  assert.equal(result.ok, true);
  assert.equal(result.photo.retained, false);
  assert.equal(result.jobs.length, 2);
  assert.match(result.jobs[0].prompt, /轻松快乐/);
  assert.match(result.jobs[0].prompt, /Preserve|保留|Keep/i);
});

test("buildGeneration rejects non image data urls", async () => {
  await assert.rejects(() => buildGeneration({ photoDataUrl: "data:text/plain;base64,aaaa" }), /photo_must_be_data_url/);
});
