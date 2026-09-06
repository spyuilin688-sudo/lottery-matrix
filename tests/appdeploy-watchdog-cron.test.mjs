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
const watchdogLeaseMigration = readFileSync(
  new URL('../supabase/migrations/20260904103000_add_matrix_watchdog_leases.sql', import.meta.url),
  'utf8',
);

test('AppDeploy owns one independent ten-minute Matrix watchdog', () => {
  assert.deepEqual(cron, [{
    name: 'matrix-independent-watchdog-v3',
    cron: '3/10 * * * *',
    handler: 'matrixIndependentWatchdog',
    timezone: 'Asia/Taipei',
  }]);
  assert.match(backend, /export const matrixIndependentWatchdog/);
});

test('Fantasy5 recovery keeps GitHub crawling separate from Railway analysis', () => {
  assert.match(watchdog, /snapshot\.lottery === '天天樂' \? 'github' : 'railway'/);
  assert.match(watchdog, /fantasy5-crawler\.yml/);
  assert.match(watchdog, /\/dispatches/);
  assert.doesNotMatch(watchdog, /California|SC888|LatestDrawSource/);
});

test('watchdog recoveries use one durable cross-host lease', () => {
  assert.match(watchdog, /claim_matrix_watchdog_lease/);
  assert.match(watchdogLeaseMigration, /on conflict \(lease_key\) do update/);
  assert.match(watchdogLeaseMigration, /expires_at <= now\(\)/);
  assert.match(watchdogLeaseMigration, /begin_matrix_watchdog_recovery/);
  assert.match(watchdogLeaseMigration, /renew_matrix_watchdog_recovery/);
  assert.match(watchdogLeaseMigration, /runner_id is null/);
  assert.match(
    watchdogLeaseMigration,
    /renew_matrix_watchdog_recovery[\s\S]*runner_id = p_runner_id\s+and expires_at > now\(\)/,
  );
  assert.doesNotMatch(
    watchdogLeaseMigration,
    /or public\.matrix_watchdog_leases\.owner_id/,
  );
});
