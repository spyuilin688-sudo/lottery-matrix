import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = (path) => readFileSync(new URL('../apps/admin/' + path, import.meta.url), 'utf8');
const html = read('index.html');
const manifest = JSON.parse(read('public/manifest.webmanifest'));

test('admin uses only the requested launch artwork and new install icons', () => {
  assert.match(html, /admin-launch-20260912\.png/);
  assert.equal((html.match(/id="admin-launch-screen"/g) || []).length, 1);
  assert.doesNotMatch(html, /20260911|admin-splash\.jpg|style=/);
  assert.equal(manifest.background_color, '#000000');
  assert.equal(manifest.theme_color, '#000000');
  assert.equal(manifest.id, '/admin/');
  assert.equal(manifest.scope, '/admin/');
  for (const icon of manifest.icons) {
    assert.match(icon.src, /admin-20260912-(192|512)\.png$/);
    assert.ok(existsSync(new URL('../apps/admin/public/' + icon.src.replace('/admin/', ''), import.meta.url)));
  }
});

function launch({ ready = true, imageLoaded = true } = {}) {
  let now = 0;
  let nextId = 0;
  const timers = new Map();
  const root = { childElementCount: Number(ready), inert: false };
  const img = new EventTarget();
  img.complete = imageLoaded;
  img.naturalWidth = imageLoaded ? 864 : 0;
  const screen = { removed: false, remove() { this.removed = true; }, querySelector: () => img };
  let observer;
  vm.runInNewContext(read('public/admin-launch-20260912.js'), {
    document: { getElementById: (id) => id === 'root' ? root : screen },
    performance: { now: () => now },
    setTimeout: (fn, delay) => { const id = ++nextId; timers.set(id, { fn, at: now + delay }); return id; },
    clearTimeout: (id) => timers.delete(id),
    MutationObserver: class { constructor(fn) { this.callback = fn; observer = this; } observe() {} disconnect() { this.disconnected = true; } },
  });
  const tick = (ms) => {
    const end = now + ms;
    while (true) {
      const next = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      now = next[1].at;
      timers.delete(next[0]);
      next[1].fn();
    }
    now = end;
  };
  return { root, img, screen, tick, ready() { root.childElementCount = 1; observer.callback(); }, get observer() { return observer; } };
}

test('shows artwork briefly then restores access to the ready app', () => {
  const s = launch();
  assert.equal(s.root.inert, true);
  s.tick(1199);
  assert.equal(s.screen.removed, false);
  s.tick(1);
  assert.equal(s.screen.removed, true);
  assert.equal(s.root.inert, false);
  assert.equal(s.observer.disconnected, true);
});

test('waits for image loading and the app without restarting the launch', () => {
  const s = launch({ ready: false, imageLoaded: false });
  s.tick(2000);
  s.img.dispatchEvent(new Event('load'));
  s.tick(1200);
  assert.equal(s.screen.removed, false);
  s.ready();
  s.tick(0);
  assert.equal(s.screen.removed, true);
});

test('broken artwork never blocks the ready app', () => {
  const s = launch({ imageLoaded: false });
  s.img.dispatchEvent(new Event('error'));
  s.tick(0);
  assert.equal(s.screen.removed, true);
});

test('a stalled launch has a bounded timeout and releases keyboard access', () => {
  const s = launch({ ready: false, imageLoaded: false });
  s.tick(10000);
  assert.equal(s.screen.removed, true);
  assert.equal(s.root.inert, false);
});
