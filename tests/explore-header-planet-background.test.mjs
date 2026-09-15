import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const svg = readFileSync('public/assets/lottery/header-explore-planet.svg', 'utf8');
const backgroundCss = readFileSync('src/feature-page-adjustments.css', 'utf8');
const headerCss = readFileSync('src/explore-header-reference.css', 'utf8');

test('Explore title card keeps one dedicated background asset and reference-like compact geometry', () => {
  assert.match(backgroundCss, /data-product-header="Matrix 探索"[\s\S]*background-image:\s*url\("\/assets\/lottery\/header-explore-planet\.svg"\)/);
  assert.match(headerCss, /data-product-header="Matrix 探索"[\s\S]*aspect-ratio:\s*6\.65\s*\/\s*1/);
  assert.match(headerCss, /data-product-header="Matrix 探索"[\s\S]*grid-template-columns:\s*40px\s+56px\s+minmax\(0,\s*1fr\)\s+auto/);
  assert.match(headerCss, /data-product-header="Matrix 探索"[\s\S]*column-gap:\s*6px/);
});

test('Explore cosmic background uses thin curved trails and a restrained right-edge planet', () => {
  assert.match(svg, /viewBox="0 0 800 120"/);
  assert.match(svg, /id="planetSurfaceTexture"/);
  assert.match(svg, /id="planetLimbGlow"/);
  assert.match(svg, /id="planetAtmosphere"/);
  assert.match(svg, /id="leftStarFlare"/);
  assert.match(svg, /id="rightStarFlare"/);
  assert.match(svg, /cx="846" cy="55" r="116"/);
  assert.doesNotMatch(svg, /id="heroOrbitGlow"/);
  assert.doesNotMatch(svg, /stroke-width="(?:[2-9]|[1-9][0-9])/);
  assert.doesNotMatch(svg, /data:image\//);
});
