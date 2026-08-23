import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/feature-pages.css', import.meta.url), 'utf8');

test('profile page uses one balanced responsive style source', () => {
  assert.equal((css.match(/^\.profile-card \{/gm) ?? []).length, 1);
  assert.equal((css.match(/^\.subscription-status-card \{/gm) ?? []).length, 1);
  assert.equal((css.match(/^\.profile-menu \{/gm) ?? []).length, 1);
  assert.ok(css.includes('grid-template-columns: auto minmax(0, 1fr) auto;'));
  assert.ok(css.includes('gap: clamp(8px, 3vw, 12px);'));
  assert.ok(css.includes('width: clamp(58px, 16.9vw, 66px);'));
  assert.ok(css.includes('grid-template-columns: clamp(44px, 12.3vw, 48px) minmax(0, 1.15fr) minmax(0, .85fr);'));
  assert.ok(css.includes('height: 44px;'));
  assert.ok(!css.includes('.profile-card { display: grid; min-height: 92px;'));
  assert.ok(!css.includes('.profile-card { grid-template-columns: 50px minmax(0, 1fr) auto;'));
  assert.ok(!css.includes('.profile-card { grid-template-columns: 58px minmax(0, 1fr) auto;'));
  assert.ok(!css.includes('.profile-mark'));
  assert.ok(!css.includes('.line-login-button'));
});
