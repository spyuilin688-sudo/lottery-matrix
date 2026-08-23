import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const updater = readFileSync(new URL("../scripts/update-mobile-runtime-lock.mjs", import.meta.url), "utf8");
const checker = readFileSync(new URL("../scripts/check-mobile-runtime.mjs", import.meta.url), "utf8");
const lock = JSON.parse(readFileSync(new URL("../mobile-runtime.lock.json", import.meta.url), "utf8"));

const coreFiles = [
  "scripts/check-mobile-runtime.mjs",
  "scripts/prepare-sites-build.mjs",
  "scripts/update-mobile-runtime-lock.mjs",
  "vite.config.ts",
  "src/main.tsx",
  "worker/index.js",
];

const uiFiles = ["src/App.tsx", "src/styles.css"];

test("runtime integrity protects core runtime but not normal UI files", () => {
  for (const file of coreFiles) {
    assert.match(updater, new RegExp(`["']${file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`));
    assert.ok(file in lock, `${file} must stay protected`);
  }

  for (const file of uiFiles) {
    assert.doesNotMatch(updater, new RegExp(`["']${file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`));
    assert.ok(!(file in lock), `${file} must be editable without refreshing the runtime lock`);
  }

  const unexpectedProtectedUi = Object.keys(lock).filter((file) =>
    file.startsWith("src/") && file !== "src/main.tsx" && !file.startsWith("src/mobile/"),
  );
  assert.deepEqual(unexpectedProtectedUi, []);
  assert.doesNotMatch(checker, /Put app UI in src\/Prototype\.tsx and src\/prototype\.css/);
});
