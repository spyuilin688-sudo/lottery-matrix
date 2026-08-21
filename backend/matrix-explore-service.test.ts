import { describe, expect, it } from 'vitest';
import type { MatrixEntitlements } from './matrix-entitlements';
import {
  buildExploreArtifact,
  createExploreWorkUnits,
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

const history = Array.from({ length: 13 }, (_, index) => ({
  period: `114000${String(123 - index).padStart(3, '0')}`,
  drawDate: `2026-08-${String(21 - index).padStart(2, '0')}`,
  numbers: Array.from({ length: 5 }, (__, position) => (
    String(((index * 5 + position) % 39) + 1).padStart(2, '0')
  )),
}));

describe('canonical Matrix Explore artifact', () => {
  it('creates 390 five-ball groups and 546 seven-position groups from thirteen draws', () => {
    const fiveBallUnits = createExploreWorkUnits('今彩539', history);
    expect(fiveBallUnits).toHaveLength(390);
    expect(new Set(fiveBallUnits.map((unit) => [
      unit.minPredictionDistance,
      unit.maxPredictionDistance,
    ].join('-')))).toEqual(new Set(['1-13']));
    const sevenPositionHistory = history.map((draw) => ({
      ...draw,
      numbers: [...draw.numbers, '06', '07'],
    }));
    const sevenPositionUnits = createExploreWorkUnits('六合彩', sevenPositionHistory);
    expect(sevenPositionUnits).toHaveLength(546);
    expect(new Set(sevenPositionUnits.map((unit) => [
      unit.minPredictionDistance,
      unit.maxPredictionDistance,
    ].join('-')))).toEqual(new Set(['1-13']));
  });

  it('runs only the current thirteen-draw lock groups and detaches validation from list rows', () => {
    const calls: Array<Record<string, unknown>> = [];
    const artifact = buildExploreArtifact('今彩539', '114000123', history, (input) => {
      calls.push(input as Record<string, unknown>);
      if (calls.length > 1) return { results: [] };
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
          ruleCount: 1,
          searchCondition: { referenceOffset: -14 },
          sourceA: { sourcePeriod: '114000123' },
          ruleSets: [{ rules: [], predictionNumbers: [3], historicalValidation: [{ predictionPeriod: '114000122' }] }],
        }],
      };
    });

    expect(calls).toHaveLength(390);
    expect(new Set(calls.map((call) => call.exploreDateOffset))).toEqual(new Set([0]));
    expect(new Set(calls.map((call) => call.explorePeriods))).toEqual(new Set([13]));
    expect(calls.every((call) => !('ruleCount' in call))).toBe(true);
    const list = filterExploreArtifact(artifact, request, paid);
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).not.toHaveProperty('historicalValidation');
    expect(list.items[0]).not.toHaveProperty('ruleSets');
    expect(getExploreValidation(artifact, list.items[0].id)).toMatchObject({
      sourceA: { sourcePeriod: '114000123' },
    });
  });

  it('filters two and seven draws from one thirteen-draw calculation', () => {
    const artifact = buildExploreArtifact('今彩539', '114000123', history, (input) => ({
      results: [{
        id: `${input.lockedSourceIndex}:${input.lockedPosition}`,
        number: '10',
        lockedPosition: input.lockedPosition,
        predictionDistance: 1,
        consecutive: '準4進5',
        highestStreak: 4,
        predictionNumbers: ['03'],
        algorithmType: input.algorithmType,
        ruleCount: 1,
        searchCondition: { referenceOffset: -7 },
        ruleSets: [],
      }],
    }));

    const filtered = (explorePeriods: 2 | 7 | 13) => filterExploreArtifact(artifact, {
      ...request,
      explorePeriods,
      exploreRange: '標準範圍',
    }, paid).total;

    expect(filtered(2)).toBe(10);
    expect(filtered(7)).toBe(35);
    expect(filtered(13)).toBe(65);
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
