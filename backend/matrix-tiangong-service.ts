import type { MatrixDraw, MatrixLottery } from './matrix-algorithm';
import { runTiangongCandidates } from './matrix-tiangong-generator';
import {
  evaluateTiangongCandidate,
  type TiangongAlgorithmType,
  type TiangongCandidate,
  type TiangongDirection,
  type TiangongHitCondition,
  type TiangongSourceSequence,
  type TiangongValidationRow,
} from './matrix-tiangong';

export type TiangongArtifactRow = {
  id: string;
  sourceSequence: TiangongSourceSequence;
  eligiblePeriodRange: 50 | 80;
  interval: number;
  predictionDistance: number;
  predictedPosition: number;
  predictionNumber: string;
  roadType: string;
  ruleIdentity: string;
  mode: 'one-stage' | 'two-stage';
  hitCondition: TiangongHitCondition;
  exploreDirection: TiangongDirection;
  firstStageDirection: TiangongDirection;
  firstRoadType: TiangongAlgorithmType;
  secondStageDirection?: TiangongDirection;
  secondRoadType?: TiangongAlgorithmType;
};

export type TiangongValidation = {
  itemId: string;
  ruleIdentity: string;
  validationRows: TiangongValidationRow[];
};

export type TiangongArtifact = {
  lottery: MatrixLottery;
  drawPeriod: string;
  items: TiangongArtifactRow[];
  validationById: Record<string, TiangongValidation>;
};

export type TiangongFilterRequest = {
  lottery: MatrixLottery;
  periodRange: 50 | 80;
  mode: 'one-stage' | 'two-stage';
  hitCondition: TiangongHitCondition;
  exploreDirections: TiangongDirection[];
  firstStageDirections: TiangongDirection[];
  firstRoadTypes: TiangongAlgorithmType[];
  secondStageDirections?: TiangongDirection[];
  secondRoadTypes?: TiangongAlgorithmType[];
};

export type TiangongCandidateRunner = (
  lottery: MatrixLottery,
  history: MatrixDraw[],
) => TiangongCandidate[];

function stableId(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `tiangong-${(hash >>> 0).toString(36)}`;
}

export function buildTiangongArtifact(
  lottery: MatrixLottery,
  drawPeriod: string,
  history: MatrixDraw[],
  runCandidates: TiangongCandidateRunner = runTiangongCandidates,
): TiangongArtifact {
  const items: TiangongArtifactRow[] = [];
  const validationById: Record<string, TiangongValidation> = {};
  const seen = new Set<string>();
  for (const candidate of runCandidates(lottery, history)) {
    if (candidate.lottery !== lottery) continue;
    const result = evaluateTiangongCandidate(candidate);
    if (!result.valid || !result.predictedPosition || !result.predictionNumber || !result.roadType) continue;
    const signature = [
      result.ruleIdentity,
      result.predictionDistance,
      result.predictedPosition,
      result.predictionNumber,
      result.roadType,
    ].join('|');
    if (seen.has(signature)) continue;
    seen.add(signature);
    const id = stableId(signature);
    const secondStage = candidate.mode === 'two-stage' ? candidate.secondStage : undefined;
    items.push({
      id,
      sourceSequence: candidate.sourceSequence,
      eligiblePeriodRange: Math.max(...candidate.sourceSequence) <= 50 ? 50 : 80,
      interval: result.interval,
      predictionDistance: result.predictionDistance,
      predictedPosition: result.predictedPosition,
      predictionNumber: result.predictionNumber,
      roadType: result.roadType,
      ruleIdentity: result.ruleIdentity,
      mode: candidate.mode,
      hitCondition: candidate.hitCondition,
      exploreDirection: candidate.exploreDirection,
      firstStageDirection: candidate.firstStage.direction,
      firstRoadType: candidate.firstStage.algorithmType,
      ...(secondStage ? {
        secondStageDirection: secondStage.direction,
        secondRoadType: secondStage.algorithmType,
      } : {}),
    });
    validationById[id] = { itemId: id, ruleIdentity: result.ruleIdentity, validationRows: result.validationRows };
  }
  items.sort((left, right) => (
    left.interval - right.interval
    || left.predictionDistance - right.predictionDistance
    || left.predictedPosition - right.predictedPosition
    || left.roadType.localeCompare(right.roadType)
    || left.id.localeCompare(right.id)
  ));
  return { lottery, drawPeriod, items, validationById };
}

export function filterTiangongArtifact(artifact: TiangongArtifact, request: TiangongFilterRequest) {
  if (artifact.lottery !== request.lottery) throw new Error('INVALID_REQUEST');
  const items = artifact.items.filter((item) => (
    item.eligiblePeriodRange <= request.periodRange
    && item.mode === request.mode
    && item.hitCondition === request.hitCondition
    && request.exploreDirections.includes(item.exploreDirection)
    && request.firstStageDirections.includes(item.firstStageDirection)
    && request.firstRoadTypes.includes(item.firstRoadType)
    && (request.mode === 'one-stage' || (
      Boolean(item.secondStageDirection)
      && Boolean(item.secondRoadType)
      && (request.secondStageDirections ?? []).includes(item.secondStageDirection!)
      && (request.secondRoadTypes ?? []).includes(item.secondRoadType!)
    ))
  ));
  return { items, total: items.length };
}

export function getTiangongValidation(artifact: TiangongArtifact, itemId: string) {
  return artifact.validationById[itemId] ?? null;
}
