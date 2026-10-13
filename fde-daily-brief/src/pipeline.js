// 单次生成并落库。供定时任务与手动立即执行复用。
import { generateArticle } from "./generate.js";
import { saveBrief } from "./store.js";

export async function runPipeline() {
  const startedAt = new Date().toISOString();
  console.log(`[run] 开始生成 ${startedAt}`);
  const brief = await generateArticle();
  const paths = saveBrief(brief);
  console.log(
    `[run] 完成 ${brief.id} · 候选 ${brief.candidateCount} · 信号 ${brief.article.signals.length}\n` +
      `     ${paths.html}`
  );
  return brief;
}
