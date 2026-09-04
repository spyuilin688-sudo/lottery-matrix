import type { CustomStatusConfig } from './matrix-custom-status.ts';
import { anonymousMatrixMember, resolveMatrixEntitlements, type MemberContext } from './matrix-entitlements.ts';
import { MatrixAccessError } from './matrix-member-auth.ts';
import {
  buildMatrixStatusArtifact,
  type ExploreArtifact,
  type TianyanArtifact,
} from './matrix-status-service.ts';

type LotteryId = '今彩539' | '天天樂' | '六合彩' | '大樂透';
type StatusSources = {
  analysisVersion: string;
  drawPeriod: string;
  explore: ExploreArtifact | null;
  tianyan: TianyanArtifact | null;
};
type RouteInput = { authorization?: string; body: unknown };
type RouteResult = { status: number; body: Record<string, unknown> };
type Dependencies = {
  requireMember(authorization?: string): Promise<MemberContext>;
  readStatusSources(lottery: LotteryId, drawPeriod?: string): Promise<StatusSources | null>;
  listConfigs(memberId: string): Promise<CustomStatusConfig[]>;
  now?: () => Date;
};

const lotteries: LotteryId[] = ['今彩539', '天天樂', '六合彩', '大樂透'];

function record(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_REQUEST');
  return value as Record<string, unknown>;
}

function failure(cause: unknown): RouteResult {
  if (cause instanceof MatrixAccessError) return { status: cause.status, body: { error: { code: cause.code } } };
  const code = cause instanceof Error ? cause.message : 'INVALID_REQUEST';
  if (code === 'ANALYSIS_NOT_READY') return { status: 404, body: { error: { code } } };
  if (code.startsWith('SUPABASE_')) return { status: 502, body: { error: { code } } };
  return { status: 400, body: { error: { code: 'INVALID_REQUEST' } } };
}

export function createMatrixStatusRoutes(dependencies: Dependencies) {
  const now = dependencies.now ?? (() => new Date());
  const memberFor = (authorization?: string) => authorization
    ? dependencies.requireMember(authorization)
    : Promise.resolve(anonymousMatrixMember);
  return {
    async get(input: RouteInput): Promise<RouteResult> {
      try {
        const member = await memberFor(input.authorization);
        const body = record(input.body);
        const lottery = String(body.lottery ?? '') as LotteryId;
        if (!lotteries.includes(lottery)) throw new Error('INVALID_REQUEST');
        const requestedPeriod = body.drawPeriod ? String(body.drawPeriod) : undefined;
        const [sources, configs] = await Promise.all([
          dependencies.readStatusSources(lottery, requestedPeriod),
          member.memberId ? dependencies.listConfigs(member.memberId) : Promise.resolve([]),
        ]);
        if (!sources?.explore || !sources.tianyan
          || sources.explore.drawPeriod !== sources.drawPeriod
          || sources.tianyan.drawPeriod !== sources.drawPeriod
          || sources.explore.lottery !== lottery
          || sources.tianyan.lottery !== lottery) {
          throw new Error('ANALYSIS_NOT_READY');
        }
        const entitlements = resolveMatrixEntitlements(member, now());
        const artifact = buildMatrixStatusArtifact(
          sources.explore,
          sources.tianyan,
          configs,
          entitlements,
        );
        const detailLocked = !entitlements.canViewFullStatus;
        return {
          status: 200,
          body: {
            kind: 'status',
            lottery,
            drawPeriod: sources.drawPeriod,
            analysisVersion: `${sources.analysisVersion}:status`,
            sourceAnalysisVersion: sources.analysisVersion,
            ...artifact,
            detailLocked,
            cards: artifact.cards,
          },
        };
      } catch (cause) {
        return failure(cause);
      }
    },
  };
}
