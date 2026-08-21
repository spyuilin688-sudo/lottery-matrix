import {
  evaluateCustomStatus,
  resolveStatusEvaluationMode,
  type CustomConditionGroup,
  type CustomConditionMatch,
  type CustomConditionRow,
  type CustomStatusConfig,
} from './matrix-custom-status';
import type { MatrixEntitlements } from './matrix-entitlements';
import type { ExploreArtifact, ExploreArtifactRow } from './matrix-explore-service';
import {
  evaluateChapter15,
  type MatrixStatus,
  type StatusRoad,
  type StatusTriggerCard,
} from './matrix-status';
import type { TianyanArtifact } from './matrix-tianyan-service';

const priority: MatrixStatus[] = ['CRITICAL', 'RESONANCE', 'FOCUS', 'ACTIVE', 'DORMANT'];
const messages: Record<MatrixStatus, string> = {
  ACTIVE: '具備基本參考價值',
  FOCUS: '具備明顯規律集中性',
  RESONANCE: '具備強烈共振效應',
  CRITICAL: '極為罕見版路狀態',
  DORMANT: '本期尚無符合條件的狀態。',
};

type MatchSeed = Omit<CustomConditionMatch, 'sameCodeQuantity'> & { road: StatusRoad };
type CountedMatch = MatchSeed & Pick<CustomConditionMatch, 'sameCodeQuantity'>;

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
      });
    }
  }
  return roads;
}

function exploreMatchSeeds(items: ExploreArtifactRow[]): MatchSeed[] {
  const seeds: MatchSeed[] = [];
  for (const item of items) {
    const results = normalizedResult(item.predictionNumbers);
    if (results.length === 0) continue;
    const common = {
      consecutive: item.consecutive as CustomConditionMatch['consecutive'],
      roadType: item.algorithmType,
      numberOrder: item.numberOrder,
      lockedCodeContributions: item.ruleCount,
    } as const;
    if (item.ruleCount === 1) {
      for (const result of results) seeds.push({
        ...common,
        hitType: 'one-code',
        result: [result],
        road: {
          id: `${item.id}:${result}`, hitType: 'one-code', result: [result], algorithmType: item.algorithmType,
          numberOrder: item.numberOrder, streak: item.highestStreak, predictionDistance: item.predictionDistance,
          position: item.lockedPosition, lockedNumber: item.number, explorePeriods: 13,
        },
      });
    } else {
      seeds.push({
        ...common,
        hitType: 'two-code',
        result: results,
        road: {
          id: item.id, hitType: 'two-code', result: results, algorithmType: item.algorithmType,
          numberOrder: item.numberOrder, streak: item.highestStreak, predictionDistance: item.predictionDistance,
          position: item.lockedPosition, lockedNumber: item.number, explorePeriods: 13,
        },
      });
    }
  }
  return seeds;
}

function tianyanMatchSeeds(artifact: TianyanArtifact | null): MatchSeed[] {
  if (!artifact) return [];
  return artifact.items
    .filter((item) => (
      item.exploreDateOffset === 0
      && (item.lockedSourceIndex === undefined
        ? item.explorePeriods === 13
        : item.lockedSourceIndex < 13)
    ))
    .map((item) => ({
    hitType: 'two-code',
    consecutive: item.consecutive,
    roadType: '複合',
    numberOrder: item.numberOrder,
    lockedCodeContributions: 2,
    result: normalizedResult(item.predictionNumbers),
    road: {
      id: item.id,
      hitType: 'two-code',
      result: normalizedResult(item.predictionNumbers),
      algorithmType: '複合',
      numberOrder: item.numberOrder,
      streak: item.highestStreak,
      predictionDistance: item.predictionDistance,
      position: item.lockedPosition,
      lockedNumber: item.number,
      explorePeriods: 13,
    },
  }));
}

function matchKey(match: MatchSeed) {
  return [match.hitType, match.consecutive, match.roadType, match.numberOrder, match.result.join(',')].join('|');
}

