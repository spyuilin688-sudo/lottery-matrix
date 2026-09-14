import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const base = read("src/homepage/base.css");
const logoSpacing = read("src/homepage/logo-spacing.css");
const prototype = read("src/prototype.css");

const ruleBody = (source, selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "s"));
  assert.ok(match, `${selector} rule must exist`);
  return match[1];
};

test("開獎期數前後文字為 10px，期數數字維持 13px", () => {
  const issue = ruleBody(base, ".home-screen .latest-draw-card .draw-issue");
  const issueNumber = ruleBody(base, ".home-screen .latest-draw-card .draw-issue strong");
  assert.match(issue, /font-size:\s*10px;/);
  assert.match(issueNumber, /font-size:\s*13px;/);
});

test("首頁設定齒輪為 18px 且位於標題卡右上角 4px", () => {
  const icon = ruleBody(prototype, ".header-settings-button svg");
  const position = ruleBody(logoSpacing, ".home-screen .home-brand-frame > .header-settings-button");
  assert.match(icon, /width:\s*18px;/);
  assert.match(icon, /height:\s*18px;/);
  assert.match(position, /top:\s*4px;/);
  assert.match(position, /right:\s*4px;/);
});

test("Matrix Core 上下間距共用同一個 9 至 12px 響應式規則", () => {
  const layout = ruleBody(base, ".home-screen .home-layout");
  assert.match(layout, /--home-gap-status-core:\s*clamp\(9px,\s*1\.35dvh,\s*12px\);/);
  assert.match(layout, /--home-gap-core-features:\s*var\(--home-gap-status-core\);/);
});

test("順球落球按鈕總高度縮減 3px 且文字仍為 12px", () => {
  const group = ruleBody(base, ".home-screen .latest-draw-card .draw-order");
  const button = ruleBody(base, ".home-screen .latest-draw-card .draw-order button");
  assert.match(group, /height:\s*22px;/);
  assert.match(button, /font-size:\s*12px;/);
});
