const avatar = document.querySelector("#avatar");
const promptInput = document.querySelector("#prompt");
const result = document.querySelector("#result");
const roleChip = document.querySelector("#role-chip");
const dressButton = document.querySelector("#dress");

const roleMeta = {
  engineer: {
    label: "工程师",
    reason: "适合处理代码、接口、部署、日志和可验证的技术问题。",
    keywords: ["代码", "网站", "api", "接口", "部署", "修复", "debug", "AI", "模型"],
  },
  chef: {
    label: "厨师",
    reason: "适合把目标拆成备料、调味、出品这样清晰的步骤。",
    keywords: ["饭", "菜", "食谱", "餐厅", "吃", "晚餐", "厨房"],
  },
  travel: {
    label: "旅行向导",
    reason: "适合规划路线、城市节奏、住宿和沿途取舍。",
    keywords: ["旅行", "地图", "路线", "城市", "酒店", "成都", "上海"],
  },
  teacher: {
    label: "老师",
    reason: "适合解释概念、拆解知识点，并用例子检查理解。",
    keywords: ["学习", "课程", "解释", "题目", "教学", "新人", "笔记"],
  },
  creative: {
    label: "创意导演",
    reason: "适合设计、文案、视觉表达和传播点发散。",
    keywords: ["设计", "文案", "海报", "视频", "创意", "品牌"],
  },
};

function localRole(text) {
  const lowered = text.toLowerCase();
  for (const [role, meta] of Object.entries(roleMeta)) {
    if (meta.keywords.some((keyword) => lowered.includes(keyword.toLowerCase()))) {
      return role;
    }
  }
  return "creative";
}

function applyRole(role, label, reason) {
  const safeRole = roleMeta[role] ? role : "creative";
  const meta = roleMeta[safeRole];
  avatar.className = `avatar ${safeRole}`;
  avatar.classList.remove("changed");
  requestAnimationFrame(() => avatar.classList.add("changed"));
  roleChip.textContent = label || meta.label;
  result.innerHTML = `<strong>${label || meta.label}</strong><span>${reason || meta.reason}</span>`;
}

dressButton.addEventListener("click", async () => {
  result.innerHTML = "<strong>正在识别主题…</strong><span>MaaS 会优先判断；失败时使用本地规则。</span>";
  dressButton.disabled = true;
  try {
    const response = await fetch("./api/avatar-role", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: promptInput.value }),
    });
    const payload = await response.json();
    const fallbackRole = localRole(promptInput.value);
    applyRole(payload.role || fallbackRole, payload.label || roleMeta[fallbackRole].label, payload.reason || roleMeta[fallbackRole].reason);
  } catch {
    const role = localRole(promptInput.value);
    applyRole(role, roleMeta[role].label, `${roleMeta[role].reason}（本地规则识别）`);
  } finally {
    dressButton.disabled = false;
  }
});

document.querySelectorAll("[data-sample]").forEach((button) => {
  button.addEventListener("click", () => {
    promptInput.value = button.dataset.sample;
    promptInput.focus();
  });
});

applyRole("creative", "创意导演", "默认先以创意导演形态待命。");
