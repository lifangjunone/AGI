const metrics = document.querySelector("#admin-metrics");
const body = document.querySelector("#records-body");

function esc(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

async function loadStats() {
  const response = await fetch("api/admin/stats");
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    metrics.innerHTML = `<div class="error">没有管理权限或统计接口不可用。请从受保护的管理入口访问。</div>`;
    return;
  }
  metrics.innerHTML = [
    ["总测算", data.total],
    ["今日", data.todayCount],
    ["访客", data.visitorCount],
    ["模型生成", data.modelUsedCount]
  ].map(([label, value]) => `<article class="snapshot-card"><small>${esc(label)}</small><b>${esc(value)}</b></article>`).join("");
  body.innerHTML = data.records.map((record) => `<tr>
    <td>${esc(record.createdAt)}</td>
    <td>${esc(record.input?.name || record.summary?.name || "匿名")}</td>
    <td>${esc(record.input?.birthDate)} ${esc(record.input?.birthTime)}<br>${esc(record.input?.gender || "")} · ${esc(record.input?.relationshipGoal || "")}</td>
    <td>${esc(record.input?.birthPlace || record.summary?.birthPlace)}<br>${esc(record.province)}</td>
    <td>${esc(record.summary?.sunSign)} / ${esc(record.summary?.ascendant)}<br>${esc(record.summary?.zodiac)} · ${esc(record.summary?.peachDirection)}</td>
    <td>${esc(record.userId || "游客")}<br><small>${esc(record.visitorHash)}</small></td>
  </tr>`).join("");
}

loadStats();
