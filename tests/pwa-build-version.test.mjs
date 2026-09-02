import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { stampPwaWorker } from "../scripts/pwa-build-version.mjs";

async function createBuild() {
  const root = await mkdtemp(path.join(os.tmpdir(), "matrix-pwa-build-"));
  await mkdir(path.join(root, "assets"));
  await writeFile(path.join(root, "assets", "app.js"), "console.log('matrix')\n");
  await writeFile(path.join(root, "assets", "app.css"), ".app{color:gold}\n");
  await writeFile(
    path.join(root, "push-service-worker.js"),
    "const STATIC_CACHE_NAME = 'matrix-pwa-shell-__BUILD_ID__';\nself.addEventListener('fetch', () => {})\n",
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
