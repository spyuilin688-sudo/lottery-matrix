import assert from "node:assert/strict";
import test from "node:test";

import { ruleBodies } from "./helpers/css-rules.mjs";

test("ruleBodies matches a complete selector inside a comma group", () => {
  const source = `
    .alpha,
    .beta { color: red; }
    .beta .child { color: blue; }
  `;

  assert.deepEqual(ruleBodies(source, /^\.beta$/), [" color: red; "]);
});

test("ruleBodies keeps commas inside :is() within one complete selector", () => {
  const source = `
    .history-panel:is([data-lottery="今彩539"], [data-lottery="天天樂"]) .ball,
    .other { --underline-y: .2px; }
  `;

  assert.deepEqual(
    ruleBodies(
      source,
      /^\.history-panel:is\(\[data-lottery="今彩539"\], \[data-lottery="天天樂"\]\) \.ball$/,
    ),
    [" --underline-y: .2px; "],
  );
});
