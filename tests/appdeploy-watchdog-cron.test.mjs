import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const cron = JSON.parse(readFileSync(
  new URL('../apps/admin/cron.json', import.meta.url),
  'utf8',
));
const backend = readFileSync(
  new URL('../apps/admin/backend/index.ts', import.meta.url),
  'utf8',
);
const watchdog = readFileSync(
  new URL('../apps/admin/backend/watchdog.ts', import.meta.url),
  'utf8',
);

test('AppDeploy owns one independent five-minute Matrix watchdog', () => {
  assert.deepEqual(cron, [{
    name: 'matrix-independent-watchdog',
    cron: '3/5 * * * *',
    handler: 'matrixIndependentWatchdog',
    timezone: 'Asia/Taipei',
  }]);
  assert.match(backend, /export const matrixIndependentWatchdog/);
});

test('Fantasy5 recovery keeps GitHub crawling separate from Railway analysis', () => {
  assert.match(watchdog, /snapshot\.lottery === '天天樂' \? 'github' : 'railway'/);
  assert.match(watchdog, /fantasy5-crawler\.yml\/dispatches/);
  assert.doesNotMatch(watchdog, /California|SC888|LatestDrawSource/);
});
