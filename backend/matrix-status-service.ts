import {
  evaluateCustomStatusRoads,
  normalizeCustomStatusConfig,
  type CustomGroupResult,
  resolveStatusEvaluationMode,
  type CustomConditionMatch,
  type CustomStatusConfig,
} from './matrix-custom-status.ts';
import type { MatrixEntitlements } from './matrix-entitlements.ts';
import {
  evaluateChapter15,
  type MatrixStatus,
  type StatusRoad,
  type StatusTriggerCard,
} from './matrix-status.ts';

export type ProjectedStatusRoad =
  | (StatusRoad & { locked: false })
  | { id: string; result: string[]; explorePeriods: 2 | 7 | 13; locked: true };

export type ProjectedStatusTriggerCard = Omit<StatusTriggerCard, 'sameCodeRoadCount' | 'roads'> & {
  sameCodeRoadCount: number | null;
  sameCodeRoadCountLocked: boolean;
  roads: ProjectedStatusRoad[];
};

type ExploreArtifactRow = {
  id: string;
  number: string;
  lockedPosition: number;
  predictionDistance: number;
  consecutive: CustomConditionMatch['consecutive'];
  highestStreak: number;
  predictionNumbers: string[];
  algorithmType: StatusRoad['algorithmType'];
  numberOrder: CustomConditionMatch['numberOrder'];
  explorePeriods: 2 | 7 | 13;
  exploreDateOffset: number;
  ruleCount: number;
  lockedSourceIndex?: number;
  referenceOffset?: number;
  referencePosition?: number;
};

export type ExploreArtifact = {
  lottery: CustomStatusConfig['lottery'];
  drawPeriod: string;
  items: ExploreArtifactRow[];
};

export type TianyanArtifact = {
  lottery: CustomStatusConfig['lottery'];
  drawPeriod: string;
  items: Array<{
    id: string;
    number: string;
    lockedPosition: number;
    predictionDistance: number;
    consecutive: CustomConditionMatch['consecutive'];
    highestStreak: number;
    predictionNumbers: string[];
    numberOrder: CustomConditionMatch['numberOrder'];
    explorePeriods: 2 | 7 | 13;
    exploreDateOffset: number;
    lockedSourceIndex?: number;
  }>;
};

const priority: MatrixStatus[] = ['CRITICAL', 'RESONANCE', 'FOCUS', 'ACTIVE', 'DORMANT'];
const messages: Record<MatrixStatus, string> = {
  ACTIVE: '具備基本參考價值',
  FOCUS: '具備明顯規律集中性',
  RESONANCE: '具備強烈共振效應',
  CRITICAL: '極為罕見版路狀態',
  DORMANT: '本期尚無符合條件的狀態。',
};

function normalizedResult(values: string[]) {
  return values.map((value) => String(value).padStart(2, '0'));
}

function eligibleExploreRows(artifact: ExploreArtifact) {
  return artifact.items.filter((item) => (
    item.exploreDateOffset === 0
    && (item.lockedSourceIndex === undefined
      ? item.explorePeriods === 13
      : item.lockedSourceIndex < 13)
  ));
}

function chapterExploreRows(artifact: ExploreArtifact) {
  return eligibleExploreRows(artifact).filter((item) => item.numberOrder === '依號碼由小到大排序');
}

function chapterRoads(items: ExploreArtifactRow[]): StatusRoad[] {
  const roads: StatusRoad[] = [];
  for (const item of items) {
    const results = normalizedResult(item.predictionNumbers);
    if (results.length === 0) continue;
    if (item.ruleCount === 1) {
      for (const result of results) {
        roads.push({
          id: `${item.id}:${result}`,
          hitType: 'one-code',
          result: [result],
          algorithmType: item.algorithmType,
          numberOrder: item.numberOrder,
          streak: item.highestStreak,
          predictionDistance: item.predictionDistance,
          position: item.lockedPosition,
          lockedNumber: item.number,
          explorePeriods: item.explorePeriods,
          validationItemId: item.id,
          referenceOffset: item.referenceOffset,
          referencePosition: item.referencePosition,
        });
      }
    } else {
      roads.push({
        id: item.id,
        hitType: 'two-code',
        result: results,
        algorithmType: item.algorithmType,
        numberOrder: item.numberOrder,
        streak: item.highestStreak,
        predictionDistance: item.predictionDistance,
        position: item.lockedPosition,
        lockedNumber: item.number,
        explorePeriods: item.explorePeriods,
        validationItemId: item.id,
        referenceOffset: item.referenceOffset,
        referencePosition: item.referencePosition,
      });
    }
  }
  return roads;
}

function tianyanRoads(artifact: TianyanArtifact | null): StatusRoad[] {
  if (!artifact) return [];
  return artifact.items.filter((item) => (
    item.exploreDateOffset === 0
    && (item.lockedSourceIndex === undefined ? item.explorePeriods === 13 : item.lockedSourceIndex < 13)
    && item.predictionNumbers.length > 0
  )).map((item) => ({
    id: item.id, hitType: 'two-code', result: normalizedResult(item.predictionNumbers),
    algorithmType: '複合', numberOrder: item.numberOrder, streak: item.highestStreak,
    predictionDistance: item.predictionDistance, position: item.lockedPosition,
    lockedNumber: item.number, explorePeriods: item.explorePeriods, validationItemId: item.id,
  }));
}

