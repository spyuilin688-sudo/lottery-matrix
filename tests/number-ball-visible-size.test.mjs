import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(new URL("../src/number-ball.css", import.meta.url), "utf8");

test("transparent PNG canvases are compensated inside NumberBall", () => {
  assert.match(css, /\.number-ball-asset\s*\{[\s\S]*width:\s*calc\(100% \* var\(--number-ball-asset-scale\)\)/);
  assert.match(css, /data-lottery="今彩539"[\s\S]*--number-ball-asset-scale:\s*1\.228/);
  assert.match(css, /data-lottery="天天樂"[\s\S]*--number-ball-asset-scale:\s*1\.347/);
  assert.match(css, /data-lottery="六合彩"[\s\S]*--number-ball-asset-scale:\s*1\.432/);
  assert.match(css, /data-lottery="大樂透"[\s\S]*--number-ball-asset-scale:\s*1\.478/);
});
