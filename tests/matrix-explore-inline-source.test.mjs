import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ruleBodies } from "./helpers/css-rules.mjs";

const mainSource = readFileSync("src/main.tsx", "utf8");
const appSource = readFileSync("src/App.tsx", "utf8");
const prototypeSource = readFileSync("src/Prototype.tsx", "utf8");
const prototypeCss = readFileSync("src/prototype.css", "utf8");
const css = readFileSync("src/matrix-explore-spacing.css", "utf8");
const headerBackgroundCss = readFileSync("src/matrix-explore-header-background.css", "utf8");
const headerArtwork = readFileSync("public/assets/lottery/header-explore-luxury-flow.svg", "utf8");
const featureCss = readFileSync("src/feature-pages.css", "utf8");
const tiangongCss = readFileSync("src/matrix-tiangong-results.css", "utf8");

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

test("Matrix Explore title-card background is loaded by an existing runtime stylesheet", () => {
  assert.match(prototypeCss, /@import\s+"\.\/matrix-explore-header-background\.css";/);
  assert.match(
    headerBackgroundCss,
    /\.matrix-explore-screen\s*>\s*\.product-header\[data-product-header="Matrix 探索"\]/,
  );
  assert.match(
    headerBackgroundCss,
    /--product-header-background:\s*url\("\/assets\/lottery\/header-explore-luxury-flow\.svg"\);/,
  );
  assert.doesNotMatch(mainSource, /matrix-explore-header-background\.css/);
});

test("Matrix Explore title artwork keeps the dense black-gold reference layers without changing canvas geometry", () => {
  assert.match(headerArtwork, /viewBox="0 0 800 136"/);
  assert.match(headerArtwork, /id="starfield"/);
  assert.match(headerArtwork, /id="flowGlow"/);
  assert.match(headerArtwork, /id="planetSurface"/);
  assert.ok((headerArtwork.match(/<path\b/g) ?? []).length >= 16, "expected layered gold flow paths");
  assert.ok((headerArtwork.match(/<circle\b/g) ?? []).length >= 48, "expected dense gold star particles");
});

test("Matrix Explore panels use scoped responsive-width auto-height flow", () => {
  for (const selector of [
    /^\.matrix-explore-main-screen \.explore-settings$/,
    /^\.matrix-explore-main-screen \.repeat-stats-panel$/,
    /^\.matrix-explore-main-screen \.result-panel$/,
  ]) {
    assertRule(selector, [/width:\s*var\(--matrix-explore-result-panel-width, 100%\);/, /height:\s*auto;/]);
  }
  assert.doesNotMatch(css, /\.matrix-explore-main-screen \.hit-advanced-panel\s*\{/);
  assert.doesNotMatch(css, /width:\s*366px;/);
});

test("Matrix Explore controls keep the current scoped responsive dimensions", () => {
  assertRule(/^\.matrix-explore-main-screen \.advanced-panel \.native-select$/, [
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

test("Tiangong fixed period keeps the compact full-width control geometry", () => {
  const staticPeriodSelector = /^\.matrix-explore-main-screen\.matrix-tiangong-screen \.tiangong-period-options > \.segmented-static$/;
  const compactBodies = ruleBodies(css, staticPeriodSelector);
  assert.ok(compactBodies.some((body) => [
    /height:\s*20px;/,
    /min-height:\s*20px;/,
    /font-size:\s*\.75rem;/,
    /padding:\s*\.125rem \.25rem;/,
  ].every((declaration) => declaration.test(body))));
  assert.ok(ruleBodies(tiangongCss, staticPeriodSelector).some((body) => /width:\s*100%;/.test(body)));
  // Shared segmented controls own appearance after a7122ce; the scoped rule owns size.
  const selectedPeriodSelector = /^\.segmented \.segmented-static\[data-selected="true"\]$/;
  assert.ok(ruleBodies(featureCss, selectedPeriodSelector).some((body) => [
    /border-color:\s*var\(--pwa-frame-secondary\);/,
    /background:\s*var\(--pwa-control-selected\);/,
    /color:\s*var\(--pwa-frame-secondary\);/,
  ].every((declaration) => declaration.test(body))));
});
