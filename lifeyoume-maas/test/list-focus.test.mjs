import test from "node:test";
import assert from "node:assert/strict";
import { captureListFocus, restoreListFocus } from "../public/list-focus.js";

test("list focus identifies controls and selections without storing credentials", () => {
  const root = { contains: node => node.inside };
  assert.deepEqual(captureListFocus(root, { inside: true, id: "model-next", value: "secret" }),
    { id: "model-next" });
  assert.deepEqual(captureListFocus(root, { inside: true, dataset: { selectModel: "model-a" } }),
    { modelId: "model-a" });
  assert.equal(captureListFocus(root, { inside: false, id: "elsewhere" }), null);
});

test("list focus follows replacement controls and available pagination at a boundary", () => {
  const calls = [];
  const next = { id: "model-next", disabled: true };
  const prev = { id: "model-prev", focus: options => calls.push(options) };
  const root = {
    querySelectorAll: () => [next, prev],
    querySelector: selector => selector === "#model-prev:not(:disabled)" ? prev : null
  };
  restoreListFocus(root, { id: "model-next" });
  assert.deepEqual(calls, [{ preventScroll: true }]);
});
