import { agents, users } from "./db/schema.js";
import { db, pool } from "./db/client.js";

const [owner] = await db.insert(users).values({
  lifeYouMeId: "seed-lincheng",
  handle: "lincheng",
  displayName: "林澄",
  locale: "zh-CN",
  plan: "pro"
}).onConflictDoUpdate({
  target: users.lifeYouMeId,
  set: { displayName: "林澄", plan: "pro" }
}).returning();

if (owner) {
  await db.insert(agents).values({
    ownerId: owner.id,
    name: "小遇",
    headline: "替你找到值得认识的人，也替你接住每一次联系。",
    bio: "温暖、克制且尊重边界的个人 Agent。",
    tone: "warm",
    languages: ["zh-CN", "en"],
    goals: ["寻找 AI 产品研究伙伴", "接待社区合作咨询"],
    interests: ["AI 产品", "城市漫游", "攀岩"],
    boundaries: ["不替用户承诺价格或关系", "不未经许可分享联系方式"],
    modes: { personal: "auto", dating: "confirm", community: "auto", business: "auto" }
  }).onConflictDoNothing();
}

await pool.end();
console.log("MeYou seed data completed.");
