const test = require("node:test");
const assert = require("node:assert/strict");
const {
  AUTO_HIDE_DELAY_MS,
  AUTO_HIDE_POLL_MS,
  isPointInsideBounds,
  shouldAutoHide,
} = require("./overlay-behavior.cjs");

test("provides enough time to reach popup controls", () => {
  assert.equal(AUTO_HIDE_DELAY_MS, 1200);
  assert.equal(AUTO_HIDE_POLL_MS, 100);
});

test("detects whether the system pointer is over the popup", () => {
  const bounds = { x: 100, y: 200, width: 390, height: 340 };
  assert.equal(isPointInsideBounds({ x: 100, y: 200 }, bounds), true);
  assert.equal(isPointInsideBounds({ x: 489, y: 539 }, bounds), true);
  assert.equal(isPointInsideBounds({ x: 490, y: 300 }, bounds), false);
  assert.equal(isPointInsideBounds({ x: 99, y: 300 }, bounds), false);
});

test("auto-hides all automatic translation triggers", () => {
  assert.equal(shouldAutoHide(true, "hover"), true);
  assert.equal(shouldAutoHide(true, "doubleClick"), true);
  assert.equal(shouldAutoHide(true, "selection"), true);
});

test("keeps manual results and respects disabled setting", () => {
  assert.equal(shouldAutoHide(true, "manual"), false);
  assert.equal(shouldAutoHide(false, "doubleClick"), false);
  assert.equal(shouldAutoHide(true, undefined), false);
});
