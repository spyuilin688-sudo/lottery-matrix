import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const target = new URL('../supabase/migrations/20260921184500_split_expiry_reminder_scan.sql', import.meta.url);

test('minute notification gate checks only configured bet reminders', () => {
  const sql = fs.readFileSync(target, 'utf8');
  const gate = sql.match(/create or replace function private\.notification_time_events_due[\s\S]*?revoke all on function private\.notification_time_events_due/);
  assert.ok(gate);
  assert.match(gate[0], /notification_settings_runtime_due_idx|settings @>/);
  assert.doesNotMatch(gate[0], /plan_expires_at|membership_expiry/);
});

test('expiry generation runs at Taipei midnight with one five-minute retry', () => {
  const sql = fs.readFileSync(target, 'utf8');
  assert.match(sql, /matrix-notification-expiry-daily/);
  assert.match(sql, /0,5 16 \* \* \*/);
  assert.match(sql, /notification_time_events_tick\(pg_catalog\.now\(\)\)/);
});
