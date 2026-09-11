const state = { tasks: [], mood: "" };
const api = (path) => `/api/life${path}`;
const $ = (selector) => document.querySelector(selector);

function toast(message) {
  const node = $("#toast");
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove("show"), 2400);
}

function renderTasks() {
  const done = state.tasks.filter((task) => task.done).length;
  $("#task-progress").textContent = `${done}/${state.tasks.length} 完成`;
  $("#tasks").innerHTML = state.tasks.map((task) => `
    <button class="task ${task.done ? "done" : ""}" data-task="${task.id}">
      <span class="check">${task.done ? "✓" : ""}</span><span>${task.title}</span>
    </button>
  `).join("");
  document.querySelectorAll("[data-task]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.tasks = state.tasks.map((task) => task.id === button.dataset.task ? { ...task, done: !task.done } : task);
      renderTasks();
      await fetch(api("/tasks"), { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ tasks: state.tasks }) });
    });
  });
}

function renderMoods() {
  $("#moods").innerHTML = ["开心", "一般", "疲惫", "烦躁"].map((mood) => `
    <button class="${state.mood === mood ? "active" : ""}" data-mood="${mood}">${mood}</button>
  `).join("");
  $("#mood-status").textContent = state.mood ? `今天感觉${state.mood}` : "选一个";
  document.querySelectorAll("[data-mood]").forEach((button) => button.addEventListener("click", async () => {
    state.mood = button.dataset.mood;
    renderMoods();
    await fetch(api("/mood"), { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ mood: state.mood }) });
  }));
}

async function loadToday() {
  const response = await fetch(api("/today"), { cache: "no-store" });
  if (!response.ok) throw new Error("today load failed");
  const data = await response.json();
  state.tasks = data.tasks;
  state.mood = data.mood;
  $("#weather-title").textContent = `${data.weather.condition} · ${data.weather.temperature}`;
  $("#weather-advice").textContent = data.weather.advice;
  $("#today-date").textContent = data.date;
  renderTasks();
  renderMoods();
}

$("#task-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = $("#task-input");
  const title = input.value.trim();
  if (!title) return;
  state.tasks.push({ id: `task-${Date.now()}`, title, done: false });
  input.value = "";
  renderTasks();
  await fetch(api("/tasks"), { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ tasks: state.tasks }) });
  toast("待办已加入");
});

$("#chore-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = $("#chore-input");
  if (!input.value.trim()) return;
  const response = await fetch(api("/chore"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: input.value }) });
  const data = await response.json();
  $("#steps").innerHTML = data.steps.map((step) => `<li>${step}</li>`).join("");
});

loadToday().catch((error) => {
  console.error("[LifePage] load failed", error);
  toast("今天的数据暂时无法加载");
});
