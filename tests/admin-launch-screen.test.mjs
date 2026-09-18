import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL('../apps/admin/' + path, import.meta.url), 'utf8');
const html = read('index.html');
const manifest = JSON.parse(read('public/manifest.webmanifest'));

test('admin does not add a second in-page launch screen after the native PWA launch', () => {
  assert.doesNotMatch(html, /admin-launch|admin-splash|fetchpriority|\binert\b/);
  assert.deepEqual(
    readdirSync(new URL('../apps/admin/public/', import.meta.url)).filter(path => /launch|splash|startup/i.test(path)),
    [],
  );
  assert.match(html, /<div id="root"><\/div>/);
  assert.match(html, /src="\.\/src\/main\.tsx"/);
});

test('admin retains black native launch metadata and the supplied square install artwork', () => {
  assert.equal(manifest.background_color, '#000000');
  assert.equal(manifest.theme_color, '#000000');
  assert.equal(manifest.id, '/admin/');
  assert.equal(manifest.start_url, '/admin/');
  assert.equal(manifest.scope, '/admin/');
  assert.match(html, /<meta name="theme-color" content="#000000">/);
  assert.match(html, /href="\/admin\/icons\/admin-icon-20260912-192\.png"/);
  assert.match(html, /href="\/admin\/icons\/admin-icon-20260912-180\.png"/);
  for (const icon of manifest.icons) {
    assert.match(icon.src, /admin-icon-20260912-(192|512)\.png$/);
    assert.ok(existsSync(new URL('../apps/admin/public/' + icon.src.replace('/admin/', ''), import.meta.url)));
  }
});
