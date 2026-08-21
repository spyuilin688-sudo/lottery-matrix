import { describe, expect, it } from 'vitest';
import type { MatrixEntitlements } from './matrix-entitlements';
import {
  buildExploreArtifact,
  filterExploreArtifact,
  getExploreValidation,
  type ExploreArtifact,
} from './matrix-explore-service';

const paid: MatrixEntitlements = {
  canUseSeven: true,
  canUseThirteen: true,
  canUseFullRange: true,
  canUseTianyan: false,
  canUseTiangong: false,
  canViewFullStatus: true,
  canCustomizeStatus: true,
  canUseCompositeCustomRoad: false,
};

const free: MatrixEntitlements = {
  ...paid,
  canUseSeven: false,
  canUseThirteen: false,
  canUseFullRange: false,
  canViewFullStatus: false,
  canCustomizeStatus: false,
};

const request = {
  lottery: '今彩539' as const,
  numberOrder: '依號碼由小到大排序' as const,
  explorePeriods: 13 as const,
  exploreDateOffset: 0 as const,
  exploreRange: '完整範圍' as const,
  ruleCount: 1 as const,
  roadTypes: ['加減' as const],
  selectedStreaks: ['準4進5'],
  sameCode: false,
};

describe('canonical Matrix Explore artifact', () => {
  it('enumerates complete settings and detaches validation from list rows', () => {
    const calls: Array<Record<string, unknown>> = [];
    const artifact = buildExploreArtifact('今彩539', '114000123', [], (input) => {
      calls.push(input as Record<string, unknown>);
      return {
        results: [{
          id: 'raw',
          number: '10',
          lockedPosition: 1,
          predictionDistance: 1,
          consecutive: '準4進5',
          highestStreak: 4,
          predictionNumbers: ['03'],
          algorithmType: input.algorithmType,
          searchCondition: { referenceOffset: -14 },
          sourceA: { sourcePeriod: '114000123' },
          ruleSets: [{ rules: [], predictionNumbers: [3], historicalValidation: [{ predictionPeriod: '114000122' }] }],
        }],
      };
    });

    expect(calls).toHaveLength(108);
    const list = filterExploreArtifact(artifact, request, paid);
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).not.toHaveProperty('historicalValidation');
    expect(list.items[0]).not.toHaveProperty('ruleSets');
    expect(getExploreValidation(artifact, list.items[0].id)).toMatchObject({
      sourceA: { sourcePeriod: '114000123' },
    });
  });

  it('rejects seven, thirteen and full requests without entitlement', () => {
    const artifact = { lottery: '今彩539', drawPeriod: '114000123', items: [], validationById: {} } as ExploreArtifact;
    expect(() => filterExploreArtifact(artifact, { ...request, explorePeriods: 7, exploreRange: '標準範圍' }, free)).toThrow('FORBIDDEN');
    expect(() => filterExploreArtifact(artifact, { ...request, explorePeriods: 13, exploreRange: '標準範圍' }, free)).toThrow('FORBIDDEN');
    expect(() => filterExploreArtifact(artifact, request, free)).toThrow('FORBIDDEN');
  });

  it('derives standard range and same-code rows before recalculating duplicate statistics', () => {
    const base = {
      numberOrder: '依號碼由小到大排序' as const,
      explorePeriods: 2 as const,
      exploreDateOffset: 0 as const,
      ruleCount: 1 as const,
      algorithmType: '加減' as const,
      consecutive: '準4進5',
      highestStreak: 4,
      predictionDistance: 1,
      lockedPosition: 1,
      number: '10',
    };
    const artifact: ExploreArtifact = {
      lottery: '今彩539',
      drawPeriod: '114000123',
      items: [
        { ...base, id: 'a', predictionNumbers: ['03'], referenceOffset: -7 },
        { ...base, id: 'b', predictionNumbers: ['03', '09'], referenceOffset: -6 },
        { ...base, id: 'c', predictionNumbers: ['15'], referenceOffset: -8 },
      ],
      validationById: {},
    };

    const result = filterExploreArtifact(artifact, {
      ...request,
      explorePeriods: 2,
      exploreRange: '標準範圍',
      sameCode: true,
    }, paid);

    expect(result.items.map((item) => item.id)).toEqual(['a', 'b']);
    expect(result.duplicateStats).toEqual([{ number: '03', count: 2 }, { number: '09', count: 1 }]);
    expect(result.total).toBe(2);
  });
});
