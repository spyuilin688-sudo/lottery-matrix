import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readLocalCss } from "./helpers/read-local-css.mjs";

const css = readLocalCss("src/homepage-repair.css");
const source = readFileSync(new URL("../src/Prototype.tsx", import.meta.url), "utf8");

test("首頁使用正式 matrixya 圖檔並維持 75% 流式尺寸", () => {
  assert.match(source, /logo:\s*"\/assets\/lottery\/functions\/matrixya\.png"/);
  assert.match(source, /<header className="brand-header home-logo-box"><img className="home-logo-image" src=\{HOME_ASSETS\.logo\}/);
  assert.match(css, /\.home-screen \.home-logo-image\s*\{[^}]*width:\s*75%;/s);
  assert.doesNotMatch(css, /HomeLogo\.svg|visibility:\s*hidden/);
});

test("首頁 Logo 不使用硬拉位移", () => {
  const logoRules = [...css.matchAll(/\.home-screen \.home-logo-image\s*\{[^}]*\}/gs)]
    .map(([rule]) => rule)
    .join("\n");
  assert.notEqual(logoRules, "");
  assert.doesNotMatch(logoRules, /translateY\(|top\s*:\s*-|margin(?:-[a-z]+)?\s*:\s*-/);
});
