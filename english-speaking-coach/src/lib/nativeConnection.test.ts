import { describe, expect, it } from "vitest";
import { normalizeNativeBaseUrl } from "./nativeConnection";

describe("normalizeNativeBaseUrl", () => {
  it("adds HTTP to a local address", () => {
    expect(normalizeNativeBaseUrl("192.168.1.7:8785")).toBe(
      "http://192.168.1.7:8785"
    );
  });

  it("removes paths and trailing slashes", () => {
    expect(normalizeNativeBaseUrl("http://10.0.0.5:8785/api/")).toBe(
      "http://10.0.0.5:8785"
    );
  });

  it("rejects unsupported protocols", () => {
    expect(() => normalizeNativeBaseUrl("ftp://192.168.1.7")).toThrow(
      "电脑地址必须使用 HTTP 或 HTTPS"
    );
  });
});
