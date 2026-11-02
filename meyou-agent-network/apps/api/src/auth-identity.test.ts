import { expect, it, vi } from "vitest";
import type { FastifyRequest } from "fastify";
vi.mock("./db/client.js", () => ({ db: {} }));
import { parsePlatformIdentity, resolveTrustedHeaderUser, resolveUser } from "./auth.js";

it("rejects absent, compound, ambiguous and unsafe central identity IDs", () => {
  for (const value of [null, [], {}, { name: "Somebody" }, { id: {} }, { id: [] },
    { id: "" }, { id: "undefined" }, { id: "null" }, { id: "a\nb" },
    { id: Number.MAX_SAFE_INTEGER + 1 }, { id: -1 }, { id: "x".repeat(257) }]) {
    expect(parsePlatformIdentity(value)).toBeNull();
  }
  expect(parsePlatformIdentity({ user_id: 123, name: " Alice " })).toEqual({
    id: "123", name: "Alice", email: undefined
  });
  expect(parsePlatformIdentity({ id: "user-a", name: { unsafe: true } })?.name).toBe("MeYou 用户");
  expect(parsePlatformIdentity({ authenticated: true, user: { id: "nested-user", display_name: "Central user" } }))
    .toMatchObject({ id: "nested-user", name: "Central user" });
  expect(parsePlatformIdentity({ authenticated: false, user: { id: "nested-user" } })).toBeNull();
  expect(resolveTrustedHeaderUser({ "x-lifeyoume-user-id": ["a", "b"] }, null)).toBeNull();
});

it("ignores forged identity headers outside tests and verifies credentials centrally", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("DEV_AUTH_BYPASS", "false");
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
    authenticated: true, user: { id: "verified-user", display_name: "Verified" }
  })));
  try {
    expect(await resolveUser({ headers: { "x-lifeyoume-user-id": "forged" } } as unknown as FastifyRequest)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    expect(await resolveUser({ headers: { "x-lifeyoume-user-id": "forged", authorization: "Bearer fixture" } } as unknown as FastifyRequest))
      .toMatchObject({ id: "verified-user" });
  } finally { fetch.mockRestore(); vi.unstubAllEnvs(); }
});

it("fails closed on network, malformed JSON and incomplete identity responses", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("DEV_AUTH_BYPASS", "false");
  const request = { headers: { authorization: "Bearer acceptance-only" } } as FastifyRequest;
  const fetch = vi.spyOn(globalThis, "fetch");
  try {
    fetch.mockRejectedValue(new Error("offline"));
    expect(await resolveUser(request)).toBeNull();
    fetch.mockResolvedValue(new Response("not-json"));
    expect(await resolveUser(request)).toBeNull();
    fetch.mockResolvedValue(new Response(JSON.stringify({ name: "No ID" })));
    expect(await resolveUser(request)).toBeNull();
    fetch.mockResolvedValue(new Response(JSON.stringify({ id: "unique-user", name: "User" })));
    expect(await resolveUser(request)).toMatchObject({ id: "unique-user", name: "User" });
    expect(fetch).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ redirect: "error" }));
  } finally { fetch.mockRestore(); vi.unstubAllEnvs(); }
});
