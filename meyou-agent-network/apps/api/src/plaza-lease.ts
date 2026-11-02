import { pool } from "./db/client.js";

/** A cross-process lease; released on exceptions or connection loss. No timer races. */
export async function withPlazaLease<T>(key: string, work: () => Promise<T>, busy: T): Promise<T> {
  const client = await pool.connect();
  let acquired = false;
  try {
    const result = await client.query<{ locked: boolean }>(
      "select pg_try_advisory_lock(hashtextextended($1, 0)) as locked", [`meyou:plaza:${key}`]
    );
    acquired = result.rows[0]?.locked === true;
    return acquired ? await work() : busy;
  } finally {
    if (acquired) {
      try {
        await client.query("select pg_advisory_unlock(hashtextextended($1, 0))", [`meyou:plaza:${key}`]);
        client.release();
      } catch {
        client.release(true);
      }
    } else client.release();
  }
}
