import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const EMPTY_STATE = Object.freeze({ projects: [], updatedAt: null });

export class ProjectStore {
  constructor(directory) {
    this.directory = directory;
    this.file = path.join(directory, "state.json");
    this.writeChain = Promise.resolve();
  }

  async read() {
    try {
      return JSON.parse(await readFile(this.file, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return structuredClone(EMPTY_STATE);
      throw error;
    }
  }

  async list() {
    const state = await this.read();
    return state.projects.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async get(id) {
    return (await this.list()).find((project) => project.id === id) || null;
  }

  async save(project) {
    this.writeChain = this.writeChain.then(async () => {
      const state = await this.read();
      const index = state.projects.findIndex((item) => item.id === project.id);
      if (index === -1) state.projects.push(project);
      else state.projects[index] = project;
      state.updatedAt = new Date().toISOString();
      await mkdir(this.directory, { recursive: true });
      const temporary = `${this.file}.tmp`;
      await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
      await rename(temporary, this.file);
    });
    await this.writeChain;
    return project;
  }
}
