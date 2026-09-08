import { chapter15Rules, type CustomConditionRow, type MatrixLottery, type MatrixNumberOrder } from '../shared/matrix-status-config.ts';

export type MatrixStatus = 'ACTIVE' | 'FOCUS' | 'RESONANCE' | 'CRITICAL' | 'DORMANT';
export type StatusRoadType = '加減' | '合值' | '拖牌' | '複合';
export type MatrixStatusRuleId =
  | 'ACTIVE-1'
  | 'ACTIVE-2'
  | 'FOCUS-1'
  | 'FOCUS-2'
  | 'FOCUS-3'
  | 'FOCUS-4'
  | 'FOCUS-5'
  | 'FOCUS-6'
  | 'RESONANCE-1'
  | 'RESONANCE-2'
  | 'RESONANCE-3'
  | 'RESONANCE-4'
  | 'RESONANCE-5'
  | 'RESONANCE-6'
  | 'RESONANCE-7'
  | 'RESONANCE-8'
  | 'RESONANCE-9'
  | 'RESONANCE-10'
  | 'CRITICAL-1'
  | 'CRITICAL-2'
  | 'CRITICAL-3'
  | 'CRITICAL-4';
export type StatusTriggerRuleId =
  | MatrixStatusRuleId
  | `CUSTOM:${Exclude<MatrixStatus, "DORMANT">}:${string}`;

export type StatusRoad = {
  id: string;
  hitType: 'one-code' | 'two-code';
  result: string[];
  algorithmType: StatusRoadType;
  numberOrder?: MatrixNumberOrder;
  streak: number;
  predictionDistance: number;
  position: number;
  lockedNumber: string;
  explorePeriods: 2 | 7 | 13;
  validationItemId?: string;
  referenceOffset?: number;
  referencePosition?: number;
  validation?: Record<string, unknown>;
};

export type StatusSource = {
  lottery: MatrixLottery;
  drawPeriod: string;
  roads: StatusRoad[];
};

export type StatusTriggerCard = {
  id: string;
  ruleId: StatusTriggerRuleId;
  status: Exclude<MatrixStatus, 'DORMANT'>;
  hitType: StatusRoad['hitType'];
  result: string[];
  sameCodeRoadCount: number;
  roads: StatusRoad[];
};

export type StatusSummary = {
  lottery: MatrixLottery;
  drawPeriod: string;
  status: MatrixStatus;
  count: number;
  message: string;
};

export type Chapter15Result = {
  summary: StatusSummary;
  counts: Record<Exclude<MatrixStatus, 'DORMANT'>, number>;
  cards: StatusTriggerCard[];
};

type Trigger = {
  ruleId: MatrixStatusRuleId;
  status: Exclude<MatrixStatus, 'DORMANT'>;
  roads: StatusRoad[];
};
type RoadGroup = { hitType: StatusRoad['hitType']; result: string[]; roads: StatusRoad[] };

const priority: MatrixStatus[] = ['CRITICAL', 'RESONANCE', 'FOCUS', 'ACTIVE', 'DORMANT'];
const messages: Record<MatrixStatus, string> = {
  ACTIVE: '具備基本參考價值',
  FOCUS: '具備明顯規律集中性',
  RESONANCE: '具備強烈共振效應',
  CRITICAL: '極為罕見版路狀態',
  DORMANT: '本期尚無符合條件的狀態。',
};
const typeOrder: Record<StatusRoadType, number> = { 加減: 0, 合值: 1, 拖牌: 2, 複合: 3 };

export function normalizeResult(values: string[]) {
  return values
    .map((number) => String(number).padStart(2, '0'))
    .sort((left, right) => Number(left) - Number(right) || left.localeCompare(right));
}

function roadKey(road: StatusRoad) {
  return [
    road.id,
    road.hitType,
    normalizeResult(road.result).join(','),
    road.algorithmType,
    road.numberOrder ?? '',
    road.streak,
    road.predictionDistance,
    road.position,
    road.lockedNumber,
    road.explorePeriods,
  ].join('|');
}

