import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const visual = readFileSync(new URL("../src/homepage/visual-language.css", import.meta.url), "utf8");

test("Matrix Core 在既有細金框上只疊加低強度環流，不新增另一套 banner 覆寫", () => {
  assert.match(visual, /@property --matrix-core-frame-angle\s*\{[^}]*syntax:\s*"<angle>";[^}]*initial-value:\s*0deg;/s);
  assert.match(visual, /\.home-screen \.matrix-core-banner::before\s*\{[^}]*padding:\s*1px;[^}]*conic-gradient\([^}]*var\(--matrix-core-frame-angle\)[^}]*\)[^}]*animation:\s*matrix-core-frame-circulation 6\.4s linear infinite;/s);
  assert.match(visual, /@keyframes matrix-core-frame-circulation\s*\{[^}]*--matrix-core-frame-angle:\s*360deg;/s);
  assert.doesNotMatch(visual, /\.home-screen \.matrix-core-banner\s*\{/);
  assert.doesNotMatch(visual, /matrix-core-node/);
  assert.doesNotMatch(visual, /!important/);
});

test("Matrix Core 環流尊重 reduced-motion 並退回既有靜態細金框", () => {
  assert.match(visual, /@media \(prefers-reduced-motion:\s*reduce\)\s*\{[^}]*\.home-screen \.matrix-core-banner::before\s*\{[^}]*animation:\s*none;[^}]*opacity:\s*0;/s);
});
