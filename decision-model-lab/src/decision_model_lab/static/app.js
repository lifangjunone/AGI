const $ = (selector) => document.querySelector(selector);
const presets = {
  billing: {
    state: "客户反馈同一张发票被重复扣款，已经两次联系在线客服但没有得到回复。订单记录中存在两笔相同金额、间隔 12 秒的支付。",
    instruction: "下一步应该由哪个团队处理？",
    criteria: "billing | 处理扣款、发票和退款\ntechnical | 排查系统故障和服务异常\nsupport | 补充收集客户信息",
    type: "choice",
  },
  coding: {
    state: "Coding Agent 收到 authentication bug。搜索后发现 auth.py，打开文件看到 token 过期校验条件写反；当前工作区干净，尚未修改代码。",
    instruction: "Agent 下一步最合适的动作是什么？",
    criteria: "search_code | 继续搜索相关实现\nedit_file | 修改 token 过期校验\nrun_test | 运行现有测试\nask_user | 向用户询问更多信息",
    type: "choice",
  },
  risk: {
    state: "一条新发布的视频包含明显的血腥画面，标题宣称是真实事故现场，已有多名用户举报。",
    instruction: "该内容是否需要立即进入人工复核？",
    criteria: "false | 不需要，允许继续分发\ntrue | 需要，暂停分发并进入人工复核",
    type: "noul",
  },
};

const evalExamples = [
  { id: "billing-1", state: "用户被重复扣款并要求退款。", question: { type: "choice", instructions: "路由到哪个团队？", criteria: { billing: "扣款退款发票", technical: "程序故障宕机", sales: "购买咨询" } }, label: "billing" },
  { id: "tech-1", state: "登录服务持续 500，监控显示数据库连接池耗尽。", question: { type: "choice", instructions: "路由到哪个团队？", criteria: { billing: "扣款退款发票", technical: "程序故障宕机数据库", sales: "购买咨询" } }, label: "technical" },
  { id: "sales-1", state: "客户询问企业版购买价格和席位折扣。", question: { type: "choice", instructions: "路由到哪个团队？", criteria: { billing: "扣款退款发票", technical: "程序故障宕机", sales: "购买价格折扣咨询" } }, label: "sales" },
  { id: "coding-edit", state: "已定位 auth.py 中 token 比较符写反，尚未修改。", question: { type: "choice", instructions: "下一步动作？", criteria: { edit: "修改已定位的错误代码", search: "搜索代码", finish: "结束任务" } }, label: "edit" },
  { id: "coding-test", state: "代码修改已完成，但还没有验证。", question: { type: "choice", instructions: "下一步动作？", criteria: { edit: "继续编辑文件", test: "运行测试验证修改", finish: "结束任务" } }, label: "test" },
  { id: "risk-yes", state: "内容包含血腥事故画面，已有大量举报。", question: { type: "noul", instructions: "是否需要人工复核？", criteria: { false: "安全正常，无需复核", true: "高风险举报，需要人工复核" } }, label: "true" },
];

function toast(message) {
  const node = $("#toast");
  node.textContent = message;
  node.hidden = false;
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => { node.hidden = true; }, 2800);
}

function loadPreset(name) {
  const preset = presets[name];
  $("#state").value = preset.state;
  $("#instruction").value = preset.instruction;
  $("#criteria").value = preset.criteria;
  $("#question-type").value = preset.type;
}

function parseCriteria(kind) {
  const lines = $("#criteria").value.split("\n").map((line) => line.trim()).filter(Boolean);
  if (kind === "score") return lines.map((line) => line.includes("|") ? line.split("|").slice(1).join("|").trim() : line);
  return Object.fromEntries(lines.map((line) => {
    const [key, ...description] = line.split("|");
    return [key.trim(), description.join("|").trim()];
  }));
}

function answerDistribution(answer) {
  if (answer.type === "noul") return { false: 1 - answer.noul, true: answer.noul };
  return answer.probabilities;
}

async function request(path, body) {
  const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.detail || "请求失败");
  return payload;
}

async function runDecision() {
  const button = $("#run-decision");
  button.disabled = true;
  button.textContent = "推理中…";
  try {
    const kind = $("#question-type").value;
    const payload = await request("/api/decide", {
      state: $("#state").value,
      temperature: Number($("#temperature").value),
      model: $("#model-label").textContent === "mock-lexical" ? "mock-lexical" : "clm-latest",
      questions: { decision: { type: kind, instructions: $("#instruction").value, criteria: parseCriteria(kind) } },
    });
    renderDecision(payload);
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
    button.innerHTML = "运行决策 <kbd>⌘↵</kbd>";
  }
}

