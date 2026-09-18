import type { LotteryId, MatrixAnalysisKind } from '../shared/matrix-contracts';
import { resolveMatrixEntitlements, type MemberContext } from './matrix-entitlements';
import { MatrixAccessError } from './matrix-member-auth';
import {
  filterTianyanArtifact,
  getTianyanValidation,
  TIANYAN_STREAKS,
  type TianyanArtifact,
} from './matrix-tianyan-service';

type CompletedArtifact = { analysisVersion: string; drawPeriod: string; data: TianyanArtifact };
type RouteInput = { authorization?: string; body: unknown };
type RouteResult = { status: number; body: Record<string, unknown> };
type Dependencies = {
  requireMember(authorization?: string): Promise<MemberContext>;
  readAnalysis(kind: MatrixAnalysisKind, lottery: LotteryId, drawPeriod?: string): Promise<CompletedArtifact | null>;
  now?: () => Date;
};

const lotteries: LotteryId[] = ['今彩539', '天天樂', '六合彩', '大樂透'];

function record(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_REQUEST');
  return value as Record<string, unknown>;
}

function lotteryOf(body: Record<string, unknown>) {
  const lottery = String(body.lottery ?? '') as LotteryId;
  if (!lotteries.includes(lottery)) throw new Error('INVALID_REQUEST');
  return lottery;
}

function failure(cause: unknown): RouteResult {
  if (cause instanceof MatrixAccessError) return { status: cause.status, body: { error: { code: cause.code } } };
  const code = cause instanceof Error ? cause.message : 'INVALID_REQUEST';
  if (code === 'FORBIDDEN') return { status: 403, body: { error: { code } } };
  if (code === 'ANALYSIS_NOT_READY') return { status: 404, body: { error: { code } } };
  if (code === 'ANALYSIS_VERSION_MISMATCH') return { status: 409, body: { error: { code } } };
  return { status: 400, body: { error: { code: 'INVALID_REQUEST' } } };
}

function requireTianyan(member: MemberContext, now: Date) {
  if (!resolveMatrixEntitlements(member, now).canUseTianyan) throw new Error('FORBIDDEN');
}

export function createMatrixTianyanRoutes(dependencies: Dependencies) {
  const now = dependencies.now ?? (() => new Date());
  return {
    async list(input: RouteInput): Promise<RouteResult> {
      try {
        const member = await dependencies.requireMember(input.authorization);
        requireTianyan(member, now());
        const body = record(input.body);
        const lottery = lotteryOf(body);
        const selectedStreaks = Array.isArray(body.selectedStreaks) ? body.selectedStreaks.map(String) : [];
        if (selectedStreaks.length === 0 || selectedStreaks.some((value) => !TIANYAN_STREAKS.includes(value as never))) {
          throw new Error('INVALID_REQUEST');
        }
        const drawPeriod = body.drawPeriod ? String(body.drawPeriod) : undefined;
        const artifact = await dependencies.readAnalysis('tianyan', lottery, drawPeriod);
        if (!artifact) throw new Error('ANALYSIS_NOT_READY');
        return {
          status: 200,
          body: {
            kind: 'tianyan', lottery, drawPeriod: artifact.drawPeriod,
            analysisVersion: artifact.analysisVersion, status: 'complete',
            ...filterTianyanArtifact(artifact.data, selectedStreaks),
          },
        };
      } catch (cause) {
        return failure(cause);
      }
    },

    async validation(input: RouteInput): Promise<RouteResult> {
      try {
        const member = await dependencies.requireMember(input.authorization);
        requireTianyan(member, now());
        const body = record(input.body);
        const lottery = lotteryOf(body);
        const drawPeriod = String(body.drawPeriod ?? '');
        const analysisVersion = String(body.analysisVersion ?? '');
        const itemId = String(body.itemId ?? '');
        if (!drawPeriod || !analysisVersion || !itemId) throw new Error('INVALID_REQUEST');
        const artifact = await dependencies.readAnalysis('tianyan', lottery, drawPeriod);
        if (!artifact) throw new Error('ANALYSIS_NOT_READY');
        if (artifact.analysisVersion !== analysisVersion) throw new Error('ANALYSIS_VERSION_MISMATCH');
        const validation = getTianyanValidation(artifact.data, itemId);
        if (!validation) throw new Error('INVALID_REQUEST');
        return {
          status: 200,
          body: { kind: 'tianyan', lottery, drawPeriod, analysisVersion, status: 'complete', itemId, validation },
        };
      } catch (cause) {
        return failure(cause);
      }
    },
  };
}
