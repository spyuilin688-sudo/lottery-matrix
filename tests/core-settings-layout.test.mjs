import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('core lottery tabs reuse the existing state setters outside the settings card', () => {
  for (const [path, setter] of [['src/features/MatrixExplorePage.tsx', 'changeLottery'], ['src/features/MatrixTiangongPage.tsx', 'setLottery']]) {
    const source = read(path);
    assert.ok(source.includes(`<LotteryTabs selected={lottery} onChange={${setter}} />`));
    assert.ok(source.indexOf('<LotteryTabs') < source.indexOf('<section className="panel explore-settings'));
    assert.doesNotMatch(source, /<select\s+aria-label="(?:彩種|彩球類型)"/);
  }
  const source = read('src/features/MatrixExplorePage.tsx');
  assert.match(source, /<div className="explore-hit-settings">\{advancedSettings\}<\/div>/);
  assert.doesNotMatch(source, /hit-advanced-panel|<SectionTitle>命中條件/);
  assert.match(source, /className="explore-condition-row" role="group" aria-label=\{`\$\{settingsName\}條件`\}/);
  assert.match(source, /<SettingLabelIcon type="condition" \/>\{settingsName\}條件/);
  assert.match(source, /onClick=\{\(\) => changeHit\(v\)\}/);
  assert.match(source, /onClick=\{\(\) => setAdvanced\(!advanced\)\}/);
});

test('shared title gap and integrated settings use the same header owner', () => {
  const css = read('src/feature-pages.css');
  const header = css.match(/\.product-header\s*\{[^}]*\}/s)[0];
  assert.match(header, /padding:\s*0 var\(--layout-page-inline\);/);
  assert.match(header, /margin-bottom:\s*var\(--layout-section-gap\);/);
  assert.doesNotMatch(read('src/feature-page-adjustments.css'), /padding-block-start:\s*4px;/);
  assert.doesNotMatch(read('src/explore-result-preview.css'), /padding:\s*8px var\(--layout-page-inline\)/);
  // DESIGN: active tools render settings inside BrandHeader, including floating state.
  for (const [path, ids] of [['src/FeaturePagesCore.tsx', ['history', 'tongxing']], ['src/features/NumberReferencePage.tsx', ['reference']]]) {
    const source = read(path);
    for (const id of ids) assert.ok(source.includes(`headerSettings={{ id: "${id}-header-settings"`));
    assert.doesNotMatch(source, /header\?\.getBoundingClientRect|set(?:Filter|Settings|Query)PanelTop|<MobilePagePortal/);
  }
  assert.match(css, /\.product-header__settings-card\[data-floating="true"\]\s*\{[^}]*position:\s*absolute;[^}]*top:\s*0;[^}]*inset-inline:\s*var\(--layout-page-inline\);/s);
});

test('core controls shrink without changing their type and use the requested backgrounds', () => {
  const css = read('src/feature-pages.css');
  assert.match(css, /\.matrix-page-switcher\s*\{[^}]*height:\s*26px;/s);
  assert.doesNotMatch(css, /\.matrix-tiangong-screen \.tiangong-settings \.tiangong-setting-row \.segmented button\s*\{[^}]*(?:min-)?height:/s);
  const spacing = read('src/matrix-explore-spacing.css');
  assert.match(spacing, /\.matrix-explore-main-screen \.segmented button,[^{]*\{[^}]*height:\s*20px;[^}]*font-size:\s*\.75rem;/s);
  assert.match(spacing, /\.matrix-explore-main-screen \.hit-options\s*\{[^}]*height:\s*20px;[^}]*margin:\s*0;/s);
  assert.match(spacing, /\.matrix-explore-main-screen \.explore-condition-row > \.hit-options,[^{]*\{[^}]*flex:\s*1 1 0;/s);
  // DESIGN 2026-09-19: each approved background now has a canonical WebP source.
  for (const [title, file] of [['Matrix 探索', 'explore'], ['Matrix 天衡', 'tianheng'], ['Matrix 天樞', 'tianshu'], ['Matrix 天衍', 'tianyan'], ['Matrix 天工', 'tiangong'], ['我的', 'profile']]) {
    const selector = `.product-header[data-product-header="${title}"]`;
    const body = css.slice(css.indexOf(selector)).split('}')[0];
    assert.ok(body.includes(`--product-header-background: url("/assets/lottery/headers/${file}.webp");`));
    const image = readFileSync(new URL(`../public/assets/lottery/headers/${file}.webp`, import.meta.url));
    assert.equal(image.toString('ascii', 0, 4), 'RIFF');
    assert.equal(image.toString('ascii', 8, 12), 'WEBP');
  }
  assert.doesNotMatch(css, /header-0[67]-(?:flow|geometric)\.svg/);
});
