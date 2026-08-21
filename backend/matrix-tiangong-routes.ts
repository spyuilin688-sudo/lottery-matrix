import type { LotteryId, MatrixAnalysisKind } from '../shared/matrix-contracts';
import { resolveMatrixEntitlements, type MemberContext } from './matrix-entitlements';
import { MatrixAccessError } from './matrix-member-auth';
import {
  filterTiangongArtifact,
  getTiangongValidation,
  type TiangongArtifact,
  type TiangongFilterRequest,
} from './matrix-tiangong-service';

type CompletedArtifact = { analysisVersion: string; drawPeriod: string; data: TiangongArtifact };
type RouteInput = { authorization?: string; body: unknown };
type RouteResult = { status: number; body: Record<string, unknown> };
type Dependencies = {
  requireMember(authorization?: string): Promise<MemberContext>;
  readAnalysis(kind: MatrixAnalysisKind, lottery: LotteryId, drawPeriod?: string): Promise<CompletedArtifact | null>;
  now?: () => Date;
};

const lotteries: LotteryId[] = ['今彩539', '天天樂', '六合彩', '大樂透'];
const directions = ['固定', '依序遞增', '依序遞減'] as const;
const roadTypes = ['加減', '合值'] as const;

function record(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_REQUEST');
  return value as Record<string, unknown>;
}

function lotteryOf(body: Record<string, unknown>) {
  const lottery = String(body.lottery ?? '') as LotteryId;
  if (!lotteries.includes(lottery)) throw new Error('INVALID_REQUEST');
  return lottery;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map(String) : [];
}

function parseRequest(value: unknown): TiangongFilterRequest & { drawPeriod?: string } {
  const body = record(value);
  const lottery = lotteryOf(body);
  const periodRange = Number(body.periodRange) as 50 | 80;
  const mode = String(body.mode ?? '') as TiangongFilterRequest['mode'];
  const hitCondition = String(body.hitCondition ?? '') as TiangongFilterRequest['hitCondition'];
  const exploreDirections = stringArray(body.exploreDirections);
  const firstStageDirections = stringArray(body.firstStageDirections);
  const firstRoadTypes = stringArray(body.firstRoadTypes);
  const secondStageDirections = stringArray(body.secondStageDirections);
  const secondRoadTypes = stringArray(body.secondRoadTypes);
  const validDirections = (values: string[]) => values.length > 0 && values.every((item) => directions.includes(item as never));
  const validRoads = (values: string[]) => values.length > 0 && values.every((item) => roadTypes.includes(item as never));
  if (
    ![50, 80].includes(periodRange)
    || !['one-stage', 'two-stage'].includes(mode)
    || !['準2進3', '準3進4'].includes(hitCondition)
    || !validDirections(exploreDirections)
    || !validDirections(firstStageDirections)
    || !validRoads(firstRoadTypes)
    || (mode === 'two-stage' && (!validDirections(secondStageDirections) || !validRoads(secondRoadTypes)))
  ) throw new Error('INVALID_REQUEST');
  return {
    lottery, periodRange, mode, hitCondition,
    exploreDirections: exploreDirections as TiangongFilterRequest['exploreDirections'],
    firstStageDirections: firstStageDirections as TiangongFilterRequest['firstStageDirections'],
    firstRoadTypes: firstRoadTypes as TiangongFilterRequest['firstRoadTypes'],
    ...(mode === 'two-stage' ? {
      secondStageDirections: secondStageDirections as TiangongFilterRequest['secondStageDirections'],
      secondRoadTypes: secondRoadTypes as TiangongFilterRequest['secondRoadTypes'],
    } : {}),
    ...(body.drawPeriod ? { drawPeriod: String(body.drawPeriod) } : {}),
  };
}

function failure(cause: unknown): RouteResult {
  if (cause instanceof MatrixAccessError) return { status: cause.status, body: { error: { code: cause.code } } };
  const code = cause instanceof Error ? cause.message : 'INVALID_REQUEST';
  if (code === 'FORBIDDEN') return { status: 403, body: { error: { code } } };
  if (code === 'ANALYSIS_NOT_READY') return { status: 404, body: { error: { code } } };
  if (code === 'ANALYSIS_VERSION_MISMATCH') return { status: 409, body: { error: { code } } };
  return { status: 400, body: { error: { code: 'INVALID_REQUEST' } } };
}

export function createMatrixTiangongRoutes(dependencies: Dependencies) {
  const now = dependencies.now ?? (() => new Date());
  const requireAccess = (member: MemberContext) => {
    if (!resolveMatrixEntitlements(member, now()).canUseTiangong) throw new Error('FORBIDDEN');
  };
  return {
    async list(input: RouteInput): Promise<RouteResult> {
      try {
        const member = await dependencies.requireMember(input.authorization);
        requireAccess(member);
        const request = parseRequest(input.body);
        const artifact = await dependencies.readAnalysis('tiangong', request.lottery, request.drawPeriod);
        if (!artifact) throw new Error('ANALYSIS_NOT_READY');
        return { status: 200, body: {
          kind: 'tiangong', lottery: request.lottery, drawPeriod: artifact.drawPeriod,
          analysisVersion: artifact.analysisVersion, status: 'complete',
          ...filterTiangongArtifact(artifact.data, request),
        } };
      } catch (cause) { return failure(cause); }
    },
    async validation(input: RouteInput): Promise<RouteResult> {
      try {
        const member = await dependencies.requireMember(input.authorization);
        requireAccess(member);
        const body = record(input.body);
        const lottery = lotteryOf(body);
        const drawPeriod = String(body.drawPeriod ?? '');
        const analysisVersion = String(body.analysisVersion ?? '');
        const itemId = String(body.itemId ?? '');
        if (!drawPeriod || !analysisVersion || !itemId) throw new Error('INVALID_REQUEST');
        const artifact = await dependencies.readAnalysis('tiangong', lottery, drawPeriod);
        if (!artifact) throw new Error('ANALYSIS_NOT_READY');
        if (artifact.analysisVersion !== analysisVersion) throw new Error('ANALYSIS_VERSION_MISMATCH');
        const validation = getTiangongValidation(artifact.data, itemId);
        if (!validation) throw new Error('INVALID_REQUEST');
        return { status: 200, body: {
          kind: 'tiangong', lottery, drawPeriod, analysisVersion, status: 'complete', itemId, validation,
        } };
      } catch (cause) { return failure(cause); }
    },
  };
}
