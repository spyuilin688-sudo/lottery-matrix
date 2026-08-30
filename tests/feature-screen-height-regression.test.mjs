import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const mainSource = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
const featureCss = readFileSync(new URL("../src/feature-pages.css", import.meta.url), "utf8");
const heightCssUrl = new URL("../src/feature-screen-height.css", import.meta.url);

test("短內容功能頁填滿捲動視窗，但不全域強制所有捲動內容滿高", () => {
  assert.match(featureCss, /\.feature-screen\s*\{[\s\S]*?min-height:\s*100%;/);
  assert.match(mainSource, /import\s+["']\.\/feature-screen-height\.css["'];/);

  const heightCss = existsSync(heightCssUrl) ? readFileSync(heightCssUrl, "utf8") : "";
  assert.match(
    heightCss,
    /\.mobile-scroll-content:has\(>\s*\.feature-screen\)\s*\{[\s\S]*?min-height:\s*100%;[\s\S]*?\}/,
  );
  assert.doesNotMatch(heightCss, /(?:^|\n)\.mobile-scroll-content\s*\{[\s\S]*?min-height:\s*100%;/);
});
