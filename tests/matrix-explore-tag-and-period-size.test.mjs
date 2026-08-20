import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

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

test("Matrix Explore 近10期資料列的期數數字放大並加粗", () => {
  assert.match(
    css,
    /\.matrix-explore-main-screen \.history-row:not\(\.history-head\) > :nth-child\(1\)\s*\{[^}]*font-size:\s*clamp\(\.5625rem, 2\.5vw, \.625rem\);[^}]*font-weight:\s*800;/s,
  );
});
