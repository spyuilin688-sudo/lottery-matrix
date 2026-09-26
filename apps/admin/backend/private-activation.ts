const privateOwnerAccount = 'spyuilin688@gmail.com';

type Actor = { account: string; role?: string };
type MemberRow = { id: string; [key: string]: unknown };
type PrivateRedemption = {
  member_id: string;
  current_plan_id: string | null;
  plan_started_at: string | null;
  plan_expires_at: string | null;
  is_lifetime: boolean;
};
type PrivateRequester = { request(path: string): Promise<PrivateRedemption[]> };

export function isPrivateActivationOwner(actor: Actor): boolean {
  return actor.role === '超級管理員' && actor.account.trim().toLowerCase() === privateOwnerAccount;
}

export function privateActivationCodePath(isPrivate: boolean): string {
  return '/rest/v1/activation_codes?select=id,batch_id,code,duration_type,created_at,expires_at,redeemed_at,status,'
    + 'batch:activation_code_batches!inner(is_private),'
    + 'redeemed_member:members!activation_codes_redeemed_by_member_id_fkey(id,auth_user_id,line_user_id,line_display_name)'
    + `&batch.is_private=eq.${isPrivate}&order=created_at.desc,id.asc`;
}

const sameTimestamp = (left: unknown, right: string | null) =>
  left == null && right == null
  || typeof left === 'string' && typeof right === 'string'
    && new Date(left).getTime() === new Date(right).getTime();

async function privateRedemptions(ids: string[], api: PrivateRequester) {
  if (!ids.length) return new Map<string, PrivateRedemption>();
  const snapshots = await api.request(
    '/rest/v1/private_activation_redemptions?select=member_id,current_plan_id,plan_started_at,plan_expires_at,is_lifetime'
    + `&member_id=in.(${[...new Set(ids)].map(encodeURIComponent).join(',')})`,
  );
  return new Map(snapshots.map(snapshot => [snapshot.member_id, snapshot]));
}

export async function maskPrivateMemberEntitlements<T extends MemberRow>(
  items: T[],
  actor: Actor,
  api: PrivateRequester,
): Promise<T[]> {
  if (!items.length || isPrivateActivationOwner(actor)) return items;
  const byMember = await privateRedemptions(items.map(item => item.id), api);
  return items.map(item => {
    const snapshot = byMember.get(item.id);
    if (!snapshot || snapshot.current_plan_id !== (item.currentPlanId ?? null)
        || !sameTimestamp(item.planStartedAt, snapshot.plan_started_at)
        || !sameTimestamp(item.planExpiresAt, snapshot.plan_expires_at)
        || snapshot.is_lifetime !== item.isLifetime) return item;
    return {
      ...item,
      currentPlanId: null,
      planName: null,
      planPrice: null,
      planDurationDays: null,
      planStartedAt: null,
      planExpiresAt: null,
      isLifetime: null,
      autoRenew: null,
      subscriptionRevision: null,
    } as T;
  });
}

type AuditRow = MemberRow & { targetTable?: unknown; targetId?: unknown; beforeData?: unknown; afterData?: unknown };
const privatePlanAuditFields = new Set([
  'current_plan_id', 'plan_started_at', 'plan_expires_at', 'is_lifetime',
  'auto_renew', 'subscription_revision',
]);

function redactPlanAuditFields(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const entries = Object.entries(value).filter(([key]) => !privatePlanAuditFields.has(key));
  return entries.length === Object.keys(value).length ? value : entries.length ? Object.fromEntries(entries) : null;
}

export async function maskPrivateAuditRows<T extends AuditRow>(rows: T[], actor: Actor, api: PrivateRequester): Promise<T[]> {
  if (isPrivateActivationOwner(actor)) return rows;
  const byMember = await privateRedemptions(
    rows.filter(row => row.targetTable === 'members' && typeof row.targetId === 'string')
      .map(row => String(row.targetId)), api,
  );
  if (!byMember.size) return rows;
  return rows.map(row => {
    if (row.targetTable !== 'members' || !byMember.has(String(row.targetId ?? ''))) return row;
    const beforeData = redactPlanAuditFields(row.beforeData);
    const afterData = redactPlanAuditFields(row.afterData);
    const sensitiveContent = typeof row.content === 'string'
      && (/^訂閱操作：/.test(row.content) || /終生|終身|永久|lifetime/i.test(row.content));
    if (beforeData === row.beforeData && afterData === row.afterData && !sensitiveContent) return row;
    return {
      ...row,
      content: sensitiveContent ? '會員資料異動' : row.content,
      beforeData, afterData,
    } as T;
  });
}
