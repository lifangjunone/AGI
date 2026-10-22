import type { FastifyRequest } from "fastify";
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import { db } from "./db/client.js";
import { authAccounts, authSessions, users } from "./db/schema.js";

export interface AuthUser {
  id: string;
  name: string;
  email?: string;
}

const scrypt = promisify(scryptCallback);
const SESSION_COOKIE = "meyou_session";
const SESSION_DAYS = 30;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function parseCookie(request: FastifyRequest, name: string) {
  const value = request.headers.cookie?.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return value ? decodeURIComponent(value.slice(name.length + 1)) : "";
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, 64) as Buffer;
  return `scrypt:${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, encoded: string) {
  const [, salt, digest] = encoded.split(":");
  if (!salt || !digest) return false;
  const derived = await scrypt(password, salt, 64) as Buffer;
  const expected = Buffer.from(digest, "hex");
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

export async function registerLocalAccount(emailInput: string, password: string, name: string) {
  const email = normalizeEmail(emailInput);
  const [existingAccount] = await db.select({ id: authAccounts.id }).from(authAccounts)
    .where(eq(authAccounts.email, email)).limit(1);
  if (existingAccount) throw new Error("email_already_exists");
  const passwordHash = await hashPassword(password);
  const lifeYouMeId = `local:${email}`;
  const handleBase = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 20) || "user";
  const handle = `${handleBase}-${randomBytes(3).toString("hex")}`;
  const [user] = await db.insert(users).values({
    lifeYouMeId,
    handle,
    displayName: name.trim(),
    locale: "zh-CN",
    plan: "free"
  }).returning();
  if (!user) throw new Error("user_create_failed");
  await db.insert(authAccounts).values({ email, passwordHash, userId: user.id });
  // AuthUser.id is the stable external identity. The database UUID stays
  // internal and is resolved by ensureUser exactly once after registration.
  return { id: lifeYouMeId, name: user.displayName, email };
}

export async function loginLocalAccount(emailInput: string, password: string) {
  const email = normalizeEmail(emailInput);
  const [account] = await db.select().from(authAccounts).where(eq(authAccounts.email, email)).limit(1);
  if (!account || !await verifyPassword(password, account.passwordHash)) return null;
  const [user] = await db.select().from(users).where(eq(users.id, account.userId)).limit(1);
  return user ? { id: user.lifeYouMeId, name: user.displayName, email } : null;
}

export async function createSession(user: AuthUser) {
  const [databaseUser] = await db.select({ id: users.id }).from(users)
    .where(eq(users.lifeYouMeId, user.id)).limit(1);
  if (!databaseUser) throw new Error("session_user_not_found");
  const token = randomBytes(32).toString("base64url");
  await db.insert(authSessions).values({
    tokenHash: hashToken(token),
    userId: databaseUser.id,
    expiresAt: new Date(Date.now() + SESSION_DAYS * 86400000)
  });
  return token;
}

export async function deleteSession(token: string) {
  await db.delete(authSessions).where(eq(authSessions.tokenHash, hashToken(token)));
}

async function resolveLocalSession(request: FastifyRequest) {
  const token = parseCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const [session] = await db.select().from(authSessions)
    .where(eq(authSessions.tokenHash, hashToken(token))).limit(1);
  if (!session) return null;
  if (session.expiresAt <= new Date()) return null;
  const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  return user ? { id: user.lifeYouMeId, name: user.displayName } : null;
}

export function resolveTrustedHeaderUser(
  headers: FastifyRequest["headers"],
  localUser: AuthUser | null
): AuthUser | null {
  // A valid MeYou session represents the account the visitor explicitly chose
  // on this product. The platform gateway header is only the SSO fallback.
  if (localUser) return localUser;
  const trustedUserId = headers["x-lifeyoume-user-id"];
  if (trustedUserId) {
    return {
      id: String(trustedUserId),
      name: String(headers["x-lifeyoume-user-name"] ?? "LifeYouMe 用户"),
      email: headers["x-lifeyoume-user-email"]
        ? String(headers["x-lifeyoume-user-email"])
        : undefined
    };
  }
  return null;
}

export async function resolveUser(request: FastifyRequest): Promise<AuthUser | null> {
  const localUser = await resolveLocalSession(request);
  const sessionOrHeaderUser = resolveTrustedHeaderUser(request.headers, localUser);
  if (sessionOrHeaderUser) return sessionOrHeaderUser;
  if (process.env.NODE_ENV === "test" || (process.env.DEV_AUTH_BYPASS === "true" && process.env.NODE_ENV !== "production")) {
    return { id: "demo-lifeyoume-user", name: "林澄", email: "demo@meyou.local" };
  }
  const cookie = request.headers.cookie;
  const bearer = request.headers.authorization;
  if (!cookie && !bearer) return null;
  const response = await fetch(process.env.AUTH_ME_URL ?? "https://auth.lifeyoume.icu/api/v1/me", {
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(bearer ? { authorization: bearer } : {})
    },
    signal: AbortSignal.timeout(5000)
  });
  if (!response.ok) return null;
  const value = await response.json() as Record<string, unknown>;
  return {
    id: String(value.id ?? value.user_id),
    name: String(value.display_name ?? value.name ?? "MeYou 用户"),
    email: value.email ? String(value.email) : undefined
  };
}
