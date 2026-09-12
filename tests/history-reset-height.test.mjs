import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../src/responsive-feature-pages.css', import.meta.url), 'utf8');

test('歷史開獎的重設與篩選設定依同一列高度伸展 [header migration]', () => {
  assert.match(css, /\.draw-history-screen \.history-title-actions,[\s\S]*?align-items:\s*stretch;/);
  assert.match(css, /\.draw-history-screen \.history-title-actions :is\(\.history-reset-trigger, \.history-filter-trigger\)\s*\{[^}]*align-self:\s*stretch;/s);
});

