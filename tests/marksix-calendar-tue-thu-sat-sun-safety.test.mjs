// Historical schedule regression for the 20260922054000 migration only.
// Later migrations add the M/W/F 23:00 backup check.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const target = new URL(
  '../supabase/migrations/20260921213733_marksix_calendar_tue_thu_sat_sun_safety.sql',
  import.meta.url,
);

const source = fs.readFileSync(target, 'utf8');

test('Mark Six calendar checks run Tuesday Thursday Saturday plus Sunday safety', () => {
  assert.match(source, /date_part\('isodow', local_now\.value\)::integer in \(2,4,6,7\)/);
  for (const schedule of [
    '0 4,6,8 * * 0,2,4,6',
    '45 8-12 * * 0,2,4,6',
    '15 9-12 * * 0,2,4,6',
    '30 12 * * 0,2,4,6',
    '55 12 * * 0,2,4,6',
    '5,10 13 * * 0,2,4,6',
  ]) {
    assert.ok(source.includes(`'${schedule}'`), schedule);
  }
});

test('Monday Wednesday Friday remain excluded', () => {
  assert.doesNotMatch(source, /in \(1,2,3,4,5,6,7\)/);
  assert.doesNotMatch(source, /\* \* 1,3,5/);
});

test('same six calendar jobs are replaced, not duplicated', () => {
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
  assert.match(source, /cron\.unschedule\(v_job\.jobid\)/);
});
