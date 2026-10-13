const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const industryPlaybooks = {
  餐饮: {
    proof: ["食材/制作过程", "真实出品近景", "到店路线与营业时间"],
    hooks: ["别再随便点了", "附近人还不知道", "老板最怕你看到"],
    objections: ["价格贵", "分量少", "等位久"],
  },
  美业: {
    proof: ["服务前后对比", "消毒与工具细节", "真人效果与适合人群"],
    hooks: ["显老的不是年龄", "做之前先看这个", "同样预算差别很大"],
    objections: ["效果不持久", "推销办卡", "卫生担忧"],
  },
  健身: {
    proof: ["动作纠错演示", "教练专业资质", "会员阶段变化"],
    hooks: ["练很久没变化", "新手别急着加重量", "这个动作多数人做错"],
    objections: ["没时间", "怕坚持不了", "私教太贵"],
  },
  宠物: {
    proof: ["服务过程记录", "环境清洁细节", "宠物状态前后对比"],
    hooks: ["养宠人最怕这一点", "别等出问题才处理", "毛孩子不会告诉你"],
    objections: ["宠物应激", "卫生担忧", "收费不透明"],
  },
  家政: {
    proof: ["施工前后对比", "透明报价步骤", "工具与安全规范"],
    hooks: ["先别急着换新的", "很多家庭多花了钱", "师傅上门前先问这句"],
    objections: ["临时加价", "修不好", "售后找不到人"],
  },
  通用: {
    proof: ["服务过程", "真实案例", "价格与适合人群"],
    hooks: ["附近人别错过", "花钱前先看这个", "大多数人不知道"],
    objections: ["价格贵", "效果不确定", "服务不透明"],
  },
};

let currentTab = "diagnosis";
let generated = {};
let leads = JSON.parse(localStorage.getItem("local-growth-leads") || "[]");

