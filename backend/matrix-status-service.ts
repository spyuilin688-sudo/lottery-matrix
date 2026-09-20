import type { MatrixLottery, MatrixNumberOrder } from '../shared/matrix-status-presets.ts';
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
  consecutive: string;
  highestStreak: number;
  predictionNumbers: string[];
  algorithmType: StatusRoad['algorithmType'];
  numberOrder: MatrixNumberOrder;
  explorePeriods: 2 | 7 | 13;
  exploreDateOffset: number;
  ruleCount: number;
  lockedSourceIndex?: number;
  referenceOffset?: number;
  referencePosition?: number;
};

export type ExploreArtifact = {
  lottery: MatrixLottery;
  drawPeriod: string;
  items: ExploreArtifactRow[];
};

export type TianyanArtifact = {
  lottery: MatrixLottery;
  drawPeriod: string;
  items: Array<{
    id: string;
    number: string;
    lockedPosition: number;
    predictionDistance: number;
    consecutive: string;
    highestStreak: number;
    predictionNumbers: string[];
    numberOrder: MatrixNumberOrder;
    explorePeriods: 2 | 7 | 13;
    exploreDateOffset: number;
    lockedSourceIndex?: number;
  }>;
};

const priority: MatrixStatus[] = ['CRITICAL', 'RESONANCE', 'FOCUS', 'ACTIVE', 'DORMANT'];

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

function sortedStatusRoads(roads: StatusRoad[]) {
  return [...roads].sort((left, right) => (
    right.streak - left.streak
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

export function buildMatrixStatusArtifact(
  explore: ExploreArtifact,
  entitlements: MatrixEntitlements,
) {
  const chapter = evaluateChapter15({
    lottery: explore.lottery,
    drawPeriod: explore.drawPeriod,
    roads: chapterRoads(chapterExploreRows(explore)),
  });
  return {
    lottery: explore.lottery,
    drawPeriod: explore.drawPeriod,
    summary: chapter.summary,
    counts: chapter.counts,
    cards: visibleStatusCards(sortedStatusCards(chapter.cards), entitlements),
  };
}
