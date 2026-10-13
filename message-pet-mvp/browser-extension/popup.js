const DEFAULT_ENDPOINT = "http://127.0.0.1:43173/api/integrations/browser/messages";
const pairingCode = document.querySelector("#pairing-code");
const endpoint = document.querySelector("#endpoint");
const enabled = document.querySelector("#enabled");
const result = document.querySelector("#result");
const statusDot = document.querySelector("#status-dot");

async function load() {
  const saved = await chrome.storage.local.get(["pairingCode", "endpoint", "enabled"]);
  pairingCode.value = saved.pairingCode || "";
  endpoint.value = saved.endpoint || DEFAULT_ENDPOINT;
  enabled.checked = saved.enabled !== false;
  if (saved.pairingCode) {
    result.textContent = "已保存配对信息，可以点击重新测试。";
  }
}

document.querySelector("#save").addEventListener("click", async () => {
  result.className = "";
  result.textContent = "正在连接本机消息灵宠…";
  const config = {
    pairingCode: pairingCode.value.trim(),
    endpoint: endpoint.value.trim() || DEFAULT_ENDPOINT,
    enabled: enabled.checked,
  };
  if (!config.pairingCode) {
    result.className = "error";
    result.textContent = "请先从消息灵宠设置页复制配对码。";
    return;
  }

  try {
    const response = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-message-pet-token": config.pairingCode,
      },
      body: JSON.stringify({
        id: `connection-test-${Date.now()}`,
        platform: "浏览器",
        sender: "浏览器伴侣",
        content: "浏览器伴侣连接测试成功，无需处理。",
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "无法连接本机服务");
    await chrome.storage.local.set(config);
    statusDot.classList.add("online");
    result.className = "success";
    result.textContent = "连接成功。网页通知会发送到本机消息灵宠。";
  } catch (error) {
    statusDot.classList.remove("online");
    result.className = "error";
    result.textContent = error.message;
  }
});

load();
