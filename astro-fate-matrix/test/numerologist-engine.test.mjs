import assert from "node:assert/strict";
import test from "node:test";
import { buildFortune } from "../src/fate-engine.mjs";
import {
  buildProfessionalReading,
  buildQimenPayload,
  buildZiweiPayload,
  normalizeProfessionalGender
} from "../src/numerologist-engine.mjs";

test("professional gender normalization supports product labels", () => {
  assert.equal(normalizeProfessionalGender("男生"), "男");
  assert.equal(normalizeProfessionalGender("女生"), "女");
  assert.equal(normalizeProfessionalGender("非二元/不想定义"), null);
});

test("professional payloads are derived from existing fortune input", () => {
  const fortune = buildFortune({
    name: "小林",
    birthDate: "1996-08-22",
    birthTime: "卯时",
    birthPlace: "甘肃 陇南",
    longitude: 104.9218,
    gender: "男生",
    relationshipGoal: "想知道近期桃花机会"
  }, new Date("2026-11-11T00:00:00"));
  const ziwei = buildZiweiPayload(fortune, 2026);
  assert.equal(ziwei.birth_time, "1996-08-22 05:00");
  assert.equal(ziwei.gender, "男");
  assert.equal(ziwei.query_year, 2026);

  const qimen = buildQimenPayload(fortune, new Date("2026-11-11T06:30:00Z"));
  assert.equal(qimen.question_type, "感情桃花");
  assert.equal(qimen.location.timezone, "Asia/Shanghai");
  assert.match(qimen.time_input, /^2026-11-11 /);
});

test("professional reading degrades when python engine is unavailable", async () => {
  const fortune = buildFortune({
    name: "小林",
    birthDate: "1996-08-22",
    birthTime: "06:30",
    birthPlace: "杭州",
    longitude: 120.16,
    gender: "女生"
  }, new Date("2026-11-11T00:00:00"));
  const previous = process.env.NUMEROLOGIST_PYTHON;
  process.env.NUMEROLOGIST_PYTHON = "/definitely/missing/python";
  try {
    const professional = await buildProfessionalReading(fortune, {
      now: new Date("2026-11-11T00:00:00")
    });
    assert.equal(professional.enabled, true);
    assert.equal(professional.available, false);
    assert.ok(professional.errors.length >= 1);
    assert.ok(professional.synthesis.systems.includes("星座"));
  } finally {
    if (previous === undefined) delete process.env.NUMEROLOGIST_PYTHON;
    else process.env.NUMEROLOGIST_PYTHON = previous;
  }
});
