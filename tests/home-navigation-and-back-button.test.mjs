import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const prototypeSource = await readFile(new URL("../src/Prototype.tsx", import.meta.url), "utf8");
const featurePagesSource = await readFile(new URL("../src/FeaturePages.tsx", import.meta.url), "utf8");
const featurePagesCss = await readFile(new URL("../src/feature-pages.css", import.meta.url), "utf8");
const headerCss = await readFile(new URL("../src/brand-header-unify.css", import.meta.url), "utf8");
const overrideCss = await readFile(new URL("../src/project-overrides.css", import.meta.url), "utf8");

test("首頁號碼對照單導向號碼對照單頁面", () => {
  assert.match(prototypeSource, /\{ label: "號碼對照單", image: HOME_ASSETS\.reference \}/);
  assert.match(prototypeSource, /"號碼對照單": "reference"/);
});

test("返回鍵由父容器自然排列且維持指定尺寸", () => {
  assert.match(featurePagesSource, /className="back-button-slot"/);
  assert.match(headerCss, /\.feature-brand-row\s*\{[^}]*display: grid;[^}]*width: calc\(100% \+ 16px\);[^}]*grid-template-columns: 100%;/s);
  assert.match(headerCss, /\.feature-brand-lockup\s*\{[^}]*width: calc\(100% - 16px\) !important;/s);
  assert.match(headerCss, /\.back-button-slot\s*\{[^}]*height: 60px;[^}]*padding-top: 16px;/s);
  assert.doesNotMatch(overrideCss, /\.feature-brand-header:not\(\[data-compact='true'\]\) \.feature-brand-row/);
  assert.doesNotMatch(featurePagesCss, /\.feature-screen:not\(\.compact-feature-screen\) \.feature-brand-row/);
  const backButtonRule = headerCss.match(/\.feature-brand-header \.back-button\s*\{([^}]*)\}/s)?.[1] ?? "";
  assert.doesNotMatch(backButtonRule, /position: absolute|top:|left:|transform:|margin/);
  assert.match(backButtonRule, /width: 44px;[^}]*height: 44px;/s);
  assert.match(headerCss, /\.feature-brand-header \.back-button svg\s*\{[^}]*width: 40px;[^}]*height: 40px;/s);
});
