import { diagnose } from "./diagnosis.mjs";

const levels = [
  {
    name: "准点走人", chapter: "电梯冲刺", input: "6 点 58 分老板说有个小需求，明早要。我真的服了。",
    mode: "escape", target: 10, instruction: "点空跑道，别被任何人拦住。", progress: "距电梯"
  },
  {
    name: "需求漂移怪", chapter: "反复横跳", input: "甲方说要五彩斑斓的黑，还说感觉不对让我再改一版。",
    mode: "shred", target: 6, instruction: "把 6 份“再改一版”拖进碎纸机。", progress: "待粉碎需求"
  },
  {
    name: "会议漩涡怪", chapter: "时间蒸发", input: "今天开了 7 个会，真正干活时间 18 分钟，还要写周报。",
    mode: "pop", target: 9, instruction: "戳破冒出来的会议泡泡，别让它们占满一天。", progress: "剩余会议泡泡"
  },
  {
    name: "甩锅回旋镖", chapter: "精准命中", input: "同事甩锅说这个之前不是我跟的吗，我人都麻了。",
    mode: "return", target: 5, instruction: "等锅飞过来，点它原路退回。", progress: "退回的锅"
  },
  {
    name: "已读不回幽灵", chapter: "空气协作", input: "消息已读不回两小时，最后说辛苦你先推进一下。",
    mode: "hold", target: 1600, instruction: "长按驱散幽灵。松手它会重新凝聚。", progress: "幽灵浓度"
  }
];

const $ = (selector) => document.querySelector(selector);
const byData = (name) => document.querySelector(`[data-${name}]`);
const elements = {
  form: byData("rage-form"), input: $("#rage-input"), charCount: byData("char-count"),
  toast: byData("toast"), stage: byData("game-stage"), stageObject: byData("stage-object"),
  impactLayer: byData("impact-layer"), attackDock: byData("attack-dock"),
  ultimate: byData("ultimate"), ultimateLabel: byData("ultimate-label"), furyBar: byData("fury-bar"),
  instruction: byData("stage-instruction"), progressName: byData("progress-name"),
  hpLabel: byData("hp-label"), hpBar: byData("hp-bar"), hitLine: byData("hit-line"),
  levelLabel: byData("level-label"), monsterName: byData("monster-name"), rageTotal: byData("rage-total"),
  reward: byData("reward"), clearLabel: byData("clear-label"), clearTitle: byData("clear-title"),
  clearCopy: byData("clear-copy"), aiReward: byData("ai-reward"), roast: byData("roast"),
  civilized: byData("civilized"), customSheet: byData("custom-sheet"), quotaLabel: byData("quota-label"),
  paywall: byData("paywall"), billingLink: byData("billing-link"),
  sessionTitle: byData("session-title"), sessionLine: byData("session-line"),
  sessionCleared: byData("session-cleared"), sessionRage: byData("session-rage"),
  sessionCombo: byData("session-combo"), sessionBar: byData("session-bar"),
  sessionBadges: byData("session-badges")
};

const state = {
  level: 1, rageTotal: 0, progress: 0, input: levels[0].input,
  diagnosis: diagnose(levels[0].input), defeated: false, rewardUnlocked: false,
  holdStartedAt: 0, holdTimer: 0, combo: 0, lastAttackAt: 0, fury: 0,
  rushTimer: 0, rushPressure: 0, escapeTimer: 0, escapeLane: 1,
  escapeSeconds: 18, escapeObstacles: [], escapeTick: 0, escapeFailed: false,
  escapeInvulnerableUntil: 0, clearedLevels: new Set(), bestCombo: 0
};

