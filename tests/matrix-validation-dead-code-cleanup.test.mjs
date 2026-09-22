import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

const validation = read("src/features/MatrixValidation.tsx");
const explore = read("src/features/MatrixExplorePage.tsx");
const shared = read("src/features/shared.tsx");

test("retired sample validation renderer is removed from production sources", () => {
  assert.doesNotMatch(validation, /RoadValidationProcess/);
  assert.doesNotMatch(validation, /ROAD_VALIDATION_SAMPLE_HISTORY/);
  assert.doesNotMatch(explore, /RoadValidationProcess/);
  assert.doesNotMatch(shared, /ROAD_VALIDATION_SAMPLE_HISTORY/);
});

test("Matrix Explore no longer advertises the retired Matrix Tiangong fallback title", () => {
  assert.doesNotMatch(
    explore,
    /title\?:\s*"Matrix 探索"\s*\|\s*"Matrix 天衡"\s*\|\s*"Matrix 天樞"\s*\|\s*"Matrix 天衍"\s*\|\s*"Matrix 天工"/,
  );
});

test("five-page Matrix switcher still routes to the dedicated Tiangong page", () => {
  assert.match(shared, /screen:\s*"tiangong"[\s\S]*label:\s*"Matrix 天工"/);
  assert.match(
    shared,
    /current:\s*"explore"\s*\|\s*"tianheng"\s*\|\s*"tianshu"\s*\|\s*"tianyan"\s*\|\s*"tiangong"/,
  );
});
