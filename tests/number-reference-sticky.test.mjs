import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

test("號碼對照單在 canonical responsive cascade 保留 sticky 定位", () => {
  const featurePagesCss = readFileSync(new URL("../src/feature-pages.css", import.meta.url), "utf8");
  const responsiveCss = readFileSync(new URL("../src/responsive-feature-pages.css", import.meta.url), "utf8");

  assert.match(
    featurePagesCss,
    /\.number-reference-screen \.feature-brand-header\s*\{[^}]*position:\s*sticky;[^}]*z-index:\s*20;[^}]*top:\s*0;/s,
  );
  assert.match(
    responsiveCss,
    /\.sticky-title-card-screen \.feature-brand-header,\s*\.number-reference-screen \.feature-brand-header\s*\{[^}]*position:\s*sticky;[^}]*z-index:\s*30;[^}]*top:\s*0;/s,
  );
});
