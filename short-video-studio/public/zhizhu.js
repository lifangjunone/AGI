const toolDefinitions = {
  product: {
    label: "商品内容包",
    step: "商品信息",
    title: "先说清楚你卖什么",
    fields: [
      ["productName", "商品或服务名称", "例如：轻薄防晒外套", "input"],
      ["audience", "目标客户", "例如：通勤、怕晒又不想闷热的女生", "input"],
      ["sellingPoints", "核心卖点", "材质、功能、体验、价格优势……至少 8 个字", "textarea"]
    ],
    defaults: { platform: "抖音", tone: "真实种草" },
    options: [
      ["platform", "发布平台", ["抖音", "小红书", "视频号"]],
      ["tone", "表达风格", ["真实种草", "专业测评", "轻松口语"]]
    ]
  },
  article: {
    label: "公众号文章助手",
    step: "文章信息",
    title: "先确定这篇文章写给谁",
    fields: [
      ["topic", "文章主题", "例如：新手如何挑选防晒衣", "input"],
      ["reader", "目标读者", "例如：第一次购买的上班族", "input"],
      ["angle", "文章角度", "例如：从真实通勤场景出发，讲清楚选择方法", "textarea"]
    ],
    defaults: {},
    options: []
  },
  social: {
    label: "朋友圈与社群助手",
    step: "发布信息",
    title: "把这次活动说清楚",
    fields: [
      ["scene", "使用场景", "例如：新品上架、老客回访、社群活动", "input"],
      ["offer", "活动或服务", "例如：本周新客体验价 49 元", "input"],
      ["voice", "表达语气", "例如：自然、真诚、有行动引导", "input"]
    ],
    defaults: {},
    options: []
  }
};

const state = { tool: "product", result: null };
const $ = (selector) => document.querySelector(selector);
const apiPrefix = location.pathname.startsWith("/video/") ? "/video" : "";
const apiUrl = (path) => `${apiPrefix}${path}`;

function refreshIcons() {
  window.lucide?.createIcons();
}

function renderFields() {
  const definition = toolDefinitions[state.tool];
  $("#step-label").textContent = `STEP 01 · ${definition.step}`;
  $("#form-title").textContent = definition.title;
  const fields = definition.fields.map(([name, label, placeholder, type]) => `
    <label class="field">
      <span>${label}</span>
      ${type === "textarea"
        ? `<textarea name="${name}" maxlength="500" placeholder="${placeholder}" required></textarea>`
        : `<input name="${name}" maxlength="240" placeholder="${placeholder}" required />`}
    </label>
  `).join("");
  const options = definition.options.map(([name, label, values]) => `
    <label class="field compact"><span>${label}</span><select name="${name}">${values.map((value) => `<option>${value}</option>`).join("")}</select></label>
  `).join("");
  $("#fields").innerHTML = `<div class="field-stack">${fields}</div>${options ? `<div class="option-grid">${options}</div>` : ""}`;
  $("#result-type").textContent = definition.label;
  state.result = null;
  $("#result-empty").hidden = false;
  $("#result-content").hidden = true;
  refreshIcons();
}

function showToast(message, error = false) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.toggle("is-error", error);
  toast.classList.add("is-visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("is-visible"), 2800);
}

function renderResult(result) {
  state.result = result;
  $("#result-empty").hidden = true;
  $("#result-content").hidden = false;
  $("#result-title").textContent = result.title;
  $("#result-summary").textContent = result.summary;
  $("#result-price").textContent = `¥${result.price}`;
  $("#preview-list").innerHTML = result.items.map((item, index) => `
    <div class="preview-item"><span>0${index + 1}</span><strong>${item}</strong></div>
  `).join("");
  refreshIcons();
}

async function generate(event) {
  event.preventDefault();
  const form = new FormData($("#assistant-form"));
  const payload = Object.fromEntries(form.entries());
  const submit = $("#assistant-form button[type=submit]");
  submit.disabled = true;
  submit.querySelector("span").textContent = "正在生成预览…";
  try {
    const response = await fetch(apiUrl("/api/assistant/generate"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: state.tool, ...payload })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "生成失败");
    renderResult(data.result);
    showToast("预览已生成，确认方向后再解锁");
  } catch (error) {
    showToast(error.message || "生成失败", true);
  } finally {
    submit.disabled = false;
    submit.querySelector("span").textContent = "生成免费预览";
  }
}

document.querySelectorAll(".tool-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelector(".tool-tab.is-active")?.classList.remove("is-active");
    tab.classList.add("is-active");
    state.tool = tab.dataset.tool;
    renderFields();
  });
});

$("#assistant-form").addEventListener("submit", generate);
$("#unlock-button").addEventListener("click", () => {
  showToast("当前为 Web 验证版，支付接入将在小程序虚拟支付完成后开放");
});
renderFields();
