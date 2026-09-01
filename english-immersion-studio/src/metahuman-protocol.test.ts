import { describe, expect, it } from "vitest";
import {
  createMetaHumanCommand,
  getMetaHumanHairId,
  METAHUMAN_PROTOCOL_VERSION
} from "./metahuman-protocol";

describe("MetaHuman protocol", () => {
  it("maps identity presets to stable modular hairstyles", () => {
    expect(getMetaHumanHairId("j-fashion-01")).toBe("long-straight");
    expect(getMetaHumanHairId("j-fashion-05")).toBe("long-straight");
    expect(getMetaHumanHairId("k-stage-02")).toBe("high-ponytail");
    expect(getMetaHumanHairId("executive-03")).toBe("shoulder-wave");
    expect(getMetaHumanHairId("uploaded-photo")).toBe("sleek-long");
  });

  it("creates a versioned renderer command", () => {
    expect(
      createMetaHumanCommand({
        actorName: "Sophia Laurent",
        avatarId: "j-fashion-01",
        outfitId: "executive",
        performance: "explaining",
        sceneId: "interview",
        speaking: true,
        viewMode: "first"
      })
    ).toEqual({
      version: METAHUMAN_PROTOCOL_VERSION,
      type: "avatar.state",
      payload: {
        actorName: "Sophia Laurent",
        avatarId: "j-fashion-01",
        hairId: "long-straight",
        outfitId: "executive",
        performance: "explaining",
        sceneId: "interview",
        speaking: true,
        viewMode: "first"
      }
    });
  });
});
