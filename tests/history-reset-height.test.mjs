import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../src/responsive-feature-pages.css', import.meta.url), 'utf8');

test('篩選設定維持標題控制尺寸，重設與設定區欄位等高', () => {
  assert.match(css, /\.title-card-compact-actions\s*\{[^}]*width:\s*60px;[^}]*grid-auto-rows:\s*20px;[^}]*gap:\s*4px;/s);
  assert.match(css, /\.tool-settings-reset\s*\{[^}]*height:\s*26px;/s);
});

