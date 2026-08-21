import type { MatrixLottery } from './matrix-algorithm';
import {
  resolveStatusEvaluationMode,
  validateCustomStatusConfig,
  type CustomStatus,
  type CustomStatusConfig,
} from './matrix-custom-status';
import { resolveMatrixEntitlements, type MemberContext } from './matrix-entitlements';
import { MatrixAccessError } from './matrix-member-auth';

type RouteInput = { authorization?: string; body: unknown };
type RouteResult = { status: number; body: Record<string, unknown> };
type CustomStatusStore = {
  list(memberId: string): Promise<CustomStatusConfig[]>;
  save(memberId: string, config: CustomStatusConfig): Promise<CustomStatusConfig>;
  reset(memberId: string, lottery: MatrixLottery, status: CustomStatus): Promise<void>;
};
type Dependencies = {
  requireMember(authorization?: string): Promise<MemberContext>;
  store: CustomStatusStore;
  now?: () => Date;
};

const lotteries: MatrixLottery[] = ['今彩539', '天天樂', '六合彩', '大樂透'];
const statuses: CustomStatus[] = ['ACTIVE', 'FOCUS', 'RESONANCE', 'CRITICAL'];

function record(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_REQUEST');
  return value as Record<string, unknown>;
}

function failure(cause: unknown): RouteResult {
  if (cause instanceof MatrixAccessError) return { status: cause.status, body: { error: { code: cause.code } } };
  const code = cause instanceof Error ? cause.message : 'INVALID_REQUEST';
  if (code === 'FORBIDDEN') return { status: 403, body: { error: { code } } };
  if (code.startsWith('SUPABASE_')) return { status: 502, body: { error: { code } } };
  return { status: 400, body: { error: { code } } };
}

export function createMatrixCustomStatusRoutes(dependencies: Dependencies) {
  const now = dependencies.now ?? (() => new Date());
  return {
    async list(input: RouteInput): Promise<RouteResult> {
      try {
        const member = await dependencies.requireMember(input.authorization);
        const entitlements = resolveMatrixEntitlements(member, now());
        const configs = await dependencies.store.list(member.memberId);
        return {
          status: 200,
          body: {
            entitlements: {
              canCustomizeStatus: entitlements.canCustomizeStatus,
              canUseCompositeCustomRoad: entitlements.canUseCompositeCustomRoad,
            },
            items: configs.map((config) => ({
              config,
              evaluation: resolveStatusEvaluationMode(config, entitlements),
            })),
          },
        };
      } catch (cause) {
        return failure(cause);
      }
    },

    async save(input: RouteInput): Promise<RouteResult> {
      try {
        const member = await dependencies.requireMember(input.authorization);
        const entitlements = resolveMatrixEntitlements(member, now());
        if (!entitlements.canCustomizeStatus) throw new Error('FORBIDDEN');
        const config = record(input.body) as CustomStatusConfig;
        const validation = validateCustomStatusConfig(config, entitlements);
        if (validation.ok === false) throw new Error(validation.code);
        return { status: 200, body: { item: await dependencies.store.save(member.memberId, config) } };
      } catch (cause) {
        return failure(cause);
      }
    },

    async reset(input: RouteInput): Promise<RouteResult> {
      try {
        const member = await dependencies.requireMember(input.authorization);
        if (!resolveMatrixEntitlements(member, now()).canCustomizeStatus) throw new Error('FORBIDDEN');
        const body = record(input.body);
        const lottery = String(body.lottery ?? '') as MatrixLottery;
        const status = String(body.status ?? '') as CustomStatus;
        if (!lotteries.includes(lottery) || !statuses.includes(status)) throw new Error('INVALID_REQUEST');
        await dependencies.store.reset(member.memberId, lottery, status);
        return { status: 200, body: { reset: true } };
      } catch (cause) {
        return failure(cause);
      }
    },
  };
}
