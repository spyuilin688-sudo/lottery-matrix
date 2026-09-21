import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const target = new URL('../supabase/migrations/20260921190000_fixed_bet_reminder_cron.sql', import.meta.url);

function sql() { return fs.readFileSync(target, 'utf8'); }

test('bet reminders are generated only by fixed-time cron jobs', () => {
  const source = sql();
  assert.match(source, /notification_bet_reminders_tick/);
  assert.match(source, /matrix-notification-bet-0500-0730[\s\S]*0,30 21-23 \* \* \*/);
  assert.match(source, /matrix-notification-bet-0800[\s\S]*0,30,45 0 \* \* \*/);
  assert.match(source, /matrix-notification-bet-0900[\s\S]*0,10,20,25 1 \* \* \*/);
  assert.match(source, /matrix-notification-bet-1600-1830[\s\S]*0,30 8-10 \* \* \*/);
  assert.match(source, /matrix-notification-bet-1900[\s\S]*0,30,45 11 \* \* \*/);
  assert.match(source, /matrix-notification-bet-2000[\s\S]*0,10,20,25,30,45 12 \* \* \*/);
  assert.match(source, /matrix-notification-bet-2100[\s\S]*0,10,20,25 13 \* \* \*/);
});

test('minute pipeline no longer checks or generates time events', () => {
  const source = sql();
  const pipeline = source.match(/create or replace function private\.notification_pipeline_tick[\s\S]*?revoke all on function private\.notification_pipeline_tick/);
  assert.ok(pipeline);
  assert.match(pipeline[0], /notification_fanout_drain/);
  assert.doesNotMatch(pipeline[0], /notification_time_events_due|notification_time_events_tick/);
  assert.match(source, /drop function if exists private\.notification_time_events_due/);
});

test('database enforces the same fixed bet-time allowlist as the PWA', () => {
  const source = sql();
  assert.match(source, /notification_bet_times_valid/);
  assert.match(source, /notification_settings_bet_times_allowed/);
  for (const value of ['05:00','09:25','16:00','20:25','21:25']) assert.match(source, new RegExp(value.replace(':', '\\:')));
});
