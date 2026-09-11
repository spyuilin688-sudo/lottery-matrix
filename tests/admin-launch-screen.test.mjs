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
const adminManifest = JSON.parse(
  readFileSync(
    new URL('../apps/admin/public/manifest.webmanifest', import.meta.url),
    'utf8',
  ),
);

test('admin keeps its PWA identity without a second in-page launch screen', () => {
  assert.doesNotMatch(adminIndex, /admin-launch-screen|admin-splash\.jpg/);
  assert.deepEqual(
    adminPublicFiles.filter((path) => /splash|launch|startup/i.test(path)),
    [],
  );
});

test('admin native PWA launch screen uses a pure black background', () => {
  assert.equal(adminManifest.background_color, '#000000');
  assert.equal(adminManifest.theme_color, '#000000');
});

test('admin installation bypasses stale native splash metadata', () => {
  assert.match(
    adminIndex,
    /<meta name="theme-color" content="#000000">/,
  );
  assert.match(
    adminIndex,
    /<link rel="manifest" href="\.\/manifest\.webmanifest\?v=20260911-3">/,
  );
  for (const icon of adminManifest.icons) {
    assert.match(icon.src, /\?v=20260911-3$/);
  }
});
