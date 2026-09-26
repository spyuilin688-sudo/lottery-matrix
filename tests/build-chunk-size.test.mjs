import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const dist = path.resolve('dist');
const MAX_CHUNK_BYTES = 500_000;

for (const [name, directory] of [
  ['member PWA', 'assets'],
  ['admin', 'admin/assets'],
]) {
  test(`${name} JavaScript chunks stay within the 500 kB build threshold`, async () => {
    const assetDirectory = path.join(dist, directory);
    const jsFiles = (await readdir(assetDirectory)).filter(file => /\.m?js$/.test(file));
    assert.ok(jsFiles.length > 0, `missing ${name} JavaScript assets`);
    for (const file of jsFiles) {
      const { size } = await stat(path.join(assetDirectory, file));
      assert.ok(size <= MAX_CHUNK_BYTES, `${directory}/${file} is ${size} bytes`);
    }
  });
}

test('the PWA service worker precaches every JavaScript chunk, including deferred pages', async () => {
  const worker = await readFile(path.join(dist, 'push-service-worker.js'), 'utf8');
  const match = worker.match(/\bconst BUILD_ASSET_PATHS = (\[[^;]*\]);/);
  assert.ok(match, 'missing versioned PWA asset list');
  const cachedPaths = new Set(JSON.parse(match[1]));
  const jsFiles = (await readdir(path.join(dist, 'assets'))).filter(file => /\.m?js$/.test(file));
  assert.ok(jsFiles.length >= 3, 'no deferred feature-page JavaScript chunk was built');
  for (const file of jsFiles) {
    assert.ok(cachedPaths.has(`/assets/${file}`), `${file} is unavailable offline`);
  }
});
