import { readFile } from "node:fs/promises";
import path from "node:path";

export const DEFAULT_ARK_MODELS = Object.freeze({
  planning: "glm-5-2-260617",
  video: "doubao-seedance-2-5-260628"
});
export const OUTPUT_DURATION_OPTIONS = Object.freeze([5, 10, 15, 30, 60]);

export async function loadEnv(root) {
  const files = [
    process.env.NOVEL_STUDIO_CONFIG_FILE,
    path.join(root, ".env.local"),
    path.join(root, ".env")
  ].filter(Boolean);
  for (const file of files) {
    try {
      const content = await readFile(file, "utf8");
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

function outputDuration(value) {
  const parsed = Number(value);
  return OUTPUT_DURATION_OPTIONS.includes(parsed) ? parsed : OUTPUT_DURATION_OPTIONS[0];
}

export function makeConfig(root) {
  const episodeMinutes = positiveNumber(process.env.EPISODE_DURATION_MINUTES, 15);
  const shotSeconds = positiveNumber(process.env.SHOT_DURATION_SECONDS, 30);
  const dailyHours = positiveNumber(process.env.DAILY_OUTPUT_HOURS, 72);
  const videoCostPerSecondCny = positiveNumber(process.env.VIDEO_COST_PER_SECOND_CNY, 1.512);
  const defaultOutputDurationSeconds = outputDuration(process.env.DEFAULT_OUTPUT_DURATION_SECONDS);
  const dataDirectory = process.env.NOVEL_STUDIO_DATA_DIRECTORY || path.join(root, "data");
  const planningModel = process.env.ARK_PLANNING_MODEL
    || process.env.ARK_TEXT_MODEL
    || DEFAULT_ARK_MODELS.planning;

  return Object.freeze({
    root,
    port: positiveNumber(process.env.PORT, 4321),
    mode: ["demo", "planning"].includes(process.env.PRODUCTION_MODE)
      ? "planning"
      : "live",
    dataDirectory,
    ark: {
      apiKey: process.env.ARK_API_KEY || "",
      baseUrl: process.env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3",
      planningModel,
      textModel: planningModel,
      imageModel: process.env.ARK_IMAGE_MODEL || "",
      videoModel: process.env.ARK_VIDEO_MODEL || DEFAULT_ARK_MODELS.video
    },
    search: {
      braveApiKey: process.env.BRAVE_SEARCH_API_KEY || "",
      domesticWebSearch: process.env.DOMESTIC_WEB_SEARCH !== "false",
      defaultSourceConfigFile: path.join(root, "config", "novel-sources.json"),
      sourceConfigFile: process.env.NOVEL_SOURCE_CONFIG || path.join(dataDirectory, "search-sources.json")
    },
    production: {
      dailyHours,
      episodeMinutes,
      shotSeconds,
      shotsPerEpisode: Math.ceil((episodeMinutes * 60) / shotSeconds),
      episodesPerDay: Math.ceil((dailyHours * 60) / episodeMinutes),
      outputsPerDay: Math.ceil((dailyHours * 3600) / defaultOutputDurationSeconds),
      videoTasksPerDay: Math.ceil((dailyHours * 3600) / shotSeconds),
      maxProjectConcurrency: positiveNumber(process.env.MAX_PROJECT_CONCURRENCY, 2),
      maxVideoConcurrency: positiveNumber(process.env.MAX_VIDEO_CONCURRENCY, 4),
      dailyBudgetCny: positiveNumber(process.env.DAILY_BUDGET_CNY, 200),
      videoCostPerSecondCny,
      estimatedEpisodeVideoCostCny: Number((episodeMinutes * 60 * videoCostPerSecondCny).toFixed(2)),
      defaultOutputDurationSeconds,
      outputDurationOptions: OUTPUT_DURATION_OPTIONS,
      billableGenerationEnabled: process.env.ALLOW_BILLABLE_GENERATION === "true",
      budgetOverrunAllowed: process.env.ALLOW_BUDGET_OVERRUN === "true"
    },
    ffmpeg: process.env.FFMPEG_PATH || "ffmpeg",
    ffprobe: process.env.FFPROBE_PATH || "ffprobe"
  });
}
