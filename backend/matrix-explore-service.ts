import {
  runMatrixAutomaticExploreWithHistory,
  type MatrixAlgorithmType,
  type MatrixDraw,
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

type ExploreRunInput = {
  lottery: MatrixLottery;
  numberOrder: MatrixNumberOrder;
  explorePeriods: 2 | 7 | 13;
  algorithmType: MatrixAlgorithmType;
  ruleCount: 1 | 2;
  exploreDateOffset: 0 | 1 | 2;
  exploreRange: '完整範圍';
  minPredictionDistance: 1;
  maxPredictionDistance: 30;
};

type ExploreRunnerResult = { results?: Array<Record<string, unknown>> };
type ExploreRunner = (input: ExploreRunInput, history: MatrixDraw[]) => ExploreRunnerResult;

const numberOrders: MatrixNumberOrder[] = [
  '依號碼由小到大排序',
  '依實際開獎順序排序',
];
const dateOffsets = [0, 1, 2] as const;
const explorePeriods = [2, 7, 13] as const;
const ruleCounts = [1, 2] as const;
const algorithmTypes: MatrixAlgorithmType[] = ['加減', '合值', '拖牌'];

function canonicalId(config: ExploreRunInput, rawId: unknown) {
  return [
    config.numberOrder,
    config.exploreDateOffset,
    config.explorePeriods,
    config.ruleCount,
    config.algorithmType,
    String(rawId ?? ''),
  ].join('|');
}

export function buildExploreArtifact(
  lottery: MatrixLottery,
  drawPeriod: string,
  history: MatrixDraw[],
  runner: ExploreRunner = runMatrixAutomaticExploreWithHistory,
): ExploreArtifact {
  const items: ExploreArtifactRow[] = [];
  const validationById: Record<string, ExploreValidation> = {};

  for (const numberOrder of numberOrders) {
    for (const exploreDateOffset of dateOffsets) {
      for (const period of explorePeriods) {
        for (const ruleCount of ruleCounts) {
          for (const algorithmType of algorithmTypes) {
            const input: ExploreRunInput = {
              lottery,
              numberOrder,
              explorePeriods: period,
              algorithmType,
              ruleCount,
              exploreDateOffset,
              exploreRange: '完整範圍',
              minPredictionDistance: 1,
              maxPredictionDistance: 30,
            };
            const result = runner(input, history);
            for (const raw of result.results ?? []) {
              const id = canonicalId(input, raw.id);
              const searchCondition = (raw.searchCondition ?? {}) as Record<string, unknown>;
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
                algorithmType,
                numberOrder,
                explorePeriods: period,
                exploreDateOffset,
                ruleCount,
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
          }
        }
      }
    }
  }

  return { lottery, drawPeriod, items, validationById };
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
    && item.explorePeriods === request.explorePeriods
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