function upsertProposalLead(list, brief) {
  const next = [...list];
  const existing = next.find((lead) => lead.name === brief.shop);
  if (existing) {
    existing.status = "已发样稿";
    existing.note = existing.note || "明天跟进老板反馈";
    return next;
  }
  next.unshift({
    id: Date.now(),
    name: brief.shop,
    channel: "成交提案",
    status: "已发样稿",
    note: "明天跟进老板反馈",
  });
  return next;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getBrief() {
  return {
    shop: $("#shop-name").value.trim(),
    industry: $("#industry").value,
    ticket: Number($("#ticket").value || 0),
    product: $("#product").value.trim(),
    audience: $("#audience").value.trim(),
    pain: $("#pain").value.trim(),
  };
}

function makeDeliverables(brief) {
  const p = industryPlaybooks[brief.industry] || industryPlaybooks.通用;
  const breakEven = brief.ticket > 0 ? Math.ceil(99 / brief.ticket) : "少量";
  const shop = escapeHtml(brief.shop);
  const product = escapeHtml(brief.product);
  const audience = escapeHtml(brief.audience);
  const pain = escapeHtml(brief.pain);

  return {
    diagnosis: `
      <div class="proposal-badge">可直接展示给老板 · ¥99 体验提案</div>
      <h3>${shop}｜增长机会与回本账</h3>
      <blockquote><strong>一句话判断：</strong>当前不是“缺内容”，而是内容没有快速回答顾客的三个问题：为什么是你、值不值、现在为什么要来。</blockquote>
      <div class="value-equation"><span>服务费 ¥99</span><i>÷</i><span>客单价 ¥${brief.ticket || "—"}</span><i>=</i><strong>约 ${breakEven} 单回本</strong></div>
      <h4>发现的核心阻力</h4>
      <p>${pain || "线上内容缺少具体卖点和可信证据，顾客看完没有行动理由。"}</p>
      <h4>建议立即调整</h4>
      <ol>
        <li><strong>卖具体结果：</strong>主页和视频统一突出“${product}”，不要笼统介绍门店。</li>
        <li><strong>补足信任证据：</strong>连续展示${p.proof.join("、")}，少用空泛形容词。</li>
        <li><strong>缩短行动路径：</strong>每条内容只放一个动作，例如“私信预约”“到店出示视频”或“评论区问价格”。</li>
      </ol>
      <h4>体验包回本逻辑</h4>
      <p>体验包 99 元。按客单价 ¥${brief.ticket || "—"} 粗算，新增约 <strong>${breakEven} 单</strong>即可覆盖服务费。这里只是回本门槛估算，不承诺实际成交。</p>
      <h4>建议先拍的素材</h4>
      <p>${p.proof.map((item, index) => `${index + 1}. ${item}`).join("　")}</p>
    `,
    scripts: `
      <h3>${shop}｜3 条短视频脚本</h3>
      ${p.hooks.map((hook, index) => `
        <div class="script">
          <b>脚本 ${index + 1}｜${hook}</b>
          <p><strong>开头 3 秒：</strong>“${hook}——如果你正想找${product}，先看完这 ${index + 1} 点。”</p>
          <p><strong>镜头：</strong>${p.proof[index]}；画面叠字突出具体细节。</p>
          <p><strong>口播：</strong>“很多${audience}担心${p.objections[index]}。我们把过程拍给你看：从准备到完成，每一步都清楚。${product}不是越贵越好，适合你、信息透明才重要。”</p>
          <p><strong>结尾行动：</strong>“想知道你适合哪一种，评论区留‘方案’，我把避坑清单发你。”</p>
        </div>
      `).join("")}
      <p><small>发布前请核对事实、价格、资质和平台规则；不要使用无法证明的“第一”“最好”等绝对化用语。</small></p>
    `,
    reviews: `
      <h3>${shop}｜评价回复模板</h3>
      <h4>好评回复</h4>
      <ol>
        <li>谢谢你的认真分享！很开心这次${product}让你满意。你提到的细节我们会继续保持，期待下次见。</li>
        <li>感谢认可，也谢谢你把真实感受写出来。我们会把每次服务都按同样标准做好。</li>
        <li>看到你的反馈，今天都更有动力了。下次到店前可以提前联系我们，我们帮你预留时间。</li>
        <li>谢谢支持！你的推荐对小店非常重要。也欢迎把真实建议随时告诉我们。</li>
        <li>感谢选择${shop}。能帮到你是我们的荣幸，祝你今天也有好心情。</li>
      </ol>
      <h4>中差评回复</h4>
      <ol>
        <li>很抱歉这次体验没有达到预期。你提到的问题我们已经记录，希望通过平台私信了解具体时间和订单，核实后给你明确处理方案。</li>
        <li>谢谢你直说。关于“${p.objections[0]}”的感受，我们会复核当天情况，不回避问题。方便的话请私信订单信息，我们会由负责人跟进。</li>
        <li>抱歉让你久等/不舒服。我们正在检查服务流程，也希望有机会当面解决。请通过订单页联系我们，避免公开个人信息。</li>
        <li>感谢反馈。价格和服务内容应该在消费前说明清楚；若现场沟通有偏差，我们愿意核实并改进。</li>
        <li>我们理解你的失望，也不会用模板敷衍。请告诉我们到店日期和具体环节，负责人会在核实后回复处理结果。</li>
      </ol>
      <p><small>原则：不争辩、不泄露顾客信息、不诱导删评、不承诺未核实的赔偿。</small></p>
    `,
    calendar: `
      <div class="proposal-badge">成交后交付 · 执行清单</div>
      <h3>${shop}｜成交开场 + 7 天执行计划</h3>
      <blockquote><strong>先这样发给老板：</strong>“老板你好，我看了你们店的线上内容，针对「${product}」顺手做了一页增长建议。不是让你现在买代运营，你先看回本账和第一条脚本；如果觉得具体，完整体验包 99 元，24 小时交付。”</blockquote>
      <ol>
        <li><strong>周一｜问题切入：</strong>${p.hooks[0]}。讲清${audience}最常见的一个误区。</li>
        <li><strong>周二｜过程证明：</strong>完整展示${p.proof[0]}，镜头不要过度剪辑。</li>
        <li><strong>周三｜价格解释：</strong>拆解${product}的价格组成和适合人群。</li>
        <li><strong>周四｜真实问答：</strong>回答“${p.objections[0]}怎么办”，给出可验证的细节。</li>
        <li><strong>周五｜人物故事：</strong>老板/员工为什么做这家店，避免卖惨，突出专业选择。</li>
        <li><strong>周六｜到店攻略：</strong>路线、停车、预约、营业时间，一条说清楚。</li>
        <li><strong>周日｜复盘转化：</strong>整理本周最高频问题，邀请用户私信领取方案。</li>
      </ol>
      <h4>每条内容的统一结构</h4>
      <p>具体问题 → 真实过程/证据 → 谁适合 → 一个行动指令。连续执行 7 天后只看三项：有效咨询数、到店核销数、成交额。</p>
    `,
  };
}

function renderOutput() {
  $("#output").innerHTML = generated[currentTab] || "";
}

function generateLocal() {
  generated = makeDeliverables(getBrief());
  renderOutput();
}

function safeList(items, render) {
  return Array.isArray(items) ? items.map(render).join("") : "";
}

function makeAiDeliverables(result, brief) {
  const data = result.data;
  const shop = escapeHtml(brief.shop);
  return {
    diagnosis: `
      <div class="proposal-badge">可直接展示给老板 · ¥99 体验提案</div>
      <h3>${shop}｜增长机会与回本账</h3>
      <blockquote><strong>一句话判断：</strong>${escapeHtml(data.summary)}</blockquote>
      <div class="value-equation"><span>服务费 ¥99</span><i>÷</i><span>客单价 ¥${brief.ticket || "—"}</span><i>=</i><strong>约 ${brief.ticket > 0 ? Math.ceil(99 / brief.ticket) : "少量"} 单回本</strong></div>
      <h4>核心阻力</h4>
      <ol>${safeList(data.obstacles, (item) => `<li>${escapeHtml(item)}</li>`)}</ol>
      <h4>建议立即调整</h4>
      ${safeList(data.actions, (item) => `
        <div class="script">
          <b>${escapeHtml(item.title || "行动建议")}</b>
          <p>${escapeHtml(item.detail || "")}</p>
          <p><strong>需要的证据：</strong>${escapeHtml(item.evidence || "待商家确认")}</p>
        </div>
      `)}
      <h4>体验包回本门槛</h4>
      <p>体验包 99 元，按客单价 ¥${brief.ticket || "—"} 粗算，需要新增约 <strong>${brief.ticket > 0 ? Math.ceil(99 / brief.ticket) : "少量"} 单</strong>覆盖服务费。此处只计算门槛，不承诺成交。</p>
      <h4>交付前核对</h4>
      <ul>${safeList(data.caveats, (item) => `<li>${escapeHtml(item)}</li>`)}</ul>
    `,
    scripts: `
      <h3>${shop}｜AI 短视频脚本</h3>
      ${safeList(data.scripts, (item, index) => `
        <div class="script">
          <b>脚本 ${index + 1}｜${escapeHtml(item.title || "")}</b>
          <p><strong>开头 3 秒：</strong>${escapeHtml(item.hook || "")}</p>
          <p><strong>镜头：</strong>${safeList(item.shots, (shot) => `${escapeHtml(shot)}；`)}</p>
          <p><strong>口播：</strong>${escapeHtml(item.voiceover || "")}</p>
          <p><strong>行动指令：</strong>${escapeHtml(item.cta || "")}</p>
        </div>
      `)}
      <p><small>发布前请人工核对事实、价格、资质、画面版权和平台规则。</small></p>
    `,
    reviews: `
      <h3>${shop}｜AI 评价回复</h3>
      <h4>好评回复</h4>
      <ol>${safeList(data.reviews?.positive, (item) => `<li>${escapeHtml(item)}</li>`)}</ol>
      <h4>中差评回复</h4>
      <ol>${safeList(data.reviews?.negative, (item) => `<li>${escapeHtml(item)}</li>`)}</ol>
      <p><small>不争辩、不泄露顾客信息、不诱导删评；涉及退款或赔偿时必须先核实订单。</small></p>
    `,
    calendar: `
      <div class="proposal-badge">成交后交付 · 执行清单</div>
      <h3>${shop}｜成交开场 + 7 天执行计划</h3>
      <blockquote><strong>先这样发给老板：</strong>${escapeHtml(data.salesPitch || "")}</blockquote>
      ${safeList(data.calendar, (item) => `
        <div class="script">
          <b>${escapeHtml(item.day || "")}｜${escapeHtml(item.theme || "")}</b>
          <p>${escapeHtml(item.content || "")}</p>
          <p><strong>目标：</strong>${escapeHtml(item.goal || "")}</p>
        </div>
      `)}
    `,
  };
}

function setGenerating(active) {
  const button = $("#generate-button");
  button.disabled = active;
  button.classList.toggle("loading", active);
  $(".button-label").textContent = active ? "正在生成可售提案…" : "生成 ¥99 成交提案";
}

function setMeta(result, elapsedMs) {
  const usage = result.usage || {};
  const items = [result.providerLabel, result.degraded ? "保障生成：内容完整可用" : result.model, `${(elapsedMs / 1000).toFixed(1)} 秒`];
  if (usage.total_tokens) items.push(`${usage.total_tokens} tokens`);
  if (result.cached) items.push("已复用缓存");
  if (result.degraded) items.push("AI 不稳时自动兜底");
  else if (result.fallbackUsed) items.push("已自动切换兜底");
  $("#generation-meta").innerHTML = items
    .map((item, index) => `<span class="${(result.fallbackUsed || result.degraded) && index === items.length - 1 ? "fallback" : ""}">${escapeHtml(item)}</span>`)
    .join("");
}

async function generateWithAi() {
  const brief = { ...getBrief(), mode: $('input[name="mode"]:checked')?.value || "quality" };
  const started = performance.now();
  setGenerating(true);
  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(brief),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || "生成失败");
    generated = makeAiDeliverables(result, brief);
    renderOutput();
    setMeta(result, performance.now() - started);
    if (window.matchMedia("(max-width: 900px)").matches) setWorkPane("result");
    toast(
      result.degraded
        ? "AI 通道暂不稳定，已用保障引擎生成完整方案"
        : result.fallbackUsed
          ? "主模型不可用，已由兜底模型完成"
          : "AI 完整方案已生成"
    );
  } catch (error) {
    const rawMessage = error.message || "";
    const friendlyMessage = /JSON|Unterminated|string|position|格式|输出不完整/i.test(rawMessage)
      ? "模型输出不完整，请点击重新生成"
      : rawMessage || "生成失败，请稍后重试";
    toast(friendlyMessage);
    $("#generation-meta").innerHTML = `<span class="fallback">本次未生成成功</span><span>${escapeHtml(friendlyMessage)}</span><span>本地预览已保留</span>`;
  } finally {
    setGenerating(false);
  }
}

