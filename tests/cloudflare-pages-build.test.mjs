import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

test('declares a clean Cloudflare Pages build without Sites packaging', () => {
  assert.equal(
    packageJson.scripts['build:pages'],
    'npm run check:runtime && tsc && vite build && node scripts/pwa-build-version.mjs dist',
  );
  assert.doesNotMatch(packageJson.scripts['build:pages'], /prepare-sites-build|dist\/client|dist\/server/);
});

test('stamps the PWA worker before preparing the Sites artifact', () => {
  assert.equal(
    packageJson.scripts.build,
    'tsc && vite build && node scripts/pwa-build-version.mjs dist && node scripts/prepare-sites-build.mjs',
  );
});
