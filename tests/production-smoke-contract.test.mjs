import assert from "node:assert/strict";
import test from "node:test";

import { collectSmokeTargets, evaluateSmokeResponse, runProductionSmoke } from "../scripts/production-smoke.mjs";

test("production smoke target collection requires configured PWA and admin URLs", () => {
  assert.throws(
    () => collectSmokeTargets({}),
    /SMOKE_PWA_URL.*SMOKE_ADMIN_URL/s,
  );

  assert.deepEqual(
    collectSmokeTargets({
      SMOKE_PWA_URL: "https://example.test/",
      SMOKE_ADMIN_URL: "https://admin.example.test/",
      SMOKE_API_URL: "https://api.example.test/health",
    }),
    [
      { name: "PWA", url: "https://example.test/" },
      { name: "Admin", url: "https://admin.example.test/" },
      { name: "API", url: "https://api.example.test/health" },
    ],
  );
});

test("production smoke rejects invalid or non-http deployment URLs", () => {
  assert.throws(
    () => collectSmokeTargets({
      SMOKE_PWA_URL: "file:///tmp/index.html",
      SMOKE_ADMIN_URL: "https://admin.example.test/",
    }),
    /SMOKE_PWA_URL.*http/i,
  );
});

test("PWA and admin smoke targets require a successful final response", () => {
  assert.doesNotThrow(() => evaluateSmokeResponse("PWA", "https://example.test/", 200));
  assert.throws(
    () => evaluateSmokeResponse("PWA", "https://example.test/", 404),
    /PWA.*404/,
  );
  assert.throws(
    () => evaluateSmokeResponse("Admin", "https://admin.example.test/", 503),
    /Admin.*503/,
  );
});

test("optional API health target requires a successful response", () => {
  assert.doesNotThrow(() => evaluateSmokeResponse("API", "https://api.example.test/health", 200));
  for (const status of [204, 401, 403, 404, 500]) {
    assert.throws(
      () => evaluateSmokeResponse("API", "https://api.example.test/health", status),
      new RegExp(`API.*${status}`),
    );
  }
});

test("an optional protected API target never accepts a missing endpoint", () => {
  assert.doesNotThrow(() => evaluateSmokeResponse("API", "https://api.example.test/jobs/status", 401));
  assert.doesNotThrow(() => evaluateSmokeResponse("API", "https://api.example.test/jobs/status", 403));
  assert.throws(
    () => evaluateSmokeResponse("API", "https://api.example.test/jobs/status", 404),
    /API.*404/,
  );
});

const env = { SMOKE_PWA_URL: 'https://pwa.example.test/', SMOKE_ADMIN_URL: 'https://admin.example.test/' };
const page = (asset) => `<!doctype html><html><script type="module" src="/assets/${asset}.js"></script></html>`;
const worker = (asset) => `const BUILD_ASSET_PATHS = ["/assets/${asset}.js"];`;

function fetchSmoke({ root = page('new'), index = page('new'), serviceWorker = worker('new') } = {}) {
  const seen = [];
  const fetchImpl = async (url) => {
    seen.push(url);
    const pathname = new URL(url).pathname;
    const body = url.startsWith(env.SMOKE_ADMIN_URL) ? '<html>admin</html>'
      : pathname === '/index.html' ? index
        : pathname === '/push-service-worker.js' ? serviceWorker : root;
    return new Response(body, { status: 200 });
  };
  return { fetchImpl, seen };
}

test('production smoke accepts one consistent frontend asset version', async () => {
  const { fetchImpl, seen } = fetchSmoke();
  await runProductionSmoke({ env, fetchImpl });
  assert.deepEqual(seen, [env.SMOKE_PWA_URL, env.SMOKE_ADMIN_URL,
    'https://pwa.example.test/index.html', 'https://pwa.example.test/push-service-worker.js']);
});

test('production smoke stops before asset checks when configured API health endpoint is missing', async () => {
  const withApi = { ...env, SMOKE_API_URL: 'https://api.example.test/health' };
  const { fetchImpl, seen } = fetchSmoke();
  const apiNotFound = async (url, options) => url === withApi.SMOKE_API_URL
    ? new Response('Not Found', { status: 404 })
    : fetchImpl(url, options);
  await assert.rejects(runProductionSmoke({ env: withApi, fetchImpl: apiNotFound }), /API.*404/);
  assert.deepEqual(seen, [env.SMOKE_PWA_URL, env.SMOKE_ADMIN_URL]);
});

test('production smoke detects different asset versions at / and /index.html', async () => {
  const { fetchImpl } = fetchSmoke({ index: page('old') });
  await assert.rejects(runProductionSmoke({ env, fetchImpl }), /PWA.*asset.*version|PWA.*mixed/i);
});

test('production smoke detects a stale service worker asset list', async () => {
  const { fetchImpl } = fetchSmoke({ serviceWorker: worker('old') });
  await assert.rejects(runProductionSmoke({ env, fetchImpl }), /PWA.*asset.*version|PWA.*mixed/i);
});
