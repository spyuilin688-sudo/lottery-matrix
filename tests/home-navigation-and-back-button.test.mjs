import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const prototypeSource = await readFile(new URL("../src/Prototype.tsx", import.meta.url), "utf8");
const featurePagesSource = await readFile(new URL("../src/features/BrandHeader.tsx", import.meta.url), "utf8");
const headerCss = await readFile(new URL("../src/feature-pages.css", import.meta.url), "utf8");

test("首頁 Matrix 對照導向號碼對照單頁面", () => {
  assert.match(prototypeSource, /\{ label: "Matrix 對照", screen: "reference", image: HOME_ASSETS\.reference \}/);
  assert.match(prototypeSource, /HOME_SHORTCUTS\.map\(\(item\) => \([\s\S]*?onClick=\{\(\) => onNavigate\?\.\(item\.screen\)\}/);
});

// DESIGN.md shared BrandHeader migration: a 44px grid cell and a 22px arrow.
test("返回鍵由共用標題格線排列並維持 44px 觸控區與 22px 箭頭", () => {
  assert.match(featurePagesSource, /<button type="button" className="product-header__back" onClick=\{onBack\} aria-label="返回">/);
  assert.match(featurePagesSource, /const hasBack = showBack && Boolean\(onBack \|\| backHref\);/);
  assert.match(featurePagesSource, /<a className="product-header__back" href=\{backHref\} aria-label="返回">/);
  assert.match(headerCss, /\.product-header__frame\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*44px 56px minmax\(0, 1fr\) var\(--product-header-action-width, auto\);[^}]*grid-template-areas:\s*"back mark copy actions";/s);
  const backButtonRule = headerCss.match(/\.product-header__back\s*\{([^}]*)\}/s)?.[1] ?? "";
  assert.match(backButtonRule, /grid-area:\s*back;[^}]*width:\s*44px;[^}]*height:\s*44px;/s);
  assert.doesNotMatch(backButtonRule, /position: absolute|top:|left:|transform:|margin/);
  assert.match(headerCss, /\.product-header__back svg\s*\{[^}]*width:\s*22px;[^}]*height:\s*22px;/s);
});
