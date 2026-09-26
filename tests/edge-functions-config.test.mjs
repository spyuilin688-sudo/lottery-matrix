import assert from "node:assert/strict";
import test from "node:test";

import { readFile } from "node:fs/promises";
import { findOmittedTestedEdgeFunctionDirs } from "../scripts/edge-functions-test-inventory.mjs";

test("dedicated Edge Function suite includes every Edge Function directory that already contains tests", async () => {
  const omitted = await findOmittedTestedEdgeFunctionDirs();
  assert.deepEqual(omitted, []);
});



test("App Matrix status keeps platform JWT verification disabled because its RPC guard owns guest/member authorization", async () => {
  const config = await readFile(new URL("../supabase/config.toml", import.meta.url), "utf8");
  assert.match(config, /\[functions\.app-matrix-status\][\s\S]*?verify_jwt\s*=\s*false/);
});
