const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createStore } = require("../electron/store.cjs");

test("defaults to sage paper and persists a selected paper color", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "daily-focus-store-"));

  try {
    const store = createStore(directory);
    assert.equal(store.read().settings.paperColor, "sage");

    store.update((data) => {
      data.settings.paperColor = "sun";
    });

    assert.equal(createStore(directory).read().settings.paperColor, "sun");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
