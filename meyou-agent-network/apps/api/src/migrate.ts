import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./db/client.js";

await migrate(db, { migrationsFolder: new URL("../drizzle", import.meta.url).pathname });
await pool.end();
console.log("MeYou database migrations completed.");
