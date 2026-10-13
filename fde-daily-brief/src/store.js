// 本地持久化：data/<date>.json + data/<date>.html。幂等键为日期，重复生成只覆盖当天。
import { mkdirSync, writeFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { DATA_DIR } from "./config.js";
import { renderPage } from "./render.js";

mkdirSync(DATA_DIR, { recursive: true });

export function saveBrief(brief) {
  const base = join(DATA_DIR, brief.id);
  writeFileSync(`${base}.json`, JSON.stringify(brief, null, 2), "utf-8");
  writeFileSync(`${base}.html`, renderPage(brief), "utf-8");
  return { json: `${base}.json`, html: `${base}.html` };
}

export function listDates() {
  return readdirSync(DATA_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .sort()
    .reverse();
}

export function getBrief(date) {
  const p = join(DATA_DIR, `${date}.json`);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf-8"));
}

export function latestBrief() {
  const dates = listDates();
  return dates.length ? getBrief(dates[0]) : null;
}

export { DATA_DIR, resolve };
