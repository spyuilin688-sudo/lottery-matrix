import { describe, expect, it } from 'vitest';
import { createExploreWorkUnits } from './matrix-explore-service';
import { createTianyanPartitionWorkUnits } from './matrix-tianyan-partitions';

describe('resumable Tianyan partition plan', () => {
  it.each([
    ['今彩539', 390, 130],
    ['天天樂', 390, 130],
    ['六合彩', 546, 182],
    ['大樂透', 546, 182],
  ] as const)('groups %s partitions by matching search identity', (lottery, exploreCount, tianyanCount) => {
    const history = Array.from({ length: 13 }, (_, index) => ({
      period: String(index), drawDate: '2026-08-21', numbers: ['01', '02', '03', '04', '05'],
    }));
    const explore = createExploreWorkUnits(lottery, history);
    const tianyan = createTianyanPartitionWorkUnits(explore);

    expect(explore).toHaveLength(exploreCount);
    expect(tianyan).toHaveLength(tianyanCount);
    expect(tianyan.every((unit) => unit.indexes.length === 3)).toBe(true);
  });
});
