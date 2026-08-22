import {
  runMatrixExploreGroupWithHistory,
  type MatrixAlgorithmType,
  type MatrixDraw,
  type MatrixExploreGroupInput,
  type MatrixLottery,
  type MatrixNumberOrder,
} from './matrix-algorithm';
import type { MatrixEntitlements } from './matrix-entitlements';

export type ExploreArtifactRow = {
  id: string;
  number: string;
  lockedPosition: number;
  predictionDistance: number;
  consecutive: string;
  highestStreak: number;
  predictionNumbers: string[];
  algorithmType: MatrixAlgorithmType;
  numberOrder: MatrixNumberOrder;
  explorePeriods: 2 | 7 | 13;
  exploreDateOffset: 0 | 1 | 2;
  ruleCount: 1 | 2;
  lockedSourceIndex?: number;
  lockedSourcePeriod?: string;
  referenceOffset?: number;
  referencePosition?: number;
};

export type ExploreValidation = {
  itemId: string;
  sourceA?: Record<string, unknown>;
  ruleSets: Array<Record<string, unknown>>;
};

export type ExploreArtifact = {
  lottery: MatrixLottery;
  drawPeriod: string;
  items: ExploreArtifactRow[];
  validationById: Record<string, ExploreValidation>;
};

export type ExploreFilterRequest = {
  lottery: MatrixLottery;
  numberOrder: MatrixNumberOrder;
  explorePeriods: 2 | 7 | 13;
  exploreDateOffset: 0 | 1 | 2;
  exploreRange: '標準範圍' | '完整範圍';
  ruleCount: 1 | 2;
  roadTypes: MatrixAlgorithmType[];
  selectedStreaks: string[];
  sameCode: boolean;
};

type ExploreRunInput = MatrixExploreGroupInput;

type ExploreRunnerResult = { results?: Array<Record<string, unknown>> };
type ExploreRunner = (input: ExploreRunInput, history: MatrixDraw[]) => ExploreRunnerResult;

const numberOrders: MatrixNumberOrder[] = [
  '依號碼由小到大排序',
  '依實際開獎順序排序',
];
const algorithmTypes: MatrixAlgorithmType[] = ['加減', '合值', '拖牌'];

function ballCount(lottery: MatrixLottery) {
  return lottery === '今彩539' || lottery === '天天樂' ? 5 : 7;
}

function minimumExplorePeriods(lockedSourceIndex: number): 2 | 7 | 13 {
  if (lockedSourceIndex < 2) return 2;
  if (lockedSourceIndex < 7) return 7;
  return 13;
}

function canonicalId(config: ExploreRunInput, raw: Record<string, unknown>) {
  return [
    config.numberOrder,
    config.lockedSourceIndex,
    config.lockedPosition,
    config.exploreDateOffset,
    config.explorePeriods,
    config.algorithmType,
    String(raw.ruleCount ?? ''),
    String(raw.id ?? ''),
  ].join('|');
}

export function createExploreWorkUnits(
  lottery: MatrixLottery,
  history: MatrixDraw[],
): ExploreRunInput[] {
  const units: ExploreRunInput[] = [];
  const sourceCount = Math.min(13, history.length);
  const positions = ballCount(lottery);
  for (const numberOrder of numberOrders) {
    for (const algorithmType of algorithmTypes) {
      for (let lockedSourceIndex = 0; lockedSourceIndex < sourceCount; lockedSourceIndex += 1) {
        for (let lockedPosition = 1; lockedPosition <= positions; lockedPosition += 1) {
          units.push({
            lottery,
            numberOrder,
            algorithmType,
            lockedSourceIndex,
            lockedPosition,
            explorePeriods: 13,
            exploreDateOffset: 0,
            exploreRange: '完整範圍',
            minPredictionDistance: 1,
            maxPredictionDistance: 13,
          });
        }
      }
    }
  }
  return units;
}

export function buildExploreGroupArtifact(
  drawPeriod: string,
  history: MatrixDraw[],
  input: ExploreRunInput,
  runner: ExploreRunner = runMatrixExploreGroupWithHistory,
): ExploreArtifact {
  const items: ExploreArtifactRow[] = [];
  const validationById: Record<string, ExploreValidation> = {};
  const result = runner(input, history);
  for (const raw of result.results ?? []) {
    const id = canonicalId(input, raw);
    const searchCondition = (raw.searchCondition ?? {}) as Record<string, unknown>;
    const resultRuleCount = Number(raw.ruleCount ?? searchCondition.ruleCount) as 1 | 2;
    if (resultRuleCount !== 1 && resultRuleCount !== 2) continue;
    items.push({
      id,
      number: String(raw.number ?? ''),
      lockedPosition: Number(raw.lockedPosition),
      predictionDistance: Number(raw.predictionDistance),
      consecutive: String(raw.consecutive ?? ''),
      highestStreak: Number(raw.highestStreak),
      predictionNumbers: Array.isArray(raw.predictionNumbers)
        ? raw.predictionNumbers.map(String)
        : [],
      algorithmType: input.algorithmType,
      numberOrder: input.numberOrder,
      explorePeriods: minimumExplorePeriods(input.lockedSourceIndex),
      exploreDateOffset: 0,
      ruleCount: resultRuleCount,
      lockedSourceIndex: input.lockedSourceIndex,
      lockedSourcePeriod: String(raw.lockedSourcePeriod ?? history[input.lockedSourceIndex]?.period ?? ''),
      ...(Number.isInteger(searchCondition.referenceOffset)
        ? { referenceOffset: Number(searchCondition.referenceOffset) }
        : {}),
      ...(Number.isInteger(searchCondition.referencePosition)
        ? { referencePosition: Number(searchCondition.referencePosition) }
        : {}),
    });
    validationById[id] = {
      itemId: id,
      ...(raw.sourceA && typeof raw.sourceA === 'object'
        ? { sourceA: raw.sourceA as Record<string, unknown> }
        : {}),
      ruleSets: Array.isArray(raw.ruleSets)
        ? raw.ruleSets as Array<Record<string, unknown>>
        : [],
    };
  }
  return { lottery: input.lottery, drawPeriod, items, validationById };
}

