import { describe, expect, it } from "vitest";
import { faceStyles, facesForStyle, syntheticFaces } from "./avatar-faces";

describe("synthetic face library", () => {
  it("provides ten fictional adult faces for every style", () => {
    expect(faceStyles).toHaveLength(3);
    faceStyles.forEach((style) => {
      expect(facesForStyle(style.id)).toHaveLength(10);
    });
    expect(syntheticFaces).toHaveLength(30);
  });

  it("uses deterministic local image assets", () => {
    syntheticFaces.forEach((face) => {
      expect(face.imageUrl).toMatch(
        new RegExp(`faces/${face.style}-\\d{2}\\.jpg$`)
      );
      expect(face.imageUrl).not.toMatch(/^https?:/);
    });
  });
});
