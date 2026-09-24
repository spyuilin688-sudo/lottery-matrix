import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(
  new URL('../supabase/migrations/20260921221415_marksix_calendar_dedicated_refresh.sql', import.meta.url),
  'utf8',
);

test('calendar validity follows the next scheduled check instead of a fixed 26 hours', () => {
  assert.match(source, /notification_draw_calendar_next_slot/);
  assert.match(source, /v_valid_until := v_next_slot \+ interval '5 minutes'/);
  assert.match(source, /next_attempt_at = v_next_slot/);
  assert.doesNotMatch(source, /v_now\+interval '26 hours'/);
});

test('calendar cron dispatches the dedicated admin route, never matrix-primary', () => {
  const refresh = source.match(
    /create or replace function private\.notification_draw_calendar_refresh_http_tick[\s\S]*?revoke all on function private\.notification_draw_calendar_refresh_http_tick/,
  );
  assert.ok(refresh);
  assert.match(refresh[0], /api\/internal\/marksix-calendar/);
  assert.doesNotMatch(refresh[0], /matrix-primary/);
  assert.doesNotMatch(refresh[0], /cycleDate/);
  assert.doesNotMatch(refresh[0], /lotteries/);
});

test('next slot keeps Tuesday Thursday Saturday and Sunday safety only', () => {
  assert.match(source, /date_part\('isodow', d\)::integer in \(2,4,6,7\)/);
  for (const time of [
    '12:00','14:00','16:00','16:45','17:15','17:45','18:15','18:45',
    '19:15','19:45','20:15','20:30','20:45','20:55','21:05','21:10',
  ]) assert.ok(source.includes(`time '${time}'`), time);
});