function sortedStatusRoads(roads: StatusRoad[]) {
  const typeOrder: Record<StatusRoad['algorithmType'], number> = { 加減: 0, 合值: 1, 拖牌: 2, 複合: 3 };
  return [...roads].sort((left, right) => (
    typeOrder[left.algorithmType] - typeOrder[right.algorithmType]
    || right.streak - left.streak
    || left.predictionDistance - right.predictionDistance
    || left.position - right.position
    || left.id.localeCompare(right.id)
  ));
}

function sortedStatusCards(cards: StatusTriggerCard[]) {
  const statusOrder = new Map(priority.map((status, index) => [status, index]));
  return [...cards].sort((left, right) => (
    (statusOrder.get(left.status) ?? 99) - (statusOrder.get(right.status) ?? 99)
    || right.sameCodeRoadCount - left.sameCodeRoadCount
    || left.id.localeCompare(right.id)
  ));
}

function visibleStatusCards(
  cards: StatusTriggerCard[],
  entitlements: MatrixEntitlements,
): ProjectedStatusTriggerCard[] {
  return cards.map((card) => {
    let hasLockedRoad = false;
    const roads: ProjectedStatusRoad[] = [];
    for (const road of sortedStatusRoads(card.roads)) {
      const entitled = road.explorePeriods === 2
        || (road.explorePeriods === 7 && entitlements.canUseSeven)
        || (road.explorePeriods === 13 && entitlements.canUseThirteen);
      if (entitled) roads.push({ ...road, locked: false });
      else {
        hasLockedRoad = true;
        roads.push({
          id: road.id,
          result: [...road.result],
          explorePeriods: road.explorePeriods,
          locked: true as const,
        });
      }
    }
    return {
      ...card,
      sameCodeRoadCount: hasLockedRoad ? null : card.sameCodeRoadCount,
      sameCodeRoadCountLocked: hasLockedRoad,
      roads,
    };
  });
}

function customCard(status: CustomStatusConfig['status'], match: CustomGroupResult): StatusTriggerCard {
  return {
    id: `custom:${status}:${match.groupId}:${match.result.join(',')}`,
    ruleId: `CUSTOM:${status}:${match.groupId}`,
    status, hitType: match.hitType, result: match.result,
    sameCodeRoadCount: match.roads.length, roads: match.roads,
  };
}

function withoutExcludedGroups(config: CustomStatusConfig, excludedGroupIds: string[]) {
  const excluded = new Set(excludedGroupIds);
  return {
    ...config,
    oneCodeGroups: config.oneCodeGroups.filter((group) => !excluded.has(group.id)),
    twoCodeGroups: config.twoCodeGroups.filter((group) => !excluded.has(group.id)),
  };
}

export function buildMatrixStatusArtifact(
  explore: ExploreArtifact,
  tianyan: TianyanArtifact | null,
  configs: CustomStatusConfig[],
  entitlements: MatrixEntitlements,
) {
  if (tianyan && (tianyan.lottery !== explore.lottery || tianyan.drawPeriod !== explore.drawPeriod)) {
    throw new Error('INVALID_REQUEST');
  }
  const exploreRows = eligibleExploreRows(explore);
  const chapter = evaluateChapter15({
    lottery: explore.lottery,
    drawPeriod: explore.drawPeriod,
    roads: chapterRoads(chapterExploreRows(explore)),
  });
  let cards: StatusTriggerCard[] = [...chapter.cards];
  const counts = { ...chapter.counts };
  const customRoads = [...chapterRoads(exploreRows.filter((row) => row.ruleCount === 1 || row.ruleCount === 2)), ...tianyanRoads(tianyan)];
  const customTriggers: Array<{ status: CustomStatusConfig['status']; groupId: string }> = [];
  const customSettings = configs
    .filter((config) => config.lottery === explore.lottery)
    .map(normalizeCustomStatusConfig)
    .map((config) => {
      const evaluation = resolveStatusEvaluationMode(config, entitlements);
      if (evaluation.mode === 'custom') {
        const activeConfig = withoutExcludedGroups(config, evaluation.excludedGroupIds);
        const result = evaluateCustomStatusRoads(activeConfig, customRoads);
        cards = cards.filter((card) => card.status !== config.status);
        counts[config.status] = result.matchedGroups.length;
        customTriggers.push(...result.matchedGroupIds.map((groupId) => ({ status: config.status, groupId })));
        cards.push(...result.matchedGroups.map((match) => customCard(config.status, match)));
      }
      return { config, evaluation };
    });
  const status = priority.find((value) => value !== 'DORMANT' && counts[value] > 0) ?? 'DORMANT';
  return {
    lottery: explore.lottery,
    drawPeriod: explore.drawPeriod,
    summary: {
      lottery: explore.lottery,
      drawPeriod: explore.drawPeriod,
      status,
      count: status === 'DORMANT' ? 0 : counts[status],
      message: messages[status],
    },
    counts,
    cards: visibleStatusCards(sortedStatusCards(cards), entitlements),
    customTriggers,
    customSettings,
  };
}
