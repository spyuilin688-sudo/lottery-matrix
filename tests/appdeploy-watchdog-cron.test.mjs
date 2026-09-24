import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const backend = readFileSync(
  new URL('../apps/admin/backend/index.ts', import.meta.url),
  'utf8',
);
const watchdog = readFileSync(
  new URL('../apps/admin/backend/watchdog.ts', import.meta.url),
  'utf8',
);
const fantasy5Workflow = readFileSync(
  new URL('../.github/workflows/fantasy5-crawler.yml', import.meta.url),
  'utf8',
);
const watchdogLeaseMigration = readFileSync(
  new URL('../supabase/migrations/20260904104229_add_matrix_watchdog_leases.sql', import.meta.url),
  'utf8',
);

test('retired AppDeploy cron stays removed while the shared watchdog handler remains available to Supabase', () => {
  assert.equal(existsSync(new URL('../apps/admin/cron.json', import.meta.url)), false);
  assert.match(backend, /export async function matrixIndependentWatchdog/);
});

test('Fantasy5 watchdog recovery belongs to Railway while GitHub remains a manual backup', () => {
  // f00b8b8 routes stale Fantasy5 recovery to Railway; 79d4326 retired the Actions cron.
  assert.match(watchdog, /const crawlerTarget: WatchdogAction\['target'\] = 'railway';/);
  assert.match(watchdog, /add\(snapshot\.lottery, crawlerTarget, 'crawler-stale'\)/);
  assert.match(fantasy5Workflow, /workflow_dispatch:/);
  assert.doesNotMatch(fantasy5Workflow, /^\s+schedule:/m);
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