async function checkAiHealth() {
  const dot = $("#ai-status-dot");
  dot.className = "status-dot checking";
  $("#ai-status-title").textContent = "正在检查模型服务";
  $("#check-ai").disabled = true;
  try {
    const response = await fetch("/api/health/ai");
    const health = await response.json();
    const available = health.providers.filter((provider) => provider.ok);
    dot.className = `status-dot ${available.length ? "ok" : "error"}`;
    $("#ai-status-title").textContent = available.length
      ? "AI 可用"
      : "模型服务暂不可用";
  } catch {
    dot.className = "status-dot error";
    $("#ai-status-title").textContent = "无法检查模型服务";
  } finally {
    $("#check-ai").disabled = false;
  }
}

function textFromHtml(html) {
  const element = document.createElement("div");
  element.innerHTML = html;
  return element.innerText;
}

async function copyText(text, success = "已复制") {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
  toast(success);
}

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 1800);
}

function salesMessage(packageName) {
  const packages = {
    体验包: "99 元体验包：1 份门店诊断 + 3 条短视频脚本 + 10 条评价回复，24 小时交付，含 1 次修改。",
    标准包: "399 元标准包：7 天内容计划 + 10 条短视频脚本 + 20 条评价回复 + 主页卖点文案。",
    月度包: "1299 元月度陪跑：每周计划与复盘 + 30 条脚本 + 评价维护 + 1 次到店拍摄指导。",
  };
  return `老板你好，我看到你们店的线上内容，顺手做了一小段针对门店的优化样稿，不是群发模板。你先看有没有用；如果方向认可，我可以做${packages[packageName]}不承诺播放量或成交，只交付写清楚的内容，确认范围后再开始。`;
}

