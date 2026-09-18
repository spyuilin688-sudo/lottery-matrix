import assert from "node:assert/strict";
import test from "node:test";

import { findOmittedTestedEdgeFunctionDirs } from "../scripts/edge-functions-test-inventory.mjs";

test("dedicated Edge Function suite includes every Edge Function directory that already contains tests", async () => {
  const omitted = await findOmittedTestedEdgeFunctionDirs();
  assert.deepEqual(omitted, []);
});

