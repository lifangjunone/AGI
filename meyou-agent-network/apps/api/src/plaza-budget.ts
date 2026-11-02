import { and, eq, sql } from "drizzle-orm";
import { planLimits } from "@meyou/shared";
import { db } from "./db/client.js";
import { usageLedger, users } from "./db/schema.js";

/** Reserve before calling the model. Failed calls still consume a real attempt. */
export async function reservePlazaCall(ownerId: string, key: string) {
  return db.transaction(async tx => {
    const [owner] = await tx.select().from(users).where(eq(users.id, ownerId)).for("update");
    if (!owner) return "unavailable" as const;
    const existing = await tx.query.usageLedger.findFirst({ where: eq(usageLedger.idempotencyKey, key) });
    if (existing) return "duplicate" as const;
    const [usage] = await tx.select({ total: sql<number>`coalesce(sum(${usageLedger.amount}), 0)::int` })
      .from(usageLedger).where(and(eq(usageLedger.ownerId, ownerId), eq(usageLedger.metric, "agent_reply")));
    if (usage!.total >= planLimits[owner.plan].replies) return "exhausted" as const;
    await tx.insert(usageLedger).values({ ownerId, metric: "agent_reply", amount: 1, idempotencyKey: key });
    return "reserved" as const;
  });
}
