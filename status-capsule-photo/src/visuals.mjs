const files = {
  "workday-box": "workday", "aqua-run-card": "run", "galaxy-wave-card": "galaxy",
  "idea-card": "idea", "mbti-grid": "mbti", "starry-oil": "oil"
};
const labels = {
  "workday-box": "状态盲盒", "aqua-run-card": "流光卡片", "galaxy-wave-card": "银河卡片",
  "idea-card": "灵感卡片", "mbti-grid": "MBTI 注解卡", "starry-oil": "星夜油画"
};
export function referenceFor(id, variant = "detail") { return `/status-capsule/assets/${files[id] || "run"}-${variant}-v1.webp`; }
export function labelFor(id) { return labels[id]; }
