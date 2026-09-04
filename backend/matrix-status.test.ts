import { describe, expect, it } from 'vitest';
import {
  evaluateChapter15,
  type MatrixStatus,
  type MatrixStatusRuleId,
  type StatusRoad,
  type StatusSource,
} from './matrix-status';

type RoadType = StatusRoad['algorithmType'];
let sequence = 0;
function roads(hitType: StatusRoad['hitType'], streak: number, types: RoadType[], result = hitType === 'one-code' ? ['08'] : ['08', '22']): StatusRoad[] {
  return types.map((algorithmType, index) => ({
    id: `road-${sequence++}-${index}`,
    hitType,
    result,
    algorithmType,
    streak,
    predictionDistance: index + 1,
    position: index + 1,
    lockedNumber: String(index + 1).padStart(2, '0'),
    explorePeriods: 13,
  }));
}

function source(allRoads: StatusRoad[]): StatusSource {
  return { lottery: '今彩539', drawPeriod: '114000123', roads: allRoads };
}

function repeated(type: RoadType, count: number) { return Array(count).fill(type) as RoadType[]; }

type RuleCase = {
  ruleId: MatrixStatusRuleId;
  status: Exclude<MatrixStatus, 'DORMANT'>;
  allRoads: StatusRoad[];
};

const ruleCases: RuleCase[] = [
  { ruleId: 'ACTIVE-1', status: 'ACTIVE', allRoads: roads('one-code', 5, repeated('加減', 2)) },
  { ruleId: 'ACTIVE-2', status: 'ACTIVE', allRoads: roads('two-code', 7, repeated('合值', 3)) },
  { ruleId: 'FOCUS-1', status: 'FOCUS', allRoads: roads('one-code', 6, repeated('加減', 5)) },
  { ruleId: 'FOCUS-2', status: 'FOCUS', allRoads: roads('one-code', 5, ['加減', '加減', '拖牌']) },
  { ruleId: 'FOCUS-3', status: 'FOCUS', allRoads: roads('one-code', 7, ['拖牌']) },
  { ruleId: 'FOCUS-4', status: 'FOCUS', allRoads: roads('two-code', 8, repeated('合值', 6)) },
  { ruleId: 'FOCUS-5', status: 'FOCUS', allRoads: [...roads('two-code', 11, ['加減']), ...roads('two-code', 7, ['合值'])] },
  { ruleId: 'FOCUS-6', status: 'FOCUS', allRoads: [...roads('two-code', 11, repeated('加減', 3)), ...roads('two-code', 5, repeated('合值', 6))] },
  { ruleId: 'RESONANCE-1', status: 'RESONANCE', allRoads: roads('one-code', 7, ['加減']) },
  { ruleId: 'RESONANCE-2', status: 'RESONANCE', allRoads: roads('one-code', 5, repeated('合值', 7)) },
  { ruleId: 'RESONANCE-3', status: 'RESONANCE', allRoads: roads('one-code', 6, ['加減', '加減', '加減', '加減', '拖牌']) },
  { ruleId: 'RESONANCE-4', status: 'RESONANCE', allRoads: [...roads('one-code', 7, ['拖牌']), ...roads('one-code', 5, ['加減'])] },
  { ruleId: 'RESONANCE-5', status: 'RESONANCE', allRoads: [...roads('one-code', 7, ['拖牌']), ...roads('one-code', 6, ['合值'])] },
  { ruleId: 'RESONANCE-6', status: 'RESONANCE', allRoads: roads('two-code', 9, repeated('加減', 8)) },
  { ruleId: 'RESONANCE-7', status: 'RESONANCE', allRoads: [...roads('two-code', 11, ['加減']), ...roads('two-code', 8, ['合值', '加減'])] },
  { ruleId: 'RESONANCE-8', status: 'RESONANCE', allRoads: [...roads('two-code', 11, repeated('加減', 6)), ...roads('two-code', 5, repeated('合值', 8))] },
  { ruleId: 'RESONANCE-9', status: 'RESONANCE', allRoads: [...roads('two-code', 7, ['拖牌']), ...roads('two-code', 5, repeated('加減', 6))] },
  { ruleId: 'RESONANCE-10', status: 'RESONANCE', allRoads: [...roads('two-code', 9, ['拖牌']), ...roads('two-code', 6, repeated('合值', 6))] },
  { ruleId: 'CRITICAL-1', status: 'CRITICAL', allRoads: roads('one-code', 7, ['加減', '合值']) },
  { ruleId: 'CRITICAL-2', status: 'CRITICAL', allRoads: roads('one-code', 7, ['加減', '拖牌']) },
  { ruleId: 'CRITICAL-3', status: 'CRITICAL', allRoads: roads('one-code', 7, ['拖牌', '拖牌']) },
  { ruleId: 'CRITICAL-4', status: 'CRITICAL', allRoads: roads('two-code', 11, ['加減', '合值']) },
];

