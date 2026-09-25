import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const headerFile = new URL('../public/_headers', import.meta.url);

test('Pages keeps mutable PWA entrypoints out of browser and CDN caches', async () => {
  const source = await readFile(headerFile, 'utf8');
  const rules = new Map();
  let headers;
  for (const line of source.split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      assert.equal(rules.has(line), false, `duplicate header owner: ${line}`);
      headers = new Headers();
      rules.set(line, headers);
    } else {
      const separator = line.indexOf(':');
      headers.append(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
    }
  }
  // Exact paths deliberately exclude hashed assets, member APIs and the admin app.
  assert.deepEqual([...rules.keys()].sort(), ['/', '/index.html', '/push-service-worker.js']);
  for (const [pathname, policy] of rules) {
    for (const name of ['Cache-Control', 'CDN-Cache-Control', 'Cloudflare-CDN-Cache-Control']) {
      assert.equal(policy.get(name), 'no-store', `${pathname}: ${name}`);
    }
  }
});
