import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const patchPath = resolve(process.cwd(), "src/homepage/logo-spacing.css");
const entryPath = resolve(process.cwd(), "src/homepage-repair.css");

test("homepage logo spacing is isolated in a dedicated responsive patch", () => {
  assert.equal(existsSync(patchPath), true, "logo-spacing.css should exist");

  const patch = readFileSync(patchPath, "utf8");
  const entry = readFileSync(entryPath, "utf8");

  assert.match(entry, /@import "\.\/homepage\/logo-spacing\.css";/);
  assert.match(patch, /\.home-screen \.lottery-screen > \.brand-header\s*\{[^}]*flex:\s*0 0 auto;/s);
  assert.match(patch, /\.home-screen \.brand-header\s*\{[^}]*padding-top:\s*clamp\(8px,\s*1dvh,\s*12px\);/s);
  assert.match(patch, /\.home-screen \.home-logo-image\s*\{[^}]*width:\s*87\.584%;[^}]*height:\s*auto;/s);
});
