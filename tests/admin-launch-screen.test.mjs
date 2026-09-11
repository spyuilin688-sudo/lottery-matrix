import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

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

test('admin launch artwork remains visible for 2.5 seconds after the app is ready', () => {
  const script = adminIndex.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script, 'launch script must exist');

  let removed = false;
  let observerCallback;
  const timers = new Map();
  const splash = { remove: () => { removed = true; } };
  const root = { childElementCount: 0 };

  vm.runInNewContext(script, {
    document: {
      getElementById: (id) => id === 'admin-launch-screen' ? splash : root,
    },
    MutationObserver: class {
      constructor(callback) { observerCallback = callback; }
      observe() {}
      disconnect() {}
    },
    requestAnimationFrame: (callback) => callback(),
    window: {
      setTimeout: (callback, delay) => timers.set(delay, callback),
    },
  });

  root.childElementCount = 1;
  observerCallback();
  assert.equal(removed, false, 'React mount must not remove the artwork early');

  timers.get(2500)?.();
  assert.equal(removed, true, 'artwork should leave after 2.5 seconds once React is ready');
});
