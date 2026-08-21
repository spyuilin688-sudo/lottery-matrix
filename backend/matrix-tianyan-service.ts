import type { MatrixLottery, MatrixNumberOrder } from './matrix-algorithm';
import type { ExploreArtifact, ExploreArtifactRow, ExploreValidation } from './matrix-explore-service';
import {
  evaluateTianyanCandidate,
  type TianyanHistoricalGroup,
  type TianyanResult,
  type TianyanRule,
} from './matrix-tianyan';

export const TIANYAN_STREAKS = [
  '準5進6', '準6進7', '準7進8', '準9進10',
  '準11進12', '準13進14', '準15進16', '準17進18+',
] as const;

export type TianyanStreak = typeof TIANYAN_STREAKS[number];

export type TianyanArtifactRow = {
  id: string;
  number: string;
  lockedPosition: number;
  predictionDistance: number;
  consecutive: TianyanStreak;
  highestStreak: number;
  predictionNumbers: string[];
  roadType: '複合';
  hitCondition: '準5+（鎖定2碼）';
  numberOrder: MatrixNumberOrder;
  explorePeriods: 2 | 7 | 13;
  exploreDateOffset: 0 | 1 | 2;
  lockedSourceIndex?: number;
  lockedSourcePeriod?: string;
  ruleIds: [string, string];
};

export type TianyanValidation = {
  itemId: string;
  rules: TianyanRule[];
  groupCount: number;
  minimumIndependentHits: number;
  rule1Only: number;
  rule2Only: number;
  bothHit: number;
  historicalValidation: TianyanResult['groups'];
};

export type TianyanArtifact = {
  lottery: MatrixLottery;
  drawPeriod: string;
  items: TianyanArtifactRow[];
  validationById: Record<string, TianyanValidation>;
};

type SourceRule = {
  row: ExploreArtifactRow;
  rule: TianyanRule;
  validationRows: Array<Record<string, unknown>>;
};

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function sourceRules(artifact: ExploreArtifact): SourceRule[] {
  const sources: SourceRule[] = [];
  for (const row of artifact.items.filter((item) => item.ruleCount === 1)) {
    const validation = artifact.validationById[row.id];
    if (!validation) continue;
    for (const rawSet of validation.ruleSets) {
      const ruleSet = object(rawSet);
      const rawRules = Array.isArray(ruleSet.rules) ? ruleSet.rules : [];
      if (rawRules.length !== 1) continue;
      const rawRule = object(rawRules[0]);
      const algorithmType = String(rawRule.algorithmType ?? row.algorithmType) as TianyanRule['algorithmType'];
      if (!['加減', '合值', '拖牌'].includes(algorithmType)) continue;
      const predictionNumbers = Array.isArray(ruleSet.predictionNumbers)
        ? ruleSet.predictionNumbers.map(Number).filter(Number.isInteger)
        : row.predictionNumbers.map(Number).filter(Number.isInteger);
      if (predictionNumbers.length === 0) continue;
      const sourceA = object(validation.sourceA);
      sources.push({
        row,
        rule: {
          id: String(rawRule.id ?? `${row.id}:${algorithmType}:${String(rawRule.value ?? 0)}`),
          referenceOffset: Number(rawRule.referenceOffset ?? row.referenceOffset ?? 0),
          referencePosition: Number(rawRule.referencePosition ?? row.referencePosition ?? row.lockedPosition),
          algorithmType,
          value: Number(rawRule.value ?? 0),
          currentBaseNumber: Number(sourceA.baseNumber ?? 1),
          currentPredictionNumbers: predictionNumbers,
        },
        validationRows: Array.isArray(ruleSet.historicalValidation)
          ? ruleSet.historicalValidation.map(object)
          : [],
      });
    }
  }
  return sources;
}

function sameSearch(left: ExploreArtifactRow, right: ExploreArtifactRow) {
  return left.number === right.number
    && left.lockedPosition === right.lockedPosition
    && left.predictionDistance === right.predictionDistance
    && left.numberOrder === right.numberOrder
    && left.explorePeriods === right.explorePeriods
    && left.exploreDateOffset === right.exploreDateOffset
    && left.lockedSourceIndex === right.lockedSourceIndex
    && left.lockedSourcePeriod === right.lockedSourcePeriod;
}

