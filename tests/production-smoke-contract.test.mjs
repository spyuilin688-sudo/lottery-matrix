import assert from "node:assert/strict";
import test from "node:test";

import { collectSmokeTargets, evaluateSmokeResponse } from "../scripts/production-smoke.mjs";

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

