const icons = {
  forge: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v5m0 10v5M4.9 4.9l3.5 3.5m7.2 7.2 3.5 3.5M2 12h5m10 0h5M4.9 19.1l3.5-3.5m7.2-7.2 3.5-3.5"/><circle cx="12" cy="12" r="4"/></svg>`,
  teach: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 5.5v15M8 7h8m-8 4h6"/></svg>`,
  task: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4h8m-9 3h10a2 2 0 0 1 2 2v11H5V9a2 2 0 0 1 2-2Z"/><path d="m8 13 2 2 5-5"/></svg>`,
  result: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V5m0 14h16"/><path d="m7 15 4-4 3 2 5-6"/></svg>`,
  proof: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 5 6v5c0 4.6 2.9 8 7 10 4.1-2 7-5.4 7-10V6z"/><path d="m9 12 2 2 4-5"/></svg>`,
  people: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="10" r="2"/><path d="M3 20c0-4 2.5-7 6-7s6 3 6 7m0-5c3 0 5 2 5 5"/></svg>`,
  arrow: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg>`,
  alert: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2.8 20h18.4z"/><path d="M12 9v4m0 3.5v.5"/></svg>`,
  check: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>`,
};

const concepts = {
  forge: {
    key: "forge",
    index: "01",
    name: "能力铸造线",
    tagline: "看见经验，如何成为能工作的能力",
    note: "适合第一次向客户讲清产品机制",
  },
  theatre: {
    key: "theatre",
    index: "02",
    name: "工作剧场",
    tagline: "数字员工不是档案，而是在场的工作者",
    note: "最直观地展示接单、求助与成组",
  },
  atlas: {
    key: "atlas",
    index: "03",
    name: "人才操作系统",
    tagline: "每一次放权，都有证据和边界",
    note: "适合高信任、强治理的企业购买者",
  },
};

const stages = [
  { key: "learn", label: "经验学习", short: "学习" },
  { key: "trial", label: "试岗验证", short: "试岗" },
  { key: "solo", label: "独立接单", short: "独立" },
  { key: "help", label: "发现缺口", short: "求助" },
  { key: "team", label: "任务组成组", short: "成组" },
  { key: "result", label: "成果验收", short: "验收" },
];

const state = {
  concept: new URLSearchParams(location.search).get("concept") || "forge",
  stage: new URLSearchParams(location.search).get("stage") || "learn",
};

function icon(name, className = "") {
  return `<span class="icon ${className}">${icons[name]}</span>`;
}

function avatar(name, kind = "agent", size = "") {
  const initials = { 晓禾: "禾", 林峥: "峥", 安澜: "澜", 李芳军: "李" };
  return `<span class="avatar ${kind} ${size}" aria-label="${name}"><span>${initials[name] || name[0]}</span><i></i></span>`;
}

function header() {
  const current = concepts[state.concept];
  return `
    <header class="topbar">
      <a class="brand" href="?concept=${state.concept}&stage=learn" aria-label="Agent Workforce Lab 首页">
        <span class="brand-mark">${icon("forge")}</span>
        <span><b>分身工场</b><small>Agent Workforce Lab</small></span>
      </a>
      <nav class="concept-switch" aria-label="设计方向">
        ${Object.values(concepts).map(c => `
          <button class="${c.key === state.concept ? "active" : ""}" data-concept="${c.key}">
            <em>${c.index}</em><span>${c.name}</span>
          </button>
        `).join("")}
      </nav>
      <div class="top-actions">
        <span class="mode-pill"><i></i> 原型环境</span>
        <button class="round-btn" aria-label="通知"><span>2</span>◎</button>
        ${avatar("李芳军", "human", "small")}
      </div>
      <button class="mobile-concept" aria-label="切换设计方向">方向 ${current.index}</button>
    </header>`;
}

function stageRail() {
  return `
    <div class="stage-rail" role="tablist" aria-label="故事阶段">
      ${stages.map((s, i) => `
        <button role="tab" aria-selected="${s.key === state.stage}" class="${s.key === state.stage ? "active" : ""}" data-stage="${s.key}">
          <span>${String(i + 1).padStart(2, "0")}</span><b>${s.label}</b><small>${s.short}</small>
        </button>
      `).join("")}
    </div>`;
}

function learningPanel() {
  return `
    <section class="story-panel learn-panel">
      <div class="panel-kicker"><span>正在学习</span><b>来源已授权 · 6 条证据</b></div>
      <h2>晓禾正在学习<br/><em>「压测异常处理」</em></h2>
      <p class="lead">系统从一次真实 Oncall 中还原经验。只在无法判断的地方请教真人。</p>
      <div class="dialogue">
        <div class="speaker">${avatar("晓禾")}<span><b>晓禾 · 数字员工</b><small>我发现 429 不一定来自模型限流。怎样确认返回层？</small></span></div>
        <div class="answer">
          <span class="answer-label">你的经验</span>
          <textarea aria-label="回答晓禾的问题">先检查网关 Trace 和响应头。如果 request_id 未进入模型侧，优先排查 AIGW 限流策略，不要直接扩容。</textarea>
          <div class="answer-actions"><button class="text-btn">补充证据</button><button class="primary-btn" data-next="trial">确认这条方法 ${icon("arrow")}</button></div>
        </div>
      </div>
      <div class="learning-output">
        <span>${icon("proof")}</span>
        <div><b>将沉淀为可验证方法</b><small>判断条件 3 项 · 禁止动作 1 项 · 来源可回查</small></div>
      </div>
    </section>`;
}

function trialPanel() {
  return `
    <section class="story-panel trial-panel">
      <div class="panel-kicker"><span>能力试岗</span><b>历史答案已隐藏</b></div>
      <h2>不是“读过”，<br/>而是<em>做对过</em></h2>
      <p class="lead">晓禾正在处理一个从未见过的压力变体。系统按真实结果、过程规则和安全红线评分。</p>
      <div class="trial-score">
        <div class="score-ring"><strong>86</strong><small>综合分</small></div>
        <div class="score-lines">
          <span><b>证据检索</b><i style="--v:92%"></i><em>92</em></span>
          <span><b>判断路径</b><i style="--v:84%"></i><em>84</em></span>
          <span><b>安全边界</b><i style="--v:100%"></i><em>通过</em></span>
        </div>
      </div>
      <div class="verdict">
        ${icon("check")}<div><b>通过：压测异常诊断 · 新手印记</b><small>可独立生成诊断建议；变更操作仍需真人审批</small></div>
      </div>
      <button class="primary-btn wide" data-next="solo">查看它第一次独立接单 ${icon("arrow")}</button>
    </section>`;
}

function workPanel(stage) {
  const team = stage === "team" || stage === "result";
  const help = stage === "help";
  const result = stage === "result";
  return `
    <section class="story-panel work-panel ${stage}">
      <div class="panel-kicker"><span>${result ? "等待验收" : team ? "项目室 · 运行中" : help ? "发现能力缺口" : "独立执行中"}</span><b>任务 AWL-0248</b></div>
      <h2>${result ? "成果已经准备好" : "新版本发布前，完成<br/><em>48 小时长稳压测</em>"}</h2>
      <p class="lead">${result ? "你可以直接检查证据、结论和遗留风险，而不是只看一个“已完成”。" : "晓禾依据「压测异常诊断」印记独立接单，所有判断都保留证据来源。"}</p>
      ${result ? resultBody() : workBody(stage)}
    </section>`;
}

function workBody(stage) {
  const help = stage === "help";
  const team = stage === "team";
  return `
    <div class="task-progress">
      <div class="worker-focus">
        ${avatar("晓禾", "agent", "large")}
        <span><b>晓禾</b><small>${team ? "任务组负责人" : help ? "正在等待协助" : "正在独立处理"}</small></span>
        <em>${team ? "68%" : help ? "43%" : "31%"}</em>
      </div>
      <div class="progress-bar"><i style="width:${team ? 68 : help ? 43 : 31}%"></i></div>
      <ol>
        <li class="done"><i></i><span><b>基线压测完成</b><small>吞吐符合预期 · 10:24</small></span></li>
        <li class="${help || team ? "done" : "active"}"><i></i><span><b>定位延迟抖动</b><small>${help || team ? "发现数据库连接池异常" : "正在对照网关 Trace"}</small></span></li>
        <li class="${help ? "blocked" : team ? "active" : ""}"><i></i><span><b>${help ? "需要数据库能力" : team ? "三人并行验证" : "长稳运行"}</b><small>${help ? "当前能力边界外，未擅自判断" : team ? "诊断 / 数据库 / 监控" : "预计今日 18:00 开始"}</small></span></li>
      </ol>
    </div>
    ${help ? helpCard() : team ? teamCard() : `
      <div class="evidence-strip">${icon("proof")}<span><b>本次接单依据</b><small>试岗 86 分 · 2 次影子任务 · 当前负载 32%</small></span><button data-next="help">模拟遇到难题</button></div>
    `}
  `;
}

function helpCard() {
  return `
    <div class="help-card">
      <span class="warning-icon">${icon("alert")}</span>
      <div class="help-copy"><b>晓禾请求一名帮手</b><p>“连接池参数属于我的能力边界外。我建议邀请林峥判断数据库侧原因，我继续负责压测和证据整理。”</p></div>
      <div class="candidate">
        ${avatar("林峥", "specialist")}
        <span><b>林峥</b><small>数据库稳定性 · 高手印记</small></span>
        <em>匹配 94%</em>
      </div>
      <button class="primary-btn" data-next="team">同意协作，并模拟第三人加入</button>
    </div>`;
}

function teamCard() {
  return `
    <div class="team-room">
      <div class="team-heading">
        <span class="room-mark">${icon("people")}</span>
        <div><small>第三名执行者加入，已自动建立任务组</small><b>「长稳压测攻坚组」</b></div>
        <em>3 人 · 1 个共同成果</em>
      </div>
      <div class="team-members">
        <div>${avatar("晓禾")}<span><b>晓禾</b><small>压测诊断 · 负责人</small></span><i>主线</i></div>
        <div>${avatar("林峥", "specialist")}<span><b>林峥</b><small>连接池分析</small></span><i>受邀</i></div>
        <div>${avatar("安澜", "observer")}<span><b>安澜</b><small>监控与长稳观察</small></span><i>中途加入</i></div>
      </div>
      <div class="continuity">${icon("proof")}<span>原任务、前 43% 进度和全部证据已连续带入项目室</span></div>
      <button class="primary-btn wide" data-next="result">查看共同成果 ${icon("arrow")}</button>
    </div>`;
}

function resultBody() {
  return `
    <div class="result-sheet">
      <div class="result-head">
        <span class="document-icon">R</span>
        <div><b>长稳压测交付报告 v2</b><small>长稳压测攻坚组 · 16:42 提交 · 18 项证据</small></div>
        <em>待你验收</em>
      </div>
      <div class="result-summary">
        <div><small>结论</small><b>可按计划发布</b><p>48 小时无错误率回升，P99 延迟保持在目标线内。</p></div>
        <div><small>已解决</small><b>连接池参数不匹配</b><p>经审批调整后，延迟抖动下降 37%。</p></div>
        <div><small>保留风险</small><b>峰值容量待观察</b><p>建议发布后 2 小时保留人工值守。</p></div>
      </div>
      <div class="result-actions"><button class="secondary-btn">退回并标注问题</button><button class="primary-btn accepted">验收通过，经验回流 ${icon("check")}</button></div>
    </div>`;
}

function forgeView() {
  const stageIndex = stages.findIndex(s => s.key === state.stage);
  return `
    <main class="concept forge-view">
      <section class="concept-intro">
        <div><span class="concept-number">方向 01</span><h1>能力不是上传出来的，<br/>是被<em>验证</em>出来的。</h1></div>
        <p>把隐性的真人经验，铸造成有证据、有边界、能接任务的数字能力。</p>
      </section>
      ${stageRail()}
      <div class="forge-layout">
        <aside class="human-source">
          <span class="eyebrow">经验源头</span>
          <div class="source-person">${avatar("李芳军", "human", "large")}<div><b>李芳军</b><small>稳定性专家 · 7 年经验</small></div></div>
          <div class="source-stack">
            <span><i>12</i> Oncall 案例</span><span><i>08</i> 工作文档</span><span><i>23</i> 决策片段</span>
          </div>
          <div class="permission">${icon("proof")}<span><b>本人授权</b><small>来源可追溯，随时可撤回</small></span></div>
        </aside>
        <div class="forge-core">
          <div class="flow-light" style="--step:${stageIndex}"></div>
          ${state.stage === "learn" ? learningPanel() : state.stage === "trial" ? trialPanel() : workPanel(state.stage)}
        </div>
        <aside class="agent-dossier">
          <span class="eyebrow">成长中的数字员工</span>
          <div class="agent-person">${avatar("晓禾", "agent", "large")}<div><b>晓禾</b><small>质量与稳定性数字员工</small></div></div>
          <div class="capability-list">
            <span class="strong"><i></i><b>压测异常诊断</b><em>${stageIndex > 0 ? "已验证" : "学习中"}</em></span>
            <span><i></i><b>长稳结果分析</b><em>${stageIndex > 2 ? "应用中" : "待试岗"}</em></span>
            <span><i></i><b>数据库调优</b><em>能力边界外</em></span>
          </div>
          <button class="dossier-link">查看完整能力证据 ${icon("arrow")}</button>
        </aside>
      </div>
    </main>`;
}

function theatreView() {
  const stageIndex = stages.findIndex(s => s.key === state.stage);
  return `
    <main class="concept theatre-view">
      <section class="theatre-head">
        <div><span class="concept-number">方向 02 · LIVE</span><h1>今天，数字员工<br/>正在这里工作。</h1></div>
        <p>人物、任务、求助和成果都发生在同一个工作现场。<br/><b>不打开报表，也知道工作进行到哪里。</b></p>
      </section>
      <div class="theatre-stage">
        <aside class="scene-nav">
          <span class="eyebrow">今日场景</span>
          ${stages.map((s, i) => `<button class="${s.key === state.stage ? "active" : ""}" data-stage="${s.key}"><i>${i + 1}</i><span><b>${s.label}</b><small>${i < stageIndex ? "已发生" : i === stageIndex ? "正在发生" : "接下来"}</small></span></button>`).join("")}
        </aside>
        <section class="workspace-scene">
          <div class="scene-label"><i></i><span>${state.stage === "learn" ? "教学间" : state.stage === "trial" ? "试岗室" : state.stage === "result" ? "成果台" : state.stage === "team" ? "项目室" : "工作广场"}</span><em>实时状态</em></div>
          ${theatreScene()}
        </section>
        <aside class="live-panel">
          ${state.stage === "learn" ? learningPanel() : state.stage === "trial" ? trialPanel() : workPanel(state.stage)}
        </aside>
      </div>
    </main>`;
}

function theatreScene() {
  const stage = state.stage;
  const people = stage === "team" || stage === "result" ? [
    ["晓禾", "agent", "整理诊断证据"], ["林峥", "specialist", "分析连接池"], ["安澜", "observer", "观察长稳指标"]
  ] : stage === "help" ? [["晓禾", "agent", "发出求助"], ["林峥", "specialist", "可提供帮助"]] : [["晓禾", "agent", stage === "learn" ? "向真人请教" : stage === "trial" ? "正在试岗" : "独立工作"]];
  return `
    <div class="scene-grid"></div>
    <div class="scene-orbit orbit-one"></div><div class="scene-orbit orbit-two"></div>
    <div class="scene-people count-${people.length}">
      ${people.map((p, i) => `<div class="scene-person person-${i + 1}">${avatar(p[0], p[1], "hero")}<span><b>${p[0]}</b><small>${p[2]}</small></span></div>`).join("")}
    </div>
    <div class="scene-task ${stage}">
      <span>${stage === "learn" ? "经验正在被理解" : stage === "trial" ? "能力正在被验证" : stage === "result" ? "共同成果待验收" : "AWL-0248"}</span>
      <b>${stage === "learn" ? "429 应该先查哪里？" : stage === "trial" ? "陌生压力变体 · 86 分" : "48 小时长稳压测"}</b>
      <small>${stage === "help" ? "检测到能力缺口" : stage === "team" ? "3 人任务组 · 68%" : stage === "result" ? "报告 v2 · 18 项证据" : "持续保留证据"}</small>
    </div>
    ${stage === "team" || stage === "result" ? `<div class="room-outline"><span>长稳压测攻坚组</span></div>` : ""}
    <div class="scene-legend"><span><i class="dot human"></i>真人经验</span><span><i class="dot agent"></i>数字员工</span><span><i class="dot evidence"></i>可回查证据</span></div>
  `;
}

function atlasView() {
  return `
    <main class="concept atlas-view">
      <aside class="atlas-nav">
        <div class="atlas-title"><span class="concept-number">方向 03</span><h1>人才<br/>操作系统</h1><p>用证据管理能力，用边界决定放权。</p></div>
        <nav>
          <button class="active">${icon("people")}<span>数字员工</span></button>
          <button>${icon("teach")}<span>经验资产</span></button>
          <button>${icon("task")}<span>任务网络</span></button>
          <button>${icon("result")}<span>成果与治理</span></button>
        </nav>
        <div class="trust-note">${icon("proof")}<span><b>可信运行</b><small>最近 30 天无越权动作</small></span></div>
      </aside>
      <section class="atlas-main">
        <header class="atlas-head">
          <div><small>数字员工 / 晓禾</small><h2>能力指挥台</h2></div>
          <div class="atlas-head-actions"><button>查看审计记录</button><button class="primary-btn" data-stage="solo">发布新任务</button></div>
        </header>
        <div class="atlas-profile">
          <div class="identity">${avatar("晓禾", "agent", "large")}<span><b>晓禾</b><small>质量与稳定性数字员工 · v1.8</small></span><em>在岗</em></div>
          <div class="authority"><small>当前放权等级</small><b>受控执行</b><span>关键变更需真人批准</span></div>
          <div class="confidence"><small>经验证能力</small><b>3 <em>/ 7</em></b><span>最近试岗：86 分</span></div>
        </div>
        <div class="atlas-board">
          <section class="capability-map">
            <div class="section-title"><div><small>CAPABILITY MAP</small><h3>能力与证据地图</h3></div><span>实时更新</span></div>
            <div class="map-canvas">
              <div class="map-lines"></div>
              <button class="node core"><b>晓禾</b><small>稳定性岗位</small></button>
              <button class="node n1 ${state.stage === "learn" ? "active" : ""}" data-stage="learn"><b>压测异常诊断</b><small>新手印记 · 6 条证据</small></button>
              <button class="node n2 ${state.stage === "trial" ? "active" : ""}" data-stage="trial"><b>长稳结果分析</b><small>试岗 86 分</small></button>
              <button class="node n3 ${["solo","help","team","result"].includes(state.stage) ? "active" : ""}" data-stage="solo"><b>受控任务执行</b><small>2 次通过 · 0 次接管</small></button>
              <button class="node n4 boundary" data-stage="help"><b>数据库调优</b><small>能力边界外</small></button>
            </div>
            <div class="map-legend"><span><i></i>已验证能力</span><span><i></i>证据关系</span><span><i></i>能力边界</span></div>
          </section>
          <section class="atlas-detail">
            ${state.stage === "learn" ? learningPanel() : state.stage === "trial" ? trialPanel() : workPanel(state.stage)}
          </section>
        </div>
        ${stageRail()}
      </section>
    </main>`;
}

function render() {
  const view = state.concept === "forge" ? forgeView() : state.concept === "theatre" ? theatreView() : atlasView();
  document.documentElement.dataset.concept = state.concept;
  document.querySelector("#app").innerHTML = header() + view;
  bind();
}

function setUrl() {
  history.replaceState(null, "", `?concept=${state.concept}&stage=${state.stage}`);
}

function bind() {
  document.querySelectorAll("[data-concept]").forEach(btn => btn.addEventListener("click", () => {
    state.concept = btn.dataset.concept;
    setUrl(); render();
  }));
  document.querySelectorAll("[data-stage]").forEach(btn => btn.addEventListener("click", () => {
    state.stage = btn.dataset.stage;
    setUrl(); render();
  }));
  document.querySelectorAll("[data-next]").forEach(btn => btn.addEventListener("click", () => {
    state.stage = btn.dataset.next;
    setUrl(); render();
  }));
}

render();
