import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readLocalCss } from './helpers/read-local-css.mjs';

const css = readLocalCss('src/homepage-repair.css');
const tokens = fs.readFileSync('src/design-tokens.css', 'utf8');

function blocks(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...source.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'gs'))].map((match) => match[1]);
}

function assertBlock(source, selector, pattern) {
  assert.ok(blocks(source, selector).some((body) => pattern.test(body)), `${selector} missing ${pattern}`);
}

function assertLastBlock(source, selector, pattern) {
  const body = blocks(source, selector).at(-1) ?? '';
  assert.match(body, pattern, `${selector} final rule missing ${pattern}`);
}

test('homepage brand header owns 8px top spacing and logo is reduced by 8 percent', () => {
  assertLastBlock(css, '.home-screen .brand-header', /padding-top:\s*8px;/);
  assertLastBlock(css, '.home-screen .home-logo-image', /width:\s*87\.584%;/);
});

test('homepage surfaces keep their independent responsive inline insets', () => {
  assert.match(tokens, /--layout-page-inline:\s*16px;/);
  assertBlock(css, '.home-screen .lottery-screen', /--layout-page-inline:\s*16px;/);
  assertBlock(css, '.home-screen .lottery-screen', /padding:\s*0;/);
  assertBlock(css, '.lottery-switcher--home-style', /width:\s*calc\(100% - 32px\);/);
  assertBlock(css, '.home-screen .latest-draw-card', /width:\s*calc\(100% - 24px\);/);
  assertBlock(css, '.home-screen .lottery-screen', /--home-gap-switcher-draw:\s*4px;/);
  assertLastBlock(css, '.lottery-switcher--home-style', /padding-inline:\s*0;/);
  assertLastBlock(css, '.lottery-switcher--home-style .lottery-switcher-hit-grid', /gap:\s*6px;/);
  assertBlock(css, '.home-screen .matrix-status-section', /width:\s*calc\(100% - 24px\);/);
});

test('home layout starts at the safe top and keeps the bottom navigation clearance', () => {
  assertBlock(css, '.home-screen .home-layout', /grid-template-rows:\s*auto auto;/);
  assertBlock(css, '.home-screen .home-layout', /align-content:\s*safe start;/);
  assertBlock(css, '.home-screen .home-layout', /padding-top:\s*var\(--layout-safe-area-top\);/);
  assertBlock(css, '.home-screen .home-layout', /padding-bottom:\s*var\(--layout-bottom-nav-clearance\);/);
  assertBlock(css, '.home-screen .home-bottom-group', /padding-bottom:\s*8px;/);
  assertBlock(css, '.home-screen .home-bottom-group', /height:\s*auto;/);
  assertBlock(css, '.home-screen .home-bottom-group', /min-height:\s*0;/);
  assertBlock(css, '.home-screen .home-bottom-group', /grid-template-rows:\s*auto auto;/);
});

test('embedded next draw info uses two independent rounded reference containers', () => {
  assertBlock(css, '.home-screen .latest-draw-card .next-draw-info--embedded', /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/);
  assertBlock(css, '.home-screen .latest-draw-card .next-draw-info--embedded', /padding:\s*0;/);
  assertBlock(css, '.home-screen .latest-draw-card .next-draw-info--embedded', /gap:\s*3px;/);
  assertBlock(css, '.home-screen .latest-draw-card .next-draw-info--embedded', /border:\s*0;/);
  assertBlock(css, '.home-screen .latest-draw-card .next-draw-info--embedded .next-draw-item', /border:\s*1px solid rgba\(232, 177, 76, \.52\);/);
  assertBlock(css, '.home-screen .latest-draw-card .next-draw-info--embedded .next-draw-icon', /width:\s*12px;/);
  assertBlock(css, '.home-screen .latest-draw-card .next-draw-info--embedded .next-draw-icon', /height:\s*12px;/);
  assertBlock(css, '.home-screen .latest-draw-card .next-draw-info--embedded .next-draw-label', /font-size:\s*11px;/);
  assertBlock(css, '.home-screen .latest-draw-card .next-draw-info--embedded .next-draw-value', /font-size:\s*11px;/);
});

test('Matrix Core keeps its 16px inset while five shortcuts use 8px outer margins and responsive 2 to 2.5px gaps', () => {
  assertBlock(css, '.home-screen .home-bottom-group', /--home-core-width:\s*calc\(min\(100vw, 390px\) - 32px\);/);
  assertBlock(css, '.home-screen .matrix-core-banner', /width:\s*var\(--home-core-width\);/);
  assertBlock(css, '.home-screen .home-shortcut-row', /width:\s*calc\(100% - 16px\);/);
  assertBlock(css, '.home-screen .home-shortcut-row', /column-gap:\s*clamp\(2px, \.64vw, 2\.5px\);/);
  assertBlock(css, '.home-screen .home-shortcut-row', /grid-template-columns:\s*repeat\(5, minmax\(0, 1fr\)\);/);
});
