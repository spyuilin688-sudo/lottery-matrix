import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readLocalCss } from './helpers/read-local-css.mjs';

const css = readLocalCss('src/homepage-repair.css');
const countdown = fs.readFileSync('src/countdown.mjs', 'utf8');

function lastRuleBody(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...source.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'gs'))].at(-1)?.[1] ?? '';
}

test('next draw row uses two seamless octagon containers with no parent divider', () => {
  assert.match(css, /\.next-draw-info--embedded\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);[\s\S]*?padding:\s*0;[\s\S]*?gap:\s*0;[\s\S]*?border:\s*0;[\s\S]*?background:\s*transparent;/);
  assert.match(css, /\.next-draw-item\s*\{[\s\S]*?gap:\s*4px;[\s\S]*?padding-inline:\s*clamp\(6px, 2vw, 10px\);[\s\S]*?border:\s*0;[\s\S]*?border-radius:\s*0;/);
  assert.match(css, /\.next-draw-item::before\s*\{[^}]*background:\s*var\(--home-octagon-frame\);/s);
  assert.doesNotMatch(css, /\.next-draw-info--embedded\s*\{[^}]*border-top\s*:/s);
  assert.doesNotMatch(css, /\.next-draw-item:last-child\s*\{[^}]*border-inline-start\s*:/s);
});

test('next draw date has no space before weekday parentheses', () => {
  assert.match(countdown, /return `\$\{value\("month"\)\}\/\$\{value\("day"\)\}\(\$\{weekday\}\) \$\{value\("hour"\)\}:\$\{value\("minute"\)\}`;/);
});

test('homepage brand header keeps flex layout with the final responsive logo gap', () => {
  const brandHeader = lastRuleBody(css, '.home-screen .brand-header');
  const logo = lastRuleBody(css, '.home-screen .home-logo-image');

  assert.match(css, /\.home-screen \.brand-header\s*\{[^}]*display:\s*flex;/s);
  assert.match(brandHeader, /padding-top:\s*clamp\(8px,\s*1dvh,\s*12px\);/);
  assert.match(logo, /width:\s*87\.584%;/);
});
