import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ruleBodies } from "./helpers/css-rules.mjs";

const mainSource = readFileSync("src/main.tsx", "utf8");
const appSource = readFileSync("src/App.tsx", "utf8");
const prototypeSource = readFileSync("src/Prototype.tsx", "utf8");
const css = readFileSync("src/matrix-explore-spacing.css", "utf8");

function assertRule(selectorPattern, declarations) {
  const bodies = ruleBodies(css, selectorPattern);
  assert.ok(
    bodies.some((body) => declarations.every((declaration) => declaration.test(body))),
    `expected ${selectorPattern} to own ${declarations.join(", ")}`,
  );
}

test("Matrix Explore stylesheet follows the feature-pages import graph", () => {
  const appImportIndex = mainSource.indexOf('import App from "./App";');
  const spacingImportIndex = mainSource.indexOf('import "./matrix-explore-spacing.css";');
  assert.notEqual(appImportIndex, -1);
  assert.notEqual(spacingImportIndex, -1);
  assert.ok(appImportIndex < spacingImportIndex);
  assert.match(appSource, /import Prototype from "\.\/Prototype";/);
  assert.match(prototypeSource, /import "\.\/feature-pages\.css";/);
});

test("Matrix Explore panels use scoped responsive-width auto-height flow", () => {
  for (const selector of [
    /^\.matrix-explore-main-screen \.explore-settings$/,
    /^\.matrix-explore-main-screen \.hit-advanced-panel$/,
    /^\.matrix-explore-main-screen \.repeat-stats-panel$/,
    /^\.matrix-explore-main-screen \.result-panel$/,
  ]) {
    assertRule(selector, [/width:\s*var\(--matrix-explore-result-panel-width, 100%\);/, /height:\s*auto;/]);
  }
  assertRule(/^\.matrix-explore-main-screen \.history-panel$/, [/width:\s*100%;/, /height:\s*auto;/]);
  assert.doesNotMatch(css, /width:\s*366px;/);
});

test("Matrix Explore controls keep the current scoped responsive dimensions", () => {
  assertRule(/^\.matrix-explore-main-screen \.explore-settings \.setting-grid \.select-box$/, [
    /height:\s*24px;/,
    /min-height:\s*24px;/,
  ]);
  assertRule(/^\.matrix-explore-main-screen \.advanced-row$/, [/min-height:\s*32px;/, /height:\s*auto;/]);
  assertRule(/^\.matrix-explore-main-screen \.primary-action$/, [
    /width:\s*100%;/,
    /min-height:\s*34px;/,
    /height:\s*auto;/,
  ]);
  assertRule(/^\.matrix-explore-main-screen \.result-summary > div$/, [
    /min-height:\s*clamp\(36px, 10vw, 40px\);/,
    /height:\s*auto;/,
  ]);
});
