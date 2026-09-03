import { describe, expect, it } from "vitest";
import {
  createEnvelopeFaceAnimation,
  createVisemeFaceAnimation
} from "./lipsync";

describe("golden slice lip-sync generators", () => {
  it("converts timed words into a multi-shape ARKit animation", () => {
    const animation = createVisemeFaceAnimation([
      { text: "Meet", startMs: 100, endMs: 420 },
      { text: "you", startMs: 470, endMs: 760 }
    ]);

    expect(animation).not.toBeNull();
    expect(animation?.fps).toBe(60);
    expect(animation?.n_frames).toBeGreaterThan(40);
    expect(animation?.arkit_raw.JawOpen.some((value) => value > 0.3)).toBe(
      true
    );
    expect(
      animation?.arkit_raw.MouthClose.some((value) => value > 0.5)
    ).toBe(true);
    expect(
      animation?.arkit_raw.MouthFunnel.some((value) => value > 0.5)
    ).toBe(true);
    expect(
      Object.values(animation?.arkit_raw ?? {}).every(
        (values) => values.length === animation?.n_frames
      )
    ).toBe(true);
  });

  it("derives a smoothed jaw envelope from real audio samples", () => {
    const sampleRate = 16_000;
    const samples = new Float32Array(sampleRate);
    for (let index = sampleRate / 4; index < sampleRate / 2; index += 1) {
      samples[index] = Math.sin((index / sampleRate) * Math.PI * 440) * 0.5;
    }

    const animation = createEnvelopeFaceAnimation(samples, sampleRate);

    expect(animation).not.toBeNull();
    expect(animation?.n_frames).toBe(60);
    expect(animation?.arkit_raw.JawOpen[5]).toBeLessThan(0.1);
    expect(
      Math.max(...(animation?.arkit_raw.JawOpen ?? []))
    ).toBeGreaterThan(0.45);
    expect(
      animation?.arkit_raw.JawOpen.every(
        (value) => Number.isFinite(value) && value >= 0 && value <= 1
      )
    ).toBe(true);
  });

  it("rejects empty or invalid inputs", () => {
    expect(createVisemeFaceAnimation([])).toBeNull();
    expect(createEnvelopeFaceAnimation(new Float32Array(), 16_000)).toBeNull();
    expect(createEnvelopeFaceAnimation(new Float32Array([0]), 0)).toBeNull();
  });
});
