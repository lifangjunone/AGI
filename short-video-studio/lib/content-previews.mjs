import { randomBytes, createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";

export const buyerHash = token => createHash("sha256").update(token).digest("hex");

export function createContentPreviews(dataDirectory) {
  const directory = path.join(dataDirectory, "content-previews");
  return {
    async save(pack, ownerHash) {
      const id = randomBytes(24).toString("hex");
      await mkdir(directory, { recursive: true });
      const record = { id, ownerHash, pack, createdAt: Date.now(), expiresAt: Date.now() + 7 * 86400000 };
      const temporary = path.join(directory, `${id}.tmp`);
      await writeFile(temporary, JSON.stringify(record), { mode: 0o600 });
      await rename(temporary, path.join(directory, `${id}.json`));
      return record;
    },
    async get(id, ownerHash) {
      if (!/^[a-f0-9]{48}$/.test(id || "")) return null;
      try {
        const record = JSON.parse(await readFile(path.join(directory, `${id}.json`), "utf8"));
        return record.ownerHash === ownerHash && record.expiresAt > Date.now() ? record : null;
      } catch (error) {
        if (error.code === "ENOENT") return null;
        throw error;
      }
    }
  };
}
