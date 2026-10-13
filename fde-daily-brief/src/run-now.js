// 手动立即执行一次：node src/run-now.js
import { runPipeline } from "./pipeline.js";

try {
  const brief = await runPipeline();
  console.log(`OK ${brief.id}`);
  process.exit(0);
} catch (error) {
  console.error("FAILED:", String(error?.message || error));
  process.exit(1);
}
