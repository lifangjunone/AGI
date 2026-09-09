import { marked } from "marked";

const colors = {
  ink: "#252525",
  muted: "#7c817d",
  accent: "#0c9b72",
  accentSoft: "#e9f7f1",
  line: "#dfe9e4"
};

const renderer = new marked.Renderer();
renderer.paragraph = function paragraph(token) {
  return `<p style="margin:0 0 18px;color:${colors.ink};font-size:15px;line-height:1.9;letter-spacing:.2px;text-align:left;">${this.parser.parseInline(token.tokens)}</p>`;
};
renderer.heading = function heading(token) {
  const text = this.parser.parseInline(token.tokens);
  if (token.depth === 1) return `<h1 style="margin:0 0 24px;color:${colors.ink};font-size:24px;line-height:1.35;font-weight:700;">${text}</h1>`;
  return `<h2 style="margin:34px 0 14px;padding-left:12px;border-left:4px solid ${colors.accent};color:${colors.ink};font-size:18px;line-height:1.5;font-weight:700;">${text}</h2>`;
};
renderer.blockquote = function blockquote(token) {
  return `<blockquote style="margin:24px 0;padding:16px 18px;border-left:4px solid ${colors.accent};background:${colors.accentSoft};color:#41655a;font-size:15px;line-height:1.85;">${this.parser.parse(token.tokens)}</blockquote>`;
};
renderer.list = function list(token) {
  const tag = token.ordered ? "ol" : "ul";
  const body = token.items.map((item) =>
    `<li style="padding-left:4px;margin:2px 0;">${this.parser.parse(item.tokens)}</li>`
  ).join("");
  return `<${tag} style="margin:10px 0 22px;padding-left:26px;color:${colors.ink};font-size:15px;line-height:2;">${body}</${tag}>`;
};
renderer.strong = function strong(token) {
  return `<strong style="color:${colors.accent};font-weight:700;">${this.parser.parseInline(token.tokens)}</strong>`;
};
renderer.hr = () => `<hr style="margin:30px 0;border:0;border-top:1px solid ${colors.line};">`;

marked.setOptions({
  renderer,
  gfm: true,
  breaks: false
});

export function parseFrontmatter(source) {
  const match = String(source).match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) throw new Error("Markdown 文章缺少 frontmatter");
  const metadata = {};
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator > 0) metadata[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return { metadata, markdown: match[2].trim() };
}

export function renderOfficialMarkdown(source) {
  const { metadata, markdown } = parseFrontmatter(source);
  const html = marked.parse(markdown);
  return {
    ...metadata,
    html: `<section style="padding:24px 18px 34px;background:#fff;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;color:${colors.ink};">${html}<p style="margin:30px 0 0;padding-top:18px;border-top:1px solid ${colors.line};color:${colors.muted};font-size:13px;line-height:1.7;">智助乖乖 · 把想法变成可发布的内容</p></section>`
  };
}
