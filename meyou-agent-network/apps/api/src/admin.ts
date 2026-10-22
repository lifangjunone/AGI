import type { FastifyRequest } from "fastify";
import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "./db/client.js";
import { adminSessions } from "./db/schema.js";

export interface AdminIdentity {
  email: string;
  source: "platform" | "local";
}

const ADMIN_COOKIE = "meyou_admin_session";
const ADMIN_SESSION_HOURS = 12;
const PLATFORM_ADMIN_HEADER = "x-lifeyoume-admin-user";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function parseCookie(request: FastifyRequest, name: string) {
  const value = request.headers.cookie?.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return value ? decodeURIComponent(value.slice(name.length + 1)) : "";
}

function headerValue(request: FastifyRequest, name: string) {
  const value = request.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function localAdminFallbackEnabled() {
  return process.env.MEYOU_LOCAL_ADMIN_FALLBACK === "true";
}

export function platformAdminConfigured() {
  return true;
}

export function adminCredentialsConfigured() {
  return localAdminFallbackEnabled()
    && Boolean(process.env.ADMIN_EMAIL?.trim() && process.env.ADMIN_PASSWORD_HASH?.trim());
}

export function verifyAdminCredentials(emailInput: string, password: string) {
  if (!localAdminFallbackEnabled()) return false;
  const configuredEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase() ?? "";
  const configuredHash = process.env.ADMIN_PASSWORD_HASH?.trim() ?? "";
  const email = emailInput.trim().toLowerCase();
  if (!configuredEmail || !configuredHash || email !== configuredEmail) return false;
  const [algorithm, salt, digest] = configuredHash.split(":");
  if (algorithm !== "scrypt" || !salt || !digest) return false;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(digest, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function hashAdminPassword(password: string, salt = randomBytes(16).toString("hex")) {
  return `scrypt:${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

export async function createAdminSession(email: string) {
  if (!localAdminFallbackEnabled()) throw new Error("local_admin_fallback_disabled");
  const token = randomBytes(32).toString("base64url");
  await db.insert(adminSessions).values({
    tokenHash: hashToken(token),
    email: email.trim().toLowerCase(),
    expiresAt: new Date(Date.now() + ADMIN_SESSION_HOURS * 60 * 60 * 1000)
  });
  return token;
}

export async function resolveAdmin(request: FastifyRequest): Promise<AdminIdentity | null> {
  const platformAdmin = String(headerValue(request, PLATFORM_ADMIN_HEADER)).trim();
  if (platformAdmin) return { email: platformAdmin.toLowerCase(), source: "platform" };
  if (!localAdminFallbackEnabled()) return null;
  const token = parseCookie(request, ADMIN_COOKIE);
  if (!token) return null;
  const [session] = await db.select().from(adminSessions)
    .where(eq(adminSessions.tokenHash, hashToken(token))).limit(1);
  if (!session || session.expiresAt <= new Date()) return null;
  return { email: session.email, source: "local" };
}

export async function deleteAdminSession(request: FastifyRequest) {
  if (!localAdminFallbackEnabled()) return;
  const token = parseCookie(request, ADMIN_COOKIE);
  if (token) await db.delete(adminSessions).where(eq(adminSessions.tokenHash, hashToken(token)));
}

export function adminCookie(token: string) {
  return `meyou_admin_session=${encodeURIComponent(token)}; Path=/; Max-Age=${ADMIN_SESSION_HOURS * 3600}; HttpOnly; SameSite=Strict${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}

export function clearAdminCookie() {
  return `meyou_admin_session=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Strict${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}

function encryptionKey() {
  const secret = process.env.MODEL_CONFIG_ENCRYPTION_KEY ?? process.env.SESSION_SECRET ?? "";
  if (secret.length < 32) throw new Error("model_encryption_key_not_configured");
  return createHash("sha256").update(secret).digest();
}

export function encryptModelSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `v1:${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${encrypted.toString("base64url")}`;
}

export function decryptModelSecret(value: string) {
  const [version, iv, tag, encrypted] = value.split(":");
  if (version !== "v1" || !iv || !tag || !encrypted) throw new Error("invalid_encrypted_model_secret");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

export function maskSecret(value: string) {
  if (!value) return "";
  if (value.length <= 8) return "••••••••";
  return `${value.slice(0, 4)}••••••••${value.slice(-4)}`;
}
