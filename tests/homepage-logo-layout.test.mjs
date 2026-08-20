import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/Prototype.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/homepage-repair.css", import.meta.url), "utf8");
const logoSvg = readFileSync(new URL("../public/assets/lottery/functions/HomeLogo.svg", import.meta.url), "utf8");

test("首頁使用專用 Logo 視窗裁切，不改其他頁面正式 Logo", () => {
  assert.match(source, /logo:\s*"\/assets\/lottery\/functions\/HomeLogo\.svg"/);
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
