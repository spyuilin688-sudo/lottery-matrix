import type { MatrixLottery, MatrixNumberOrder } from './matrix-custom-status.ts';

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
export type StatusTriggerRuleId = MatrixStatusRuleId | string;

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

function normalizeResult(values: string[]) {
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

function uniqueRoads(roads: StatusRoad[]) {
  const seen = new Set<string>();
  return sortRoads(roads).filter((road) => {
    const key = roadKey(road);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function groupRoads(roads: StatusRoad[]): RoadGroup[] {
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

function matchingRoads(
  roads: StatusRoad[],
  types: StatusRoadType[],
  minimumStreak: number,
  maximumStreak: number,
) {
  return uniqueRoads(roads.filter((road) => (
    types.includes(road.algorithmType)
    && road.streak >= minimumStreak
    && road.streak <= maximumStreak
  )));
}

function mixedRoads(
  roads: StatusRoad[],
  primary: '加減' | '合值',
  minimumStreak: number,
  maximumStreak: number,
) {
  const matched = matchingRoads(roads, [primary, '拖牌'], minimumStreak, maximumStreak);
  return matched.some((road) => road.algorithmType === primary)
    && matched.some((road) => road.algorithmType === '拖牌')
    ? matched
    : [];
}

function qualifiedMixedRoads(
  roads: StatusRoad[],
  minimumStreak: number,
  maximumStreak: number,
  qualifies: (count: number) => boolean,
) {
  return uniqueRoads((['加減', '合值'] as const).flatMap((primary) => {
    const matched = mixedRoads(roads, primary, minimumStreak, maximumStreak);
    return qualifies(matched.length) ? matched : [];
  }));
}

function trigger(
  ruleId: MatrixStatusRuleId,
  status: Trigger['status'],
  roads: StatusRoad[],
): Trigger {
  return { ruleId, status, roads: uniqueRoads(roads) };
}

function firstA(group: RoadGroup): Trigger[] {
  const high = matchingRoads(group.roads, ['加減', '合值'], 7, 7);
  const low = matchingRoads(group.roads, ['加減', '合值'], 5, 6);
  const triggers: Trigger[] = [];
  if (high.length === 1) triggers.push(trigger('RESONANCE-1', 'RESONANCE', high));
  else if (high.length >= 2) triggers.push(trigger('CRITICAL-1', 'CRITICAL', high));
  if (low.length >= 2 && low.length <= 4) triggers.push(trigger('ACTIVE-1', 'ACTIVE', low));
  else if (low.length >= 5 && low.length <= 6) triggers.push(trigger('FOCUS-1', 'FOCUS', low));
  else if (low.length >= 7) triggers.push(trigger('RESONANCE-2', 'RESONANCE', low));
  return triggers;
}

function firstB(group: RoadGroup): Trigger[] {
  const critical = qualifiedMixedRoads(group.roads, 7, 7, (count) => count >= 2);
  const focus = qualifiedMixedRoads(group.roads, 5, 6, (count) => count >= 3 && count <= 4);
  const resonance = qualifiedMixedRoads(group.roads, 5, 6, (count) => count >= 5);
  return [
    ...(critical.length > 0 ? [trigger('CRITICAL-2', 'CRITICAL', critical)] : []),
    ...(focus.length > 0 ? [trigger('FOCUS-2', 'FOCUS', focus)] : []),
    ...(resonance.length > 0 ? [trigger('RESONANCE-3', 'RESONANCE', resonance)] : []),
  ];
}

function firstC(group: RoadGroup): Trigger[] {
  const high = matchingRoads(group.roads, ['拖牌'], 7, 7);
  if (high.length === 1) return [trigger('FOCUS-3', 'FOCUS', high)];
  if (high.length >= 2) return [trigger('CRITICAL-3', 'CRITICAL', high)];
  return [];
}

function firstSpecial(group: RoadGroup): Trigger[] {
  const drag = matchingRoads(group.roads, ['拖牌'], 7, 7);
  if (drag.length < 1) return [];
  const add = matchingRoads(group.roads, ['加減'], 5, 6);
  const sum = matchingRoads(group.roads, ['合值'], 5, 6);
  return [
    ...(add.length > 0 ? [trigger('RESONANCE-4', 'RESONANCE', [...drag, ...add])] : []),
    ...(sum.length > 0 ? [trigger('RESONANCE-5', 'RESONANCE', [...drag, ...sum])] : []),
  ];
}

function secondD(group: RoadGroup): Trigger[] {
  const types: StatusRoadType[] = ['加減', '合值'];
  const high = matchingRoads(group.roads, types, 11, 11);
  const middle = matchingRoads(group.roads, types, 7, 9);
  const broadHigh = matchingRoads(group.roads, types, 7, 11);
  const low = matchingRoads(group.roads, types, 5, 6);
  const triggers: Trigger[] = [];
  if (high.length >= 2) triggers.push(trigger('CRITICAL-4', 'CRITICAL', high));
  if (middle.length >= 3 && middle.length <= 5) triggers.push(trigger('ACTIVE-2', 'ACTIVE', middle));
  else if (middle.length >= 6 && middle.length <= 7) triggers.push(trigger('FOCUS-4', 'FOCUS', middle));
  else if (middle.length >= 8) triggers.push(trigger('RESONANCE-6', 'RESONANCE', middle));
  if (high.length >= 1 && middle.length === 1) {
    triggers.push(trigger('FOCUS-5', 'FOCUS', [...high, ...middle]));
  }
  if (high.length >= 1 && middle.length >= 2) {
    triggers.push(trigger('RESONANCE-7', 'RESONANCE', [...high, ...middle]));
  }
  if (broadHigh.length >= 3 && low.length >= 6 && low.length <= 7) {
    triggers.push(trigger('FOCUS-6', 'FOCUS', [...broadHigh, ...low]));
  }
  if (broadHigh.length >= 6 && low.length >= 8) {
    triggers.push(trigger('RESONANCE-8', 'RESONANCE', [...broadHigh, ...low]));
  }
  return triggers;
}

function secondSpecial(group: RoadGroup): Trigger[] {
  const drag = matchingRoads(group.roads, ['拖牌'], 7, 9);
  if (drag.length < 1) return [];
  const add = matchingRoads(group.roads, ['加減'], 5, 6);
  const sum = matchingRoads(group.roads, ['合值'], 5, 6);
  return [
    ...(add.length >= 6 ? [trigger('RESONANCE-9', 'RESONANCE', [...drag, ...add])] : []),
    ...(sum.length >= 6 ? [trigger('RESONANCE-10', 'RESONANCE', [...drag, ...sum])] : []),
  ];
}

function cardId(group: RoadGroup, ruleId: MatrixStatusRuleId) {
  return [group.hitType, group.result.join(','), ruleId].join(':');
}

export function evaluateChapter15(source: StatusSource): Chapter15Result {
  const cards: StatusTriggerCard[] = [];
  for (const group of groupRoads(source.roads)) {
    const triggers = group.hitType === 'one-code'
      ? [...firstA(group), ...firstB(group), ...firstC(group), ...firstSpecial(group)]
      : [...secondD(group), ...secondSpecial(group)];
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
