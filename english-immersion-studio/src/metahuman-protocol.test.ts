import { describe, expect, it } from "vitest";
import {
  createLipSyncCues,
  createMetaHumanCommand,
  createRendererPerformanceCommand,
  createSpeechFaceCommand,
  createSpeechTimelineCommand,
  getMetaHumanHairId,
  METAHUMAN_PROTOCOL_VERSION
} from "./metahuman-protocol";

describe("MetaHuman protocol", () => {
  it("maps only runtime-ready identities to verified hairstyles", () => {
    expect(getMetaHumanHairId("sophia-tuya")).toBe("long-straight");
    expect(getMetaHumanHairId("amara-aera")).toBe("long-straight-bangs");
    expect(getMetaHumanHairId("vivian-voss")).toBe("bob-straight");
    expect(getMetaHumanHairId("k-stage-02")).toBe("sleek-long");
    expect(getMetaHumanHairId("uploaded-photo")).toBe("sleek-long");
  });

  it("creates a versioned renderer command", () => {
    expect(
      createMetaHumanCommand({
        actorName: "Sophia Laurent",
        avatarId: "sophia-tuya",
        outfitId: "studio-basic",
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
        avatarId: "sophia-tuya",
        hairId: "long-straight",
        outfitId: "studio-basic",
        performance: "explaining",
        sceneId: "interview",
        speaking: true,
        viewMode: "first"
      }
    });
  });

  it("creates timed coarticulated lip shapes from Edge word boundaries", () => {
    const cues = createLipSyncCues([
      { text: "Meet", startMs: 120, endMs: 500 },
      { text: "you", startMs: 560, endMs: 850 }
    ]);

    expect(cues[0]).toEqual({ atMs: 0, shape: "sil" });
    expect(cues.some((cue) => cue.shape === "closed")).toBe(true);
    expect(cues.some((cue) => cue.shape === "wide")).toBe(true);
    expect(cues.some((cue) => cue.shape === "round")).toBe(true);
    expect(cues.at(-1)).toEqual({ atMs: 885, shape: "sil" });
  });

  it("creates a versioned speech timeline with playback offset", () => {
    const command = createSpeechTimelineCommand(
      "speech-7",
      [{ text: "Hello", startMs: 100, endMs: 500 }],
      18.6
    );

    expect(command.type).toBe("speech.timeline");
    expect(command.payload.utteranceId).toBe("speech-7");
    expect(command.payload.offsetMs).toBe(19);
    expect(command.payload.cues.length).toBeGreaterThan(2);
  });

  it("wraps audio-driven ARKit frames for the renderer", () => {
    const faceAnimation = {
      fps: 60,
      duration: 0.05,
      n_frames: 3,
      arkit_raw: {
        JawOpen: [0, 0.7, 0],
        MouthFunnel: [0, 0.2, 0]
      }
    };

    expect(createSpeechFaceCommand(faceAnimation)).toEqual({
      version: METAHUMAN_PROTOCOL_VERSION,
      type: "speech.face",
      payload: faceAnimation
    });
  });

  it("creates a bounded renderer performance command", () => {
    expect(createRendererPerformanceCommand("inference")).toEqual({
      version: METAHUMAN_PROTOCOL_VERSION,
      type: "renderer.performance",
      payload: { mode: "inference" }
    });
  });
});
