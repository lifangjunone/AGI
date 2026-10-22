import test from "node:test";
import assert from "node:assert/strict";
import { classify, parseSkillsPage } from "../scripts/collect-skills.mjs";

test("parses skills.sh embedded records and de-duplicates repeated payloads", () => {
  const html = [
    '<script>"{\\"source\\":\\"anthropics/skills\\",\\"skillId\\":\\"pdf\\",\\"name\\":\\"pdf\\",\\"installs\\":1234,\\"weeklyInstalls\\":[1,2,3,4],\\"isOfficial\\":true}"</script>',
    '<script>"{\\"source\\":\\"anthropics/skills\\",\\"skillId\\":\\"pdf\\",\\"name\\":\\"pdf\\",\\"installs\\":1234,\\"weeklyInstalls\\":[1,2,3,4],\\"isOfficial\\":true}"</script>',
  ].join("");
  const records = parseSkillsPage(html);
  assert.equal(records.length, 1);
  assert.deepEqual(records[0], {
    source: "anthropics/skills",
    skillId: "pdf",
    name: "pdf",
    installs: 1234,
    weeklyInstalls: [1, 2, 3, 4],
    official: true,
  });
});

test("classifies common skill domains", () => {
  assert.equal(classify("frontend ui engineering react"), "development");
  assert.equal(classify("SEO content marketing plan"), "marketing");
  assert.equal(classify("video captions remotion"), "media");
  assert.equal(classify("unrelated personal helper"), "productivity");
});
