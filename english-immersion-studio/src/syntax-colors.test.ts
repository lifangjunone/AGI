import { describe, expect, it } from "vitest";
import { getSyntaxColorRole, getSyntaxRoleLabel } from "./syntax-colors";

describe("sentence structure colors", () => {
  it("maps core sentence roles to stable visual groups", () => {
    expect(getSyntaxColorRole("主语")).toBe("subject");
    expect(getSyntaxColorRole("核心谓语")).toBe("predicate");
    expect(getSyntaxColorRole("宾语/补充")).toBe("object");
    expect(getSyntaxColorRole("表语")).toBe("complement");
    expect(getSyntaxColorRole("状语/补充")).toBe("adverbial");
    expect(getSyntaxColorRole("疑问/助动")).toBe("question");
    expect(getSyntaxColorRole("引导/语境")).toBe("context");
  });

  it("uses concise learner-facing role labels", () => {
    expect(getSyntaxRoleLabel("宾语/补充")).toBe("宾语");
    expect(getSyntaxRoleLabel("状语/补充")).toBe("状语");
    expect(getSyntaxRoleLabel("寒暄/话语标记")).toBe("完整语块");
    expect(getSyntaxRoleLabel("主语")).toBe("主语");
  });
});
