import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const prototypeSource = readFileSync(new URL("../src/Prototype.tsx", import.meta.url), "utf8");
const prototypeCss = readFileSync(new URL("../src/prototype.css", import.meta.url), "utf8");

test("the supplied Matrix video remains available while the default startup screen is disabled", () => {
  assert.match(prototypeSource, /Prototype\(\{ isLoading = false \}/);
  assert.match(prototypeSource, /src="\/assets\/lottery\/matrix-startup\.mp4"/);
  assert.match(prototypeSource, /autoPlay muted playsInline preload="auto"/);
});

test("the complete portrait artwork remains visible on narrow phones", () => {
  assert.match(prototypeCss, /\.brand-loading-video[\s\S]*object-fit:\s*contain;/);
});
