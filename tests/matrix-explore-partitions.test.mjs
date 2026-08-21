import assert from 'node:assert/strict';
import test from 'node:test';

let partitions = {};
try {
  partitions = await import('../backend/matrix-explore-partitions.ts');
} catch {
  partitions = {};
}

const workUnits = [
  { numberOrder: '依號碼由小到大排序', algorithmType: '加減', lockedSourceIndex: 0, lockedPosition: 1 },
  { numberOrder: '依號碼由小到大排序', algorithmType: '合值', lockedSourceIndex: 6, lockedPosition: 2 },
  { numberOrder: '依號碼由小到大排序', algorithmType: '拖牌', lockedSourceIndex: 8, lockedPosition: 3 },
  { numberOrder: '依實際開獎順序排序', algorithmType: '加減', lockedSourceIndex: 0, lockedPosition: 1 },
];

test('selects only partitions that can satisfy the Explore request', () => {
  assert.equal(typeof partitions.createPartitionedExploreArtifact, 'function');
  assert.equal(typeof partitions.partitionIndexesForRequest, 'function');
  const artifact = partitions.createPartitionedExploreArtifact(
    '今彩539',
    '115000001',
    {
      id: 'job-1', lottery: '今彩539', drawPeriod: '115000001',
      analysisVersion: '115000001:matrix-v3', startedAt: '2026-08-22T00:00:00Z',
      phase: 'explore', cursor: 4, total: 4,
    },
    workUnits,
  );

  assert.deepEqual(partitions.partitionIndexesForRequest(artifact, {
    numberOrder: '依號碼由小到大排序',
    roadTypes: ['加減', '合值', '拖牌'],
    explorePeriods: 7,
  }), [0, 1]);
});

test('resolves an item id to exactly one stored partition', () => {
  const artifact = partitions.createPartitionedExploreArtifact(
    '今彩539',
    '115000001',
    {
      id: 'job-1', lottery: '今彩539', drawPeriod: '115000001',
      analysisVersion: '115000001:matrix-v3', startedAt: '2026-08-22T00:00:00Z',
      phase: 'explore', cursor: 4, total: 4,
    },
    workUnits,
  );
  const itemId = '依號碼由小到大排序|6|2|0|13|合值|1|raw-id';
  assert.equal(partitions.partitionIndexForItemId(artifact, itemId), 1);
});
