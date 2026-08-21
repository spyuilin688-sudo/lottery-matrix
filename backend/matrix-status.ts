import type { MatrixLottery } from './matrix-algorithm';
import type { MatrixNumberOrder } from './matrix-algorithm';

export type MatrixStatus = 'ACTIVE' | 'FOCUS' | 'RESONANCE' | 'CRITICAL' | 'DORMANT';
export type StatusRoadType = '加減' | '合值' | '拖牌' | '複合';

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

type Trigger = { key: string; status: Exclude<MatrixStatus, 'DORMANT'> };
type RoadGroup = { hitType: StatusRoad['hitType']; result: string[]; roads: StatusRoad[] };

const priority: MatrixStatus[] = ['CRITICAL', 'RESONANCE', 'FOCUS', 'ACTIVE', 'DORMANT'];
const messages: Record<MatrixStatus, string> = {
  ACTIVE: '具備基本參考價值',
  FOCUS: '具備明顯規律集中性',
  RESONANCE: '具備強烈共振效應',
  CRITICAL: '極為罕見版路狀態',
  DORMANT: '本期尚無符合條件的狀態。',
};

function groupRoads(roads: StatusRoad[]): RoadGroup[] {
  const groups = new Map<string, RoadGroup>();
  for (const road of roads) {
    const result = road.result.map((number) => String(number).padStart(2, '0'));
    const key = `${road.hitType}|${result.join(',')}`;
    const group = groups.get(key) ?? { hitType: road.hitType, result, roads: [] };
    group.roads.push({ ...road, result });
    groups.set(key, group);
  }
  return [...groups.values()];
}

function count(roads: StatusRoad[], types: StatusRoadType[], minimumStreak: number, maximumStreak: number) {
  return roads.filter((road) => types.includes(road.algorithmType) && road.streak >= minimumStreak && road.streak <= maximumStreak).length;
}

function mixedCount(roads: StatusRoad[], primary: '加減' | '合值', minimumStreak: number, maximumStreak: number) {
  const matched = roads.filter((road) => [primary, '拖牌'].includes(road.algorithmType) && road.streak >= minimumStreak && road.streak <= maximumStreak);
  return matched.some((road) => road.algorithmType === primary) && matched.some((road) => road.algorithmType === '拖牌')
    ? matched.length
    : 0;
}

function firstA(group: RoadGroup): Trigger[] {
  const high = count(group.roads, ['加減', '合值'], 7, 7);
  const low = count(group.roads, ['加減', '合值'], 5, 6);
  const triggers: Trigger[] = [];
  if (high === 1) triggers.push({ key: 'first-a-high-one', status: 'RESONANCE' });
  else if (high >= 2) triggers.push({ key: 'first-a-high-many', status: 'CRITICAL' });
  if (low >= 2 && low <= 4) triggers.push({ key: 'first-a-low-active', status: 'ACTIVE' });
  else if (low >= 5 && low <= 6) triggers.push({ key: 'first-a-low-focus', status: 'FOCUS' });
  else if (low >= 7) triggers.push({ key: 'first-a-low-resonance', status: 'RESONANCE' });
  return triggers;
}

function firstB(group: RoadGroup): Trigger[] {
  const triggers: Trigger[] = [];
  for (const primary of ['加減', '合值'] as const) {
    const high = mixedCount(group.roads, primary, 7, 7);
    const low = mixedCount(group.roads, primary, 5, 6);
    if (high >= 2) triggers.push({ key: `first-b-${primary}-high`, status: 'CRITICAL' });
    if (low >= 3 && low <= 4) triggers.push({ key: `first-b-${primary}-focus`, status: 'FOCUS' });
    else if (low >= 5) triggers.push({ key: `first-b-${primary}-resonance`, status: 'RESONANCE' });
  }
  return triggers;
}

function firstC(group: RoadGroup): Trigger[] {
  const high = count(group.roads, ['拖牌'], 7, 7);
  if (high === 1) return [{ key: 'first-c-one', status: 'FOCUS' }];
  if (high >= 2) return [{ key: 'first-c-many', status: 'CRITICAL' }];
  return [];
}

