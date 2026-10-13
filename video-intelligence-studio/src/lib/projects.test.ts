import { afterEach, describe, expect, it, vi } from "vitest";
import { getProjects, saveProject } from "./projects";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("project API", () => {
  it("loads the persisted project list", async () => {
    const projects = [{
      id: "project-1",
      name: "雨夜来电",
      createdAt: 1,
      updatedAt: 2,
      assetId: "asset-1",
      assetName: "rain.mp4",
      hasAnalysis: true,
      activeJobStatus: "",
    }];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify(projects), { status: 200 }),
    ));

    await expect(getProjects()).resolves.toEqual(projects);
    expect(fetch).toHaveBeenCalledWith("/api/projects");
  });

  it("persists a new project", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "project-2", name: "新项目" }), { status: 201 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await saveProject("project-2", "新项目");
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ id: "project-2", name: "新项目" });
  });
});
