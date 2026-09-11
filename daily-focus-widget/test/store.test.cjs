const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createStore } = require("../electron/store.cjs");

test("persists paper color and screen-edge position", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "daily-focus-store-"));

  try {
    const store = createStore(directory);
    assert.equal(store.read().settings.paperColor, "sage");
    assert.equal(store.read().settings.dockPosition, "right");

    store.update((data) => {
      data.settings.paperColor = "sun";
      data.settings.dockPosition = "left";
    });

    assert.equal(createStore(directory).read().settings.paperColor, "sun");
    assert.equal(createStore(directory).read().settings.dockPosition, "left");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
