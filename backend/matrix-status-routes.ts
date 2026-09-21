import { anonymousMatrixMember, type MatrixEntitlements, type MemberContext } from './matrix-entitlements.ts';
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
type CompactStatus = {
  analysisVersion: string;
  drawPeriod: string;
  payload: Record<string, unknown>;
};
type StatusValidationSource = {
  itemId: string;
  validation: unknown;
};
type RouteInput = { authorization?: string; body: unknown };
type RouteResult = { status: number; body: Record<string, unknown> };
type Dependencies = {
  requireMember(authorization?: string): Promise<MemberContext>;
  readStatusIdentity?(lottery: LotteryId, drawPeriod?: string): Promise<{ analysisVersion: string; drawPeriod: string } | null>;
  readStatusSources(lottery: LotteryId, drawPeriod?: string): Promise<StatusSources | null>;
  readCompactStatus?(lottery: LotteryId, drawPeriod?: string, summaryOnly?: boolean): Promise<CompactStatus | null>;
  resolveEntitlements?(authorization?: string): Promise<MatrixEntitlements>;
  readStatusValidation?(
    lottery: LotteryId,
    drawPeriod: string,
    analysisVersion: string,
    itemId: string,
  ): Promise<StatusValidationSource | null>;
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
  if (code === 'ANALYSIS_VERSION_MISMATCH') {
    return { status: 409, body: { error: { code } } };
  }
  if (code.startsWith('SUPABASE_')) return { status: 502, body: { error: { code } } };
  return { status: 400, body: { error: { code: 'INVALID_REQUEST' } } };
}

function compactRoads(value: unknown, entitlements: MatrixEntitlements) {
  if (!Array.isArray(value)) throw new Error('INVALID_REQUEST');
  let locked = false;
  const rawById = new Map<string, Record<string, unknown>>();
  const roads = value.map((raw) => {
    const road = record(raw);
    const roadId = String(road.id ?? '');
    if (!rawById.has(roadId)) rawById.set(roadId, road);
    const explorePeriods = Number(road.explorePeriods);
    if (![2, 7, 13].includes(explorePeriods) || !Array.isArray(road.result)) {
      throw new Error('INVALID_REQUEST');
    }
    const entitled = explorePeriods === 2
      || (explorePeriods === 7 && entitlements.canUseSeven)
      || (explorePeriods === 13 && entitlements.canUseThirteen);
    if (entitled) return { ...road, locked: false };
    locked = true;
    return {
      id: roadId,
      result: [...road.result],
      explorePeriods,
      locked: true,
    };
  });
  roads.sort((left, right) => {
    if (left.locked || right.locked) {
      const leftRaw = rawById.get(String(left.id));
      const rightRaw = rawById.get(String(right.id));
      if (!leftRaw || !rightRaw) throw new Error('INVALID_REQUEST');
      return Number(rightRaw.streak ?? 0) - Number(leftRaw.streak ?? 0)
        || Number(leftRaw.predictionDistance ?? 0) - Number(rightRaw.predictionDistance ?? 0)
        || Number(leftRaw.position ?? 0) - Number(rightRaw.position ?? 0)
        || String(left.id).localeCompare(String(right.id));
    }
    return Number(right.streak ?? 0) - Number(left.streak ?? 0)
      || Number(left.predictionDistance ?? 0) - Number(right.predictionDistance ?? 0)
      || Number(left.position ?? 0) - Number(right.position ?? 0)
      || String(left.id).localeCompare(String(right.id));
  });
  return { roads, locked };
}

function projectCompactStatus(
  payloadValue: Record<string, unknown>,
  lottery: LotteryId,
  drawPeriod: string,
  entitlements: MatrixEntitlements,
) {
  if (payloadValue.lottery !== lottery || payloadValue.drawPeriod !== drawPeriod) {
    throw new Error('ANALYSIS_NOT_READY');
  }
  if (!Array.isArray(payloadValue.cards)) throw new Error('ANALYSIS_NOT_READY');
  const cards = payloadValue.cards.map((rawCard) => {
    const card = record(rawCard);
    const projected = compactRoads(card.roads, entitlements);
    return {
      ...card,
      sameCodeRoadCount: projected.locked ? null : Number(card.sameCodeRoadCount ?? 0),
      sameCodeRoadCountLocked: projected.locked,
      roads: projected.roads,
    };
  });
  const { customTriggers: _retiredTriggers, customSettings: _retiredSettings, ...payload } = payloadValue;
  return {
    ...payload,
    lottery,
    drawPeriod,
    cards,
  };
}

