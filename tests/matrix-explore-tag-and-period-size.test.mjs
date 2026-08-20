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

test("Matrix Explore 近10期只縮小資料列的期數數字", () => {
  assert.match(
    css,
    /\.matrix-explore-main-screen \.history-row:not\(\.history-head\) > :nth-child\(1\)\s*\{[^}]*font-size:\s*clamp\(\.5rem, 2\.2vw, \.5625rem\);/s,
  );
});