function customMatches(exploreRows: ExploreArtifactRow[], tianyan: TianyanArtifact | null) {
  const seeds = [...exploreMatchSeeds(exploreRows), ...tianyanMatchSeeds(tianyan)];
  const counts = new Map<string, number>();
  for (const seed of seeds) counts.set(matchKey(seed), (counts.get(matchKey(seed)) ?? 0) + 1);
  return seeds.map((seed) => ({ ...seed, sameCodeQuantity: counts.get(matchKey(seed)) ?? 1 }));
}

function rowMatches(row: CustomConditionRow, hitType: CustomConditionMatch['hitType'], match: CountedMatch) {
  return match.hitType === hitType
    && match.lockedCodeContributions === (hitType === 'one-code' ? 1 : 2)
    && match.consecutive === row.consecutive
    && match.roadType === row.roadType
    && match.numberOrder === row.numberOrder
    && match.sameCodeQuantity >= row.sameCodeQuantity;
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

function sameResult(left: string[], right: string[]) {
  return left.join(',') === right.join(',');
}

function visibleStatusCards(
  cards: StatusTriggerCard[],
  explore: ExploreArtifact,
  entitlements: MatrixEntitlements,
) {
  const periods = entitlements.canUseThirteen
    ? new Set([2, 7, 13])
    : entitlements.canUseSeven
      ? new Set([2, 7])
      : new Set([2]);
  const exploreRoads = chapterRoads(explore.items.filter((item) => (
    item.exploreDateOffset === 0
    && item.numberOrder === '依號碼由小到大排序'
    && periods.has(item.explorePeriods)
  )));
  return cards.map((card) => {
    const candidates = [
      ...exploreRoads,
      ...(entitlements.canUseThirteen ? card.roads : []),
    ].filter((road) => road.hitType === card.hitType && sameResult(road.result, card.result));
    const roads = sortedStatusRoads([
      ...new Map(candidates.map((road) => [
        [road.id, road.explorePeriods, road.result.join(',')].join('|'),
        road,
      ])).values(),
    ]);
    return { ...card, roads };
  });
}

function customCard(status: CustomStatusConfig['status'], group: CustomConditionGroup, hitType: CustomConditionMatch['hitType'], matches: CountedMatch[]): StatusTriggerCard {
  const witnesses = group.rows.flatMap((row) => matches.filter((match) => rowMatches(row, hitType, match)));
  const roads = sortedStatusRoads([...new Map(witnesses.map((match) => [match.road.id, match.road])).values()]);
  const result = [...new Set(witnesses.flatMap((match) => match.result))];
  return {
    id: `custom:${status}:${group.id}`,
    status,
    hitType,
    result,
    sameCodeRoadCount: roads.length,
    roads,
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
  const matches = customMatches(exploreRows, tianyan);
  const customTriggers: Array<{ status: CustomStatusConfig['status']; groupId: string }> = [];
  const customSettings = configs
    .filter((config) => config.lottery === explore.lottery)
    .map((config) => {
      const evaluation = resolveStatusEvaluationMode(config, entitlements);
      if (evaluation.mode === 'custom') {
        const activeConfig = withoutExcludedGroups(config, evaluation.excludedGroupIds);
        const result = evaluateCustomStatus(activeConfig, matches);
        cards = cards.filter((card) => card.status !== config.status);
        counts[config.status] = result.matchedGroupIds.length;
        customTriggers.push(...result.matchedGroupIds.map((groupId) => ({ status: config.status, groupId })));
        const matched = new Set(result.matchedGroupIds);
        cards.push(
          ...activeConfig.oneCodeGroups.filter((group) => matched.has(group.id)).map((group) => customCard(config.status, group, 'one-code', matches)),
          ...activeConfig.twoCodeGroups.filter((group) => matched.has(group.id)).map((group) => customCard(config.status, group, 'two-code', matches)),
        );
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
    cards: visibleStatusCards(sortedStatusCards(cards), explore, entitlements),
    customTriggers,
    customSettings,
  };
}
