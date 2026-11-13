import assert from "node:assert/strict";
import test from "node:test";
import {
  approximateBazi,
  buildFortune,
  ganzhiYear,
  normalizeBirthDate,
  normalizeBirthTime,
  westernZodiac
} from "../src/fate-engine.mjs";
import { geocodePlace } from "../src/geocoder.mjs";
import { maasConfiguration } from "../src/maas-client.mjs";

test("western zodiac handles common boundary dates", () => {
  assert.equal(westernZodiac(3, 21).name, "白羊座");
  assert.equal(westernZodiac(4, 19).name, "白羊座");
  assert.equal(westernZodiac(4, 20).name, "金牛座");
  assert.equal(westernZodiac(1, 5).name, "摩羯座");
});

test("ganzhi and bazi return stable lightweight values", () => {
  assert.equal(ganzhiYear(1984), "甲子");
  assert.equal(ganzhiYear(2024), "甲辰");
  const bazi = approximateBazi(new Date("1996-08-22T06:30:00"));
  assert.equal(bazi.yearAnimal, "鼠");
  assert.ok(bazi.pillars.year);
  assert.ok(["木", "火", "土", "金", "水"].includes(bazi.dominantElement));
});

test("fortune report includes requested dimensions", () => {
  const fortune = buildFortune({
    name: "小林",
    birthDate: "1996-08-22",
    birthTime: "06:30",
    birthPlace: "杭州",
    longitude: 120.16,
    gender: "女生",
    relationshipGoal: "寻找长期、稳定且有心动感的关系"
  }, new Date("2026-11-11T00:00:00"));
  assert.equal(fortune.astrology.sunSign.name, "狮子座");
  assert.ok(fortune.astrology.ascendant.name);
  assert.ok(fortune.compatibility.bestSigns.length > 0);
  assert.ok(fortune.compatibility.bestAnimals.length > 0);
  assert.ok(fortune.romance.peachBlossomYears.every((year) => year >= 2026));
  assert.ok(fortune.romance.provinces.length > 0);
});

test("birth date supports picker format and manual formats", () => {
  assert.equal(normalizeBirthDate("1995-08-16"), "1995-08-16");
  assert.equal(normalizeBirthDate("1995/08/16"), "1995-08-16");
  assert.equal(normalizeBirthDate("1995年8月16日"), "1995-08-16");
  assert.equal(normalizeBirthDate("19950816"), "1995-08-16");
  assert.throws(() => normalizeBirthDate("1995/13/16"), /invalid_birth_date/);
});

test("birth time supports exact time and traditional shichen", () => {
  assert.deepEqual(normalizeBirthTime("12:30"), {
    time: "12:30",
    label: "12:30",
    precision: "exact",
    branch: "午"
  });
  assert.deepEqual(normalizeBirthTime("12点"), {
    time: "12:00",
    label: "12:00",
    precision: "exact",
    branch: "午"
  });
  assert.deepEqual(normalizeBirthTime("子时"), {
    time: "00:00",
    label: "子时（23:00-00:59）",
    precision: "shichen",
    branch: "子"
  });
  const fortune = buildFortune({
    name: "阿北",
    birthDate: "1995/08/16",
    birthTime: "子时",
    birthPlace: "陇南",
    longitude: 104.9218
  }, new Date("2026-11-11T00:00:00"));
  assert.equal(fortune.subject.birthDate, "1995-08-16");
  assert.equal(fortune.subject.birthTime, "子时（23:00-00:59）");
  assert.equal(fortune.subject.birthTimePrecision, "shichen");
});

test("maas configuration is optional but validates explicit values", () => {
  assert.equal(maasConfiguration({}), null);
  const config = maasConfiguration({
    MAAS_SERVICE_KEY: "lym_srv_test",
    MAAS_BASE_URL: "http://127.0.0.1:43280/v1/",
    MAAS_MODEL_ID: "lym-chat-quality",
    MODEL_TIMEOUT_MS: "120000"
  });
  assert.equal(config.baseUrl, "http://127.0.0.1:43280/v1");
  assert.equal(config.modelId, "lym-chat-quality");
  assert.throws(() => maasConfiguration({
    MAAS_SERVICE_KEY: "secret",
    MAAS_BASE_URL: "https://user:pass@example.test/v1"
  }), /invalid_maas_base_url/);
});

test("local geocoder resolves complete Chinese place names", () => {
  const [hangzhou] = geocodePlace("浙江省杭州市西湖区");
  assert.equal(hangzhou.name, "杭州");
  assert.equal(hangzhou.longitude, 120.1551);
  const [beijing] = geocodePlace("北京市朝阳区");
  assert.equal(beijing.name, "北京");
  const [longnan] = geocodePlace("甘肃 陇南");
  assert.equal(longnan.name, "陇南");
  assert.equal(longnan.longitude, 104.9218);
});
