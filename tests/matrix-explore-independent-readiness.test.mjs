import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const backend = fs.readFileSync('backend/index.ts', 'utf8');

test('Explore reads its completed current-version artifact without waiting for Tianyan or Tiangong status', () => {
  const block = backend.match(/const matrixExploreRoutes = createMatrixExploreRoutes\(\{([\s\S]*?)\n\}\);/)?.[1] ?? '';
  assert.match(block, /analysisStore\.readAnalysis\('explore',lottery,drawPeriod,`\$\{drawPeriod\}:matrix-v3`\)/);
  assert.doesNotMatch(block, /readCompletedMatrixAnalysis\('explore'/);
});
