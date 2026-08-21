import { describe, expect, it } from 'vitest';
import {
  evaluateChapter15,
  type MatrixStatus,
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
    const duplicate = roads('one-code', 5, repeated('加減', 2));
    duplicate[1] = { ...duplicate[0] };
    const result = evaluateChapter15(source(duplicate));
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0].sameCodeRoadCount).toBe(2);
    expect(result.cards[0].roads).toHaveLength(1);
    expect(result.cards[0]).not.toHaveProperty('ruleClass');
  });

  it('sorts card roads by type, streak, prediction period and position', () => {
    const input = [
      ...roads('one-code', 5, ['拖牌']),
      ...roads('one-code', 6, ['合值']),
      ...roads('one-code', 7, ['加減']),
      ...roads('one-code', 5, ['加減']),
    ];
    input[2].predictionDistance = 3;
    input[3].predictionDistance = 1;
    const result = evaluateChapter15(source(input));
    const resonance = result.cards.find((card) => card.status === 'RESONANCE');
    expect(resonance?.roads.map((road) => [road.algorithmType, road.streak, road.predictionDistance])).toEqual([
      ['加減', 7, 3], ['加減', 5, 1], ['合值', 6, 1], ['拖牌', 5, 1],
    ]);
  });

  it('returns DORMANT with zero when no rule is satisfied', () => {
    expect(evaluateChapter15(source([]))).toMatchObject({
      summary: { status: 'DORMANT', count: 0 }, cards: [],
    });
  });
});
