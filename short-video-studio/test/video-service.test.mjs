import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import {
  buildModelPrompt,
  extractVideoBuffer,
  normalizeDuration,
  probeDuration,
  validateGenerationInput
} from "../lib/video-service.mjs";

const execFileAsync = promisify(execFile);

test("accepts the five supported durations and ratios", () => {
  for (const duration of [5, 10, 20, 30, 60]) {
    assert.deepEqual(validateGenerationInput({
      prompt: "A stable cinematic product shot",
      duration,
      ratio: "9:16"
    }), {
      prompt: "A stable cinematic product shot",
      duration,
      ratio: "9:16"
    });
  }
});

test("rejects unsupported duration, ratio, and short prompts", () => {
  assert.throws(
    () => validateGenerationInput({ prompt: "too short", duration: 15, ratio: "9:16" }),
    /时长/
  );
  assert.throws(
    () => validateGenerationInput({ prompt: "A complete video prompt", duration: 5, ratio: "4:3" }),
    /比例/
  );
  assert.throws(
    () => validateGenerationInput({ prompt: "short", duration: 5, ratio: "9:16" }),
    /8 个字符/
  );
});

test("adds explicit delivery constraints to the model prompt", () => {
  const result = buildModelPrompt({
    prompt: "A chef plates a bright seasonal dish",
    duration: 30,
    ratio: "16:9"
  });
  assert.match(result, /30-second video/);
  assert.match(result, /16:9 aspect ratio/);
  assert.match(result, /multi-shot sequence/);
});

test("extracts an MP4 buffer from a data URI", () => {
  const sample = Buffer.concat([
    Buffer.from([0, 0, 0, 24]),
    Buffer.from("ftyp"),
    Buffer.from("isom0000")
  ]);
  const result = extractVideoBuffer({
    choices: [{ message: { content: `data:video/mp4;base64,${sample.toString("base64")}` } }]
  });
  assert.deepEqual(result, sample);
});

test("normalizes a short clip to every supported duration with ffmpeg", async (t) => {
  try {
    await execFileAsync("ffmpeg", ["-version"]);
  } catch {
    t.skip("ffmpeg is not installed");
    return;
  }

  const directory = await mkdtemp(path.join(os.tmpdir(), "frame60-test-"));
  const inputPath = path.join(directory, "input.mp4");
  t.after(() => rm(directory, { recursive: true, force: true }));

  await execFileAsync("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=c=black:s=320x180:d=1",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    inputPath
  ]);
  const sourceDuration = await probeDuration(inputPath);

  for (const targetDuration of [5, 10, 20, 30, 60]) {
    const outputPath = path.join(directory, `output-${targetDuration}.mp4`);
    const mode = await normalizeDuration({
      inputPath,
      outputPath,
      targetDuration,
      sourceDuration,
      ratio: "9:16"
    });
    const outputDuration = await probeDuration(outputPath);

    assert.equal(mode, "looped");
    assert.ok(
      Math.abs(outputDuration - targetDuration) < 0.08,
      `Expected ${targetDuration}s, received ${outputDuration}s`
    );
  }
});

test("normalizes each supported aspect ratio to its delivery size", async (t) => {
  try {
    await execFileAsync("ffmpeg", ["-version"]);
  } catch {
    t.skip("ffmpeg is not installed");
    return;
  }

  const directory = await mkdtemp(path.join(os.tmpdir(), "frame60-ratio-test-"));
  const inputPath = path.join(directory, "input.mp4");
  t.after(() => rm(directory, { recursive: true, force: true }));

  await execFileAsync("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=c=black:s=320x180:d=1",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    inputPath
  ]);
  const sourceDuration = await probeDuration(inputPath);
  const expectedSizes = {
    "9:16": "720,1280",
    "16:9": "1280,720",
    "1:1": "720,720"
  };

  for (const [ratio, expectedSize] of Object.entries(expectedSizes)) {
    const outputPath = path.join(directory, `output-${ratio.replace(":", "-")}.mp4`);
    await normalizeDuration({
      inputPath,
      outputPath,
      targetDuration: 5,
      sourceDuration,
      ratio
    });
    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height",
      "-of",
      "csv=p=0",
      outputPath
    ]);
    assert.equal(stdout.trim(), expectedSize);
  }
});
