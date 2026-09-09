import { randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const PRICE_KEYS = ["product", "article", "social"];

function normalizePrice(value) {
  const text = String(value ?? "").trim();
  if (!/^(?:0|[1-9]\d{0,3})(?:\.\d{1,2})?$/.test(text)) return null;
  const amount = Number(text);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 9999) return null;
  return amount.toFixed(2);
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && timingSafeEqual(a, b);
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

export function createAdminStore({ dataDirectory, defaultPrices }) {
  const settingsPath = path.join(dataDirectory, "admin", "settings.json");
  const sessions = new Map();
  const loginAttempts = new Map();
  let prices = { ...defaultPrices };

  async function initialize() {
    const stored = await readJson(settingsPath, {});
    for (const key of PRICE_KEYS) {
      const value = normalizePrice(stored.prices?.[key]);
      if (value) prices[key] = value;
    }
  }

  async function save() {
    await mkdir(path.dirname(settingsPath), { recursive: true });
    const temporaryPath = `${settingsPath}.tmp`;
    await writeFile(temporaryPath, JSON.stringify({
      prices,
      updatedAt: new Date().toISOString()
    }, null, 2), { mode: 0o600 });
    await rename(temporaryPath, settingsPath);
  }

  function credentialsConfigured() {
    return Boolean(process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD);
  }

  function authenticate(username, password, remoteAddress = "unknown") {
    const now = Date.now();
    const attempt = loginAttempts.get(remoteAddress);
    if (attempt && attempt.blockedUntil > now) return null;
    if (!credentialsConfigured() || !safeEqual(username, process.env.ADMIN_USERNAME) || !safeEqual(password, process.env.ADMIN_PASSWORD)) {
      const next = attempt && attempt.windowUntil > now
        ? { count: attempt.count + 1, windowUntil: attempt.windowUntil }
        : { count: 1, windowUntil: now + 15 * 60 * 1000 };
      next.blockedUntil = next.count >= 10 ? now + 15 * 60 * 1000 : 0;
      loginAttempts.set(remoteAddress, next);
      return null;
    }
    loginAttempts.delete(remoteAddress);
    const token = randomBytes(32).toString("hex");
    sessions.set(token, now + SESSION_TTL_MS);
    return token;
  }

  function authorize(token) {
    if (!token) return false;
    const expiresAt = sessions.get(token);
    if (!expiresAt) return false;
    if (expiresAt <= Date.now()) {
      sessions.delete(token);
      return false;
    }
    sessions.set(token, Date.now() + SESSION_TTL_MS);
    return true;
  }

  function revoke(token) {
    if (token) sessions.delete(token);
  }

  function getPrices() {
    return { ...prices };
  }

  async function updatePrices(input) {
    const next = { ...prices };
    for (const key of PRICE_KEYS) {
      if (input?.[key] !== undefined) {
        const normalized = normalizePrice(input[key]);
        if (!normalized) throw new Error(`${key}价格必须是 0.01 至 9999.99 的数字`);
        next[key] = normalized;
      }
    }
    prices = next;
    await save();
    return getPrices();
  }

  return {
    initialize,
    credentialsConfigured,
    authenticate,
    authorize,
    revoke,
    getPrices,
    updatePrices,
    normalizePrice
  };
}

export function parseCookies(header = "") {
  return Object.fromEntries(
    header.split(";").map((part) => part.trim().split("=")).filter(([key, value]) => key && value)
  );
}

export function adminCookie(token, secure = false) {
  return `frame60_admin=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}${secure ? "; Secure" : ""}`;
}

export function expiredAdminCookie(secure = false) {
  return `frame60_admin=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
}
