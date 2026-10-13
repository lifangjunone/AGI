// 常驻入口：启动定时任务（node-cron）+ Web 预览服务。带运行锁，避免任务重叠。
import cron from "node-cron";
import { config } from "./config.js";
import { startServer } from "./server.js";
import { runPipeline } from "./pipeline.js";

let running = false;

async function scheduledRun() {
  if (running) {
    console.warn("[cron] 上一次仍在运行，跳过本次触发");
    return;
  }
  running = true;
  try {
    await runPipeline();
  } catch (error) {
    console.error("[cron] 生成失败:", String(error?.message || error));
  } finally {
    running = false;
  }
}

if (!cron.validate(config.schedule)) {
  console.error(`非法 cron 表达式: ${config.schedule}`);
  process.exit(1);
}

cron.schedule(config.schedule, scheduledRun, { timezone: config.timezone });
console.log(`[fde-daily-brief] 定时: "${config.schedule}" 时区 ${config.timezone}`);

// 启动时若当天还没有，先补一篇；失败不阻断服务
const today = new Date().toISOString().slice(0, 10);
scheduledRunForToday(today);

async function scheduledRunForToday(id) {
  try {
    const { latestBrief } = await import("./store.js");
    const latest = latestBrief();
    if (!latest || latest.id !== id) {
      console.log("[startup] 当天暂无文章，立即补一篇…");
      await scheduledRun();
    }
  } catch (error) {
    console.error("[startup] 补稿失败:", String(error?.message || error));
  }
}

startServer();

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
