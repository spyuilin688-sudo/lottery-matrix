import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const prototypeSource = await readFile(new URL("../src/Prototype.tsx", import.meta.url), "utf8");
const headerSource = await readFile(new URL("../src/features/BrandHeader.tsx", import.meta.url), "utf8");
const headerCss = await readFile(new URL("../src/feature-pages.css", import.meta.url), "utf8");

test("首頁號碼對照單導向號碼對照單頁面", () => {
  assert.match(prototypeSource, /\{ label: "Matrix 對照", screen: "reference", image: HOME_ASSETS\.reference \}/);
  assert.match(prototypeSource, /HOME_SHORTCUTS\.map\(\(item\) => \([\s\S]*?onClick=\{\(\) => onNavigate\?\.\(item\.screen\)\}/);
});

test("返回鍵由父容器自然排列且維持指定尺寸", () => {
  assert.match(
    headerSource,
    /<button type="button" className="product-header__back" onClick=\{onBack\} aria-label="返回">/,
  );
  assert.match(headerSource, /const hasBack = showBack && Boolean\(onBack \|\| backHref\);/);
  assert.match(headerSource, /<a className="product-header__back" href=\{backHref\} aria-label="返回">/);
  assert.match(headerCss, /\.product-header__frame\s*\{[^}]*display:\s*grid;[^}]*width:\s*100%;[^}]*grid-template-columns:\s*44px 56px minmax\(0, 1fr\) var\(--product-header-action-width, auto\);/s);
  const backButtonRule = headerCss.match(/\.product-header__back\s*\{([^}]*)\}/s)?.[1] ?? "";
  assert.match(backButtonRule, /grid-area:\s*back;/);
  assert.doesNotMatch(backButtonRule, /position:\s*absolute|top:|left:|transform:|margin/);
  assert.match(backButtonRule, /width: 44px;[^}]*height: 44px;/s);
  assert.match(headerCss, /\.product-header__back svg\s*\{[^}]*width:\s*22px;[^}]*height:\s*22px;/s);
  assert.match(headerCss, /\.product-header__back:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--lottery-gold-300\);/s);
});
