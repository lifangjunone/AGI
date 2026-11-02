import mermaid from "./vendor/mermaid.js";
import { analyzeDiagram } from "./analyzer.js";

const healthyExample = `flowchart LR
  User[公网用户] -->|HTTPS| Edge[阿里云入口]
  Edge -->|统一认证| Auth[LifeYouMe Auth]
  Edge -->|反向隧道| App[腾讯云 MapProof]
  App --> Review{验收结果}
  Review -->|通过| Report[发布报告]
  Review -->|需修订| Source[修改 Mermaid]
  Source -->|重新验图| App`;

const riskyExample = `flowchart TD
  Start[用户请求] --> Hub[核心服务]
  Hub --> A[账号]
  Hub --> B[计费]
  Hub --> C[模型]
  Hub --> D[文件]
  Hub --> E[通知]
  Hub --> F[审计]
  Hub --> Decide{是否成功}
  Decide --> Done[完成]
  Decide --> Retry[重试]
  Retry --> Hub
  Orphan[旧缓存]`;

const source = document.querySelector("#diagram-source");
const canvas = document.querySelector("#diagram-canvas");
const renderError = document.querySelector("#render-error");
let latestResult;

mermaid.initialize({
  startOnLoad: false,
  securityLevel: "strict",
  theme: "base",
  themeVariables: {
    background: "#f4f1e8",
    primaryColor: "#f8f5ed",
    primaryTextColor: "#17201d",
    primaryBorderColor: "#53635d",
    lineColor: "#53635d",
    secondaryColor: "#dfe7df",
    tertiaryColor: "#f0d8ca",
    fontFamily: "Arial, 'Noto Sans SC', sans-serif"
  },
  flowchart: { curve: "basis", htmlLabels: false, nodeSpacing: 38, rankSpacing: 54 }
});

function findingIcon(level) {
  if (level === "error") return "!";
  if (level === "warn") return "△";
  return "i";
}

function renderAnalysis(result) {
  latestResult = result;
  document.querySelector("#score").textContent = result.score;
  const verdict = document.querySelector("#verdict");
  verdict.textContent = result.verdict;
  verdict.dataset.state = result.verdict;
  document.querySelector("#metrics").innerHTML = `
    <div><strong>${result.metrics.nodes}</strong><span>节点</span></div>
    <div><strong>${result.metrics.edges}</strong><span>连线</span></div>
    <div><strong>${result.metrics.labeled}</strong><span>带标签</span></div>`;
  document.querySelector("#critical-path").innerHTML = result.critical.length
    ? result.critical.map((node, index) => `<span>${escapeHtml(node)}</span>${index < result.critical.length - 1 ? "<b>›</b>" : ""}`).join("")
    : "<em>暂未识别出连续路径</em>";
  document.querySelector("#finding-count").textContent = `${result.findings.length} 项`;
  document.querySelector("#findings").innerHTML = result.findings.length
    ? result.findings.map((item) => `<article class="finding ${item.level}">
        <i aria-hidden="true">${findingIcon(item.level)}</i>
        <div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.detail)}</p></div>
      </article>`).join("")
    : `<article class="finding pass"><i aria-hidden="true">✓</i><div><h3>基础检查通过</h3><p>没有发现阻断发布的问题，仍建议由领域负责人复核业务语义。</p></div></article>`;
}

async function review() {
  renderError.textContent = "";
  const text = source.value.trim();
  renderAnalysis(analyzeDiagram(text));
  try {
    const id = `mapproof-${Date.now()}`;
    const { svg } = await mermaid.render(id, text);
    canvas.innerHTML = svg;
    canvas.querySelector("svg")?.setAttribute("aria-label", "Mermaid 图表预览");
  } catch (error) {
    canvas.innerHTML = "";
    renderError.textContent = `Mermaid 无法渲染：${error.message?.split("\n")[0] || "请检查语法"}`;
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[character]);
}

function downloadReport() {
  if (!latestResult) return;
  const report = [
    "# MapProof 图表验收报告",
    "",
    `- 时间：${new Date().toLocaleString("zh-CN")}`,
    `- 结论：${latestResult.verdict}`,
    `- 发布可信度：${latestResult.score}/100`,
    `- 节点 / 连线：${latestResult.metrics.nodes} / ${latestResult.metrics.edges}`,
    `- 关键路径：${latestResult.critical.join(" → ") || "未识别"}`,
    "",
    "## 审稿意见",
    ...(latestResult.findings.length ? latestResult.findings.map((item) => `- [${item.level}] ${item.title}：${item.detail}`) : ["- 基础检查通过"]),
    "",
    "## Mermaid 源码",
    "```mermaid",
    source.value,
    "```",
    "",
    "> 此报告由规则检查生成，不能替代领域专家对业务语义的最终确认。"
  ].join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([report], { type: "text/markdown;charset=utf-8" }));
  link.download = `mapproof-report-${new Date().toISOString().slice(0, 10)}.md`;
  link.click();
  URL.revokeObjectURL(link.href);
}

source.value = healthyExample;
document.querySelector("#run-review").addEventListener("click", review);
document.querySelector("#load-risky").addEventListener("click", () => {
  source.value = riskyExample;
  review();
});
document.querySelector("#download-report").addEventListener("click", downloadReport);
review();
