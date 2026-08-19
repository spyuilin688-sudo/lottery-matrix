import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const prototype = fs.readFileSync('src/Prototype.tsx','utf8');
const featurePages = fs.readFileSync('src/FeaturePages.tsx','utf8');
const homeCss = fs.readFileSync('src/homepage-repair.css','utf8');
const tongCss = fs.readFileSync('src/tongxing-compact.css','utf8');
const exploreCss = fs.readFileSync('src/matrix-explore-spacing.css','utf8');

test('homepage removes draw-toolbar wrapper and halves next draw row height',()=>{
  assert.doesNotMatch(prototype,/className="draw-toolbar"/);
  assert.match(homeCss,/grid-template-rows:\s*44px minmax\(0, 1fr\) 24px;/);
  assert.match(homeCss,/\.next-draw-info--embedded\s*\{[\s\S]*?height:\s*24px;[\s\S]*?min-height:\s*24px;[\s\S]*?max-height:\s*24px;/);
  assert.match(homeCss,/\.next-draw-item\s*\{[\s\S]*?gap:\s*0;/);
});

test('tongxing uses 8px left inset and 32px controls with explore option text size',()=>{
  assert.match(tongCss,/\.tongxing-screen \.feature-body\s*\{[\s\S]*?padding-left:\s*8px;/);
  assert.match(tongCss,/--control-height:\s*32px;/);
  const exploreFont = exploreCss.match(/\.matrix-explore-main-screen \.native-select select\s*\{[\s\S]*?font-size:\s*([^;]+);/)?.[1]?.trim();
  assert.equal(exploreFont,'.75rem');
  assert.match(tongCss,/\.tongxing-screen \.query-selects select\s*\{[\s\S]*?font-size:\s*\.75rem;/);
  assert.match(tongCss,/\.tongxing-screen \.same-star-period-select select\s*\{[\s\S]*?font-size:\s*\.75rem;/);
});

test('tongxing collapsible recent draw heading omits order copy and title wrapper while non-collapsible history keeps existing heading',()=>{
  assert.match(featurePages,/const historyHeading = collapsible\s*\?\s*<SectionTitle>近10期開獎號碼<\/SectionTitle>\s*:\s*\(/);
  assert.match(featurePages,/className="history-panel-title"/);
  assert.match(featurePages,/history-panel-order/);
});
