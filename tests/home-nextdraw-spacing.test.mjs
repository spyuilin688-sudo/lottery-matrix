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

test('next draw row uses two rounded reference containers with no parent divider', () => {
  assert.match(css, /\.next-draw-info--embedded\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);[\s\S]*?padding:\s*0;[\s\S]*?gap:\s*0\.5px;[\s\S]*?border:\s*0;[\s\S]*?background:\s*transparent;/);
  assert.match(css, /\.next-draw-item\s*\{[\s\S]*?gap:\s*0\.5px;[\s\S]*?padding-inline:\s*0;[\s\S]*?border:\s*1px solid rgba\(232, 177, 76, \.52\);[\s\S]*?border-radius:\s*10px;/);
  assert.doesNotMatch(css, /\.next-draw-info--embedded\s*\{[^}]*border-top\s*:/s);
  assert.doesNotMatch(css, /\.next-draw-item:last-child\s*\{[^}]*border-inline-start\s*:/s);
});

test('next draw date has no space before weekday parentheses', () => {
  assert.match(countdown, /return `\$\{value\("month"\)\}\/\$\{value\("day"\)\}\(\$\{weekday\}\) \$\{value\("hour"\)\}:\$\{value\("minute"\)\}`;/);
});

test('homepage brand header is the final 8px spacing owner for the reduced logo', () => {
  const brandHeader = lastRuleBody(css, '.home-screen .brand-header');
  const logo = lastRuleBody(css, '.home-screen .home-logo-image');

  assert.match(brandHeader, /display:\s*flex;/);
  assert.match(brandHeader, /padding-top:\s*8px;/);
  assert.match(logo, /width:\s*87\.584%;/);
});
