import { describe, expect, it } from 'vitest';
import { buildMatrixStatusArtifact } from './matrix-status-service';
import { validateCustomStatusConfig } from './matrix-custom-status';

const entitlements = {
  canUseSeven: true, canUseThirteen: true, canUseFullRange: true, canUseTianyan: true,
  canUseTiangong: true, canViewFullStatus: true, canCustomizeStatus: true,
  canUseCompositeCustomRoad: true,
};
const condition = (overrides = {}) => ({
  consecutiveMin: 5, consecutiveMax: 6, roadTypes: ['加減', '合值'], roadRelation: 'any',
  numberOrder: '依號碼由小到大排序', sameCodeMin: 2, sameCodeMax: 4, ...overrides,
});
const config = (rows = [condition()]) => ({
  schemaVersion: 2, lottery: '今彩539', status: 'ACTIVE', explorePeriods: 13, exploreRange: '完整範圍',
  oneCodeGroups: [{ id: 'range', rows }], twoCodeGroups: [],
});
const road = (id: string, overrides = {}) => ({
  id, number: '05', lockedPosition: 1, predictionDistance: 1,
  consecutive: '準5進6', highestStreak: 5, predictionNumbers: ['08'], algorithmType: '加減',
  numberOrder: '依號碼由小到大排序', explorePeriods: 13, exploreDateOffset: 0, ruleCount: 1,
  ...overrides,
});
const evaluate = (items: any[], setting: any = config()) => buildMatrixStatusArtifact(
  { lottery: '今彩539', drawPeriod: '114000123', items }, null, [setting], entitlements,
);

describe('custom status range groups', () => {
  it('accepts numeric consecutive/count ranges and multiple road types', () => {
    expect(validateCustomStatusConfig(config() as any, entitlements)).toEqual({ ok: true });
  });
  it('adds different selected roads and consecutive values before checking both count boundaries', () => {
    const items = [road('a'), road('b', { algorithmType: '合值', highestStreak: 6, consecutive: '準6進7' })];
    expect(evaluate(items).cards.filter(card => card.status === 'ACTIVE')).toHaveLength(1);
    expect(evaluate([...items, road('c'), road('d'), road('e')]).counts.ACTIVE).toBe(0);
  });
  it('never combines different predicted numbers to satisfy rows in one AND group', () => {
    const setting = config([
      condition({ roadTypes: ['加減'], sameCodeMin: 1, sameCodeMax: null }),
      condition({ roadTypes: ['拖牌'], sameCodeMin: 1, sameCodeMax: null }),
    ]);
    expect(evaluate([road('a'), road('b', { algorithmType: '拖牌', predictionNumbers: ['09'] })], setting).counts.ACTIVE).toBe(0);
    expect(evaluate([road('a'), road('b', { algorithmType: '拖牌' })], setting).counts.ACTIVE).toBe(1);
  });
  it('evaluates the two mixed road alternatives separately and merges only qualifying evidence', () => {
    const setting = config([condition({
      roadTypes: ['加減', '合值', '拖牌'], roadRelation: 'all',
      roadTypeAlternatives: [['加減', '拖牌'], ['合值', '拖牌']], sameCodeMin: 3, sameCodeMax: 4,
    })]);
    const items = [road('a'), road('b'), road('c', { algorithmType: '拖牌' }),
      ...Array.from({ length: 5 }, (_, i) => road(`sum-${i}`, { algorithmType: '合值' }))];
    const cards = evaluate(items, setting).cards.filter(card => card.status === 'ACTIVE');
    expect(cards).toHaveLength(1);
    expect(cards[0].sameCodeRoadCount).toBe(3);
    expect(cards[0].roads.map(item => item.id)).toEqual(['a:08', 'b:08', 'c:08']);
  });
  it('emits separate trigger cards for two distinct matching predicted results', () => {
    const cards = evaluate([road('a'), road('b'), road('c', { predictionNumbers: ['09'] }), road('d', { predictionNumbers: ['09'] })]).cards.filter(card => card.status === 'ACTIVE');
    expect(cards.map(card => card.result)).toEqual([['08'], ['09']]);
    expect(new Set(cards.map(card => card.id)).size).toBe(2);
  });
});
