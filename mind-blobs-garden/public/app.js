const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const statusEl = document.querySelector("#status");
const friendCount = document.querySelector("#friend-count");
const startButton = document.querySelector("#start");

let blobs = [];
let clouds = [];
let player = { x: 480, y: 280, pulse: 0 };
let running = false;
let keys = {};
let raf = 0;

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function reset() {
  blobs = Array.from({ length: 8 }, (_, index) => ({
    x: randomBetween(90, 870),
    y: randomBetween(80, 480),
    r: randomBetween(24, 36),
    mood: 8 + Math.random() * 10,
    hue: 92 + index * 17,
    drift: Math.random() * Math.PI * 2,
  }));

  clouds = Array.from({ length: 4 }, () => ({
    x: randomBetween(90, 870),
    y: randomBetween(80, 480),
    vx: randomBetween(-0.85, 0.85) || 0.55,
    vy: randomBetween(-0.7, 0.7) || -0.45,
  }));

  player = { x: 480, y: 280, pulse: 0 };
  running = true;
  statusEl.textContent = "去交朋友吧";
  friendCount.textContent = "0 / 8";
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(loop);
}

function drawBackground() {
  ctx.clearRect(0, 0, 960, 560);
  ctx.save();
  ctx.globalAlpha = 0.34;
  ctx.strokeStyle = "#9bd9ad";
  ctx.lineWidth = 1;
  for (let x = 32; x < 960; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x - 30, 560);
    ctx.stroke();
  }
  for (let y = 40; y < 560; y += 56) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.quadraticCurveTo(480, y + 22, 960, y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBlob(blob) {
  blob.drift += 0.018;
  const wobble = Math.sin(blob.drift) * 3;
  const mood = Math.min(100, blob.mood);

  ctx.save();
  ctx.translate(blob.x, blob.y + wobble);
  ctx.fillStyle = `hsl(${blob.hue + mood * 0.35}, 76%, ${62 + mood * 0.12}%)`;
  ctx.shadowColor = `hsla(${blob.hue}, 80%, 45%, ${0.16 + mood / 520})`;
  ctx.shadowBlur = 16 + mood / 5;
  ctx.beginPath();
  ctx.ellipse(0, 4, blob.r * 1.08, blob.r * 0.92, Math.sin(blob.drift) * 0.15, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.fillStyle = "#052e16";
  ctx.beginPath();
  ctx.arc(-blob.r * 0.32, -2, 3.2, 0, Math.PI * 2);
  ctx.arc(blob.r * 0.32, -2, 3.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#052e16";
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.arc(0, 6, 9 + mood / 16, 0.1, Math.PI - 0.1);
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,.72)";
  ctx.fillRect(-blob.r, blob.r + 12, blob.r * 2, 5);
  ctx.fillStyle = "#16a34a";
  ctx.fillRect(-blob.r, blob.r + 12, (blob.r * 2 * mood) / 100, 5);
  ctx.restore();
}

function drawCloud(cloud) {
  ctx.save();
  ctx.fillStyle = "rgba(71, 85, 105, 0.62)";
  ctx.shadowColor = "rgba(15, 23, 42, 0.18)";
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.arc(cloud.x, cloud.y, 25, 0, Math.PI * 2);
  ctx.arc(cloud.x + 25, cloud.y + 5, 20, 0, Math.PI * 2);
  ctx.arc(cloud.x - 24, cloud.y + 8, 18, 0, Math.PI * 2);
  ctx.rect(cloud.x - 36, cloud.y + 8, 72, 20);
  ctx.fill();
  ctx.restore();
}

function drawPlayer() {
  player.pulse += 0.08;
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.fillStyle = "rgba(37, 99, 235, 0.14)";
  ctx.beginPath();
  ctx.arc(0, 0, 36 + Math.sin(player.pulse) * 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2563eb";
  ctx.shadowColor = "rgba(37, 99, 235, 0.45)";
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.arc(0, 0, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function updatePlayer() {
  const speed = 4.2;
  if (keys.ArrowLeft || keys.a || keys.A) player.x -= speed;
  if (keys.ArrowRight || keys.d || keys.D) player.x += speed;
  if (keys.ArrowUp || keys.w || keys.W) player.y -= speed;
  if (keys.ArrowDown || keys.s || keys.S) player.y += speed;
  player.x = Math.max(20, Math.min(940, player.x));
  player.y = Math.max(20, Math.min(540, player.y));
}

function updateClouds() {
  for (const cloud of clouds) {
    cloud.x += cloud.vx;
    cloud.y += cloud.vy;
    if (cloud.x < 52 || cloud.x > 908) cloud.vx *= -1;
    if (cloud.y < 52 || cloud.y > 508) cloud.vy *= -1;
    if (Math.hypot(player.x - cloud.x, player.y - cloud.y) < 58) {
      for (const blob of blobs) {
        blob.mood = Math.max(0, blob.mood - 0.08);
      }
    }
  }
}

function updateBlobs() {
  for (const blob of blobs) {
    const distance = Math.hypot(player.x - blob.x, player.y - blob.y);
    if (distance < 86) {
      blob.mood = Math.min(100, blob.mood + 0.32);
    } else {
      blob.mood = Math.max(0, blob.mood - 0.006);
    }
  }
}

function loop() {
  if (!running) return;
  updatePlayer();
  updateClouds();
  updateBlobs();
  drawBackground();
  clouds.forEach(drawCloud);
  blobs.forEach(drawBlob);
  drawPlayer();

  const friends = blobs.filter((blob) => blob.mood >= 100).length;
  friendCount.textContent = `${friends} / 8`;
  statusEl.textContent = friends === 0 ? "靠近 Blob 让它们开心" : friends < 8 ? "继续点亮剩下的 Blob" : "花园已经亮起来了";

  if (friends === 8) {
    running = false;
    statusEl.textContent = "你赢了：花园里没有敌人，只有朋友。";
    return;
  }

  raf = requestAnimationFrame(loop);
}

function pointFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) * canvas.width) / rect.width,
    y: ((event.clientY - rect.top) * canvas.height) / rect.height,
  };
}

canvas.addEventListener("pointermove", (event) => {
  const point = pointFromEvent(event);
  player.x = point.x;
  player.y = point.y;
});

canvas.addEventListener("pointerdown", (event) => {
  canvas.focus();
  const point = pointFromEvent(event);
  player.x = point.x;
  player.y = point.y;
});

document.addEventListener("keydown", (event) => {
  keys[event.key] = true;
});

document.addEventListener("keyup", (event) => {
  keys[event.key] = false;
});

startButton.addEventListener("click", reset);
reset();
