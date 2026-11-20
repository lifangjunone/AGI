const keyRows = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];
const keysBox = document.querySelector("#keys");
const paper = document.querySelector("#paper");
const dingButton = document.querySelector("#ding");
const clearButton = document.querySelector("#clear");
const sampleButton = document.querySelector("#sample");

keysBox.innerHTML = keyRows
  .join("")
  .split("")
  .map((key) => `<span class="key" data-key="${key}">${key}</span>`)
  .join("");

const starters = [
  "今天我想保存一个很小的念头：",
  "如果一个工具没有目的，它也可以有手感。",
  "给未来的我：请记住这个下午的光。",
  "我听见纸页慢慢往前走，像一列很小的火车。",
  "把这句话敲完，我就允许自己休息五分钟。",
];

function pressVisual(key) {
  const normalized = key.toUpperCase();
  const element = document.querySelector(`[data-key="${CSS.escape(normalized)}"]`);

  if (!element) {
    return;
  }

  element.classList.add("hit");
  window.setTimeout(() => element.classList.remove("hit"), 120);
}

function playDing() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const audio = new AudioCtx();
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, audio.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(1320, audio.currentTime + 0.08);
    gain.gain.setValueAtTime(0.0001, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, audio.currentTime + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.16);

    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.start();
    oscillator.stop(audio.currentTime + 0.18);
    window.setTimeout(() => audio.close(), 260);
  } catch {
    // Audio is optional; typing should still work in restricted browsers.
  }
}

function focusAtEnd() {
  paper.focus();
  const range = document.createRange();
  range.selectNodeContents(paper);
  range.collapse(false);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

document.addEventListener("keydown", (event) => {
  if (event.key.length === 1) {
    pressVisual(event.key);
  }

  if (event.key === "Enter") {
    playDing();
  }
});

dingButton.addEventListener("click", () => {
  playDing();
  focusAtEnd();
});

clearButton.addEventListener("click", () => {
  paper.textContent = "";
  focusAtEnd();
});

sampleButton.addEventListener("click", () => {
  const line = starters[Math.floor(Math.random() * starters.length)];
  paper.textContent = line;
  playDing();
  focusAtEnd();
});
