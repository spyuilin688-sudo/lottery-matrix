import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const css = read('src/feature-pages.css');
const tokens = read('src/design-tokens.css');
const block = (text, selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = [...text.matchAll(new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]+)\\}`, 'g'))];
  assert.equal(matches.length, 1, `one canonical owner for ${selector}`);
  return matches[0][1];
};

test('PWA border tiers alias the approved homepage palette without changing it', () => {
  for (const [tier, source] of [['primary', 'bright'], ['secondary', 'gold'], ['tertiary', 'muted']]) {
    assert.ok(tokens.includes(`--pwa-frame-${tier}: var(--home-frame-${source});`));
  }
  for (const [name, value] of [['bright', '#f0d58c'], ['gold', '#d6b66f'], ['muted', '#8a713f'], ['radius', '8px']]) {
    assert.ok(tokens.includes(`--home-frame-${name}: ${value};`));
  }
  assert.match(tokens, /--pwa-frame-divider:\s*color-mix\(in srgb, var\(--home-frame-gold\) 18%, transparent\)/);
});

test('page title and merged settings header have one bright border, not two frames', () => {
  assert.match(block(css, '.product-header__frame'), /border:\s*var\(--product-header-frame-border-width, 1px\) solid var\(--pwa-frame-primary\)/);
  const card = block(css, '.product-header__settings-card');
  assert.match(card, /--product-header-frame-border-width:\s*0px/);
  assert.match(card, /border:\s*1px solid var\(--pwa-frame-primary\)/);
});

test('content panels have one shared standard frame without the old page-level duplicates', () => {
  const panel = block(css, '.panel');
  assert.match(panel, /border:\s*1px solid var\(--pwa-frame-secondary\)/);
  assert.match(panel, /border-radius:\s*var\(--pwa-frame-radius\)/);
  assert.match(panel, /box-shadow:\s*none/);
  assert.doesNotMatch(css, /\.matrix-explore-screen \.panel\s*\{/);
  assert.doesNotMatch(css, /\.profile-screen \.panel\s*\{/);
});

test('selects use a real thin frame instead of cut-corner pseudo layers', () => {
  const select = block(css, '.select-box, .native-select');
  assert.match(select, /border:\s*1px solid var\(--pwa-frame-tertiary\)/);
  assert.match(select, /border-radius:\s*var\(--pwa-frame-radius\)/);
  for (const file of ['src/feature-pages.css', 'src/responsive-feature-pages.css', 'src/matrix-explore-spacing.css', 'src/feature-page-adjustments.css']) {
    const text = read(file);
    assert.doesNotMatch(text, /\.select-box::(?:before|after)/, file);
    assert.doesNotMatch(text, /--select-tech-(?:cut|border-paint|frame-shadow|focus-shadow|surface-paint)/, file);
    assert.doesNotMatch(text, /\.notification-time-select[^\{]*::(?:before|after)/, file);
  }
});

test('CTA frame remains thin and decorative double-frame glow is removed', () => {
  const action = block(css, '.primary-action, .gold-button');
  assert.match(action, /border:\s*1px solid var\(--pwa-frame-primary\)/);
  assert.match(block(css, '.branded-explore-action'), /box-shadow:\s*none/);
  assert.doesNotMatch(css, /\.branded-explore-action::after\s*\{/);
  assert.doesNotMatch(css, /\.matrix-ticket::before\s*\{/);
});

test('tables distinguish the outer frame from their quieter internal dividers', () => {
  assert.match(block(css, '.reference-row'), /border-top:\s*1px solid var\(--pwa-frame-divider\)/);
  const tongxing = read('src/tongxing-compact.css');
  assert.match(block(tongxing, '.tongxing-screen .tongxing-result-group'), /border:\s*1px solid var\(--pwa-frame-secondary\)/);
  assert.match(block(tongxing, '.tongxing-screen .tongxing-table-row > span'), /border-left:\s*1px solid var\(--pwa-frame-divider\)/);
});

test('frame cleanup preserves activation panel geometry and dark notification utility surfaces', () => {
  const activation = block(css, '.activation-code-screen .panel');
  for (const rule of ['box-sizing: border-box', 'width: 100%', 'min-width: 0', 'margin-inline: auto']) assert.ok(activation.includes(rule));
  assert.doesNotMatch(activation, /border(?:-color|-radius)?:/);
  const notifications = read('src/feature-page-adjustments.css');
  assert.match(block(notifications, '.notifications-screen-v2 .notification-bulk-disable'), /background:\s*var\(--pwa-control-surface\)/);
});


test('requested PWA frame refinements remain canonical and scoped', () => {
  const explore = read('src/features/MatrixExplorePage.tsx');
  const spacing = read('src/matrix-explore-spacing.css');
  const validation = read('src/explore-result-preview.css');
  const homeSwitcher = read('src/homepage/lottery-switcher.css');
  const memberPages = read('src/features/MemberPages.tsx');

  assert.doesNotMatch(explore, /HistoryList/);
  assert.doesNotMatch(explore, /historyExpanded/);
  assert.match(css, /\.matrix-explore-screen:not\(\.matrix-tianheng-screen\):not\(\.matrix-tianyan-screen\) \.lottery-tabs,\s*\.matrix-card-body \.lottery-tabs/);
  assert.match(css, /--lottery-tab-selected-underline:\s*var\(--pwa-frame-secondary\)/);
  assert.match(spacing, /\.matrix-explore-main-screen \.advanced-row \{[\s\S]*?border-top:\s*1px solid var\(--pwa-frame-secondary\)/);
  assert.match(spacing, /\.matrix-tiangong-screen \.tiangong-general-settings \.tiangong-advanced-divider \{[\s\S]*?border-bottom:\s*1px solid var\(--pwa-frame-secondary\)/);
  assert.match(validation, /\.explore-validation-card \{[\s\S]*?border-top-color:\s*var\(--pwa-frame-secondary\)[\s\S]*?border-bottom-color:\s*var\(--pwa-frame-secondary\)/);
  assert.match(homeSwitcher, /var\(--home-frame-bright\) 55%, transparent/);
  assert.doesNotMatch(memberPages, /歡迎使用 樂彩 Matrix。<\/p>/);
  assert.match(memberPages, /歡迎使用 樂彩 Matrix<\/p>/);
  assert.match(css, /border-right-color:\s*var\(--pwa-frame-divider\)/);
});
