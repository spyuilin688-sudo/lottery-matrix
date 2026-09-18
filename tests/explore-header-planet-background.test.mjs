import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const svg = readFileSync('public/assets/lottery/header-explore-planet.svg', 'utf8');
const css = readFileSync('src/feature-page-adjustments.css', 'utf8');

test('Explore title card keeps one dedicated background asset', () => {
  assert.match(css, /data-product-header="Matrix 探索"[\s\S]*background-image:\s*url\("\/assets\/lottery\/header-explore-planet\.svg"\)/);
});

test('Explore planet uses cinematic textured lighting instead of schematic globe lines', () => {
  assert.match(svg, /id="planetSurfaceTexture"/);
  assert.match(svg, /id="planetLimbGlow"/);
  assert.match(svg, /id="heroOrbitGlow"/);
  assert.match(svg, /type="fractalNoise"[^>]*baseFrequency="\.035 \.09"/);
  assert.match(svg, /cx="786" cy="56" r="132"/);
  assert.doesNotMatch(svg, /M650 7C699 -6 759 -3 844 17/);
  assert.doesNotMatch(svg, /M686 -22C665 20 655 66 666 118/);
});
