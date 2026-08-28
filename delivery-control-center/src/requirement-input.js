function normalizeRequirementTitle(value) {
  const title = String(value || "").trim().replace(/\s+/g, " ");
  if (title.length < 2) throw new Error("项目名称至少需要 2 个字符");
  if (title.length > 60) throw new Error("项目名称不能超过 60 个字符");
  return title;
}

function deriveRequirementTitle(description) {
  const firstLine = description
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  const firstClause = String(firstLine || description)
    .split(/[。！？!?；;]/)[0]
    .replace(/^(我想|我需要|请|帮我|希望|需要)\s*/u, "")
    .trim();
  return (firstClause || "新产品需求").slice(0, 28);
}

function normalizeRequirementDescription(value) {
  const description = String(value || "").trim();
  if (description.length < 10) throw new Error("需求描述至少需要 10 个字符");
  if (description.length > 20000) {
    throw new Error("需求描述不能超过 20,000 个字符");
  }
  return description;
}

function buildTextRequirementAsset(input = {}, archivedAt = new Date()) {
  const description = normalizeRequirementDescription(input.description);
  const title = normalizeRequirementTitle(
    String(input.title || "").trim() || deriveRequirementTitle(description)
  );
  const content = [
    `# ${title}`,
    "",
    "> 输入方式：OneOPC 文字需求",
    `> 归档时间：${archivedAt.toISOString()}`,
    "",
    "## 原始需求描述",
    "",
    description,
    ""
  ].join("\n");

  return {
    title,
    description,
    name: "原始需求.md",
    content,
    preview: description.slice(0, 240)
  };
}

module.exports = {
  buildTextRequirementAsset,
  deriveRequirementTitle,
  normalizeRequirementDescription,
  normalizeRequirementTitle
};