const thresholdCases: Array<{ name: string; allRoads: StatusRoad[]; status: MatrixStatus; count: number }> = [
  { name: 'A 準7進8一組為共振', allRoads: roads('one-code', 7, ['加減']), status: 'RESONANCE', count: 1 },
  { name: 'A 準7進8兩組為臨界', allRoads: roads('one-code', 7, ['加減', '合值']), status: 'CRITICAL', count: 1 },
  { name: 'A 低段一組不觸發', allRoads: roads('one-code', 5, ['加減']), status: 'DORMANT', count: 0 },
  { name: 'A 低段二組為啟動下界', allRoads: roads('one-code', 5, repeated('加減', 2)), status: 'ACTIVE', count: 1 },
  { name: 'A 低段四組為啟動上界', allRoads: roads('one-code', 6, repeated('合值', 4)), status: 'ACTIVE', count: 1 },
  { name: 'A 低段五組為聚合下界', allRoads: roads('one-code', 5, repeated('加減', 5)), status: 'FOCUS', count: 1 },
  { name: 'A 低段六組為聚合上界', allRoads: roads('one-code', 6, repeated('合值', 6)), status: 'FOCUS', count: 1 },
  { name: 'A 低段七組為共振', allRoads: roads('one-code', 5, repeated('加減', 7)), status: 'RESONANCE', count: 1 },
  { name: 'B 低段兩組不觸發', allRoads: roads('one-code', 5, ['加減', '拖牌']), status: 'DORMANT', count: 0 },
  { name: 'B 低段三組為聚合', allRoads: roads('one-code', 5, ['加減', '加減', '拖牌']), status: 'FOCUS', count: 1 },
  { name: 'B 低段五組為共振', allRoads: roads('one-code', 6, ['合值', '合值', '合值', '合值', '拖牌']), status: 'RESONANCE', count: 1 },
  { name: 'B 高段兩組混合為臨界', allRoads: roads('one-code', 7, ['加減', '拖牌']), status: 'CRITICAL', count: 1 },
  { name: 'B 缺少拖牌時僅命中 A 規則', allRoads: roads('one-code', 5, repeated('加減', 5)), status: 'FOCUS', count: 1 },
  { name: 'C 高段一組為聚合', allRoads: roads('one-code', 7, ['拖牌']), status: 'FOCUS', count: 1 },
  { name: 'C 高段兩組為臨界', allRoads: roads('one-code', 7, ['拖牌', '拖牌']), status: 'CRITICAL', count: 1 },
  { name: '第一類特殊加減拖牌為共振', allRoads: [...roads('one-code', 7, ['拖牌']), ...roads('one-code', 5, ['加減'])], status: 'RESONANCE', count: 1 },
  { name: '第一類特殊合值拖牌為共振', allRoads: [...roads('one-code', 7, ['拖牌']), ...roads('one-code', 6, ['合值'])], status: 'RESONANCE', count: 1 },
  { name: 'D 準11進12兩組為臨界', allRoads: roads('two-code', 11, ['加減', '合值']), status: 'CRITICAL', count: 1 },
  { name: 'D 中段三組為啟動下界', allRoads: roads('two-code', 7, repeated('加減', 3)), status: 'ACTIVE', count: 1 },
  { name: 'D 中段五組為啟動上界', allRoads: roads('two-code', 9, repeated('合值', 5)), status: 'ACTIVE', count: 1 },
  { name: 'D 中段六組為聚合下界', allRoads: roads('two-code', 8, repeated('加減', 6)), status: 'FOCUS', count: 1 },
  { name: 'D 中段七組為聚合上界', allRoads: roads('two-code', 7, repeated('合值', 7)), status: 'FOCUS', count: 1 },
  { name: 'D 中段八組為共振', allRoads: roads('two-code', 9, repeated('加減', 8)), status: 'RESONANCE', count: 1 },
  { name: 'D 高段一組加中段一組為聚合', allRoads: [...roads('two-code', 11, ['加減']), ...roads('two-code', 7, ['合值'])], status: 'FOCUS', count: 1 },
  { name: 'D 高段一組加中段兩組為共振', allRoads: [...roads('two-code', 11, ['加減']), ...roads('two-code', 8, ['合值', '加減'])], status: 'RESONANCE', count: 1 },
  { name: 'D 規則七下界為聚合', allRoads: [...roads('two-code', 7, repeated('加減', 3)), ...roads('two-code', 5, repeated('合值', 6))], status: 'FOCUS', count: 1 },
  { name: 'D 規則八下界為共振', allRoads: [...roads('two-code', 9, repeated('加減', 6)), ...roads('two-code', 6, repeated('合值', 8))], status: 'RESONANCE', count: 1 },
  { name: '第二類特殊加減拖牌為共振', allRoads: [...roads('two-code', 7, ['拖牌']), ...roads('two-code', 5, repeated('加減', 6))], status: 'RESONANCE', count: 1 },
  { name: '第二類特殊合值拖牌為共振', allRoads: [...roads('two-code', 9, ['拖牌']), ...roads('two-code', 6, repeated('合值', 6))], status: 'RESONANCE', count: 1 },
];

