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

test("production smoke accepts non-5xx responses and rejects server failures", () => {
  assert.doesNotThrow(() => evaluateSmokeResponse("PWA", "https://example.test/", 200));
  assert.doesNotThrow(() => evaluateSmokeResponse("PWA", "https://example.test/", 404));
  assert.throws(
    () => evaluateSmokeResponse("PWA", "https://example.test/", 503),
    /PWA.*503/,
  );
});
