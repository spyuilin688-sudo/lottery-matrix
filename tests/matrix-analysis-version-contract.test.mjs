import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const versionSource = readFileSync(new URL("../backend/matrix-analysis-version.ts", import.meta.url), "utf8");
const pipelineSource = readFileSync(new URL("../backend/matrix-analysis-pipeline.ts", import.meta.url), "utf8");
const progressSource = readFileSync(new URL("../backend/matrix-analysis-progress-store.ts", import.meta.url), "utf8");

test("Matrix Explore algorithm revisions invalidate completed TypeScript artifacts", () => {
  assert.match(versionSource, /`\$\{drawPeriod\}:matrix-v7`/);
  assert.doesNotMatch(versionSource, /matrix-v6/);
  assert.match(pipelineSource, /const analysisVersion = analysisVersionForDrawPeriod\(drawPeriod\)!;/);
  assert.match(pipelineSource, /progressStore\.getOrCreate\(\{[^}]*analysisVersion,/s);
  assert.match(progressSource, /const sameVersion = jobs\.find\(\(job\) => \([^)]*job\.analysisVersion === input\.analysisVersion/s);
  assert.doesNotMatch(progressSource, /if \(sameDraw\)\s*\{\s*await deleteJob\(sameDraw\);/s);
});