function saveLeads() {
  localStorage.setItem("local-growth-leads", JSON.stringify(leads));
  renderLeads();
}

function renderLeads() {
  const list = $("#lead-list");
  list.innerHTML = leads.map((lead) => `
    <tr data-id="${lead.id}">
      <td>${escapeHtml(lead.name)}</td>
      <td>${escapeHtml(lead.channel)}</td>
      <td>
        <select class="status-input" aria-label="${escapeHtml(lead.name)}状态">
          ${["待联系", "已联系", "有兴趣", "已发样稿", "已成交", "暂不需要"].map(
            (status) => `<option ${status === lead.status ? "selected" : ""}>${status}</option>`
          ).join("")}
        </select>
      </td>
      <td><input class="note-input" aria-label="${escapeHtml(lead.name)}备注" value="${escapeHtml(lead.note)}" /></td>
      <td><button class="delete-lead">删除</button></td>
    </tr>
  `).join("");
  $("#empty-leads").hidden = leads.length > 0;
  $("#lead-count").textContent = leads.length;
  $("#contact-count").textContent = leads.filter((lead) => lead.status !== "待联系").length;
  $("#deal-count").textContent = leads.filter((lead) => lead.status === "已成交").length;
  const deals = leads.filter((lead) => lead.status === "已成交").length;
  const revenue = deals * 99;
  $("#revenue-count").textContent = `¥${revenue}`;
  $("#nav-lead-count").textContent = leads.length;
  $("#side-deals").textContent = `${deals} / 3 单`;
  $("#side-revenue").textContent = revenue;
  $("#side-progress").style.width = `${Math.min(100, (deals / 3) * 100)}%`;
}

