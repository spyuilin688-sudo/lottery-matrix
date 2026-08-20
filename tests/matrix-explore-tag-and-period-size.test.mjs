import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const featureCss = readFileSync(new URL("../src/feature-pages.css", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/matrix-explore-spacing.css", import.meta.url), "utf8");
const source = readFileSync(new URL("../src/FeaturePages.tsx", import.meta.url), "utf8");

test("Matrix Pro 與推薦標籤共用上移後的位置規則", () => {
  assert.match(source, /<em><LockClosedIcon \/>Matrix Pro<\/em>/);
  assert.match(source, /<em>推薦<\/em>/);
  assert.match(
    css,
    /\.matrix-explore-main-screen \.segmented button em\s*\{[^}]*position:\s*absolute;[^}]*top:\s*-\.5625rem;[^}]*right:\s*\.125rem;/s,
  );
});

test("Matrix Explore 近10期資料列的期數數字由單一 6–8px 響應式變數控制", () => {
  assert.doesNotMatch(featureCss, /--mx-history-issue-size:/);
  assert.match(css, /--mx-history-issue-size:\s*clamp\(6px, 2\.1vw, 8px\);/);
  const issueRule = css.match(/\.matrix-explore-main-screen \.history-row:not\(\.history-head\) > :nth-child\(1\)\s*\{([^}]*)\}/s);
  assert.ok(issueRule);
  assert.match(issueRule[1], /color:\s*#fff;[\s\S]*font-family:\s*inherit;[\s\S]*font-weight:\s*800;/);
  assert.doesNotMatch(issueRule[1], /font-size\s*:/);
});
