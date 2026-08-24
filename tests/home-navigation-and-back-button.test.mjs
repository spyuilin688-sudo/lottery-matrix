import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const prototypeSource = await readFile(new URL("../src/Prototype.tsx", import.meta.url), "utf8");
const featurePagesSource = await readFile(new URL("../src/FeaturePages.tsx", import.meta.url), "utf8");
const headerCss = await readFile(new URL("../src/brand-header-unify.css", import.meta.url), "utf8");

test("首頁號碼對照單導向號碼對照單頁面", () => {
  assert.match(prototypeSource, /\{ label: "號碼對照單", image: HOME_ASSETS\.reference \}/);
  assert.match(prototypeSource, /"號碼對照單": "reference"/);
});

test("返回鍵由父容器自然排列且維持指定尺寸", () => {
  assert.match(
    featurePagesSource,
    /<div className="back-button-slot">[\s\S]*?<button type="button" className="icon-button back-button" onClick=\{onBack\} aria-label="返回">/,
  );
  assert.match(headerCss, /\.feature-brand-row\s*\{[^}]*position:\s*relative;[^}]*display:\s*grid;[^}]*width:\s*100%;[^}]*grid-template-columns:\s*100%;/s);
  assert.match(headerCss, /\.back-button-slot\s*\{[^}]*grid-area:\s*1 \/ 1;[^}]*width:\s*44px;[^}]*height:\s*44px;[^}]*justify-self:\s*start;/s);
  assert.match(headerCss, /\.feature-brand-lockup\s*\{[^}]*grid-area:\s*1 \/ 1;[^}]*justify-self:\s*center;/s);
  const backButtonRule = headerCss.match(/\.feature-brand-header \.back-button\s*\{([^}]*)\}/s)?.[1] ?? "";
  assert.doesNotMatch(backButtonRule, /position: absolute|top:|left:|transform:|margin/);
  assert.match(backButtonRule, /width: 44px;[^}]*height: 44px;/s);
  assert.match(headerCss, /\.feature-brand-header \.back-button svg\s*\{[^}]*width: 40px;[^}]*height: 40px;/s);
});