function sortRoads(roads: StatusRoad[]) {
  return [...roads].sort((left, right) => (
    typeOrder[left.algorithmType] - typeOrder[right.algorithmType]
    || right.streak - left.streak
    || left.predictionDistance - right.predictionDistance
    || left.position - right.position
    || left.id.localeCompare(right.id)
  ));
}

export function uniqueRoads(roads: StatusRoad[]) {
  const seen = new Set<string>();
  return sortRoads(roads).filter((road) => {
    const key = roadKey(road);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function groupRoads(roads: StatusRoad[]): RoadGroup[] {
  const groups = new Map<string, RoadGroup>();
  for (const road of roads) {
    const result = normalizeResult(road.result);
    const key = road.hitType + '|' + result.join(',');
    const group = groups.get(key) ?? { hitType: road.hitType, result, roads: [] };
    group.roads.push({ ...road, result });
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({ ...group, roads: uniqueRoads(group.roads) }));
}

/** One row counts all selected roads within the numeric interval for one result. */
export function matchingConditionRoads(roads: StatusRoad[], row: CustomConditionRow): StatusRoad[] {
  const alternatives = row.roadTypeAlternatives ?? [row.roadTypes];
  const witnesses: StatusRoad[] = [];
  for (const types of alternatives) {
    const matched = uniqueRoads(roads.filter((road) => (
      types.includes(road.algorithmType)
      && road.streak >= row.consecutiveMin && road.streak <= row.consecutiveMax
      && (road.numberOrder ?? '依號碼由小到大排序') === row.numberOrder
    )));
    if (row.roadRelation === 'all' && !types.every((type) => matched.some((road) => road.algorithmType === type))) continue;
    if (matched.length < row.sameCodeMin || (row.sameCodeMax !== null && matched.length > row.sameCodeMax)) continue;
    witnesses.push(...matched);
  }
  return uniqueRoads(witnesses);
}

export function matchingGroupRoads(roads: StatusRoad[], rows: CustomConditionRow[]): StatusRoad[] {
  if (!rows.length) return [];
  const evidence = rows.map((row) => matchingConditionRoads(roads, row));
  return evidence.every((matched) => matched.length > 0) ? uniqueRoads(evidence.flat()) : [];
}

function cardId(group: RoadGroup, ruleId: MatrixStatusRuleId) {
  return [group.hitType, group.result.join(','), ruleId].join(':');
}

export function evaluateChapter15(source: StatusSource): Chapter15Result {
  const cards: StatusTriggerCard[] = [];
  for (const group of groupRoads(source.roads)) {
    const triggers: Trigger[] = chapter15Rules
      .filter((rule) => rule.hitType === group.hitType)
      .map((rule) => ({
        ruleId: rule.ruleId as MatrixStatusRuleId, status: rule.status,
        roads: matchingGroupRoads(group.roads, rule.rows),
      }))
      .filter((trigger) => trigger.roads.length > 0);
    for (const matched of triggers) {
      const witnesses = uniqueRoads(matched.roads);
      cards.push({
        id: cardId(group, matched.ruleId),
        ruleId: matched.ruleId,
        status: matched.status,
        hitType: group.hitType,
        result: group.result,
        sameCodeRoadCount: witnesses.length,
        roads: witnesses,
      });
    }
  }
  const statusOrder = new Map(priority.map((status, index) => [status, index]));
  cards.sort((left, right) => (
    (statusOrder.get(left.status) ?? 99) - (statusOrder.get(right.status) ?? 99)
    || right.sameCodeRoadCount - left.sameCodeRoadCount
    || left.id.localeCompare(right.id)
  ));
  const counts = {
    ACTIVE: cards.filter((card) => card.status === 'ACTIVE').length,
    FOCUS: cards.filter((card) => card.status === 'FOCUS').length,
    RESONANCE: cards.filter((card) => card.status === 'RESONANCE').length,
    CRITICAL: cards.filter((card) => card.status === 'CRITICAL').length,
  };
  const status = priority.find((value) => value !== 'DORMANT' && counts[value as keyof typeof counts] > 0) ?? 'DORMANT';
  const summary: StatusSummary = {
    lottery: source.lottery,
    drawPeriod: source.drawPeriod,
    status,
    count: status === 'DORMANT' ? 0 : counts[status],
    message: messages[status],
  };
  return { summary, counts, cards };
}
