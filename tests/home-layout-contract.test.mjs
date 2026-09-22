import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readLocalCss } from './helpers/read-local-css.mjs';

const css = readLocalCss('src/homepage-repair.css');
const tokens = fs.readFileSync('src/design-tokens.css', 'utf8');
const prototype = fs.readFileSync('src/Prototype.tsx', 'utf8');

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

test('homepage brand header owns an 8px top gap and the logo fills its canonical frame', () => {
  assertLastBlock(css, '.home-screen > .brand-header', /padding-top:\s*8px;/);
  assertLastBlock(css, '.home-screen .home-logo-image', /width:\s*100%;/);
  assertLastBlock(css, '.home-screen .home-brand-frame', /width:\s*calc\(100% - 32px\);/);
  assertLastBlock(css, '.home-screen .home-brand-frame', /border:\s*1px solid var\(--home-frame-gold\);/);
});

test('homepage surfaces keep their independent responsive inline insets', () => {
  assert.match(tokens, /--layout-page-inline:\s*16px;/);
  assertBlock(css, '.home-screen .lottery-screen', /--layout-page-inline:\s*16px;/);
  assertBlock(css, '.home-screen .lottery-screen', /padding:\s*0;/);
  assertBlock(css, '.home-screen .home-announcement', /width:\s*calc\(100% - 32px\);/);
  assertBlock(css, '.lottery-switcher--home-style', /width:\s*calc\(100% - 32px\);/);
  assertBlock(css, '.home-screen .latest-draw-card', /width:\s*calc\(100% - 32px\);/);
  assertBlock(css, '.home-screen .lottery-screen', /--home-gap-switcher-draw:\s*clamp\(4px,\s*calc\(0\.9dvh\s*\+\s*1px\),\s*7px\);/);
  assertLastBlock(css, '.lottery-switcher--home-style', /padding:\s*0;/);
  assertLastBlock(css, '.lottery-switcher--home-style .lottery-switcher-hit-grid', /gap:\s*8px;/);
  assertBlock(css, '.home-screen .matrix-status-section', /width:\s*calc\(100% - 32px\);/);
});

test('homepage announcement sits below the logo as a compact non-interactive marquee', () => {
  assertBlock(css, '.home-screen .lottery-screen', /--home-gap-logo-announcement:\s*clamp\(5px,\s*0\.8dvh,\s*8px\);/);
  assertBlock(css, '.home-screen .lottery-screen', /--home-gap-announcement-switcher:\s*clamp\(6px,\s*0\.9dvh,\s*8px\);/);
  assertBlock(css, '.home-screen .home-announcement', /height:\s*26px;/);
  assertBlock(css, '.home-screen .home-announcement', /min-height:\s*26px;/);
  assertBlock(css, '.home-screen .home-announcement', /margin-block-start:\s*var\(--home-gap-logo-announcement\);/);
  assertBlock(css, '.home-screen .home-announcement', /border:\s*1px solid var\(--home-frame-muted\);/);
  assertBlock(css, '.home-screen .home-announcement', /overflow:\s*hidden;/);
  assertBlock(css, '.home-screen .home-announcement-track', /animation:\s*home-announcement-marquee 18s linear infinite;/);
  assertBlock(css, '.home-screen .home-announcement-text', /color:\s*var\(--home-frame-gold\);/);
  assertBlock(css, '.home-screen .home-announcement-text', /font-family:\s*"Noto Sans TC",\s*system-ui,\s*sans-serif;/);
  assertBlock(css, '.home-screen .home-announcement-text', /font-size:\s*11px;/);
  assertBlock(css, '.home-screen .home-announcement-text', /font-weight:\s*600;/);
  assertBlock(css, '.home-screen .home-announcement-text', /letter-spacing:\s*\.02em;/);
  assertBlock(css, '.home-screen .home-announcement-lottery-name', /margin-inline:\s*1px;/);
  assertBlock(css, '.home-screen .lottery-switcher', /margin-block-start:\s*var\(--home-gap-announcement-switcher\);/);
  assert.match(css, /@keyframes\s+home-announcement-marquee\s*\{[\s\S]*?translateX\(100%\)[\s\S]*?translateX\(-100%\)[\s\S]*?\}/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.home-screen \.home-announcement-track\s*\{[^}]*animation:\s*none;/);
});

test('homepage requested responsive vertical gaps are owned by the existing canonical rules', () => {
  assertBlock(css, '.home-screen .lottery-screen', /--home-gap-draw-status:\s*clamp\(7px,\s*calc\(1\.15dvh\s*\+\s*1px\),\s*10px\);/);
  assertBlock(css, '.home-screen .home-layout', /--home-gap-status-core:\s*clamp\(7px,\s*1\.35dvh,\s*10px\);/);
  assertBlock(css, '.home-screen .home-layout', /--home-gap-core-features:\s*var\(--home-gap-status-core\);/);
  assert.ok(!blocks(css, '.home-screen .matrix-status-section').some((body) => /padding-block-start:\s*1\.5px;/.test(body)));
});

