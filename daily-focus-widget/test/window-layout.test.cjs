const test = require("node:test");
const assert = require("node:assert/strict");
const { getDockedBounds } = require("../electron/window-layout.cjs");

const workArea = { x: 0, y: 25, width: 1512, height: 957 };

test("docks a compact strip to the top-left work area", () => {
  assert.deepEqual(getDockedBounds(workArea, 286, 46, "left"), {
    x: 8,
    y: 33,
    width: 286,
    height: 46
  });
});

test("docks a compact strip to the top-right work area", () => {
  assert.deepEqual(getDockedBounds(workArea, 286, 46, "right"), {
    x: 1218,
    y: 33,
    width: 286,
    height: 46
  });
});
