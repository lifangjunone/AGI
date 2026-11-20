let places = [
  { name: "上海 · 巷口咖啡", city: "上海", note: "适合节目里那种慢悠悠的下午", x: 72, y: 48, tags: ["咖啡", "散步"] },
  { name: "成都 · 热气火锅", city: "成都", note: "朋友聚会和深夜聊天", x: 36, y: 58, tags: ["火锅", "夜宵"] },
  { name: "广州 · 早茶小楼", city: "广州", note: "适合把一期节目拆成三笼点心", x: 62, y: 72, tags: ["早茶", "粤菜"] },
  { name: "北京 · 胡同面馆", city: "北京", note: "一碗面解决所有复杂情绪", x: 58, y: 32, tags: ["面", "胡同"] },
  { name: "杭州 · 湖边书店", city: "杭州", note: "节目嘉宾说适合一个人待到天黑", x: 68, y: 58, tags: ["书店", "湖边"] },
];

const list = document.querySelector("#list");
const map = document.querySelector("#map");
const q = document.querySelector("#q");
const tip = document.querySelector("#tip");
const count = document.querySelector("#count");
const activeCity = document.querySelector("#active-city");
const notes = document.querySelector("#notes");
const extractButton = document.querySelector("#extract");
let activeIndex = -1;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function filteredPlaces() {
  const keyword = q.value.trim().toLowerCase();
  return places.filter((place) => {
    const haystack = [place.name, place.city, place.note, ...(place.tags || [])].join(" ").toLowerCase();
    return !keyword || haystack.includes(keyword);
  });
}

function routeBetween(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  return `<div class="route" style="left:${a.x}%;top:${a.y}%;width:${length}%;transform:rotate(${angle}deg)"></div>`;
}

function render() {
  const data = filteredPlaces();
  count.textContent = `${data.length} 个地点`;
  list.innerHTML = data.map((place) => {
    const index = places.indexOf(place);
    const tags = (place.tags || []).map((tag) => `<i>${escapeHtml(tag)}</i>`).join("");
    return `<button class="item ${index === activeIndex ? "active" : ""}" data-index="${index}" type="button">
      <strong>${escapeHtml(place.name)}</strong>
      <span>${escapeHtml(place.note)}</span>
      <span class="tags">${tags}</span>
    </button>`;
  }).join("");

  const routes = data.slice(0, -1).map((place, index) => routeBetween(place, data[index + 1])).join("");
  const pins = data.map((place) => `
    <div class="pin" style="left:${place.x}%;top:${place.y}%"></div>
    <div class="label" style="left:${place.x}%;top:${place.y}%">${escapeHtml(place.name)}<small>${escapeHtml(place.city || "未知城市")}</small></div>
  `).join("");
  map.innerHTML = routes + pins;

  document.querySelectorAll(".item").forEach((button) => {
    button.addEventListener("click", () => {
      activeIndex = Number(button.dataset.index);
      const place = places[activeIndex];
      activeCity.textContent = place.city || "未知城市";
      tip.textContent = `${place.name}：${place.note}`;
      render();
    });
  });
}

q.addEventListener("input", () => {
  activeIndex = -1;
  activeCity.textContent = q.value.trim() || "全部城市";
  render();
});

extractButton.addEventListener("click", async () => {
  tip.textContent = "正在抽取节目地点…";
  extractButton.disabled = true;
  try {
    const response = await fetch("./api/extract-places", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: notes.value }),
    });
    const payload = await response.json();
    if (payload.places?.length) {
      const added = payload.places.map((place, index) => ({
        name: place.name || `节目地点 ${index + 1}`,
        city: place.city || "未知",
        note: place.reason || "节目提及地点",
        x: 24 + ((index * 17 + places.length * 9) % 58),
        y: 26 + ((index * 23 + places.length * 7) % 50),
        tags: Array.isArray(place.tags) ? place.tags.slice(0, 4) : [],
      }));
      places = [...added, ...places];
      activeIndex = 0;
      activeCity.textContent = added[0].city || "未知城市";
      tip.textContent = `新增 ${added.length} 个地点，已经放到地图上。`;
      render();
    } else {
      tip.textContent = payload.message || "没有识别到地点，可以换一段更具体的节目笔记。";
    }
  } catch {
    tip.textContent = "抽取失败，示例地图仍可搜索和查看。";
  } finally {
    extractButton.disabled = false;
  }
});

render();
