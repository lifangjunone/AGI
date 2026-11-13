const form = document.querySelector("#fortune-form");
const report = document.querySelector("#report");
const snapshot = document.querySelector("#snapshot");
const subtitle = document.querySelector("#result-subtitle");
const modelPill = document.querySelector("#model-pill");
const starTotal = document.querySelector("#star-total");
const chinaMap = document.querySelector("#china-map");
const provinceRank = document.querySelector("#province-rank");
const recentStars = document.querySelector("#recent-stars");
const quotaNote = document.querySelector("#quota-note");
const paywall = document.querySelector("#paywall");
const registerLink = document.querySelector("#register-link");
const billingLink = document.querySelector("#billing-link");
const regenerateButton = document.querySelector("#regenerate-button");
const birthDateInput = form.elements.birthDate;
const birthDatePicker = document.querySelector("#birth-date-picker");
const birthDateOpen = document.querySelector("#birth-date-open");
const birthPlaceInput = form.elements.birthPlace;
const latitudeInput = form.elements.latitude;
const longitudeInput = form.elements.longitude;
const geoDisplay = document.querySelector("#geo-display");
const geoStatus = document.querySelector("#geo-status");
let geocodeTimer = null;
let geocodeAbort = null;
let geocodeSequence = 0;
let provinceRankExpanded = false;
let recentStarsExpanded = false;
let latestStarmapData = null;

