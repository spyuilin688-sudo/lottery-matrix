import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readLocalCss } from "./helpers/read-local-css.mjs";

const css = readLocalCss("src/homepage-repair.css");
const source = readFileSync(new URL("../src/Prototype.tsx", import.meta.url), "utf8");

test("首頁使用正式 MatrixLogo 圖檔並以放大 5% 後的流式尺寸呈現", () => {
  assert.match(source, /logo:\s*"\/assets\/lottery\/functions\/MatrixLogo\.png"/);
  assert.match(source, /<header className="brand-header home-logo-box"><img className="home-logo-image" src=\{HOME_ASSETS\.logo\}/);
  assert.match(css, /\.home-screen \.home-logo-image\s*\{[^}]*width:\s*91\.9632%;/s);
  assert.doesNotMatch(css, /HomeLogo\.svg/);
  const logoRules = [...css.matchAll(/[^{}]*\.home-logo-image[^{}]*\{[^}]*\}/gs)].map(([rule]) => rule).join("\n");
  assert.doesNotMatch(logoRules, /visibility:\s*hidden/);
});

test("首頁 Logo 依確認上移 16px，保留原本佔位與下方內容位置", () => {
  const logoRules = [...css.matchAll(/\.home-screen \.home-logo-image\s*\{[^}]*\}/gs)]
    .map(([rule]) => rule)
    .join("\n");
  assert.notEqual(logoRules, "");
  assert.match(logoRules, /transform:\s*translateY\(-16px\);/);
  assert.doesNotMatch(logoRules, /top\s*:\s*-|margin(?:-[a-z]+)?\s*:\s*-/);
});
