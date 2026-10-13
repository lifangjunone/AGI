import { afterEach, describe, expect, it, vi } from "vitest";
import { getAnalysis, uploadVideo } from "./analysis";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("analysis API client", () => {
  it("uploads the selected video with its project id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: "asset-1",
      projectId: "project-1",
      name: "clip.mp4",
      mimeType: "video/mp4",
      size: 3,
      url: "/api/assets/asset-1/content",
    }), { status: 201, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await uploadVideo(
      "project-1",
      new File(["abc"], "clip.mp4", { type: "video/mp4" }),
    );

    expect(result.id).toBe("asset-1");
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe("POST");
    expect(init.body.get("projectId")).toBe("project-1");
    expect(init.body.get("video").name).toBe("clip.mp4");
  });

  it("surfaces upload errors from the API", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: "视频不能超过 512 MB" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    )));

    await expect(uploadVideo(
      "project-1",
      new File(["abc"], "clip.mp4", { type: "video/mp4" }),
    )).rejects.toThrow("视频不能超过 512 MB");
  });

  it("returns null when the project has no real analysis", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
    await expect(getAnalysis("project-1")).resolves.toBeNull();
  });
});
