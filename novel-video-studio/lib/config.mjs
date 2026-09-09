import { readFile } from "node:fs/promises";
import path from "node:path";

export async function loadEnv(root) {
  for (const name of [".env", ".env.local"]) {
    try {
      const content = await readFile(path.join(root, name), "utf8");
      for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) continue;
        const separator = line.indexOf("=");
        if (separator < 1) continue;
        const key = line.slice(0, separator).trim();
        const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
        if (!process.env[key]) process.env[key] = value;
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
}

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function makeConfig(root) {
  const episodeMinutes = positiveNumber(process.env.EPISODE_DURATION_MINUTES, 15);
  const shotSeconds = positiveNumber(process.env.SHOT_DURATION_SECONDS, 30);
  const dailyHours = positiveNumber(process.env.DAILY_OUTPUT_HOURS, 72);

  return Object.freeze({
    root,
    port: positiveNumber(process.env.PORT, 4321),
    mode: process.env.PRODUCTION_MODE === "live" ? "live" : "demo",
    dataDirectory: process.env.NOVEL_STUDIO_DATA_DIRECTORY || path.join(root, "data"),
    ark: {
      apiKey: process.env.ARK_API_KEY || "",
      baseUrl: process.env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3",
      textModel: process.env.ARK_TEXT_MODEL || "",
      imageModel: process.env.ARK_IMAGE_MODEL || "",
      videoModel: process.env.ARK_VIDEO_MODEL || ""
    },
    search: {
      braveApiKey: process.env.BRAVE_SEARCH_API_KEY || ""
    },
    production: {
      dailyHours,
      episodeMinutes,
      shotSeconds,
      shotsPerEpisode: Math.ceil((episodeMinutes * 60) / shotSeconds),
      episodesPerDay: Math.ceil((dailyHours * 60) / episodeMinutes),
      videoTasksPerDay: Math.ceil((dailyHours * 3600) / shotSeconds),
      maxVideoConcurrency: positiveNumber(process.env.MAX_VIDEO_CONCURRENCY, 4),
      dailyBudgetCny: positiveNumber(process.env.DAILY_BUDGET_CNY, 200)
    },
    ffmpeg: process.env.FFMPEG_PATH || "ffmpeg",
    ffprobe: process.env.FFPROBE_PATH || "ffprobe"
  });
}
