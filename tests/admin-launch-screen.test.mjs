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

test('admin keeps its PWA identity without a second in-page launch screen', () => {
  assert.doesNotMatch(adminIndex, /admin-launch-screen|admin-splash\.jpg/);
  assert.deepEqual(
    adminPublicFiles.filter((path) => /splash|launch|startup/i.test(path)),
    [],
  );
});
