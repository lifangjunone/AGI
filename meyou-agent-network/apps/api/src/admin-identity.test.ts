import { expect, it, vi } from "vitest";
import type { FastifyRequest } from "fastify";
vi.mock("./db/client.js", () => ({ db: {} }));
import { resolveAdmin } from "./admin.js";

it("denies forged admin headers and only accepts central administrator validation", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("MEYOU_LOCAL_ADMIN_FALLBACK", "false");
  const fetch = vi.spyOn(globalThis, "fetch");
  try {
    expect(await resolveAdmin({ headers: { "x-lifeyoume-admin-user": "forged@invalid" } } as unknown as FastifyRequest)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    const request = { headers: { cookie: "other_product=private; lym_admin_session=acceptance; lym_sso_session=private", "x-lifeyoume-admin-user": "forged@invalid" } } as unknown as FastifyRequest;
    fetch.mockResolvedValue(new Response(JSON.stringify({ allowed: true, admin: { user: "Actual@Platform", role: "platform-admin" } })));
    expect(await resolveAdmin(request)).toEqual({ email: "actual@platform", source: "platform" });
    expect(fetch).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ redirect: "error" }));
    expect(fetch).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({
      headers: { cookie: "lym_admin_session=acceptance" }
    }));
    fetch.mockResolvedValue(new Response(JSON.stringify({ allowed: true, admin: { user: "Ordinary", role: "user" } })));
    expect(await resolveAdmin(request)).toBeNull();
    fetch.mockRejectedValue(new Error("offline"));
    expect(await resolveAdmin(request)).toBeNull();
  } finally { fetch.mockRestore(); vi.unstubAllEnvs(); }
});
