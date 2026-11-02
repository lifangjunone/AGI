import type { users } from "./db/schema.js";

/** Explicit allowlist: additions to the user table must not become public by default. */
export function publicContact(user: typeof users.$inferSelect | null | undefined) {
  if (!user) return null;
  return {
    id: user.id, handle: user.handle, displayName: user.displayName,
    headline: user.headline, bio: user.bio, city: user.city, avatar: user.avatar,
    interests: user.interests, goals: user.goals
  };
}