function exportCsv() {
  if (!leads.length) return toast("请先添加线索");
  const rows = [["门店", "来源", "状态", "备注"], ...leads.map((l) => [l.name, l.channel, l.status, l.note])];
  const csv = "\ufeff" + rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `门店线索-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

$("#brief-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  await generateWithAi();
});

$$(".tab").forEach((button) => button.addEventListener("click", () => {
  currentTab = button.dataset.tab;
  $$(".tab").forEach((tab) => tab.classList.toggle("active", tab === button));
  renderOutput();
}));

$("#copy-output").addEventListener("click", () => copyText(textFromHtml(generated[currentTab]), "当前交付内容已复制"));

$("#save-to-leads").addEventListener("click", () => {
  const brief = getBrief();
  if (!brief.shop) return toast("请先填写门店名称");
  leads = upsertProposalLead(leads, brief);
  saveLeads();
  toast("已加入客户跟进");
  $('.nav-item[data-view="pipeline"]').click();
});

$$("[data-package]").forEach((button) => button.addEventListener("click", () => {
  copyText(salesMessage(button.dataset.package), `${button.dataset.package}话术已复制`);
}));

const viewCopy = {
  proposal: ["做成交提案", "输入一家店，生成可以直接发给老板的 ¥99 提案"],
  pipeline: ["客户跟进", "每个客户只记录状态和下一步"],
  offers: ["报价与话术", "先用低门槛体验包成交，再升级长期服务"],
  plan: ["今日行动", "不要继续准备，今天完成真实触达"],
};

function setWorkPane(pane) {
  $(".proposal-layout").classList.toggle("show-result", pane === "result");
  $$("[data-work-pane]").forEach((button) => {
    button.classList.toggle("active", button.dataset.workPane === pane);
  });
}

$$("[data-work-pane]").forEach((button) => button.addEventListener("click", () => {
  setWorkPane(button.dataset.workPane);
}));

$$(".nav-item").forEach((button) => button.addEventListener("click", () => {
  const view = button.dataset.view;
  $$(".nav-item").forEach((item) => item.classList.toggle("active", item === button));
  $$(".view").forEach((panel) => panel.classList.toggle("active", panel.dataset.viewPanel === view));
  $("#view-title").textContent = viewCopy[view][0];
  $("#view-subtitle").textContent = viewCopy[view][1];
}));

$("#lead-form").addEventListener("submit", (event) => {
  event.preventDefault();
  leads.unshift({
    id: Date.now(),
    name: $("#lead-name").value.trim(),
    channel: $("#lead-channel").value.trim(),
    status: $("#lead-status").value,
    note: $("#lead-note").value.trim(),
  });
  event.target.reset();
  saveLeads();
  toast("线索已添加");
});

$("#lead-list").addEventListener("change", (event) => {
  const row = event.target.closest("tr");
  if (!row) return;
  const lead = leads.find((item) => item.id === Number(row.dataset.id));
  if (!lead) return;
  if (event.target.classList.contains("status-input")) lead.status = event.target.value;
  if (event.target.classList.contains("note-input")) lead.note = event.target.value;
  saveLeads();
});

$("#lead-list").addEventListener("click", (event) => {
  if (!event.target.classList.contains("delete-lead")) return;
  const id = Number(event.target.closest("tr").dataset.id);
  leads = leads.filter((lead) => lead.id !== id);
  saveLeads();
  toast("线索已删除");
});

$("#export-leads").addEventListener("click", exportCsv);
$("#check-ai").addEventListener("click", checkAiHealth);

function updateHeroEconomics(value) {
  const ticket = Math.max(1, Number(value) || 1);
  $("#hero-orders").textContent = Math.ceil(99 / ticket);
}

$("#hero-ticket").addEventListener("input", (event) => {
  updateHeroEconomics(event.target.value);
  $("#ticket").value = event.target.value;
});

$("#ticket").addEventListener("input", (event) => {
  $("#hero-ticket").value = event.target.value;
  updateHeroEconomics(event.target.value);
});

generateLocal();
renderLeads();
checkAiHealth();

if (typeof module !== "undefined") {
  module.exports = { upsertProposalLead };
}
