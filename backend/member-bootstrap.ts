type SupabaseConfig = {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
};

type SupabaseIdentity = {
  provider?: unknown;
  provider_id?: unknown;
};

type SupabaseUser = {
  id?: unknown;
  identities?: unknown;
};

type MemberRow = {
  id?: unknown;
  auth_user_id?: unknown;
  line_user_id?: unknown;
};

export type MemberBootstrapCode =
  | 'AUTH_REQUIRED'
  | 'LINE_IDENTITY_REQUIRED'
  | 'LINE_IDENTITY_CONFLICT'
  | 'MEMBER_BOOTSTRAP_FAILED';

export class MemberBootstrapError extends Error {
  code: MemberBootstrapCode;
  status: number;

  constructor(code: MemberBootstrapCode, status: number) {
    super(code);
    this.name = 'MemberBootstrapError';
    this.code = code;
    this.status = status;
  }
}

function bearerToken(authorization: string | undefined) {
  const match = /^Bearer\s+(.+)$/i.exec(String(authorization ?? '').trim());
  if (!match?.[1]) throw new MemberBootstrapError('AUTH_REQUIRED', 401);
  return match[1];
}

async function responseJson(response: Response) {
  try {
    return await response.json() as unknown;
  } catch {
    return null;
  }
}

function rowMemberId(row: MemberRow | undefined) {
  return String(row?.id ?? '').trim();
}

function rowLineUserId(row: MemberRow | undefined) {
  return String(row?.line_user_id ?? '').trim();
}

function lineProviderId(user: SupabaseUser) {
  const identities = Array.isArray(user.identities)
    ? user.identities as SupabaseIdentity[]
    : [];
  const identity = identities.find((item) => String(item.provider ?? '') === 'custom:line');
  return String(identity?.provider_id ?? '').trim();
}

export function createMemberBootstrap(
  loadConfig: () => Promise<SupabaseConfig> | SupabaseConfig,
  fetcher: typeof fetch = fetch,
) {
  return {
    async bootstrap(authorization: string | undefined) {
      const token = bearerToken(authorization);
      const config = await loadConfig();

      const authResponse = await fetcher(`${config.url}/auth/v1/user`, {
        headers: {
          apikey: config.anonKey,
          Authorization: `Bearer ${token}`,
        },
      });
      if (!authResponse.ok) throw new MemberBootstrapError('AUTH_REQUIRED', 401);

      const authUser = await responseJson(authResponse) as SupabaseUser | null;
      const authUserId = String(authUser?.id ?? '').trim();
      if (!authUserId) throw new MemberBootstrapError('AUTH_REQUIRED', 401);

      const lineUserId = authUser ? lineProviderId(authUser) : '';
      if (!lineUserId) throw new MemberBootstrapError('LINE_IDENTITY_REQUIRED', 403);

      const serviceHeaders = {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
      };

      const authMemberUrl = new URL('/rest/v1/members', config.url);
      authMemberUrl.searchParams.set('select', 'id,auth_user_id,line_user_id');
      authMemberUrl.searchParams.set('auth_user_id', `eq.${authUserId}`);
      authMemberUrl.searchParams.set('limit', '1');
      const authMemberResponse = await fetcher(authMemberUrl.toString(), {
        headers: serviceHeaders,
      });
      if (!authMemberResponse.ok) {
        throw new MemberBootstrapError('MEMBER_BOOTSTRAP_FAILED', 502);
      }
      const authMembers = await responseJson(authMemberResponse) as MemberRow[] | null;
      const authMember = Array.isArray(authMembers) ? authMembers[0] : undefined;
      const existingMemberId = rowMemberId(authMember);
      const existingLineUserId = rowLineUserId(authMember);

      if (existingMemberId && existingLineUserId === lineUserId) {
        return { memberId: existingMemberId, lineUserId };
      }
      if (existingMemberId && existingLineUserId && existingLineUserId !== lineUserId) {
        throw new MemberBootstrapError('LINE_IDENTITY_CONFLICT', 409);
      }

      const lineMemberUrl = new URL('/rest/v1/members', config.url);
      lineMemberUrl.searchParams.set('select', 'id,auth_user_id,line_user_id');
      lineMemberUrl.searchParams.set('line_user_id', `eq.${lineUserId}`);
      lineMemberUrl.searchParams.set('limit', '1');
      const lineMemberResponse = await fetcher(lineMemberUrl.toString(), {
        headers: serviceHeaders,
      });
      if (!lineMemberResponse.ok) {
        throw new MemberBootstrapError('MEMBER_BOOTSTRAP_FAILED', 502);
      }
      const lineMembers = await responseJson(lineMemberResponse) as MemberRow[] | null;
      const lineMember = Array.isArray(lineMembers) ? lineMembers[0] : undefined;
      const lineMemberId = rowMemberId(lineMember);
      if (lineMemberId && String(lineMember?.auth_user_id ?? '').trim() !== authUserId) {
        throw new MemberBootstrapError('LINE_IDENTITY_CONFLICT', 409);
      }

      if (existingMemberId) {
        const patchUrl = new URL('/rest/v1/members', config.url);
        patchUrl.searchParams.set('id', `eq.${existingMemberId}`);
        patchUrl.searchParams.set('select', 'id,line_user_id');
        const patchResponse = await fetcher(patchUrl.toString(), {
          method: 'PATCH',
          headers: {
            ...serviceHeaders,
            'Content-Type': 'application/json',
            Prefer: 'return=representation',
          },
          body: JSON.stringify({ line_user_id: lineUserId }),
        });
        if (patchResponse.status === 409) {
          throw new MemberBootstrapError('LINE_IDENTITY_CONFLICT', 409);
        }
        if (!patchResponse.ok) {
          throw new MemberBootstrapError('MEMBER_BOOTSTRAP_FAILED', 502);
        }
        return { memberId: existingMemberId, lineUserId };
      }

      const createUrl = new URL('/rest/v1/members', config.url);
      createUrl.searchParams.set('select', 'id,line_user_id');
      const createResponse = await fetcher(createUrl.toString(), {
        method: 'POST',
        headers: {
          ...serviceHeaders,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({
          auth_user_id: authUserId,
          line_user_id: lineUserId,
        }),
      });
      if (createResponse.status === 409) {
        throw new MemberBootstrapError('LINE_IDENTITY_CONFLICT', 409);
      }
      if (!createResponse.ok) {
        throw new MemberBootstrapError('MEMBER_BOOTSTRAP_FAILED', 502);
      }
      const createdRows = await responseJson(createResponse) as MemberRow[] | null;
      const createdMemberId = rowMemberId(Array.isArray(createdRows) ? createdRows[0] : undefined);
      if (!createdMemberId) {
        throw new MemberBootstrapError('MEMBER_BOOTSTRAP_FAILED', 502);
      }

      return { memberId: createdMemberId, lineUserId };
    },
  };
}
