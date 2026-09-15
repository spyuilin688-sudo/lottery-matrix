import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const svg = readFileSync('public/assets/lottery/header-explore-planet.svg', 'utf8');
const css = readFileSync('src/feature-page-adjustments.css', 'utf8');

test('Explore title card keeps one dedicated background asset', () => {
  assert.match(css, /data-product-header="Matrix 探索"[\s\S]*background-image:\s*url\("\/assets\/lottery\/header-explore-planet\.svg"\)/);
});

test('Explore planet stays inside the centered cover safe area', () => {
  assert.match(svg, /id="planetAtmosphere"/);
  assert.match(svg, /id="upperOrbit"/);
  assert.match(svg, /id="lowerOrbit"/);
  assert.match(svg, /id="rightStarFlare"/);
  assert.match(svg, /cx="786" cy="56" r="132"/);
});
