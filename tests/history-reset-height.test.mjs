import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const headerCss = readFileSync(new URL('../src/feature-pages.css', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/responsive-feature-pages.css', import.meta.url), 'utf8');

test('篩選設定維持標題控制尺寸，重設與設定區欄位等高', () => {
  assert.match(headerCss, /\.product-header__settings-toggle\s*\{[^}]*height:\s*24px;[^}]*border:\s*0;[^}]*font-size:\s*12px;/s);
  assert.match(css, /\.tool-settings-reset\s*\{[^}]*height:\s*26px;/s);
});

