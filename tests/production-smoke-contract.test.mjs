import assert from "node:assert/strict";
import test from "node:test";

import { collectSmokeTargets, evaluateSmokeResponse, runProductionSmoke } from "../scripts/production-smoke.mjs";

const PWA_URL = "https://pwa.example.test/";
const ADMIN_URL = "https://admin.example.test/";
const CURRENT_JS = "/assets/index-CvZLNqOh.js";
const CURRENT_CSS = "/assets/index-rKvxcvC8.css";
const OLD_JS = "/assets/index-Dgfl5Ne3.js";
const OLD_CSS = "/assets/index-BLatro_e.css";

function pwaHtml(js = CURRENT_JS, css = CURRENT_CSS) {
  return `<!doctype html><link crossorigin href="${css}" rel="stylesheet"><script crossorigin type="module" src="${js}"></script>`;
}

const stampedWorker = `const STATIC_CACHE_NAME = "matrix-pwa-shell-da3e3e9e0a585644";
const BUILD_SOURCE_SHA = "74e1aa1b0631922f710e64c9e6f78e6f190d6b48";
const BUILD_ASSET_PATHS = ["${CURRENT_JS}","${CURRENT_CSS}","/assets/lazy-CV8Pt0v9.js"];
`;

function fakeSmokeFetch({ root = pwaHtml(), index = pwaHtml(), worker = stampedWorker } = {}) {
  const responses = new Map([
    [PWA_URL, [root, "text/html"]],
    [`${PWA_URL}index.html`, [index, "text/html"]],
    [`${PWA_URL}push-service-worker.js`, [worker, "text/javascript"]],
    [ADMIN_URL, ["<!doctype html><title>Admin</title>", "text/html"]],
  ]);
  return async url => {
    const response = responses.get(url);
    if (!response) throw new Error(`Unexpected smoke URL: ${url}`);
    return new Response(response[0], { status: 200, headers: { "content-type": response[1] } });
  };
}

const smokeEnv = { SMOKE_PWA_URL: PWA_URL, SMOKE_ADMIN_URL: ADMIN_URL };

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

test("optional API smoke target may be protected but never accepts a server error", () => {
  assert.doesNotThrow(() => evaluateSmokeResponse("API", "https://api.example.test/health", 200));
  assert.doesNotThrow(() => evaluateSmokeResponse("API", "https://api.example.test/health", 401));
  assert.doesNotThrow(() => evaluateSmokeResponse("API", "https://api.example.test/health", 403));
  assert.throws(
    () => evaluateSmokeResponse("API", "https://api.example.test/health", 500),
    /API.*500/,
  );
});

test("production smoke accepts canonical HTML entries in the stamped worker alongside lazy chunks", async () => {
  await assert.doesNotReject(runProductionSmoke({ env: smokeEnv, fetchImpl: fakeSmokeFetch() }));
});

test("production smoke rejects stale root HTML even when the worker is current", async () => {
  await assert.rejects(
    runProductionSmoke({ env: smokeEnv, fetchImpl: fakeSmokeFetch({ root: pwaHtml(OLD_JS, OLD_CSS) }) }),
    /PWA.*assets.*index-Dgfl5Ne3\.js/i,
  );
});

test("production smoke rejects stale /index.html even when / is current", async () => {
  await assert.rejects(
    runProductionSmoke({ env: smokeEnv, fetchImpl: fakeSmokeFetch({ index: pwaHtml(OLD_JS, OLD_CSS) }) }),
    /PWA.*index\.html.*assets/i,
  );
});

test("production smoke rejects a worker without a stamped asset list", async () => {
  await assert.rejects(
    runProductionSmoke({ env: smokeEnv, fetchImpl: fakeSmokeFetch({ worker: 'const BUILD_ASSET_PATHS = [];' }) }),
    /PWA.*worker.*stamp/i,
  );
});

test("production smoke rejects differing canonical entry assets even if both occur in the worker", async () => {
  const mixedWorker = stampedWorker.replace('"/assets/lazy-CV8Pt0v9.js"', `"${OLD_JS}","${OLD_CSS}"`);
  await assert.rejects(
    runProductionSmoke({
      env: smokeEnv,
      fetchImpl: fakeSmokeFetch({ root: pwaHtml(OLD_JS, OLD_CSS), worker: mixedWorker }),
    }),
    /PWA.*entry assets disagree/i,
  );
});

test("production smoke rejects a successful HTML response without built entry assets", async () => {
  await assert.rejects(
    runProductionSmoke({ env: smokeEnv, fetchImpl: fakeSmokeFetch({ index: "<!doctype html><p>Maintenance</p>" }) }),
    /PWA.*index\.html.*no CSS and JS entry assets/i,
  );
});
