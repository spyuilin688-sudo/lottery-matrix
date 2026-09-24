import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(
  new URL('../supabase/migrations/20260921222326_marksix_calendar_mwf_2300.sql', import.meta.url),
  'utf8',
);

test('Monday Wednesday Friday add only the 23:00 Taipei calendar check', () => {
  assert.match(source, /date_part\('isodow', local_now\.value\)::integer in \(1,3,5\)/);
  assert.match(source, /time '23:00'/);
  assert.match(source, /'0 15 \* \* 1,3,5'/);
  assert.match(source, /matrix-marksix-calendar-mwf-2300/);
});

test('Tuesday Thursday Saturday and Sunday keep the existing 16 check slots', () => {
  assert.match(source, /date_part\('isodow', local_now\.value\)::integer in \(2,4,6,7\)/);
  for (const time of [
    '12:00','14:00','16:00','16:45','17:15','17:45','18:15','18:45',
    '19:15','19:45','20:15','20:30','20:45','20:55','21:05','21:10',
  ]) assert.ok(source.includes(`time '${time}'`), time);
});

test('next-slot validity includes the new MWF 23:00 backup check', () => {
  assert.match(source, /days\.isodow in \(1,3,5\)/);
  assert.match(source, /backup_slots/);
  assert.match(source, /select min\(slot_at\)/);
});
