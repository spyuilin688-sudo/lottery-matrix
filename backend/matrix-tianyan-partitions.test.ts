import { describe, expect, it } from 'vitest';
import type { MatrixExploreGroupInput } from './matrix-algorithm';
import { createTianyanPartitionWorkUnits } from './matrix-tianyan-partitions';

describe('resumable Tianyan partition plan', () => {
  it('groups supplied Railway work units by matching search identity', () => {
    const base: MatrixExploreGroupInput = {
      lottery: '今彩539',
      numberOrder: '依號碼由小到大排序',
      algorithmType: '加減',
      lockedSourceIndex: 0,
      lockedPosition: 1,
      explorePeriods: 13,
      exploreDateOffset: 0,
      exploreRange: '完整範圍',
      minPredictionDistance: 1,
      maxPredictionDistance: 13,
    };
    const workUnits: MatrixExploreGroupInput[] = [
      base,
      { ...base, algorithmType: '合值' },
      { ...base, algorithmType: '拖牌' },
      { ...base, lockedPosition: 2 },
      { ...base, lockedPosition: 2, algorithmType: '合值' },
      { ...base, lockedPosition: 2, algorithmType: '拖牌' },
    ];

    expect(createTianyanPartitionWorkUnits(workUnits)).toEqual([
      { indexes: [0, 1, 2] },
      { indexes: [3, 4, 5] },
    ]);
  });
});
