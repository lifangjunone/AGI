const textInput = document.querySelector("#text");
const preview = document.querySelector("#preview");
const code = document.querySelector("#code");
const advice = document.querySelector("#advice");
const askButton = document.querySelector("#ask");
const copyButton = document.querySelector("#copy");
const motionButtons = [...document.querySelectorAll("[data-motion]")];

let motion = "wave";
const emojiRegex = /(\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?)/gu;

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function render() {
  const safeText = escapeHtml(textInput.value || "");
  const html = safeText.replace(emojiRegex, (match) => `<span class="emoji-motion ${motion}" aria-label="${match}">${match}</span>`);
  preview.innerHTML = html || "先写一句带 Emoji 的文案。";
  code.textContent = `<p class="motion-line">${html}</p>\n\n<style>\n.emoji-motion { display:inline-block; transform-origin:50% 70%; }\n.emoji-motion:hover { animation:${motion} .7s ease both; }\n</style>`;
}

function setMotion(nextMotion) {
  motion = nextMotion;
  motionButtons.forEach((button) => button.classList.toggle("active", button.dataset.motion === motion));
  render();
}

motionButtons.forEach((button) => {
  button.addEventListener("click", () => setMotion(button.dataset.motion));
});

textInput.addEventListener("input", render);

askButton.addEventListener("click", async () => {
  advice.textContent = "正在请 MaaS 推荐…";
  askButton.disabled = true;
  try {
    const response = await fetch("./api/emoji-advice", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: textInput.value }),
    });
    const payload = await response.json();
    advice.textContent = payload.advice || "欢迎语适合 wave，提醒适合 shake，奖励适合 spark。";
  } catch {
    advice.textContent = "建议：欢迎语用 wave，提醒用 shake，成就反馈用 spark。";
  } finally {
    askButton.disabled = false;
  }
});

copyButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(code.textContent);
    advice.textContent = "已复制 HTML 片段。";
  } catch {
    advice.textContent = "复制失败，可以手动选中下方代码。";
  }
});

render();
