import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../src/responsive-feature-pages.css', import.meta.url), 'utf8');

test('歷史開獎的重設與篩選設定依同一列高度伸展', () => {
  assert.match(
    css,
    /\.draw-history-screen \.matrix-title-banner-actions \.history-title-actions\s*\{[^}]*align-items:\s*stretch;/s,
  );
  assert.match(
    css,
    /\.draw-history-screen \.history-title-actions :is\(\.history-reset-trigger, \.history-filter-trigger\)\s*\{[^}]*align-self:\s*stretch;/s,
  );
});
