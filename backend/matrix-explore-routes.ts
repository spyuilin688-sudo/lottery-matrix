import type { MatrixAnalysisKind, LotteryId } from '../shared/matrix-contracts';
import {
  resolveMatrixEntitlements,
  type MemberContext,
} from './matrix-entitlements';
import { MatrixAccessError } from './matrix-member-auth';
import {
  filterExploreArtifact,
  getExploreValidation,
  type ExploreArtifact,
  type ExploreFilterRequest,
} from './matrix-explore-service';

type CompletedArtifact = {
  analysisVersion: string;
  drawPeriod: string;
  data: ExploreArtifact;
};

type RouteInput = { authorization?: string; body: unknown };
type RouteResult = { status: number; body: Record<string, unknown> };

type ExploreRouteDependencies = {
  requireMember(authorization?: string): Promise<MemberContext>;
  readAnalysis(
    kind: MatrixAnalysisKind,
    lottery: LotteryId,
    drawPeriod?: string,
  ): Promise<CompletedArtifact | null>;
  now?: () => Date;
};

const lotteries: LotteryId[] = ['今彩539', '天天樂', '六合彩', '大樂透'];
const orders = ['依號碼由小到大排序', '依實際開獎順序排序'] as const;
const roadTypes = ['加減', '合值', '拖牌'] as const;

function bodyRecord(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_REQUEST');
  return value as Record<string, unknown>;
}

function lotteryOf(body: Record<string, unknown>) {
  const lottery = String(body.lottery ?? '') as LotteryId;
  if (!lotteries.includes(lottery)) throw new Error('INVALID_REQUEST');
  return lottery;
}

function parseListRequest(value: unknown): ExploreFilterRequest & { drawPeriod?: string } {
  const body = bodyRecord(value);
  const lottery = lotteryOf(body);
  const numberOrder = String(body.numberOrder ?? '') as ExploreFilterRequest['numberOrder'];
  const explorePeriods = Number(body.explorePeriods) as ExploreFilterRequest['explorePeriods'];
  const exploreDateOffset = Number(body.exploreDateOffset) as ExploreFilterRequest['exploreDateOffset'];
  const exploreRange = String(body.exploreRange ?? '') as ExploreFilterRequest['exploreRange'];
  const ruleCount = Number(body.ruleCount) as ExploreFilterRequest['ruleCount'];
  const selectedRoadTypes = Array.isArray(body.roadTypes) ? body.roadTypes.map(String) : [];
  const selectedStreaks = Array.isArray(body.selectedStreaks) ? body.selectedStreaks.map(String) : [];
  if (
    !orders.includes(numberOrder)
    || ![2, 7, 13].includes(explorePeriods)
    || ![0, 1, 2].includes(exploreDateOffset)
    || !['標準範圍', '完整範圍'].includes(exploreRange)
    || ![1, 2].includes(ruleCount)
    || selectedRoadTypes.length === 0
    || selectedRoadTypes.some((type) => !roadTypes.includes(type as typeof roadTypes[number]))
  ) {
    throw new Error('INVALID_REQUEST');
  }
  return {
    lottery,
    numberOrder,
    explorePeriods,
    exploreDateOffset,
    exploreRange,
    ruleCount,
    roadTypes: selectedRoadTypes as ExploreFilterRequest['roadTypes'],
    selectedStreaks,
    sameCode: Boolean(body.sameCode),
    ...(body.drawPeriod ? { drawPeriod: String(body.drawPeriod) } : {}),
  };
}

function failure(cause: unknown): RouteResult {
  if (cause instanceof MatrixAccessError) {
    return { status: cause.status, body: { error: { code: cause.code } } };
  }
  const code = cause instanceof Error ? cause.message : 'INVALID_REQUEST';
  if (code === 'FORBIDDEN') return { status: 403, body: { error: { code } } };
  if (code === 'ANALYSIS_NOT_READY') return { status: 404, body: { error: { code } } };
  if (code === 'ANALYSIS_VERSION_MISMATCH') return { status: 409, body: { error: { code } } };
  return { status: 400, body: { error: { code: 'INVALID_REQUEST' } } };
}

function canReadValidation(
  artifact: ExploreArtifact,
  itemId: string,
  member: MemberContext,
  now: Date,
) {
  const row = artifact.items.find((item) => item.id === itemId);
  if (!row) throw new Error('INVALID_REQUEST');
  const entitlements = resolveMatrixEntitlements(member, now);
  if (row.explorePeriods === 7 && !entitlements.canUseSeven) throw new Error('FORBIDDEN');
  if (row.explorePeriods === 13 && !entitlements.canUseThirteen) throw new Error('FORBIDDEN');
  if ((row.referenceOffset ?? 0) < -7 && !entitlements.canUseFullRange) throw new Error('FORBIDDEN');
}

export function createMatrixExploreRoutes(dependencies: ExploreRouteDependencies) {
  const now = dependencies.now ?? (() => new Date());
  return {
    async list(input: RouteInput): Promise<RouteResult> {
      try {
        const member = await dependencies.requireMember(input.authorization);
        const request = parseListRequest(input.body);
        const artifact = await dependencies.readAnalysis(
          'explore',
          request.lottery,
          request.drawPeriod,
        );
        if (!artifact) throw new Error('ANALYSIS_NOT_READY');
        const filtered = filterExploreArtifact(
          artifact.data,
          request,
          resolveMatrixEntitlements(member, now()),
        );
        return {
          status: 200,
          body: {
            kind: 'explore',
            lottery: request.lottery,
            drawPeriod: artifact.drawPeriod,
            analysisVersion: artifact.analysisVersion,
            status: 'complete',
            ...filtered,
          },
        };
      } catch (cause) {
        return failure(cause);
      }
    },

    async validation(input: RouteInput): Promise<RouteResult> {
      try {
        const member = await dependencies.requireMember(input.authorization);
        const body = bodyRecord(input.body);
        const lottery = lotteryOf(body);
        const drawPeriod = String(body.drawPeriod ?? '');
        const analysisVersion = String(body.analysisVersion ?? '');
        const itemId = String(body.itemId ?? '');
        if (!drawPeriod || !analysisVersion || !itemId) throw new Error('INVALID_REQUEST');
        const artifact = await dependencies.readAnalysis('explore', lottery, drawPeriod);
        if (!artifact) throw new Error('ANALYSIS_NOT_READY');
        if (artifact.analysisVersion !== analysisVersion) {
          throw new Error('ANALYSIS_VERSION_MISMATCH');
        }
        canReadValidation(artifact.data, itemId, member, now());
        const validation = getExploreValidation(artifact.data, itemId);
        if (!validation) throw new Error('INVALID_REQUEST');
        return {
          status: 200,
          body: {
            kind: 'explore',
            lottery,
            drawPeriod,
            analysisVersion,
            status: 'complete',
            itemId,
            validation,
          },
        };
      } catch (cause) {
        return failure(cause);
      }
    },
  };
}
