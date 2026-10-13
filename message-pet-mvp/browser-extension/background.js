const DEFAULT_ENDPOINT = "http://127.0.0.1:43173/api/integrations/browser/messages";

async function settings() {
  const saved = await chrome.storage.local.get(["endpoint", "pairingCode", "enabled"]);
  return {
    endpoint: saved.endpoint || DEFAULT_ENDPOINT,
    pairingCode: saved.pairingCode || "",
    enabled: saved.enabled !== false,
  };
}

async function sendToPet(message) {
  const config = await settings();
  if (!config.enabled) throw new Error("浏览器伴侣已暂停");
  if (!config.pairingCode) throw new Error("请先填写本机配对码");

  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-message-pet-token": config.pairingCode,
    },
    body: JSON.stringify(message),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `发送失败：${response.status}`);
  return result;
}

function platformForUrl(url = "") {
  if (/feishu\.cn|larksuite\.com/.test(url)) return "飞书";
  if (/wx\.qq\.com/.test(url)) return "微信";
  return "浏览器";
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "send-selection-to-message-pet",
    title: "发送到消息灵宠",
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "send-selection-to-message-pet" || !info.selectionText) return;
  try {
    await sendToPet({
      id: `selection-${Date.now()}`,
      platform: platformForUrl(tab?.url),
      sender: tab?.title || "网页选中内容",
      content: info.selectionText,
      sourceUrl: tab?.url,
    });
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icon.svg",
      title: "已发送到消息灵宠",
      message: info.selectionText.slice(0, 80),
    });
  } catch (error) {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icon.svg",
      title: "消息灵宠连接失败",
      message: error.message,
    });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "MESSAGE_PET_WEB_NOTIFICATION") return false;
  sendToPet({
    id: message.id || `notification-${Date.now()}`,
    platform: platformForUrl(sender.tab?.url),
    sender: message.title || sender.tab?.title || "网页通知",
    content: message.body || message.title || "收到网页通知",
    sourceUrl: sender.tab?.url,
    mentionedMe: /@我|@\s*me\b/i.test(`${message.title || ""} ${message.body || ""}`),
  })
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});
