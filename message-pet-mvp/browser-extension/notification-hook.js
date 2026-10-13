(() => {
  if (window.__messagePetNativeNotificationHooked || !window.Notification) return;
  window.__messagePetNativeNotificationHooked = true;

  const NativeNotification = window.Notification;
  const WrappedNotification = function (title, options = {}) {
    const notification = new NativeNotification(title, options);
    window.postMessage(
      {
        source: "message-pet-notification",
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        title: String(title || ""),
        body: String(options.body || ""),
      },
      window.location.origin,
    );
    return notification;
  };

  Object.defineProperty(WrappedNotification, "permission", {
    get: () => NativeNotification.permission,
  });
  WrappedNotification.requestPermission = (...args) =>
    NativeNotification.requestPermission(...args);
  WrappedNotification.prototype = NativeNotification.prototype;
  window.Notification = WrappedNotification;
})();
