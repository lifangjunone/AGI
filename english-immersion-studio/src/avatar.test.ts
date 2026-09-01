import { describe, expect, it } from "vitest";
import {
  MAX_AVATAR_FILE_BYTES,
  getBuiltInAvatarUrl,
  validateAvatarFile
} from "./avatar";

describe("avatar input validation", () => {
  it("accepts supported photos and 3D models", () => {
    expect(validateAvatarFile({ name: "portrait.webp", size: 1024, type: "image/webp" })).toBeNull();
    expect(validateAvatarFile({ name: "coach.vrm", size: 1024, type: "" })).toBeNull();
    expect(validateAvatarFile({ name: "coach.glb", size: 1024, type: "model/gltf-binary" })).toBeNull();
  });

  it("rejects unsupported or oversized files", () => {
    expect(validateAvatarFile({ name: "notes.txt", size: 12, type: "text/plain" })).toContain("JPG");
    expect(
      validateAvatarFile({
        name: "portrait.png",
        size: MAX_AVATAR_FILE_BYTES + 1,
        type: "image/png"
      })
    ).toContain("20 MB");
  });
});

describe("built-in adult role avatars", () => {
  it("maps professional and adult academy looks to bundled 3D models", () => {
    expect(getBuiltInAvatarUrl("doctor")).toContain("medical.glb");
    expect(getBuiltInAvatarUrl("nurse")).toContain("real-nurse.glb");
    expect(getBuiltInAvatarUrl("cabin")).toContain("real-uniform.glb");
    expect(getBuiltInAvatarUrl("teacher")).toContain("real-executive.glb");
    expect(getBuiltInAvatarUrl("academy")).toContain("real-casual.glb");
  });
});
