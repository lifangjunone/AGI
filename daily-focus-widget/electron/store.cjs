const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_DATA = {
  tasks: [],
  reminderLog: {},
  settings: {
    remindersEnabled: true,
    launchAtLogin: false,
    alwaysOnTop: true,
    paperColor: "sage",
    dockPosition: "right"
  }
};

function createStore(userDataPath) {
  const filePath = path.join(userDataPath, "daily-focus.json");

  function read() {
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
      return {
        ...DEFAULT_DATA,
        ...parsed,
        settings: { ...DEFAULT_DATA.settings, ...parsed.settings }
      };
    } catch {
      return structuredClone(DEFAULT_DATA);
    }
  }

  function write(data) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
    fs.renameSync(tempPath, filePath);
    return data;
  }

  function update(mutator) {
    const data = read();
    mutator(data);
    return write(data);
  }

  return { read, write, update, filePath };
}

module.exports = { createStore };
