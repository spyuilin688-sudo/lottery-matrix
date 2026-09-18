import type { MemberContext } from './matrix-entitlements';
import { MatrixAccessError } from './matrix-member-auth';
import type { MemberProfile } from './member-profile-store';

type RouteResult = { status: number; body: Record<string, unknown> };
type Dependencies = {
  requireMember(authorization?: string): Promise<MemberContext>;
  readProfile(memberId: string): Promise<MemberProfile>;
};

function failure(cause: unknown): RouteResult {
  if (cause instanceof MatrixAccessError) return { status: cause.status, body: { error: { code: cause.code } } };
  const upstreamFailure = cause instanceof Error && cause.message.startsWith('SUPABASE_');
  return {
    status: upstreamFailure ? 502 : 500,
    body: { error: { code: 'MEMBER_PROFILE_READ_FAILED' } },
  };
}

export function createMemberProfileRoutes(dependencies: Dependencies) {
  return {
    async get(input: { authorization?: string }): Promise<RouteResult> {
      try {
        const member = await dependencies.requireMember(input.authorization);
        return { status: 200, body: await dependencies.readProfile(member.memberId) };
      } catch (cause) {
        return failure(cause);
      }
    },
  };
}
