import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('the production build emits the Cloudflare Pages admin app', async () => {
  const packageJson = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  );
  const build = packageJson.scripts?.build ?? '';

  assert.match(build, /npm run build:admin:pages/);
  assert.ok(
    build.indexOf('npm run build:admin:pages') < build.indexOf('node scripts/pwa-build-version.mjs dist'),
    'admin assets must exist before the final Pages artifact is stamped',
  );
});
