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

test('next draw row uses equal halves, full dividers and no bottom padding', () => {
  assert.match(css, /\.next-draw-info--embedded\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);[\s\S]*?padding:\s*0;[\s\S]*?align-items:\s*stretch;[\s\S]*?border-top:\s*1px solid rgba\(232, 177, 76, \.48\);/);
  assert.match(css, /\.next-draw-item\s*\{[\s\S]*?gap:\s*4px;[\s\S]*?padding-inline:\s*clamp\(6px, 2vw, 10px\);/);
  assert.match(css, /\.next-draw-item:last-child\s*\{[\s\S]*?border-inline-start:\s*1px solid rgba\(232, 177, 76, \.48\);/);
  assert.doesNotMatch(css, /\.next-draw-item:last-child\s*\{[^}]*padding-left:\s*16px;/s);
});

test('next draw date has no space before weekday parentheses', () => {
  assert.match(countdown, /return `\$\{value\("month"\)\}\/\$\{value\("day"\)\}\(\$\{weekday\}\) \$\{value\("hour"\)\}:\$\{value\("minute"\)\}`;/);
});

test('homepage brand header is the final 8px spacing owner for the 68 percent logo', () => {
  const brandHeader = lastRuleBody(css, '.home-screen .brand-header');
  const logo = lastRuleBody(css, '.home-screen .home-logo-image');

  assert.match(brandHeader, /display:\s*flex;/);
  assert.match(brandHeader, /padding-top:\s*8px;/);
  assert.match(logo, /width:\s*68%;/);
});