function setText(element, text) { if (element) element.textContent = text; }
function currentLevelIndex() { return (state.level - 1) % levels.length; }
function currentLevel() { return levels[currentLevelIndex()]; }
function showToast(message) {
  setText(elements.toast, message);
  elements.toast.classList.add("is-visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => elements.toast.classList.remove("is-visible"), 2200);
}
function updateQuota(quota) { if (quota) setText(elements.quotaLabel, `免费 ${quota.remaining}/${quota.limit}`); }
function progressPercent() { return Math.max(0, Math.min(100, (state.progress / currentLevel().target) * 100)); }
function recordCombo(value = state.combo) {
  state.bestCombo = Math.max(state.bestCombo, value);
  renderSessionReport();
}
function progressText() {
  const level = currentLevel();
  if (level.mode === "hold") return `${Math.ceil(Math.max(0, level.target - state.progress) / 100) / 10}s`;
  return `${Math.max(0, level.target - state.progress)}`;
}

function renderStage() {
  const level = currentLevel();
  const name = state.diagnosis.monster || level.name;
  elements.stage.dataset.mode = level.mode;
  elements.stage.classList.toggle("is-escape", level.mode === "escape");
  elements.stage.dataset.damage = `${Math.floor(progressPercent() / 25)}`;
  elements.attackDock.hidden = ["hold", "smash", "escape"].includes(level.mode);
  renderAttackDock(level.mode);
  elements.stage.classList.toggle("is-cleared", state.defeated);
  setText(elements.levelLabel, `第 ${state.level} 关 · ${level.chapter}`);
  setText(elements.monsterName, name);
  setText(elements.instruction, level.instruction);
  setText(elements.progressName, level.progress);
  renderProgress();
  renderStageObject();
}

function renderAttackDock(mode) {
  const tools = {
    smash: [
      ["punch", "拳套重击", "+1"],
      ["kick", "飞踢需求", "+2"],
      ["stamp", "红章驳回", "+3"]
    ],
    shred: [
      ["punch", "裁切一角", "+1"],
      ["kick", "订书机钉", "+2"],
      ["stamp", "一键粉碎", "+3"]
    ],
    pop: [
      ["punch", "静音一泡", "+1"],
      ["kick", "取消会议", "+2"],
      ["stamp", "全员散会", "+3"]
    ],
    return: [
      ["punch", "轻推退回", "+1"],
      ["kick", "反弹拍回", "+2"],
      ["stamp", "原件退回", "+3"]
    ]
  }[mode] || [];
  elements.attackDock.innerHTML = tools.map(([kind, label, power]) =>
    `<button type="button" data-attack="${kind}">${label} <b>${power}</b></button>`
  ).join("");
}

function renderProgress() {
  setText(elements.hpLabel, progressText());
  elements.hpBar.style.width = `${100 - progressPercent()}%`;
  setText(elements.rageTotal, state.rageTotal);
  elements.stage.dataset.damage = `${Math.floor(progressPercent() / 25)}`;
  renderSessionReport();
  if (currentLevel().mode === "escape") return;
  elements.furyBar.style.width = `${state.fury}%`;
  const ready = state.fury >= 100 && !state.defeated;
  elements.ultimate.disabled = !ready;
  elements.ultimate.classList.toggle("is-ready", ready);
  elements.ultimate.setAttribute("aria-label", ready ? "释放怒气大招，全场清退" : `怒气大招充能${state.fury}%`);
  setText(elements.ultimateLabel, ready ? "全场清退！" : `${state.fury}%`);
}

function renderStageObject() {
  const level = currentLevel();
  elements.stageObject.innerHTML = "";
  if (state.defeated) {
    elements.stageObject.innerHTML = `<div class="clear-burst" aria-hidden="true">爽！</div>`;
    return;
  }
  if (state.escapeFailed && level.mode === "escape") {
    elements.stageObject.innerHTML = `<div class="escape-failed"><b>电梯关了。</b><span>这次不回消息，重开一次。</span><button type="button" data-retry-escape>再冲一次</button></div>`;
  } else if (level.mode === "escape") {
    elements.stageObject.innerHTML = `<div class="escape-field" data-escape-field><div class="escape-top"><span><i></i>电梯还开着</span><b data-escape-clock>18.0s</b></div><div class="escape-lanes" aria-label="点击跑道换道"><button type="button" data-escape-lane="0" aria-label="换到左侧通道"><i>左</i></button><button type="button" data-escape-lane="1" aria-label="换到中间通道"><i>中</i></button><button type="button" data-escape-lane="2" aria-label="换到右侧通道"><i>右</i></button></div><div class="escape-elevator" aria-hidden="true"><i></i><span>18:00</span></div><div class="escape-runner" data-escape-runner aria-label="你"><i></i><b>我</b></div><p class="escape-hint">躲开来活 · 冲进电梯</p></div>`;
    startEscape();
  } else if (level.mode === "smash") {
    elements.stageObject.innerHTML = `<div class="rush-field" data-rush-field><p class="rush-counter">连击 <b data-combo>0</b></p><p class="rush-pressure">催命压力 <b data-pressure>0</b></p></div>`;
    startRush();
  } else if (level.mode === "shred") {
    const remaining = Math.max(1, level.target - state.progress);
    elements.stageObject.innerHTML = `<div class="shred-board"><button type="button" class="paper-card" data-paper draggable="true">再改一版<br><small>还剩 ${remaining} 份</small></button><div class="shredder" data-shredder aria-label="将需求拖进碎纸机"><i></i><span>碎纸机</span></div></div>`;
  } else if (level.mode === "pop") {
    elements.stageObject.innerHTML = `<div class="bubble-field" data-bubble-field></div>`;
    spawnBubbles();
  } else if (level.mode === "return") {
    const remaining = Math.max(1, level.target - state.progress);
    elements.stageObject.innerHTML = `<div class="return-field"><button class="pot-target" type="button" data-pot aria-label="把黑锅退回去">这锅<br>你背</button><p>飞来的锅还有 ${remaining} 口，点它退回</p></div>`;
  } else {
    elements.stageObject.innerHTML = `<button class="ghost-target" type="button" data-ghost aria-label="长按驱散已读不回幽灵"><span>已读</span><i>...</i><b>不回</b></button><p class="hold-meter">按住不放</p>`;
  }
}

function prepareLevel({ diagnosis, input } = {}) {
  const level = currentLevel();
  state.input = input || level.input;
  state.diagnosis = diagnosis || { ...diagnose(state.input), monster: level.name, source: "local-rules" };
  state.progress = 0;
  state.defeated = false;
  state.rewardUnlocked = false;
  state.combo = 0;
  state.fury = 0;
  state.rushPressure = 0;
  state.escapeLane = 1;
  state.escapeSeconds = 18;
  state.escapeObstacles = [];
  state.escapeTick = 0;
  state.escapeFailed = false;
  state.escapeInvulnerableUntil = 0;
  stopRush();
  stopEscape();
  elements.reward.hidden = true;
  elements.aiReward.hidden = true;
  setText(elements.hitLine, "这一关的玩法不一样。");
  renderStage();
  renderSessionReport();
}

function stopRush() {
  if (state.rushTimer) window.clearTimeout(state.rushTimer);
  state.rushTimer = 0;
}

function stopEscape() {
  if (state.escapeTimer) window.clearInterval(state.escapeTimer);
  state.escapeTimer = 0;
}

function startEscape() {
  stopEscape();
  if (!$("[data-escape-field]") || state.defeated || state.escapeFailed) return;
  spawnEscapeObstacle(42);
  renderEscapeFrame();
  state.escapeTimer = window.setInterval(() => {
    if (state.defeated || state.escapeFailed || currentLevel().mode !== "escape") return stopEscape();
    state.escapeTick += 1;
    state.escapeSeconds = Math.max(0, state.escapeSeconds - .2);
    if (state.escapeTick % 4 === 0) addProgress(1, "别回头，电梯还开着。");
    if (state.escapeTick % 3 === 0) spawnEscapeObstacle();
    state.escapeObstacles.forEach((item) => { item.y += 12 + Math.min(7, Math.floor(state.progress / 2)); });
    const now = performance.now();
    state.escapeObstacles = state.escapeObstacles.filter((item) => {
      if (!item.hit && item.lane === state.escapeLane && item.y >= 172 && item.y <= 242 && now > state.escapeInvulnerableUntil) {
        item.hit = true;
        state.escapeSeconds = Math.max(0, state.escapeSeconds - 2.3);
        state.escapeInvulnerableUntil = now + 520;
        setText(elements.hitLine, `被“${item.label}”绊住，丢了 2 秒！`);
        if ("vibrate" in navigator) navigator.vibrate([18, 25, 18]);
      }
      return item.y < 310;
    });
    renderEscapeFrame();
    if (state.escapeSeconds <= 0 && !state.defeated) failEscape();
  }, 200);
}

function spawnEscapeObstacle(initialY = -54) {
  const obstacles = ["老板@你", "临时会议", "加急需求", "再改一版", "同步一下", "周报没写"];
  state.escapeObstacles.push({
    lane: Math.floor(Math.random() * 3),
    y: initialY,
    label: obstacles[Math.floor(Math.random() * obstacles.length)]
  });
}

function renderEscapeFrame() {
  const field = $("[data-escape-field]");
  if (!field) return;
  const runner = $("[data-escape-runner]");
  if (runner) {
    runner.style.setProperty("--runner-lane", `${state.escapeLane}`);
    runner.classList.toggle("is-stumbled", performance.now() < state.escapeInvulnerableUntil);
  }
  field.querySelectorAll("[data-escape-lane]").forEach((button) => {
    button.classList.toggle("is-active", Number(button.dataset.escapeLane) === state.escapeLane);
  });
  const clock = $("[data-escape-clock]");
  setText(clock, `${state.escapeSeconds.toFixed(1)}s`);
  field.querySelectorAll("[data-escape-obstacle]").forEach((node) => node.remove());
  state.escapeObstacles.forEach((item) => {
    const obstacle = document.createElement("i");
    obstacle.className = `escape-obstacle${item.hit ? " is-hit" : ""}`;
    obstacle.dataset.escapeObstacle = "";
    obstacle.style.setProperty("--obstacle-lane", `${item.lane}`);
    obstacle.style.setProperty("--obstacle-y", `${item.y}px`);
    obstacle.textContent = item.label;
    field.append(obstacle);
  });
}

function moveEscape(lane) {
  if (currentLevel().mode !== "escape" || state.defeated || state.escapeFailed) return;
  state.escapeLane = Number(lane);
  state.combo = Math.min(99, state.combo + 1);
  recordCombo();
  setText(elements.hitLine, state.combo > 4 ? `丝滑变道 ×${state.combo}，别停。` : "闪过去，继续跑。");
  renderEscapeFrame();
}

function failEscape() {
  state.escapeFailed = true;
  stopEscape();
  setText(elements.hitLine, "差一点。电梯没等你，但这一局可以马上重来。");
  renderStageObject();
}

function retryEscape() {
  state.progress = 0;
  state.combo = 0;
  state.fury = 0;
  state.escapeSeconds = 18;
  state.escapeObstacles = [];
  state.escapeTick = 0;
  state.escapeFailed = false;
  state.escapeLane = 1;
  renderProgress();
  renderStageObject();
}

function startRush() {
  stopRush();
  const field = $("[data-rush-field]");
  if (!field || state.defeated || currentLevel().mode !== "smash") return;
  spawnRushCard(field);
  spawnRushCard(field);
  const spawn = () => {
    const currentField = $("[data-rush-field]");
    if (!currentField || state.defeated || currentLevel().mode !== "smash") return;
    if (currentField.querySelectorAll("[data-rush-card]").length < 3) spawnRushCard(currentField);
    state.rushTimer = window.setTimeout(spawn, 780);
  };
  spawn();
}

function spawnRushCard(field) {
  const cards = [
    ["明早要", "紧急需求"],
    ["就改一版", "临时加塞"],
    ["现在同步", "火速对齐"],
    ["很简单的", "小需求"],
    ["辛苦一下", "不急不急"]
  ];
  const [tag, title] = cards[Math.floor(Math.random() * cards.length)];
  const card = document.createElement("button");
  card.type = "button";
  card.className = "rush-card";
  card.dataset.rushCard = "";
  card.style.setProperty("--lane", `${12 + Math.floor(Math.random() * 66)}%`);
  card.style.setProperty("--tilt", `${-8 + Math.floor(Math.random() * 17)}deg`);
  card.style.setProperty("--drop", `${Math.floor(Math.random() * 74)}px`);
  card.innerHTML = `<span>${tag}</span><b>${title}</b>`;
  field.append(card);
  window.setTimeout(() => {
    if (!card.isConnected || card.classList.contains("is-hit") || state.defeated) return;
    card.classList.add("is-missed");
    state.rushPressure = Math.min(9, state.rushPressure + 1);
    setText($("[data-pressure]"), state.rushPressure);
    setText(elements.hitLine, state.rushPressure >= 5 ? "催命任务堆起来了，狠狠干掉它们。" : "又塞来一份，拍飞它。");
    window.setTimeout(() => {
      card.remove();
      const currentField = $("[data-rush-field]");
      if (currentField && !state.defeated && currentField.querySelectorAll("[data-rush-card]").length < 2) spawnRushCard(currentField);
    }, 180);
  }, 2450);
}

function hitRushCard(card) {
  if (state.defeated || !card?.isConnected) return;
  const now = performance.now();
  state.combo = now - state.lastAttackAt < 900 ? Math.min(99, state.combo + 1) : 1;
  state.lastAttackAt = now;
  recordCombo();
  const bonus = state.combo >= 5 ? 1 : 0;
  state.fury = Math.min(100, state.fury + 16 + bonus * 7);
  scatterRushPaper(card);
  card.classList.add("is-hit");
  setText($("[data-combo]"), state.combo);
  showImpact("punch", state.combo >= 5 ? `连击 ×${state.combo}` : "退！");
  addProgress(1 + bonus, bonus ? "连击爆发，催命需求被连续拍飞！" : "需求已拍飞，下一张来。");
  if ("vibrate" in navigator) navigator.vibrate(12);
  const field = $("[data-rush-field]");
  if (field && field.querySelectorAll("[data-rush-card]").length < 3) spawnRushCard(field);
  window.setTimeout(() => {
    card.remove();
  }, 200);
}

function scatterRushPaper(card) {
  const field = card.closest("[data-rush-field]");
  if (!field) return;
  const box = card.getBoundingClientRect();
  const fieldBox = field.getBoundingClientRect();
  for (let index = 0; index < 7; index += 1) {
    const shard = document.createElement("i");
    shard.className = "rush-shard";
    shard.style.setProperty("--x", `${box.left - fieldBox.left + box.width / 2}px`);
    shard.style.setProperty("--y", `${box.top - fieldBox.top + box.height / 2}px`);
    shard.style.setProperty("--dx", `${-72 + Math.floor(Math.random() * 145)}px`);
    shard.style.setProperty("--dy", `${-78 + Math.floor(Math.random() * 92)}px`);
    shard.style.setProperty("--r", `${-170 + Math.floor(Math.random() * 340)}deg`);
    field.append(shard);
    window.setTimeout(() => shard.remove(), 460);
  }
}

function showImpact(kind, label) {
  const impact = document.createElement("span");
  impact.className = `attack-impact attack-impact--${kind}`;
  impact.textContent = label;
  elements.impactLayer.replaceChildren(impact);
  elements.stage.classList.remove("is-shaking");
  requestAnimationFrame(() => elements.stage.classList.add("is-shaking"));
  window.setTimeout(() => {
    impact.remove();
    elements.stage.classList.remove("is-shaking");
  }, 420);
}

function useAttack(kind) {
  if (state.defeated || currentLevel().mode === "hold") return;
  const definitions = {
    smash: {
      punch: { power: 1, label: "砰！", line: "拳套重击，需求开始裂开。" },
      kick: { power: 2, label: "滚！", line: "飞踢命中，需求被踹歪。" },
      stamp: { power: 3, label: "驳回！", line: "巨型红章落下：不接。" }
    },
    shred: {
      punch: { power: 1, label: "咔！", line: "裁掉一角，这版少一点。" },
      kick: { power: 2, label: "钉！", line: "订书机落下，需求先别乱跑。" },
      stamp: { power: 3, label: "碎！", line: "一键粉碎，改版需求进了废纸篓。" }
    },
    pop: {
      punch: { power: 1, label: "静！", line: "静音针命中，一场会没声音了。" },
      kick: { power: 2, label: "取消！", line: "会议取消，时间还给你。" },
      stamp: { power: 3, label: "散会！", line: "全员散会章落下，泡泡集体缩水。" }
    },
    return: {
      punch: { power: 1, label: "退！", line: "轻推回去，这锅不接。" },
      kick: { power: 2, label: "反弹！", line: "反弹拍命中，请原寄件人签收。" },
      stamp: { power: 3, label: "退回！", line: "原件退回，责任请自带。" }
    }
  };
  const attack = definitions[currentLevel().mode][kind];
  const now = performance.now();
  state.combo = now - state.lastAttackAt < 850 ? Math.min(9, state.combo + 1) : 1;
  state.lastAttackAt = now;
  recordCombo();
  const bonus = state.combo >= 4 ? 1 : 0;
  const power = attack.power + bonus;
  state.fury = Math.min(100, state.fury + attack.power * 12 + bonus * 8);
  if (currentLevel().mode === "pop") {
    [...document.querySelectorAll("[data-bubble]")].slice(0, power).forEach((bubble) => bubble.remove());
  }
  showImpact(kind, state.combo >= 4 ? `${attack.label} ×${state.combo}` : attack.label);
  addProgress(power, bonus ? `${attack.line} 连击加成 +1！` : attack.line);
  if ("vibrate" in navigator) navigator.vibrate(kind === "stamp" ? [12, 26, 12] : 10);
}

function addProgress(amount, line) {
  if (state.defeated) return;
  const before = state.progress;
  state.progress = Math.min(currentLevel().target, state.progress + amount);
  state.rageTotal += Math.max(0, state.progress - before);
  setText(elements.hitLine, line);
  renderProgress();
  if (["shred", "return"].includes(currentLevel().mode) && !state.defeated) renderStageObject();
  if (state.progress >= currentLevel().target) clearLevel();
}

function useUltimate() {
  if (state.defeated || state.fury < 100) return;
  const remaining = currentLevel().target - state.progress;
  state.fury = 0;
  showImpact("ultimate", "下班！");
  elements.stage.classList.add("is-ultimate");
  window.setTimeout(() => elements.stage.classList.remove("is-ultimate"), 520);
  if (currentLevel().mode === "pop") document.querySelectorAll("[data-bubble]").forEach((bubble) => bubble.remove());
  addProgress(remaining, "下班铃响：全场清退，今天不再接活。");
  if ("vibrate" in navigator) navigator.vibrate([18, 34, 18, 34, 30]);
}

function clearLevel() {
  state.defeated = true;
  state.clearedLevels.add(currentLevelIndex());
  stopRush();
  stopEscape();
  renderStage();
  const level = currentLevel();
  setText(elements.hitLine, "这一关彻底清场。");
  setText(elements.clearLabel, `第 ${state.level} 关已清空 · 怒气 +${level.target}`);
  if (level.mode === "escape") {
    setText(elements.clearLabel, "18:00 已打卡 · 怒气 +10");
    setText(elements.clearTitle, "你赶上了。电梯没等老板。");
    setText(elements.clearCopy, "那条“方便同步一下吗”留在门外。今晚，准点走人。");
  } else {
    setText(elements.clearTitle, "这口气，已经放下了一点。");
    setText(elements.clearCopy, `已累计释放 ${state.rageTotal} 点怒气。下一关，换一种方式继续。`);
  }
  elements.reward.hidden = false;
  renderSessionReport();
  elements.reward.scrollIntoView({ behavior: "smooth", block: "nearest" });
  if ("vibrate" in navigator) navigator.vibrate(18);
}

function renderSessionReport() {
  if (!elements.sessionTitle) return;
  const cleared = state.clearedLevels.size;
  const percent = Math.round((cleared / levels.length) * 100);
  const title = cleared >= levels.length
    ? "今日牛马已全员下线"
    : cleared >= 3
      ? "职场怪清退专家"
      : cleared >= 1
        ? "下班逃生进行中"
        : "准点走人预备役";
  const lines = [
    "先打穿一关，让今天的破事有个交代。",
    "第一口气已经放下。下一关换个姿势继续发疯。",
    "连续清场中，老板的红点正在失去攻击性。",
    "今晚状态不错：能不接的锅，已经开始原路返回。",
    "离完整下班仪式只差最后一口气。",
    "五种职场怪已清空。现在可以体面地关机。"
  ];
  setText(elements.sessionTitle, title);
  setText(elements.sessionLine, lines[cleared] || lines.at(-1));
  setText(elements.sessionCleared, `${cleared}/${levels.length}`);
  setText(elements.sessionRage, state.rageTotal);
  setText(elements.sessionCombo, state.bestCombo);
  elements.sessionBar.style.width = `${percent}%`;
  elements.sessionBadges.innerHTML = levels.map((level, index) => {
    const active = index === currentLevelIndex() && !state.defeated;
    const clearedClass = state.clearedLevels.has(index) ? " is-cleared" : "";
    const activeClass = active ? " is-active" : "";
    return `<span class="report-badge${clearedClass}${activeClass}">${level.chapter}</span>`;
  }).join("");
}

function spawnBubbles() {
  const field = $("[data-bubble-field]");
  if (!field) return;
  ["周会", "同步会", "复盘会", "对齐会", "站会", "再开个会", "会中会", "会后会", "分享会"].forEach((label, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "meeting-bubble";
    button.dataset.bubble = "";
    button.style.setProperty("--x", `${10 + ((index * 29) % 72)}%`);
    button.style.setProperty("--y", `${8 + ((index * 37) % 68)}%`);
    button.style.setProperty("--delay", `${(index % 3) * 80}ms`);
    button.textContent = label;
    field.append(button);
  });
}

async function generateReward() {
  const fallback = diagnose(state.input);
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 50_000);
  try {
    const response = await fetch("/niuma/api/diagnose", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ rage: state.input }), signal: controller.signal
    });
    const payload = await response.json();
    if (response.status === 402 && payload.error === "free_quota_exhausted") {
      updateQuota(payload.quota); elements.paywall.hidden = false;
      elements.billingLink.href = payload.actions?.billingUrl || elements.billingLink.href;
      return { exhausted: true };
    }
    if (!response.ok || !payload.ok || !payload.result) throw new Error("reward_failed");
    state.diagnosis = { ...fallback, ...payload.result };
    updateQuota(payload.quota);
    return { exhausted: false };
  } catch {
    state.diagnosis = fallback;
    showToast("模型暂时忙，本地嘴替先顶上。");
    return { exhausted: false };
  } finally { window.clearTimeout(timeout); }
}

