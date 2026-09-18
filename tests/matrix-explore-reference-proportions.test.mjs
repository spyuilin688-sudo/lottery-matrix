import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync('src/feature-pages.css', 'utf8');

test('Matrix Explore main screen uses readable reference proportions without transform hacks', () => {
  assert.match(css, /\.matrix-explore-main-screen\s*\{[^}]*--mx-history-row-height:\s*58px/s);
  assert.match(css, /--mx-history-ball-size:\s*31px/);
  assert.match(css, /--mx-repeat-item-height:\s*64px/);
  assert.match(css, /--mx-result-row-height:\s*62px/);
  assert.match(css, /--mx-result-columns:\s*\.84fr \.72fr \.9fr 1\.08fr 1\.08fr 1\.18fr/);
  const root = css.match(/\.matrix-explore-main-screen\s*\{([^}]*)\}/s)?.[1] ?? '';
  assert.doesNotMatch(root, /!important|zoom\s*:|scale\(|translate\(|margin\s*:\s*-|margin-(?:top|right|bottom|left)\s*:\s*-/);
});
