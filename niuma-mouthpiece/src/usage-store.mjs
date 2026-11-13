import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const initialState = () => ({
  version: 1,
  visitors: {},
  records: []
});

function visitorHash(visitorId) {
  return createHash("sha256").update(String(visitorId || "")).digest("hex").slice(0, 12);
}

export class UsageStore {
  constructor(path) {
    this.path = path;
    this.state = initialState();
    this.writeChain = Promise.resolve();
  }

  async load() {
    try {
      this.state = { ...initialState(), ...JSON.parse(await readFile(this.path, "utf8")) };
      this.state.visitors ||= {};
      this.state.records ||= [];
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      this.state = initialState();
    }
  }

  quotaFor(visitorId, freeLimit) {
    const used = this.state.visitors[visitorId]?.used || 0;
    return { used, remaining: Math.max(0, freeLimit - used), limit: freeLimit };
  }

  async mutate(fn) {
    this.writeChain = this.writeChain.then(async () => {
      await this.load();
      const result = fn(this.state);
      await mkdir(dirname(this.path), { recursive: true });
      const temporary = `${this.path}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(temporary, JSON.stringify(this.state, null, 2), { mode: 0o600 });
      await rename(temporary, this.path);
      return result;
    });
    return this.writeChain;
  }

  async recordGeneration({ visitorId, userId, source, model, freeLimit }) {
    const createdAt = new Date().toISOString();
    return this.mutate((state) => {
      const visitor = state.visitors[visitorId] || { used: 0, firstSeenAt: createdAt };
      visitor.used = (visitor.used || 0) + 1;
      visitor.lastSeenAt = createdAt;
      state.visitors[visitorId] = visitor;
      const record = {
        id: randomUUID(),
        createdAt,
        visitorHash: visitorHash(visitorId),
        userId: userId || "",
        source,
        modelUsed: Boolean(model?.used),
        modelId: model?.modelId || ""
      };
      state.records.push(record);
      if (state.records.length > 10_000) state.records = state.records.slice(-10_000);
      return {
        record,
        quota: { used: visitor.used, remaining: Math.max(0, freeLimit - visitor.used), limit: freeLimit }
      };
    });
  }

  adminStats() {
    const today = new Date().toISOString().slice(0, 10);
    return {
      totalGenerations: this.state.records.length,
      todayGenerations: this.state.records.filter((record) => record.createdAt.startsWith(today)).length,
      visitorCount: Object.keys(this.state.visitors).length,
      modelUsedCount: this.state.records.filter((record) => record.modelUsed).length,
      recent: this.state.records.slice(-50).reverse()
    };
  }
}
