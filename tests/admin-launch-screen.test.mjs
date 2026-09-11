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

test('admin native PWA launch screen uses the warm black-gold background', () => {
  assert.equal(adminManifest.background_color, '#1A0F00');
  assert.equal(adminManifest.theme_color, '#1A0F00');
});

test('admin installation bypasses stale native splash metadata', () => {
  assert.match(
    adminIndex,
    /<meta name="theme-color" content="#1A0F00">/,
  );
  assert.match(
    adminIndex,
    /<link rel="manifest" href="\.\/manifest\.webmanifest\?v=20260911-2">/,
  );
  for (const icon of adminManifest.icons) {
    assert.match(icon.src, /\?v=20260911-2$/);
  }
});
