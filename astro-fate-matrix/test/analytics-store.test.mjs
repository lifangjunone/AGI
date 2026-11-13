import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { AnalyticsStore, inferProvince, maskName } from "../src/analytics-store.mjs";
import { buildFortune } from "../src/fate-engine.mjs";

test("province inference prefers detailed place names", () => {
  assert.equal(inferProvince("甘肃 陇南"), "甘肃");
  assert.equal(inferProvince("浙江省杭州市西湖区"), "浙江");
  assert.equal(inferProvince("火星"), "未知");
});

test("analytics store records quota and public/admin stats", async () => {
  const dir = await mkdtemp(join(tmpdir(), "astro-fate-"));
  try {
    const store = new AnalyticsStore(join(dir, "analytics.json"));
    await store.load();
    const fortune = buildFortune({ name: "小林", birthDate: "1995/08/16", birthTime: "子时", birthPlace: "甘肃 陇南", longitude: 104.9218 });
    const one = await store.recordAnalysis({
      visitorId: "visitor-1",
      userId: "",
      input: { name: "小林", birthDate: "1995-08-16", birthTime: "子时", birthPlace: "甘肃 陇南" },
      fortune,
      source: "maas",
      model: { used: true, modelId: "lym-chat-quality" }
    });
    assert.equal(one.quota.used, 1);
    assert.equal(one.quota.remaining, 2);
    assert.equal(maskName("小林"), "小*");
    await store.load();
    assert.equal(store.publicStats().provinceStats[0].province, "甘肃");
    assert.equal(store.adminStats().records[0].input.birthPlace, "甘肃 陇南");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
