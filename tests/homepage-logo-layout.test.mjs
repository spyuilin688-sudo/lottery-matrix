import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import postcss from "postcss";
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

function declarations(selector) {
  const values = {};
  postcss.parse(css).walkRules(selector, (rule) => {
    rule.walkDecls((decl) => { values[decl.prop] = decl.value; });
  });
  return values;
}

test("首頁安全區只由頂部內距避讓一次", () => {
  const home = declarations(".home-screen");
  assert.equal(home.inset, "0");
  assert.equal(home["padding-top"], "var(--layout-safe-area-top)");
  assert.equal(declarations(".home-screen .mobile-scroll").top, "0");
});

test("Logo 容器自然佔位且圖片沒有負位移", () => {
  const header = declarations(".home-screen > .brand-header");
  const logo = declarations(".home-screen .home-logo-image");
  assert.equal(header.height, "auto");
  assert.equal(header["padding-top"], "8px");
  assert.equal(logo.height, "auto");
  assert.equal(logo.transform, undefined);
  assert.equal(logo.top, undefined);
  assert.equal(logo["margin-top"], undefined);
});

test("Logo 圖片下載前也以真實尺寸保留比例", () => {
  const image = source.match(/<img className="home-logo-image"[^>]+>/)?.[0] ?? "";
  assert.match(image, /width=\{2154\}/);
  assert.match(image, /height=\{634\}/);
});
