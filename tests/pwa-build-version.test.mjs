import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { stampPwaWorker } from "../scripts/pwa-build-version.mjs";

async function createBuild() {
  const root = await mkdtemp(path.join(os.tmpdir(), "matrix-pwa-build-"));
  await mkdir(path.join(root, "assets"));
  await writeFile(path.join(root, "assets", "app.js"), "console.log('matrix')\n");
  await writeFile(path.join(root, "assets", "app.css"), ".app{color:gold}\n");
  await writeFile(path.join(root, "index.html"), '<link rel="stylesheet" href="/assets/app.css"><script type="module" src="/assets/app.js"></script>');
  await writeFile(
    path.join(root, "push-service-worker.js"),
    "const STATIC_CACHE_NAME = 'matrix-pwa-shell-__BUILD_ID__';\nconst BUILD_ASSET_PATHS = [];\nself.addEventListener('fetch', () => {})\n",
  );
  return root;
}

test("stamps the built service worker with a stable application asset fingerprint", async () => {
  const root = await createBuild();
  try {
    const first = await stampPwaWorker(root);
    const worker = await readFile(path.join(root, "push-service-worker.js"), "utf8");

    assert.match(first, /^[a-f0-9]{16}$/);
    assert.match(worker, /matrix-build:[a-f0-9]{16}/);
    assert.match(worker, new RegExp(`matrix-pwa-shell-${first}`));
    assert.doesNotMatch(worker, /__BUILD_ID__/);
    assert.match(worker, /self\.addEventListener\('fetch'/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('build embeds its CSS and JS paths, with stable repeated stamping', async () => {
  const root = await createBuild();
  try {
    const first = await stampPwaWorker(root);
    const second = await stampPwaWorker(root);
    const worker = await readFile(path.join(root, 'push-service-worker.js'), 'utf8');
    const paths = vm.runInNewContext(`${worker}\nJSON.stringify(BUILD_ASSET_PATHS)`, { self: { addEventListener() {} } });
    assert.deepEqual(JSON.parse(paths), ['/assets/app.css', '/assets/app.js']);
    assert.equal(first, second);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('worker-only changes receive a new cache generation', async () => {
  const root = await createBuild();
  try {
    const first = await stampPwaWorker(root);
    const workerPath = path.join(root, 'push-service-worker.js');
    const source = await readFile(workerPath, 'utf8');
    await writeFile(workerPath, source.replace("() => {}", "() => { return true; }"));
    assert.notEqual(await stampPwaWorker(root), first);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("changes the service worker fingerprint when a built application asset changes", async () => {
  const firstRoot = await createBuild();
  const secondRoot = await createBuild();
  try {
    const first = await stampPwaWorker(firstRoot);
    await writeFile(path.join(secondRoot, "assets", "app.js"), "console.log('matrix-v2')\n");
    const second = await stampPwaWorker(secondRoot);

    assert.notEqual(first, second);
  } finally {
    await rm(firstRoot, { recursive: true, force: true });
    await rm(secondRoot, { recursive: true, force: true });
  }
});
