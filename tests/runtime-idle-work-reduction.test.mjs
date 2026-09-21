import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = new URL('..', import.meta.url);
const migrationsDir = new URL('../supabase/migrations/', import.meta.url);
const migrationSource = fs.readdirSync(migrationsDir)
  .filter((name) => name.endsWith('.sql'))
  .sort()
  .map((name) => fs.readFileSync(new URL(name, migrationsDir), 'utf8'))
  .join('\n');
const playwright = fs.readFileSync(new URL('../playwright.config.ts', import.meta.url), 'utf8');
const runtimeVite = fs.readFileSync(new URL('../vite.runtime-tests.config.ts', import.meta.url), 'utf8');

test('notification pipeline skips the full member scan when no time event is due', () => {
  assert.match(migrationSource, /notification_time_events_due/);
  assert.match(migrationSource, /if private\.notification_time_events_due\(v_now\)/);
});

test('Pilio cron only runs inside the two Taipei result windows', () => {
  assert.match(migrationSource, /matrix-notification-pilio-minute[\s\S]*34-59 12,13 \* \* \*/);
  assert.match(migrationSource, /matrix-notification-pilio-window-boundary[\s\S]*0 13,14 \* \* \*/);
});

test('Playwright runtime never falls back to the production Railway API', () => {
  assert.match(playwright, /VITE_RAILWAY_API_BASE:\s*`http:\/\/127\.0\.0\.1:\$\{testPort\}`/);
  assert.match(runtimeVite, /matrix-runtime-api-fixture/);
  assert.match(runtimeVite, /\/api\/matrix\/latest\//);
  assert.doesNotMatch(runtimeVite, /heartfelt-generosity-production/);
});
