import type { MatrixPlan, MemberContext } from './matrix-entitlements';

type SupabaseConfig = {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
};

type MemberRow = {
  id?: unknown;
  auth_user_id?: unknown;
  is_lifetime?: unknown;
  plan_expires_at?: unknown;
  referral_code?: unknown;
  current_plan?: { name?: unknown } | null;
};

export class MatrixAccessError extends Error {
  code: 'AUTH_REQUIRED' | 'FORBIDDEN';
  status: number;

  constructor(code: 'AUTH_REQUIRED' | 'FORBIDDEN', status: number) {
    super(code);
    this.name = 'MatrixAccessError';
    this.code = code;
    this.status = status;
  }
}

function bearerToken(authorization: string | undefined) {
  const match = /^Bearer\s+(.+)$/i.exec(String(authorization ?? '').trim());
  if (!match?.[1]) throw new MatrixAccessError('AUTH_REQUIRED', 401);
  return match[1];
}

async function readJson(response: Response, fallback: MatrixAccessError | Error) {
  if (!response.ok) throw fallback;
  return response.json() as Promise<unknown>;
}

function planOf(row: MemberRow): MatrixPlan {
  if (row.is_lifetime === true) return 'lifetime';
  const name = String(row.current_plan?.name ?? '');
  if (name === '試用方案') return 'trial';
  if (name === '月費方案') return 'monthly';
  if (name === '季費方案') return 'quarterly';
  if (name === '年費方案') return 'yearly';
  return 'free';
}

function isActive(row: MemberRow, plan: MatrixPlan, now: Date) {
  if (plan === 'lifetime') return true;
  if (plan === 'free') return false;
  const expiry = Date.parse(String(row.plan_expires_at ?? ''));
  return Number.isFinite(expiry) && expiry > now.getTime();
}

export function createMemberAuth(
  loadConfig: () => Promise<SupabaseConfig> | SupabaseConfig,
  fetcher: typeof fetch = fetch,
  now: () => Date = () => new Date(),
) {
  return {
    async requireMember(authorization: string | undefined): Promise<MemberContext> {
      const token = bearerToken(authorization);
      const config = await loadConfig();
      const authUser = await readJson(
        await fetcher(`${config.url}/auth/v1/user`, {
          headers: { apikey: config.anonKey, Authorization: `Bearer ${token}` },
        }),
        new MatrixAccessError('AUTH_REQUIRED', 401),
      ) as { id?: unknown };
      const authUserId = String(authUser.id ?? '').trim();
      if (!authUserId) throw new MatrixAccessError('AUTH_REQUIRED', 401);

      const serviceHeaders = {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
      };
      const memberPath = new URL('/rest/v1/members', config.url);
      memberPath.searchParams.set(
        'select',
        'id,auth_user_id,is_lifetime,plan_expires_at,referral_code,current_plan:plans!members_current_plan_id_fkey(name)',
      );
      memberPath.searchParams.set('auth_user_id', `eq.${authUserId}`);
      memberPath.searchParams.set('limit', '1');
      const members = await readJson(
        await fetcher(memberPath.toString(), { headers: serviceHeaders }),
        new Error('SUPABASE_MEMBER_READ_FAILED'),
      ) as MemberRow[];
      const member = members[0];
      const memberId = String(member?.id ?? '').trim();
      if (!member || !memberId) throw new MatrixAccessError('FORBIDDEN', 403);

      const referralCode = String(member.referral_code ?? '').trim();
      let referralSuccessCount = 0;
      if (referralCode) {
        const referralPath = new URL('/rest/v1/members', config.url);
        referralPath.searchParams.set('select', 'id,payments!inner(id)');
        referralPath.searchParams.set('invitation_code', `eq.${referralCode}`);
        referralPath.searchParams.set('payments.status', 'eq.confirmed');
        const referred = await readJson(
          await fetcher(referralPath.toString(), { headers: serviceHeaders }),
          new Error('SUPABASE_REFERRAL_READ_FAILED'),
        ) as Array<{ id?: unknown }>;
        referralSuccessCount = new Set(
          referred.map((item) => String(item.id ?? '')).filter(Boolean),
        ).size;
      }

      const plan = planOf(member);
      return {
        authUserId,
        memberId,
        plan,
        active: isActive(member, plan, now()),
        referralSuccessCount,
      };
    },
  };
}