const provincePoints = {
  北京: [70, 38], 天津: [72, 40], 河北: [67, 42], 山西: [61, 43], 内蒙古: [55, 28],
  辽宁: [80, 33], 吉林: [84, 25], 黑龙江: [85, 15], 上海: [76, 58], 江苏: [73, 54],
  浙江: [76, 62], 安徽: [69, 56], 福建: [73, 70], 江西: [66, 66], 山东: [73, 46],
  河南: [62, 51], 湖北: [60, 59], 湖南: [57, 68], 广东: [61, 79], 广西: [51, 78],
  海南: [59, 96], 重庆: [50, 62], 四川: [42, 60], 贵州: [49, 72], 云南: [38, 77],
  西藏: [23, 63], 陕西: [56, 49], 甘肃: [43, 43], 青海: [34, 47], 宁夏: [52, 41],
  新疆: [20, 29], 香港: [63, 84], 澳门: [61, 84], 台湾: [77, 84], 未知: [50, 53]
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function markdownToHtml(markdown) {
  const lines = String(markdown || "").split(/\n+/);
  return lines.map((line) => {
    if (line.startsWith("### ")) return `<h3>${escapeHtml(line.slice(4))}</h3>`;
    if (line.startsWith("## ")) return `<h2>${escapeHtml(line.slice(3))}</h2>`;
    if (line.startsWith("# ")) return `<h2>${escapeHtml(line.slice(2))}</h2>`;
    if (!line.trim()) return "";
    return `<p>${escapeHtml(line).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</p>`;
  }).join("");
}

function listToTags(items = [], tone = "") {
  return items.map((item) => `<span class="fate-tag ${tone}">${escapeHtml(item)}</span>`).join("");
}

function professionalTags(professional) {
  const systems = professional?.synthesis?.systems || ["星座", "轻量八字"];
  return listToTags(systems, professional?.available ? "cyan" : "");
}

function renderProfessionalCards(professional) {
  if (!professional?.available) {
    return `
      <section class="reading-card professional-card wide-card" id="report-pro">
        <div class="reading-card-head">
          <span class="reading-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 2l3 7h7l-5.6 4.4 2.2 7.6L12 16.7 5.4 21l2.2-7.6L2 9h7l3-7z"/></svg></span>
          <div><small>专业合参</small><h3>基础报告已生成，专业引擎待启用</h3></div>
        </div>
        <p>当前先返回星座、轻量八字和桃花方位。接入 Python 历法依赖后，可进一步展示紫微斗数命盘与奇门桃花方位。</p>
        <div class="tag-cloud">${professionalTags(professional)}</div>
      </section>
    `;
  }
  const ziwei = professional.ziwei || {};
  const qimen = professional.qimen || {};
  const mingStars = (ziwei.keyPalaces || []).find((item) => item.name === "命宫")?.majorStars || [];
  const loveStars = (ziwei.keyPalaces || []).find((item) => item.name === "夫妻")?.majorStars || [];
  const direction = qimen.actionDirection;
  const highlights = professional.synthesis?.highlights || [];
  return `
    <section class="reading-card professional-card wide-card" id="report-pro">
      <div class="reading-card-head">
        <span class="reading-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 2l3 7h7l-5.6 4.4 2.2 7.6L12 16.7 5.4 21l2.2-7.6L2 9h7l3-7z"/></svg></span>
        <div><small>专业合参</small><h3>${escapeHtml(professional.synthesis?.label || "专业增强")} · 规则排盘 + 基座解读</h3></div>
      </div>
      <div class="professional-grid">
        <article>
          <small>紫微命盘</small>
          <b>${escapeHtml(ziwei.mingGong?.branch || "-")}宫命 · ${escapeHtml(ziwei.wuxingJu?.name || "-")}</b>
          <p>命主${escapeHtml(ziwei.mingZhu || "-")}，身主${escapeHtml(ziwei.shenZhu || "-")}；命宫主星${escapeHtml(mingStars.join("、") || "待解读")}。</p>
        </article>
        <article>
          <small>关系宫位</small>
          <b>夫妻宫 ${escapeHtml(loveStars.join("、") || "无主星/待合参")}</b>
          <p>适合结合夫妻宫、福德宫与流年四化一起看关系课题。</p>
        </article>
        <article>
          <small>奇门桃花方位</small>
          <b>${escapeHtml(direction?.direction || "-")} · ${escapeHtml(direction?.name || "-")}</b>
          <p>可关注${escapeHtml(direction?.provinces?.join("、") || "常驻城市周边")}相关的人脉、出行和线上连接。</p>
        </article>
      </div>
      <div class="professional-highlights">
        ${highlights.map((item) => `<p>${escapeHtml(item)}</p>`).join("")}
      </div>
      <div class="tag-cloud">${professionalTags(professional)}</div>
    </section>
  `;
}

function proseToParagraphs(text, limit = 3) {
  return String(text || "")
    .split(/\n+/)
    .map((line) => line.replace(/^#{1,3}\s*/, "").trim())
    .filter(Boolean)
    .slice(0, limit)
    .map((line) => `<p>${escapeHtml(line).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</p>`)
    .join("");
}

function payloadFromForm() {
  const data = new FormData(form);
  return Object.fromEntries(data.entries());
}

function formatDateForText(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return value.replaceAll("-", "/");
}

function setGeoStatus(message, mode = "") {
  geoStatus.textContent = message;
  geoStatus.className = `geo-status ${mode}`.trim();
}

function setCoordinates(match) {
  latitudeInput.value = Number(match.latitude).toFixed(4);
  longitudeInput.value = Number(match.longitude).toFixed(4);
  geoDisplay.value = `${match.name} · ${Number(match.latitude).toFixed(4)}, ${Number(match.longitude).toFixed(4)}`;
}

async function geocodeBirthPlace() {
  const query = birthPlaceInput.value.trim();
  const sequence = ++geocodeSequence;
  if (query.length < 2) {
    geoDisplay.value = "等待填写出生地";
    setGeoStatus("填写完整出生地后，我会自动计算经纬度。");
    return;
  }
  geocodeAbort?.abort();
  geocodeAbort = new AbortController();
  setGeoStatus("正在识别出生地经纬度…");
  try {
    const response = await fetch(`api/geocode?q=${encodeURIComponent(query)}`, { signal: geocodeAbort.signal });
    const data = await response.json();
    if (sequence !== geocodeSequence || query !== birthPlaceInput.value.trim()) return;
    if (!response.ok || !data.ok) throw new Error(data.error || "地点识别失败");
    const [match] = data.matches || [];
    if (!match) {
      geoDisplay.value = "未匹配到地点";
      setGeoStatus("暂时没有识别到这个出生地，可以在高级校准里手动填写经纬度。", "warn");
      return;
    }
    setCoordinates(match);
    const precisionHint = match.level === "省份" ? "当前只识别到省级位置；继续输入城市/区县会自动改用更精确地点。" : "经纬度已按你输入的详细程度回填。";
    setGeoStatus(`已自动匹配为「${match.name}」。${precisionHint}`, "ok");
  } catch (error) {
    if (error.name === "AbortError") return;
    if (sequence !== geocodeSequence) return;
    setGeoStatus("地点识别失败，可以稍后重试或手动修正经纬度。", "warn");
  }
}

function renderSnapshot(fortune, source, professional) {
  const items = [
    ["太阳星座", fortune.astrology.sunSign.name, fortune.astrology.sunSign.element],
    ["上升星座", fortune.astrology.ascendant.name, "近似推算"],
    ["生肖八字", `${fortune.bazi.yearAnimal} · ${fortune.bazi.pillars.year}`, `主气${fortune.bazi.dominantElement}`],
    ["桃花方向", fortune.romance.direction, fortune.romance.provinces.join("、")],
    ["专业合参", professional?.available ? professional.synthesis?.label || "已启用" : "待启用", professional?.synthesis?.systems?.join(" × ") || "基础版"]
  ];
  snapshot.hidden = false;
  snapshot.innerHTML = items.map(([label, value, meta]) => `
    <div class="snapshot-card">
      <small>${escapeHtml(label)}</small>
      <b>${escapeHtml(value)}</b>
      <span>${escapeHtml(meta)}</span>
    </div>
  `).join("");
  subtitle.textContent = source === "maas" ? "已使用基座模型生成完整报告。" : "当前为本地规则报告；配置 MaaS Key 后可启用模型润色。";
}

function renderFortuneReport(fortune, reportMarkdown, source, professional) {
  const subject = fortune.subject;
  const astrology = fortune.astrology;
  const bazi = fortune.bazi;
  const compatibility = fortune.compatibility;
  const romance = fortune.romance;
  const modelLabel = source === "maas" ? "基座模型补充" : "本地规则补充";
  const precisionLabel = subject.birthTimePrecision === "shichen" ? "传统时辰" : "精确时间";
  const elementEntries = Object.entries(bazi.elements || {}).filter(([, value]) => value > 0);

  report.innerHTML = `
    <div class="fate-report">
      <section class="fate-hero-card">
        <div>
          <p class="fate-kicker">命盘总览</p>
          <h3>${escapeHtml(subject.name)}的星命矩阵</h3>
          <p>${escapeHtml(astrology.personalityBlend)}</p>
        </div>
        <div class="fate-orbit" aria-hidden="true">
          <span>${escapeHtml(astrology.sunSign.name)}</span>
          <b>${escapeHtml(bazi.yearAnimal)}</b>
          <small>${escapeHtml(romance.direction)}</small>
        </div>
      </section>

      <nav class="result-nav" aria-label="报告分区">
        <a href="#report-stars">星座画像</a>
        <a href="#report-bazi">八字匹配</a>
        <a href="#report-love">姻缘桃花</a>
        <a href="#report-pro">专业合参</a>
        <a href="#report-action">行动建议</a>
      </nav>

      <div class="report-grid">
        <section class="reading-card feature-card" id="report-stars">
          <div class="reading-card-head">
            <span class="reading-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 2l2.8 6.7 7.2.6-5.5 4.7 1.7 7-6.2-3.7L5.8 21l1.7-7L2 9.3l7.2-.6L12 2z"/></svg></span>
            <div><small>星座画像</small><h3>${escapeHtml(astrology.sunSign.name)} × ${escapeHtml(astrology.ascendant.name)}</h3></div>
          </div>
          <p>${escapeHtml(astrology.sunSign.name)}给你${escapeHtml(astrology.sunSign.traits.join("、"))}的核心动力；${escapeHtml(astrology.ascendant.name)}让你在人际里更像${escapeHtml(astrology.ascendant.traits.join("、"))}。</p>
          <div class="tag-cloud">
            ${listToTags([astrology.sunSign.element, astrology.sunSign.mode, ...astrology.sunSign.traits, ...astrology.ascendant.traits.slice(0, 2)], "gold")}
          </div>
        </section>

        <section class="reading-card" id="report-bazi">
          <div class="reading-card-head">
            <span class="reading-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z"/></svg></span>
            <div><small>八字匹配</small><h3>${escapeHtml(bazi.pillars.year)}年 · 生肖${escapeHtml(bazi.yearAnimal)}</h3></div>
          </div>
          <div class="pillar-grid">
            ${Object.entries(bazi.pillars).map(([key, value]) => `<div><small>${escapeHtml({ year: "年柱", month: "月柱", day: "日柱", hour: "时柱" }[key] || key)}</small><b>${escapeHtml(value)}</b></div>`).join("")}
          </div>
          <p>${escapeHtml(compatibility.logic)}</p>
          <div class="element-bars">
            ${elementEntries.map(([element, value]) => `<div class="element-bar"><span>${escapeHtml(element)}</span><i style="--w:${Math.max(20, value * 25)}%"></i><b>${value}</b></div>`).join("")}
          </div>
        </section>

        <section class="reading-card" id="report-love">
          <div class="reading-card-head">
            <span class="reading-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 21s-7.2-4.6-9.4-8.5C.7 9.1 3 5 7 5c2 0 3.5 1 5 2.8C13.5 6 15 5 17 5c4 0 6.3 4.1 4.4 7.5C19.2 16.4 12 21 12 21z"/></svg></span>
            <div><small>姻缘桃花</small><h3>桃花地支 ${escapeHtml(romance.peachBlossomBranch)} · ${escapeHtml(romance.peachBlossomAnimal)}</h3></div>
          </div>
          <p>${escapeHtml(romance.reading)}</p>
          <div class="mini-timeline">
            ${romance.peachBlossomYears.map((year) => `<span><b>${year}</b><small>桃花年</small></span>`).join("")}
          </div>
        </section>

        <section class="reading-card direction-card">
          <div class="reading-card-head">
            <span class="reading-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 2l8 20-8-4-8 4 8-20zm0 6.5L8.7 17l3.3-1.6 3.3 1.6L12 8.5z"/></svg></span>
            <div><small>桃花方向</small><h3>${escapeHtml(romance.direction)}</h3></div>
          </div>
          <p>这些省份不是绝对答案，更适合作为旅行、人脉、线上匹配和项目合作的方向提示。</p>
          <div class="tag-cloud province-tags">${listToTags(romance.provinces, "pink")}</div>
        </section>

        ${renderProfessionalCards(professional)}

        <section class="reading-card wide-card" id="report-action">
          <div class="reading-card-head">
            <span class="reading-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M13 3l8 8-8 8v-5H4V8h9V3z"/></svg></span>
            <div><small>行动建议</small><h3>把缘分概率变成可行动的选择</h3></div>
          </div>
          <div class="action-list">
            <article><b>匹配星座</b><p>${escapeHtml(compatibility.bestSigns.join("、"))}</p></article>
            <article><b>有缘属相</b><p>${escapeHtml(compatibility.bestAnimals.join("、"))}</p></article>
            <article><b>出生信息</b><p>${escapeHtml(subject.birthDate)} · ${escapeHtml(subject.birthTime)} · ${escapeHtml(precisionLabel)}</p></article>
          </div>
        </section>
      </div>

      <details class="ai-reading">
        <summary>${escapeHtml(modelLabel)}：展开深度解读</summary>
        <div class="ai-reading-body">${proseToParagraphs(reportMarkdown, 8) || `<p>${escapeHtml(fortune.disclaimer)}</p>`}</div>
      </details>
    </div>
  `;
}

function renderStarmap(data) {
  latestStarmapData = data;
  const boostStats = [
    ["广东", 328], ["浙江", 286], ["上海", 241], ["北京", 219], ["江苏", 198],
    ["四川", 176], ["山东", 153], ["湖北", 128], ["福建", 116], ["陕西", 97],
    ["甘肃", 88], ["重庆", 82], ["云南", 71], ["辽宁", 66], ["广西", 58]
  ];
  const liveNames = ["林**", "小**", "陈**", "阿**", "周**", "M**", "许**", "星**"];
  const rawStats = data.provinceStats || [];
  const merged = new Map(boostStats.map(([province, count]) => [province, { province, count, boosted: true }]));
  rawStats.forEach((item) => {
    const current = merged.get(item.province);
    merged.set(item.province, {
      province: item.province,
      count: (current?.count || 0) + item.count * 12,
      boosted: Boolean(current?.boosted)
    });
  });
  const stats = [...merged.values()].sort((a, b) => b.count - a.count);
  const max = Math.max(1, ...stats.map((item) => item.count));
  const heatTotal = stats.reduce((sum, item) => sum + item.count, 0) + Math.max(0, data.total || 0) * 17;
  starTotal.textContent = heatTotal.toLocaleString("zh-CN");
  const mapStars = stats.slice(0, 18).map((item) => {
    const [x, y] = provincePoints[item.province] || provincePoints.未知;
    const size = 9 + Math.round((item.count / max) * 15);
    const delay = ((x + y) % 7 / 10).toFixed(1);
    return `<button class="map-star" style="--x:${x}%;--y:${y}%;--size:${size}px;--delay:${delay}s" title="${escapeHtml(item.province)} 热度 ${item.count}" aria-label="${escapeHtml(item.province)} 星命热度 ${item.count}"><span>${escapeHtml(item.province)}</span></button>`;
  }).join("");
  chinaMap.innerHTML = `
    <div class="map-pulse-label" aria-hidden="true"><b>LIVE</b><span>缘分信号实时汇聚</span></div>
    <div class="map-outline-frame">
      <img class="china-map-outline" src="china-map.svg" alt="" aria-hidden="true">
      ${mapStars}
    </div>
  `;
  const visibleStats = provinceRankExpanded ? stats.slice(0, 10) : stats.slice(0, 5);
  provinceRank.innerHTML = visibleStats.map((item, index) => `<li><span>${index + 1}. ${escapeHtml(item.province)}</span><b>${item.count}</b></li>`).join("") || `<li><span>暂无测算记录</span><b>0</b></li>`;
  if (stats.length > 5) {
    provinceRank.innerHTML += `<li class="list-toggle-row"><button class="list-toggle" type="button" data-toggle-list="province" aria-expanded="${provinceRankExpanded}">${provinceRankExpanded ? "收起" : `查看更多 ${stats.length - 5} 个地区`}</button></li>`;
  }
  const syntheticRecent = stats.slice(0, 8).map((item, index) => ({
    name: liveNames[index % liveNames.length],
    province: item.province,
    sunSign: ["狮子座", "天秤座", "双鱼座", "射手座", "白羊座", "天蝎座"][index % 6]
  }));
  const recent = [];
  const seenRecent = new Set();
  [...(data.recent || []), ...syntheticRecent].forEach((item) => {
    const key = `${item.name}-${item.province}-${item.sunSign}`;
    if (seenRecent.has(key)) return;
    seenRecent.add(key);
    recent.push(item);
  });
  const visibleRecent = recentStarsExpanded ? recent.slice(0, 8) : recent.slice(0, 3);
  recentStars.innerHTML = visibleRecent.map((item) => `<div class="recent-item"><span>${escapeHtml(item.name)} · ${escapeHtml(item.province)}</span><b>${escapeHtml(item.sunSign)}</b></div>`).join("") || `<div class="recent-item"><span>等待第一颗星点</span><b>--</b></div>`;
  if (recent.length > 3) {
    recentStars.innerHTML += `<button class="list-toggle" type="button" data-toggle-list="recent" aria-expanded="${recentStarsExpanded}">${recentStarsExpanded ? "收起" : `查看更多 ${recent.length - 3} 条点亮`}</button>`;
  }
}

async function loadStarmap() {
  try {
    const response = await fetch("api/starmap");
    const data = await response.json();
    if (response.ok && data.ok) renderStarmap(data);
  } catch {
    renderStarmap({ total: 0, provinceStats: [], recent: [] });
  }
}

async function checkHealth() {
  try {
    const response = await fetch("api/health");
    const data = await response.json();
    modelPill.textContent = data.maasConfigured ? "基座模型已连接" : "本地规则版 · 可配置 MaaS";
  } catch {
    modelPill.textContent = "模型状态未知";
  }
}

async function generateReport() {
  const button = form.querySelector("button[type='submit']");
  regenerateButton.hidden = true;
  button.disabled = true;
  report.innerHTML = `<div class="empty-state loading-state"><div class="loading-orbit" aria-hidden="true"></div><p>正在展开星图，请稍等…</p></div>`;
  subtitle.textContent = "正在计算星座、八字、桃花年和方位。";
  try {
    const response = await fetch("api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payloadFromForm())
    });
    const data = await response.json();
    if (response.status === 402 && data.error === "free_quota_exhausted") {
      paywall.hidden = false;
      registerLink.href = data.actions?.registerUrl || registerLink.href;
      billingLink.href = data.actions?.billingUrl || billingLink.href;
      quotaNote.textContent = "免费 3 次已用完，请注册 / 开通后继续。";
      throw new Error(data.message || "免费次数已用完");
    }
    if (!response.ok || !data.ok) throw new Error(data.error || "分析失败");
    paywall.hidden = true;
    renderSnapshot(data.fortune, data.source, data.professional);
    renderFortuneReport(data.fortune, data.report, data.source, data.professional);
    document.querySelector("#result-title").textContent = "星命报告已生成";
    subtitle.textContent = data.source === "maas" ? "已按维度拆成卡片，并附上基座模型深度补充。" : "已按维度拆成卡片；当前为本地规则版。";
    regenerateButton.hidden = false;
    modelPill.textContent = data.source === "maas" ? `基座模型：${data.model.modelId}` : "本地规则版 · 未配置 Key";
    if (data.quota) quotaNote.textContent = `免费额度：已用 ${data.quota.used}/${data.quota.limit} 次，剩余 ${data.quota.remaining} 次。`;
    loadStarmap();
  } catch (error) {
    snapshot.hidden = true;
    regenerateButton.hidden = true;
    subtitle.textContent = "这次没有成功生成报告。";
    report.innerHTML = `<div class="error">生成失败：${escapeHtml(error.message)}。请检查出生日期格式或稍后重试。</div>`;
  } finally {
    button.disabled = false;
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await generateReport();
});

regenerateButton.addEventListener("click", generateReport);

document.addEventListener("click", (event) => {
  const toggle = event.target.closest("[data-toggle-list]");
  if (!toggle || !latestStarmapData) return;
  const target = toggle.dataset.toggleList;
  if (target === "province") provinceRankExpanded = !provinceRankExpanded;
  if (target === "recent") recentStarsExpanded = !recentStarsExpanded;
  renderStarmap(latestStarmapData);
});

birthPlaceInput.addEventListener("input", () => {
  clearTimeout(geocodeTimer);
  geocodeTimer = setTimeout(geocodeBirthPlace, 420);
});

birthPlaceInput.addEventListener("blur", geocodeBirthPlace);

birthDateOpen.addEventListener("click", () => {
  if (typeof birthDatePicker.showPicker === "function") birthDatePicker.showPicker();
  else birthDatePicker.click();
});

birthDatePicker.addEventListener("change", () => {
  if (birthDatePicker.value) birthDateInput.value = formatDateForText(birthDatePicker.value);
});

checkHealth();
loadStarmap();
