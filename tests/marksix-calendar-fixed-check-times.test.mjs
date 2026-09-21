import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const target = new URL(
  '../supabase/migrations/20260922052500_marksix_calendar_fixed_check_times.sql',
  import.meta.url,
);

const source = fs.readFileSync(target, 'utf8');

test('Mark Six calendar uses exactly the requested Taipei check times', () => {
  const expected = [
    '12:00','14:00','16:00',
    '16:45','17:15','17:45','18:15','18:45','19:15','19:45',
    '20:15','20:30','20:45','20:55','21:05','21:10',
  ];
  for (const value of expected) {
    assert.match(source, new RegExp(`time '${value}'`));
  }
  assert.equal((source.match(/time '\\d{2}:\\d{2}'/g) ?? []).length, expected.length);
});

test('UTC cron expressions expand to all 16 requested Taipei checks', () => {
  for (const schedule of [
    '0 4,6,8 * * *',
    '45 8-12 * * *',
    '15 9-12 * * *',
    '30 12 * * *',
    '55 12 * * *',
    '5,10 13 * * *',
  ]) {
    assert.ok(source.includes(`'${schedule}'`), schedule);
  }
  for (const job of [
    'matrix-marksix-calendar-midday',
    'matrix-marksix-calendar-45',
    'matrix-marksix-calendar-15',
    'matrix-marksix-calendar-2030',
    'matrix-marksix-calendar-2055',
    'matrix-marksix-calendar-2105-2110',
  ]) {
    assert.ok(source.includes(job), job);
  }
});

test('five-minute notification recovery no longer performs calendar checks', () => {
  const recovery = source.match(
    /create or replace function private\.notification_recovery_tick[\s\S]*?revoke all on function private\.notification_recovery_tick/,
  );
  assert.ok(recovery);
  assert.doesNotMatch(recovery[0], /notification_draw_calendar_refresh_http_tick/);
  assert.doesNotMatch(recovery[0], /calendarRequestId/);
});

test('scheduled acquire is fenced by slot completion and lease, not the old reminder scan', () => {
  const acquire = source.match(
    /create or replace function public\.notification_draw_calendar_acquire[\s\S]*?create or replace function private\.notification_draw_calendar_refresh_http_tick/,
  );
  assert.ok(acquire);
  assert.match(acquire[0], /notification_draw_calendar_scheduled_slot/);
  assert.match(acquire[0], /last_success_at >= v_slot/);
  assert.match(acquire[0], /lease_expires_at > v_now/);
  assert.doesNotMatch(acquire[0], /notification_settings/);
  assert.doesNotMatch(acquire[0], /20 minutes/);
});