async function unlockReward() {
  if (state.rewardUnlocked) { elements.aiReward.open = true; return; }
  state.rewardUnlocked = true; elements.aiReward.hidden = false; elements.aiReward.open = true;
  setText(elements.roast, "AI 正在替你组织语言…"); setText(elements.civilized, "AI 正在替你把话说人话…");
  const generation = await generateReward();
  if (generation.exhausted) { elements.aiReward.hidden = true; state.rewardUnlocked = false; return; }
  setText(elements.roast, state.diagnosis.roast); setText(elements.civilized, state.diagnosis.civilized);
}

function nextLevel() { state.level += 1; prepareLevel(); window.scrollTo({ top: 0, behavior: "smooth" }); }
function startHold() {
  if (currentLevel().mode !== "hold" || state.defeated || state.holdTimer) return;
  state.holdStartedAt = performance.now();
  const frame = (now) => {
    const elapsed = now - state.holdStartedAt;
    const increment = Math.max(0, elapsed - state.progress);
    if (increment > 0) addProgress(increment, "别松，幽灵快散了。");
    if (!state.defeated && state.holdTimer) state.holdTimer = requestAnimationFrame(frame);
  };
  state.holdTimer = requestAnimationFrame(frame);
}
function stopHold() {
  if (!state.holdTimer) return;
  cancelAnimationFrame(state.holdTimer); state.holdTimer = 0;
  if (!state.defeated) setText(elements.hitLine, "幽灵在重组，再按住它。");
}

