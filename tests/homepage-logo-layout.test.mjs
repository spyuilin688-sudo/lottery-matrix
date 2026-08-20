import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../src/homepage-repair.css", import.meta.url), "utf8");
const logoSvg = readFileSync(new URL("../public/assets/lottery/functions/HomeLogo.svg", import.meta.url), "utf8");

test("首頁使用專用 Logo 視窗裁切並維持原本流式尺寸來源", () => {
  assert.match(css, /\.home-screen \.brand-header\s*\{[^}]*background:\s*url\("\/assets\/lottery\/functions\/HomeLogo\.svg"\) center \/ 75% auto no-repeat;/s);
  assert.match(css, /\.home-screen \.home-logo-image\s*\{[^}]*width:\s*75%;[^}]*visibility:\s*hidden;/s);
  assert.match(logoSvg, /viewBox="0 8 480 160"/);
  assert.match(logoSvg, /href="NewLogo\.png"/);
});

test("首頁 Logo 不使用硬拉位移", () => {
  const start = css.indexOf(".home-screen .home-logo-image");
  const end = css.indexOf(".home-screen .lottery-switcher", start);
  const logoRules = css.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(logoRules, /translateY\(|top\s*:\s*-|margin(?:-[a-z]+)?\s*:\s*-/);
});
