import { describe, expect, it } from 'vitest';
import { buildMatrixStatusArtifact } from './matrix-status-service';
import type { ExploreArtifact, ExploreArtifactRow } from './matrix-explore-service';
import type { TianyanArtifact } from './matrix-tianyan-service';
import type { CustomStatusConfig } from './matrix-custom-status';
import type { MatrixEntitlements } from './matrix-entitlements';

const entitlements: MatrixEntitlements = {
  canUseSeven: true, canUseThirteen: true, canUseFullRange: true, canUseTianyan: true,
  canUseTiangong: false, canViewFullStatus: true, canCustomizeStatus: true,
  canUseCompositeCustomRoad: true,
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

function custom(status: CustomStatusConfig['status'], overrides: Partial<CustomStatusConfig> = {}): CustomStatusConfig {
  return {
    lottery: '今彩539', status, explorePeriods: 13, exploreRange: '完整範圍',
    oneCodeGroups: [{ id: `${status}-group`, rows: [{ consecutive: '準7進8', roadType: '加減', numberOrder: '依號碼由小到大排序', sameCodeQuantity: 1 }] }],
    twoCodeGroups: [], ...overrides,
  };
}

describe('Matrix status artifact orchestration', () => {
  it('builds Chapter 15 from current thirteen-period complete-range Explore roads', () => {
    const result = buildMatrixStatusArtifact(explore([
      row(),
      row({ id: 'ignored-period', explorePeriods: 7 }),
      row({ id: 'ignored-date', exploreDateOffset: 1 }),
    ]), null, [], entitlements);
    expect(result.summary).toMatchObject({ lottery: '今彩539', drawPeriod: '114000123', status: 'RESONANCE', count: 1 });
    expect(result.cards[0].roads).toHaveLength(2);
  });

  it('treats rows from the first two locked sources as part of the thirteen-source result', () => {
    const result = buildMatrixStatusArtifact(explore([
      row({
        id: 'source-zero',
        explorePeriods: 2,
        lockedSourceIndex: 0,
        lockedSourcePeriod: '114000123',
      }),
    ]), null, [], entitlements);

    expect(result.summary).toMatchObject({ status: 'RESONANCE', count: 1 });
    expect(result.cards[0].roads).toHaveLength(1);
  });

  it('uses only the fixed sorted-number orientation for Chapter 15', () => {
    const result = buildMatrixStatusArtifact(explore([
      row(),
      row({ id: 'actual-order', numberOrder: '依實際開獎順序排序' }),
    ]), null, [], entitlements);
    expect(result.cards[0].roads).toHaveLength(1);
  });

  it('replaces Chapter 15 only for the exact custom status slot', () => {
    const defaultResult = buildMatrixStatusArtifact(explore([row()]), null, [custom('RESONANCE', {
      oneCodeGroups: [{ id: 'not-matched', rows: [{ consecutive: '準6進7', roadType: '加減', numberOrder: '依號碼由小到大排序', sameCodeQuantity: 1 }] }],
    })], entitlements);
    expect(defaultResult.summary).toMatchObject({ status: 'DORMANT', count: 0 });

    const mixedResult = buildMatrixStatusArtifact(explore([row()]), null, [custom('CRITICAL')], entitlements);
    expect(mixedResult.summary).toMatchObject({ status: 'CRITICAL', count: 1 });
    expect(mixedResult.counts).toMatchObject({ CRITICAL: 1, RESONANCE: 1 });
  });

  it('shows every road that contributes to a custom same-code threshold', () => {
    const config = custom('ACTIVE', {
      oneCodeGroups: [{ id: 'two-roads', rows: [{ consecutive: '準7進8', roadType: '加減', numberOrder: '依號碼由小到大排序', sameCodeQuantity: 2 }] }],
    });
    const result = buildMatrixStatusArtifact(explore([row(), row({ id: 'road-2', lockedPosition: 2 })]), null, [config], entitlements);
    expect(result.cards.find((card) => card.id === 'custom:ACTIVE:two-roads')).toEqual(expect.objectContaining({
      id: 'custom:ACTIVE:two-roads', sameCodeRoadCount: 2,
      roads: [expect.objectContaining({ id: 'road-1:08' }), expect.objectContaining({ id: 'road-2:08' })],
    }));
  });

  it('sorts custom cards by status priority and their evidence roads by the formal road order', () => {
    const active = custom('ACTIVE', {
      oneCodeGroups: [{ id: 'ordered-roads', rows: [
        { consecutive: '準7進8', roadType: '拖牌', numberOrder: '依號碼由小到大排序', sameCodeQuantity: 1 },
        { consecutive: '準7進8', roadType: '加減', numberOrder: '依號碼由小到大排序', sameCodeQuantity: 1 },
      ] }],
    });
    const result = buildMatrixStatusArtifact(explore([
      row({ id: 'drag', algorithmType: '拖牌' }),
      row({ id: 'add', algorithmType: '加減' }),
    ]), null, [active, custom('CRITICAL')], entitlements);
    expect(result.cards.map((card) => card.status)).toEqual(['CRITICAL', 'RESONANCE', 'FOCUS', 'ACTIVE']);
    expect(result.cards.find((card) => card.id === 'custom:ACTIVE:ordered-roads')?.roads.map((road) => road.algorithmType)).toEqual(['加減', '拖牌']);
  });

  it('counts two composite rule contributions even when they predict the same code', () => {
    const tianyan: TianyanArtifact = {
      lottery: '今彩539', drawPeriod: '114000123', validationById: {}, items: [{
        id: 'tianyan-1', number: '05', lockedPosition: 1, predictionDistance: 1,
        consecutive: '準5進6', highestStreak: 5, predictionNumbers: ['08'], roadType: '複合',
        hitCondition: '準5+（鎖定2碼）', numberOrder: '依號碼由小到大排序', ruleIds: ['a', 'b'],
        explorePeriods: 13, exploreDateOffset: 0,
      }],
    };
    const config = custom('FOCUS', {
      oneCodeGroups: [],
      twoCodeGroups: [{ id: 'two', rows: [{ consecutive: '準5進6', roadType: '複合', numberOrder: '依號碼由小到大排序', sameCodeQuantity: 1 }] }],
    });
    const result = buildMatrixStatusArtifact(explore([]), tianyan, [config], entitlements);
    expect(result.summary).toMatchObject({ status: 'FOCUS', count: 1 });
    expect(result.customTriggers).toEqual([{ status: 'FOCUS', groupId: 'two' }]);
    expect(result.cards).toEqual([expect.objectContaining({ id: 'custom:FOCUS:two', status: 'FOCUS', roads: [expect.objectContaining({ algorithmType: '複合' })] })]);
  });

  it('does not use non-current or non-thirteen-period composite rows for custom status', () => {
    const tianyan: TianyanArtifact = {
      lottery: '今彩539', drawPeriod: '114000123', validationById: {}, items: [{
        id: 'wrong-search', number: '05', lockedPosition: 1, predictionDistance: 1,
        consecutive: '準5進6', highestStreak: 5, predictionNumbers: ['08'], roadType: '複合',
        hitCondition: '準5+（鎖定2碼）', numberOrder: '依號碼由小到大排序', ruleIds: ['a', 'b'],
        explorePeriods: 7, exploreDateOffset: 0,
      }],
    };
    const config = custom('FOCUS', {
      oneCodeGroups: [],
      twoCodeGroups: [{ id: 'two', rows: [{ consecutive: '準5進6', roadType: '複合', numberOrder: '依號碼由小到大排序', sameCodeQuantity: 1 }] }],
    });
    expect(buildMatrixStatusArtifact(explore([]), tianyan, [config], entitlements).summary.status).toBe('DORMANT');
  });

  it('keeps a downgraded composite-only custom slot empty instead of restoring Chapter 15', () => {
    const config = custom('RESONANCE', {
      oneCodeGroups: [{ id: 'composite', rows: [{ consecutive: '準7進8', roadType: '複合', numberOrder: '依號碼由小到大排序', sameCodeQuantity: 1 }] }],
    });
    const result = buildMatrixStatusArtifact(explore([row()]), null, [config], { ...entitlements, canUseCompositeCustomRoad: false });
    expect(result.counts.RESONANCE).toBe(0);
    expect(result.summary.status).toBe('DORMANT');
  });

  it('preserves but does not apply expired custom settings', () => {
    const result = buildMatrixStatusArtifact(explore([row()]), null, [custom('CRITICAL')], { ...entitlements, canCustomizeStatus: false });
    expect(result.summary.status).toBe('RESONANCE');
    expect(result.customSettings[0].evaluation).toMatchObject({ mode: 'chapter15', preserved: true });
  });
});
