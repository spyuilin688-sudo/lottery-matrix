import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../src/responsive-feature-pages.css', import.meta.url), 'utf8');

test('歷史開獎的重設與篩選設定在右欄等高排列 [header migration]', () => {
  assert.match(css, /\.title-card-compact-actions\s*\{[^}]*width:\s*64px;[^}]*grid-auto-rows:\s*24px;[^}]*gap:\s*4px;/s);
});