elements.stage.addEventListener("click", (event) => {
  const escapeLane = event.target.closest("[data-escape-lane]");
  if (escapeLane) moveEscape(escapeLane.dataset.escapeLane);
  if (event.target.closest("[data-retry-escape]")) retryEscape();
  if (event.target.closest("[data-rush-card]")) hitRushCard(event.target.closest("[data-rush-card]"));
  if (event.target.closest("[data-bubble]")) {
    event.target.closest("[data-bubble]").remove();
    addProgress(1, "会议取消，时间归还。");
  }
  if (event.target.closest("[data-pot]")) addProgress(1, "已原路退回，请查收。");
});
elements.attackDock.addEventListener("click", (event) => {
  const button = event.target.closest("[data-attack]");
  if (button) useAttack(button.dataset.attack);
});
elements.ultimate.addEventListener("click", useUltimate);
elements.stage.addEventListener("pointerdown", (event) => {
  if (event.target.closest("[data-ghost]")) { event.preventDefault(); startHold(); }
});
["pointerup", "pointercancel", "pointerleave"].forEach((type) => elements.stage.addEventListener(type, stopHold));
elements.stage.addEventListener("dragstart", (event) => {
  if (event.target.closest("[data-paper]")) event.dataTransfer?.setData("text/plain", "paper");
});
elements.stage.addEventListener("dragover", (event) => {
  if (event.target.closest("[data-shredder]")) event.preventDefault();
});
elements.stage.addEventListener("drop", (event) => {
  if (!event.target.closest("[data-shredder]")) return;
  event.preventDefault();
  addProgress(1, "咔嚓，需求进碎纸机了。");
});
elements.stage.addEventListener("pointerup", (event) => {
  if (event.target.closest("[data-paper]") && currentLevel().mode === "shred") addProgress(1, "需求已手动投入碎纸机。");
});

