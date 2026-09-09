import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { renderOfficialMarkdown } from "../lib/official-account-markdown.mjs";

test("renders the first official-account Markdown article as styled WeChat HTML", async () => {
  const source = await readFile(
    new URL("../content/official-account/001-normal-product-7-videos.md", import.meta.url),
    "utf8"
  );
  const article = await renderOfficialMarkdown(source, {
    rootDirectory: new URL("..", import.meta.url).pathname
  });
  assert.equal(article.title, "我把一个普通商品拆成7条视频，第3条最容易带来咨询");
  assert.equal(article.imageCount, 3);
  assert.match(article.html, /<h2/);
  assert.match(article.html, /<ol/);
  assert.match(article.html, /<img/);
  assert.match(article.html, /border-left:4px solid/);
  assert.doesNotMatch(article.html, /\[object Object\]/);
});
