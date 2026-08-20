import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync('src/homepage-repair.css', 'utf8');
const countdown = fs.readFileSync('src/countdown.mjs', 'utf8');

test('next draw row uses 2px bottom padding and 4px internal gaps', () => {
  assert.match(css, /\.next-draw-info--embedded\s*\{[\s\S]*?padding:\s*0 20px 2px;/);
  assert.match(css, /\.next-draw-item\s*\{[\s\S]*?gap:\s*4px;/);
});

test('next draw date has no space before weekday parentheses', () => {
  assert.match(countdown, /return `\$\{value\("month"\)\}\/\$\{value\("day"\)\}\(\$\{weekday\}\) \$\{value\("hour"\)\}:\$\{value\("minute"\)\}`;/);
});

test('homepage logo ancestors have no top spacing available to reduce', () => {
  assert.match(css, /\.home-screen \.lottery-screen\s*\{[\s\S]*?margin:\s*0;[\s\S]*?padding:\s*0 var\(--layout-page-inline\);/);
  assert.match(css, /\.home-screen \.brand-header\s*\{[\s\S]*?display:\s*flex;/);
});