function firstSpecial(group: RoadGroup): Trigger[] {
  const drag = count(group.roads, ['拖牌'], 7, 7);
  if (drag < 1) return [];
  const triggers: Trigger[] = [];
  if (count(group.roads, ['加減'], 5, 6) >= 1) triggers.push({ key: 'first-special-add-drag', status: 'RESONANCE' });
  if (count(group.roads, ['合值'], 5, 6) >= 1) triggers.push({ key: 'first-special-sum-drag', status: 'RESONANCE' });
  return triggers;
}

function secondD(group: RoadGroup): Trigger[] {
  const types: StatusRoadType[] = ['加減', '合值'];
  const high = count(group.roads, types, 11, 11);
  const middle = count(group.roads, types, 7, 9);
  const broadHigh = count(group.roads, types, 7, 11);
  const low = count(group.roads, types, 5, 6);
  const triggers: Trigger[] = [];
  if (high >= 2) triggers.push({ key: 'second-d-1', status: 'CRITICAL' });
  if (middle >= 3 && middle <= 5) triggers.push({ key: 'second-d-2', status: 'ACTIVE' });
  else if (middle >= 6 && middle <= 7) triggers.push({ key: 'second-d-3', status: 'FOCUS' });
  else if (middle >= 8) triggers.push({ key: 'second-d-4', status: 'RESONANCE' });
  if (high >= 1 && middle === 1) triggers.push({ key: 'second-d-5', status: 'FOCUS' });
  if (high >= 1 && middle >= 2) triggers.push({ key: 'second-d-6', status: 'RESONANCE' });
  if (broadHigh >= 3 && low >= 6 && low <= 7) triggers.push({ key: 'second-d-7', status: 'FOCUS' });
  if (broadHigh >= 6 && low >= 8) triggers.push({ key: 'second-d-8', status: 'RESONANCE' });
  return triggers;
}

function secondSpecial(group: RoadGroup): Trigger[] {
  if (count(group.roads, ['拖牌'], 7, 9) < 1) return [];
  const triggers: Trigger[] = [];
  if (count(group.roads, ['加減'], 5, 6) >= 6) triggers.push({ key: 'second-special-add-drag', status: 'RESONANCE' });
  if (count(group.roads, ['合值'], 5, 6) >= 6) triggers.push({ key: 'second-special-sum-drag', status: 'RESONANCE' });
  return triggers;
}

function sortRoads(roads: StatusRoad[]) {
  const typeOrder: Record<StatusRoadType, number> = { 加減: 0, 合值: 1, 拖牌: 2, 複合: 3 };
  return [...roads].sort((left, right) => (
    typeOrder[left.algorithmType] - typeOrder[right.algorithmType]
    || right.streak - left.streak
    || left.predictionDistance - right.predictionDistance
    || left.position - right.position
    || left.id.localeCompare(right.id)
  ));
}

function displayedRoads(roads: StatusRoad[]) {
  const seen = new Set<string>();
  return sortRoads(roads).filter((road) => {
    const key = [road.id, road.algorithmType, road.streak, road.predictionDistance, road.position, road.lockedNumber].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function cardId(group: RoadGroup, key: string) {
  return `${group.hitType}:${group.result.join(',')}:${key}`;
}

export function evaluateChapter15(source: StatusSource): Chapter15Result {
  const cards: StatusTriggerCard[] = [];
  for (const group of groupRoads(source.roads)) {
    const triggers = group.hitType === 'one-code'
      ? [...firstA(group), ...firstB(group), ...firstC(group), ...firstSpecial(group)]
      : [...secondD(group), ...secondSpecial(group)];
    for (const trigger of triggers) {
      cards.push({
        id: cardId(group, trigger.key),
        status: trigger.status,
        hitType: group.hitType,
        result: group.result,
        sameCodeRoadCount: group.roads.length,
        roads: displayedRoads(group.roads),
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