test('homepage free statement is completely removed from the current product source', () => {
  assert.doesNotMatch(prototype, /HomeFreeStatement/);
  assert.equal(fs.existsSync('src/homepage/HomeFreeStatement.tsx'), false);
  assert.equal(fs.existsSync('src/homepage/free-statement.css'), false);
  assert.equal(fs.existsSync('src/__tests__/HomeFreeStatement.test.tsx'), false);
});

test('homepage reserves a logo row above the existing native content scroller', () => {
  assertBlock(css, '.home-screen', /inset:\s*0;/);
  assertBlock(css, '.home-screen', /grid-template-rows:\s*auto minmax\(0, 1fr\);/);
  assertBlock(css, '.home-screen', /padding-top:\s*var\(--layout-safe-area-top\);/);
  assertBlock(css, '.home-screen > .home-content', /position:\s*relative;/);
  assertBlock(css, '.home-screen > .home-content', /min-height:\s*0;/);
  assertBlock(css, '.home-screen .mobile-scroll', /top:\s*0;/);
  assertBlock(css, '.home-screen .mobile-scroll', /overflow-y:\s*auto;/);
  assertBlock(css, '.home-screen .home-layout', /grid-template-rows:\s*auto auto;/);
  assertBlock(css, '.home-screen .home-layout', /align-content:\s*start;/);
  assertBlock(css, '.home-screen .home-layout', /padding-top:\s*0;/);
  assertBlock(css, '.home-screen .home-layout', /padding-bottom:\s*calc\(var\(--layout-bottom-nav-clearance\) \+ var\(--home-gap-features-nav\)\);/);
  assertBlock(css, '.home-screen .home-bottom-group', /align-self:\s*end;/);
  assert.ok(!blocks(css, '.home-screen .home-bottom-group').some((body) => /padding-bottom:\s*8px;/.test(body)));
  assertBlock(css, '.home-screen .home-bottom-group', /height:\s*auto;/);
  assertBlock(css, '.home-screen .home-bottom-group', /min-height:\s*0;/);
  assertBlock(css, '.home-screen .home-bottom-group', /grid-template-rows:\s*auto auto;/);
  assertBlock(css, '.home-screen .lottery-screen', /height:\s*100%;/);
  assertLastBlock(css, '.home-screen > .brand-header', /width:\s*min\(100%, 390px\);/);
});

test('wide viewport homepage keeps content in normal top flow instead of stretching it downward', () => {
  assert.match(css, /@media\s*\(min-width:\s*768px\)\s*\{[\s\S]*?\.home-screen \.home-layout\s*\{[\s\S]*?height:\s*auto;[\s\S]*?\}[\s\S]*?\.home-screen \.lottery-screen\s*\{[\s\S]*?height:\s*auto;[\s\S]*?\}[\s\S]*?\.home-screen \.home-bottom-group\s*\{[\s\S]*?align-self:\s*start;[\s\S]*?\}[\s\S]*?\}/);
});

test('embedded next draw info uses two independent rounded bright-gold containers', () => {
  assertBlock(css, '.home-screen .latest-draw-card .next-draw-info--embedded', /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/);
  assertBlock(css, '.home-screen .latest-draw-card .next-draw-info--embedded', /padding:\s*0;/);
  assertBlock(css, '.home-screen .latest-draw-card .next-draw-info--embedded', /gap:\s*0;/);
  assertBlock(css, '.home-screen .latest-draw-card .next-draw-info--embedded', /border:\s*0;/);
  assertBlock(css, '.home-screen .latest-draw-card .next-draw-info--embedded .next-draw-item', /border-radius:\s*var\(--home-frame-radius\);/);
  assertBlock(css, '.home-screen .latest-draw-card .next-draw-info--embedded .next-draw-item', /box-shadow:\s*inset 0 0 0 1px var\(--home-frame-bright\);/);
  assert.equal(blocks(css, '.home-screen .latest-draw-card .next-draw-info--embedded .next-draw-item::before').length, 0);
  assertBlock(css, '.home-screen .latest-draw-card .next-draw-info--embedded .next-draw-icon', /width:\s*12px;/);
  assertBlock(css, '.home-screen .latest-draw-card .next-draw-info--embedded .next-draw-icon', /height:\s*12px;/);
  assertBlock(css, '.home-screen .latest-draw-card .next-draw-info--embedded .next-draw-label', /font-size:\s*11px;/);
  assertBlock(css, '.home-screen .latest-draw-card .next-draw-info--embedded .next-draw-value', /font-size:\s*11px;/);
});

test('Matrix Core and four shortcuts share the 16px inset and equal columns', () => {
  assertBlock(css, '.home-screen .home-bottom-group', /--home-core-width:\s*calc\(min\(100vw, 390px\) - 32px\);/);
  assertBlock(css, '.home-screen .matrix-core-banner', /width:\s*var\(--home-core-width\);/);
  assertBlock(css, '.home-screen .home-shortcut-row', /width:\s*calc\(100% - var\(--home-feature-inline\) \* 2\);/);
  assertBlock(css, '.home-screen .home-shortcut-row', /gap:\s*var\(--home-feature-gap\);/);
  assertBlock(css, '.home-screen .home-shortcut-row', /grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\);/);
});
