const AUTO_HIDE_DELAY_MS = 1200;
const AUTO_HIDE_POLL_MS = 100;

function shouldAutoHide(autoHideEnabled, trigger) {
  const result = Boolean(autoHideEnabled && trigger && trigger !== "manual");
  // #region debug-point C:auto-hide-policy
  fetch("http://127.0.0.1:7777/event", { method: "POST", body: JSON.stringify({ sessionId: "example-hover-dismiss", runId: "post-fix-3", hypothesisId: "C", location: "electron/overlay-behavior.cjs:shouldAutoHide", msg: "[DEBUG] Auto-hide policy evaluated", data: { autoHideEnabled, trigger, result }, ts: Date.now() }) }).catch(() => {});
  // #endregion
  return result;
}

function isPointInsideBounds(point, bounds) {
  return (
    point.x >= bounds.x &&
    point.x < bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y < bounds.y + bounds.height
  );
}

module.exports = {
  AUTO_HIDE_DELAY_MS,
  AUTO_HIDE_POLL_MS,
  isPointInsideBounds,
  shouldAutoHide,
};
