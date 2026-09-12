import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('core lottery tabs reuse the existing state setters outside the settings card', () => {
  for (const [path, setter] of [['src/features/MatrixExplorePage.tsx', 'changeLottery'], ['src/features/MatrixTiangongPage.tsx', 'setLottery']]) {
    const source = read(path);
    assert.ok(source.includes(`<LotteryTabs selected={lottery} onChange={${setter}} variant="core" />`));
    assert.ok(source.indexOf('<LotteryTabs') < source.indexOf('<section className="panel explore-settings'));
    assert.doesNotMatch(source, /<select\s+aria-label="(?:彩種|彩球類型)"/);
  }
  const source = read('src/features/MatrixExplorePage.tsx');
  assert.match(source, /!isTianheng \? <div className="explore-hit-settings">\{hitSettings\}<\/div>/);
  assert.match(source, /isTianheng \? \(\s*<section className="panel hit-advanced-panel">\s*<SectionTitle>命中條件/);
  assert.match(source, /onClick=\{\(\) => changeHit\(v\)\}/);
  assert.match(source, /onClick=\{\(\) => setAdvanced\(!advanced\)\}/);
});

test('one outer gap keeps normal and floating settings 8px below the frame', () => {
  const css = read('src/feature-pages.css');
  const header = css.match(/\.product-header\s*\{[^}]*\}/s)[0];
  assert.match(header, /padding:\s*0 var\(--layout-page-inline\);/);
  assert.match(header, /margin-bottom:\s*8px;/);
  assert.doesNotMatch(read('src/feature-page-adjustments.css'), /padding-block-start:\s*4px;/);
  assert.doesNotMatch(read('src/explore-result-preview.css'), /padding:\s*8px var\(--layout-page-inline\)/);
  for (const path of ['src/FeaturePagesCore.tsx','src/features/LegacyHistoryPage.tsx','src/features/LegacyTongXingPage.tsx','src/features/NumberReferencePage.tsx']) {
    assert.match(read(path), /header\?\.getBoundingClientRect\(\)\.bottom \?\? 0\) \+ 8/);
  }
});

test('core controls shrink without changing their type and use the requested backgrounds', () => {
  const css = read('src/feature-pages.css');
  assert.match(css, /\.matrix-page-switcher\s*\{[^}]*height:\s*28px;/s);
  assert.doesNotMatch(css, /\.matrix-tiangong-screen \.tiangong-settings \.tiangong-setting-row \.segmented button\s*\{[^}]*(?:min-)?height:/s);
  const spacing = read('src/matrix-explore-spacing.css');
  assert.match(spacing, /\.matrix-explore-main-screen \.segmented button,[^{]*\{[^}]*height:\s*20px;[^}]*font-size:\s*\.75rem;/s);
  assert.match(spacing, /\.matrix-explore-main-screen \.hit-options button\s*\{[^}]*height:\s*24px;/s);
  assert.match(css, /header-06-flow\.svg/);
  assert.match(css, /header-07-geometric\.svg/);
  for (const file of ['header-06-flow.svg','header-07-geometric.svg']) {
    const svg = read('public/assets/lottery/' + file);
    assert.match(svg, /<svg/);
    assert.doesNotMatch(svg, /<script|<image|<text|<foreignObject/);
  }
});
