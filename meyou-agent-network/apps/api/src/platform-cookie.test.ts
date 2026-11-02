import { expect, it } from "vitest";
import { platformCookie } from "./platform-cookie.js";

it("forwards one exact credential without other products or role credentials", () => {
  const cookies = "meyou_session=private; lym_sso_session=user-token; lym_admin_session=admin-token; analytics=private";
  expect(platformCookie(cookies, "lym_sso_session")).toBe("lym_sso_session=user-token");
  expect(platformCookie(cookies, "lym_admin_session")).toBe("lym_admin_session=admin-token");
  expect(platformCookie("prefix_lym_sso_session=not-the-cookie", "lym_sso_session")).toBe("");
});
it("rejects empty, duplicated and malformed credentials", () => {
  for (const value of [undefined, "", "lym_sso_session=", "lym_sso_session=a; lym_sso_session=b",
    "lym_sso_session=has space", "lym_sso_session=a\nb", `lym_sso_session=${"a".repeat(8193)}`]) {
    expect(platformCookie(value, "lym_sso_session")).toBe("");
  }
});
