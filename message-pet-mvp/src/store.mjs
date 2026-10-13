import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const DEFAULT_PREFERENCES = {
  userName: "我",
  importantPeople: ["张总", "陈曦"],
  importantGroups: ["核心项目群", "产品上线群"],
};

function uniqueStrings(values, limit = 100) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((value) => String(value).trim()).filter(Boolean))].slice(
    0,
    limit,
  );
}

export function sanitizePreferences(input = {}) {
  return {
    userName: String(input.userName || "我").trim().slice(0, 30) || "我",
    importantPeople: uniqueStrings(input.importantPeople),
    importantGroups: uniqueStrings(input.importantGroups),
  };
}

export function createStore(dataDir, seedMessages = []) {
  const filePath = join(dataDir, "state.json");
  let state = {
    preferences: DEFAULT_PREFERENCES,
    messages: seedMessages,
    integrations: {
      browserBridgeToken: randomBytes(24).toString("hex"),
    },
  };

  async function persist() {
    await mkdir(dirname(filePath), { recursive: true });
    const temporary = `${filePath}.tmp`;
    await writeFile(temporary, JSON.stringify(state, null, 2), "utf8");
    await rename(temporary, filePath);
  }

  return {
    async load() {
      try {
        const saved = JSON.parse(await readFile(filePath, "utf8"));
        state = {
          preferences: sanitizePreferences(saved.preferences || DEFAULT_PREFERENCES),
          messages: Array.isArray(saved.messages) ? saved.messages.slice(0, 1000) : seedMessages,
          integrations: {
            browserBridgeToken:
              saved.integrations?.browserBridgeToken || randomBytes(24).toString("hex"),
          },
        };
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        await persist();
      }
      return state;
    },
    read() {
      return structuredClone(state);
    },
    async updatePreferences(preferences) {
      state.preferences = sanitizePreferences(preferences);
      await persist();
      return structuredClone(state.preferences);
    },
    async addMessage(message) {
      if (state.messages.some((item) => item.id === message.id)) return false;
      state.messages = [message, ...state.messages].slice(0, 1000);
      await persist();
      return true;
    },
  };
}
