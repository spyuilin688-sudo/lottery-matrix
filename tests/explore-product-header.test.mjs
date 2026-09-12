import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const shared = await readFile(new URL("../src/features/shared.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../src/feature-pages.css", import.meta.url), "utf8");

test("Matrix 探索改用產品型 Header，不再載入舊標題圖", () => {
  assert.doesNotMatch(shared, /"Matrix 探索":\s*"\/assets\/lottery\/functions\/探索標題K\.png"/);
  assert.match(shared, /title === "Matrix 探索" && !artwork && !hideTitle/);
  assert.match(shared, /className="explore-product-header"/);
  assert.match(shared, /\/assets\/lottery\/functions\/Matrix探索-icon\.png/);
  assert.match(shared, /<h1>MATRIX 探索<\/h1>/);
  assert.match(shared, />EXPLORE<\/span>/);
  assert.match(shared, /className="explore-product-header__back"/);
  assert.match(shared, /<ChevronLeftIcon aria-hidden="true" \/>/);
});

test("探索 Header 維持單一正式樣式來源，不以覆寫或 !important 補償", () => {
  assert.doesNotMatch(css, /\.matrix-explore-main-screen \.feature-brand-header\s*\{/);
  assert.equal((css.match(/(?:^|\n)\.explore-product-header\s*\{/g) ?? []).length, 1);
  assert.equal((css.match(/(?:^|\n)\.explore-product-header__frame\s*\{/g) ?? []).length, 1);

  const productHeaderRules = (css.match(/\.explore-product-header[^\{]*\{[^}]*\}/gs) ?? []).join("\n");
  assert.ok(productHeaderRules.length > 0);
  assert.doesNotMatch(productHeaderRules, /!important/);
  assert.doesNotMatch(productHeaderRules, /translate[XY]?\([^)]*[+-]\d+px/);
  assert.match(productHeaderRules, /width:\s*42px;/);
  assert.match(productHeaderRules, /height:\s*42px;/);
});
