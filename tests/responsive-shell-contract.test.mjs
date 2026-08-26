import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("uses a fluid 320–430px app shell instead of a fixed 390px canvas", () => {
  const styles = readFileSync("src/styles.css", "utf8");

  assert.match(styles, /--app-layout-max:\s*430px/);
  assert.match(styles, /\.app-mobile-canvas\s*\{[^}]*width:\s*100%/s);
  assert.match(styles, /\.app-mobile-canvas\s*\{[^}]*max-width:\s*var\(--app-layout-max\)/s);
  assert.doesNotMatch(styles, /--app-layout-viewport:\s*390px/);
});

test("defines safe areas, fluid dialog spacing and a 44px touch target", () => {
  const tokens = readFileSync("src/design-tokens.css", "utf8");

  assert.match(tokens, /--layout-safe-area-bottom:\s*env\(safe-area-inset-bottom/);
  assert.match(tokens, /--layout-dialog-inline:\s*clamp\(/);
  assert.match(tokens, /--layout-touch-target:\s*44px/);
});
