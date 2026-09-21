import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const target = new URL(
  '../supabase/migrations/20260922053500_marksix_calendar_tue_thu_sat.sql',
  import.meta.url,
);

const source = fs.readFileSync(target, 'utf8');

test('Mark Six calendar checks are limited to Tuesday Thursday and Saturday', () => {
  assert.match(source, /extract\(isodow from local_now\.value\)::integer in \(2,4,6\)/);
  for (const schedule of [
    '0 4,6,8 * * 2,4,6',
    '45 8-12 * * 2,4,6',
    '15 9-12 * * 2,4,6',
    '30 12 * * 2,4,6',
    '55 12 * * 2,4,6',
    '5,10 13 * * 2,4,6',
  ]) {
    assert.ok(source.includes(`'${schedule}'`), schedule);
  }
});

test('same six Mark Six calendar jobs are replaced instead of duplicated', () => {
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
