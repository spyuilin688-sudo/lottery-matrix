import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const manifestPath = fileURLToPath(new URL('../public/manifest.webmanifest', import.meta.url));

async function readManifest() {
  return JSON.parse(await readFile(manifestPath, 'utf8'));
}

test('LINE OAuth callback is configured to reopen the existing installed PWA client', async () => {
  const manifest = await readManifest();

  assert.equal(manifest.id, '/');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  assert.deepEqual(manifest.launch_handler, {
    client_mode: 'navigate-existing',
  });
});
