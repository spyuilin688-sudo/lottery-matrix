import type { MemberContext } from './matrix-entitlements';
import { MatrixAccessError } from './matrix-member-auth';
import {
  createDefaultMemberNotificationSettings,
  normalizeMemberNotificationSettings,
  type MemberNotificationSettings,
} from './member-notification-settings';

type RouteInput = { authorization?: string; body: unknown };
type RouteResult = { status: number; body: Record<string, unknown> };
type NotificationStore = {
  read(memberId: string): Promise<MemberNotificationSettings | null>;
  save(memberId: string, settings: MemberNotificationSettings): Promise<MemberNotificationSettings>;
};
type Dependencies = {
  requireMember(authorization?: string): Promise<MemberContext>;
  store: NotificationStore;
};

function failure(cause: unknown): RouteResult {
  if (cause instanceof MatrixAccessError) return { status: cause.status, body: { error: { code: cause.code } } };
  const code = cause instanceof Error ? cause.message : 'INVALID_NOTIFICATION_SETTINGS';
  return { status: code.startsWith('SUPABASE_') ? 502 : 400, body: { error: { code } } };
}

export function createMemberNotificationRoutes(dependencies: Dependencies) {
  return {
    async get(input: RouteInput): Promise<RouteResult> {
      try {
        const member = await dependencies.requireMember(input.authorization);
        return {
          status: 200,
          body: await dependencies.store.read(member.memberId) ?? createDefaultMemberNotificationSettings(),
        };
      } catch (cause) {
        return failure(cause);
      }
    },

    async save(input: RouteInput): Promise<RouteResult> {
      try {
        const member = await dependencies.requireMember(input.authorization);
        const settings = normalizeMemberNotificationSettings(input.body);
        return { status: 200, body: await dependencies.store.save(member.memberId, settings) };
      } catch (cause) {
        return failure(cause);
      }
    },
  };
}