describe('Chapter 15 thresholds', () => {
  it.each(thresholdCases)('$name', ({ allRoads, status, count }) => {
    const result = evaluateChapter15(source(allRoads));
    expect(result.summary).toMatchObject({ status, count });
  });

  it.each(ruleCases)('emits $ruleId as one independently identified trigger', ({ ruleId, status, allRoads }) => {
    const card = evaluateChapter15(source(allRoads)).cards.find((candidate) => candidate.ruleId === ruleId);
    expect(card).toEqual(expect.objectContaining({ ruleId, status }));
    expect(card?.sameCodeRoadCount).toBe(card?.roads.length);
  });
});

describe('Chapter 15 cards and ordering', () => {
  it('uses CRITICAL > RESONANCE > FOCUS > ACTIVE priority', () => {
    const result = evaluateChapter15(source([
      ...roads('one-code', 5, repeated('加減', 2), ['01']),
      ...roads('one-code', 7, ['加減'], ['02']),
      ...roads('one-code', 7, ['拖牌', '拖牌'], ['03']),
    ]));
    expect(result.summary.status).toBe('CRITICAL');
    expect(result.summary.count).toBe(1);
    expect(result.cards.map((card) => card.status)).toEqual(['CRITICAL', 'RESONANCE', 'ACTIVE']);
  });

  it('creates one card per satisfied rule and removes duplicate road display inside it', () => {
    const unique = roads('one-code', 5, repeated('加減', 2));
    const result = evaluateChapter15(source([unique[0], { ...unique[0] }, unique[1]]));
    const card = result.cards.find((candidate) => candidate.ruleId === 'ACTIVE-1');
    expect(card?.sameCodeRoadCount).toBe(2);
    expect(card?.roads).toHaveLength(2);
    expect(result.cards[0]).not.toHaveProperty('ruleClass');
  });

  it('keeps only roads used by a trigger and sorts them by the formal order', () => {
    const input = [
      ...roads('one-code', 5, ['加減', '加減']),
      ...roads('one-code', 5, ['拖牌']),
      ...roads('one-code', 7, ['合值']),
    ];
    input[0].predictionDistance = 2;
    input[1].predictionDistance = 1;
    input[2].predictionDistance = 3;
    const result = evaluateChapter15(source(input));
    const focus = result.cards.find((card) => card.ruleId === 'FOCUS-2');
    expect(focus?.roads.map((road) => [road.algorithmType, road.streak, road.predictionDistance])).toEqual([
      ['加減', 5, 1], ['加減', 5, 2], ['拖牌', 5, 3],
    ]);
  });

  it('creates one OR-rule trigger when both mixed-road alternatives qualify', () => {
    const result = evaluateChapter15(source(roads('one-code', 7, ['加減', '合值', '拖牌'])));
    const mixed = result.cards.filter((card) => card.ruleId === 'CRITICAL-2');
    expect(mixed).toHaveLength(1);
    expect(mixed[0].sameCodeRoadCount).toBe(3);
    expect(mixed[0].roads.map((road) => road.algorithmType)).toEqual(['加減', '合值', '拖牌']);
  });

  it('does not emit a mixed-road trigger when either side is absent', () => {
    const noDrag = evaluateChapter15(source(roads('one-code', 5, repeated('加減', 5))));
    const onlyDrag = evaluateChapter15(source(roads('one-code', 7, repeated('拖牌', 4))));
    expect(noDrag.cards.some((card) => ['FOCUS-2', 'RESONANCE-3', 'CRITICAL-2'].includes(card.ruleId))).toBe(false);
    expect(onlyDrag.cards.some((card) => ['FOCUS-2', 'RESONANCE-3', 'CRITICAL-2'].includes(card.ruleId))).toBe(false);
  });

  it('allows one actual road to witness different independently satisfied rules', () => {
    const input = roads('one-code', 7, ['加減', '拖牌']);
    const result = evaluateChapter15(source(input));
    const addRoadId = input[0].id;
    expect(result.cards.find((card) => card.ruleId === 'RESONANCE-1')?.roads.map((road) => road.id)).toContain(addRoadId);
    expect(result.cards.find((card) => card.ruleId === 'CRITICAL-2')?.roads.map((road) => road.id)).toContain(addRoadId);
  });

  it('normalizes a two-code result as one complete result and never combines two one-code groups', () => {
    const pair = [
      ...roads('two-code', 11, ['加減'], ['22', '08']),
      ...roads('two-code', 11, ['合值'], ['08', '22']),
    ];
    const pairResult = evaluateChapter15(source(pair));
    expect(pairResult.cards.find((card) => card.ruleId === 'CRITICAL-4')).toMatchObject({
      hitType: 'two-code',
      result: ['08', '22'],
      sameCodeRoadCount: 2,
    });

    const singles = [
      ...roads('one-code', 11, ['加減'], ['08']),
      ...roads('one-code', 11, ['合值'], ['22']),
    ];
    expect(evaluateChapter15(source(singles)).cards.some((card) => card.hitType === 'two-code')).toBe(false);
  });

  it('returns DORMANT with zero when no rule is satisfied', () => {
    expect(evaluateChapter15(source([]))).toMatchObject({
      summary: { status: 'DORMANT', count: 0 }, cards: [],
    });
  });
});
