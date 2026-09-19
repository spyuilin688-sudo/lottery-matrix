import { describe, expect, it } from 'vitest';
import { buildMatrixStatusArtifact } from './matrix-status-service';
import type { ExploreArtifact, ExploreArtifactRow } from './matrix-explore-service';
import type { MatrixEntitlements } from './matrix-entitlements';

const entitlements: MatrixEntitlements = {
  canUseSeven: true, canUseThirteen: true, canUseFullRange: true, canUseTianyan: true,
  canUseTiangong: false, canViewFullStatus: true,
};

function row(overrides: Partial<ExploreArtifactRow> = {}): ExploreArtifactRow {
  return {
    id: 'road-1', number: '05', lockedPosition: 1, predictionDistance: 1,
    consecutive: '準7進8', highestStreak: 7, predictionNumbers: ['08'],
    algorithmType: '加減', numberOrder: '依號碼由小到大排序', explorePeriods: 13,
    exploreDateOffset: 0, ruleCount: 1, ...overrides,
  };
}

function explore(items: ExploreArtifactRow[]): ExploreArtifact {
  return { lottery: '今彩539', drawPeriod: '114000123', items, validationById: {} };
}

describe('Matrix status artifact orchestration', () => {
  it('keeps only the roads that actually witness a Chapter 15 trigger', () => {
    const result = buildMatrixStatusArtifact(explore([
      row({ referenceOffset: -1, referencePosition: 2 }),
      row({ id: 'ignored-period', explorePeriods: 7 }),
      row({ id: 'ignored-date', exploreDateOffset: 1 }),
    ]), entitlements);
    expect(result.summary).toMatchObject({ lottery: '今彩539', drawPeriod: '114000123', status: 'RESONANCE', count: 1 });
    expect(result.cards[0].roads).toHaveLength(1);
    expect(result.cards[0].roads[0]).toMatchObject({
      id: 'road-1:08', validationItemId: 'road-1', referenceOffset: -1, referencePosition: 2,
    });
  });

  it('retains every trigger card while projecting locked source rows without detail leakage', () => {
    const source = explore([
      row({ id: 'a-road-2', explorePeriods: 2, lockedSourceIndex: 0 }),
      row({ id: 'b-road-7', explorePeriods: 7, lockedSourceIndex: 2 }),
      row({ id: 'c-road-13', explorePeriods: 13, lockedSourceIndex: 7 }),
    ]);
    const result = buildMatrixStatusArtifact(source, {
      ...entitlements,
      canUseSeven: false,
      canUseThirteen: false,
      canViewFullStatus: false,
    });
    const card = result.cards.find((candidate) => candidate.ruleId === 'CRITICAL-1');

    expect(card).toMatchObject({
      result: ['08'],
      sameCodeRoadCount: null,
      sameCodeRoadCountLocked: true,
    });
    expect(card?.roads).toHaveLength(3);
    expect(card?.roads.map((road) => road.explorePeriods)).toEqual([2, 7, 13]);
    expect(card?.roads.filter((road) => road.locked === false)).toEqual([
      expect.objectContaining({ explorePeriods: 2, validationItemId: 'a-road-2' }),
    ]);
    const lockedRoads = card?.roads.filter((road) => road.locked === true) ?? [];
    expect(lockedRoads).toHaveLength(2);
    expect(lockedRoads.map((road) => road.id)).toEqual(['b-road-7:08', 'c-road-13:08']);
    expect(lockedRoads.map((road) => Object.keys(road).sort())).toEqual([
      ['explorePeriods', 'id', 'locked', 'result'],
      ['explorePeriods', 'id', 'locked', 'result'],
    ]);
  });

  it('keeps a thirteen-period prediction visible even when every road detail is locked', () => {
    const result = buildMatrixStatusArtifact(explore([
      row({ id: 'thirteen-only', explorePeriods: 13, lockedSourceIndex: 7 }),
    ]), {
      ...entitlements,
      canUseSeven: false,
      canUseThirteen: false,
      canViewFullStatus: false,
    });

    expect(result.cards[0]).toMatchObject({
      result: ['08'],
      sameCodeRoadCount: null,
      sameCodeRoadCountLocked: true,
      roads: [{ result: ['08'], explorePeriods: 13, locked: true }],
    });
  });

  it('treats rows from the first two locked sources as part of the thirteen-source result', () => {
    const result = buildMatrixStatusArtifact(explore([
      row({
        id: 'source-zero',
        explorePeriods: 2,
        lockedSourceIndex: 0,
        lockedSourcePeriod: '114000123',
      }),
    ]), entitlements);

    expect(result.summary).toMatchObject({ status: 'RESONANCE', count: 1 });
    expect(result.cards[0].roads).toHaveLength(1);
  });

  it('uses only the fixed sorted-number orientation for Chapter 15', () => {
    const result = buildMatrixStatusArtifact(explore([
      row(),
      row({ id: 'actual-order', numberOrder: '依實際開獎順序排序' }),
    ]), entitlements);
    expect(result.cards[0].roads).toHaveLength(1);
  });

});
