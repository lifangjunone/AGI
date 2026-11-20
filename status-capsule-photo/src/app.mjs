import { clearSession, readSession, writeSession } from "./session.mjs";
import { referenceFor, labelFor } from "./visuals.mjs";

const $ = (selector) => document.querySelector(selector);
const state = { photoDataUrl: "", templates: [], selected: new Set(["aqua-run-card"]), busy: false };
const input = $("[data-photo-input]");
const status = $("[data-status]");
const generate = $("[data-generate]");
const grid = $("[data-template-grid]");
let photoReadVersion = 0;

function update() {
  generate.disabled = state.busy || !state.photoDataUrl || !state.selected.size || !state.templates.length;
  $("[data-selected-count]").textContent = `已选 ${state.selected.size} 种`;
  status.textContent = !state.photoDataUrl ? "先上传一张你的照片。" : !state.selected.size ? "请至少选择一种风格。" : `已准备好 ${state.selected.size} 种风格，生成后进入独立结果页。`;
  $("[data-preview]").hidden = !state.photoDataUrl;
  $("[data-dropzone]").hidden = Boolean(state.photoDataUrl);
  if (state.photoDataUrl) $("[data-preview-image]").src = state.photoDataUrl;
}

function renderTemplates() {
  grid.replaceChildren();
  for (const template of state.templates) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "style";
    button.dataset.id = template.id;
    button.setAttribute("aria-pressed", String(state.selected.has(template.id)));
    const img = document.createElement("img");
    img.src = referenceFor(template.id, "thumb");
    img.decoding = "async";
    img.width = 240;
    img.alt = "";
    const label = document.createElement("span");
    label.textContent = labelFor(template.id) || template.shortTitle;
    button.setAttribute("aria-label", label.textContent);
    button.append(img, label);
    button.addEventListener("click", () => {
      if (state.busy) return;
      if (state.selected.has(template.id)) state.selected.delete(template.id);
      else state.selected.add(template.id);
      button.setAttribute("aria-pressed", String(state.selected.has(template.id)));
      update();
    });
    grid.append(button);
  }
}

function photoError(message) {
  $("[data-photo-error]").textContent = message;
  $("[data-photo-error]").hidden = !message;
  input.setAttribute("aria-invalid", String(Boolean(message)));
}

async function readPhoto(file) {
  if (!file || state.busy) return;
  const version = ++photoReadVersion;
  photoError("");
  if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) return photoError("请选择 JPG、PNG 或 WebP 图片。");
  if (file.size > 5 * 1024 * 1024) return photoError("照片超过 5MB，请压缩后重新上传。");
  try {
    const image = await createImageBitmap(file);
    image.close();
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("read_failed"));
      reader.readAsDataURL(file);
    });
    if (version !== photoReadVersion) return;
    state.photoDataUrl = dataUrl;
    update();
  } catch { photoError("无法读取这张图片，请换一张清晰的照片。"); }
}

input.addEventListener("change", () => readPhoto(input.files?.[0]));
$("[data-clear-session]").addEventListener("click", async () => {
  if (state.busy) return;
  try {
    await clearSession();
    state.photoDataUrl = "";
    photoReadVersion++;
    input.value = "";
    $("[data-preview-image]").removeAttribute("src");
    update();
    status.textContent = "本机照片、作品与草稿已清除。";
  } catch { status.textContent = "未能清除本机草稿，请稍后重试。"; }
});
$("[data-clear-photo]").addEventListener("click", async () => {
  photoReadVersion++;
  state.photoDataUrl = "";
  input.value = "";
  $("[data-preview-image]").removeAttribute("src");
  update();
  const record = await readSession().catch(() => null);
  if (record) await writeSession({ ...record, request: { ...record.request, photoDataUrl: "" } }).catch(() => {});
  input.click();
});
for (const name of ["dragenter", "dragover"]) $("[data-dropzone]").addEventListener(name, (event) => {
  event.preventDefault(); $("[data-dropzone]").classList.add("dragging");
});
for (const name of ["dragleave", "drop"]) $("[data-dropzone]").addEventListener(name, (event) => {
  event.preventDefault(); $("[data-dropzone]").classList.remove("dragging");
});
$("[data-dropzone]").addEventListener("drop", (event) => readPhoto(event.dataTransfer.files?.[0]));

generate.addEventListener("click", async () => {
  if (generate.disabled || state.busy) return;
  state.busy = true;
  $(".creator").setAttribute("aria-busy", "true");
  generate.disabled = true;
  generate.textContent = "正在进入作品页…";
  try {
    await writeSession({
      state: "pending",
      templates: state.templates,
      request: {
        photoDataUrl: state.photoDataUrl,
        templateIds: [...state.selected],
        vibe: $("[data-vibe]").value,
        genderPresentation: $("[data-gender]").value,
        outfitHint: $("[data-outfit]").value
      }
    });
    location.assign("/status-capsule/result.html");
  } catch {
    state.busy = false;
    $(".creator").setAttribute("aria-busy", "false");
    update();
    status.textContent = "无法保存临时草稿，请允许浏览器本地存储后重试。";
    generate.textContent = "生成我的状态照";
  }
});

async function init() {
  try {
    const response = await fetch("/status-capsule/api/templates");
    if (!response.ok) throw new Error("templates_failed");
    state.templates = (await response.json()).templates;
    const record = await readSession().catch(() => null);
    if (record?.request) {
      state.photoDataUrl = record.request.photoDataUrl || "";
      state.selected = new Set(record.request.templateIds);
      $("[data-vibe]").value = record.request.vibe;
      $("[data-gender]").value = record.request.genderPresentation;
      $("[data-outfit]").value = record.request.outfitHint;
    }
    renderTemplates();
    update();
  } catch { status.textContent = "风格暂时加载失败，请刷新页面重试。"; }
}
init();