document.querySelectorAll("[data-preset]").forEach((button) => button.addEventListener("click", () => {
  const index = Number(button.dataset.preset);
  document.querySelectorAll("[data-preset]").forEach((item) => item.classList.toggle("is-selected", item === button));
  state.level = index + 1;
  prepareLevel({ input: levels[index].input, diagnosis: { ...diagnose(levels[index].input), monster: levels[index].name, source: "local-rules" } });
}));
elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  const input = elements.input.value.trim();
  if (!input) return showToast("先倒一点破事进来。");
  elements.customSheet.hidden = true;
  state.level = 1;
  prepareLevel({ input, diagnosis: { ...diagnose(input), monster: "专属怨气怪", source: "local-rules" } });
  showToast("专属关卡准备好了，砸碎它再领嘴替。");
});
elements.input.addEventListener("input", () => setText(elements.charCount, elements.input.value.length));
document.querySelector("[data-custom-toggle]").addEventListener("click", () => { elements.customSheet.hidden = false; elements.input.focus(); });
document.querySelector("[data-custom-close]").addEventListener("click", () => { elements.customSheet.hidden = true; });
document.querySelector("[data-next-level]").addEventListener("click", nextLevel);
document.querySelector("[data-unlock-reward]").addEventListener("click", () => { void unlockReward(); });
document.addEventListener("click", async (event) => {
  if (!event.target.closest("[data-copy]")) return;
  try { await navigator.clipboard.writeText(state.diagnosis.roast); showToast("复制了，拿去替互联网嘴硬。"); }
  catch { showToast("复制失败，可以长按选择。"); }
});

document.querySelector("[data-preset='0']").classList.add("is-selected");
prepareLevel();
fetch("/niuma/api/quota").then((response) => response.json()).then((payload) => updateQuota(payload.quota)).catch(() => {});
