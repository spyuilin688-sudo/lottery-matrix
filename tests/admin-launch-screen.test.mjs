import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

const adminIndex = readFileSync(
  new URL('../apps/admin/index.html', import.meta.url),
  'utf8',
);
const adminPublicFiles = readdirSync(
  new URL('../apps/admin/public/', import.meta.url),
  { recursive: true },
).map(String);

test('admin launch screen uses the single approved artwork', () => {
  assert.match(adminIndex, /<img src="\/admin\/admin-splash\.jpg"/);
  assert.doesNotMatch(adminIndex, /<picture\b|<video\b|srcset=/);
  assert.deepEqual(
    adminPublicFiles.filter((path) => /splash|launch|startup/i.test(path)),
    ['admin-splash.jpg'],
  );
});
