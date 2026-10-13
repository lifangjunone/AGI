(() => {
  if (window.__messagePetNotificationBridgeInstalled) return;
  window.__messagePetNotificationBridgeInstalled = true;

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.source !== "message-pet-notification") return;
    chrome.runtime.sendMessage({
      type: "MESSAGE_PET_WEB_NOTIFICATION",
      id: event.data.id,
      title: event.data.title,
      body: event.data.body,
    });
  });
})();
