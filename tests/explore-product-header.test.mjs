import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("one CSS owner fixes every frame to 68px with single-line fitted titles", async () => {
  const css = await readFile(new URL('../src/feature-pages.css', import.meta.url), 'utf8');
  const rules = (css.match(/\.product-header[^{}]*\{[^}]*\}/gs) ?? []).join('\n');
  assert.equal((css.match(/(?:^|\n)\.product-header__frame\s*\{/g) ?? []).length, 1);
  const frame = css.match(/\.product-header__frame\s*\{[^}]*\}/s)[0];
  assert.match(frame, /height:\s*68px;/);
  assert.match(frame, /width:\s*100%;/);
  assert.match(rules, /padding:\s*0 var\(--layout-page-inline\);[^}]*margin-bottom:\s*8px;/);
  assert.match(rules, /white-space:\s*nowrap;/);
  assert.match(rules, /container-type:\s*inline-size;/);
  assert.doesNotMatch(rules, /!important|translate|white-space:\s*normal/);
  assert.doesNotMatch(css, /matrix-title-banner|integrated-title-back|explore-product-header/);
});

test("all PWA header entry points use the same component and preserve no-back roots", async () => {
  const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
  const shared = await read('src/features/shared.tsx');
  const notification = await read('src/NotificationsPagePatched.tsx');
  for (const path of ['src/features/shared.tsx', 'src/FeaturePagesCore.tsx', 'src/NotificationsPagePatched.tsx', 'src/ExploreResultPreviewPage.tsx']) {
    const text = await read(path);
    assert.match(text, /<BrandHeader\b/);
    assert.doesNotMatch(text, /integrated-title-header|matrix-title-banner|MATRIX_TITLE_ARTWORK/);
  }
  assert.match(notification, /<BrandHeader title="通知" showBack=\{false\}/);
  assert.match(shared, /showBack=\{!logoOnlyHeader \|\| \(active === "我的" && backTarget === "profile"\) \|\| title === "Matrix 筆記本"\}/);
  assert.doesNotMatch(await read('src/Prototype.tsx'), /product-header|BrandHeader/);
});

test("header alignment stays fixed with absent back controls, actions and smaller titles", async () => {
  const css = await readFile(new URL('../src/feature-pages.css', import.meta.url), 'utf8');
  const frame = css.match(/\.product-header__frame\s*\{[^}]*\}/s)[0];
  assert.match(frame, /grid-template-areas:\s*"back mark copy actions";/);
  assert.doesNotMatch(frame, /grid-template-rows:/);
  assert.doesNotMatch(css, /\.product-header__frame\[data-(?:back|actions)=/);
  const title = css.match(/\.product-header__copy h1\s*\{[^}]*\}/s)[0];
  assert.match(title, /height:\s*22px;/);
  assert.match(title, /align-items:\s*baseline;/);
  const actions = await readFile(new URL('../src/responsive-feature-pages.css', import.meta.url), 'utf8');
  assert.match(actions, /\.title-card-compact-actions\s*\{[^}]*width:\s*60px;[^}]*grid-auto-rows:\s*20px;/s);
  assert.match(css, /\.product-header__copy h1::before\s*\{[^}]*height:\s*18px;/s);
});
