import type { LotteryId, MatrixAnalysisKind } from '../shared/matrix-contracts';
import type { CustomStatusConfig } from './matrix-custom-status';
import { anonymousMatrixMember, resolveMatrixEntitlements, type MemberContext } from './matrix-entitlements';
import type { ExploreArtifact } from './matrix-explore-service';
import { MatrixAccessError } from './matrix-member-auth';
import { buildMatrixStatusArtifact } from './matrix-status-service';
import type { TianyanArtifact } from './matrix-tianyan-service';

type CompletedArtifact = { analysisVersion: string; drawPeriod: string; data: unknown };
type RouteInput = { authorization?: string; body: unknown };
type RouteResult = { status: number; body: Record<string, unknown> };
type Dependencies = {
  requireMember(authorization?: string): Promise<MemberContext>;
  readAnalysis(kind: MatrixAnalysisKind, lottery: LotteryId, drawPeriod?: string): Promise<CompletedArtifact | null>;
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
        const explore = await dependencies.readAnalysis('explore', lottery, requestedPeriod);
        if (!explore) throw new Error('ANALYSIS_NOT_READY');
        const [tianyan, configs] = await Promise.all([
          dependencies.readAnalysis('tianyan', lottery, explore.drawPeriod),
          member.memberId ? dependencies.listConfigs(member.memberId) : Promise.resolve([]),
        ]);
        if (!tianyan || tianyan.analysisVersion !== explore.analysisVersion || tianyan.drawPeriod !== explore.drawPeriod) {
          throw new Error('ANALYSIS_NOT_READY');
        }
        const entitlements = resolveMatrixEntitlements(member, now());
        const artifact = buildMatrixStatusArtifact(
          explore.data as ExploreArtifact,
          tianyan.data as TianyanArtifact,
          configs,
          entitlements,
        );
        const detailLocked = !entitlements.canViewFullStatus;
        return {
          status: 200,
          body: {
            kind: 'status',
            lottery,
            drawPeriod: explore.drawPeriod,
            analysisVersion: `${explore.analysisVersion}:status`,
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
