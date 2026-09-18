import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";

const policyUrl = new URL("../scripts/check-runtime-commit-integrity.mjs", import.meta.url);

test("runtime atomic-commit policy checker exists", () => {
  assert.equal(existsSync(policyUrl), true, "scripts/check-runtime-commit-integrity.mjs must exist");
});

if (existsSync(policyUrl)) {
  const { validateRuntimeLockAtomicity } = await import(policyUrl.href);
  const lockedFiles = {
    "scripts/check-mobile-runtime.mjs": "hash",
    "scripts/update-mobile-runtime-lock.mjs": "hash",
    "scripts/check-runtime-commit-integrity.mjs": "hash",
    "vite.config.ts": "hash",
    "src/main.tsx": "hash",
    "worker/index.js": "hash",
  };

  test("rejects protected Runtime changes without the lock in the same commit", () => {
    assert.throws(
      () => validateRuntimeLockAtomicity(["scripts/check-mobile-runtime.mjs"], lockedFiles),
      /mobile-runtime\.lock\.json.*same commit/i,
    );
  });

  test("accepts protected Runtime changes when the lock changes in the same commit", () => {
    assert.doesNotThrow(() => validateRuntimeLockAtomicity([
      "scripts/check-mobile-runtime.mjs",
      "mobile-runtime.lock.json",
    ], lockedFiles));
  });

  test("accepts normal UI-only commits without touching the Runtime lock", () => {
    assert.doesNotThrow(() => validateRuntimeLockAtomicity([
      "src/App.tsx",
      "src/styles.css",
      "src/feature-pages.css",
    ], lockedFiles));
  });

  test("rejects lock-only commits", () => {
    assert.throws(
      () => validateRuntimeLockAtomicity(["mobile-runtime.lock.json"], lockedFiles),
      /protected Runtime.*same commit/i,
    );
  });
}