function renderDecision(payload) {
  const answer = payload.answers.decision;
  const dist = answerDistribution(answer);
  const ordered = Object.entries(dist).sort((a, b) => b[1] - a[1]);
  const winner = answer.choice ?? (answer.type === "noul" ? (answer.noul >= .5 ? "true" : "false") : ordered[0][0]);
  $("#result-empty").hidden = true;
  $("#result").hidden = false;
  $("#winner-label").textContent = winner;
  $("#confidence").textContent = `Top probability ${(ordered[0][1] * 100).toFixed(1)}%`;
  $("#latency").textContent = `${Number(payload.latency_ms || 0).toFixed(1)} ms · ${payload.model}`;
  $("#bars").innerHTML = ordered.map(([key, value]) => `
    <div class="bar-row"><div class="bar-head"><strong>${key}</strong><span>${(value * 100).toFixed(2)}%</span></div>
    <div class="track"><div class="fill" style="width:${Math.max(value * 100, 1)}%"></div></div></div>`).join("");
  $("#raw-json").textContent = JSON.stringify(payload, null, 2);
}

async function runEvaluation() {
  const button = $("#run-eval");
  button.disabled = true;
  button.textContent = "评测中…";
  try {
    const result = await request("/api/evaluate", { examples: evalExamples, model: $("#model-label").textContent, temperature: 1, bins: 10 });
    const metrics = result.metrics;
    $("#metric-accuracy").textContent = `${(metrics.accuracy * 100).toFixed(1)}%`;
    $("#metric-ece").textContent = metrics.ece.toFixed(3);
    $("#metric-brier").textContent = metrics.brier.toFixed(3);
    $("#metric-latency").textContent = metrics.latency_ms_mean == null ? "—" : `${metrics.latency_ms_mean.toFixed(1)} ms`;
    renderChart(metrics.bins);
    renderTable(result.results);
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = "运行内置基线集";
  }
}

function renderChart(bins) {
  $("#calibration-chart").className = "chart";
  $("#calibration-chart").innerHTML = bins.map((bin) => `
    <div class="chart-col" title="样本 ${bin.count} · 准确率 ${(bin.accuracy * 100).toFixed(1)}%">
      <div class="chart-bar" style="height:${Math.max(bin.accuracy * 100, bin.count ? 2 : 0)}%"></div>
      <span>${bin.lower.toFixed(1)}</span>
    </div>`).join("");
}

function renderTable(rows) {
  $("#eval-table").innerHTML = `<table><thead><tr><th>ID</th><th>标签</th><th>预测</th><th>置信度</th><th>结果</th></tr></thead><tbody>${rows.map((row) => `
    <tr><td>${row.id}</td><td>${row.label}</td><td>${row.prediction}</td><td>${(row.confidence * 100).toFixed(1)}%</td>
    <td class="${row.label === row.prediction ? "hit" : "miss"}">${row.label === row.prediction ? "正确" : "错误"}</td></tr>`).join("")}</tbody></table>`;
}

async function checkHealth() {
  try {
    const [health, models] = await Promise.all([fetch("/health").then((r) => r.json()), fetch("/api/models").then((r) => r.json())]);
    $(".health").classList.toggle("online", health.ok);
    $("#health-label").textContent = health.mock ? "Mock 联调模式" : "CLM 在线";
    $("#provider-label").textContent = health.mock ? "MOCK BASELINE" : "CLM SERVER";
    const model = models.models[0]?.name || "unknown";
    $("#model-label").textContent = model;
  } catch {
    $("#health-label").textContent = "服务不可用";
  }
}

document.querySelectorAll(".nav").forEach((button) => button.addEventListener("click", () => {
  document.querySelectorAll(".nav, .view").forEach((node) => node.classList.remove("active"));
  button.classList.add("active");
  $(`#${button.dataset.view}`).classList.add("active");
}));
$("#preset").addEventListener("change", (event) => loadPreset(event.target.value));
$("#run-decision").addEventListener("click", runDecision);
$("#run-eval").addEventListener("click", runEvaluation);
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") runDecision();
});
loadPreset("billing");
checkHealth();
