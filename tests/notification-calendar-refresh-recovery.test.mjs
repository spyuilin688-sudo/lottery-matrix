import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const target = new URL(
  '../supabase/migrations/20260921203045_notification_calendar_refresh_recovery.sql',
  import.meta.url,
);

function sql() {
  return fs.readFileSync(target, 'utf8');
}

test('Mark Six calendar refresh reuses the existing five-minute recovery path', () => {
  const source = sql();
  assert.match(source, /notification_draw_calendar_refresh_due/);
  assert.match(source, /notification_draw_calendar_refresh_http_tick/);
  assert.match(source, /create or replace function private\.notification_recovery_tick/);
  assert.match(source, /calendarRequestId/);
  assert.doesNotMatch(source, /cron\.schedule\(/);
});

test('refresh dispatch is due-driven and uses the existing single-lottery primary route', () => {
  const source = sql();
  assert.match(source, /last_success_at[\s\S]*Asia\/Taipei/);
  assert.match(source, /interval '15 minutes'/);
  assert.match(source, /interval '20 minutes'/);
  assert.match(source, /next_attempt_at > p_now/);
  assert.match(source, /lease_expires_at > p_now/);
  assert.match(source, /\/functions\/v1\/admin-api\/api\/internal\/matrix-primary/);
  assert.match(source, /jsonb_build_array\('六合彩'\)/);
});

test('member roles cannot execute the refresh helpers', () => {
  const source = sql();
  assert.match(
    source,
    /revoke all on function private\.notification_draw_calendar_refresh_due\(timestamptz\)[\s\S]*from public, anon, authenticated, service_role/,
  );
  assert.match(
    source,
    /revoke all on function private\.notification_draw_calendar_refresh_http_tick\(timestamptz\)[\s\S]*from public, anon, authenticated, service_role/,
  );
});