export function mergeExploreArtifacts(
  lottery: MatrixLottery,
  drawPeriod: string,
  artifacts: ExploreArtifact[],
): ExploreArtifact {
  return {
    lottery,
    drawPeriod,
    items: artifacts.flatMap((artifact) => artifact.items),
    validationById: Object.assign({}, ...artifacts.map((artifact) => artifact.validationById)),
  };
}

export function enrichExploreValidationReferenceNumbers(
  artifact: ExploreArtifact,
  itemId: string,
  history: MatrixDraw[],
): ExploreArtifact {
  const item = artifact.items.find((candidate) => candidate.id === itemId);
  const validation = artifact.validationById[itemId];
  const sourceA = validation?.sourceA;
  if (!item || !sourceA || Array.isArray(sourceA.referenceNumbers)) return artifact;
  const referencePeriod = String(sourceA.referencePeriod ?? '');
  const referenceDraw = history.find((draw) => draw.period === referencePeriod);
  if (!referenceDraw) return artifact;
  const referenceNumbers = item.numberOrder === '依實際開獎順序排序'
    ? referenceDraw.drawOrderNumbers
    : referenceDraw.sortedNumbers ?? referenceDraw.numbers;
  if (!Array.isArray(referenceNumbers)) return artifact;
  return {
    ...artifact,
    validationById: {
      ...artifact.validationById,
      [itemId]: {
        ...validation,
        sourceA: {
          ...sourceA,
          referenceNumbers,
          referenceSortedNumbers: referenceDraw.sortedNumbers ?? referenceDraw.numbers,
          referenceDrawOrderNumbers: referenceDraw.drawOrderNumbers ?? null,
        },
      },
    },
  };
}

export function buildExploreArtifact(
  lottery: MatrixLottery,
  drawPeriod: string,
  history: MatrixDraw[],
  runner: ExploreRunner = runMatrixExploreGroupWithHistory,
): ExploreArtifact {
  return mergeExploreArtifacts(
    lottery,
    drawPeriod,
    createExploreWorkUnits(lottery, history)
      .map((input) => buildExploreGroupArtifact(drawPeriod, history, input, runner)),
  );
}

function enforceExploreEntitlements(
  request: ExploreFilterRequest,
  entitlements: MatrixEntitlements,
) {
  if (request.explorePeriods === 7 && !entitlements.canUseSeven) throw new Error('FORBIDDEN');
  if (request.explorePeriods === 13 && !entitlements.canUseThirteen) throw new Error('FORBIDDEN');
  if (request.exploreRange === '完整範圍' && !entitlements.canUseFullRange) {
    throw new Error('FORBIDDEN');
  }
}

function duplicateCounts(items: ExploreArtifactRow[]) {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const number of item.predictionNumbers) {
      counts.set(number, (counts.get(number) ?? 0) + 1);
    }
  }
  return counts;
}

export function filterExploreArtifact(
  artifact: ExploreArtifact,
  request: ExploreFilterRequest,
  entitlements: MatrixEntitlements,
) {
  enforceExploreEntitlements(request, entitlements);
  if (artifact.lottery !== request.lottery) throw new Error('INVALID_REQUEST');

  let items = artifact.items.filter((item) => (
    item.numberOrder === request.numberOrder
    && (item.lockedSourceIndex === undefined
      ? item.explorePeriods === request.explorePeriods
      : item.explorePeriods <= request.explorePeriods)
    && item.exploreDateOffset === request.exploreDateOffset
    && item.ruleCount === request.ruleCount
    && request.roadTypes.includes(item.algorithmType)
    && request.selectedStreaks.includes(item.consecutive)
    && (
      request.exploreRange === '完整範圍'
      || (item.referenceOffset ?? 0) >= -7
    )
  ));

  if (request.sameCode) {
    const counts = duplicateCounts(items);
    items = items.filter((item) => item.predictionNumbers.some((number) => (counts.get(number) ?? 0) >= 2));
  }

  items = [...items].sort((left, right) => (
    right.highestStreak - left.highestStreak
    || left.predictionDistance - right.predictionDistance
    || left.lockedPosition - right.lockedPosition
  ));
  const counts = duplicateCounts(items);
  const duplicateStats = [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || Number(left[0]) - Number(right[0]))
    .map(([number, count]) => ({ number, count }));

  return { items, duplicateStats, total: items.length };
}

export function getExploreValidation(artifact: ExploreArtifact, itemId: string) {
  return artifact.validationById[itemId] ?? null;
}
