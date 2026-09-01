import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('requested draw surfaces remove the digit underline and keep other ball styling intact', () => {
  const css = read('src/number-ball.css');
  assert.match(css, /\.number-ball-value::after\s*\{[^}]*content:\s*"";/s);
  assert.match(css, /\.home-screen \.latest-draw-card \.number-ball-value::after,\s*\.matrix-explore-main-screen \.matrix-explore-history-panel \.number-ball-value::after,\s*\.draw-history-screen \.draw-history-panel \.number-ball-value::after\s*\{[^}]*content:\s*none;/s);
});

test('homepage history link moves two more pixels left without changing its vertical offset', () => {
  const css = read('src/homepage/base.css');
  assert.match(css, /\.home-screen \.latest-draw-card \.history-link\s*\{[^}]*transform:\s*translate\(-10px,\s*-16px\);/s);
});

test('notification controls use the approved compact spacing and larger option text', () => {
  const css = read('src/feature-page-adjustments.css');
  assert.match(css, /\.notifications-screen-v2 \.notification-heading\s*\{[^}]*padding:\s*4px 8px 4px 4px;/s);
  assert.match(css, /\.notifications-screen-v2 \.notification-time-select\s*\{[^}]*margin-inline:\s*8px;/s);
  assert.match(css, /\.notifications-screen-v2 \.notification-time-select select\s*\{[^}]*font-size:\s*clamp\(10px,\s*3vw,\s*12px\);/s);
  assert.match(css, /\.notifications-screen-v2 \.notification-grid-lottery-row label,\s*\.notifications-screen-v2 \.notification-grid-status-row label\s*\{[^}]*margin-inline:\s*8px;/s);
  assert.match(css, /\.notifications-screen-v2 input\[type="checkbox"\],[\s\S]*?width:\s*12px;[^}]*height:\s*12px;/s);
  assert.match(css, /\.notifications-screen-v2 \.notification-inline-option-row \.notification-choice\s*\{[^}]*padding:\s*6px 8px;[^}]*gap:\s*4px;/s);
});

test('Matrix status lottery labels have no checkbox and Matrix Pro is centered above the title', () => {
  const source = read('src/NotificationsPagePatched.tsx');
  const statusLotteryRow = source.match(/<div className="notification-grid-row notification-grid-lottery-row">([\s\S]*?)<\/div>/)?.[1] ?? '';
  assert.doesNotMatch(statusLotteryRow, /<input/);
  assert.match(statusLotteryRow, /notification-status-lottery-label/);

  const css = read('src/feature-page-adjustments.css');
  assert.match(source, /className="notification-icon-stack"/);
  assert.match(css, /\.notifications-screen-v2 \.notification-icon-stack\s*\{[^}]*display:\s*grid;[^}]*justify-items:\s*center;[^}]*gap:\s*1px;/s);
  assert.match(css, /\.notifications-screen-v2 \.notification-pro-badge\s*\{[^}]*padding:\s*0 1\.4px;[^}]*border:\s*\.7px solid #f6c95f;[^}]*font-size:\s*4\.2px;/s);
});