function projectStatusSummary(
  payloadValue: Record<string, unknown>,
  lottery: LotteryId,
  drawPeriod: string,
) {
  if (payloadValue.lottery !== lottery || payloadValue.drawPeriod !== drawPeriod) {
    throw new Error('ANALYSIS_NOT_READY');
  }
  const summary = payloadValue.summary;
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) {
    throw new Error('ANALYSIS_NOT_READY');
  }
  return summary as Record<string, unknown>;
}

export function createMatrixStatusRoutes(dependencies: Dependencies) {
  const memberFor = (authorization?: string) => authorization
    ? dependencies.requireMember(authorization)
    : Promise.resolve(anonymousMatrixMember);
  const entitlementsFor = (authorization: string | undefined) => {
    if (!dependencies.resolveEntitlements) throw new Error('ENTITLEMENTS_RESOLVER_REQUIRED');
    return dependencies.resolveEntitlements(authorization);
  };
  return {
    async identity(input: RouteInput): Promise<RouteResult> {
      try {
        const member = await memberFor(input.authorization);
        const body = record(input.body);
        const lottery = String(body.lottery ?? '') as LotteryId;
        if (!lotteries.includes(lottery)) throw new Error('INVALID_REQUEST');
        const period = body.drawPeriod ? String(body.drawPeriod) : undefined;
        const identity = await dependencies.readStatusIdentity?.(lottery, period);
        if (!identity?.analysisVersion || !identity.drawPeriod) throw new Error('ANALYSIS_NOT_READY');
        return { status: 200, body: {
          kind: 'status-identity', lottery, ...identity,
          entitlements: await entitlementsFor(input.authorization),
        } };
      } catch (cause) { return failure(cause); }
    },
    async summary(input: RouteInput): Promise<RouteResult> {
      try {
        const member = await memberFor(input.authorization);
        const body = record(input.body);
        const lottery = String(body.lottery ?? '') as LotteryId;
        if (!lotteries.includes(lottery)) throw new Error('INVALID_REQUEST');
        const requestedPeriod = body.drawPeriod ? String(body.drawPeriod) : undefined;
        const entitlements = await entitlementsFor(input.authorization);

        if (dependencies.readCompactStatus) {
          const compact = await dependencies.readCompactStatus(lottery, requestedPeriod, true);
          if (!compact?.analysisVersion || !compact.drawPeriod || !compact.payload) {
            throw new Error('ANALYSIS_NOT_READY');
          }
          return {
            status: 200,
            body: {
              kind: 'status-summary',
              lottery,
              drawPeriod: compact.drawPeriod,
              analysisVersion: `${compact.analysisVersion}:status`,
              sourceAnalysisVersion: compact.analysisVersion,
              summary: projectStatusSummary(
                compact.payload,
                lottery,
                compact.drawPeriod,
              ),
            },
          };
        }

        const sources = await dependencies.readStatusSources(lottery, requestedPeriod);
        if (!sources?.explore || !sources.tianyan
          || sources.explore.drawPeriod !== sources.drawPeriod
          || sources.tianyan.drawPeriod !== sources.drawPeriod
          || sources.explore.lottery !== lottery
          || sources.tianyan.lottery !== lottery) {
          throw new Error('ANALYSIS_NOT_READY');
        }
        const artifact = buildMatrixStatusArtifact(
          sources.explore,
          entitlements,
        );
        return {
          status: 200,
          body: {
            kind: 'status-summary',
            lottery,
            drawPeriod: sources.drawPeriod,
            analysisVersion: `${sources.analysisVersion}:status`,
            sourceAnalysisVersion: sources.analysisVersion,
            summary: artifact.summary,
          },
        };
      } catch (cause) {
        return failure(cause);
      }
    },

    async get(input: RouteInput): Promise<RouteResult> {
      try {
        const member = await memberFor(input.authorization);
        const body = record(input.body);
        const lottery = String(body.lottery ?? '') as LotteryId;
        if (!lotteries.includes(lottery)) throw new Error('INVALID_REQUEST');
        const requestedPeriod = body.drawPeriod ? String(body.drawPeriod) : undefined;
        const entitlements = await entitlementsFor(input.authorization);

        if (dependencies.readCompactStatus) {
          const compact = await dependencies.readCompactStatus(lottery, requestedPeriod);
          if (!compact?.analysisVersion || !compact.drawPeriod || !compact.payload) {
            throw new Error('ANALYSIS_NOT_READY');
          }
          const artifact = projectCompactStatus(
            compact.payload,
            lottery,
            compact.drawPeriod,
            entitlements,
          );
          return {
            status: 200,
            body: {
              kind: 'status',
              lottery,
              drawPeriod: compact.drawPeriod,
              analysisVersion: `${compact.analysisVersion}:status`,
              sourceAnalysisVersion: compact.analysisVersion,
              ...artifact,
              detailLocked: !entitlements.canViewFullStatus,
              cards: artifact.cards,
              cacheIdentity: { drawPeriod: compact.drawPeriod, analysisVersion: compact.analysisVersion, entitlements },
            },
          };
        }

        // Compatibility path for non-production callers that have not supplied
        // the precomputed readers yet. The formal Edge Function supplies them.
        const sources = await dependencies.readStatusSources(lottery, requestedPeriod);
        if (!sources?.explore || !sources.tianyan
          || sources.explore.drawPeriod !== sources.drawPeriod
          || sources.tianyan.drawPeriod !== sources.drawPeriod
          || sources.explore.lottery !== lottery
          || sources.tianyan.lottery !== lottery) {
          throw new Error('ANALYSIS_NOT_READY');
        }
        const artifact = buildMatrixStatusArtifact(
          sources.explore,
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
            cacheIdentity: { drawPeriod: sources.drawPeriod, analysisVersion: sources.analysisVersion, entitlements },
          },
        };
      } catch (cause) {
        return failure(cause);
      }
    },
    async validation(input: RouteInput): Promise<RouteResult> {
      try {
        const member = await memberFor(input.authorization);
        const body = record(input.body);
        const lottery = String(body.lottery ?? '') as LotteryId;
        const drawPeriod = String(body.drawPeriod ?? '').trim();
        const analysisVersion = String(body.analysisVersion ?? '').trim();
        const itemId = String(body.itemId ?? '').trim();
        if (!lotteries.includes(lottery) || !drawPeriod || !analysisVersion || !itemId) {
          throw new Error('INVALID_REQUEST');
        }
        const entitlements = await entitlementsFor(input.authorization);
        let visible = false;

        if (dependencies.readCompactStatus) {
          const compact = await dependencies.readCompactStatus(lottery, drawPeriod);
          if (!compact?.analysisVersion || !compact.drawPeriod || !compact.payload
            || compact.drawPeriod !== drawPeriod) {
            throw new Error('ANALYSIS_NOT_READY');
          }
          if (compact.analysisVersion !== analysisVersion) {
            throw new Error('ANALYSIS_VERSION_MISMATCH');
          }
          const artifact = projectCompactStatus(
            compact.payload,
            lottery,
            compact.drawPeriod,
            entitlements,
          );
          visible = artifact.cards.some((card) => card.roads.some((road) => (
            road.locked === false && road.validationItemId === itemId
          )));
        } else {
          const sources = await dependencies.readStatusSources(lottery, drawPeriod);
          if (!sources?.explore || !sources.tianyan
            || sources.drawPeriod !== drawPeriod
            || sources.explore.drawPeriod !== drawPeriod
            || sources.tianyan.drawPeriod !== drawPeriod
            || sources.explore.lottery !== lottery
            || sources.tianyan.lottery !== lottery) {
            throw new Error('ANALYSIS_NOT_READY');
          }
          if (sources.analysisVersion !== analysisVersion) {
            throw new Error('ANALYSIS_VERSION_MISMATCH');
          }
          const artifact = buildMatrixStatusArtifact(
            sources.explore,
            entitlements,
          );
          visible = artifact.cards.some((card) => card.roads.some((road) => (
            road.locked === false && road.validationItemId === itemId
          )));
        }

        if (!visible) throw new MatrixAccessError('FORBIDDEN', 403);
        if (!dependencies.readStatusValidation) throw new Error('SUPABASE_VALIDATION_READ_FAILED');
        const source = await dependencies.readStatusValidation(
          lottery,
          drawPeriod,
          analysisVersion,
          itemId,
        );
        if (!source || source.itemId !== itemId || source.validation == null) {
          throw new Error('SUPABASE_VALIDATION_READ_FAILED');
        }
        return {
          status: 200,
          body: {
            kind: 'status-validation',
            lottery,
            drawPeriod,
            analysisVersion,
            itemId,
            validation: source.validation,
            cacheIdentity: { drawPeriod, analysisVersion, entitlements },
          },
        };
      } catch (cause) {
        return failure(cause);
      }
    },
  };
}
