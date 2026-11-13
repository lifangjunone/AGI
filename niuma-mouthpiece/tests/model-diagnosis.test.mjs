import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { diagnose } from "../src/diagnosis.mjs";
import { normalizeModelDiagnosis } from "../src/model-diagnosis.mjs";

describe("normalizeModelDiagnosis", () => {
  it("keeps model output inside product schema and length limits", () => {
    const fallback = diagnose("老板临下班说有个小需求，明早要");
    const result = normalizeModelDiagnosis({
      angerType: "不存在的类型",
      angerScore: 120,
      title: "特别特别特别特别特别长的身份标题",
      monster: "特别特别特别特别特别长的怪物名字",
      comfort: "<script>你不是效率低，是对方把时间当自助餐还不付钱</script>",
      roast: "明早要当然可以，建议先把地球自转调成老板专属低速模式然后再讨论人类极限",
      civilized: "我理解这个需求很急，但当前排期需要重新确认优先级、交付边界和风险，否则会影响整体质量与上线稳定性。",
      shareText: "今天的我不是在加班，是在给时间管理学做一场非常漫长的尸检。",
      survival: -3
    }, fallback);

    assert.equal(result.angerType, fallback.angerType);
    assert.equal(result.angerScore, 99);
    assert.equal(result.survival, 3);
    assert.ok(!result.comfort.includes("<"));
    assert.ok([...result.title].length <= 18);
    assert.ok([...result.monster].length <= 14);
    assert.equal(result.source, "maas");
    assert.equal(result.model.used, true);
  });
});