function historicalGroups(left: SourceRule, right: SourceRule): TianyanHistoricalGroup[] {
  const rightByPeriod = new Map(right.validationRows.map((row) => [String(row.predictionPeriod ?? ''), row]));
  const groups: TianyanHistoricalGroup[] = [];
  for (const leftRow of left.validationRows) {
    const predictionPeriod = String(leftRow.predictionPeriod ?? '');
    const rightRow = rightByPeriod.get(predictionPeriod);
    if (!predictionPeriod || !rightRow) continue;
    groups.push({
      id: String(leftRow.group ?? rightRow.group ?? predictionPeriod),
      sourcePeriod: String(leftRow.sourcePeriod ?? rightRow.sourcePeriod ?? ''),
      predictionPeriod,
      predictionNumbers: Array.isArray(leftRow.predictionNumbers)
        ? leftRow.predictionNumbers.map(Number).filter(Number.isInteger)
        : [],
      rule1: {
        baseNumber: Number(leftRow.baseNumber ?? 0),
        predictionNumber: Number(left.rule.currentPredictionNumbers?.[0] ?? 0),
        hit: Boolean(leftRow.success),
      },
      rule2: {
        baseNumber: Number(rightRow.baseNumber ?? 0),
        predictionNumber: Number(right.rule.currentPredictionNumbers?.[0] ?? 0),
        hit: Boolean(rightRow.success),
      },
    });
    if (groups.length === 30) break;
  }
  return groups;
}

function ruleIdentity(rule: TianyanRule) {
  return [rule.referenceOffset, rule.referencePosition, rule.algorithmType, rule.value].join(':');
}

function pairSignature(left: SourceRule, right: SourceRule, result: TianyanResult) {
  return [
    left.row.number,
    left.row.lockedPosition,
    left.row.lockedSourceIndex ?? '',
    left.row.lockedSourcePeriod ?? '',
    left.row.predictionDistance,
    left.row.numberOrder,
    ...[ruleIdentity(left.rule), ruleIdentity(right.rule)].sort(),
    result.predictionNumbers.join(','),
  ].join('|');
}

function stableId(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `tianyan-${(hash >>> 0).toString(36)}`;
}

function streakFor(groupCount: number): TianyanStreak | null {
  if (groupCount >= 17) return '準17進18+';
  if ([5, 6, 7, 9, 11, 13, 15].includes(groupCount)) return `準${groupCount}進${groupCount + 1}` as TianyanStreak;
  return null;
}

export function buildTianyanArtifact(
  lottery: MatrixLottery,
  drawPeriod: string,
  exploreArtifact: ExploreArtifact,
): TianyanArtifact {
  if (exploreArtifact.lottery !== lottery || exploreArtifact.drawPeriod !== drawPeriod) {
    throw new Error('INVALID_REQUEST');
  }
  const sources = sourceRules(exploreArtifact);
  const items: TianyanArtifactRow[] = [];
  const validationById: Record<string, TianyanValidation> = {};
  const seen = new Set<string>();

  for (let first = 0; first < sources.length; first += 1) {
    for (let second = first + 1; second < sources.length; second += 1) {
      const left = sources[first];
      const right = sources[second];
      if (!sameSearch(left.row, right.row)) continue;
      const result = evaluateTianyanCandidate({
        lottery,
        rules: [left.rule, right.rule],
        groups: historicalGroups(left, right),
      });
      const consecutive = streakFor(result.groupCount);
      if (!result.valid || !consecutive) continue;
      const signature = pairSignature(left, right, result);
      if (seen.has(signature)) continue;
      seen.add(signature);
      const id = stableId(signature);
      items.push({
        id,
        number: left.row.number,
        lockedPosition: left.row.lockedPosition,
        predictionDistance: left.row.predictionDistance,
        consecutive,
        highestStreak: result.groupCount,
        predictionNumbers: result.predictionNumbers,
        roadType: '複合',
        hitCondition: '準5+（鎖定2碼）',
        numberOrder: left.row.numberOrder,
        explorePeriods: left.row.explorePeriods,
        exploreDateOffset: left.row.exploreDateOffset,
        lockedSourceIndex: left.row.lockedSourceIndex,
        lockedSourcePeriod: left.row.lockedSourcePeriod,
        ruleIds: [left.rule.id, right.rule.id],
      });
      validationById[id] = {
        itemId: id,
        rules: result.rules,
        groupCount: result.groupCount,
        minimumIndependentHits: result.minimumIndependentHits,
        rule1Only: result.rule1Only,
        rule2Only: result.rule2Only,
        bothHit: result.bothHit,
        historicalValidation: result.groups,
      };
    }
  }

  items.sort((left, right) => right.highestStreak - left.highestStreak || left.id.localeCompare(right.id));
  return { lottery, drawPeriod, items, validationById };
}

export function filterTianyanArtifact(artifact: TianyanArtifact, selectedStreaks: string[]) {
  const items = artifact.items.filter((item) => selectedStreaks.includes(item.consecutive));
  return { items, total: items.length };
}

export function getTianyanValidation(artifact: TianyanArtifact, itemId: string) {
  return artifact.validationById[itemId] ?? null;
}
